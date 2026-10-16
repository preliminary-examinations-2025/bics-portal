const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const { TestConfigModel, TestSubmissionModel, TestTokenModel, CandidateModel } = require('../models');
const { dbState, getJSONData, saveJSONData } = require('../config/db');
const { buildCandidateQueryFilter } = require('../config/constants');
const { logSystemAction } = require('../utils/logger');
const { encryptEirfPayload } = require('../utils/cipher');
const { recalculateMCQScore, calculateCodingScoreFast } = require('../utils/scoreCalculator');
const { sendEirfNoticeEmail } = require('../utils/email');
const { executeCode } = require('../utils/codeRunner');
const { authenticateToken, requireAuth, requireAdmin, requireOwnerOrAdmin } = require('../middleware/auth');
const { isBicsId, toMongoId, toBicsId } = require('../utils/bicsId');

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
                        .select('testId status eirfStatus hasEirfFlag startedAt')
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
                if (test) {
                    recalculateMCQScore(sub, test);
                }
            } else {
                const db = getJSONData();
                db.tests = db.tests || [];
                test = db.tests.find(t => (t.id || t._id).toString() === testId.toString());
                if (test) {
                    const dbSub = db.testSubmissions.find(s => s.id === sub.id || s._id === sub._id);
                    if (dbSub) {
                        recalculateMCQScore(dbSub, test);
                        saveJSONData(db);
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
    const log = { ...existingLog };
    log.events = Array.isArray(log.events) ? [...log.events] : [];

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

    // 2. Count authoritative violations from persisted events log
    const eventFullscreenExits = log.events.filter(e => e.type === 'FULLSCREEN_EXIT').length;
    const eventTabSwitches = log.events.filter(e => e.type === 'TAB_SWITCH').length;
    const eventInspectAttempts = log.events.filter(e => e.type === 'DEVTOOLS_OPENED' || e.type === 'INSPECT_ATTEMPT').length;
    const eventClipboardAttempts = log.events.filter(e => e.type === 'CLIPBOARD_ATTEMPT').length;

    // 3. Monotonic high-water mark: max of (existing in DB, client report, count of events in log)
    log.fullscreenExits = Math.max(
        Number(existingLog.fullscreenExits || 0),
        Number(incomingLog?.fullscreenExits || 0),
        eventFullscreenExits
    );
    log.tabSwitches = Math.max(
        Number(existingLog.tabSwitches || 0),
        Number(incomingLog?.tabSwitches || 0),
        eventTabSwitches
    );
    log.inspectAttempts = Math.max(
        Number(existingLog.inspectAttempts || 0),
        Number(incomingLog?.inspectAttempts || 0),
        eventInspectAttempts
    );
    log.clipboardAttempts = Math.max(
        Number(existingLog.clipboardAttempts || 0),
        Number(incomingLog?.clipboardAttempts || 0),
        eventClipboardAttempts
    );
    log.webcamStatus = incomingLog?.webcamStatus || existingLog.webcamStatus || 'active';

    return log;
}

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
            network: networkMetadata
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
                securityMetadata: enrichedSecurityMetadata,
                proctoringLog: { fullscreenExits: 0, tabSwitches: 0, inspectAttempts: 0, clipboardAttempts: 0, webcamStatus: 'active', events: [], snapshots: [] },
                answers: []
            };
            db.testSubmissions.push(submission);
            saveJSONData(db);
        }

        await logSystemAction(candidateName || studentId || 'Candidate', 'TEST_STARTED', `Candidate started the examination "${test.title}" (${id})`, 'info');
        return res.json({ success: true, submission });
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

    try {
        const now = new Date();
        if (dbState.useMongo) {
            const sub = await TestSubmissionModel.findByIdAndUpdate(
                submissionId,
                { $set: { lastHeartbeatAt: now } },
                { new: true, select: 'status startedAt' }
            );
            if (!sub) return res.status(404).json({ error: "Submission session not found" });
            return res.json({ success: true, status: sub.status, serverTime: now.getTime() });
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            const sub = db.testSubmissions.find(s => String(s.id || s._id) === String(submissionId));
            if (!sub) return res.status(404).json({ error: "Submission session not found" });
            sub.lastHeartbeatAt = now;
            saveJSONData(db);
            return res.json({ success: true, status: sub.status, serverTime: now.getTime() });
        }
    } catch (e) {
        console.error("Heartbeat error:", e.message);
        return res.status(500).json({ error: "Failed to record heartbeat" });
    }
});

