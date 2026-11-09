const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { TestConfigModel, TestSubmissionModel, RecycleBinModel } = require('../models');
const { dbState, getJSONData, saveJSONData } = require('../config/db');
const { logSystemAction } = require('../utils/logger');
const { calculateSubmissionScore } = require('../utils/scoreCalculator');
const { resolveToObjectId, isBicsId, isMongoId, toBicsId, toMongoId } = require('../utils/bicsId');
const { dispatchOtrfBatchForClosedTest } = require('../services/gmailEmailService');

const findTestConfig = async (id) => {
    if (!id) return null;
    const strId = resolveToObjectId(id.toString());
    if (mongoose.Types.ObjectId.isValid(strId)) {
        return await TestConfigModel.findOne({ _id: new mongoose.Types.ObjectId(strId), isDeleted: { $ne: true } });
    }
    return null;
};

// 1. Get all configured tests (Admin view with complete keys)
router.get('/', async (req, res) => {
    try {
        let tests = [];
        if (dbState.useMongo) {
            tests = await TestConfigModel.find({ isDeleted: { $ne: true } });
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            tests = db.tests.filter(t => !t.isDeleted);
        }
        return res.json(tests);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 2. Set verification status for answer sheets (Admin only)
router.post('/set-verification-status/:id', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!['not_released', 'released', 'closed'].includes(status)) {
        return res.status(400).json({ success: false, error: "Invalid status. Must be 'not_released', 'released', or 'closed'." });
    }
    try {
        let updatedStatus = status;
        let isReleased = (status === 'released');
        if (dbState.useMongo) {
            const test = await findTestConfig(id);
            if (!test) {
                return res.status(404).json({ success: false, error: "Test configuration not found." });
            }
            test.verificationStatus = status;
            test.answersReleased = isReleased;
            if (status === 'closed') {
                test.verificationClosedAt = new Date();
            }
            await test.save();
            await logSystemAction('admin', 'VERIFICATION_STATUS_CHANGE', `Set verificationStatus for test "${test.title}" (${id}) to ${status}`, 'info');
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            const targetId = resolveToObjectId(String(id));
            const test = db.tests.find(t => !t.isDeleted && (String(t.id || t._id) === targetId || String(t.id || t._id) === String(id)));
            if (!test) {
                return res.status(404).json({ success: false, error: "Test configuration not found." });
            }
            test.verificationStatus = status;
            test.answersReleased = isReleased;
            if (status === 'closed') {
                test.verificationClosedAt = new Date();
            }
            saveJSONData(db);
            await logSystemAction('admin', 'VERIFICATION_STATUS_CHANGE', `Set verificationStatus for test "${test.title}" (${id}) to ${status}`, 'info');
        }

        // Trigger first-time OTRF batch dispatch when verification is closed
        if (status === 'closed') {
            dispatchOtrfBatchForClosedTest(id).catch(err => {
                console.error(`[ADMIN_TESTS] Error dispatching OTRF batch for closed test ${id}:`, err);
            });
        }

        return res.json({ success: true, verificationStatus: updatedStatus, answersReleased: isReleased });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
});

// 3. Toggle answers release state for candidate answer sheets view (Admin only)
router.post('/toggle-release/:id', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body || {};
    try {
        let verificationStatus = 'not_released';
        let answersReleased = false;
        if (dbState.useMongo) {
            const test = await findTestConfig(id);
            if (!test) {
                return res.status(404).json({ success: false, error: "Test configuration not found." });
            }
            if (status && ['not_released', 'released', 'closed'].includes(status)) {
                test.verificationStatus = status;
            } else {
                if (!test.verificationStatus || test.verificationStatus === 'not_released') test.verificationStatus = 'released';
                else if (test.verificationStatus === 'released') test.verificationStatus = 'closed';
                else test.verificationStatus = 'not_released';
            }
            test.answersReleased = (test.verificationStatus === 'released');
            if (test.verificationStatus === 'closed') {
                test.verificationClosedAt = new Date();
            }
            await test.save();
            verificationStatus = test.verificationStatus;
            answersReleased = test.answersReleased;
            await logSystemAction('admin', 'ANSWERS_RELEASE_TOGGLE', `Updated verificationStatus for test "${test.title}" (${id}) to ${verificationStatus}`, 'info');
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            const targetId = resolveToObjectId(String(id));
            const test = db.tests.find(t => !t.isDeleted && (String(t.id || t._id) === targetId || String(t.id || t._id) === String(id)));
            if (!test) {
                return res.status(404).json({ success: false, error: "Test configuration not found." });
            }
            if (status && ['not_released', 'released', 'closed'].includes(status)) {
                test.verificationStatus = status;
            } else {
                if (!test.verificationStatus || test.verificationStatus === 'not_released') test.verificationStatus = 'released';
                else if (test.verificationStatus === 'released') test.verificationStatus = 'closed';
                else test.verificationStatus = 'not_released';
            }
            test.answersReleased = (test.verificationStatus === 'released');
            if (test.verificationStatus === 'closed') {
                test.verificationClosedAt = new Date();
            }
            verificationStatus = test.verificationStatus;
            answersReleased = test.answersReleased;
            saveJSONData(db);
            await logSystemAction('admin', 'ANSWERS_RELEASE_TOGGLE', `Updated verificationStatus for test "${test.title}" (${id}) to ${verificationStatus}`, 'info');
        }

        // Trigger first-time OTRF batch dispatch when verification is toggled to closed
        if (verificationStatus === 'closed') {
            dispatchOtrfBatchForClosedTest(id).catch(err => {
                console.error(`[ADMIN_TESTS] Error dispatching OTRF batch for toggled-closed test ${id}:`, err);
            });
        }

        return res.json({ success: true, verificationStatus, answersReleased });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
});

// 4. Toggle display/publish state for student visibility (Admin only)
router.post('/toggle-publish/:id', async (req, res) => {
    const { id } = req.params;
    try {
        let isPublished = false;
        if (dbState.useMongo) {
            const test = await findTestConfig(id);
            if (!test) {
                return res.status(404).json({ success: false, error: "Test configuration not found." });
            }
            test.isPublished = !test.isPublished;
            await test.save();
            isPublished = test.isPublished;
            await logSystemAction('admin', 'TEST_PUBLISH_TOGGLE', `Toggled isPublished visibility status for test "${test.title}" (${id}) to ${isPublished}`, 'info');
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            const targetId = resolveToObjectId(String(id));
            const test = db.tests.find(t => !t.isDeleted && (String(t.id || t._id) === targetId || String(t.id || t._id) === String(id)));
            if (!test) {
                return res.status(404).json({ success: false, error: "Test configuration not found." });
            }
            test.isPublished = !test.isPublished;
            isPublished = test.isPublished;
            saveJSONData(db);
            await logSystemAction('admin', 'TEST_PUBLISH_TOGGLE', `Toggled isPublished visibility status for test "${test.title}" (${id}) to ${isPublished}`, 'info');
        }
        return res.json({ success: true, isPublished });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
});

// 5. Create/configure a test (Admin only)
router.post('/', async (req, res) => {
    const { _id, id, title, course, courseCode, marks, instructions, duration, startDate, endDate, questions, isPublished, enableAiEvaluation } = req.body;
    if (!title || !duration || !startDate || !endDate) {
        return res.status(400).json({ error: "Title, Duration, Start Date, and End Date are required" });
    }

    try {
        const normalizedQuestions = (questions || []).map((q, qIdx) => {
            const qObj = q.toObject ? q.toObject() : { ...q };
            const title = (qObj.title || '').trim() || `Question ${qIdx + 1}`;
            const description = (qObj.description || qObj.questionText || qObj.question || qObj.statement || '').trim();
            const qId = qObj.id || qObj._id || `q_${Date.now()}_${qIdx + 1}`;
            
            let isMulti = false;
            let finalType = 'scc';
            if (qObj.type === 'coding' || qObj.type === 'web') {
                finalType = qObj.type;
                isMulti = false;
            } else if (qObj.type === 'mcc') {
                finalType = 'mcc';
                isMulti = true;
            } else if (qObj.type === 'scc') {
                finalType = 'scc';
                isMulti = false;
            } else {
                // Legacy fallback for old 'mcq'
                isMulti = Boolean(qObj.isMultiChoice === true || (Array.isArray(qObj.correctOptionIndices) && qObj.correctOptionIndices.length > 1));
                finalType = isMulti ? 'mcc' : 'scc';
            }
            
            const category = (qObj.category && qObj.category !== 'Multiple Choice') ? qObj.category.trim() : (finalType === 'coding' ? 'Programming' : (finalType === 'web' ? 'Web Development' : (isMulti ? 'Multiple Choice' : 'Single Choice')));
            const timeLimitMs = Math.max(200, Math.min(Number(qObj.timeLimitMs) || 2000, 10000));
            const memoryLimitMb = Math.max(16, Math.min(Number(qObj.memoryLimitMb) || 128, 512));
            const correctOptionIndices = isMulti
                ? (Array.isArray(qObj.correctOptionIndices) && qObj.correctOptionIndices.length > 0
                    ? qObj.correctOptionIndices.map(Number)
                    : (qObj.correctOptionIndex !== undefined && qObj.correctOptionIndex !== null ? [Number(qObj.correctOptionIndex)] : [0]))
                : (qObj.correctOptionIndex !== undefined && qObj.correctOptionIndex !== null
                    ? [Number(qObj.correctOptionIndex)]
                    : (Array.isArray(qObj.correctOptionIndices) && qObj.correctOptionIndices.length > 0 ? [Number(qObj.correctOptionIndices[0])] : [0]));
            const correctOptionIndex = correctOptionIndices.length > 0 ? correctOptionIndices[0] : 0;
            return {
                ...qObj,
                id: qId,
                type: finalType,
                title,
                category,
                isMultiChoice: !!isMulti,
                correctOptionIndex,
                correctOptionIndices,
                timeLimitMs,
                memoryLimitMb,
                description,
                questionText: description
            };
        });

        let savedTest = null;
        const rawEditId = _id || id;
        const testId = rawEditId ? resolveToObjectId(rawEditId.toString()) : null;
        if (dbState.useMongo) {
            if (testId) {
                savedTest = await findTestConfig(testId);
            }
            if (savedTest) {
                savedTest.title = title;
                savedTest.course = course || '';
                savedTest.courseCode = courseCode || '';
                savedTest.marks = Number(marks || 0);
                savedTest.instructions = instructions || '';
                savedTest.duration = Number(duration || 60);
                savedTest.startDate = new Date(startDate);
                savedTest.endDate = new Date(endDate);
                savedTest.questions = normalizedQuestions;
                if (isPublished !== undefined) savedTest.isPublished = isPublished;
                if (enableAiEvaluation !== undefined) savedTest.enableAiEvaluation = Boolean(enableAiEvaluation);
                await savedTest.save();
            } else {
                savedTest = new TestConfigModel({ 
                    title, 
                    course: course || '',
                    courseCode: courseCode || '',
                    marks: Number(marks || 0), 
                    instructions: instructions || '', 
                    duration: Number(duration || 60), 
                    startDate: new Date(startDate), 
                    endDate: new Date(endDate), 
                    questions: normalizedQuestions, 
                    isPublished: isPublished || false,
                    enableAiEvaluation: Boolean(enableAiEvaluation || false)
                });
                await savedTest.save();
            }
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            if (testId) {
                const idx = db.tests.findIndex(t => !t.isDeleted && (String(t.id || t._id) === String(testId) || String(t.id || t._id) === String(rawEditId)));
                if (idx !== -1) {
                    db.tests[idx] = {
                        ...db.tests[idx],
                        title,
                        course: course || '',
                        courseCode: courseCode || '',
                        marks: Number(marks || 0),
                        instructions: instructions || '',
                        duration: Number(duration || 60),
                        startDate,
                        endDate,
                        questions: normalizedQuestions
                    };
                    if (isPublished !== undefined) db.tests[idx].isPublished = isPublished;
                    if (enableAiEvaluation !== undefined) db.tests[idx].enableAiEvaluation = Boolean(enableAiEvaluation);
                    savedTest = db.tests[idx];
                }
            }
            if (!savedTest) {
                const newTestMongoId = new mongoose.Types.ObjectId().toString();
                savedTest = {
                    id: newTestMongoId,
                    _id: newTestMongoId,
                    title,
                    course: course || '',
                    courseCode: courseCode || '',
                    marks: Number(marks || 0),
                    instructions,
                    duration: Number(duration || 60),
                    startDate,
                    endDate,
                    questions: normalizedQuestions,
                    answersReleased: false,
                    isPublished: isPublished || false,
                    enableAiEvaluation: Boolean(enableAiEvaluation || false)
                };
                db.tests.push(savedTest);
            }
            saveJSONData(db);
        }
        await logSystemAction('admin', 'TEST_SAVED', `Saved test config: "${title}" (${marks} marks, Duration: ${duration} mins)`, 'info');
        return res.json({ success: true, test: savedTest });
    } catch (e) {
        await logSystemAction('admin', 'TECHNICAL_ERROR', `Failed to save test config: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    }
});

// 6. Delete test config (Admin only - moves to 24-Hour Recycle Bin)
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const deletedBy = req.body?.adminUsername || 'admin';
    try {
        const deletedAt = new Date();
        const expiresAt = new Date(deletedAt.getTime() + 24 * 60 * 60 * 1000);

        if (dbState.useMongo) {
            const test = await findTestConfig(id);
            if (!test) {
                return res.status(404).json({ success: false, error: "Test configuration not found." });
            }

            const targetId = test._id;
            test.isDeleted = true;
            test.deletedAt = deletedAt;
            test.deletedBy = deletedBy;
            await test.save();

            const subQuery = { testId: targetId };
            const subDocs = await TestSubmissionModel.find(subQuery);
            await TestSubmissionModel.updateMany(subQuery, {
                $set: { isDeleted: true, deletedAt: deletedAt, restoreToken: targetId.toString() }
            });

            const recycleEntry = new RecycleBinModel({
                entityType: 'TestConfig',
                entityId: targetId.toString(),
                title: test.title || 'Test Configuration',
                code: '',
                deletedBy: deletedBy,
                deletedAt: deletedAt,
                expiresAt: expiresAt,
                cascadeCount: subDocs.length,
                cascadeDetails: { candidateSubmissions: subDocs.length },
                snapshot: { test, submissions: subDocs }
            });
            await recycleEntry.save();
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            db.testSubmissions = db.testSubmissions || [];
            db.recycleBin = db.recycleBin || [];

            const targetDelId = resolveToObjectId(String(id));
            const testIdx = db.tests.findIndex(t => !t.isDeleted && (String(t.id || t._id) === targetDelId || String(t.id || t._id) === String(id)));
            if (testIdx !== -1) {
                const test = db.tests[testIdx];
                test.isDeleted = true;
                test.deletedAt = deletedAt;
                test.deletedBy = deletedBy;

                const subDocs = db.testSubmissions.filter(s => String(s.testId) === String(id) || String(s.testId) === targetDelId || String(s.testId) === String(test._id) || s.testTitle === test.title);
                subDocs.forEach(s => {
                    s.isDeleted = true;
                    s.deletedAt = deletedAt;
                    s.restoreToken = id;
                });

                db.recycleBin.push({
                    _id: 'rb_' + Date.now(),
                    entityType: 'TestConfig',
                    entityId: id,
                    title: test.title || test.code || 'Test Configuration',
                    code: test.code || test.id || '',
                    deletedBy: deletedBy,
                    deletedAt: deletedAt.toISOString(),
                    expiresAt: expiresAt.toISOString(),
                    cascadeCount: subDocs.length,
                    cascadeDetails: { candidateSubmissions: subDocs.length },
                    snapshot: { test, submissions: subDocs }
                });
                saveJSONData(db);
            }
        }
        await logSystemAction('admin', 'TEST_SOFT_DELETED', `Moved test config "${id}" and related submissions to 24-Hour Recycle Bin`, 'info');
        return res.json({ success: true, message: "Moved to Recycle Bin. You have 24 hours to restore this item." });
    } catch (e) {
        await logSystemAction('admin', 'TECHNICAL_ERROR', `Failed to soft-delete test config ID ${id}: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    }
});

// Helper: Auto-reconcile physical violation evidence snapshots from disk into proctoringLog.snapshots
function reconcileDiskSnapshotsForSubmission(sub) {
    if (!sub) return;
    const mongoId = String(sub._id || sub.id || '');
    const bicsId = toBicsId(mongoId) || mongoId;
    if (!sub.proctoringLog) sub.proctoringLog = {};
    if (!Array.isArray(sub.proctoringLog.snapshots)) sub.proctoringLog.snapshots = [];

    const existingUrls = new Set(sub.proctoringLog.snapshots.map(s => s.url).filter(Boolean));
    const diskDirs = [
        path.join(__dirname, '../public/proctoring', bicsId),
        path.join(__dirname, '../public/proctoring', mongoId)
    ];

    let diskFiles = [];
    diskDirs.forEach(dir => {
        if (fs.existsSync(dir)) {
            try {
                const files = fs.readdirSync(dir);
                files.forEach(f => {
                    if (/\.(jpe?g|png|webp)$/i.test(f) && !diskFiles.includes(f)) {
                        diskFiles.push(f);
                        // Consolidate into bicsId directory if missing
                        const bicsDir = path.join(__dirname, '../public/proctoring', bicsId);
                        if (!fs.existsSync(bicsDir)) {
                            fs.mkdirSync(bicsDir, { recursive: true });
                        }
                        const bicsPath = path.join(bicsDir, f);
                        const srcPath = path.join(dir, f);
                        if (!fs.existsSync(bicsPath)) {
                            try { fs.copyFileSync(srcPath, bicsPath); } catch (_) {}
                        }
                    }
                });
            } catch (_) {}
        }
    });

    const VIOLATION_TYPES = [
        'MULTI_FACE', 'FACE_MISSING', 'LOOKING_AWAY', 'VOICE_DETECTED', 
        'TAB_SWITCH', 'FULLSCREEN_EXIT', 'DEVTOOLS_OPENED', 'CLIPBOARD_ATTEMPT', 
        'MINOR_WARNINGS_EXCEEDED', 'PROCTOR_WARNING', 'FACE_MISMATCH', 'BASELINE_REFERENCE'
    ];
    const NON_VIOLATION_TYPES = new Set([
        'CODE_RUN', 'OPTION_MARKED', 'OPTION_CLEARED', 'CODE_SAVED', 'CODE_RESET',
        'WEB_SAVED', 'WEB_RESET', 'CONSENT_ACCEPTED', 
        'TEST_STARTED', 'TEST_SUBMITTED', 'TEST_AUTO_SUBMITTED', 'PROCTORING_ALLOWED'
    ]);

    let addedAny = false;

    // Clean up any legacy misattributed non-violation types in sub.proctoringLog.snapshots
    if (Array.isArray(sub.proctoringLog.snapshots)) {
        sub.proctoringLog.snapshots.forEach(s => {
            if (NON_VIOLATION_TYPES.has(s.type)) {
                const sTs = new Date(s.timestamp || 0).getTime();
                const violationCandidates = (sub.proctoringLog?.events || []).filter(e => 
                    !NON_VIOLATION_TYPES.has(e.type) && 
                    VIOLATION_TYPES.some(vt => e.type === vt || (e.type && e.type.includes(vt)))
                );
                let closest = null;
                let minDiff = Infinity;
                violationCandidates.forEach(e => {
                    const et = new Date(e.timestamp || e.startTime || 0).getTime();
                    const diff = Math.abs(et - sTs);
                    if (diff < minDiff && diff < 30000) {
                        minDiff = diff;
                        closest = e;
                    }
                });
                if (closest) {
                    s.type = closest.type;
                    s.details = closest.details;
                    addedAny = true;
                } else {
                    s.type = 'PROCTOR_WARNING';
                    s.details = 'Proctoring violation evidence snapshot';
                    addedAny = true;
                }
            }
        });
    }

    diskFiles.forEach(f => {
        const url = `/public/proctoring/${bicsId}/${f}`;
        if (!existingUrls.has(url)) {
            existingUrls.add(url);
            const tsMatch = f.match(/^(\d{13})/);
            const ts = tsMatch ? new Date(Number(tsMatch[1])) : (sub.startedAt || new Date());
            
            // Only match against genuine violation events, never routine candidate actions
            const violationCandidates = (sub.proctoringLog?.events || []).filter(e => 
                !NON_VIOLATION_TYPES.has(e.type) && 
                VIOLATION_TYPES.some(vt => e.type === vt || (e.type && e.type.includes(vt)))
            );
            let closestEv = null;
            let minDiff = Infinity;
            violationCandidates.forEach(e => {
                const et = new Date(e.timestamp || e.startTime || 0).getTime();
                const diff = Math.abs(et - ts.getTime());
                if (diff < minDiff && diff < 30000) {
                    minDiff = diff;
                    closestEv = e;
                }
            });

            const type = closestEv ? closestEv.type : 'PROCTOR_WARNING';
            sub.proctoringLog.snapshots.push({
                timestamp: ts,
                type,
                url,
                details: closestEv ? closestEv.details : `Evidence snapshot captured for ${type}`
            });
            addedAny = true;
        }
    });

    if (addedAny && dbState.useMongo && sub._id) {
        TestSubmissionModel.findByIdAndUpdate(
            sub._id,
            { $set: { 'proctoringLog.snapshots': sub.proctoringLog.snapshots } }
        ).catch(e => console.warn("[Admin Snapshots Reconciliation] DB sync notice:", e.message));
    }
}

// 7. Fetch candidate submissions for a test (Admin only)
router.get('/submissions/:testId', async (req, res) => {
    const { testId } = req.params;
    try {
        let subs = [];
        if (dbState.useMongo) {
            if (!testId || testId === 'all') {
                subs = await TestSubmissionModel.find({ isDeleted: { $ne: true } }).sort({ startedAt: -1 });
            } else if (mongoose.Types.ObjectId.isValid(testId)) {
                subs = await TestSubmissionModel.find({
                    $or: [{ testId: new mongoose.Types.ObjectId(testId) }, { testId: String(testId) }],
                    isDeleted: { $ne: true }
                }).sort({ startedAt: -1 });
            } else {
                subs = await TestSubmissionModel.find({ testId: String(testId), isDeleted: { $ne: true } }).sort({ startedAt: -1 });
            }

            const allTests = await TestConfigModel.find({ isDeleted: { $ne: true } });
            for (let sub of subs) {
                try {
                    const hasManualOrObjection = (sub.answers || []).some(a => a.isManuallyGraded || a.isObjectionResolved);
                    const isLockedZero = sub.verificationStatus === 'annulled' || sub.eirfStatus === 'rejected';
                    const isAlreadyEvaluated = Boolean(sub.evaluation?.evaluatedAt);
                    const matchingTest = allTests.find(t => String(t._id || t.id) === String(sub.testId));

                    if (matchingTest && !isAlreadyEvaluated && !hasManualOrObjection && !isLockedZero) {
                        calculateSubmissionScore(sub, matchingTest);
                    } else if (isLockedZero && Number(sub.totalScore || sub.score || 0) !== 0) {
                        calculateSubmissionScore(sub, matchingTest || { marks: 100, questions: [] });
                    }
                } catch (err) {
                    console.error("Score reconciliation notice:", err);
                }
            }
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            const resolvedTestId = (testId && testId !== 'all') ? resolveToObjectId(String(testId)) : testId;
            if (!resolvedTestId || resolvedTestId === 'all') {
                subs = db.testSubmissions.filter(s => !s.isDeleted);
            } else {
                subs = db.testSubmissions.filter(s => (String(s.testId) === String(resolvedTestId) || String(s.testId) === String(testId)) && !s.isDeleted);
            }
            const allTests = (db.tests || []).filter(t => !t.isDeleted);
            subs.forEach(sub => {
                const hasManualOrObjection = (sub.answers || []).some(a => a.isManuallyGraded || a.isObjectionResolved);
                const isLockedZero = sub.verificationStatus === 'annulled' || sub.eirfStatus === 'rejected';
                const isAlreadyEvaluated = Boolean(sub.evaluation?.evaluatedAt);
                const matchingTest = allTests.find(t => String(t.id || t._id) === String(sub.testId));

                if (matchingTest && !isAlreadyEvaluated && !hasManualOrObjection && !isLockedZero) {
                    try {
                        calculateSubmissionScore(sub, matchingTest);
                    } catch (err) {
                        console.error("Score reconciliation notice:", err);
                    }
                } else if (isLockedZero && Number(sub.totalScore || sub.score || 0) !== 0) {
                    calculateSubmissionScore(sub, matchingTest || { marks: 100, questions: [] });
                }
            });
        }

        const finalSubs = (subs || []).map(sub => {
            reconcileDiskSnapshotsForSubmission(sub);
            const obj = sub.toObject ? sub.toObject() : { ...sub };
            obj.bicsId = toBicsId(sub._id || sub.id);
            if (sub.totalScore !== undefined) obj.totalScore = sub.totalScore;
            if (sub.score !== undefined) obj.score = sub.score;
            if (sub.evaluation) obj.evaluation = sub.evaluation;
            if (sub.answers) obj.answers = sub.answers;
            return obj;
        });

        return res.json(finalSubs);
    } catch (e) {
        console.error("Error fetching test submissions:", e);
        return res.status(200).json([]);
    }
});

// 8. Save manual grading score and feedback
router.post('/evaluate/:submissionId', async (req, res) => {
    const { submissionId } = req.params;
    const { feedback, reevaluationStatus, resolutionFeedback, answers } = req.body;
    const resolvedSubId = resolveToObjectId(String(submissionId || ''));

    try {
        let submission = null;
        let test = null;

        if (dbState.useMongo) {
            if (/^\d{12}$/.test(String(submissionId).trim())) {
                submission = await TestSubmissionModel.findOne({ submissionRefId: String(submissionId).trim(), isDeleted: { $ne: true } });
            }
            if (!submission && mongoose.Types.ObjectId.isValid(resolvedSubId)) {
                submission = await TestSubmissionModel.findOne({ _id: resolvedSubId, isDeleted: { $ne: true } });
            }
            if (!submission) {
                submission = await TestSubmissionModel.findOne({
                    $or: [{ id: submissionId }, { id: resolvedSubId }, { submissionRefId: submissionId }],
                    isDeleted: { $ne: true }
                });
            }
            if (!submission) return res.status(404).json({ error: "Submission not found" });

            test = await TestConfigModel.findById(submission.testId);
            if (!test) {
                test = await TestConfigModel.findOne({ id: submission.testId });
            }

            if (answers && Array.isArray(answers)) {
                answers.forEach(item => {
                    const existingAns = (submission.answers || []).find(a => String(a.questionId) === String(item.questionId));
                    if (existingAns) {
                        const quest = test?.questions?.find(q => String(q.id || q._id) === String(item.questionId));
                        const maxPts = Number(quest?.points || existingAns.maxPoints || 100);
                        if (item.score !== undefined && !isNaN(item.score)) {
                            const incomingScore = Math.max(0, Math.min(Number(item.score), maxPts));
                            const currentScore = Number(existingAns.score || 0);
                            const scoreChanged = incomingScore !== currentScore;

                            if (!existingAns.isObjectionResolved || scoreChanged || item.isManuallyGraded === true) {
                                if (item.isManuallyGraded === true || scoreChanged) {
                                    existingAns.score = incomingScore;
                                    existingAns.isManuallyGraded = true;
                                } else if (item.isManuallyGraded === false) {
                                    existingAns.score = incomingScore;
                                    existingAns.isManuallyGraded = false;
                                }
                            }
                        }
                        if (Array.isArray(item.testCaseResults)) {
                            existingAns.testCaseResults = item.testCaseResults.map((tc, tcIdx) => ({
                                testCaseIndex: tc.testCaseIndex !== undefined ? tc.testCaseIndex : tcIdx,
                                status: tc.status || 'Pending',
                                points: Number(tc.points) || 0,
                                scoredPoints: Number(tc.scoredPoints !== undefined ? tc.scoredPoints : (tc.status === 'Accepted' || tc.status === 'passed' ? Number(tc.points) || 0 : 0)),
                                actualOutput: typeof tc.actualOutput === 'string' ? tc.actualOutput.slice(0, 2000) : (tc.actualOutput || ''),
                                expectedOutput: typeof tc.expectedOutput === 'string' ? tc.expectedOutput.slice(0, 2000) : (tc.expectedOutput || ''),
                                input: typeof tc.input === 'string' ? tc.input.slice(0, 1000) : (tc.input || ''),
                                isSample: Boolean(tc.isSample),
                                executionTimeMs: Number(tc.executionTimeMs || 0),
                                memoryUsedKb: Number(tc.memoryUsedKb || 0)
                            }));
                        }
                        if (item.rawResults) {
                            existingAns.rawResults = item.rawResults;
                        }
                        if (item.compileError !== undefined) {
                            existingAns.compileError = item.compileError;
                        }
                        if (item.consoleTab) {
                            existingAns.consoleTab = item.consoleTab;
                        }
                    }
                });
            }

            if (test) {
                calculateSubmissionScore(submission, test);
            }
            submission.evaluation = submission.evaluation || {};
            submission.evaluation.feedback = feedback || '';
            submission.evaluation.evaluatedAt = new Date();
            submission.status = 'evaluated';

            if (reevaluationStatus) {
                if (!submission.reevaluation) {
                    submission.reevaluation = { applied: true };
                }
                submission.reevaluation.status = reevaluationStatus;
                submission.reevaluation.resolutionFeedback = resolutionFeedback || '';
            }

            submission.markModified('answers');
            submission.markModified('evaluation');
            if (submission.reevaluation) {
                submission.markModified('reevaluation');
            }
            await submission.save();
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submission = db.testSubmissions.find(s => !s.isDeleted && (
                String(s.submissionRefId || '') === String(submissionId) ||
                String(s.id || s._id) === String(resolvedSubId) ||
                String(s.id || s._id) === String(submissionId) ||
                (isBicsId(submissionId) && toBicsId(s._id || s.id) === submissionId)
            ));
            if (!submission) return res.status(404).json({ error: "Submission not found" });

            test = (db.tests || []).find(t => !t.isDeleted && String(t.id || t._id) === String(submission.testId));

            if (answers && Array.isArray(answers)) {
                answers.forEach(item => {
                    const existingAns = (submission.answers || []).find(a => String(a.questionId) === String(item.questionId));
                    if (existingAns) {
                        const quest = test?.questions?.find(q => String(q.id || q._id) === String(item.questionId));
                        const maxPts = Number(quest?.points || existingAns.maxPoints || 100);
                        if (item.score !== undefined && !isNaN(item.score)) {
                            const incomingScore = Math.max(0, Math.min(Number(item.score), maxPts));
                            const currentScore = Number(existingAns.score || 0);
                            const scoreChanged = incomingScore !== currentScore;

                            if (!existingAns.isObjectionResolved || scoreChanged || item.isManuallyGraded === true) {
                                if (item.isManuallyGraded === true || scoreChanged) {
                                    existingAns.score = incomingScore;
                                    existingAns.isManuallyGraded = true;
                                } else if (item.isManuallyGraded === false) {
                                    existingAns.score = incomingScore;
                                    existingAns.isManuallyGraded = false;
                                }
                            }
                        }
                        if (Array.isArray(item.testCaseResults)) {
                            existingAns.testCaseResults = item.testCaseResults.map((tc, tcIdx) => ({
                                testCaseIndex: tc.testCaseIndex !== undefined ? tc.testCaseIndex : tcIdx,
                                status: tc.status || 'Pending',
                                points: Number(tc.points) || 0,
                                scoredPoints: Number(tc.scoredPoints !== undefined ? tc.scoredPoints : (tc.status === 'Accepted' || tc.status === 'passed' ? Number(tc.points) || 0 : 0)),
                                actualOutput: typeof tc.actualOutput === 'string' ? tc.actualOutput.slice(0, 2000) : (tc.actualOutput || ''),
                                expectedOutput: typeof tc.expectedOutput === 'string' ? tc.expectedOutput.slice(0, 2000) : (tc.expectedOutput || ''),
                                input: typeof tc.input === 'string' ? tc.input.slice(0, 1000) : (tc.input || ''),
                                isSample: Boolean(tc.isSample),
                                executionTimeMs: Number(tc.executionTimeMs || 0),
                                memoryUsedKb: Number(tc.memoryUsedKb || 0)
                            }));
                        }
                        if (item.rawResults) {
                            existingAns.rawResults = item.rawResults;
                        }
                        if (item.compileError !== undefined) {
                            existingAns.compileError = item.compileError;
                        }
                        if (item.consoleTab) {
                            existingAns.consoleTab = item.consoleTab;
                        }
                    }
                });
            }

            if (test) {
                calculateSubmissionScore(submission, test);
            }
            submission.evaluation = submission.evaluation || {};
            submission.evaluation.feedback = feedback || '';
            submission.evaluation.evaluatedAt = new Date();
            submission.status = 'evaluated';

            if (reevaluationStatus) {
                if (!submission.reevaluation) {
                    submission.reevaluation = { applied: true };
                }
                submission.reevaluation.status = reevaluationStatus;
                submission.reevaluation.resolutionFeedback = resolutionFeedback || '';
            }

            saveJSONData(db);
        }
        await logSystemAction('admin', 'STUDENT_EVALUATED', `Evaluated exam submission ID: ${submissionId} for student "${submission?.candidateName || 'Unknown'}"`, 'info');
        return res.json({ success: true, submission });
    } catch (e) {
        await logSystemAction('admin', 'TECHNICAL_ERROR', `Failed to save candidate evaluation details: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    }
});

// 9. Bulk Re-evaluate Submissions for a Test Configuration
router.post('/reevaluate-all/:testId', async (req, res) => {
    const { testId } = req.params;
    const resolvedTestId = resolveToObjectId(String(testId || ''));
    try {
        let test = null;
        let subs = [];
        let updatedCount = 0;

        if (dbState.useMongo) {
            test = await findTestConfig(resolvedTestId);
            if (!test) return res.status(404).json({ success: false, error: "Test configuration not found." });

            subs = await TestSubmissionModel.find({
                $or: [{ testId: test._id }, { testId: String(test._id) }, { testId: String(testId) }],
                isDeleted: { $ne: true }
            });
            for (let sub of subs) {
                calculateSubmissionScore(sub, test);
                sub.markModified('answers');
                sub.markModified('evaluation');
                await sub.save();
                updatedCount++;
            }
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            db.testSubmissions = db.testSubmissions || [];
            test = db.tests.find(t => !t.isDeleted && (String(t.id || t._id) === String(resolvedTestId) || String(t.id || t._id) === String(testId)));
            if (!test) return res.status(404).json({ success: false, error: "Test configuration not found." });

            subs = db.testSubmissions.filter(s => !s.isDeleted && (String(s.testId) === String(test.id || test._id) || String(s.testId) === String(resolvedTestId) || String(s.testId) === String(testId)));
            subs.forEach(sub => {
                calculateSubmissionScore(sub, test);
                updatedCount++;
            });
            saveJSONData(db);
        }

        await logSystemAction('admin', 'BULK_REEVALUATION', `Bulk re-evaluated ${updatedCount} submissions for test "${test.title}"`, 'info');
        return res.json({ success: true, count: updatedCount, message: `Bulk re-evaluated ${updatedCount} candidate submissions successfully.` });
    } catch (err) {
        console.error("Failed to bulk re-evaluate submissions:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// 10. Autonomous AI Evaluation for Web Coding Questions (Admin triggered on-demand)
router.post('/evaluate-web-ai/:testId', async (req, res) => {
    const { testId } = req.params;
    try {
        const { evaluateWebCodingSubmissions } = require('../services/kataAiEvaluator');
        const result = await evaluateWebCodingSubmissions(testId);
        await logSystemAction('admin', 'WEB_AI_EVALUATION', `Triggered AI Web Coding evaluation for test ID ${testId} (Evaluated: ${result.evaluatedCount || 0})`, 'info');
        return res.json({
            success: true,
            evaluatedCount: result.evaluatedCount || 0,
            message: `Autonomous AI evaluation completed for ${result.evaluatedCount || 0} web coding answer(s).`
        });
    } catch (err) {
        console.error("Failed to run Web AI evaluation:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
