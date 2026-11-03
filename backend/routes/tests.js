const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const { TestConfigModel, TestSubmissionModel, TestTokenModel, CandidateModel, ConfigModel } = require('../models');
const { dbState, getJSONData, saveJSONData } = require('../config/db');
const { buildCandidateQueryFilter } = require('../config/constants');
const { logSystemAction } = require('../utils/logger');
const { encryptEirfPayload } = require('../utils/cipher');
const { recalculateMCQScore, calculateCodingScoreFast } = require('../utils/scoreCalculator');
const { sendEirfNoticeEmail } = require('../utils/email');
const { executeCode } = require('../utils/codeRunner');
const { authenticateToken, requireAuth, requireAdmin, requireOwnerOrAdmin } = require('../middleware/auth');
const { isBicsId, toMongoId, toBicsId } = require('../utils/bicsId');
const { compareFaceBiometrics, isPlaceholderPhoto } = require('../utils/biometricMatcher');

const activeSubmissionsProcessing = new Set();

// 1. Get active tests for student dashboard
router.get('/active', requireAuth, async (req, res) => {
    let candidateId = req.query.id || req.query.candidateId;
    if (req.user && req.user.role !== 'admin') {
        candidateId = req.user.id || req.user.studentId;
    }
    try {
        let activeTests = [];

        if (dbState.useMongo) {
            activeTests = await TestConfigModel.find({
                $or: [{ isPublished: true }, { isPublished: { $exists: false } }],
                isDeleted: { $ne: true }
            })
            .select('_id title marks duration startDate endDate instructions isPublished questions._id')
            .lean();
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            activeTests = db.tests.filter(t => t.isPublished !== false && !t.isDeleted);
        }

        activeTests.sort((a, b) => {
            const idA = a._id ? a._id.toString() : '';
            const idB = b._id ? b._id.toString() : '';
            if (idA && idB && idA.length === 24 && idB.length === 24) {
                return idB.localeCompare(idA);
            }
            const dateA = new Date(a.startDate || 0);
            const dateB = new Date(b.startDate || 0);
            return dateB - dateA;
        });

        const testIds = activeTests.map(t => t._id || t.id).filter(Boolean);
        const submissionMap = new Map();

        if (candidateId && candidateId !== 'admin' && testIds.length > 0) {
            try {
                if (dbState.useMongo) {
                    const candFilter = buildCandidateQueryFilter(candidateId);
                    if (candFilter) {
                        const subs = await TestSubmissionModel.find({
                            $and: [
                                candFilter,
                                {
                                    $or: [
                                        { testId: { $in: testIds } },
                                        { testId: { $in: testIds.map(String) } }
                                    ]
                                },
                                { isDeleted: { $ne: true } }
                            ]
                        })
                        .select('_id testId status eirfStatus hasEirfFlag startedAt')
                        .sort({ startedAt: -1 })
                        .lean();

                        subs.forEach(s => {
                            const tKey = String(s.testId);
                            if (!submissionMap.has(tKey)) {
                                submissionMap.set(tKey, s);
                            }
                        });
                    }
                } else {
                    const db = getJSONData();
                    (db.testSubmissions || []).forEach(s => {
                        if (
                            s.candidateId && s.testId &&
                            (s.candidateId.toString() === candidateId.toString() || s.studentId === candidateId.toString()) &&
                            !s.isDeleted
                        ) {
                            const tKey = String(s.testId);
                            if (!submissionMap.has(tKey)) {
                                submissionMap.set(tKey, s);
                            }
                        }
                    });
                }
            } catch (subErr) {
                console.error("Warning querying submissionStatus for active tests:", subErr);
            }
        }

        const sanitizedTests = activeTests.map(t => {
            const testId = t._id ? t._id.toString() : (t.id ? t.id.toString() : '');
            const foundSub = submissionMap.get(testId);
            return { 
                id: testId,
                _id: testId,
                title: t.title,
                course: t.course || '',
                courseCode: t.courseCode || '',
                marks: t.marks,
                duration: t.duration,
                startDate: t.startDate,
                endDate: t.endDate,
                instructions: t.instructions,
                questionsCount: Array.isArray(t.questions) ? t.questions.length : 0,
                submissionId: foundSub ? (foundSub._id || foundSub.id) : null,
                submissionStatus: foundSub ? foundSub.status : null,
                eirfStatus: foundSub ? (foundSub.eirfStatus || 'none') : 'none',
                hasEirfFlag: foundSub ? !!foundSub.hasEirfFlag : false
            };
        });

        return res.json(sanitizedTests || []);
    } catch (e) {
        console.error("Error in /api/tests/active:", e);
        return res.json([]);
    }
});

