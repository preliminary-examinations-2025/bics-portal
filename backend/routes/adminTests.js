const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { TestConfigModel, TestSubmissionModel, RecycleBinModel } = require('../models');
const { dbState, getJSONData, saveJSONData } = require('../config/db');
const { logSystemAction } = require('../utils/logger');
const { calculateSubmissionScore } = require('../utils/scoreCalculator');
const { resolveToObjectId } = require('../utils/bicsId');

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
            await test.save();
            await logSystemAction('admin', 'VERIFICATION_STATUS_CHANGE', `Set verificationStatus for test "${test.title}" (${id}) to ${status}`, 'info');
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            const test = db.tests.find(t => t.id === id || t._id === id);
            if (!test) {
                return res.status(404).json({ success: false, error: "Test configuration not found." });
            }
            test.verificationStatus = status;
            test.answersReleased = isReleased;
            saveJSONData(db);
            await logSystemAction('admin', 'VERIFICATION_STATUS_CHANGE', `Set verificationStatus for test "${test.title}" (${id}) to ${status}`, 'info');
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
            await test.save();
            verificationStatus = test.verificationStatus;
            answersReleased = test.answersReleased;
            await logSystemAction('admin', 'ANSWERS_RELEASE_TOGGLE', `Updated verificationStatus for test "${test.title}" (${id}) to ${verificationStatus}`, 'info');
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            const test = db.tests.find(t => t.id === id || t._id === id);
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
            verificationStatus = test.verificationStatus;
            answersReleased = test.answersReleased;
            saveJSONData(db);
            await logSystemAction('admin', 'ANSWERS_RELEASE_TOGGLE', `Updated verificationStatus for test "${test.title}" (${id}) to ${verificationStatus}`, 'info');
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
            const test = db.tests.find(t => t.id === id || t._id === id);
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
    const { _id, id, title, course, courseCode, marks, instructions, duration, startDate, endDate, questions, isPublished } = req.body;
    if (!title || !duration || !startDate || !endDate) {
        return res.status(400).json({ error: "Title, Duration, Start Date, and End Date are required" });
    }

    try {
        const normalizedQuestions = (questions || []).map((q, qIdx) => {
            const qObj = q.toObject ? q.toObject() : { ...q };
            const title = (qObj.title || '').trim() || `Question ${qIdx + 1}`;
            const description = (qObj.description || qObj.questionText || qObj.question || qObj.statement || '').trim();
            const qId = qObj.id || qObj._id || `q_${Date.now()}_${qIdx + 1}`;
            return {
                ...qObj,
                id: qId,
                title,
                description,
                questionText: description
            };
        });

        let savedTest = null;
        const testId = _id || (id && mongoose.Types.ObjectId.isValid(id.toString()) ? id : null);
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
                await savedTest.save();
            } else {
                savedTest = new TestConfigModel({ 
                    title, 
                    course: course || '',
                    courseCode: courseCode || '',
                    marks, 
                    instructions, 
                    duration, 
                    startDate, 
                    endDate, 
                    questions: normalizedQuestions, 
                    isPublished: isPublished || false 
                });
                await savedTest.save();
            }
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            if (testId) {
                const idx = db.tests.findIndex(t => t.id === testId || t._id === testId);
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
                    savedTest = db.tests[idx];
                }
            }
            if (!savedTest) {
                savedTest = {
                    id: Date.now().toString(),
                    _id: Date.now().toString(),
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
                    isPublished: isPublished || false
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

            const testIdx = db.tests.findIndex(t => t.id === id || t._id === id);
            if (testIdx !== -1) {
                const test = db.tests[testIdx];
                test.isDeleted = true;
                test.deletedAt = deletedAt;
                test.deletedBy = deletedBy;

                const subDocs = db.testSubmissions.filter(s => s.testId === id || s.testId === test._id || s.testTitle === test.title);
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

            const allTests = await TestConfigModel.find({});
            for (let sub of subs) {
                try {
                    const matchingTest = allTests.find(t => String(t._id || t.id) === String(sub.testId));
                    if (matchingTest) {
                        calculateSubmissionScore(sub, matchingTest);
                    }
                } catch (err) {
                    console.error("Score recalculation warning:", err);
                }
            }
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            if (!testId || testId === 'all') {
                subs = db.testSubmissions.filter(s => !s.isDeleted);
            } else {
                subs = db.testSubmissions.filter(s => String(s.testId) === String(testId) && !s.isDeleted);
            }
            const allTests = db.tests || [];
            subs.forEach(sub => {
                const matchingTest = allTests.find(t => String(t.id || t._id) === String(sub.testId));
                if (matchingTest) {
                    try {
                        calculateSubmissionScore(sub, matchingTest);
                    } catch (err) {
                        console.error("Score recalculation warning:", err);
                    }
                }
            });
            saveJSONData(db);
        }
        return res.json(subs || []);
    } catch (e) {
        console.error("Error fetching test submissions:", e);
        return res.status(200).json([]);
    }
});

// 8. Save manual grading score and feedback
router.post('/evaluate/:submissionId', async (req, res) => {
    const { submissionId } = req.params;
    const { feedback, reevaluationStatus, resolutionFeedback, answers } = req.body;

    try {
        let submission = null;
        let test = null;

        if (dbState.useMongo) {
            if (mongoose.Types.ObjectId.isValid(submissionId)) {
                submission = await TestSubmissionModel.findById(submissionId);
            }
            if (!submission) {
                submission = await TestSubmissionModel.findOne({ id: submissionId });
            }
            if (!submission) return res.status(404).json({ error: "Submission not found" });

            test = await TestConfigModel.findById(submission.testId);
            if (!test) {
                test = await TestConfigModel.findOne({ id: submission.testId });
            }

            if (answers && Array.isArray(answers)) {
                answers.forEach(item => {
                    const existingAns = (submission.answers || []).find(a => String(a.questionId) === String(item.questionId));
                    if (existingAns && item.score !== undefined && !isNaN(item.score)) {
                        const quest = test?.questions?.find(q => String(q.id || q._id) === String(item.questionId));
                        const maxPts = Number(quest?.points || existingAns.maxPoints || 100);
                        existingAns.score = Math.max(0, Math.min(Number(item.score), maxPts));
                        existingAns.isManuallyGraded = true;
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
            submission = db.testSubmissions.find(s => String(s.id || s._id) === String(submissionId));
            if (!submission) return res.status(404).json({ error: "Submission not found" });

            test = (db.tests || []).find(t => String(t.id || t._id) === String(submission.testId));

            if (answers && Array.isArray(answers)) {
                answers.forEach(item => {
                    const existingAns = (submission.answers || []).find(a => String(a.questionId) === String(item.questionId));
                    if (existingAns && item.score !== undefined && !isNaN(item.score)) {
                        const quest = test?.questions?.find(q => String(q.id || q._id) === String(item.questionId));
                        const maxPts = Number(quest?.points || existingAns.maxPoints || 100);
                        existingAns.score = Math.max(0, Math.min(Number(item.score), maxPts));
                        existingAns.isManuallyGraded = true;
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
    try {
        let test = null;
        let subs = [];
        let updatedCount = 0;

        if (dbState.useMongo) {
            test = await TestConfigModel.findById(testId);
            if (!test) return res.status(404).json({ success: false, error: "Test configuration not found." });

            subs = await TestSubmissionModel.find({ testId: testId });
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
            test = db.tests.find(t => String(t.id || t._id) === String(testId));
            if (!test) return res.status(404).json({ success: false, error: "Test configuration not found." });

            subs = db.testSubmissions.filter(s => String(s.testId) === String(testId));
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

module.exports = router;
