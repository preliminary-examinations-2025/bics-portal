/**
 * Autonomous Sequential EIRF Pipeline Worker Daemon (Phase 1)
 * 
 * Implements the Saga state machine for post-exam incident processing:
 * 
 * 1. Clean Path:
 *    - Status 'CLEARED' -> Dispatches clean exam confirmation -> Pipeline complete
 * 
 * 2. Flagged Path (Sequential Step-Level Idempotency):
 *    - Step 1 ('FLAGGED'): Generates tailored inquiry questions targeting the specific
 *      incident telemetry -> advances to 'QUESTIONS_GENERATED'.
 *    - Step 2 ('QUESTIONS_GENERATED'): Issues secure 45m magic link & token, dispatches
 *      EIRF notice email -> advances to 'AWAITING_EIRF'.
 *    - Step 3 ('AWAITING_EIRF'): Monitors 45-minute countdown timer -> marks 'EXPIRED' if deadline passed.
 *    - Step 4 ('EIRF_SUBMITTED'): Candidate filed explanation -> dispatches deferred
 *      test submission confirmation email -> advances to 'UNDER_REVIEW' for administrator
 *      malpractice evaluation.
 * 
 * Features:
 * - Atomic MongoDB Locking with 60s Dead-Man Lock Break (recovers crashed workers).
 * - Step-Level Fault Isolation: Failures in email dispatch NEVER re-trigger question generation.
 * - Dual-Persistence: Fully functional on MongoDB Atlas and local JSON fallback DB.
 */

const crypto = require('crypto');
const mongoose = require('mongoose');
const { TestSubmissionModel, EIRFReportModel, CandidateModel, TestConfigModel } = require('../models');
const { dbState, getJSONData, saveJSONData } = require('../config/db');
const {
    sendTestSubmittedEmail,
    sendEirfFilingNoticeEmail,
    resolvePortalBaseUrl,
    extractValidCandidateEmail
} = require('../services/gmailEmailService');
const { toBicsId } = require('../utils/bicsId');
const eirfLlmService = require('../services/eirfLlmService');

let workerIntervalId = null;
let isProcessingTick = false;

const DEAD_MAN_LOCK_MS = 60000; // 60 seconds lock timeout
const EIRF_EXPIRY_MS = 45 * 60 * 1000; // 45 minutes candidate filing window
const MAX_STEP_RETRIES = 3;

/**
 * Generates structured inquiry questions tailored to the recorded proctoring incidents.
 * In Phase 1, uses high-fidelity deterministic templates derived from the incident telemetry.
 * In Phase 2, connects directly to Gemini LLM with this function as the resilient fallback.
 */