// 4.2 Browser Beacon on Disconnect / Tab Close (Item 2.4)
router.post('/beacon-disconnect', express.json({ type: ['application/json', 'text/plain', '*/*'] }), async (req, res) => {
    let payload = req.body;
    if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch (_) {}
    }
    const { submissionId, answers, proctoringLog } = payload || {};
    if (!submissionId) return res.status(400).json({ error: "Submission ID required" });

    try {
        if (dbState.useMongo) {
            const submission = await TestSubmissionModel.findById(submissionId);
            if (submission && submission.status === 'started') {
                submission.status = 'auto-submitted';
                submission.submittedAt = new Date();
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
        if (submission && submission.status !== 'started') {
            return res.status(400).json({ error: "You have already completed and submitted this examination. Re-attempts are not permitted." });
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

        return res.json({
            success: true,
            token: authToken,
            authToken: authToken,
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
            submission: submission
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

    const isFinalSubmission = status !== 'started';

    if (isFinalSubmission) {
        if (activeSubmissionsProcessing.has(submissionId)) {
            return res.status(429).json({ error: "Submission is already being processed. Please wait." });
        }
        activeSubmissionsProcessing.add(submissionId);
    }

    try {
        let submission = null;
        if (dbState.useMongo) {
            let retries = 5;
            while (retries > 0) {
                try {
                    submission = await TestSubmissionModel.findById(submissionId);
                    if (!submission) return res.status(404).json({ error: "Submission not found" });

                    if (isFinalSubmission && (submission.status === 'submitted' || submission.status === 'auto-submitted' || submission.status === 'evaluated')) {
                        return res.json({ success: true, submission });
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
            submission = db.testSubmissions.find(s => s.id === submissionId || s._id === submissionId);
            if (!submission) return res.status(404).json({ error: "Submission not found" });

            if (isFinalSubmission && (submission.status === 'submitted' || submission.status === 'auto-submitted' || submission.status === 'evaluated')) {
                return res.json({ success: true, submission });
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

        if (status !== 'started') {
            await logSystemAction(submission?.candidateName || 'Candidate', status === 'auto-submitted' ? 'TEST_AUTO_SUBMITTED' : 'TEST_SUBMITTED', `Candidate submitted examination answers for "${submission?.testTitle || 'Exam'}" (${submission?.testId || 'ID'}) with status ${status || 'submitted'}`, 'info');
        }

        if (status !== 'started') {
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
            const isFlagged = status === 'auto-submitted' || totalWarnings >= 1 || hasLongExit || hasNetworkOffline || hasMinorThreshold || Boolean(req.body.hasEirfFlag);

            if (isFlagged) {
                submission.hasEirfFlag = true;
                if (!submission.eirfStatus || submission.eirfStatus === 'none') {
                    submission.eirfStatus = 'pending';
                }

                if (!submission.eirfNoticeEmailSent) {
                    submission.eirfNoticeEmailSent = true;

                    let recipientEmail = submission.candidateEmail;
                    if (!recipientEmail && submission.studentId) {
                        const cand = dbState.useMongo
                            ? await CandidateModel.findOne({ $or: [{ studentId: submission.studentId }, { _id: submission.candidateId }] })
                            : (getJSONData().candidates || []).find(c => c.studentId === submission.studentId || c.id === submission.studentId);
                        if (cand) {
                            recipientEmail = cand.personalEmail || cand.registrationData?.personalEmail || cand.email;
                        }
                    }
                    if (!recipientEmail) {
                        recipientEmail = 'preliminaryexaminations@gmail.com';
                    }

                    const incidentParts = [];
                    if (fsExits > 0) incidentParts.push(`${fsExits} Fullscreen Exit(s) (Max: ${maxFsSec}s)`);
                    if (tabSwitches > 0) incidentParts.push(`${tabSwitches} Tab Switch(es) / Focus Loss (Max: ${maxTabSec}s)`);
                    if (inspectAttempts > 0) incidentParts.push(`${inspectAttempts} Developer Tools / Inspect Element Attempt(s)`);
                    if (status === 'auto-submitted') incidentParts.push(`Attempt Auto-Submitted due to reaching 3 compliance warnings`);

                    const consolidatedSummary = incidentParts.length > 0
                        ? `Recorded Session Incidents: ${incidentParts.join('; ')}.`
                        : `Proctoring alert flagged for post-exam incident review (${totalWarnings} total warnings).`;

                    sendEirfNoticeEmail(
                        recipientEmail,
                        submission.candidateName || 'Candidate',
                        submission.testTitle || 'BICS Examination',
                        consolidatedSummary,
                        submission._id || submission.id
                    ).catch(e => console.error("EIRF single consolidated notice email error:", e));
                }

                if (dbState.useMongo && submission.save) {
                    await submission.save();
                } else if (!dbState.useMongo) {
                    const db = getJSONData();
                    saveJSONData(db);
                }
            }
        }

        return res.json({ success: true, submission });
    } catch (e) {
        console.error("POST /api/tests/submit failed:", e);
        await logSystemAction('system', 'TECHNICAL_ERROR', `Failed to process exam submission for candidate submission ID ${submissionId}: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    } finally {
        if (isFinalSubmission) {
            activeSubmissionsProcessing.delete(submissionId);
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

// 9. Get Submission Verification Data for OT Terminal
router.get('/submission-verification/:id', async (req, res) => {
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