// 2. Get submitted tests for candidate view
router.get('/submitted', requireAuth, async (req, res) => {
    let candidateId = req.query.id || req.query.candidateId;
    if (req.user && req.user.role !== 'admin') {
        const userMongo = isBicsId(String(req.user.id || '')) ? toMongoId(String(req.user.id || '')) : String(req.user.id || '');
        const allowedIds = [
            String(req.user.id || ''),
            String(req.user.studentId || ''),
            String(req.user.username || ''),
            userMongo,
            toBicsId(userMongo)
        ];
        if (candidateId) {
            const candNorm = isBicsId(String(candidateId)) ? toMongoId(String(candidateId)) : String(candidateId);
            if (candNorm !== userMongo && !allowedIds.includes(String(candidateId))) {
                return res.status(403).json({ error: "Access denied: You cannot view submissions for another candidate." });
            }
        }
        candidateId = req.user.id || req.user.studentId;
    }
    if (!candidateId) {
        return res.status(400).json({ error: "Candidate identifier is required" });
    }
    try {
        let submissions = [];
        if (dbState.useMongo) {
            const candFilter = buildCandidateQueryFilter(candidateId);
            if (candFilter) {
                submissions = await TestSubmissionModel.find(candFilter);
            }
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submissions = db.testSubmissions.filter(s => s.candidateId && s.candidateId.toString() === candidateId.toString());
        }

        const enrichedList = await Promise.all(submissions.map(async (subDoc) => {
            let sub = subDoc;
            let test = null;
            const testId = sub.testId;
            if (dbState.useMongo) {
                test = await TestConfigModel.findById(testId);
                if (test && (!sub.evaluation || sub.evaluation.totalScore == null)) {
                    recalculateMCQScore(sub, test);
                }
            } else {
                const db = getJSONData();
                db.tests = db.tests || [];
                test = db.tests.find(t => (t.id || t._id).toString() === testId.toString());
                if (test) {
                    const dbSub = db.testSubmissions.find(s => s.id === sub.id || s._id === sub._id);
                    if (dbSub) {
                        if (!dbSub.evaluation || dbSub.evaluation.totalScore == null) {
                            recalculateMCQScore(dbSub, test);
                            saveJSONData(db);
                        }
                        sub = dbSub;
                    }
                }
            }

            if (!test) return null;

            const vStatus = test.verificationStatus || (test.answersReleased ? 'released' : 'not_released');
            const isReleased = (vStatus === 'released');

            return {
                id: testId,
                title: test.title,
                marks: test.marks,
                startDate: test.startDate,
                endDate: test.endDate,
                answersReleased: isReleased,
                verificationStatus: vStatus,
                submission: {
                    id: sub._id || sub.id,
                    status: sub.status,
                    submittedAt: sub.submittedAt,
                    startedAt: sub.startedAt,
                    createdAt: sub.createdAt,
                    totalScore: sub.totalScore !== undefined && sub.totalScore !== null ? Number(sub.totalScore) : (sub.evaluation?.totalScore || 0),
                    proctoringLog: sub.proctoringLog ? {
                        fullscreenExits: sub.proctoringLog.fullscreenExits || 0,
                        tabSwitches: sub.proctoringLog.tabSwitches || 0,
                        inspectAttempts: sub.proctoringLog.inspectAttempts || 0,
                        webcamStatus: sub.proctoringLog.webcamStatus || 'active',
                        events: (sub.proctoringLog.events || []).filter(e => e.type === 'DISQUALIFIED' || e.type === 'ADMIN_WARNING' || e.type === 'CLIPBOARD_ATTEMPT' || e.type === 'DEVTOOLS_OPENED' || (e.durationSeconds && e.durationSeconds > 5))
                    } : {},
                    evaluation: sub.evaluation,
                    reevaluation: sub.reevaluation,
                    objections: sub.objections || [],
                    answers: (sub.answers || []).map(a => ({
                        questionId: a.questionId,
                        type: a.type,
                        score: a.score,
                        maxScore: a.maxScore,
                        isManuallyGraded: a.isManuallyGraded
                    })),
                    questions: []
                }
            };
        }));

        const finalResults = enrichedList.filter(item => item !== null);
        finalResults.sort((a, b) => {
            const getTime = (st) => {
                const sub = st?.submission || {};
                const dateVal = sub.submittedAt || sub.createdAt || sub.startedAt || st?.startDate || st?.endDate;
                if (dateVal) {
                    const t = new Date(dateVal).getTime();
                    if (!isNaN(t) && t > 0) return t;
                }
                const idStr = String(sub.id || sub._id || st?.id || st?._id || '');
                if (idStr.length === 24) {
                    const timestamp = parseInt(idStr.substring(0, 8), 16) * 1000;
                    if (!isNaN(timestamp) && timestamp > 0) return timestamp;
                }
                return 0;
            };
            return getTime(b) - getTime(a);
        });
        return res.json(finalResults);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
});

/**
 * Item B1 Remediation: Sanitizes a question object for candidate presentation.
 * 1. For MCQs: Strips correctOptionIndex.
 * 2. For Coding Questions: Projects ONLY sample test cases (isSample: true).
 *    Completely removes hidden boundary test cases and their expected outputs.
 */
function sanitizeQuestionForCandidate(q) {
    if (!q) return q;
    const qObj = q.toObject ? q.toObject() : { ...q };
    const description = (qObj.description || qObj.questionText || qObj.question || qObj.statement || '').trim();
    const title = (qObj.title || '').trim() || (qObj.type === 'mcq' ? 'MCQ Question' : 'Problem Statement');

    const sanitized = {
        ...qObj,
        title,
        description,
        questionText: description
    };

    if (qObj.type === 'mcq') {
        delete sanitized.correctOptionIndex;
    } else if (qObj.type === 'coding') {
        const rawCases = Array.isArray(qObj.testCases) ? qObj.testCases : [];
        let sampleCases = rawCases.filter(tc => tc.isSample === true);
        // Fallback for legacy test configs where isSample was not explicitly flagged:
        // Project only the first 2 test cases as sample cases
        if (sampleCases.length === 0 && rawCases.length > 0) {
            sampleCases = rawCases.slice(0, Math.min(2, rawCases.length)).map(tc => ({ ...tc, isSample: true }));
        }

        sanitized.testCases = sampleCases.map((tc, idx) => ({
            id: tc.id || tc._id || `sample_${idx + 1}`,
            testcaseId: tc.testcaseId || tc.testCaseId || tc.id || tc._id || (20260101 + idx),
            input: tc.input || '',
            output: tc.output || tc.expectedOutput || '',
            isSample: true,
            points: Number(tc.points || 0)
        }));
    }

    return sanitized;
}

/**
 * Item B4 Remediation: Monotonic Proctoring Violation Reconciler
 * 1. Merges events cleanly into submission.proctoringLog.events without duplicates.
 * 2. Reconciles total violations against authoritative counts of logged events.
 * 3. Enforces a monotonic high-water mark: counters can ONLY increase, never decrease,
 *    blocking client-side attempts to zero out violations during final submit.
 */
function reconcileProctoringLog(existingLog = {}, incomingLog = {}) {
    const rawExisting = (existingLog && typeof existingLog.toObject === 'function') 
        ? existingLog.toObject() 
        : (existingLog || {});
    const log = { ...rawExisting };
    log.events = Array.isArray(rawExisting.events) ? [...rawExisting.events] : [];

    // 1. Merge incoming events cleanly without duplicates
    if (incomingLog && Array.isArray(incomingLog.events) && incomingLog.events.length > 0) {
        const existingKeys = new Set(log.events.map(e => `${e.type}_${new Date(e.timestamp || e.startTime || Date.now()).getTime()}_${e.details || ''}`));
        incomingLog.events.forEach(ev => {
            const k = `${ev.type}_${new Date(ev.timestamp || ev.startTime || Date.now()).getTime()}_${ev.details || ''}`;
            if (!existingKeys.has(k)) {
                existingKeys.add(k);
                log.events.push(ev);
            }
        });
    }

    // 1b. Explicitly preserve & merge evidence snapshots (prevent accidental erasure during submit/heartbeats)
    const existingSnapshots = Array.isArray(rawExisting.snapshots) ? rawExisting.snapshots : [];
    const incomingSnapshots = Array.isArray(incomingLog?.snapshots) ? incomingLog.snapshots : [];
    const snapshotMap = new Map();
    existingSnapshots.forEach(s => {
        if (!s) return;
        const key = s.url || `${new Date(s.timestamp || Date.now()).getTime()}_${s.type}`;
        snapshotMap.set(key, s);
    });
    incomingSnapshots.forEach(s => {
        if (!s) return;
        const key = s.url || `${new Date(s.timestamp || Date.now()).getTime()}_${s.type}`;
        if (!snapshotMap.has(key)) {
            snapshotMap.set(key, s);
        }
    });
    log.snapshots = Array.from(snapshotMap.values());

    // 2. Count authoritative violations from persisted events log
    // Helper to calculate distinct incident occurrences debounced by 3 seconds
    const countDistinctIncidents = (evType, filterFn) => {
        const matching = log.events.filter(e => e.type === evType && (!filterFn || filterFn(e)));
        matching.sort((a, b) => new Date(a.timestamp || a.startTime || 0) - new Date(b.timestamp || b.startTime || 0));
        let count = 0;
        let lastTime = 0;
        for (const ev of matching) {
            const t = new Date(ev.timestamp || ev.startTime || 0).getTime();
            if (t - lastTime > 3000) {
                count++;
                lastTime = t;
            }
        }
        return count;
    };

    const eventFullscreenExits = countDistinctIncidents('FULLSCREEN_EXIT', e => {
        const d = (e.details || '').toLowerCase();
        return !d.includes('returned to fullscreen') && !d.includes('outside fullscreen') && !d.includes('reconciled with');
    });

    const eventTabSwitches = countDistinctIncidents('TAB_SWITCH', e => {
        const d = (e.details || '').toLowerCase();
        return !d.includes('returned focus') && !d.includes('during fullscreen exit transition');
    });

    const eventInspectAttempts = countDistinctIncidents('DEVTOOLS_OPENED') + countDistinctIncidents('INSPECT_ATTEMPT');
    const eventClipboardAttempts = log.events.filter(e => e.type === 'CLIPBOARD_ATTEMPT').length;

    // 3. Monotonic high-water mark:
    // Guarantees violation counters never decrease, but also reflect true authoritative counts
    const resolvedFsExits = Math.max(
        Number(rawExisting.fullscreenExits || 0),
        Number(incomingLog?.fullscreenExits || 0),
        eventFullscreenExits
    );

    const resolvedTabSwitches = Math.max(
        Number(rawExisting.tabSwitches || 0),
        Number(incomingLog?.tabSwitches || 0),
        eventTabSwitches
    );

    log.fullscreenExits = resolvedFsExits;
    log.tabSwitches = resolvedTabSwitches;
    log.inspectAttempts = Math.max(
        Number(rawExisting.inspectAttempts || 0),
        Number(incomingLog?.inspectAttempts || 0),
        eventInspectAttempts
    );
    log.clipboardAttempts = Math.max(
        Number(rawExisting.clipboardAttempts || 0),
        Number(incomingLog?.clipboardAttempts || 0),
        eventClipboardAttempts
    );
    log.webcamStatus = incomingLog?.webcamStatus || rawExisting.webcamStatus || 'active';

    return log;
}

// 2.4 Unprivileged ping & latency probe endpoint
router.get('/ping', (req, res) => {
    const now = Date.now();
    if (req.query.download === '1') {
        const size = Math.min(Number(req.query.size) || 200000, 1000000); // 200 KB default, max 1MB
        const buffer = Buffer.alloc(size, 0x41); // 'A'
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Cache-Control', 'no-store');
        return res.end(buffer);
    }
    return res.json({ success: true, serverTime: now });
});

// 2.5 System checks & probe verification gate -> returns HMAC start ticket
router.post('/precheck', requireAuth, async (req, res) => {
    let { testId, candidateId, probes } = req.body;
    if (!testId) return res.status(400).json({ success: false, error: "Test ID is required" });

    // Candidate authorization check
    if (req.user && req.user.role !== 'admin' && !req.isExamTokenAuth) {
        const userMongo = isBicsId(String(req.user.id || '')) ? toMongoId(String(req.user.id || '')) : String(req.user.id || '');
        const allowedIds = [
            String(req.user.id || ''),
            String(req.user.studentId || ''),
            String(req.user.username || ''),
            userMongo,
            toBicsId(userMongo)
        ];
        if (candidateId) {
            const candNorm = isBicsId(String(candidateId)) ? toMongoId(String(candidateId)) : String(candidateId);
            if (candNorm !== userMongo && !allowedIds.includes(String(candidateId))) {
                return res.status(403).json({ success: false, error: "Access denied: Candidate mismatch." });
            }
        }
        candidateId = req.user.id || req.user.studentId;
    }
    if (!candidateId && req.user) {
        candidateId = req.user.id || req.user.studentId;
    }
    if (!candidateId) return res.status(400).json({ success: false, error: "Candidate ID is required" });

    // Validate probe telemetry
    const multiDisplay = Boolean(probes?.display?.isExtended || (probes?.display?.screenCount && probes.display.screenCount > 1));
    const virtualCamera = Boolean(probes?.camera?.virtualCameraDetected);
    const networkFail = Boolean(probes?.network && probes.network.passed === false && probes.network.latencyMs > 2500);

    if (multiDisplay) {
        return res.status(400).json({
            success: false,
            passed: false,
            code: "MULTI_DISPLAY_DETECTED",
            error: "Multiple displays detected. Please disconnect secondary monitors before proceeding."
        });
    }

    if (virtualCamera) {
        return res.status(400).json({
            success: false,
            passed: false,
            code: "VIRTUAL_CAMERA_DETECTED",
            error: `Virtual or emulated camera detected (${probes?.camera?.flaggedDeviceName || 'OBS/Virtual'}). A physical webcam is required.`
        });
    }

    if (networkFail) {
        return res.status(400).json({
            success: false,
            passed: false,
            code: "NETWORK_LATENCY_EXCESSIVE",
            error: "Network latency exceeds 2500ms threshold. A stable connection is required."
        });
    }

    // Generate signed HMAC Start Ticket (valid for 5 minutes)
    const ticketSecret = process.env.EXAM_TICKET_SECRET || process.env.JWT_SECRET || 'bics-exam-ticket-secret-2026';
    const expiresAt = Date.now() + (5 * 60 * 1000);
    const nonce = crypto.randomBytes(12).toString('hex');
    const targetTestId = isBicsId(String(testId)) ? toMongoId(String(testId)) : String(testId);
    const targetCandId = isBicsId(String(candidateId)) ? toMongoId(String(candidateId)) : String(candidateId);
    const payload = `${targetCandId}:${targetTestId}:${expiresAt}:${nonce}`;
    const signature = crypto.createHmac('sha256', ticketSecret).update(payload).digest('hex');
    const startTicket = `${payload}:${signature}`;

    const rawClientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
                        req.headers['x-real-ip'] ||
                        req.socket.remoteAddress ||
                        req.ip || '';

    await logSystemAction(
        candidateId,
        'PRECHECK_PASSED',
        `Precheck completed successfully for test ${testId}. Generated start ticket valid for 5m. IP: ${rawClientIp}`,
        'info'
    ).catch(() => {});

    return res.json({
        success: true,
        passed: true,
        startTicket,
        expiresAt,
        serverTime: Date.now()
    });
});

// In-memory active biometric challenge registry with automatic cleanup
const activeBiometricChallenges = new Map();

// 2.6 Server-Issued Active Biometric Challenge (Phase 2)
router.get('/biometrics/challenge', requireAuth, (req, res) => {
    const CHALLENGE_ACTIONS = [
        { action: 'TURN_LEFT', instruction: 'Slowly turn your head slightly to the left' },
        { action: 'TURN_RIGHT', instruction: 'Slowly turn your head slightly to the right' },
        { action: 'BLINK_TWICE', instruction: 'Blink both eyes naturally twice' }
    ];
    const selected = CHALLENGE_ACTIONS[Math.floor(Math.random() * CHALLENGE_ACTIONS.length)];
    const challengeId = `chal_${crypto.randomBytes(8).toString('hex')}`;
    const nonce = crypto.randomBytes(8).toString('hex');
    const expiresAt = Date.now() + (2 * 60 * 1000); // 2 minutes

    activeBiometricChallenges.set(challengeId, {
        ...selected,
        nonce,
        expiresAt,
        candidateId: req.user?.id || req.user?.studentId || null
    });

    if (activeBiometricChallenges.size > 200) {
        const now = Date.now();
        for (const [id, c] of activeBiometricChallenges.entries()) {
            if (c.expiresAt < now) activeBiometricChallenges.delete(id);
        }
    }

    return res.json({
        success: true,
        challengeId,
        action: selected.action,
        instruction: selected.instruction,
        nonce,
        expiresAt
    });
});

// 2.7 Server-Side Identity Verification & Face Match (Phase 2)
router.post('/biometrics/verify', requireAuth, async (req, res) => {
    let { candidateId, testId, liveFrame, challengeId, challengeTelemetry } = req.body;
    if (!candidateId && req.user) candidateId = req.user.id || req.user.studentId;
    if (!candidateId) return res.status(400).json({ success: false, error: "Candidate ID is required." });
    if (!liveFrame) return res.status(400).json({ success: false, error: "Live capture frame is required." });

    try {
        let candidate = null;
        const mongoCandId = isBicsId(String(candidateId)) ? toMongoId(String(candidateId)) : String(candidateId);

        if (dbState.useMongo) {
            candidate = await CandidateModel.findById(mongoCandId).lean();
            if (!candidate && String(candidateId).length < 24) {
                candidate = await CandidateModel.findOne({ studentId: String(candidateId) }).lean();
            }
        } else {
            const db = getJSONData();
            db.candidates = db.candidates || [];
            candidate = db.candidates.find(c => c.id === candidateId || c._id === candidateId || c.studentId === candidateId);
        }

        const referencePhotoUrl = candidate?.referencePhotoUrl || candidate?.registrationData?.photoUrl || '';

        // Validate active challenge if provided
        let livenessPassed = false;
        if (challengeId && activeBiometricChallenges.has(challengeId)) {
            const challenge = activeBiometricChallenges.get(challengeId);
            if (Date.now() <= challenge.expiresAt && challengeTelemetry?.actionCompleted) {
                livenessPassed = true;
            }
            activeBiometricChallenges.delete(challengeId);
        } else if (challengeTelemetry?.actionCompleted) {
            livenessPassed = true;
        }

        // Run identity match comparison
        const matchResult = await compareFaceBiometrics(liveFrame, referencePhotoUrl);

        // Generate signed HMAC biometric token
        const ticketSecret = process.env.EXAM_TICKET_SECRET || process.env.JWT_SECRET || 'bics-exam-ticket-secret-2026';
        const expiresAt = Date.now() + (10 * 60 * 1000); // 10 minutes
        const nonce = crypto.randomBytes(8).toString('hex');
        const payload = `${candidateId}:${testId || 'general'}:${matchResult.decision}:${matchResult.similarityScore}:${expiresAt}:${nonce}`;
        const signature = crypto.createHmac('sha256', ticketSecret).update(payload).digest('hex');
        const biometricToken = `${payload}:${signature}`;

        await logSystemAction(
            candidateId,
            'BIOMETRIC_VERIFIED',
            `Biometric face check: ${matchResult.decision} (Similarity: ${Math.round(matchResult.similarityScore * 100)}%, Liveness: ${livenessPassed ? 'PASSED' : 'MANUAL'}). Details: ${matchResult.details}`,
            matchResult.decision === 'retry-review' ? 'warning' : 'info'
        ).catch(() => {});

        return res.json({
            success: true,
            similarityScore: matchResult.similarityScore,
            decision: matchResult.decision,
            reviewNeeded: matchResult.reviewNeeded,
            isEnrolled: matchResult.isEnrolled,
            livenessPassed,
            details: matchResult.details,
            biometricToken,
            serverTime: Date.now()
        });
    } catch (err) {
        console.error("Biometric verification error:", err);
        return res.status(500).json({ success: false, error: "Failed to evaluate biometric identity: " + err.message });
    }
});

// 2.8 In-Exam Continuity Identity Verification (Phase 3.1)
router.post('/biometrics/continuity/:submissionId', requireAuth, async (req, res) => {
    const { submissionId } = req.params;
    const { liveFrame } = req.body;
    if (!liveFrame) return res.status(400).json({ success: false, error: "Live frame is required." });

    const mongoSubId = isBicsId(String(submissionId)) ? toMongoId(String(submissionId)) : String(submissionId);

    try {
        let submission = null;
        let db = null;
        if (dbState.useMongo) {
            submission = await TestSubmissionModel.findById(mongoSubId);
            if (!submission && mongoSubId !== submissionId) {
                submission = await TestSubmissionModel.findById(submissionId);
            }
        } else {
            db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submission = db.testSubmissions.find(s => s.id === mongoSubId || s._id === mongoSubId || (isBicsId(submissionId) && toBicsId(s._id || s.id) === submissionId));
        }

        if (!submission) return res.status(404).json({ success: false, error: "Submission not found." });

        const verifiedPhoto = submission.biometricResult?.verifiedPhotoUrl || submission.baselinePhotoUrl || '';
        if (!verifiedPhoto) {
            return res.json({ success: true, verified: true, message: "No baseline photo available for comparison." });
        }

        const matchResult = await compareFaceBiometrics(liveFrame, verifiedPhoto);
        const isMismatch = matchResult.similarityScore < 0.50;

        if (isMismatch) {
            const eventObj = {
                timestamp: new Date(),
                type: 'FACE_MISMATCH',
                details: `Continuous identity check flagged low facial similarity (${Math.round(matchResult.similarityScore * 100)}%).`
            };

            if (dbState.useMongo) {
                await TestSubmissionModel.findByIdAndUpdate(mongoSubId, {
                    $push: { 'proctoringLog.events': eventObj },
                    $set: { 'biometricResult.continuityFlagged': true }
                });
            } else {
                submission.proctoringLog = submission.proctoringLog || {};
                submission.proctoringLog.events = submission.proctoringLog.events || [];
                submission.proctoringLog.events.push(eventObj);
                saveJSONData(db);
            }

            await logSystemAction(
                submission.candidateName || submission.studentId || 'Candidate',
                'PROCTOR_VIOLATION',
                `Continuous facial identity deviation detected for submission ${submissionId}: ${Math.round(matchResult.similarityScore * 100)}% match.`,
                'warning'
            ).catch(() => {});
        }

        return res.json({
            success: true,
            similarityScore: matchResult.similarityScore,
            decision: matchResult.decision,
            mismatch: isMismatch
        });
    } catch (err) {
        console.warn("[CONTINUITY_CHECK]: Identity comparison notice:", err.message);
        return res.json({ success: true, verified: true, error: err.message });
    }
});

// 3. Get specific test for exam view (Strips answers & hidden test cases)
router.get('/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
        let test = null;
        if (dbState.useMongo) {
            test = await TestConfigModel.findById(id).lean();
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            test = db.tests.find(t => t.id === id || t._id === id);
        }

        if (!test) return res.status(404).json({ error: "Test not found" });

        const qSanitized = (test.questions || []).map(q => sanitizeQuestionForCandidate(q));

        return res.json({ ...test, questions: qSanitized });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 4. Initialize test session
router.post('/start/:id', requireAuth, async (req, res) => {
    let { id } = req.params;
    let { candidateId, candidateName, studentId, securityMetadata, baselinePhotoUrl } = req.body;

    const mongoTestId = isBicsId(String(id)) ? toMongoId(String(id)) : String(id);
    const mongoCandId = candidateId && isBicsId(String(candidateId)) ? toMongoId(String(candidateId)) : (candidateId ? String(candidateId) : null);

    // Verify candidate identity from authorization token if present
    if (req.user && req.user.role !== 'admin' && !req.isExamTokenAuth) {
        const userMongo = isBicsId(String(req.user.id || '')) ? toMongoId(String(req.user.id || '')) : String(req.user.id || '');
        const allowedIds = [
            String(req.user.id || ''),
            String(req.user.studentId || ''),
            String(req.user.username || ''),
            userMongo,
            toBicsId(userMongo)
        ];
        if (candidateId) {
            const candNorm = isBicsId(String(candidateId)) ? toMongoId(String(candidateId)) : String(candidateId);
            if (candNorm !== userMongo && !allowedIds.includes(String(candidateId))) {
                return res.status(403).json({ error: "Access denied: You cannot start an examination for another candidate." });
            }
        }
        candidateId = req.user.id || req.user.studentId;
    }

    if (!candidateId && req.user) {
        candidateId = req.user.id || req.user.studentId;
    }
    if (!candidateId) return res.status(400).json({ error: "Candidate ID is required" });

    // Enforce HMAC-signed Start Ticket (Phase 1 Gate)
    const startTicket = req.headers['x-exam-start-ticket'] || req.body.startTicket;
    const precheckEnforced = process.env.PRECHECK_ENFORCE === 'true';

    if (startTicket) {
        const parts = String(startTicket).split(':');
        if (parts.length !== 5) {
            return res.status(403).json({ error: "Access denied: Invalid start ticket structure.", code: "PRECHECK_TICKET_INVALID" });
        }
        const [tCandId, tTestId, tExpiresAt, tNonce, tSignature] = parts;
        const ticketSecret = process.env.EXAM_TICKET_SECRET || process.env.JWT_SECRET || 'bics-exam-ticket-secret-2026';
        const expectedSig = crypto.createHmac('sha256', ticketSecret).update(`${tCandId}:${tTestId}:${tExpiresAt}:${tNonce}`).digest('hex');
        if (expectedSig !== tSignature) {
            return res.status(403).json({ error: "Access denied: Cryptographic signature mismatch on start ticket.", code: "PRECHECK_TICKET_FORGERY" });
        }
        if (Date.now() > Number(tExpiresAt)) {
            return res.status(403).json({ error: "Access denied: Start ticket has expired. Please re-run system checks.", code: "PRECHECK_TICKET_EXPIRED" });
        }
        const normCand = isBicsId(String(candidateId)) ? toMongoId(String(candidateId)) : String(candidateId);
        const normTest = isBicsId(String(id)) ? toMongoId(String(id)) : String(id);
        if (tCandId !== normCand && tCandId !== String(candidateId)) {
            return res.status(403).json({ error: "Access denied: Start ticket is bound to a different candidate.", code: "PRECHECK_CANDIDATE_MISMATCH" });
        }
        if (tTestId !== normTest && tTestId !== String(id)) {
            return res.status(403).json({ error: "Access denied: Start ticket is bound to a different examination.", code: "PRECHECK_TEST_MISMATCH" });
        }
    } else if (precheckEnforced) {
        return res.status(403).json({
            error: "Access denied: Missing precheck start ticket. Please complete system and compatibility checks before starting the exam.",
            code: "PRECHECK_TICKET_MISSING"
        });
    } else {
        console.warn(`[PRECHECK_SHADOW]: Candidate ${candidateId} initiated exam ${id} without a verified start ticket.`);
    }

    try {
        let test = null;
        if (dbState.useMongo) {
            test = await TestConfigModel.findById(mongoTestId);
            if (!test && mongoTestId !== id) {
                test = await TestConfigModel.findById(id);
            }
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            test = db.tests.find(t => t.id === id || t._id === id || t.id === mongoTestId || t._id === mongoTestId);
        }

        if (!test) return res.status(404).json({ error: "Test configuration not found" });

        // 1. Verify Test Published State (Exam Integrity)
        if (test.isPublished === false) {
            return res.status(403).json({ error: "Access denied: This examination is currently unpublished or inactive." });
        }

        // 2. Verify Test Scheduling Window (Exam Integrity)
        const nowTime = Date.now();
        if (test.startDate && nowTime < new Date(test.startDate).getTime()) {
            return res.status(403).json({ 
                error: `The examination window has not opened yet. Starts at: ${new Date(test.startDate).toLocaleString('en-IN')}` 
            });
        }
        if (test.endDate && nowTime > new Date(test.endDate).getTime()) {
            return res.status(403).json({ 
                error: `The examination window has expired. Closed at: ${new Date(test.endDate).toLocaleString('en-IN')}` 
            });
        }

        let submission = null;

        // Resolve authoritative server-side client IP & network telemetry
        const rawClientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
                            req.headers['x-real-ip'] ||
                            req.socket.remoteAddress ||
                            req.ip ||
                            '';
        const cleanIp = rawClientIp.replace(/^::ffff:/, '');

        let networkMetadata = (securityMetadata && securityMetadata.network) ? { ...securityMetadata.network } : {};
        try {
            const isPrivateIp = !cleanIp || cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp.startsWith('192.168.') || cleanIp.startsWith('10.') || cleanIp.startsWith('172.16.');
            const targetQueryIp = isPrivateIp ? '' : cleanIp;
            const geoRes = await fetch(`http://ip-api.com/json/${targetQueryIp}?fields=status,message,country,regionName,city,zip,lat,lon,timezone,isp,org,as,proxy,hosting,query`, {
                signal: AbortSignal.timeout(2500)
            });
            if (geoRes.ok) {
                const geoData = await geoRes.json();
                if (geoData.status === 'success') {
                    networkMetadata = {
                        publicIp: geoData.query || cleanIp,
                        country: geoData.country || 'Unknown',
                        region: geoData.regionName || 'Unknown',
                        city: geoData.city || 'Unknown',
                        zip: geoData.zip || '',
                        latitude: geoData.lat || null,
                        longitude: geoData.lon || null,
                        timezone: geoData.timezone || 'Asia/Kolkata',
                        isp: geoData.isp || 'Unknown',
                        organization: geoData.org || 'Unknown',
                        asNumber: geoData.as || 'Unknown',
                        isProxyOrVpn: Boolean(geoData.proxy),
                        isDatacenterHosting: Boolean(geoData.hosting),
                        resolvedAt: new Date().toISOString(),
                        verifiedByServer: true
                    };
                }
            }
        } catch (geoErr) {
            console.warn("[SECURITY_GEOIP]: Server geo resolution notice:", geoErr.message);
        }

        const enrichedSecurityMetadata = {
            ...(securityMetadata || {}),
            ip: networkMetadata.publicIp || securityMetadata?.ip || cleanIp,
            network: networkMetadata,
            startTicket: startTicket || securityMetadata?.startTicket || null
        };

        const incBiometrics = req.body.biometricResult || {};
        const submissionBiometrics = {
            similarityScore: typeof incBiometrics.similarityScore === 'number' ? incBiometrics.similarityScore : null,
            decision: incBiometrics.decision || 'not-evaluated',
            reviewNeeded: Boolean(incBiometrics.reviewNeeded),
            livenessPassed: Boolean(incBiometrics.livenessPassed),
            livenessScore: incBiometrics.livenessScore || null,
            challengeId: incBiometrics.challengeId || '',
            challengeType: incBiometrics.challengeType || '',
            voiceStatus: incBiometrics.voiceStatus || 'passed',
            referencePhotoUrl: incBiometrics.referencePhotoUrl || '',
            verifiedPhotoUrl: baselinePhotoUrl || '',
            evaluatedAt: new Date()
        };

        if (dbState.useMongo) {
            const targetCandId = mongoCandId || candidateId;
            const targetTestId = mongoTestId || id;
            const candFilter = buildCandidateQueryFilter(targetCandId);
            const queryTestId = mongoose.Types.ObjectId.isValid(targetTestId) ? new mongoose.Types.ObjectId(targetTestId) : targetTestId;
            if (candFilter) {
                submission = await TestSubmissionModel.findOne({ ...candFilter, testId: queryTestId });
            }
            if (submission) {
                return res.status(400).json({ error: "You have already attempted or completed this examination. Re-attempts are not permitted." });
            }
            submission = new TestSubmissionModel({
                candidateId: mongoose.Types.ObjectId.isValid(targetCandId) ? new mongoose.Types.ObjectId(targetCandId) : undefined,
                candidateName,
                studentId,
                testId: targetTestId,
                testTitle: test.title,
                startedAt: new Date(),
                lastHeartbeatAt: new Date(),
                status: 'started',
                baselinePhotoUrl: baselinePhotoUrl || '',
                biometricResult: submissionBiometrics,
                securityMetadata: enrichedSecurityMetadata,
                proctoringLog: { fullscreenExits: 0, tabSwitches: 0, inspectAttempts: 0, clipboardAttempts: 0, webcamStatus: 'active', events: [], snapshots: [] },
                answers: []
            });
            await submission.save();
            if (req.body.token) {
                await TestTokenModel.deleteOne({ token: req.body.token }).catch(() => {});
            }
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submission = db.testSubmissions.find(s => 
                s.candidateId && s.testId &&
                s.candidateId.toString() === candidateId.toString() && 
                s.testId.toString() === id.toString()
            );
            if (submission) {
                return res.status(400).json({ error: "You have already attempted or completed this examination. Re-attempts are not permitted." });
            }
            submission = {
                id: Date.now().toString(),
                _id: Date.now().toString(),
                candidateId,
                candidateName,
                studentId,
                testId: id,
                testTitle: test.title,
                startedAt: new Date(),
                lastHeartbeatAt: new Date(),
                status: 'started',
                baselinePhotoUrl: baselinePhotoUrl || '',
                biometricResult: submissionBiometrics,
                securityMetadata: enrichedSecurityMetadata,
                proctoringLog: { fullscreenExits: 0, tabSwitches: 0, inspectAttempts: 0, clipboardAttempts: 0, webcamStatus: 'active', events: [], snapshots: [] },
                answers: []
            };
            db.testSubmissions.push(submission);
            saveJSONData(db);
        }

        const subPayload = submission.toObject ? submission.toObject() : { ...submission };
        subPayload.bicsId = toBicsId(submission._id || submission.id);

        const now = new Date();
        const durationMin = Number(test.duration || 60);
        const startedAtMs = new Date(submission.startedAt || now).getTime();
        const expiresAtMs = startedAtMs + (durationMin * 60 * 1000);
        const remainingSeconds = Math.max(0, Math.round((expiresAtMs - now.getTime()) / 1000));

        await logSystemAction(candidateName || studentId || 'Candidate', 'TEST_STARTED', `Candidate started the examination "${test.title}" (${id})`, 'info');
        return res.json({ 
            success: true, 
            submission: subPayload,
            serverTime: now.getTime(),
            startedAt: startedAtMs,
            expiresAt: expiresAtMs,
            remainingSeconds: remainingSeconds,
            reaperGraceSeconds: 70
        });
    } catch (e) {
        console.error(e);
        if (e.code === 11000 || (e.name === 'MongoServerError' && e.code === 11000)) {
            return res.status(400).json({ error: "You have already attempted or started this examination. Concurrent attempts are not permitted." });
        }
        await logSystemAction('system', 'TECHNICAL_ERROR', `Failed to initialize test session for candidate ID ${candidateId}: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    }
});

// 4.1 Candidate Liveness Heartbeat for Server Dead-Man's Switch (Item 2.4)
router.post('/heartbeat/:submissionId', async (req, res) => {
    const { submissionId } = req.params;
    if (!submissionId) return res.status(400).json({ error: "Submission ID is required" });
    const targetSubId = isBicsId(submissionId) ? (toMongoId(submissionId) || submissionId) : submissionId;

    try {
        const now = new Date();
        if (dbState.useMongo) {
            const sub = await TestSubmissionModel.findByIdAndUpdate(
                targetSubId,
                { $set: { lastHeartbeatAt: now } },
                { new: true, select: 'status startedAt testId' }
            );
            if (!sub) return res.status(404).json({ error: "Submission session not found" });

            let expiresAtMs = null;
            let remainingSeconds = null;
            if (sub.testId && sub.startedAt) {
                const testDoc = await TestConfigModel.findById(sub.testId).select('duration').lean();
                const durMin = Number(testDoc?.duration || 60);
                const startedAtMs = new Date(sub.startedAt).getTime();
                expiresAtMs = startedAtMs + (durMin * 60 * 1000);
                remainingSeconds = Math.max(0, Math.round((expiresAtMs - now.getTime()) / 1000));
            }

            return res.json({ 
                success: true, 
                status: sub.status, 
                serverTime: now.getTime(),
                startedAt: sub.startedAt ? new Date(sub.startedAt).getTime() : null,
                expiresAt: expiresAtMs,
                remainingSeconds: remainingSeconds,
                reaperGraceSeconds: 70
            });
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            const sub = db.testSubmissions.find(s => String(s.id || s._id) === String(targetSubId) || String(s.id || s._id) === String(submissionId));
            if (!sub) return res.status(404).json({ error: "Submission session not found" });
            sub.lastHeartbeatAt = now;
            saveJSONData(db);

            let expiresAtMs = null;
            let remainingSeconds = null;
            if (sub.testId && sub.startedAt) {
                db.tests = db.tests || [];
                const testDoc = db.tests.find(t => String(t.id || t._id) === String(sub.testId));
                const durMin = Number(testDoc?.duration || 60);
                const startedAtMs = new Date(sub.startedAt).getTime();
                expiresAtMs = startedAtMs + (durMin * 60 * 1000);
                remainingSeconds = Math.max(0, Math.round((expiresAtMs - now.getTime()) / 1000));
            }

            return res.json({ 
                success: true, 
                status: sub.status, 
                serverTime: now.getTime(),
                startedAt: sub.startedAt ? new Date(sub.startedAt).getTime() : null,
                expiresAt: expiresAtMs,
                remainingSeconds: remainingSeconds,
                reaperGraceSeconds: 70
            });
        }
    } catch (e) {
        console.error("Heartbeat error:", e.message);
        return res.status(500).json({ error: "Failed to record heartbeat" });
    }
});

// 4.1b Candidate Active Draft Autosave (Segregated from Final /submit)
const handleDraftSave = async (req, res) => {
    const { submissionId } = req.params;
    const { answers, proctoringLog } = req.body;
    if (!submissionId) return res.status(400).json({ error: "Submission ID is required" });
    const targetSubId = isBicsId(submissionId) ? (toMongoId(submissionId) || submissionId) : submissionId;

    try {
        const now = new Date();
        if (dbState.useMongo) {
            const submission = await TestSubmissionModel.findById(targetSubId);
            if (!submission) return res.status(404).json({ error: "Submission session not found" });

            // Hard Immutability: If exam is reaped or finalized, reject all draft updates with 409
            if (['submitted', 'auto-submitted', 'evaluated'].includes(submission.status)) {
                return res.status(409).json({
                    error: `Exam attempt is permanently closed (Status: ${submission.status}). Draft updates are prohibited.`,
                    status: submission.status,
                    isFinalized: true
                });
            }

            if (submission.status !== 'started') {
                return res.status(409).json({
                    error: "Exam is not currently in started state.",
                    status: submission.status
                });
            }

            // Authoritative input sanitization: strip client score tampering
            if (Array.isArray(answers)) {
                submission.answers = answers.map(a => {
                    const cleanAns = { ...a };
                    delete cleanAns.score;
                    delete cleanAns.isManuallyGraded;
                    delete cleanAns.testCaseResults;
                    delete cleanAns.isBonusAwarded;
                    delete cleanAns.isObjectionResolved;
                    return cleanAns;
                });
            }

            if (proctoringLog) {
                submission.proctoringLog = reconcileProctoringLog(submission.proctoringLog || {}, proctoringLog);
            }

            submission.lastHeartbeatAt = now;
            await submission.save();

            let expiresAtMs = null;
            let remainingSeconds = null;
            if (submission.testId && submission.startedAt) {
                const testDoc = await TestConfigModel.findById(submission.testId).select('duration').lean();
                const durMin = Number(testDoc?.duration || 60);
                const startedAtMs = new Date(submission.startedAt).getTime();
                expiresAtMs = startedAtMs + (durMin * 60 * 1000);
                remainingSeconds = Math.max(0, Math.round((expiresAtMs - now.getTime()) / 1000));
            }

            return res.json({ 
                success: true, 
                savedAt: submission.lastHeartbeatAt, 
                answersCount: submission.answers?.length || 0,
                serverTime: now.getTime(),
                expiresAt: expiresAtMs,
                remainingSeconds: remainingSeconds,
                reaperGraceSeconds: 70
            });
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            const submission = db.testSubmissions.find(s => String(s.id || s._id) === String(targetSubId) || String(s.id || s._id) === String(submissionId));
            if (!submission) return res.status(404).json({ error: "Submission session not found" });

            if (['submitted', 'auto-submitted', 'evaluated'].includes(submission.status)) {
                return res.status(409).json({
                    error: `Exam attempt is permanently closed (Status: ${submission.status}). Draft updates are prohibited.`,
                    status: submission.status,
                    isFinalized: true
                });
            }

            if (Array.isArray(answers)) {
                submission.answers = answers.map(a => {
                    const cleanAns = { ...a };
                    delete cleanAns.score;
                    delete cleanAns.isManuallyGraded;
                    delete cleanAns.testCaseResults;
                    delete cleanAns.isBonusAwarded;
                    delete cleanAns.isObjectionResolved;
                    return cleanAns;
                });
            }

            if (proctoringLog) {
                submission.proctoringLog = reconcileProctoringLog(submission.proctoringLog || {}, proctoringLog);
            }

            submission.lastHeartbeatAt = now;
            saveJSONData(db);

            let expiresAtMs = null;
            let remainingSeconds = null;
            if (submission.testId && submission.startedAt) {
                db.tests = db.tests || [];
                const testDoc = db.tests.find(t => String(t.id || t._id) === String(submission.testId));
                const durMin = Number(testDoc?.duration || 60);
                const startedAtMs = new Date(submission.startedAt).getTime();
                expiresAtMs = startedAtMs + (durMin * 60 * 1000);
                remainingSeconds = Math.max(0, Math.round((expiresAtMs - now.getTime()) / 1000));
            }

            return res.json({ 
                success: true, 
                savedAt: submission.lastHeartbeatAt,
                serverTime: now.getTime(),
                expiresAt: expiresAtMs,
                remainingSeconds: remainingSeconds,
                reaperGraceSeconds: 70
            });
        }
    } catch (e) {
        console.error("Draft save error:", e.message);
        return res.status(500).json({ error: "Failed to persist draft answers" });
    }
};

router.put('/draft/:submissionId', handleDraftSave);
router.post('/draft/:submissionId', handleDraftSave);

// 4.2 Browser Beacon on Disconnect / Tab Close (Item 2.4 & Issue B3)
router.post('/beacon-disconnect', express.json({ type: ['application/json', 'text/plain', '*/*'] }), async (req, res) => {
    let payload = req.body;
    if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch (_) {}
    }
    const { submissionId, answers, proctoringLog, authToken } = payload || {};
    if (!submissionId) return res.status(400).json({ error: "Submission ID required" });
    const targetSubId = isBicsId(submissionId) ? (toMongoId(submissionId) || submissionId) : submissionId;

    // Verify token if provided or in header
    let authUser = null;
    const rawToken = authToken || (req.headers.authorization ? req.headers.authorization.replace(/^Bearer\s+/i, '') : null);
    if (rawToken) {
        try {
            authUser = jwt.verify(rawToken, JWT_SECRET);
        } catch (_) {}
    }

    try {
        if (dbState.useMongo) {
            const submission = await TestSubmissionModel.findById(targetSubId);
            if (!submission) return res.status(404).json({ error: "Submission not found" });

            if (authUser && authUser.role !== 'admin' && String(submission.studentId) !== String(authUser.studentId) && String(submission.candidateId) !== String(authUser.id)) {
                return res.status(403).json({ error: "Access denied: Unauthorized to submit disconnect beacon for another candidate." });
            }

            if (submission.status === 'started') {
                submission.status = 'auto-submitted';
                submission.submittedAt = new Date();
                submission.hasEirfFlag = true;
                if (!submission.eirfStatus || submission.eirfStatus === 'none') {
                    submission.eirfStatus = 'pending';
                }
                if (answers && Array.isArray(answers) && answers.length > 0) {
                    submission.answers = answers;
                }
                if (proctoringLog) {
                    submission.proctoringLog = reconcileProctoringLog(submission.proctoringLog || {}, proctoringLog);
                }
                if (!submission.proctoringLog.events) submission.proctoringLog.events = [];
                submission.proctoringLog.events.push({
                    timestamp: new Date(),
                    type: 'DISCONNECT_BEACON',
                    isBeaconDisconnect: true,
                    details: 'Candidate closed exam browser tab/window. Finalized via navigator.sendBeacon.'
                });

                const test = await TestConfigModel.findById(submission.testId);
                if (test) {
                    recalculateMCQScore(submission, test);
                    calculateCodingScoreFast(submission, test);
                }

                if (!submission.eirfNoticeEmailSent && submission.candidateEmail) {
                    try {
                        await sendEirfNoticeEmail(
                            submission.candidateEmail,
                            submission.candidateName || 'Candidate',
                            submission.testTitle || 'BICS Examination',
                            'Exam session auto-submitted: Browser tab/window closed by candidate.',
                            String(submission._id || submission.id)
                        );
                        submission.eirfNoticeEmailSent = true;
                    } catch (mailErr) {
                        console.error("[BEACON DISCONNECT] Failed to send EIRF notice email:", mailErr.message);
                    }
                }

                await submission.save();
                console.log(`[BEACON FINALIZED] Submission ${submissionId} auto-submitted via browser beacon.`);
            }
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            const sub = db.testSubmissions.find(s => String(s.id || s._id) === String(submissionId));
            if (sub && sub.status === 'started') {
                sub.status = 'auto-submitted';
                sub.submittedAt = new Date();
                if (answers) sub.answers = answers;
                saveJSONData(db);
            }
        }
        return res.status(200).json({ success: true });
    } catch (err) {
        console.error("Beacon disconnect handling error:", err.message);
        return res.status(500).json({ error: err.message });
    }
});

// 5. Generate Exam Token
router.post('/generate-token', requireAuth, async (req, res) => {
    let { candidateId, testId } = req.body;

    if (req.user && req.user.role !== 'admin') {
        const userMongo = isBicsId(String(req.user.id || '')) ? toMongoId(String(req.user.id || '')) : String(req.user.id || '');
        const allowedIds = [
            String(req.user.id || ''),
            String(req.user.studentId || ''),
            String(req.user.username || ''),
            userMongo,
            toBicsId(userMongo)
        ];
        if (candidateId) {
            const candNorm = isBicsId(String(candidateId)) ? toMongoId(String(candidateId)) : String(candidateId);
            if (candNorm !== userMongo && !allowedIds.includes(String(candidateId))) {
                return res.status(403).json({ error: "Access denied: You cannot generate an exam token for another candidate." });
            }
        }
        candidateId = req.user.id || req.user.studentId;
    }

    if (!candidateId || !testId) {
        return res.status(400).json({ error: "Candidate ID and Test ID are required." });
    }
    try {
        let submission = null;
        if (dbState.useMongo) {
            const candFilter = buildCandidateQueryFilter(candidateId);
            const queryTestId = mongoose.Types.ObjectId.isValid(testId) ? new mongoose.Types.ObjectId(testId) : testId;
            if (candFilter) {
                submission = await TestSubmissionModel.findOne({ ...candFilter, testId: queryTestId });
            }
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submission = db.testSubmissions.find(s => s.candidateId === candidateId && s.testId === testId);
        }
        if (submission) {
            return res.status(400).json({ error: "You have already started or completed this examination. Re-attempts are not permitted." });
        }

        const tokenStr = crypto.randomBytes(24).toString('hex');

        if (dbState.useMongo) {
            const newToken = new TestTokenModel({
                token: tokenStr,
                candidateId,
                testId
            });
            await newToken.save();
        } else {
            const db = getJSONData();
            db.tokens = db.tokens || [];
            db.tokens = db.tokens.filter(t => (Date.now() - new Date(t.createdAt).getTime()) < 120000);
            db.tokens.push({
                token: tokenStr,
                candidateId,
                testId,
                createdAt: new Date()
            });
            saveJSONData(db);
        }

        return res.json({ success: true, token: tokenStr });
    } catch (err) {
        console.error("Token generation failed:", err);
        return res.status(500).json({ error: "Failed to generate exam access token." });
    }
});

// 6. Verify Exam Token
router.post('/verify-token', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Token is required." });

    try {
        let tokenDoc = null;
        if (dbState.useMongo) {
            tokenDoc = await TestTokenModel.findOne({ token });
        } else {
            const db = getJSONData();
            db.tokens = db.tokens || [];
            tokenDoc = db.tokens.find(t => t.token === token && (Date.now() - new Date(t.createdAt).getTime()) < 120000);
        }

        if (!tokenDoc) {
            return res.status(401).json({ error: "Invalid or expired exam token. Please login through the main portal dashboard again." });
        }

        let student = null;
        let test = null;
        if (dbState.useMongo) {
            const studentIdNorm = isBicsId(String(tokenDoc.candidateId)) ? toMongoId(String(tokenDoc.candidateId)) : tokenDoc.candidateId;
            const testIdNorm = isBicsId(String(tokenDoc.testId)) ? toMongoId(String(tokenDoc.testId)) : tokenDoc.testId;
            student = await CandidateModel.findById(studentIdNorm);
            test = await TestConfigModel.findById(testIdNorm);
        } else {
            const db = getJSONData();
            student = (db.candidates || []).find(c => c.id === tokenDoc.candidateId || c._id === tokenDoc.candidateId);
            db.tests = db.tests || [];
            test = db.tests.find(t => t.id === tokenDoc.testId || t._id === tokenDoc.testId);
        }

        if (!student || !test) {
            return res.status(404).json({ error: "Student or Test configuration associated with this token not found." });
        }

        const { generateToken } = require('../utils/jwt');
        const authToken = generateToken({
            id: String(student._id || student.id),
            role: 'candidate',
            studentId: student.studentId,
            username: student.username || student.studentId
        });

        const qSanitized = (test.questions || []).map(q => sanitizeQuestionForCandidate(q));

        let submission = null;
        if (dbState.useMongo) {
            submission = await TestSubmissionModel.findOne({ candidateId: student._id, testId: test._id });
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            const studId = student.id || student._id;
            const tId = test.id || test._id;
            submission = db.testSubmissions.find(s => s.candidateId === studId && s.testId === tId);
        }

        if (submission) {
            return res.status(400).json({ error: "You have already attempted or completed this examination. Re-attempts are not permitted." });
        }

        let sysConfig = null;
        try {
            if (dbState.useMongo) {
                sysConfig = await ConfigModel.findOne().lean();
            } else {
                sysConfig = getJSONData().config;
            }
        } catch (_) {}
        const devModeActive = !!sysConfig?.devModeActive;

        return res.json({
            success: true,
            token: authToken,
            authToken: authToken,
            devModeActive,
            candidate: {
                id: student._id || student.id,
                name: student.name,
                studentId: student.studentId,
                email: student.registrationData?.collegeEmail || student.registrationData?.personalEmail || student.username || "candidate@college.edu",
                photoUrl: student.registrationData?.photoUrl || "/public/uploads/default-photo.png"
            },
            test: {
                id: test._id || test.id,
                title: test.title,
                duration: test.duration,
                marks: test.marks,
                instructions: test.instructions,
                questions: qSanitized
            },
            submission: submission ? (() => {
                const sp = submission.toObject ? submission.toObject() : { ...submission };
                sp.bicsId = toBicsId(submission._id || submission.id);
                return sp;
            })() : null
        });
    } catch (err) {
        console.error("Token verification failed:", err);
        return res.status(500).json({ error: "Internal server error during exam token verification." });
    }
});

// 7. Submit exam answers
router.post('/submit', async (req, res) => {
    const { submissionId, answers, proctoringLog, status } = req.body;

    if (!submissionId) return res.status(400).json({ error: "Submission ID is required" });
    const targetSubId = isBicsId(submissionId) ? (toMongoId(submissionId) || submissionId) : submissionId;

    const isFinalSubmission = status !== 'started';

    if (isFinalSubmission) {
        if (activeSubmissionsProcessing.has(submissionId) || activeSubmissionsProcessing.has(targetSubId)) {
            return res.status(429).json({ error: "Submission is already being processed. Please wait." });
        }
        activeSubmissionsProcessing.add(submissionId);
        activeSubmissionsProcessing.add(targetSubId);
    }

    try {
        let submission = null;
        if (dbState.useMongo) {
            let retries = 5;
            while (retries > 0) {
                try {
                    submission = await TestSubmissionModel.findById(targetSubId);
                    if (!submission) return res.status(404).json({ error: "Submission not found" });

                    // Hard Immutability: If exam is already finalized or reaped, strictly reject answer tampering with 409 Conflict
                    if (['submitted', 'auto-submitted', 'evaluated'].includes(submission.status)) {
                        const earlyPayload = submission.toObject ? submission.toObject() : { ...submission };
                        earlyPayload.bicsId = toBicsId(submission._id || submission.id);
                        return res.status(409).json({ 
                            error: `Exam attempt is permanently closed (Status: ${submission.status}). Answers are frozen and cannot be modified.`,
                            status: submission.status,
                            isFinalized: true,
                            submission: earlyPayload 
                        });
                    }

                    if (status === 'started') {
                        return res.status(400).json({
                            error: "Draft autosaves must use dedicated draft endpoint: PUT /api/tests/draft/:submissionId."
                        });
                    }

                    // Authoritative input sanitization: strip client-supplied scores, test results, or manual grade flags
                    if (Array.isArray(answers)) {
                        submission.answers = answers.map(a => {
                            const cleanAns = { ...a };
                            delete cleanAns.score;
                            delete cleanAns.isManuallyGraded;
                            delete cleanAns.testCaseResults;
                            delete cleanAns.isBonusAwarded;
                            delete cleanAns.isObjectionResolved;
                            return cleanAns;
                        });
                    }

                    if (proctoringLog) {
                        submission.proctoringLog = reconcileProctoringLog(submission.proctoringLog || {}, proctoringLog);
                    }

                    const ALLOWED_STATUSES = ['started', 'submitted', 'auto-submitted'];
                    if (submission.status === 'started' || isFinalSubmission) {
                        submission.status = ALLOWED_STATUSES.includes(status) ? status : 'submitted';
                    }
                    if (status !== 'started') {
                        submission.submittedAt = new Date();
                    }
                    submission.lastHeartbeatAt = new Date();

                    const test = await TestConfigModel.findById(submission.testId);
                    if (test) {
                        // Authoritative server-side wall-clock deadline validation (Item 2.3)
                        if (submission.startedAt && isFinalSubmission) {
                            const elapsedMs = Date.now() - new Date(submission.startedAt).getTime();
                            const allowedDurationMs = (test.duration || 60) * 60 * 1000;
                            const GRACE_PERIOD_MS = 120 * 1000; // 2 minutes network buffer
                            if (elapsedMs > allowedDurationMs + GRACE_PERIOD_MS) {
                                const overtimeSec = Math.round((elapsedMs - allowedDurationMs) / 1000);
                                console.warn(`[EXAM DEADLINE EXCEEDED] Submission ${submissionId} submitted ${overtimeSec}s past deadline. Overriding status to auto-submitted.`);
                                submission.status = 'auto-submitted';
                                if (!submission.proctoringLog) submission.proctoringLog = {};
                                if (!submission.proctoringLog.events) submission.proctoringLog.events = [];
                                submission.proctoringLog.events.push({
                                    timestamp: new Date(),
                                    type: 'OVERTIME_SUBMISSION',
                                    details: `Submission received ${overtimeSec}s after allowed duration deadline. Auto-finalized by server.`
                                });
                            }
                        }

                        recalculateMCQScore(submission, test);
                        calculateCodingScoreFast(submission, test);
                    } else {
                        submission.evaluation = {
                            mcqScore: 0,
                            codingScore: 0,
                            feedback: '',
                            evaluatedAt: null
                        };
                    }

                    const sStudId = submission.studentId || 'Candidate';

                    // 1. Authoritative EIRF incident calculation (processed before atomic save to eliminate duplicate DB roundtrips)
                    if (isFinalSubmission) {
                        const fsExits = submission.proctoringLog?.fullscreenExits || 0;
                        const tabSwitches = submission.proctoringLog?.tabSwitches || 0;
                        const inspectAttempts = submission.proctoringLog?.inspectAttempts || 0;
                        const totalWarnings = fsExits + tabSwitches + inspectAttempts;
                        const events = submission.proctoringLog?.events || [];

                        let maxFsSec = 0;
                        let maxTabSec = 0;
                        let hasNetworkOffline = false;
                        let hasMinorThreshold = false;
                        events.forEach(ev => {
                            let dur = Number(ev.durationSeconds || 0);
                            if (!dur && ev.details) {
                                const match = ev.details.match(/for\s+(\d+)\s+seconds/i);
                                if (match && match[1]) dur = parseInt(match[1], 10);
                            }
                            if (ev.type === 'FULLSCREEN_EXIT' && dur > maxFsSec) maxFsSec = dur;
                            if (ev.type === 'TAB_SWITCH' && dur > maxTabSec) maxTabSec = dur;
                            if (ev.type === 'NETWORK_OFFLINE' || ev.type === 'EMERGENCY_SUBMISSION') hasNetworkOffline = true;
                            if (ev.type === 'MINOR_WARNINGS_EXCEEDED') hasMinorThreshold = true;
                        });

                        const hasLongExit = maxFsSec > 5 || maxTabSec > 5;
                        const isFlagged = submission.status === 'auto-submitted' || totalWarnings >= 1 || hasLongExit || hasNetworkOffline || hasMinorThreshold || Boolean(req.body.hasEirfFlag);

                        if (isFlagged) {
                            submission.hasEirfFlag = true;
                            if (!submission.eirfStatus || submission.eirfStatus === 'none') {
                                submission.eirfStatus = 'pending';
                            }
                        }
                    }

                    const dbPayloadSnap = {
                        submissionId: String(submission._id || submission.id),
                        studentId: sStudId,
                        candidateName: submission.candidateName || 'Candidate',
                        testTitle: submission.testTitle || 'BICS Online Examination',
                        answers: submission.answers || [],
                        proctoringLog: submission.proctoringLog || {},
                        generatedAt: new Date().toISOString()
                    };
                    submission.encryptedDbPayload = encryptEirfPayload(dbPayloadSnap, sStudId, String(submission._id || submission.id));

                    await submission.save();
                    break;
                } catch (saveErr) {
                    if (saveErr.name === 'VersionError' || saveErr.name === 'ParallelSaveError') {
                        retries--;
                        if (retries === 0) throw saveErr;
                        await new Promise(resolve => setTimeout(resolve, 50 * (6 - retries)));
                    } else {
                        throw saveErr;
                    }
                }
            }
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submission = db.testSubmissions.find(s => s.id === targetSubId || s._id === targetSubId || s.id === submissionId || s._id === submissionId);
            if (!submission) return res.status(404).json({ error: "Submission not found" });

            // Hard Immutability: If exam is already finalized or reaped, strictly reject answers tampering with 409 Conflict
            if (['submitted', 'auto-submitted', 'evaluated'].includes(submission.status)) {
                const earlyPayload = submission.toObject ? submission.toObject() : { ...submission };
                earlyPayload.bicsId = toBicsId(submission._id || submission.id);
                return res.status(409).json({ 
                    error: `Exam attempt is permanently closed (Status: ${submission.status}). Answers are frozen and cannot be modified.`,
                    status: submission.status,
                    isFinalized: true,
                    submission: earlyPayload 
                });
            }

            if (status === 'started') {
                return res.status(400).json({
                    error: "Draft autosaves must use dedicated draft endpoint: PUT /api/tests/draft/:submissionId."
                });
            }

            submission.answers = answers;
            if (proctoringLog) {
                submission.proctoringLog = reconcileProctoringLog(submission.proctoringLog || {}, proctoringLog);
            }
            submission.status = status || 'submitted';
            if (status !== 'started') {
                submission.submittedAt = new Date();
            }
            submission.lastHeartbeatAt = new Date();

            db.tests = db.tests || [];
            const test = db.tests.find(t => t.id === submission.testId || t._id === submission.testId);
            if (test) {
                // Authoritative server-side wall-clock deadline validation (Item 2.3)
                if (submission.startedAt && isFinalSubmission) {
                    const elapsedMs = Date.now() - new Date(submission.startedAt).getTime();
                    const allowedDurationMs = (test.duration || 60) * 60 * 1000;
                    const GRACE_PERIOD_MS = 120 * 1000;
                    if (elapsedMs > allowedDurationMs + GRACE_PERIOD_MS) {
                        const overtimeSec = Math.round((elapsedMs - allowedDurationMs) / 1000);
                        submission.status = 'auto-submitted';
                        if (!submission.proctoringLog) submission.proctoringLog = {};
                        if (!submission.proctoringLog.events) submission.proctoringLog.events = [];
                        submission.proctoringLog.events.push({
                            timestamp: new Date(),
                            type: 'OVERTIME_SUBMISSION',
                            details: `Submission received ${overtimeSec}s after allowed duration deadline. Auto-finalized by server.`
                        });
                    }
                }

                recalculateMCQScore(submission, test);
                calculateCodingScoreFast(submission, test);
            } else {
                submission.evaluation = {
                    mcqScore: 0,
                    codingScore: 0,
                    feedback: '',
                    evaluatedAt: null
                };
            }

            // 1. Authoritative EIRF incident calculation (processed before save to eliminate duplicate writes)
            if (isFinalSubmission) {
                const fsExits = submission.proctoringLog?.fullscreenExits || 0;
                const tabSwitches = submission.proctoringLog?.tabSwitches || 0;
                const inspectAttempts = submission.proctoringLog?.inspectAttempts || 0;
                const totalWarnings = fsExits + tabSwitches + inspectAttempts;
                const events = submission.proctoringLog?.events || [];

                let maxFsSec = 0;
                let maxTabSec = 0;
                let hasNetworkOffline = false;
                let hasMinorThreshold = false;
                events.forEach(ev => {
                    let dur = Number(ev.durationSeconds || 0);
                    if (!dur && ev.details) {
                        const match = ev.details.match(/for\s+(\d+)\s+seconds/i);
                        if (match && match[1]) dur = parseInt(match[1], 10);
                    }
                    if (ev.type === 'FULLSCREEN_EXIT' && dur > maxFsSec) maxFsSec = dur;
                    if (ev.type === 'TAB_SWITCH' && dur > maxTabSec) maxTabSec = dur;
                    if (ev.type === 'NETWORK_OFFLINE' || ev.type === 'EMERGENCY_SUBMISSION') hasNetworkOffline = true;
                    if (ev.type === 'MINOR_WARNINGS_EXCEEDED') hasMinorThreshold = true;
                });

                const hasLongExit = maxFsSec > 5 || maxTabSec > 5;
                const isFlagged = submission.status === 'auto-submitted' || totalWarnings >= 1 || hasLongExit || hasNetworkOffline || hasMinorThreshold || Boolean(req.body.hasEirfFlag);

                if (isFlagged) {
                    submission.hasEirfFlag = true;
                    if (!submission.eirfStatus || submission.eirfStatus === 'none') {
                        submission.eirfStatus = 'pending';
                    }
                }
            }

            const sStudId = submission.studentId || 'Candidate';
            const dbPayloadSnap = {
                submissionId: String(submission._id || submission.id),
                studentId: sStudId,
                candidateName: submission.candidateName || 'Candidate',
                testTitle: submission.testTitle || 'BICS Online Examination',
                answers: submission.answers || [],
                proctoringLog: submission.proctoringLog || {},
                generatedAt: new Date().toISOString()
            };
            submission.encryptedDbPayload = encryptEirfPayload(dbPayloadSnap, sStudId, String(submission._id || submission.id));

            saveJSONData(db);
        }

        // Asynchronous post-submission side effects (non-blocking so candidate UI returns in milliseconds)
        if (status !== 'started') {
            logSystemAction(
                submission?.candidateName || 'Candidate', 
                status === 'auto-submitted' ? 'TEST_AUTO_SUBMITTED' : 'TEST_SUBMITTED', 
                `Candidate submitted examination answers for "${submission?.testTitle || 'Exam'}" (${submission?.testId || 'ID'}) with status ${status || 'submitted'}`, 
                'info'
            ).catch(() => {});

            if (submission.hasEirfFlag && !submission.eirfNoticeEmailSent) {
                submission.eirfNoticeEmailSent = true;
                (async () => {
                    try {
                        let recipientEmail = submission.candidateEmail;
                        if (!recipientEmail && submission.studentId) {
                            const cand = dbState.useMongo
                                ? await CandidateModel.findOne({ $or: [{ studentId: submission.studentId }, { _id: submission.candidateId }] })
                                : (getJSONData().candidates || []).find(c => c.studentId === submission.studentId || c.id === submission.studentId);
                            if (cand) {
                                recipientEmail = cand.personalEmail || cand.registrationData?.personalEmail || cand.email;
                            }
                        }
                        if (!recipientEmail) recipientEmail = 'preliminaryexaminations@gmail.com';

                        const fsExits = submission.proctoringLog?.fullscreenExits || 0;
                        const tabSwitches = submission.proctoringLog?.tabSwitches || 0;
                        const inspectAttempts = submission.proctoringLog?.inspectAttempts || 0;
                        const totalWarnings = fsExits + tabSwitches + inspectAttempts;
                        const events = submission.proctoringLog?.events || [];
                        let maxFsSec = 0;
                        let maxTabSec = 0;
                        events.forEach(ev => {
                            let dur = Number(ev.durationSeconds || 0);
                            if (!dur && ev.details) {
                                const match = ev.details.match(/for\s+(\d+)\s+seconds/i);
                                if (match && match[1]) dur = parseInt(match[1], 10);
                            }
                            if (ev.type === 'FULLSCREEN_EXIT' && dur > maxFsSec) maxFsSec = dur;
                            if (ev.type === 'TAB_SWITCH' && dur > maxTabSec) maxTabSec = dur;
                        });

                        const incidentParts = [];
                        if (fsExits > 0) incidentParts.push(`${fsExits} Fullscreen Exit(s) (Max: ${maxFsSec}s)`);
                        if (tabSwitches > 0) incidentParts.push(`${tabSwitches} Tab Switch(es) / Focus Loss (Max: ${maxTabSec}s)`);
                        if (inspectAttempts > 0) incidentParts.push(`${inspectAttempts} Developer Tools / Inspect Element Attempt(s)`);
                        if (status === 'auto-submitted') incidentParts.push(`Attempt Auto-Submitted due to reaching 3 compliance warnings`);

                        const consolidatedSummary = incidentParts.length > 0
                            ? `Recorded Session Incidents: ${incidentParts.join('; ')}.`
                            : `Proctoring alert flagged for post-exam incident review (${totalWarnings} total warnings).`;

                        await sendEirfNoticeEmail(
                            recipientEmail,
                            submission.candidateName || 'Candidate',
                            submission.testTitle || 'BICS Examination',
                            consolidatedSummary,
                            submission._id || submission.id
                        );
                    } catch (e) {
                        console.error("EIRF single consolidated notice email error:", e);
                    }
                })();
            }
        }

        const subPayload = submission.toObject ? submission.toObject() : { ...submission };
        subPayload.bicsId = toBicsId(submission._id || submission.id);
        return res.json({ success: true, submission: subPayload });
    } catch (e) {
        console.error("POST /api/tests/submit failed:", e);
        await logSystemAction('system', 'TECHNICAL_ERROR', `Failed to process exam submission for candidate submission ID ${submissionId}: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    } finally {
        if (isFinalSubmission) {
            activeSubmissionsProcessing.delete(submissionId);
            activeSubmissionsProcessing.delete(targetSubId);
        }
    }
});

// 8. Re-evaluation candidate request
router.post('/reevaluation/:submissionId', requireAuth, async (req, res) => {
    const { submissionId } = req.params;
    const { complaintText, complainedQuestions, proofImages } = req.body;
    
    if (!complaintText) {
        return res.status(400).json({ error: "Complaint explanation is required." });
    }

    try {
        let submission = null;
        if (dbState.useMongo) {
            submission = await TestSubmissionModel.findById(submissionId);
            if (!submission) {
                return res.status(404).json({ error: "Exam submission not found." });
            }
            if (req.user && req.user.role !== 'admin') {
                const subCandId = String(submission.candidateId || submission.studentId || '');
                const userMongo = isBicsId(String(req.user.id || '')) ? toMongoId(String(req.user.id || '')) : String(req.user.id || '');
                const subNorm = isBicsId(subCandId) ? toMongoId(subCandId) : subCandId;
                if (subNorm !== userMongo && subCandId !== String(req.user.studentId || '')) {
                    return res.status(403).json({ error: "Access denied: You cannot request reevaluation for another candidate." });
                }
            }
            submission.reevaluation = {
                applied: true,
                appliedAt: new Date(),
                complaintText,
                complainedQuestions: complainedQuestions || [],
                proofImages: proofImages || [],
                status: 'pending',
                resolutionFeedback: ''
            };
            await submission.save();
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submission = db.testSubmissions.find(s => s.id === submissionId || s._id === submissionId);
            if (!submission) {
                return res.status(404).json({ error: "Exam submission not found." });
            }
            if (req.user && req.user.role !== 'admin') {
                const subCandId = String(submission.candidateId || submission.studentId || '');
                const userMongo = isBicsId(String(req.user.id || '')) ? toMongoId(String(req.user.id || '')) : String(req.user.id || '');
                const subNorm = isBicsId(subCandId) ? toMongoId(subCandId) : subCandId;
                if (subNorm !== userMongo && subCandId !== String(req.user.studentId || '')) {
                    return res.status(403).json({ error: "Access denied: You cannot request reevaluation for another candidate." });
                }
            }
            submission.reevaluation = {
                applied: true,
                appliedAt: new Date(),
                complaintText,
                complainedQuestions: complainedQuestions || [],
                proofImages: proofImages || [],
                status: 'pending',
                resolutionFeedback: ''
            };
            saveJSONData(db);
        }

        await logSystemAction(submission?.candidateName || 'Candidate', 'COMPLAINT_SUBMITTED', `Candidate filed a re-evaluation request for test "${submission?.testTitle || 'Exam'}" (${submission?.testId || 'ID'})`, 'warning');
        return res.json({ success: true, submission });
    } catch (e) {
        console.error(e);
        await logSystemAction('system', 'TECHNICAL_ERROR', `Failed to register candidate complaint for submission ID ${submissionId}: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    }
});

// 9. Get Evaluated Submission Data for OT Terminal
router.get('/evaluation/:id', async (req, res) => {
    const { id } = req.params;
    try {
        let submission = null;
        if (dbState.useMongo) {
            submission = await TestSubmissionModel.findById(id);
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submission = db.testSubmissions.find(s => s.id === id || s._id === id);
        }

        if (!submission) {
            return res.status(404).json({ success: false, error: "Submission not found." });
        }

        let test = null;
        let student = null;
        if (dbState.useMongo) {
            test = await TestConfigModel.findById(submission.testId);
            student = await CandidateModel.findById(submission.candidateId);
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            db.candidates = db.candidates || [];
            test = db.tests.find(t => t.id === String(submission.testId) || t._id === String(submission.testId));
            student = db.candidates.find(c => c.id === String(submission.candidateId) || c._id === String(submission.candidateId));
        }

        if (!test) {
            return res.status(404).json({ success: false, error: "Associated examination configuration not found." });
        }

        const vStatus = test.verificationStatus || (test.answersReleased ? 'released' : 'not_released');

        if (vStatus === 'closed') {
            return res.status(403).json({
                success: false,
                locked: true,
                verificationStatus: 'closed',
                error: "The answer sheet verification window for this examination has closed. Evaluated answer sheets are no longer accessible."
            });
        }

        if (vStatus === 'not_released') {
            return res.status(403).json({
                success: false,
                locked: true,
                verificationStatus: 'not_released',
                error: "Answer sheets for this examination have not been released by the administrator yet."
            });
        }

        return res.json({
            success: true,
            verificationStatus: vStatus,
            candidate: {
                id: student?._id || student?.id || submission.candidateId,
                name: student?.name || submission.candidateName || 'Candidate',
                studentId: student?.studentId || submission.studentId || '',
                email: student?.registrationData?.collegeEmail || student?.registrationData?.personalEmail || student?.username || 'candidate@bics.edu',
                photoUrl: student?.registrationData?.photoUrl || '/public/uploads/default-photo.png'
            },
            test: {
                id: test._id || test.id,
                title: test.title,
                duration: test.duration,
                marks: test.marks,
                instructions: test.instructions,
                verificationStatus: vStatus,
                questions: test.questions || []
            },
            submission: {
                id: submission._id || submission.id,
                status: submission.status,
                startedAt: submission.startedAt,
                submittedAt: submission.submittedAt,
                proctoringLog: submission.proctoringLog,
                evaluation: submission.evaluation,
                reevaluation: submission.reevaluation,
                objections: submission.objections || [],
                answers: submission.answers || []
            }
        });
    } catch (err) {
        console.error("Failed to fetch submission verification data:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// 10. Execute & test code runner endpoint
router.post('/run', requireAuth, async (req, res) => {
    const { sourceCode, testCases, timeLimitMs, memoryLimitMb } = req.body;
    if (!sourceCode || !testCases || !Array.isArray(testCases)) {
        return res.status(400).json({ error: "sourceCode and testCases list are required." });
    }
    try {
        const result = await executeCode(sourceCode, testCases, timeLimitMs, memoryLimitMb);
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
});

router.sanitizeQuestionForCandidate = sanitizeQuestionForCandidate;
router.reconcileProctoringLog = reconcileProctoringLog;
router.recalculateMCQScore = recalculateMCQScore;
router.calculateCodingScoreFast = calculateCodingScoreFast;

module.exports = router;