function generateTailoredQuestions(submission) {
    const questions = [];
    const proctoringLog = submission?.proctoringLog || {};
    const events = Array.isArray(proctoringLog.events) ? proctoringLog.events : [];
    const flaggedReasons = Array.isArray(submission?.flaggedReasons) ? submission.flaggedReasons : [];

    const fsExits = Number(proctoringLog.fullscreenExits || 0);
    const tabSwitches = Number(proctoringLog.tabSwitches || 0);

    let maxFsSec = 0;
    let maxTabSec = 0;
    let maxOfflineSec = 0;

    events.forEach(ev => {
        if (!ev) return;
        const dur = Number(ev.durationSeconds || 0);
        const type = String(ev.type || '');
        if ((type.includes('FULLSCREEN')) && dur > maxFsSec) maxFsSec = dur;
        if ((type.includes('TAB')) && dur > maxTabSec) maxTabSec = dur;
        if ((type === 'NETWORK_OFFLINE' || type === 'DISCONNECT_REAPED') && dur > maxOfflineSec) maxOfflineSec = dur;
    });

    const serverOfflineGaps = Array.isArray(proctoringLog.serverOfflineGaps) ? proctoringLog.serverOfflineGaps : [];
    serverOfflineGaps.forEach(gap => {
        const dSec = Number(gap.downtimeSeconds || 0);
        if (dSec > maxOfflineSec) maxOfflineSec = dSec;
    });

    // 1. Fullscreen exits inquiry
    if (fsExits > 0 || maxFsSec > 5) {
        questions.push({
            questionId: 'Q_FULLSCREEN_' + crypto.randomBytes(4).toString('hex'),
            category: 'FULLSCREEN',
            questionType: 'TEXT',
            questionText: `Our security monitor recorded ${fsExits} fullscreen exit(s)${maxFsSec > 0 ? ` with a maximum duration of ${maxFsSec} seconds` : ''}. What specific application or system event caused the browser to exit fullscreen?`,
            context: `Fullscreen exit count: ${fsExits}, max duration: ${maxFsSec}s`,
            placeholder: 'Provide a clear explanation of what occurred when fullscreen was exited...',
            options: [],
            isRequired: true,
            required: true
        });
    }

    // 2. Tab switch or window blur inquiry
    if (tabSwitches > 0 || maxTabSec > 5) {
        questions.push({
            questionId: 'Q_TAB_SWITCH_' + crypto.randomBytes(4).toString('hex'),
            category: 'TAB_SWITCH',
            questionType: 'TEXT',
            questionText: `The system detected ${tabSwitches} window blur or tab switch event(s)${maxTabSec > 0 ? ` lasting up to ${maxTabSec} seconds` : ''}. Please specify what application, shortcut, or notification caused the window focus loss.`,
            context: `Tab switch count: ${tabSwitches}, max duration: ${maxTabSec}s`,
            placeholder: 'Describe the browser tab switch or external app interaction...',
            options: [],
            isRequired: true,
            required: true
        });
    }

    // 3. Network disconnection inquiry
    if (maxOfflineSec > 5) {
        questions.push({
            questionId: 'Q_NETWORK_' + crypto.randomBytes(4).toString('hex'),
            category: 'NETWORK',
            questionType: 'TEXT',
            questionText: `A network disconnection of approximately ${maxOfflineSec} seconds was logged during your active session. What internet source were you using (e.g. Wi-Fi, mobile hotspot, ethernet), and how was connectivity restored?`,
            context: `Detected offline duration: ${maxOfflineSec}s`,
            placeholder: 'Detail your network setup and how reconnection occurred...',
            options: [],
            isRequired: true,
            required: true
        });
    }

    // 4. Minor proctoring or auto-submit inquiry
    if (submission?.status === 'auto-submitted') {
        questions.push({
            questionId: 'Q_AUTOSUBMIT_' + crypto.randomBytes(4).toString('hex'),
            category: 'GENERAL',
            questionType: 'TEXT',
            questionText: `Your exam attempt was automatically finalized by the system (${submission.submissionReason || 'system_auto'}). Please explain your current surroundings and status at the time this occurred.`,
            context: `Submission reason: ${submission.submissionReason || 'system_auto'}`,
            placeholder: 'Explain the circumstances surrounding the session finalization...',
            options: [],
            isRequired: true,
            required: true
        });
    }

    // Fallback general question if specific categories didn't trigger
    if (questions.length === 0) {
        questions.push({
            questionId: 'Q_INCIDENT_GENERAL_' + crypto.randomBytes(4).toString('hex'),
            category: 'GENERAL',
            questionType: 'TEXT',
            questionText: `Your session was flagged for post-exam review based on the following reasons: ${flaggedReasons.join('; ') || 'Automated proctoring anomaly'}. Please provide a comprehensive account of your examination environment.`,
            context: `Flagged reasons: ${flaggedReasons.join('; ')}`,
            placeholder: 'Provide complete details regarding the flagged events...',
            options: [],
            isRequired: true,
            required: true
        });
    }

    return questions;
}

/**
 * Executes a single atomic step and updates the submission document
 */
async function recordPipelineStep(sub, stepName, status, durationMs = 0, details = null, error = null) {
    if (!sub.pipelineHistory) sub.pipelineHistory = [];
    sub.pipelineHistory.push({
        step: stepName,
        status,
        timestamp: new Date(),
        durationMs,
        details,
        error: error ? String(error) : undefined
    });
}

/**
 * Main worker execution tick
 */
