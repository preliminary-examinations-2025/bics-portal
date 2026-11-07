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
 *    - Step 4 ('EIRF_SUBMITTED'): Candidate filed explanation -> dispatches confirmation email
 *      -> advances to 'UNDER_REVIEW' for administrator malpractice evaluation.
 * 
 * Features:
 * - Atomic MongoDB Locking with 60s Dead-Man Lock Break (recovers crashed workers).
 * - Step-Level Fault Isolation: Failures in email dispatch NEVER re-trigger question generation.
 * - Dual-Persistence: Fully functional on MongoDB Atlas and local JSON fallback DB.
 */

const crypto = require('crypto');
const { TestSubmissionModel, CandidateModel, TestConfigModel } = require('../models');
const { dbState, getJSONData, saveJSONData } = require('../config/db');
const { 
    sendEirfNoticeEmail, 
    sendCleanSubmissionEmail, 
    sendEirfConfirmationEmail 
} = require('../utils/email');
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
            questionText: `Our security monitor recorded ${fsExits} fullscreen exit(s)${maxFsSec > 0 ? ` with a maximum duration of ${maxFsSec} seconds` : ''}. What specific application or system event caused the browser to exit fullscreen?`,
            context: `Fullscreen exit count: ${fsExits}, max duration: ${maxFsSec}s`,
            placeholder: 'Provide a clear explanation of what occurred when fullscreen was exited...',
            required: true
        });
    }

    // 2. Tab switch or window blur inquiry
    if (tabSwitches > 0 || maxTabSec > 5) {
        questions.push({
            questionId: 'Q_TAB_SWITCH_' + crypto.randomBytes(4).toString('hex'),
            category: 'TAB_SWITCH',
            questionText: `The system detected ${tabSwitches} window blur or tab switch event(s)${maxTabSec > 0 ? ` lasting up to ${maxTabSec} seconds` : ''}. Please specify what application, shortcut, or notification caused the window focus loss.`,
            context: `Tab switch count: ${tabSwitches}, max duration: ${maxTabSec}s`,
            placeholder: 'Describe the browser tab switch or external app interaction...',
            required: true
        });
    }

    // 3. Network disconnection inquiry
    if (maxOfflineSec > 5) {
        questions.push({
            questionId: 'Q_NETWORK_' + crypto.randomBytes(4).toString('hex'),
            category: 'NETWORK',
            questionText: `A network disconnection of approximately ${maxOfflineSec} seconds was logged during your active session. What internet source were you using (e.g. Wi-Fi, mobile hotspot, ethernet), and how was connectivity restored?`,
            context: `Detected offline duration: ${maxOfflineSec}s`,
            placeholder: 'Detail your network setup and how reconnection occurred...',
            required: true
        });
    }

    // 4. Minor proctoring or auto-submit inquiry
    if (submission?.status === 'auto-submitted') {
        questions.push({
            questionId: 'Q_AUTOSUBMIT_' + crypto.randomBytes(4).toString('hex'),
            category: 'GENERAL',
            questionText: `Your exam attempt was automatically finalized by the system (${submission.submissionReason || 'system_auto'}). Please explain your current surroundings and status at the time this occurred.`,
            context: `Submission reason: ${submission.submissionReason || 'system_auto'}`,
            placeholder: 'Explain the circumstances surrounding the session finalization...',
            required: true
        });
    }

    // Fallback general question if specific categories didn't trigger
    if (questions.length === 0) {
        questions.push({
            questionId: 'Q_INCIDENT_GENERAL_' + crypto.randomBytes(4).toString('hex'),
            category: 'GENERAL',
            questionText: `Your session was flagged for post-exam review based on the following reasons: ${flaggedReasons.join('; ') || 'Automated proctoring anomaly'}. Please provide a comprehensive account of your examination environment.`,
            context: `Flagged reasons: ${flaggedReasons.join('; ')}`,
            placeholder: 'Provide complete details regarding the flagged events...',
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
                isDeleted: false
            });

            for (const sub of expiredSubs) {
                sub.pipelineStatus = 'EXPIRED';
                sub.eirfStatus = 'expired';
                await recordPipelineStep(sub, 'EXPIRE_SUBMISSION', 'COMPLETED', 0, { expiredAt: now });
                await sub.save();
                console.log(`[EIRF_PIPELINE] Submission ${sub._id} EIRF window expired. Status -> 'EXPIRED'.`);
            }

            // B.2 Orphan Recovery: Scan for finalized submissions trapped in 'QUEUED'
            const orphanedSubs = await TestSubmissionModel.find({
                status: { $in: ['submitted', 'auto-submitted'] },
                pipelineStatus: 'QUEUED',
                'pipelineLock.isLocked': false,
                isDeleted: false
            }).limit(5);

            for (const orphan of orphanedSubs) {
                try {
                    let testDoc = null;
                    if (orphan.testId) {
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

            // C. Process Clean Submissions (Send verified confirmation email)
            const cleanSubs = await TestSubmissionModel.find({
                pipelineStatus: 'CLEARED',
                'securityMetadata.cleanEmailSent': { $ne: true },
                isDeleted: false
            }).limit(5);

            for (const sub of cleanSubs) {
                try {
                    let recipientEmail = sub.candidateEmail;
                    if (!recipientEmail && sub.candidateId) {
                        const cand = await CandidateModel.findById(sub.candidateId).select('personalEmail email');
                        recipientEmail = cand?.personalEmail || cand?.email;
                    }
                    if (recipientEmail) {
                        await sendCleanSubmissionEmail(recipientEmail, sub.candidateName || 'Candidate', sub.testTitle || 'Exam', sub._id);
                    }
                    if (!sub.securityMetadata) sub.securityMetadata = {};
                    sub.securityMetadata.cleanEmailSent = true;
                    await recordPipelineStep(sub, 'SEND_CLEAN_CONFIRMATION', 'COMPLETED', 0, { recipient: recipientEmail });
                    await sub.save();
                } catch (cleanErr) {
                    console.error(`[EIRF_PIPELINE] Error sending clean email for ${sub._id}:`, cleanErr.message);
                }
            }

            // D. Process Flagged Sequential Submissions (At most 3 per tick to control RAM)
            const pendingJobs = await TestSubmissionModel.find({
                pipelineStatus: { $in: ['FLAGGED', 'QUESTIONS_GENERATED', 'EIRF_SUBMITTED'] },
                'pipelineLock.isLocked': false,
                isDeleted: false
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
                    // Always release lock
                    lockedSub.pipelineLock.isLocked = false;
                    lockedSub.pipelineLock.lockedAt = null;
                    lockedSub.pipelineLock.workerId = null;
                    await lockedSub.save();
                }
            }
        } else {
            // Local JSON Fallback Mode
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            let changed = false;

            // Check expirations
            db.testSubmissions.forEach(sub => {
                if (sub.pipelineStatus === 'AWAITING_EIRF' && sub.eirfExpiresAt && new Date(sub.eirfExpiresAt) < now) {
                    sub.pipelineStatus = 'EXPIRED';
                    sub.eirfStatus = 'expired';
                    changed = true;
                }
                // Recover stranded finalized submissions in 'QUEUED'
                if (['submitted', 'auto-submitted'].includes(sub.status) && sub.pipelineStatus === 'QUEUED') {
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
            });

            // Find next job
            const job = db.testSubmissions.find(s => 
                ['FLAGGED', 'QUESTIONS_GENERATED', 'EIRF_SUBMITTED'].includes(s.pipelineStatus) &&
                (!s.pipelineLock || !s.pipelineLock.isLocked || new Date(s.pipelineLock.lockedAt) < lockCutoff)
            );

            if (job) {
                if (!job.pipelineLock) job.pipelineLock = {};
                job.pipelineLock.isLocked = true;
                job.pipelineLock.lockedAt = now;
                saveJSONData(db);

                try {
                    await processSequentialJob(job);
                } catch (jobErr) {
                    job.pipelineRetries = (job.pipelineRetries || 0) + 1;
                    job.lastPipelineError = jobErr.message;
                    if (job.pipelineRetries >= MAX_STEP_RETRIES) {
                        job.pipelineStatus = 'FAILED';
                    }
                } finally {
                    job.pipelineLock.isLocked = false;
                    saveJSONData(db);
                }
            } else if (changed) {
                saveJSONData(db);
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
        sub.eirfExpiresAt = new Date(Date.now() + EIRF_EXPIRY_MS);

        let recipientEmail = sub.candidateEmail;
        if (!recipientEmail && sub.candidateId && dbState.useMongo) {
            const cand = await CandidateModel.findById(sub.candidateId).select('personalEmail email');
            recipientEmail = cand?.personalEmail || cand?.email;
        }
        if (!recipientEmail) recipientEmail = 'preliminaryexaminations@gmail.com';

        const isProd = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
        const defaultPortalUrl = isProd ? 'https://bicsportal.netlify.app' : 'http://localhost:5174';
        const basePortalUrl = (process.env.PORTAL_URL || process.env.DASHBOARD_URL || defaultPortalUrl).replace(/\/+$/, '');
        const encryptedBicsId = toBicsId(sub._id || sub.id || subId);
        const magicLink = `${basePortalUrl}/assessment/evaluation/eirf/${encryptedBicsId}?token=${sub.eirfToken}`;

        const summary = (sub.flaggedReasons && sub.flaggedReasons.length > 0)
            ? `Identified Incidents:\n• ${sub.flaggedReasons.join('\n• ')}`
            : `Proctoring alert flagged for post-exam incident review.`;

        await sendEirfNoticeEmail(
            recipientEmail,
            sub.candidateName || 'Candidate',
            sub.testTitle || 'BICS Examination',
            summary,
            encryptedBicsId,
            {
                studentId: sub.studentId,
                magicLink,
                token: sub.eirfToken,
                expiresAt: sub.eirfExpiresAt
            }
        );

        sub.eirfNoticeEmailSent = true;
        sub.pipelineStatus = 'AWAITING_EIRF';
        sub.eirfStatus = 'pending';

        const durMs = Date.now() - startT;
        await recordPipelineStep(sub, 'DISPATCH_INVITE_EMAIL', 'COMPLETED', durMs, {
            recipient: recipientEmail,
            magicLink,
            expiresAt: sub.eirfExpiresAt
        });
        console.log(`[EIRF_PIPELINE] [Step 2] Invite sent in ${durMs}ms. Status -> 'AWAITING_EIRF' (Expires: ${sub.eirfExpiresAt.toISOString()}).`);
    }

    // -------------------------------------------------------------
    // STEP 3: Dispatch EIRF Confirmation Email
    // -------------------------------------------------------------
    if (sub.pipelineStatus === 'EIRF_SUBMITTED' || sub.pipelineStatus === 'SENDING_CONFIRMATION_EMAIL') {
        const startT = Date.now();
        sub.pipelineStatus = 'SENDING_CONFIRMATION_EMAIL';
        console.log(`[EIRF_PIPELINE] [Step 3] Sending EIRF confirmation email for ${subId}...`);

        let recipientEmail = sub.candidateEmail;
        if (!recipientEmail && sub.candidateId && dbState.useMongo) {
            const cand = await CandidateModel.findById(sub.candidateId).select('personalEmail email');
            recipientEmail = cand?.personalEmail || cand?.email;
        }
        if (!recipientEmail) recipientEmail = 'preliminaryexaminations@gmail.com';

        await sendEirfConfirmationEmail(
            recipientEmail,
            sub.candidateName || 'Candidate',
            sub.testTitle || 'BICS Examination',
            sub.eirfReportId || String(subId)
        );

        sub.pipelineStatus = 'UNDER_REVIEW';

        const durMs = Date.now() - startT;
        await recordPipelineStep(sub, 'DISPATCH_CONFIRMATION_EMAIL', 'COMPLETED', durMs, {
            recipient: recipientEmail
        });
        console.log(`[EIRF_PIPELINE] [Step 3] Confirmation email sent in ${durMs}ms. Status -> 'UNDER_REVIEW'.`);
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
