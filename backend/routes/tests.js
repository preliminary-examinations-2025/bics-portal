const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { TestConfigModel, TestSubmissionModel, TestTokenModel, CandidateModel, ConfigModel } = require('../models');
const { dbState, getJSONData, saveJSONData } = require('../config/db');
const { buildCandidateQueryFilter } = require('../config/constants');
const { logSystemAction } = require('../utils/logger');
const { recalculateMCQScore, calculateCodingScoreFast } = require('../utils/scoreCalculator');
const { executeCode } = require('../utils/codeRunner');
const { verifyToken } = require('../utils/jwt');
const { authenticateToken, requireAuth, requireAdmin, requireOwnerOrAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadToCloudinary } = require('../config/cloudinary');
const { isBicsId, toMongoId, toBicsId, resolveToObjectId, generateSubmissionRefId, isSubmissionRefId } = require('../utils/bicsId');
const { compareFaceBiometrics, isPlaceholderPhoto } = require('../utils/biometricMatcher');
const { evaluateEirfIncident } = require('../services/eirfEvaluator');
const { runPipelineTick } = require('../workers/eirfPipelineWorker');
const { sendTestSubmittedEmail } = require('../services/gmailEmailService');
const proctoringRouter = require('./proctoring');

const activeSubmissionsProcessing = new Set();

function isSubmissionOwnerForUser(user, submission) {
    if (!user || !submission) return false;
    if (user.role === 'admin' || user.role === 'superadmin' || user.isAdmin) return true;

    const userIds = new Set();
    [user.id, user.studentId, user.username].forEach(val => {
        if (!val) return;
        const s = String(val).trim();
        if (!s) return;
        userIds.add(s);
        const resolved = resolveToObjectId(s);
        if (resolved) {
            userIds.add(String(resolved));
            const bics = toBicsId(String(resolved));
            if (bics) userIds.add(bics);
        }
    });

    const subRefs = [submission.candidateId, submission.studentId];
    for (const ref of subRefs) {
        if (!ref) continue;
        const s = String(ref).trim();
        if (!s) continue;
        if (userIds.has(s)) return true;
        const resolved = resolveToObjectId(s);
        if (resolved && userIds.has(String(resolved))) return true;
    }
    return false;
}

async function allocateUniqueSubmissionRefId(jsonDb = null) {
    let refId = generateSubmissionRefId();
    if (dbState.useMongo) {
        let existing = await TestSubmissionModel.findOne({ submissionRefId: refId }).select('_id').lean();
        let guard = 0;
        while (existing && guard < 20) {
            refId = generateSubmissionRefId();
            existing = await TestSubmissionModel.findOne({ submissionRefId: refId }).select('_id').lean();
            guard++;
        }
    } else {
        const db = jsonDb || getJSONData();
        const existingSet = new Set((db.testSubmissions || []).map(s => String(s.submissionRefId || '')).filter(Boolean));
        let guard = 0;
        while (existingSet.has(refId) && guard < 20) {
            refId = generateSubmissionRefId();
            guard++;
        }
    }
    return refId;
}

async function findActiveSubmissionByParam(idParam, selectProjection = null) {
    if (!idParam) return null;
    const rawId = String(idParam).trim();
    const resolvedId = resolveToObjectId(rawId);

    if (dbState.useMongo) {
        if (isSubmissionRefId(rawId)) {
            const q = TestSubmissionModel.findOne({ submissionRefId: rawId, isDeleted: { $ne: true } });
            if (selectProjection) q.select(selectProjection);
            const doc = await q;
            if (doc) return doc;
        }
        if (mongoose.Types.ObjectId.isValid(resolvedId)) {
            const q = TestSubmissionModel.findOne({ _id: resolvedId, isDeleted: { $ne: true } });
            if (selectProjection) q.select(selectProjection);
            const doc = await q;
            if (doc) return doc;
        }
        const q = TestSubmissionModel.findOne({
            $or: [
                { _id: mongoose.Types.ObjectId.isValid(resolvedId) ? resolvedId : undefined },
                { id: resolvedId },
                { id: rawId },
                { submissionRefId: rawId }
            ].filter(Boolean),
            isDeleted: { $ne: true }
        });
        if (selectProjection) q.select(selectProjection);
        return await q;
    }

    const db = getJSONData();
    const subs = db.testSubmissions || [];
    return subs.find(s => !s.isDeleted && (
        String(s.submissionRefId || '') === rawId ||
        String(s.id || s._id || '') === resolvedId ||
        String(s.id || s._id || '') === rawId ||
        (isBicsId(rawId) && toBicsId(s._id || s.id) === rawId)
    )) || null;
}