async function runPipelineTick() {
    if (isProcessingTick) return;
    isProcessingTick = true;

    try {
        const now = new Date();
        const lockCutoff = new Date(now.getTime() - DEAD_MAN_LOCK_MS);

        if (dbState.useMongo) {
            // A. Clean up stale/dead-man locks (crashed worker recovery)
            await TestSubmissionModel.updateMany(
                {
                    'pipelineLock.isLocked': true,
                    'pipelineLock.lockedAt': { $lt: lockCutoff }
                },
                {
                    $set: {
                        'pipelineLock.isLocked': false,
                        'pipelineLock.workerId': null
                    }
                }
            );

            // B. Check for expired EIRF submissions (45-minute deadline passed)
            const expiredSubs = await TestSubmissionModel.find({
                pipelineStatus: 'AWAITING_EIRF',
                eirfExpiresAt: { $lt: now },
                isDeleted: { $ne: true }
            });

            for (const sub of expiredSubs) {
                sub.pipelineStatus = 'EXPIRED';
                sub.eirfStatus = 'expired';
                await recordPipelineStep(sub, 'EXPIRE_SUBMISSION', 'COMPLETED', 0, { expiredAt: now });
                await sub.save();
                console.log(`[EIRF_PIPELINE] Submission ${sub._id} EIRF window expired. Status -> 'EXPIRED'.`);

                // Deferred test submission confirmation email dispatch on expiry (if not yet sent)
                if (!sub.emailsSent?.testSubmitted) {
                    try {
                        await sendTestSubmittedEmail(sub._id, { triggerSource: 'eirf_pipeline_expired' });
                    } catch (err) {
                        console.error(`[EIRF_PIPELINE] Error sending deferred submission email on expiry for ${sub._id}:`, err.message);
                    }
                }
            }

            // B.2 Orphan Recovery: Scan for finalized submissions trapped in 'QUEUED'
            const orphanedSubs = await TestSubmissionModel.find({
                status: { $in: ['submitted', 'auto-submitted', 'evaluated'] },
                pipelineStatus: 'QUEUED',
                'pipelineLock.isLocked': false,
                isDeleted: { $ne: true }
            }).limit(5);

            for (const orphan of orphanedSubs) {
                try {
                    let testDoc = null;
                    if (orphan.testId && mongoose.Types.ObjectId.isValid(orphan.testId)) {
                        testDoc = await TestConfigModel.findById(orphan.testId);
                    }
                    const { evaluateEirfIncident } = require('../services/eirfEvaluator');
                    const eirfEval = evaluateEirfIncident(orphan, testDoc);
                    orphan.hasEirfFlag = eirfEval.hasEirfFlag;
                    orphan.eirfStatus = eirfEval.eirfStatus;
                    orphan.flaggedReasons = eirfEval.flaggedReasons;
                    orphan.pipelineStatus = eirfEval.hasEirfFlag ? 'FLAGGED' : 'CLEARED';
                    await orphan.save();
                    console.log(`[EIRF_PIPELINE] Recovered stranded submission ${orphan._id} -> promoted to '${orphan.pipelineStatus}'.`);
                } catch (recErr) {
                    console.error(`[EIRF_PIPELINE] Error recovering stranded submission ${orphan._id}:`, recErr.message);
                }
            }

            // C. Process Clean Submissions
            const cleanCandidates = await TestSubmissionModel.find({
                pipelineStatus: 'CLEARED',
                'emailsSent.testSubmitted': { $ne: true },
                isDeleted: { $ne: true }
            }).limit(25);

            let cleanDispatchedCount = 0;
            for (const sub of cleanCandidates) {
                if (cleanDispatchedCount >= 5) break;
                const lastErr = String(sub.emailsSent?.lastError || '');
                const lastAttemptMs = sub.emailsSent?.lastAttemptAt ? new Date(sub.emailsSent.lastAttemptAt).getTime() : 0;
                if (sub.emailsSent?.lastAttemptType === 'test_submitted') {
                    if (lastErr.includes('missing or invalid')) continue;
                    if (lastAttemptMs && (now.getTime() - lastAttemptMs) < 5 * 60 * 1000) continue;
                }
                cleanDispatchedCount++;
                try {
                    const cleanRes = await sendTestSubmittedEmail(sub._id, { triggerSource: 'eirf_pipeline_clean' });
                    if (cleanRes?.skipped) continue;
                    await TestSubmissionModel.updateOne(
                        { _id: sub._id },
                        {
                            $push: {
                                pipelineHistory: {
                                    step: 'SEND_CLEAN_CONFIRMATION',
                                    status: cleanRes?.success ? 'COMPLETED' : 'FAILED',
                                    timestamp: new Date(),
                                    durationMs: 0,
                                    details: { submissionId: sub._id },
                                    ...(cleanRes?.success ? {} : { error: String(cleanRes?.error || cleanRes?.reason || 'Dispatch failed') })
                                }
                            }
                        }
                    );
                } catch (cleanErr) {
                    console.error(`[EIRF_PIPELINE] Error sending clean email for ${sub._id}:`, cleanErr.message);
                }
            }

            // D. Process Flagged Sequential Submissions (At most 3 per tick to control RAM)
            const pendingJobs = await TestSubmissionModel.find({
                pipelineStatus: { $in: ['FLAGGED', 'QUESTIONS_GENERATED', 'SENDING_INVITE_EMAIL', 'EIRF_SUBMITTED', 'SENDING_CONFIRMATION_EMAIL'] },
                'pipelineLock.isLocked': false,
                isDeleted: { $ne: true }
            }).limit(3);

            for (const sub of pendingJobs) {
                const subId = sub._id;
                // Atomic claim lock
                const lockedSub = await TestSubmissionModel.findOneAndUpdate(
                    { _id: subId, 'pipelineLock.isLocked': false },
                    { 
                        $set: { 
                            'pipelineLock.isLocked': true, 
                            'pipelineLock.lockedAt': now,
                            'pipelineLock.workerId': process.pid.toString()
                        } 
                    },
                    { new: true }
                );

                if (!lockedSub) continue; // Lost race to another worker

                try {
                    await processSequentialJob(lockedSub);
                } catch (jobErr) {
                    console.error(`[EIRF_PIPELINE] Unhandled job error on submission ${subId}:`, jobErr);
                    lockedSub.pipelineRetries = (lockedSub.pipelineRetries || 0) + 1;
                    lockedSub.lastPipelineError = jobErr.message || String(jobErr);
                    if (lockedSub.pipelineRetries >= MAX_STEP_RETRIES) {
                        lockedSub.pipelineStatus = 'FAILED';
                    }
                    await recordPipelineStep(lockedSub, 'PIPELINE_ERROR', 'FAILED', 0, null, jobErr.message);
                } finally {
                    // Always release lock via targeted $set so concurrent emailsSent mutations are never overwritten
                    await TestSubmissionModel.updateOne(
                        { _id: subId },
                        {
                            $set: {
                                pipelineStatus: lockedSub.pipelineStatus,
                                'pipelineLock.isLocked': false,
                                'pipelineLock.lockedAt': null,
                                'pipelineLock.workerId': null,
                                pipelineHistory: lockedSub.pipelineHistory || [],
                                pipelineRetries: lockedSub.pipelineRetries || 0,
                                lastPipelineError: lockedSub.lastPipelineError || null,
                                generatedQuestions: lockedSub.generatedQuestions || [],
                                eirfToken: lockedSub.eirfToken || null,
                                eirfExpiresAt: lockedSub.eirfExpiresAt || null,
                                eirfNoticeEmailSent: Boolean(lockedSub.eirfNoticeEmailSent),
                                eirfStatus: lockedSub.eirfStatus
                            }
                        }
                    );
                }
            }
        } else {
            // Local JSON Fallback Mode
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            let changed = false;

            const toExpireEmails = [];
            const cleanClearedIds = [];

            // Check expirations & recover orphans
            for (const sub of db.testSubmissions) {
                if (sub.isDeleted) continue;

                if (sub.pipelineStatus === 'AWAITING_EIRF' && sub.eirfExpiresAt && new Date(sub.eirfExpiresAt) < now) {
                    sub.pipelineStatus = 'EXPIRED';
                    sub.eirfStatus = 'expired';
                    changed = true;
                    if (!sub.emailsSent?.testSubmitted) {
                        toExpireEmails.push(sub.id || sub._id);
                    }
                }
                // Recover stranded finalized submissions in 'QUEUED'
                if (['submitted', 'auto-submitted', 'evaluated'].includes(sub.status) && sub.pipelineStatus === 'QUEUED') {
                    const test = (db.tests || []).find(t => String(t.id || t._id) === String(sub.testId));
                    const { evaluateEirfIncident } = require('../services/eirfEvaluator');
                    const eirfEval = evaluateEirfIncident(sub, test);
                    sub.hasEirfFlag = eirfEval.hasEirfFlag;
                    sub.eirfStatus = eirfEval.eirfStatus;
                    sub.flaggedReasons = eirfEval.flaggedReasons;
                    sub.pipelineStatus = eirfEval.hasEirfFlag ? 'FLAGGED' : 'CLEARED';
                    changed = true;
                    console.log(`[EIRF_PIPELINE] (JSON) Recovered stranded submission ${sub.id || sub._id} -> '${sub.pipelineStatus}'.`);
                }

                if (sub.pipelineStatus === 'CLEARED' && !sub.emailsSent?.testSubmitted) {
                    const lastErr = String(sub.emailsSent?.lastError || '');
                    const lastAttemptMs = sub.emailsSent?.lastAttemptAt ? new Date(sub.emailsSent.lastAttemptAt).getTime() : 0;
                    const skipPerm = sub.emailsSent?.lastAttemptType === 'test_submitted' && lastErr.includes('missing or invalid');
                    const skipCooldown = sub.emailsSent?.lastAttemptType === 'test_submitted' && lastAttemptMs && (now.getTime() - lastAttemptMs) < 5 * 60 * 1000;
                    if (!skipPerm && !skipCooldown && cleanClearedIds.length < 5) {
                        cleanClearedIds.push(sub.id || sub._id);
                    }
                }
            }

            if (changed) {
                saveJSONData(db);
            }

            for (const expId of toExpireEmails) {
                try {
                    await sendTestSubmittedEmail(expId, { triggerSource: 'eirf_pipeline_expired' });
                } catch (err) {
                    console.error(`[EIRF_PIPELINE] (JSON) Error sending deferred submission email on expiry:`, err.message);
                }
            }

            for (const cleanId of cleanClearedIds) {
                try {
                    await sendTestSubmittedEmail(cleanId, { triggerSource: 'eirf_pipeline_clean' });
                } catch (cleanErr) {
                    console.error(`[EIRF_PIPELINE] (JSON) Error sending clean email for ${cleanId}:`, cleanErr.message);
                }
            }

            // Find next job (re-read snapshot after email dispatches)
            const freshDb = getJSONData();
            freshDb.testSubmissions = freshDb.testSubmissions || [];
            const job = freshDb.testSubmissions.find(s =>
                !s.isDeleted &&
                ['FLAGGED', 'QUESTIONS_GENERATED', 'SENDING_INVITE_EMAIL', 'EIRF_SUBMITTED', 'SENDING_CONFIRMATION_EMAIL'].includes(s.pipelineStatus) &&
                (!s.pipelineLock || !s.pipelineLock.isLocked || new Date(s.pipelineLock.lockedAt) < lockCutoff)
            );

            if (job) {
                if (!job.pipelineLock) job.pipelineLock = {};
                job.pipelineLock.isLocked = true;
                job.pipelineLock.lockedAt = now;
                saveJSONData(freshDb);

                try {
                    await processSequentialJob(job);
                } catch (jobErr) {
                    job.pipelineRetries = (job.pipelineRetries || 0) + 1;
                    job.lastPipelineError = jobErr.message;
                    if (job.pipelineRetries >= MAX_STEP_RETRIES) {
                        job.pipelineStatus = 'FAILED';
                    }
                    await recordPipelineStep(job, 'PIPELINE_ERROR', 'FAILED', 0, null, jobErr.message);
                } finally {
                    job.pipelineLock.isLocked = false;
                    // Re-read latest JSON snapshot so long async LLM/email operations never clobber concurrent writes
                    const latestDb = getJSONData();
                    latestDb.testSubmissions = latestDb.testSubmissions || [];
                    const jobTargetId = String(job._id || job.id || '');
                    const targetIdx = latestDb.testSubmissions.findIndex(s => String(s._id || s.id || '') === jobTargetId);
                    if (targetIdx !== -1) {
                        const existingEmails = latestDb.testSubmissions[targetIdx].emailsSent || {};
                        latestDb.testSubmissions[targetIdx] = {
                            ...latestDb.testSubmissions[targetIdx],
                            pipelineStatus: job.pipelineStatus,
                            pipelineLock: job.pipelineLock,
                            pipelineHistory: job.pipelineHistory,
                            pipelineRetries: job.pipelineRetries,
                            lastPipelineError: job.lastPipelineError,
                            generatedQuestions: job.generatedQuestions,
                            eirfToken: job.eirfToken,
                            eirfExpiresAt: job.eirfExpiresAt,
                            eirfNoticeEmailSent: job.eirfNoticeEmailSent,
                            eirfStatus: job.eirfStatus,
                            emailsSent: { ...(job.emailsSent || {}), ...existingEmails }
                        };
                        saveJSONData(latestDb);
                    }
                }
            }
        }
    } catch (tickErr) {
        console.error("[EIRF_PIPELINE] Error in worker tick:", tickErr);
    } finally {
        isProcessingTick = false;
    }
}