// Delegate proctoring routes so both /api/proctoring and /api/tests/proctoring resolve seamlessly
router.use('/proctoring', proctoringRouter);

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
            .select('_id title course courseCode marks duration startDate endDate instructions isPublished questions._id')
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
                    const candNorm = resolveToObjectId(String(candidateId));
                    const reqStudId = String(req.user?.studentId || '');
                    (db.testSubmissions || []).forEach(s => {
                        const sCand = s.candidateId ? String(s.candidateId) : '';
                        const sCandNorm = sCand ? resolveToObjectId(sCand) : '';
                        const isMatch = (
                            (sCand && (sCand === String(candidateId) || sCandNorm === candNorm)) ||
                            (s.studentId && (String(s.studentId) === String(candidateId) || (reqStudId && String(s.studentId) === reqStudId)))
                        );
                        if (isMatch && s.testId && !s.isDeleted) {
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
                submissions = await TestSubmissionModel.find({ ...candFilter, isDeleted: { $ne: true } });
            }
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            const candNorm = resolveToObjectId(String(candidateId));
            const reqStudId = String(req.user?.studentId || '');
            submissions = db.testSubmissions.filter(s => {
                if (s.isDeleted) return false;
                const sCand = s.candidateId ? String(s.candidateId) : '';
                const sCandNorm = sCand ? resolveToObjectId(sCand) : '';
                return (
                    (sCand && (sCand === String(candidateId) || sCandNorm === candNorm)) ||
                    (s.studentId && (String(s.studentId) === String(candidateId) || (reqStudId && String(s.studentId) === reqStudId)))
                );
            });
        }

        const enrichedList = await Promise.all(submissions.map(async (subDoc) => {
            let sub = subDoc;
            let test = null;
            const testId = sub.testId;
            if (dbState.useMongo) {
                test = await TestConfigModel.findOne({ _id: testId, isDeleted: { $ne: true } });
                if (test && (!sub.evaluation || sub.evaluation.totalScore == null) && sub.verificationStatus !== 'annulled' && sub.eirfStatus !== 'rejected') {
                    recalculateMCQScore(sub, test);
                }
            } else {
                const db = getJSONData();
                db.tests = db.tests || [];
                test = db.tests.find(t => !t.isDeleted && (t.id || t._id).toString() === testId.toString());
                if (test) {
                    const dbSub = db.testSubmissions.find(s => !s.isDeleted && (s.id === sub.id || s._id === sub._id));
                    if (dbSub) {
                        if ((!dbSub.evaluation || dbSub.evaluation.totalScore == null) && dbSub.verificationStatus !== 'annulled' && dbSub.eirfStatus !== 'rejected') {
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
                course: test.course || '',
                courseCode: test.courseCode || '',
                marks: test.marks,
                startDate: test.startDate,
                endDate: test.endDate,
                answersReleased: isReleased,
                verificationStatus: vStatus,
                submission: {
                    id: sub._id || sub.id,
                    submissionRefId: sub.submissionRefId || null,
                    status: sub.status,
                    verificationStatus: sub.verificationStatus || 'active',
                    eirfStatus: sub.eirfStatus || 'none',
                    startedAt: sub.startedAt,
                    submittedAt: sub.submittedAt,
                    createdAt: sub.createdAt,
                    totalScore: (sub.verificationStatus === 'annulled' || sub.eirfStatus === 'rejected')
                        ? 0
                        : (sub.totalScore !== undefined && sub.totalScore !== null ? Number(sub.totalScore) : (sub.evaluation?.totalScore || 0)),
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
                        maxPoints: a.maxPoints ?? a.maxScore ?? 0,
                        maxScore: a.maxPoints ?? a.maxScore ?? 0,
                        isManuallyGraded: a.isManuallyGraded,
                        isObjectionResolved: a.isObjectionResolved,
                        isBonusAwarded: a.isBonusAwarded,
                        pendingEvaluation: a.pendingEvaluation
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

// 2.1 Candidate Grievance / Re-evaluation Proof Upload (JPG, PNG, WEBP, PDF <= 5MB)
router.post('/upload-proof', requireAuth, upload.single('imageFile'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ success: false, error: "Proof file upload is required." });
        }

        let fileUrl = '';
        const useCloudinary = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

        if (useCloudinary) {
            const isPdf = file.mimetype === 'application/pdf';
            fileUrl = await uploadToCloudinary(file.buffer, 'BICS_2026/proofs', isPdf ? 'raw' : 'image');
        } else {
            if (process.env.VERCEL || process.env.RENDER) {
                return res.status(503).json({ success: false, error: "Cloud file storage is not configured in this deployment environment." });
            }
            const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
            if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
            }
            const safeName = (file.originalname || 'proof.png').replace(/[^a-zA-Z0-9._-]/g, '_');
            const fileName = `proof-${Date.now()}-${safeName}`;
            const filePath = path.join(uploadsDir, fileName);
            fs.writeFileSync(filePath, file.buffer);
            const host = `${req.protocol}://${req.get('host')}`;
            fileUrl = `${host}/public/uploads/${fileName}`;
        }

        return res.json({ success: true, url: fileUrl });
    } catch (err) {
        console.error("Student proof upload failed:", err);
        return res.status(500).json({ success: false, error: err.message || "Proof upload failed." });
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

    const category = (qObj.category || '').trim() || (qObj.type === 'coding' ? 'Programming' : (qObj.type === 'web' ? 'Web Development' : (qObj.isMultiChoice || qObj.type === 'mcc' ? 'Multiple Choice' : 'Single Choice')));
    const timeLimitMs = Math.max(200, Math.min(Number(qObj.timeLimitMs) || 2000, 10000));
    const memoryLimitMb = Math.max(16, Math.min(Number(qObj.memoryLimitMb) || 128, 512));

    const sanitized = {
        ...qObj,
        title,
        category,
        timeLimitMs,
        memoryLimitMb,
        description,
        questionText: description
    };

    if (qObj.type === 'mcq' || qObj.type === 'scc' || qObj.type === 'mcc' || qObj.isMultiChoice) {
        delete sanitized.correctOptionIndex;
        delete sanitized.correctOptionIndices;
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

    // 1. Merge incoming events cleanly without duplicates (Sliding 4-second deduplication window)
    if (incomingLog && Array.isArray(incomingLog.events) && incomingLog.events.length > 0) {
        incomingLog.events.forEach(ev => {
            if (!ev || !ev.type) return;
            const evTime = new Date(ev.timestamp || ev.startTime || Date.now()).getTime();

            // Strict deduplication:
            // a) Disallow multiple TEST_SUBMITTED / TEST_AUTO_SUBMITTED events entirely
            // b) Disallow identical type & details within 4 seconds
            const isDuplicate = log.events.some(existing => {
                if (ev.type === 'TEST_SUBMITTED' || ev.type === 'TEST_AUTO_SUBMITTED') {
                    return existing.type === 'TEST_SUBMITTED' || existing.type === 'TEST_AUTO_SUBMITTED';
                }
                if (existing.type !== ev.type) return false;
                if (existing.details !== ev.details) return false;
                const existingTime = new Date(existing.timestamp || existing.startTime || 0).getTime();
                return Math.abs(evTime - existingTime) < 4000;
            });

            if (!isDuplicate) {
                log.events.push(ev);
            }
        });

        // Always maintain events in chronological order
        log.events.sort((a, b) => new Date(a.timestamp || a.startTime || 0) - new Date(b.timestamp || b.startTime || 0));
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
// Uses authenticateToken (soft auth) — candidate may not have exam token yet at biometric gate stage
router.get('/biometrics/challenge', authenticateToken, (req, res) => {
    const CHALLENGE_ACTIONS = [
        { action: 'TURN_LEFT', instruction: 'Slowly turn your head slightly to the left', targetDurationMs: 1200 },
        { action: 'TURN_RIGHT', instruction: 'Slowly turn your head slightly to the right', targetDurationMs: 1200 },
        { action: 'TILT_HEAD', instruction: 'Tilt your head slightly to one side', targetDurationMs: 1200 },
        { action: 'MOVE_HEAD_DOWN', instruction: 'Slowly move or nod your head slightly downwards', targetDurationMs: 1200 }
    ];
    // Randomly select 1 active liveness challenge per session
    const picked = CHALLENGE_ACTIONS[crypto.randomInt(0, CHALLENGE_ACTIONS.length)];
    const challenges = [
        { step: 1, action: picked.action, instruction: picked.instruction }
    ];
    const selected = challenges[0];
    const challengeId = `chal_${crypto.randomBytes(8).toString('hex')}`;
    const nonce = crypto.randomBytes(8).toString('hex');
    const expiresAt = Date.now() + (2 * 60 * 1000); // 2 minutes

    activeBiometricChallenges.set(challengeId, {
        challenges,
        action: selected.action,
        instruction: selected.instruction,
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
        challenges,
        totalSteps: challenges.length,
        action: selected.action,
        instruction: selected.instruction,
        nonce,
        expiresAt
    });
});

// 2.7 Server-Side Identity Verification & Face Match (Phase 2)
router.post('/biometrics/verify', requireAuth, async (req, res) => {
    let { candidateId, testId, liveFrame, challengeId, challengeTelemetry } = req.body;
    if (req.user && req.user.role !== 'admin' && !req.isExamTokenAuth) {
        const userMongo = resolveToObjectId(String(req.user.id || ''));
        const allowedIds = [
            String(req.user.id || ''),
            String(req.user.studentId || ''),
            String(req.user.username || ''),
            userMongo,
            toBicsId(userMongo)
        ].filter(Boolean);
        if (candidateId) {
            const candNorm = resolveToObjectId(String(candidateId));
            if (candNorm !== userMongo && !allowedIds.includes(String(candidateId))) {
                return res.status(403).json({ success: false, error: "Access denied: Candidate mismatch." });
            }
        }
        candidateId = req.user.id || req.user.studentId;
    }
    if (!candidateId && req.user) candidateId = req.user.id || req.user.studentId;
    if (!candidateId) return res.status(400).json({ success: false, error: "Candidate ID is required." });
    if (!liveFrame) return res.status(400).json({ success: false, error: "Live capture frame is required." });

    try {
        let candidate = null;
        const mongoCandId = resolveToObjectId(String(candidateId));

        if (dbState.useMongo) {
            if (mongoose.Types.ObjectId.isValid(mongoCandId)) {
                candidate = await CandidateModel.findById(mongoCandId).lean();
            }
            if (!candidate && String(candidateId).length < 24) {
                candidate = await CandidateModel.findOne({ studentId: String(candidateId) }).lean();
            }
        } else {
            const db = getJSONData();
            db.candidates = db.candidates || [];
            candidate = db.candidates.find(c =>
                String(c.id || '') === String(candidateId) ||
                String(c._id || '') === String(candidateId) ||
                String(c.id || '') === mongoCandId ||
                String(c._id || '') === mongoCandId ||
                String(c.studentId || '') === String(candidateId)
            );
        }

        const referencePhotoUrl = req.body.registeredPhotoUrl ||
                                  candidate?.referencePhotoUrl ||
                                  candidate?.registrationData?.photoUrl ||
                                  candidate?.photoUrl ||
                                  '';

        // Validate active challenge if provided
        let livenessPassed = false;
        if (challengeId && activeBiometricChallenges.has(challengeId)) {
            const challenge = activeBiometricChallenges.get(challengeId);
            const chalCandNorm = challenge.candidateId ? resolveToObjectId(String(challenge.candidateId)) : null;
            const reqUserNorm = req.user?.id ? resolveToObjectId(String(req.user.id)) : null;
            const candidateMatches = !chalCandNorm || !reqUserNorm || chalCandNorm === reqUserNorm || req.user?.role === 'admin' || String(challenge.candidateId) === String(req.user?.studentId);
            const actionMatches = !challengeTelemetry?.action || challengeTelemetry.action === challenge.action || (Array.isArray(challengeTelemetry.completedActions) && challengeTelemetry.completedActions.includes(challenge.action));
            const isCompleted = challengeTelemetry?.allCompleted || challengeTelemetry?.actionCompleted;
            if (candidateMatches && actionMatches && Date.now() <= challenge.expiresAt && isCompleted) {
                livenessPassed = true;
            }
            activeBiometricChallenges.delete(challengeId);
        } else if (challengeTelemetry?.allCompleted || challengeTelemetry?.actionCompleted) {
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

    try {
        const submission = await findActiveSubmissionByParam(submissionId);
        if (!submission) return res.status(404).json({ success: false, error: "Submission not found." });
        if (!isSubmissionOwnerForUser(req.user, submission)) {
            return res.status(403).json({ success: false, error: "Access denied: You do not own this examination session." });
        }

        const verifiedPhoto = submission.biometricResult?.verifiedPhotoUrl || submission.baselinePhotoUrl || '';
        if (!verifiedPhoto) {
            return res.json({ success: true, verified: true, message: "No baseline photo available for comparison." });
        }

        const matchResult = await compareFaceBiometrics(liveFrame, verifiedPhoto);
        const isMismatch = matchResult.similarityScore < 0.28;

        if (isMismatch) {
            const eventObj = {
                timestamp: new Date(),
                type: 'FACE_MISMATCH',
                details: `Continuous identity check flagged low facial similarity (${Math.round(matchResult.similarityScore * 100)}%).`
            };

            if (dbState.useMongo) {
                await TestSubmissionModel.findByIdAndUpdate(submission._id, {
                    $push: { 'proctoringLog.events': eventObj },
                    $set: { 'biometricResult.continuityFlagged': true }
                });
            } else {
                const db = getJSONData();
                const jsonSub = (db.testSubmissions || []).find(s => !s.isDeleted && String(s._id || s.id) === String(submission._id || submission.id));
                if (jsonSub) {
                    jsonSub.proctoringLog = jsonSub.proctoringLog || {};
                    jsonSub.proctoringLog.events = jsonSub.proctoringLog.events || [];
                    jsonSub.proctoringLog.events.push(eventObj);
                    jsonSub.biometricResult = jsonSub.biometricResult || {};
                    jsonSub.biometricResult.continuityFlagged = true;
                    saveJSONData(db);
                }
            }

            await logSystemAction(
                submission.candidateName || submission.studentId || 'Candidate',
                'PROCTOR_VIOLATION',
                `Continuous facial identity deviation detected for submission ${submission.submissionRefId || submissionId}: ${Math.round(matchResult.similarityScore * 100)}% match.`,
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
    const targetTestId = resolveToObjectId(id);
    try {
        let test = null;
        if (dbState.useMongo) {
            if (mongoose.Types.ObjectId.isValid(targetTestId)) {
                test = await TestConfigModel.findOne({ _id: targetTestId, isDeleted: { $ne: true } }).lean();
            }
            if (!test) {
                test = await TestConfigModel.findOne({ _id: id, isDeleted: { $ne: true } }).lean();
            }
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            test = db.tests.find(t => !t.isDeleted && (String(t.id || '') === targetTestId || String(t._id || '') === targetTestId || String(t.id || '') === id || String(t._id || '') === id));
        }

        if (!test) return res.status(404).json({ error: "Test not found" });
        if (req.user && req.user.role !== 'admin' && test.isPublished === false) {
            return res.status(403).json({ error: "This examination is currently unpublished." });
        }

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
            test = await TestConfigModel.findOne({ _id: mongoTestId, isDeleted: { $ne: true } });
            if (!test && mongoTestId !== id && mongoose.Types.ObjectId.isValid(id)) {
                test = await TestConfigModel.findOne({ _id: id, isDeleted: { $ne: true } });
            }
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            test = db.tests.find(t => !t.isDeleted && (String(t.id || '') === String(id) || String(t._id || '') === String(id) || String(t.id || '') === String(mongoTestId) || String(t._id || '') === String(mongoTestId)));
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
                submission = await TestSubmissionModel.findOne({ ...candFilter, testId: queryTestId, isDeleted: { $ne: true } });
            }
            if (submission) {
                return res.status(400).json({ error: "You have already attempted or completed this examination. Re-attempts are not permitted." });
            }

            let candDoc = null;
            if (mongoose.Types.ObjectId.isValid(targetCandId)) {
                candDoc = await CandidateModel.findById(targetCandId).lean();
            } else if (studentId || targetCandId) {
                candDoc = await CandidateModel.findOne({ studentId: String(studentId || targetCandId) }).lean();
            }
            const resolvedEmail = candDoc?.registrationData?.collegeEmail || candDoc?.registrationData?.personalEmail || (String(candDoc?.username || '').includes('@') ? candDoc.username : '') || '';
            const resolvedCandName = candidateName || candDoc?.name || 'Candidate';
            const resolvedStudId = studentId || candDoc?.studentId || req.user?.studentId || '';
            const submissionRefId = await allocateUniqueSubmissionRefId();

            submission = new TestSubmissionModel({
                submissionRefId,
                candidateId: mongoose.Types.ObjectId.isValid(targetCandId) ? new mongoose.Types.ObjectId(targetCandId) : (candDoc?._id || undefined),
                candidateName: resolvedCandName,
                candidateEmail: resolvedEmail,
                studentId: resolvedStudId,
                testId: targetTestId,
                testTitle: test.title,
                durationMinutes: Number(test.duration || 60),
                startedAt: new Date(),
                lastHeartbeatAt: new Date(),
                status: 'started',
                verificationStatus: 'active',
                isDeleted: false,
                baselinePhotoUrl: baselinePhotoUrl || '',
                biometricResult: submissionBiometrics,
                securityMetadata: enrichedSecurityMetadata,
                proctoringLog: { fullscreenExits: 0, tabSwitches: 0, inspectAttempts: 0, clipboardAttempts: 0, webcamStatus: 'active', events: [], snapshots: [] },
                answers: []
            });
            await submission.save();
            if (req.body.token) {
                await TestTokenModel.updateOne(
                    { token: req.body.token },
                    { $set: { isUsed: true, sessionSubmissionId: submission._id } }
                ).catch(() => {});
            }
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            const targetCandId = mongoCandId || candidateId;
            const targetTestId = mongoTestId || id;
            const candNorm = resolveToObjectId(String(targetCandId));
            const reqStudId = String(studentId || req.user?.studentId || '');
            submission = db.testSubmissions.find(s => {
                if (s.isDeleted) return false;
                const sTest = s.testId ? resolveToObjectId(String(s.testId)) : '';
                if (sTest !== String(targetTestId) && String(s.testId || '') !== String(id)) return false;
                const sCand = s.candidateId ? resolveToObjectId(String(s.candidateId)) : '';
                return (
                    (sCand && (sCand === candNorm || String(s.candidateId) === String(candidateId))) ||
                    (s.studentId && reqStudId && String(s.studentId) === reqStudId)
                );
            });
            if (submission) {
                return res.status(400).json({ error: "You have already attempted or completed this examination. Re-attempts are not permitted." });
            }

            const candDoc = (db.candidates || []).find(c =>
                resolveToObjectId(String(c._id || c.id || '')) === candNorm ||
                (reqStudId && String(c.studentId || '') === reqStudId)
            );
            const resolvedEmail = candDoc?.registrationData?.collegeEmail || candDoc?.registrationData?.personalEmail || (String(candDoc?.username || '').includes('@') ? candDoc.username : '') || '';
            const resolvedCandName = candidateName || candDoc?.name || 'Candidate';
            const resolvedStudId = studentId || candDoc?.studentId || req.user?.studentId || '';
            const submissionRefId = await allocateUniqueSubmissionRefId(db);
            const generatedId = new mongoose.Types.ObjectId().toString();

            submission = {
                id: generatedId,
                _id: generatedId,
                submissionRefId,
                candidateId: candNorm || candidateId,
                candidateName: resolvedCandName,
                candidateEmail: resolvedEmail,
                studentId: resolvedStudId,
                testId: targetTestId || id,
                testTitle: test.title,
                durationMinutes: Number(test.duration || 60),
                startedAt: new Date(),
                lastHeartbeatAt: new Date(),
                status: 'started',
                verificationStatus: 'active',
                isDeleted: false,
                baselinePhotoUrl: baselinePhotoUrl || '',
                biometricResult: submissionBiometrics,
                securityMetadata: enrichedSecurityMetadata,
                proctoringLog: { fullscreenExits: 0, tabSwitches: 0, inspectAttempts: 0, clipboardAttempts: 0, webcamStatus: 'active', events: [], snapshots: [] },
                answers: []
            };
            db.testSubmissions.push(submission);
            if (req.body.token && Array.isArray(db.tokens)) {
                const tok = db.tokens.find(t => t.token === req.body.token);
                if (tok) {
                    tok.isUsed = true;
                    tok.sessionSubmissionId = submission.id;
                }
            }
            saveJSONData(db);
        }

        const subPayload = submission.toObject ? submission.toObject() : { ...submission };
        subPayload.bicsId = toBicsId(submission._id || submission.id);
        subPayload.submissionRefId = submission.submissionRefId;

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
router.post('/heartbeat/:submissionId', requireAuth, async (req, res) => {
    const { submissionId } = req.params;
    if (!submissionId) return res.status(400).json({ error: "Submission ID is required" });

    try {
        const now = new Date();
        const existingSub = await findActiveSubmissionByParam(submissionId, '_id id candidateId studentId lastHeartbeatAt status startedAt testId');
        if (!existingSub) return res.status(404).json({ error: "Submission session not found" });

        if (!isSubmissionOwnerForUser(req.user, existingSub)) {
            return res.status(403).json({ error: "Access denied: You do not own this examination session." });
        }

        if (dbState.useMongo) {
            let sub = existingSub;
            if (existingSub.status === 'started') {
                const prevHeartbeat = existingSub.lastHeartbeatAt ? new Date(existingSub.lastHeartbeatAt).getTime() : null;
                const gapMs = prevHeartbeat ? (now.getTime() - prevHeartbeat) : 0;

                const updateOps = {
                    $set: { lastHeartbeatAt: now }
                };

                // Rule 3: Heartbeat gap >= 10s (missing >= 2 consecutive 5s pulses) confirms > 5s network disconnection
                if (gapMs >= 10000) {
                    const gapSeconds = Math.round(gapMs / 1000);
                    const downtimeSeconds = Math.max(0, gapSeconds - 5);
                    updateOps.$push = {
                        'proctoringLog.serverOfflineGaps': {
                            gapSeconds,
                            downtimeSeconds,
                            timestamp: now
                        },
                        'proctoringLog.events': {
                            timestamp: now,
                            type: 'SERVER_DETECTED_OFFLINE_GAP',
                            details: `Heartbeat restored after ${gapSeconds}s gap (detected network downtime: ${downtimeSeconds}s).`,
                            durationSeconds: downtimeSeconds
                        }
                    };
                }

                sub = await TestSubmissionModel.findByIdAndUpdate(
                    existingSub._id,
                    updateOps,
                    { new: true, select: 'status startedAt testId' }
                ) || existingSub;
            }

            let expiresAtMs = null;
            let remainingSeconds = null;
            if (sub.testId && sub.startedAt) {
                const testDoc = await TestConfigModel.findOne({ _id: sub.testId, isDeleted: { $ne: true } }).select('duration').lean();
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
            const sub = db.testSubmissions.find(s => !s.isDeleted && String(s.id || s._id) === String(existingSub.id || existingSub._id));
            if (!sub) return res.status(404).json({ error: "Submission session not found" });

            if (sub.status === 'started') {
                const prevHeartbeat = sub.lastHeartbeatAt ? new Date(sub.lastHeartbeatAt).getTime() : null;
                const gapMs = prevHeartbeat ? (now.getTime() - prevHeartbeat) : 0;
                sub.lastHeartbeatAt = now;

                if (gapMs >= 10000) {
                    const gapSeconds = Math.round(gapMs / 1000);
                    const downtimeSeconds = Math.max(0, gapSeconds - 5);
                    if (!sub.proctoringLog) sub.proctoringLog = {};
                    if (!Array.isArray(sub.proctoringLog.serverOfflineGaps)) sub.proctoringLog.serverOfflineGaps = [];
                    if (!Array.isArray(sub.proctoringLog.events)) sub.proctoringLog.events = [];

                    sub.proctoringLog.serverOfflineGaps.push({
                        gapSeconds,
                        downtimeSeconds,
                        timestamp: now
                    });
                    sub.proctoringLog.events.push({
                        timestamp: now,
                        type: 'SERVER_DETECTED_OFFLINE_GAP',
                        details: `Heartbeat restored after ${gapSeconds}s gap (detected network downtime: ${downtimeSeconds}s).`,
                        durationSeconds: downtimeSeconds
                    });
                }
                saveJSONData(db);
            }

            let expiresAtMs = null;
            let remainingSeconds = null;
            if (sub.testId && sub.startedAt) {
                db.tests = db.tests || [];
                const testDoc = db.tests.find(t => !t.isDeleted && String(t.id || t._id) === String(sub.testId));
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

    try {
        const now = new Date();
        const submission = await findActiveSubmissionByParam(submissionId);
        if (!submission) return res.status(404).json({ error: "Submission session not found" });

        if (!isSubmissionOwnerForUser(req.user, submission)) {
            return res.status(403).json({ error: "Access denied: You do not own this examination session." });
        }

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

        const sanitizeDraftAnswers = (rawAnswers) => rawAnswers.map(a => {
            const cleanAns = { ...a };
            delete cleanAns.score;
            delete cleanAns.isManuallyGraded;
            delete cleanAns.isBonusAwarded;
            delete cleanAns.isObjectionResolved;
            // Normalize MCC multi-choice arrays vs SCC / MCQ single index
            if (cleanAns.type === 'mcc' || Array.isArray(cleanAns.selectedOptionIndices) || (cleanAns.type !== 'scc' && cleanAns.type !== 'coding' && cleanAns.type !== 'web' && Array.isArray(cleanAns.selectedOptionIndex))) {
                if (!Array.isArray(cleanAns.selectedOptionIndices) && Array.isArray(cleanAns.selectedOptionIndex)) {
                    cleanAns.selectedOptionIndices = cleanAns.selectedOptionIndex.map(Number);
                } else if (Array.isArray(cleanAns.selectedOptionIndices)) {
                    cleanAns.selectedOptionIndices = cleanAns.selectedOptionIndices.map(Number);
                } else {
                    cleanAns.selectedOptionIndices = [];
                }
                if (cleanAns.selectedOptionIndex === undefined || cleanAns.selectedOptionIndex === null) {
                    cleanAns.selectedOptionIndex = cleanAns.selectedOptionIndices.length > 0 ? cleanAns.selectedOptionIndices[0] : null;
                }
            } else if (cleanAns.type === 'scc' || cleanAns.type === 'mcq') {
                if (Array.isArray(cleanAns.selectedOptionIndex)) {
                    cleanAns.selectedOptionIndex = cleanAns.selectedOptionIndex.length > 0 ? Number(cleanAns.selectedOptionIndex[0]) : null;
                } else if (cleanAns.selectedOptionIndex !== undefined && cleanAns.selectedOptionIndex !== null) {
                    cleanAns.selectedOptionIndex = Number(cleanAns.selectedOptionIndex);
                } else if (Array.isArray(cleanAns.selectedOptionIndices) && cleanAns.selectedOptionIndices.length > 0) {
                    cleanAns.selectedOptionIndex = Number(cleanAns.selectedOptionIndices[0]);
                } else {
                    cleanAns.selectedOptionIndex = null;
                }
                cleanAns.selectedOptionIndices = cleanAns.selectedOptionIndex !== null ? [cleanAns.selectedOptionIndex] : [];
            }
            if (Array.isArray(cleanAns.testCaseResults)) {
                cleanAns.testCaseResults = cleanAns.testCaseResults.map(tc => ({
                    testCaseIndex: tc.testCaseIndex,
                    status: tc.status,
                    points: Number(tc.points) || 0,
                    scoredPoints: Number(tc.scoredPoints) || (tc.status === 'Accepted' || tc.status === 'passed' ? Number(tc.points) || 0 : 0),
                    actualOutput: typeof tc.actualOutput === 'string' ? tc.actualOutput.slice(0, 1000) : tc.actualOutput,
                    expectedOutput: typeof tc.expectedOutput === 'string' ? tc.expectedOutput.slice(0, 1000) : tc.expectedOutput,
                    input: typeof tc.input === 'string' ? tc.input.slice(0, 500) : tc.input,
                    isSample: Boolean(tc.isSample),
                    executionTimeMs: Number(tc.executionTimeMs || 0),
                    memoryUsedKb: Number(tc.memoryUsedKb || 0)
                }));
            }
            if (cleanAns.compileError) {
                cleanAns.compileError = String(cleanAns.compileError).slice(0, 2000);
            }
            if (cleanAns.consoleTab) {
                cleanAns.consoleTab = String(cleanAns.consoleTab).slice(0, 20);
            }
            return cleanAns;
        });

        if (dbState.useMongo) {
            const updateFields = {
                lastHeartbeatAt: now
            };

            let answersCount = submission.answers?.length || 0;
            if (Array.isArray(answers)) {
                updateFields.answers = sanitizeDraftAnswers(answers);
                answersCount = updateFields.answers.length;
            }

            if (proctoringLog) {
                updateFields.proctoringLog = reconcileProctoringLog(submission.proctoringLog || {}, proctoringLog);
            }

            // Atomic update prevents Mongoose VersionError (__v) collisions with concurrent heartbeats/proctoring logs
            await TestSubmissionModel.updateOne(
                { _id: submission._id, status: 'started' },
                { $set: updateFields }
            );

            let expiresAtMs = null;
            let remainingSeconds = null;
            if (submission.testId && submission.startedAt) {
                const testDoc = await TestConfigModel.findOne({ _id: submission.testId, isDeleted: { $ne: true } }).select('duration').lean();
                const durMin = Number(testDoc?.duration || 60);
                const startedAtMs = new Date(submission.startedAt).getTime();
                expiresAtMs = startedAtMs + (durMin * 60 * 1000);
                remainingSeconds = Math.max(0, Math.round((expiresAtMs - now.getTime()) / 1000));
            }

            return res.json({ 
                success: true, 
                savedAt: now, 
                answersCount,
                serverTime: now.getTime(),
                expiresAt: expiresAtMs,
                remainingSeconds: remainingSeconds,
                reaperGraceSeconds: 70
            });
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            const jsonSub = db.testSubmissions.find(s => !s.isDeleted && String(s.id || s._id) === String(submission.id || submission._id));
            if (!jsonSub) return res.status(404).json({ error: "Submission session not found" });

            let answersCount = jsonSub.answers?.length || 0;
            if (Array.isArray(answers)) {
                jsonSub.answers = sanitizeDraftAnswers(answers);
                answersCount = jsonSub.answers.length;
            }

            if (proctoringLog) {
                jsonSub.proctoringLog = reconcileProctoringLog(jsonSub.proctoringLog || {}, proctoringLog);
            }

            jsonSub.lastHeartbeatAt = now;
            saveJSONData(db);

            let expiresAtMs = null;
            let remainingSeconds = null;
            if (jsonSub.testId && jsonSub.startedAt) {
                db.tests = db.tests || [];
                const testDoc = db.tests.find(t => !t.isDeleted && String(t.id || t._id) === String(jsonSub.testId));
                const durMin = Number(testDoc?.duration || 60);
                const startedAtMs = new Date(jsonSub.startedAt).getTime();
                expiresAtMs = startedAtMs + (durMin * 60 * 1000);
                remainingSeconds = Math.max(0, Math.round((expiresAtMs - now.getTime()) / 1000));
            }

            return res.json({ 
                success: true, 
                savedAt: jsonSub.lastHeartbeatAt,
                answersCount,
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

router.put('/draft/:submissionId', requireAuth, handleDraftSave);
router.post('/draft/:submissionId', requireAuth, handleDraftSave);

// 4.2 Browser Beacon on Disconnect / Tab Close (Item 2.4 & Issue B3)
router.post('/beacon-disconnect', express.json({ type: ['application/json', 'text/plain', '*/*'] }), async (req, res) => {
    let payload = req.body;
    if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch (_) {}
    }
    const { submissionId, answers, proctoringLog, authToken, examToken } = payload || {};
    if (!submissionId) return res.status(400).json({ error: "Submission ID required" });

    // Verify JWT or exam token (never fall back to unauthenticated mutation)
    let authUser = req.user || null;
    const rawToken = authToken || (req.headers.authorization ? req.headers.authorization.replace(/^Bearer\s+/i, '').trim() : null);
    if (!authUser && rawToken) {
        const decoded = verifyToken(rawToken);
        if (decoded) {
            authUser = decoded;
        }
    }
    if (!authUser) {
        const rawExamToken = examToken || req.headers['x-exam-token'] || req.query?.token || (payload && payload.token);
        if (rawExamToken && typeof rawExamToken === 'string') {
            try {
                let tokenDoc = null;
                if (dbState.useMongo) {
                    tokenDoc = await TestTokenModel.findOne({ token: rawExamToken.trim() }).lean();
                } else {
                    const dbTok = getJSONData();
                    tokenDoc = (dbTok.tokens || []).find(t => t.token === rawExamToken.trim());
                }
                const isNotExpired = tokenDoc && (!tokenDoc.expiresAt || Date.now() <= new Date(tokenDoc.expiresAt).getTime());
                if (isNotExpired) {
                    authUser = {
                        id: String(tokenDoc.candidateId),
                        role: 'candidate',
                        studentId: String(tokenDoc.candidateId),
                        username: 'candidate'
                    };
                }
            } catch (_) {}
        }
    }

    if (!authUser) {
        return res.status(401).json({ error: "Unauthorized: Valid session or exam token required for disconnect beacon." });
    }

    const sanitizeBeaconAnswers = (rawAnswers) => rawAnswers.map(a => {
        const cleanAns = { ...a };
        delete cleanAns.score;
        delete cleanAns.isManuallyGraded;
        delete cleanAns.isBonusAwarded;
        delete cleanAns.isObjectionResolved;
        if (cleanAns.type === 'mcc' || Array.isArray(cleanAns.selectedOptionIndices) || (cleanAns.type !== 'scc' && cleanAns.type !== 'coding' && cleanAns.type !== 'web' && Array.isArray(cleanAns.selectedOptionIndex))) {
            if (!Array.isArray(cleanAns.selectedOptionIndices) && Array.isArray(cleanAns.selectedOptionIndex)) {
                cleanAns.selectedOptionIndices = cleanAns.selectedOptionIndex.map(Number);
            } else if (Array.isArray(cleanAns.selectedOptionIndices)) {
                cleanAns.selectedOptionIndices = cleanAns.selectedOptionIndices.map(Number);
            } else {
                cleanAns.selectedOptionIndices = [];
            }
            if (cleanAns.selectedOptionIndex === undefined || cleanAns.selectedOptionIndex === null) {
                cleanAns.selectedOptionIndex = cleanAns.selectedOptionIndices.length > 0 ? cleanAns.selectedOptionIndices[0] : null;
            }
        } else if (cleanAns.type === 'scc' || cleanAns.type === 'mcq') {
            if (Array.isArray(cleanAns.selectedOptionIndex)) {
                cleanAns.selectedOptionIndex = cleanAns.selectedOptionIndex.length > 0 ? Number(cleanAns.selectedOptionIndex[0]) : null;
            } else if (cleanAns.selectedOptionIndex !== undefined && cleanAns.selectedOptionIndex !== null) {
                cleanAns.selectedOptionIndex = Number(cleanAns.selectedOptionIndex);
            } else if (Array.isArray(cleanAns.selectedOptionIndices) && cleanAns.selectedOptionIndices.length > 0) {
                cleanAns.selectedOptionIndex = Number(cleanAns.selectedOptionIndices[0]);
            } else {
                cleanAns.selectedOptionIndex = null;
            }
            cleanAns.selectedOptionIndices = cleanAns.selectedOptionIndex !== null ? [cleanAns.selectedOptionIndex] : [];
        }
        if (Array.isArray(cleanAns.testCaseResults)) {
            cleanAns.testCaseResults = cleanAns.testCaseResults.map(tc => ({
                testCaseIndex: tc.testCaseIndex,
                status: tc.status,
                points: Number(tc.points) || 0,
                scoredPoints: Number(tc.scoredPoints) || (tc.status === 'Accepted' || tc.status === 'passed' ? Number(tc.points) || 0 : 0),
                actualOutput: typeof tc.actualOutput === 'string' ? tc.actualOutput.slice(0, 1000) : tc.actualOutput,
                expectedOutput: typeof tc.expectedOutput === 'string' ? tc.expectedOutput.slice(0, 1000) : tc.expectedOutput,
                input: typeof tc.input === 'string' ? tc.input.slice(0, 500) : tc.input
            }));
        }
        return cleanAns;
    });

    try {
        const submission = await findActiveSubmissionByParam(submissionId);
        if (!submission) return res.status(404).json({ error: "Submission not found" });

        if (!isSubmissionOwnerForUser(authUser, submission)) {
            return res.status(403).json({ error: "Access denied: Unauthorized to submit disconnect beacon for another candidate." });
        }

        if (dbState.useMongo) {
            if (submission.status === 'started') {
                submission.status = 'auto-submitted';
                submission.submittedAt = new Date();
                submission.submissionReason = 'disconnect_beacon';
                if (answers && Array.isArray(answers) && answers.length > 0) {
                    submission.answers = sanitizeBeaconAnswers(answers);
                }
                if (proctoringLog) {
                    submission.proctoringLog = reconcileProctoringLog(submission.proctoringLog || {}, proctoringLog);
                }
                if (!submission.proctoringLog) submission.proctoringLog = {};
                if (!submission.proctoringLog.events) submission.proctoringLog.events = [];
                submission.proctoringLog.events.push({
                    timestamp: new Date(),
                    type: 'DISCONNECT_BEACON',
                    isBeaconDisconnect: true,
                    details: 'Candidate closed exam browser tab/window. Finalized via navigator.sendBeacon.'
                });

                const test = await TestConfigModel.findOne({ _id: submission.testId, isDeleted: { $ne: true } });
                if (test) {
                    recalculateMCQScore(submission, test);
                    calculateCodingScoreFast(submission, test);
                    submission.totalScore = submission.evaluation?.totalScore ?? submission.score ?? 0;
                    if (submission.evaluation) {
                        submission.evaluation.evaluatedAt = new Date();
                    }
                }

                // Authoritative EIRF incident calculation
                const eirfEval = evaluateEirfIncident(submission, test);
                submission.hasEirfFlag = eirfEval.hasEirfFlag;
                submission.eirfStatus = eirfEval.eirfStatus;
                submission.flaggedReasons = eirfEval.flaggedReasons;
                submission.pipelineStatus = eirfEval.hasEirfFlag ? 'FLAGGED' : 'CLEARED';

                try {
                    if (typeof submission.markModified === 'function') {
                        submission.markModified('answers');
                        submission.markModified('evaluation');
                    }
                    await submission.save();
                } catch (saveErr) {
                    if (saveErr.name === 'VersionError' || saveErr.name === 'ParallelSaveError') {
                        // Atomic fallback update if concurrent draft save modified version
                        await TestSubmissionModel.updateOne(
                            { _id: submission._id, status: 'started' },
                            {
                                $set: {
                                    status: submission.status,
                                    submissionReason: submission.submissionReason,
                                    submittedAt: submission.submittedAt,
                                    score: submission.score,
                                    totalScore: submission.totalScore,
                                    evaluation: submission.evaluation,
                                    answers: submission.answers,
                                    proctoringLog: submission.proctoringLog,
                                    hasEirfFlag: submission.hasEirfFlag,
                                    eirfStatus: submission.eirfStatus,
                                    flaggedReasons: submission.flaggedReasons,
                                    pipelineStatus: submission.pipelineStatus
                                }
                            }
                        );
                    } else {
                        throw saveErr;
                    }
                }
                console.log(`[BEACON FINALIZED] Submission ${submission.submissionRefId || submissionId} auto-submitted via browser beacon. PipelineStatus: ${submission.pipelineStatus}`);

                // Kick off sequential Gmail EIRF pipeline immediately
                if (submission.hasEirfFlag) {
                    setImmediate(() => {
                        runPipelineTick().catch(() => {});
                    });
                }
            }
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            const sub = db.testSubmissions.find(s => !s.isDeleted && String(s.id || s._id) === String(submission.id || submission._id));
            if (sub && sub.status === 'started') {
                sub.status = 'auto-submitted';
                sub.submittedAt = new Date();
                sub.submissionReason = 'disconnect_beacon';
                if (answers && Array.isArray(answers) && answers.length > 0) {
                    sub.answers = sanitizeBeaconAnswers(answers);
                }
                if (proctoringLog) {
                    sub.proctoringLog = reconcileProctoringLog(sub.proctoringLog || {}, proctoringLog);
                }
                if (!sub.proctoringLog) sub.proctoringLog = {};
                if (!sub.proctoringLog.events) sub.proctoringLog.events = [];
                sub.proctoringLog.events.push({
                    timestamp: new Date(),
                    type: 'DISCONNECT_BEACON',
                    isBeaconDisconnect: true,
                    details: 'Candidate closed exam browser tab/window. Finalized via navigator.sendBeacon.'
                });
                const test = (db.tests || []).find(t => !t.isDeleted && String(t.id || t._id) === String(sub.testId));
                if (test) {
                    recalculateMCQScore(sub, test);
                    calculateCodingScoreFast(sub, test);
                    sub.totalScore = sub.evaluation?.totalScore ?? sub.score ?? 0;
                    if (sub.evaluation) sub.evaluation.evaluatedAt = new Date();
                }
                const eirfEval = evaluateEirfIncident(sub, test);
                sub.hasEirfFlag = eirfEval.hasEirfFlag;
                sub.eirfStatus = eirfEval.eirfStatus;
                sub.flaggedReasons = eirfEval.flaggedReasons;
                sub.pipelineStatus = eirfEval.hasEirfFlag ? 'FLAGGED' : 'CLEARED';

                saveJSONData(db);
                if (sub.hasEirfFlag) {
                    setImmediate(() => {
                        runPipelineTick().catch(() => {});
                    });
                }
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
        const userMongo = resolveToObjectId(String(req.user.id || ''));
        const allowedIds = [
            String(req.user.id || ''),
            String(req.user.studentId || ''),
            String(req.user.username || ''),
            userMongo,
            toBicsId(userMongo)
        ].filter(Boolean);
        if (candidateId) {
            const candNorm = resolveToObjectId(String(candidateId));
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
        const targetTestId = resolveToObjectId(String(testId));
        const targetCandId = resolveToObjectId(String(candidateId));

        let test = null;
        let submission = null;
        if (dbState.useMongo) {
            if (mongoose.Types.ObjectId.isValid(targetTestId)) {
                test = await TestConfigModel.findOne({ _id: targetTestId, isDeleted: { $ne: true } }).lean();
            }
            if (!test) return res.status(404).json({ error: "Test configuration not found." });
            if (test.isPublished === false) {
                return res.status(403).json({ error: "Access denied: This examination is currently unpublished or inactive." });
            }
            if (test.endDate && Date.now() > new Date(test.endDate).getTime()) {
                return res.status(403).json({ error: "Access denied: The examination window has closed." });
            }

            const candFilter = buildCandidateQueryFilter(targetCandId);
            const queryTestId = mongoose.Types.ObjectId.isValid(targetTestId) ? new mongoose.Types.ObjectId(targetTestId) : targetTestId;
            if (candFilter) {
                submission = await TestSubmissionModel.findOne({ ...candFilter, testId: queryTestId, isDeleted: { $ne: true } });
            }
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            test = db.tests.find(t => !t.isDeleted && (String(t._id || '') === targetTestId || String(t.id || '') === targetTestId || String(t._id || '') === String(testId) || String(t.id || '') === String(testId)));
            if (!test) return res.status(404).json({ error: "Test configuration not found." });
            if (test.isPublished === false) {
                return res.status(403).json({ error: "Access denied: This examination is currently unpublished or inactive." });
            }
            if (test.endDate && Date.now() > new Date(test.endDate).getTime()) {
                return res.status(403).json({ error: "Access denied: The examination window has closed." });
            }

            db.testSubmissions = db.testSubmissions || [];
            const reqStudId = String(req.user?.studentId || '');
            submission = db.testSubmissions.find(s => {
                if (s.isDeleted) return false;
                const sTest = s.testId ? resolveToObjectId(String(s.testId)) : '';
                if (sTest !== targetTestId && String(s.testId || '') !== String(testId)) return false;
                const sCand = s.candidateId ? resolveToObjectId(String(s.candidateId)) : '';
                return (
                    (sCand && (sCand === targetCandId || String(s.candidateId) === String(candidateId))) ||
                    (reqStudId && s.studentId && String(s.studentId) === reqStudId)
                );
            });
        }
        if (submission) {
            return res.status(400).json({ error: "You have already started or completed this examination. Re-attempts are not permitted." });
        }

        const tokenStr = crypto.randomBytes(24).toString('hex');
        const expiresAt = new Date(Date.now() + 14400000);

        if (dbState.useMongo) {
            const newToken = new TestTokenModel({
                token: tokenStr,
                candidateId: targetCandId,
                testId: targetTestId
            });
            await newToken.save();
        } else {
            const db = getJSONData();
            db.tokens = db.tokens || [];
            db.tokens = db.tokens.filter(t => (Date.now() - new Date(t.createdAt || 0).getTime()) < 14400000);
            db.tokens.push({
                token: tokenStr,
                candidateId: targetCandId,
                testId: targetTestId,
                createdAt: new Date(),
                expiresAt
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
            tokenDoc = await TestTokenModel.findOne({ token: String(token).trim() });
        } else {
            const db = getJSONData();
            db.tokens = db.tokens || [];
            tokenDoc = db.tokens.find(t => t.token === String(token).trim() && (!t.expiresAt || Date.now() <= new Date(t.expiresAt).getTime()) && (Date.now() - new Date(t.createdAt || 0).getTime()) < 14400000);
        }

        if (!tokenDoc) {
            return res.status(401).json({ error: "Invalid or expired exam token. Please login through the main portal dashboard again." });
        }

        let student = null;
        let test = null;
        const studentIdNorm = resolveToObjectId(String(tokenDoc.candidateId));
        const testIdNorm = resolveToObjectId(String(tokenDoc.testId));

        if (dbState.useMongo) {
            if (mongoose.Types.ObjectId.isValid(studentIdNorm)) {
                student = await CandidateModel.findById(studentIdNorm);
            }
            if (!student) {
                student = await CandidateModel.findOne({ studentId: String(tokenDoc.candidateId) });
            }
            if (mongoose.Types.ObjectId.isValid(testIdNorm)) {
                test = await TestConfigModel.findOne({ _id: testIdNorm, isDeleted: { $ne: true } });
            }
        } else {
            const db = getJSONData();
            student = (db.candidates || []).find(c =>
                resolveToObjectId(String(c._id || c.id || '')) === studentIdNorm ||
                String(c.studentId || '') === String(tokenDoc.candidateId)
            );
            db.tests = db.tests || [];
            test = db.tests.find(t => !t.isDeleted && (
                resolveToObjectId(String(t._id || t.id || '')) === testIdNorm ||
                String(t.id || t._id || '') === String(tokenDoc.testId)
            ));
        }

        if (!student || !test) {
            return res.status(404).json({ error: "Student or Test configuration associated with this token not found." });
        }

        if (test.isPublished === false) {
            return res.status(403).json({ error: "Access denied: This examination is currently unpublished or inactive." });
        }
        if (test.endDate && Date.now() > new Date(test.endDate).getTime()) {
            return res.status(403).json({ error: "Access denied: The examination window has expired." });
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
            const candFilter = buildCandidateQueryFilter(String(student._id || studentIdNorm));
            if (candFilter) {
                submission = await TestSubmissionModel.findOne({ ...candFilter, testId: test._id, isDeleted: { $ne: true } });
            }
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            const studId = String(student.id || student._id);
            const tId = String(test.id || test._id);
            submission = db.testSubmissions.find(s => {
                if (s.isDeleted) return false;
                if (resolveToObjectId(String(s.testId || '')) !== resolveToObjectId(tId) && String(s.testId || '') !== tId) return false;
                return resolveToObjectId(String(s.candidateId || '')) === resolveToObjectId(studId) || (student.studentId && String(s.studentId || '') === String(student.studentId));
            });
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
                course: test.course || '',
                courseCode: test.courseCode || '',
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
router.post('/submit', requireAuth, async (req, res) => {
    const { submissionId, answers, proctoringLog, status, submissionReason } = req.body;

    if (!submissionId) return res.status(400).json({ error: "Submission ID is required" });
    const targetSubId = resolveToObjectId(String(submissionId));

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
                    submission = await findActiveSubmissionByParam(submissionId);
                    if (!submission) return res.status(404).json({ error: "Submission not found" });

                    if (!isSubmissionOwnerForUser(req.user, submission)) {
                        return res.status(403).json({ error: "Access denied: You cannot submit another candidate's examination." });
                    }

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

                    // Authoritative input sanitization: strip client-supplied scores or manual grade flags while preserving executed testCaseResults
                    if (Array.isArray(answers)) {
                        submission.answers = answers.map(a => {
                            const cleanAns = { ...a };
                            delete cleanAns.score;
                            delete cleanAns.isManuallyGraded;
                            delete cleanAns.isBonusAwarded;
                            delete cleanAns.isObjectionResolved;
                            // Normalize MCC multi-choice arrays vs SCC / MCQ single index
                            if (cleanAns.type === 'mcc' || Array.isArray(cleanAns.selectedOptionIndices) || (cleanAns.type !== 'scc' && cleanAns.type !== 'coding' && cleanAns.type !== 'web' && Array.isArray(cleanAns.selectedOptionIndex))) {
                                if (!Array.isArray(cleanAns.selectedOptionIndices) && Array.isArray(cleanAns.selectedOptionIndex)) {
                                    cleanAns.selectedOptionIndices = cleanAns.selectedOptionIndex.map(Number);
                                } else if (Array.isArray(cleanAns.selectedOptionIndices)) {
                                    cleanAns.selectedOptionIndices = cleanAns.selectedOptionIndices.map(Number);
                                } else {
                                    cleanAns.selectedOptionIndices = [];
                                }
                                if (cleanAns.selectedOptionIndex === undefined || cleanAns.selectedOptionIndex === null) {
                                    cleanAns.selectedOptionIndex = cleanAns.selectedOptionIndices.length > 0 ? cleanAns.selectedOptionIndices[0] : null;
                                }
                            } else if (cleanAns.type === 'scc' || cleanAns.type === 'mcq') {
                                if (Array.isArray(cleanAns.selectedOptionIndex)) {
                                    cleanAns.selectedOptionIndex = cleanAns.selectedOptionIndex.length > 0 ? Number(cleanAns.selectedOptionIndex[0]) : null;
                                } else if (cleanAns.selectedOptionIndex !== undefined && cleanAns.selectedOptionIndex !== null) {
                                    cleanAns.selectedOptionIndex = Number(cleanAns.selectedOptionIndex);
                                } else if (Array.isArray(cleanAns.selectedOptionIndices) && cleanAns.selectedOptionIndices.length > 0) {
                                    cleanAns.selectedOptionIndex = Number(cleanAns.selectedOptionIndices[0]);
                                } else {
                                    cleanAns.selectedOptionIndex = null;
                                }
                                cleanAns.selectedOptionIndices = cleanAns.selectedOptionIndex !== null ? [cleanAns.selectedOptionIndex] : [];
                            }
                            if (Array.isArray(cleanAns.testCaseResults)) {
                                cleanAns.testCaseResults = cleanAns.testCaseResults.map(tc => ({
                                    testCaseIndex: tc.testCaseIndex,
                                    status: tc.status,
                                    points: Number(tc.points) || 0,
                                    scoredPoints: Number(tc.scoredPoints) || (tc.status === 'Accepted' || tc.status === 'passed' ? Number(tc.points) || 0 : 0),
                                    actualOutput: typeof tc.actualOutput === 'string' ? tc.actualOutput.slice(0, 1000) : tc.actualOutput,
                                    expectedOutput: typeof tc.expectedOutput === 'string' ? tc.expectedOutput.slice(0, 1000) : tc.expectedOutput,
                                    input: typeof tc.input === 'string' ? tc.input.slice(0, 500) : tc.input
                                }));
                            }
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
                    submission.submissionReason = submissionReason || (submission.status === 'auto-submitted' ? 'system_auto' : 'manual');
                    if (status !== 'started') {
                        submission.submittedAt = new Date();
                    }
                    submission.lastHeartbeatAt = new Date();

                    const test = await TestConfigModel.findOne({ _id: submission.testId, isDeleted: { $ne: true } });
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
                                submission.submissionReason = 'overtime_exceeded';
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
                        submission.totalScore = submission.evaluation?.totalScore ?? submission.score ?? 0;
                    } else {
                        submission.evaluation = {
                            mcqScore: 0,
                            codingScore: 0,
                            webScore: 0,
                            totalScore: 0,
                            score: 0,
                            feedback: '',
                            evaluatedAt: null
                        };
                    }

                    // 1. Authoritative EIRF incident calculation (processed before atomic save to eliminate duplicate DB roundtrips)
                    if (isFinalSubmission) {
                        const eirfEval = evaluateEirfIncident(submission, test);
                        submission.hasEirfFlag = eirfEval.hasEirfFlag;
                        submission.eirfStatus = eirfEval.eirfStatus;
                        submission.flaggedReasons = eirfEval.flaggedReasons;
                        submission.pipelineStatus = eirfEval.hasEirfFlag ? 'FLAGGED' : 'CLEARED';

                        // Explicitly append final submission proctoring event for compliance audit trail
                        if (!submission.proctoringLog) submission.proctoringLog = {};
                        if (!Array.isArray(submission.proctoringLog.events)) submission.proctoringLog.events = [];
                        const finalEvType = submission.status === 'auto-submitted' ? 'TEST_AUTO_SUBMITTED' : 'TEST_SUBMITTED';
                        const finalEvDesc = submission.status === 'auto-submitted'
                            ? `Examination automatically finalized and submitted by proctoring engine (${submission.submissionReason || 'system_auto'}).`
                            : 'Candidate completed, finalized, and submitted examination answers.';
                        if (!submission.proctoringLog.events.some(e => e.type === finalEvType)) {
                            submission.proctoringLog.events.push({
                                timestamp: new Date(),
                                type: finalEvType,
                                details: finalEvDesc
                            });
                        }
                    }

                    if (typeof submission.markModified === 'function') {
                        submission.markModified('answers');
                        submission.markModified('evaluation');
                    }
                    await submission.save();
                    break;
                } catch (saveErr) {
                    if (saveErr.name === 'VersionError' || saveErr.name === 'ParallelSaveError') {
                        retries--;
                        if (retries === 0) {
                            const atomicRes = await TestSubmissionModel.updateOne(
                                { _id: submission._id, status: 'started' },
                                {
                                    $set: {
                                        status: submission.status,
                                        submissionReason: submission.submissionReason,
                                        submittedAt: submission.submittedAt,
                                        lastHeartbeatAt: submission.lastHeartbeatAt,
                                        answers: submission.answers,
                                        proctoringLog: submission.proctoringLog,
                                        score: submission.score,
                                        totalScore: submission.totalScore,
                                        evaluation: submission.evaluation,
                                        hasEirfFlag: submission.hasEirfFlag,
                                        eirfStatus: submission.eirfStatus,
                                        flaggedReasons: submission.flaggedReasons,
                                        pipelineStatus: submission.pipelineStatus
                                    }
                                }
                            );
                            if (atomicRes.modifiedCount === 0) {
                                const latestSub = await TestSubmissionModel.findById(submission._id);
                                if (latestSub && ['submitted', 'auto-submitted', 'evaluated'].includes(latestSub.status)) {
                                    const earlyPayload = latestSub.toObject ? latestSub.toObject() : { ...latestSub };
                                    earlyPayload.bicsId = toBicsId(latestSub._id || latestSub.id);
                                    return res.status(409).json({
                                        error: `Exam attempt is permanently closed (Status: ${latestSub.status}). Answers are frozen and cannot be modified.`,
                                        status: latestSub.status,
                                        isFinalized: true,
                                        submission: earlyPayload
                                    });
                                }
                                throw saveErr;
                            }
                            break;
                        }
                        await new Promise(resolve => setTimeout(resolve, 50 * (6 - retries)));
                    } else {
                        throw saveErr;
                    }
                }
            }
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            const activeSub = await findActiveSubmissionByParam(submissionId);
            if (!activeSub) return res.status(404).json({ error: "Submission not found" });

            submission = db.testSubmissions.find(s => !s.isDeleted && String(s.id || s._id) === String(activeSub.id || activeSub._id));
            if (!submission) return res.status(404).json({ error: "Submission not found" });

            if (!isSubmissionOwnerForUser(req.user, submission)) {
                return res.status(403).json({ error: "Access denied: You cannot submit another candidate's examination." });
            }

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

            if (Array.isArray(answers)) {
                submission.answers = answers.map(a => {
                    const cleanAns = { ...a };
                    delete cleanAns.score;
                    delete cleanAns.isManuallyGraded;
                    delete cleanAns.isBonusAwarded;
                    delete cleanAns.isObjectionResolved;
                    // Normalize MCC multi-choice arrays vs SCC / MCQ single index
                    if (cleanAns.type === 'mcc' || Array.isArray(cleanAns.selectedOptionIndices) || (cleanAns.type !== 'scc' && cleanAns.type !== 'coding' && cleanAns.type !== 'web' && Array.isArray(cleanAns.selectedOptionIndex))) {
                        if (!Array.isArray(cleanAns.selectedOptionIndices) && Array.isArray(cleanAns.selectedOptionIndex)) {
                            cleanAns.selectedOptionIndices = cleanAns.selectedOptionIndex.map(Number);
                        } else if (Array.isArray(cleanAns.selectedOptionIndices)) {
                            cleanAns.selectedOptionIndices = cleanAns.selectedOptionIndices.map(Number);
                        } else {
                            cleanAns.selectedOptionIndices = [];
                        }
                        if (cleanAns.selectedOptionIndex === undefined || cleanAns.selectedOptionIndex === null) {
                            cleanAns.selectedOptionIndex = cleanAns.selectedOptionIndices.length > 0 ? cleanAns.selectedOptionIndices[0] : null;
                        }
                    } else if (cleanAns.type === 'scc' || cleanAns.type === 'mcq') {
                        if (Array.isArray(cleanAns.selectedOptionIndex)) {
                            cleanAns.selectedOptionIndex = cleanAns.selectedOptionIndex.length > 0 ? Number(cleanAns.selectedOptionIndex[0]) : null;
                        } else if (cleanAns.selectedOptionIndex !== undefined && cleanAns.selectedOptionIndex !== null) {
                            cleanAns.selectedOptionIndex = Number(cleanAns.selectedOptionIndex);
                        } else if (Array.isArray(cleanAns.selectedOptionIndices) && cleanAns.selectedOptionIndices.length > 0) {
                            cleanAns.selectedOptionIndex = Number(cleanAns.selectedOptionIndices[0]);
                        } else {
                            cleanAns.selectedOptionIndex = null;
                        }
                        cleanAns.selectedOptionIndices = cleanAns.selectedOptionIndex !== null ? [cleanAns.selectedOptionIndex] : [];
                    }
                    if (Array.isArray(cleanAns.testCaseResults)) {
                        cleanAns.testCaseResults = cleanAns.testCaseResults.map(tc => ({
                            testCaseIndex: tc.testCaseIndex,
                            status: tc.status,
                            points: Number(tc.points) || 0,
                            scoredPoints: Number(tc.scoredPoints) || (tc.status === 'Accepted' || tc.status === 'passed' ? Number(tc.points) || 0 : 0),
                            actualOutput: typeof tc.actualOutput === 'string' ? tc.actualOutput.slice(0, 1000) : tc.actualOutput,
                            expectedOutput: typeof tc.expectedOutput === 'string' ? tc.expectedOutput.slice(0, 1000) : tc.expectedOutput,
                            input: typeof tc.input === 'string' ? tc.input.slice(0, 500) : tc.input,
                            isSample: Boolean(tc.isSample),
                            executionTimeMs: Number(tc.executionTimeMs || 0),
                            memoryUsedKb: Number(tc.memoryUsedKb || 0)
                        }));
                    }
                    if (cleanAns.compileError) {
                        cleanAns.compileError = String(cleanAns.compileError).slice(0, 2000);
                    }
                    if (cleanAns.consoleTab) {
                        cleanAns.consoleTab = String(cleanAns.consoleTab).slice(0, 20);
                    }
                    return cleanAns;
                });
            } else {
                submission.answers = [];
            }
            if (proctoringLog) {
                submission.proctoringLog = reconcileProctoringLog(submission.proctoringLog || {}, proctoringLog);
            }
            const ALLOWED_STATUSES = ['started', 'submitted', 'auto-submitted'];
            submission.status = ALLOWED_STATUSES.includes(status) ? status : 'submitted';
            submission.submissionReason = submissionReason || (submission.status === 'auto-submitted' ? 'system_auto' : 'manual');
            if (status !== 'started') {
                submission.submittedAt = new Date();
            }
            submission.lastHeartbeatAt = new Date();

            db.tests = db.tests || [];
            const test = db.tests.find(t => !t.isDeleted && (String(t.id || '') === String(submission.testId) || String(t._id || '') === String(submission.testId)));
            if (test) {
                // Authoritative server-side wall-clock deadline validation (Item 2.3)
                if (submission.startedAt && isFinalSubmission) {
                    const elapsedMs = Date.now() - new Date(submission.startedAt).getTime();
                    const allowedDurationMs = (test.duration || 60) * 60 * 1000;
                    const GRACE_PERIOD_MS = 120 * 1000;
                    if (elapsedMs > allowedDurationMs + GRACE_PERIOD_MS) {
                        const overtimeSec = Math.round((elapsedMs - allowedDurationMs) / 1000);
                        submission.status = 'auto-submitted';
                        submission.submissionReason = 'overtime_exceeded';
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
                submission.totalScore = submission.evaluation?.totalScore ?? submission.score ?? 0;
            } else {
                submission.evaluation = {
                    mcqScore: 0,
                    codingScore: 0,
                    webScore: 0,
                    totalScore: 0,
                    score: 0,
                    feedback: '',
                    evaluatedAt: null
                };
            }

            // 1. Authoritative EIRF incident calculation (processed before save to eliminate duplicate writes)
            if (isFinalSubmission) {
                const eirfEval = evaluateEirfIncident(submission, test);
                submission.hasEirfFlag = eirfEval.hasEirfFlag;
                submission.eirfStatus = eirfEval.eirfStatus;
                submission.flaggedReasons = eirfEval.flaggedReasons;
                submission.pipelineStatus = eirfEval.hasEirfFlag ? 'FLAGGED' : 'CLEARED';

                // Explicitly append final submission proctoring event for compliance audit trail
                if (!submission.proctoringLog) submission.proctoringLog = {};
                if (!Array.isArray(submission.proctoringLog.events)) submission.proctoringLog.events = [];
                const finalEvType = submission.status === 'auto-submitted' ? 'TEST_AUTO_SUBMITTED' : 'TEST_SUBMITTED';
                const finalEvDesc = submission.status === 'auto-submitted'
                    ? `Examination automatically finalized and submitted by proctoring engine (${submission.submissionReason || 'system_auto'}).`
                    : 'Candidate completed, finalized, and submitted examination answers.';
                if (!submission.proctoringLog.events.some(e => e.type === finalEvType)) {
                    submission.proctoringLog.events.push({
                        timestamp: new Date(),
                        type: finalEvType,
                        details: finalEvDesc
                    });
                }
            }

            saveJSONData(db);
        }

        // Asynchronous post-submission side effects (non-blocking so candidate UI returns in milliseconds)
        if (status !== 'started') {
            const examToken = req.headers['x-exam-token'] || req.query.token || (req.body && req.body.token);
            if (dbState.useMongo) {
                if (examToken && typeof examToken === 'string') {
                    await TestTokenModel.deleteOne({ token: examToken.trim() }).catch(() => {});
                }
                if (submission._id) {
                    await TestTokenModel.deleteMany({ sessionSubmissionId: submission._id }).catch(() => {});
                }
            } else {
                const db = getJSONData();
                if (Array.isArray(db.tokens)) {
                    db.tokens = db.tokens.filter(t => t.token !== (typeof examToken === 'string' ? examToken.trim() : '') && String(t.sessionSubmissionId) !== String(submission.id || submission._id));
                    saveJSONData(db);
                }
            }

            logSystemAction(
                submission?.candidateName || 'Candidate', 
                status === 'auto-submitted' ? 'TEST_AUTO_SUBMITTED' : 'TEST_SUBMITTED', 
                `Candidate submitted examination answers for "${submission?.testTitle || 'Exam'}" (${submission?.testId || 'ID'}) with status ${status || 'submitted'}`, 
                'info'
            ).catch(() => {});

            if (submission.hasEirfFlag) {
                // Trigger sequential EIRF triage pipeline immediately in background
                setImmediate(() => {
                    runPipelineTick().catch(err => {
                        console.error("[EIRF_PIPELINE] Asynchronous submit trigger error:", err);
                    });
                });
            } else {
                // Clean submission (no EIRF flag): dispatch confirmation email directly (protected by email claim mutex)
                sendTestSubmittedEmail(submission._id || submission.id, {
                    triggerSource: 'exam_clean_submit'
                }).catch(err => {
                    console.error("[TESTS_SUBMIT] Error sending immediate submission confirmation email:", err.message);
                });
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
        const submission = await findActiveSubmissionByParam(submissionId);
        if (!submission) {
            return res.status(404).json({ error: "Exam submission not found." });
        }
        if (!isSubmissionOwnerForUser(req.user, submission)) {
            return res.status(403).json({ error: "Access denied: You cannot request reevaluation for another candidate." });
        }

        let associatedTest = null;
        if (dbState.useMongo) {
            associatedTest = await TestConfigModel.findOne({ _id: submission.testId, isDeleted: { $ne: true } }).lean();
        } else {
            const dbCheck = getJSONData();
            associatedTest = (dbCheck.tests || []).find(t => !t.isDeleted && String(t._id || t.id) === String(submission.testId));
        }
        if (associatedTest && associatedTest.verificationStatus === 'closed') {
            return res.status(403).json({ error: "The verification and grievance window for this examination is closed." });
        }

        const reevaluationPayload = {
            applied: true,
            appliedAt: new Date(),
            complaintText,
            complainedQuestions: complainedQuestions || [],
            proofImages: proofImages || [],
            status: 'pending',
            resolutionFeedback: ''
        };

        if (dbState.useMongo) {
            submission.reevaluation = reevaluationPayload;
            await submission.save();
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            const jsonSub = db.testSubmissions.find(s => !s.isDeleted && String(s.id || s._id) === String(submission.id || submission._id));
            if (!jsonSub) {
                return res.status(404).json({ error: "Exam submission not found." });
            }
            jsonSub.reevaluation = reevaluationPayload;
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
router.get('/evaluation/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
        const submission = await findActiveSubmissionByParam(id);
        if (!submission) {
            return res.status(404).json({ success: false, error: "Submission not found." });
        }

        if (!isSubmissionOwnerForUser(req.user, submission)) {
            return res.status(403).json({ success: false, error: "Access denied: You do not have permission to view another candidate's evaluation." });
        }

        let test = null;
        let student = null;
        if (dbState.useMongo) {
            test = await TestConfigModel.findOne({ _id: submission.testId, isDeleted: { $ne: true } });
            if (submission.candidateId) {
                student = await CandidateModel.findById(submission.candidateId);
            } else if (submission.studentId) {
                student = await CandidateModel.findOne({ studentId: submission.studentId });
            }
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            db.candidates = db.candidates || [];
            test = db.tests.find(t => !t.isDeleted && (String(t.id || '') === String(submission.testId) || String(t._id || '') === String(submission.testId)));
            student = db.candidates.find(c =>
                (submission.candidateId && (String(c.id || '') === String(submission.candidateId) || String(c._id || '') === String(submission.candidateId))) ||
                (submission.studentId && String(c.studentId || '') === String(submission.studentId))
            );
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

        const encryptedSubId = toBicsId(submission._id || submission.id);
        const encryptedCandidateId = toBicsId(student?._id || student?.id || submission.candidateId);
        const encryptedTestId = toBicsId(test._id || test.id);

        return res.json({
            success: true,
            verificationStatus: vStatus,
            candidate: {
                id: encryptedCandidateId,
                name: student?.name || submission.candidateName || 'Candidate',
                studentId: student?.studentId || submission.studentId || '',
                email: submission.candidateEmail || student?.registrationData?.collegeEmail || student?.registrationData?.personalEmail || student?.username || 'candidate@bics.edu',
                photoUrl: student?.registrationData?.photoUrl || '/public/uploads/default-photo.png'
            },
            test: {
                id: encryptedTestId,
                title: test.title,
                course: test.course || '',
                courseCode: test.courseCode || '',
                duration: test.duration,
                marks: test.marks,
                instructions: test.instructions,
                verificationStatus: vStatus,
                questions: test.questions || []
            },
            submission: {
                id: encryptedSubId,
                bicsId: encryptedSubId,
                submissionRefId: submission.submissionRefId || null,
                status: submission.status,
                verificationStatus: submission.verificationStatus || 'active',
                eirfStatus: submission.eirfStatus || 'none',
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

// 10. Execute & test code runner endpoint (Quick Test + Full Submit Code against Sample + Hidden cases)
router.post('/run', async (req, res) => {
    const isNonProd = process.env.NODE_ENV !== 'production' || !process.env.NODE_ENV;
    // Dual authorization: check JWT or valid non-expired TestToken (dev bypass disabled in production)
    let isAuthorized = false;
    if (req.user) {
        isAuthorized = true;
    } else {
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.slice(7).trim();
            const decoded = verifyToken(token);
            if (decoded) {
                req.user = decoded;
                isAuthorized = true;
            }
        }
    }

    if (!isAuthorized) {
        const examToken = req.headers['x-exam-token'] || (req.body && req.body.token) || req.query?.token;
        if (examToken) {
            if (dbState.useMongo) {
                const tokenDoc = await TestTokenModel.findOne({ token: String(examToken).trim() });
                if (tokenDoc && (!tokenDoc.expiresAt || Date.now() <= new Date(tokenDoc.expiresAt).getTime())) {
                    isAuthorized = true;
                }
            } else {
                const db = getJSONData();
                const tokenDoc = (db.tokens || []).find(t => t.token === String(examToken).trim());
                if (tokenDoc && (!tokenDoc.expiresAt || Date.now() <= new Date(tokenDoc.expiresAt).getTime())) {
                    isAuthorized = true;
                }
            }
            if (!isAuthorized && isNonProd && String(examToken).startsWith('tok_test')) {
                isAuthorized = true;
            }
        }
    }

    if (!isAuthorized && isNonProd) {
        isAuthorized = true;
    }

    if (!isAuthorized) {
        return res.status(401).json({ error: "Unauthorized: Active exam session or authentication token required." });
    }

    let { sourceCode, testCases, timeLimitMs, memoryLimitMb, questionId, testId } = req.body;
    if (!sourceCode) {
        return res.status(400).json({ error: "sourceCode is required." });
    }

    let casesToRun = Array.isArray(testCases) ? [...testCases] : [];

    // If questionId is provided (e.g. from Submit Code), retrieve authoritative question configuration containing all sample and hidden test cases
    if (questionId) {
        try {
            let questionDoc = null;
            const targetTestId = testId ? resolveToObjectId(String(testId)) : null;

            if (dbState.useMongo) {
                if (targetTestId && mongoose.Types.ObjectId.isValid(targetTestId)) {
                    const testDoc = await TestConfigModel.findOne({ _id: targetTestId, isDeleted: { $ne: true } }).lean();
                    if (testDoc && Array.isArray(testDoc.questions)) {
                        questionDoc = testDoc.questions.find(q => String(q.id || q._id) === String(questionId));
                    }
                }
                if (!questionDoc) {
                    const qTarget = resolveToObjectId(String(questionId));
                    const testDoc = await TestConfigModel.findOne({
                        isDeleted: { $ne: true },
                        $or: [
                            ...(mongoose.Types.ObjectId.isValid(qTarget) ? [{ "questions._id": qTarget }] : []),
                            { "questions.id": String(questionId) }
                        ]
                    }).lean();
                    if (testDoc && Array.isArray(testDoc.questions)) {
                        questionDoc = testDoc.questions.find(q => String(q.id || q._id) === String(questionId));
                    }
                }
            } else {
                const db = getJSONData();
                const tests = (db.tests || []).filter(t => !t.isDeleted);
                for (const t of tests) {
                    if (targetTestId && String(t.id || t._id) !== targetTestId) continue;
                    if (Array.isArray(t.questions)) {
                        const found = t.questions.find(q => String(q.id || q._id) === String(questionId));
                        if (found) {
                            questionDoc = found;
                            break;
                        }
                    }
                }
            }

            if (questionDoc && Array.isArray(questionDoc.testCases) && questionDoc.testCases.length > 0) {
                casesToRun = questionDoc.testCases;
                timeLimitMs = timeLimitMs || questionDoc.timeLimitMs || 2000;
                memoryLimitMb = memoryLimitMb || questionDoc.memoryLimitMb || 128;
            }
        } catch (err) {
            console.warn("[routes/tests] Failed to load authoritative question test cases:", err.message);
        }
    }

    if (!casesToRun || casesToRun.length === 0) {
        return res.status(400).json({ error: "No test cases provided or found for question." });
    }

    try {
        const result = await executeCode(sourceCode, casesToRun, timeLimitMs, memoryLimitMb);

        // Sanitize output for hidden test cases for candidate clients, expose full inputs/outputs ONLY to verified admins
        if (result && Array.isArray(result.results)) {
            const isAdminRequester = Boolean(
                req.user && (req.user.role === 'admin' || req.user.role === 'superadmin' || req.user.isAdmin)
            );

            result.results = result.results.map((r, idx) => {
                const originalTc = casesToRun[idx] || {};
                const isSample = originalTc.isSample === true || originalTc.isCustom === true;

                if (isAdminRequester) {
                    return {
                        ...r,
                        isSample,
                        points: originalTc.points !== undefined ? originalTc.points : (r.points || 0),
                        input: (r.input !== undefined && r.input !== null && !String(r.input).includes('[Hidden')) ? r.input : (originalTc.input ?? originalTc.sampleInput ?? ''),
                        expectedOutput: (r.expectedOutput !== undefined && r.expectedOutput !== null && !String(r.expectedOutput).includes('[Hidden')) ? r.expectedOutput : (originalTc.output ?? originalTc.expectedOutput ?? ''),
                        actualOutput: (r.actualOutput !== undefined && r.actualOutput !== null && !String(r.actualOutput).includes('[Hidden]')) ? r.actualOutput : (r.stdout ?? (r.status === 'Accepted' ? (originalTc.output ?? originalTc.expectedOutput ?? '') : ''))
                    };
                }

                return {
                    ...r,
                    isSample,
                    points: originalTc.points !== undefined ? originalTc.points : (r.points || 0),
                    input: isSample ? r.input : "[Hidden Benchmark Case]",
                    expectedOutput: isSample ? r.expectedOutput : "[Hidden]",
                    actualOutput: isSample ? (r.actualOutput !== undefined ? r.actualOutput : r.stdout) : (r.status === 'Accepted' ? '[Hidden]' : '[Hidden Output]')
                };
            });
        }

        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
});

// Official Online Test Report Form (OTRF) PDF Generator Endpoint
router.get('/otrf-report/:idParam', requireAuth, async (req, res) => {
    try {
        const { idParam } = req.params;
        const { findSubmissionByAnyId } = require('../utils/submissionMigrator');
        const { generateOtrfReportPdfBuffer, persistOtrfPdfArtifact } = require('../services/pdf/otrfReportPdf');
        const { EIRFReportModel } = require('../models');

        const submission = await findSubmissionByAnyId(idParam);
        if (!submission) {
            return res.status(404).json({ error: 'Test submission record not found.' });
        }

        if (!isSubmissionOwnerForUser(req.user, submission)) {
            return res.status(403).json({ error: 'Forbidden: You are not authorized to view or download this OTRF transcript.' });
        }

        let test = null;
        let candidate = null;
        let eirfReport = null;
        let systemConfig = null;

        const resolvedTestId = submission.testId ? resolveToObjectId(String(submission.testId)) : '';
        const resolvedCandId = submission.candidateId ? resolveToObjectId(String(submission.candidateId)) : '';

        if (dbState.useMongo) {
            systemConfig = await ConfigModel.findOne().lean();
            if (resolvedTestId && mongoose.Types.ObjectId.isValid(resolvedTestId)) {
                test = await TestConfigModel.findById(resolvedTestId).lean();
            }
            if (resolvedCandId && mongoose.Types.ObjectId.isValid(resolvedCandId)) {
                candidate = await CandidateModel.findById(resolvedCandId).lean();
            }
            if (!candidate && submission.studentId) {
                candidate = await CandidateModel.findOne({ studentId: String(submission.studentId) }).lean();
            }
            if (submission.eirfReportId) {
                eirfReport = await EIRFReportModel.findOne({ reportId: submission.eirfReportId }).lean();
            }
        } else {
            const db = getJSONData();
            systemConfig = db.config || null;
            if (submission.testId) {
                test = (db.tests || []).find(t =>
                    String(t.id || t._id) === String(submission.testId) ||
                    (resolvedTestId && String(t.id || t._id) === String(resolvedTestId))
                ) || null;
            }
            if (submission.candidateId) {
                candidate = (db.candidates || []).find(c =>
                    String(c.id || c._id) === String(submission.candidateId) ||
                    (resolvedCandId && String(c.id || c._id) === String(resolvedCandId))
                ) || null;
            }
            if (!candidate && submission.studentId) {
                candidate = (db.candidates || []).find(c => String(c.studentId) === String(submission.studentId)) || null;
            }
            if (submission.eirfReportId) {
                eirfReport = (db.eirfReports || []).find(r => r.reportId === submission.eirfReportId) || null;
            }
        }

        const reqProto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
        const reqHost = req.get('host');
        const reqServerBase = reqHost ? `${reqProto}://${reqHost}` : null;

        const pdfBuffer = await generateOtrfReportPdfBuffer({
            submission,
            test,
            candidate,
            eirfReport,
            systemConfig,
            verificationClosureDate: submission.verificationClosedAt || test?.verificationClosedAt || submission.submittedAt,
            serverBaseUrl: reqServerBase
        });

        const artifact = await persistOtrfPdfArtifact({
            submission,
            pdfBuffer,
            options: { serverBaseUrl: reqServerBase }
        });

        if (artifact?.url && artifact.url !== submission.otrfPdfUrl) {
            submission.otrfPdfUrl = artifact.url;
            if (dbState.useMongo && mongoose.Types.ObjectId.isValid(submission._id)) {
                await TestSubmissionModel.updateOne(
                    { _id: submission._id },
                    { $set: { otrfPdfUrl: artifact.url } }
                );
            } else {
                const db = getJSONData();
                const target = (db.testSubmissions || []).find(s => String(s._id || s.id) === String(submission._id || submission.id));
                if (target) {
                    target.otrfPdfUrl = artifact.url;
                    saveJSONData(db);
                }
            }
        }

        const filename = `otrf-report-${submission.submissionRefId || submission._id || 'record'}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        return res.end(pdfBuffer);
    } catch (err) {
        console.error('[OTRF_REPORT_ROUTE] Error generating OTRF PDF:', err);
        return res.status(500).json({ error: `Failed to generate OTRF document: ${err.message}` });
    }
});

router.sanitizeQuestionForCandidate = sanitizeQuestionForCandidate;
router.reconcileProctoringLog = reconcileProctoringLog;
router.recalculateMCQScore = recalculateMCQScore;
router.calculateCodingScoreFast = calculateCodingScoreFast;

module.exports = router;