/**
 * Sequential execution handler for an individual submission
 */
async function processSequentialJob(sub) {
    const subId = sub._id || sub.id;

    // -------------------------------------------------------------
    // STEP 1: Generate Tailored Questions
    // -------------------------------------------------------------
    if (sub.pipelineStatus === 'FLAGGED' || sub.pipelineStatus === 'GENERATING_QUESTIONS') {
        const startT = Date.now();
        sub.pipelineStatus = 'GENERATING_QUESTIONS';
        console.log(`[EIRF_PIPELINE] [Step 1] Synthesizing dynamic AI inquiry questions for ${subId}...`);

        let questions = [];
        try {
            questions = await eirfLlmService.generateInquiryQuestions(sub);
        } catch (genErr) {
            console.warn(`[EIRF_PIPELINE] [Step 1] AI generation threw: ${genErr.message}, falling back to local deterministic templates.`);
            questions = generateTailoredQuestions(sub);
        }

        sub.generatedQuestions = questions;
        sub.pipelineStatus = 'QUESTIONS_GENERATED';

        const durMs = Date.now() - startT;
        await recordPipelineStep(sub, 'GENERATE_QUESTIONS', 'COMPLETED', durMs, { count: questions.length });
        console.log(`[EIRF_PIPELINE] [Step 1] Generated ${questions.length} questions in ${durMs}ms. Status -> 'QUESTIONS_GENERATED'.`);
    }

    // -------------------------------------------------------------
    // STEP 2: Issue Token, Magic Link, and Dispatch Invite Email
    // -------------------------------------------------------------
    if (sub.pipelineStatus === 'QUESTIONS_GENERATED' || sub.pipelineStatus === 'SENDING_INVITE_EMAIL') {
        const startT = Date.now();
        sub.pipelineStatus = 'SENDING_INVITE_EMAIL';
        console.log(`[EIRF_PIPELINE] [Step 2] Issuing token and dispatching invite email for ${subId}...`);

        // Generate cryptographically secure token & 45m expiration
        if (!sub.eirfToken) {
            sub.eirfToken = crypto.randomBytes(24).toString('hex');
        }
        if (!sub.eirfExpiresAt) {
            sub.eirfExpiresAt = new Date(Date.now() + EIRF_EXPIRY_MS);
        }

        let candDoc = null;
        if (sub.candidateId) {
            if (dbState.useMongo && mongoose.Types.ObjectId.isValid(sub.candidateId)) {
                candDoc = await CandidateModel.findById(sub.candidateId)
                    .select('registrationData.personalEmail registrationData.collegeEmail personalEmail email studentId username name fullName')
                    .lean();
            } else {
                const jsonDb = getJSONData();
                candDoc = (jsonDb.candidates || []).find(c => String(c._id || c.id) === String(sub.candidateId)) || null;
            }
        }
        if (!candDoc && sub.studentId) {
            if (dbState.useMongo) {
                candDoc = await CandidateModel.findOne({ studentId: String(sub.studentId) })
                    .select('registrationData.personalEmail registrationData.collegeEmail personalEmail email studentId username name fullName')
                    .lean();
                if (!candDoc) {
                    candDoc = await CandidateModel.findOne({ username: String(sub.studentId) })
                        .select('registrationData.personalEmail registrationData.collegeEmail personalEmail email studentId username name fullName')
                        .lean();
                }
            } else {
                const jsonDb = getJSONData();
                candDoc = (jsonDb.candidates || []).find(c => String(c.studentId) === String(sub.studentId) || String(c.username) === String(sub.studentId)) || null;
            }
        }
        const recipientEmail = extractValidCandidateEmail(candDoc, sub) || '';

        const basePortalUrl = resolvePortalBaseUrl();
        const encryptedBicsId = toBicsId(sub._id || sub.id || subId);
        const magicLink = `${basePortalUrl}/assessment/evaluation/eirf/${encryptedBicsId}?token=${sub.eirfToken}`;

        const incidentSummary = (sub.flaggedReasons && sub.flaggedReasons.length > 0)
            ? sub.flaggedReasons.join('; ')
            : 'Proctoring alert flagged for post-exam incident review.';

        // Dispatch EIRF filing notice email — propagate failure so retries happen cleanly
        const mailRes = await sendEirfFilingNoticeEmail(sub, {
            magicLink,
            magicToken: sub.eirfToken,
            expiresAt: sub.eirfExpiresAt,
            incidentType: incidentSummary,
            recipient: recipientEmail,
            triggerSource: 'eirf_pipeline_step2'
        });

        if (!mailRes || !mailRes.success) {
            const errMsg = mailRes?.error || mailRes?.reason || 'EIRF filing notice email dispatch failed';
            sub.pipelineStatus = 'QUESTIONS_GENERATED';
            await recordPipelineStep(sub, 'DISPATCH_INVITE_EMAIL', 'FAILED', Date.now() - startT, {
                recipient: recipientEmail
            }, errMsg);
            throw new Error(errMsg);
        }

        sub.emailsSent = sub.emailsSent || {};
        sub.emailsSent.eirfFiling = true;
        sub.emailsSent.eirfFilingAt = sub.emailsSent.eirfFilingAt || new Date();
        sub.eirfNoticeEmailSent = true;
        sub.pipelineStatus = 'AWAITING_EIRF';
        sub.eirfStatus = 'pending';

        const durMs = Date.now() - startT;
        await recordPipelineStep(sub, 'DISPATCH_INVITE_EMAIL', 'COMPLETED', durMs, {
            recipient: recipientEmail,
            magicLink,
            expiresAt: sub.eirfExpiresAt
        });
        console.log(`[EIRF_PIPELINE] [Step 2] Invite sent in ${durMs}ms. Status -> 'AWAITING_EIRF' (Expires: ${new Date(sub.eirfExpiresAt).toISOString()}).`);
    }

    // -------------------------------------------------------------
    // STEP 3: Dispatch Deferred Test Submission Confirmation Email (Option B)
    // -------------------------------------------------------------
    if (sub.pipelineStatus === 'EIRF_SUBMITTED' || sub.pipelineStatus === 'SENDING_CONFIRMATION_EMAIL') {
        const startT = Date.now();
        sub.pipelineStatus = 'SENDING_CONFIRMATION_EMAIL';
        console.log(`[EIRF_PIPELINE] [Step 3] Processing EIRF submission and dispatching deferred test submission email for ${subId}...`);

        let candDoc = null;
        if (sub.candidateId) {
            if (dbState.useMongo && mongoose.Types.ObjectId.isValid(sub.candidateId)) {
                candDoc = await CandidateModel.findById(sub.candidateId)
                    .select('registrationData.personalEmail registrationData.collegeEmail personalEmail email studentId username name fullName')
                    .lean();
            } else {
                const jsonDb = getJSONData();
                candDoc = (jsonDb.candidates || []).find(c => String(c._id || c.id) === String(sub.candidateId)) || null;
            }
        }
        if (!candDoc && sub.studentId) {
            if (dbState.useMongo) {
                candDoc = await CandidateModel.findOne({ studentId: String(sub.studentId) })
                    .select('registrationData.personalEmail registrationData.collegeEmail personalEmail email studentId username name fullName')
                    .lean();
                if (!candDoc) {
                    candDoc = await CandidateModel.findOne({ username: String(sub.studentId) })
                        .select('registrationData.personalEmail registrationData.collegeEmail personalEmail email studentId username name fullName')
                        .lean();
                }
            } else {
                const jsonDb = getJSONData();
                candDoc = (jsonDb.candidates || []).find(c => String(c.studentId) === String(sub.studentId) || String(c.username) === String(sub.studentId)) || null;
            }
        }
        const recipientEmail = extractValidCandidateEmail(candDoc, sub) || '';

        // Deferred test submission confirmation: candidate filed EIRF -> send test_submitted (no eirf_confirmation)
        if (!sub.emailsSent?.testSubmitted) {
            const tsRes = await sendTestSubmittedEmail(sub, { triggerSource: 'eirf_pipeline_step3' });
            if (!tsRes || !tsRes.success) {
                const errMsg = tsRes?.error || tsRes?.reason || 'Deferred test submission confirmation email failed';
                sub.pipelineStatus = 'EIRF_SUBMITTED';
                await recordPipelineStep(sub, 'DISPATCH_CONFIRMATION_EMAIL', 'FAILED', Date.now() - startT, {
                    recipient: recipientEmail
                }, errMsg);
                throw new Error(errMsg);
            }
            console.log(`[EIRF_PIPELINE] [Step 3] Dispatched deferred test submission confirmation email for ${subId}.`);
        }

        sub.pipelineStatus = 'UNDER_REVIEW';

        if (dbState.useMongo) {
            await EIRFReportModel.updateMany(
                { $or: [{ submissionId: String(subId) }, ...(sub.eirfReportId ? [{ reportId: sub.eirfReportId }] : [])] },
                { $set: { pipelineStatus: 'UNDER_REVIEW' } }
            ).catch(() => {});
        } else {
            const latestDb = getJSONData();
            let repUpdated = false;
            (latestDb.eirfReports || []).forEach(r => {
                if (String(r.submissionId) === String(subId) || (sub.eirfReportId && r.reportId === sub.eirfReportId)) {
                    r.pipelineStatus = 'UNDER_REVIEW';
                    repUpdated = true;
                }
            });
            if (repUpdated) saveJSONData(latestDb);
        }

        const durMs = Date.now() - startT;
        await recordPipelineStep(sub, 'DISPATCH_CONFIRMATION_EMAIL', 'COMPLETED', durMs, {
            recipient: recipientEmail
        });
        console.log(`[EIRF_PIPELINE] [Step 3] Deferred confirmation email sent in ${durMs}ms. Status -> 'UNDER_REVIEW'.`);
    }
}

/**
 * Start pipeline daemon
 */
function startEirfPipelineWorker(intervalMs = 10000) {
    if (workerIntervalId) return;
    console.log(`[EIRF_PIPELINE] Sequential Pipeline Worker initialized (Interval: ${intervalMs}ms).`);
    
    // Initial run
    runPipelineTick().catch(() => {});
    
    workerIntervalId = setInterval(() => {
        runPipelineTick().catch(() => {});
    }, intervalMs);
}

/**
 * Stop pipeline daemon
 */
function stopEirfPipelineWorker() {
    if (workerIntervalId) {
        clearInterval(workerIntervalId);
        workerIntervalId = null;
        console.log(`[EIRF_PIPELINE] Sequential Pipeline Worker stopped.`);
    }
}

module.exports = {
    startEirfPipelineWorker,
    stopEirfPipelineWorker,
    runPipelineTick,
    processSequentialJob,
    generateTailoredQuestions
};
