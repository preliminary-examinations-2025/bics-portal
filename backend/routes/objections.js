const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { TestSubmissionModel, TestConfigModel } = require('../models');
const { dbState, getJSONData, saveJSONData } = require('../config/db');
const { generateObjectionId, buildCandidateQueryFilter } = require('../config/constants');
const { logSystemAction } = require('../utils/logger');
const { calculateSubmissionScore } = require('../utils/scoreCalculator');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { isBicsId, toMongoId, toBicsId, resolveToObjectId } = require('../utils/bicsId');

const ensureObjectionIdsSaved = async (submissionsList) => {
    try {
        if (dbState.useMongo) {
            for (const sub of submissionsList) {
                let hasChanges = false;
                if (Array.isArray(sub.objections)) {
                    sub.objections.forEach(obj => {
                        if (!obj.objectionId || !/^OBJ-\d{4}-[A-Z0-9]+$/i.test(String(obj.objectionId))) {
                            obj.objectionId = generateObjectionId();
                            hasChanges = true;
                        }
                    });
                }
                if (hasChanges && sub._id) {
                    await TestSubmissionModel.updateOne(
                        { _id: sub._id },
                        { $set: { objections: sub.objections } }
                    );
                }
            }
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            let dbModified = false;

            db.testSubmissions.forEach(sub => {
                if (Array.isArray(sub.objections)) {
                    sub.objections.forEach(obj => {
                        if (!obj.objectionId || !/^OBJ-\d{4}-[A-Z0-9]+$/i.test(String(obj.objectionId))) {
                            obj.objectionId = generateObjectionId();
                            dbModified = true;
                        }
                    });
                }
            });

            if (dbModified) {
                saveJSONData(db);
            }
        }
    } catch (err) {
        console.error("Failed to auto-migrate missing objectionIds:", err);
    }
};

// 1. Candidate Raise Objection on a specific question
router.post('/tests/objection/:submissionId', requireAuth, async (req, res) => {
    const { submissionId } = req.params;
    const { questionId, questionIndex, reason, details, attachments } = req.body;

    if (!questionId && questionIndex === undefined) {
        return res.status(400).json({ success: false, error: "Question reference is required." });
    }
    if (!reason || !details) {
        return res.status(400).json({ success: false, error: "Objection reason and details are required." });
    }

    try {
        let submission = null;
        let test = null;
        let jsonDb = null;
        const is12Digit = /^\d{12}$/.test(String(submissionId).trim());
        const mongoId = isBicsId(submissionId) ? toMongoId(submissionId) : submissionId;

        if (dbState.useMongo) {
            if (is12Digit) {
                submission = await TestSubmissionModel.findOne({ submissionRefId: submissionId, isDeleted: { $ne: true } });
            } else if (mongoose.Types.ObjectId.isValid(mongoId)) {
                submission = await TestSubmissionModel.findOne({ _id: mongoId, isDeleted: { $ne: true } });
            }
            if (!submission) {
                submission = await TestSubmissionModel.findOne({
                    $or: [
                        { submissionRefId: submissionId },
                        { _id: mongoose.Types.ObjectId.isValid(mongoId) ? mongoId : undefined },
                        { id: submissionId }
                    ].filter(Boolean),
                    isDeleted: { $ne: true }
                });
            }
            if (!submission) return res.status(404).json({ success: false, error: "Submission not found." });
            test = await TestConfigModel.findById(submission.testId);
        } else {
            jsonDb = getJSONData();
            jsonDb.testSubmissions = jsonDb.testSubmissions || [];
            submission = jsonDb.testSubmissions.find(s => !s.isDeleted && (
                String(s.submissionRefId) === String(submissionId) ||
                String(s.id || s._id) === String(submissionId) ||
                String(s.id || s._id) === resolveToObjectId(submissionId)
            ));
            if (!submission) return res.status(404).json({ success: false, error: "Submission not found." });
            jsonDb.tests = jsonDb.tests || [];
            test = jsonDb.tests.find(t => String(t.id || t._id) === String(submission.testId));
        }

        if (req.user && req.user.role !== 'admin') {
            const subCandId = String(submission.candidateId || submission.studentId || '');
            const userMongo = isBicsId(String(req.user.id || '')) ? toMongoId(String(req.user.id || '')) : String(req.user.id || '');
            const subNorm = isBicsId(subCandId) ? toMongoId(subCandId) : subCandId;
            if (subNorm !== userMongo && subCandId !== String(req.user.studentId || '') && String(submission.studentId || '') !== String(req.user.studentId || '')) {
                return res.status(403).json({ success: false, error: "Access denied: You cannot raise an objection on another candidate's submission." });
            }
        }

        if (test) {
            const vStatus = test.verificationStatus || (test.answersReleased ? 'released' : 'not_released');
            if (vStatus === 'closed') {
                return res.status(403).json({ success: false, error: "The objection and grievance window for this examination has been closed." });
            }
            if (vStatus === 'not_released') {
                return res.status(403).json({ success: false, error: "Answer sheets for this examination have not been released yet." });
            }
        }

        const generatedId = generateObjectionId();
        const validAttachments = Array.isArray(attachments) ? attachments.filter(a => typeof a === 'string' && a.trim() !== '') : [];

        let targetAns = null;
        if (questionId) {
            targetAns = (submission.answers || []).find(a => String(a.questionId) === String(questionId));
        }
        if (!targetAns && submission.answers && submission.answers[questionIndex]) {
            targetAns = submission.answers[questionIndex];
        }

        const initialScoreVal = (targetAns && typeof targetAns.initialScore === 'number')
            ? targetAns.initialScore
            : (targetAns && typeof targetAns.score === 'number' ? targetAns.score : 0);

        if (targetAns) {
            targetAns.isObjected = true;
            if (targetAns.initialScore === null || targetAns.initialScore === undefined) {
                targetAns.initialScore = initialScoreVal;
            }
        }

        const newObj = {
            objectionId: generatedId,
            questionId: String(questionId || ''),
            questionIndex: Number(questionIndex || 0),
            reason: reason.trim(),
            details: details.trim(),
            attachments: validAttachments,
            marksBefore: initialScoreVal,
            marksAfter: null,
            marksDiff: 0,
            status: 'pending',
            raisedAt: new Date()
        };

        if (dbState.useMongo) {
            submission.objections = submission.objections || [];
            submission.objections = submission.objections.filter(o => o.questionIndex !== Number(questionIndex));
            submission.objections.push(newObj);
            submission.markModified('objections');
            submission.markModified('answers');
            await submission.save();
        } else {
            submission.objections = submission.objections || [];
            submission.objections = submission.objections.filter(o => o.questionIndex !== Number(questionIndex));
            submission.objections.push(newObj);
            saveJSONData(jsonDb);
        }

        await logSystemAction(submission.candidateName || 'Candidate', 'OBJECTION_RAISED', `Candidate raised objection ${generatedId} for Question #${Number(questionIndex) + 1} on submission ${submissionId}: ${reason}`, 'info');
        return res.json({ success: true, message: "Objection submitted successfully.", objectionId: generatedId, objections: submission.objections });
    } catch (err) {
        console.error("Failed to submit objection:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// 2. Admin Resolve Question Objection
router.post('/admin/tests/objection/resolve', requireAdmin, async (req, res) => {
    const { submissionId, questionId, questionIndex, status, adminRemarks, revisedMarks } = req.body;

    if (!submissionId || questionIndex === undefined || !status) {
        return res.status(400).json({ success: false, error: "Submission ID, questionIndex, and status are required." });
    }

    try {
        let submission = null;
        let test = null;

        const is12Digit = /^\d{12}$/.test(String(submissionId).trim());
        const mongoId = isBicsId(submissionId) ? toMongoId(submissionId) : submissionId;

        if (dbState.useMongo) {
            if (is12Digit) {
                submission = await TestSubmissionModel.findOne({ submissionRefId: submissionId, isDeleted: { $ne: true } });
            } else if (mongoose.Types.ObjectId.isValid(mongoId)) {
                submission = await TestSubmissionModel.findOne({ _id: mongoId, isDeleted: { $ne: true } });
            }
            if (!submission) {
                submission = await TestSubmissionModel.findOne({
                    $or: [
                        { submissionRefId: submissionId },
                        { _id: mongoose.Types.ObjectId.isValid(mongoId) ? mongoId : undefined },
                        { id: submissionId }
                    ].filter(Boolean),
                    isDeleted: { $ne: true }
                });
            }
            if (!submission) return res.status(404).json({ success: false, error: "Submission not found." });

            test = await TestConfigModel.findById(submission.testId);

            submission.objections = submission.objections || [];
            const obj = submission.objections.find(o => o.questionIndex === Number(questionIndex) || (questionId && String(o.questionId) === String(questionId)));
            if (!obj) return res.status(404).json({ success: false, error: "Objection not found." });

            obj.status = status;
            obj.adminRemarks = adminRemarks || '';
            obj.resolvedAt = new Date();

            let targetAnswer = null;
            if (obj.questionId) {
                targetAnswer = (submission.answers || []).find(a => String(a.questionId) === String(obj.questionId));
            }
            if (!targetAnswer && submission.answers && submission.answers[questionIndex]) {
                targetAnswer = submission.answers[questionIndex];
            }

            const firstAssigned = (targetAnswer && typeof targetAnswer.initialScore === 'number')
                ? targetAnswer.initialScore
                : (targetAnswer && typeof targetAnswer.score === 'number' ? targetAnswer.score : 0);

            if (targetAnswer && (targetAnswer.initialScore === null || targetAnswer.initialScore === undefined)) {
                targetAnswer.initialScore = firstAssigned;
            }

            if ((status === 'resolved' || status === 'resolved_accepted') && revisedMarks !== undefined && revisedMarks !== null && !isNaN(revisedMarks)) {
                const quest = test?.questions?.find(q => String(q.id || q._id) === String(obj.questionId || (targetAnswer && targetAnswer.questionId))) || test?.questions?.[questionIndex];
                const maxPts = Number(quest?.points || targetAnswer?.maxPoints || 100);

                if (Number(revisedMarks) > maxPts) {
                    return res.status(400).json({ success: false, error: `Revised marks (${revisedMarks}) cannot exceed maximum question marks (${maxPts}).` });
                }
                if (Number(revisedMarks) < 0) {
                    return res.status(400).json({ success: false, error: `Revised marks cannot be negative.` });
                }

                const revised = Number(revisedMarks);
                obj.resolvedMarks = revised;
                obj.marksBefore = firstAssigned;
                obj.marksAfter = revised;
                obj.marksDiff = Number((revised - firstAssigned).toFixed(2));

                if (!targetAnswer) {
                    const synthesizedQId = String(obj.questionId || quest?.id || quest?._id || questionId || `q_${questionIndex}`);
                    targetAnswer = {
                        questionId: synthesizedQId,
                        type: quest?.type || 'mcq',
                        score: revised,
                        initialScore: firstAssigned,
                        scoreAfterObjection: revised,
                        resolvedMarks: revised,
                        maxPoints: maxPts,
                        isObjected: true,
                        isObjectionResolved: true
                    };
                    submission.answers = submission.answers || [];
                    submission.answers.push(targetAnswer);
                } else {
                    targetAnswer.score = revised;
                    targetAnswer.scoreAfterObjection = revised;
                    targetAnswer.resolvedMarks = revised;
                    targetAnswer.maxPoints = maxPts;
                    targetAnswer.isObjectionResolved = true;
                }

                if (test) {
                    calculateSubmissionScore(submission, test);
                }
            } else if (status === 'rejected') {
                obj.marksBefore = firstAssigned;
                obj.marksAfter = firstAssigned;
                obj.marksDiff = 0;
                if (targetAnswer) {
                    targetAnswer.scoreAfterObjection = firstAssigned;
                    targetAnswer.isObjectionResolved = true;
                }
            }

            submission.markModified('objections');
            submission.markModified('answers');
            submission.markModified('evaluation');
            await submission.save();
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submission = db.testSubmissions.find(s => !s.isDeleted && (
                String(s.submissionRefId) === String(submissionId) ||
                String(s.id || s._id) === String(submissionId) ||
                String(s.id || s._id) === resolveToObjectId(submissionId)
            ));
            if (!submission) return res.status(404).json({ success: false, error: "Submission not found." });

            test = (db.tests || []).find(t => String(t.id || t._id) === String(submission.testId));

            submission.objections = submission.objections || [];
            const obj = submission.objections.find(o => o.questionIndex === Number(questionIndex) || (questionId && String(o.questionId) === String(questionId)));
            if (!obj) return res.status(404).json({ success: false, error: "Objection not found." });

            obj.status = status;
            obj.adminRemarks = adminRemarks || '';
            obj.resolvedAt = new Date();

            let targetAnswer = null;
            if (obj.questionId) {
                targetAnswer = (submission.answers || []).find(a => String(a.questionId) === String(obj.questionId));
            }
            if (!targetAnswer && submission.answers && submission.answers[questionIndex]) {
                targetAnswer = submission.answers[questionIndex];
            }

            const firstAssigned = (targetAnswer && typeof targetAnswer.initialScore === 'number')
                ? targetAnswer.initialScore
                : (targetAnswer && typeof targetAnswer.score === 'number' ? targetAnswer.score : 0);

            if (targetAnswer && (targetAnswer.initialScore === null || targetAnswer.initialScore === undefined)) {
                targetAnswer.initialScore = firstAssigned;
            }

            if ((status === 'resolved' || status === 'resolved_accepted') && revisedMarks !== undefined && revisedMarks !== null && !isNaN(revisedMarks)) {
                const quest = test?.questions?.find(q => String(q.id || q._id) === String(obj.questionId || (targetAnswer && targetAnswer.questionId))) || test?.questions?.[questionIndex];
                const maxPts = Number(quest?.points || targetAnswer?.maxPoints || 100);

                if (Number(revisedMarks) > maxPts) {
                    return res.status(400).json({ success: false, error: `Revised marks (${revisedMarks}) cannot exceed maximum question marks (${maxPts}).` });
                }
                if (Number(revisedMarks) < 0) {
                    return res.status(400).json({ success: false, error: `Revised marks cannot be negative.` });
                }

                const revised = Number(revisedMarks);
                obj.resolvedMarks = revised;
                obj.marksBefore = firstAssigned;
                obj.marksAfter = revised;
                obj.marksDiff = Number((revised - firstAssigned).toFixed(2));

                if (!targetAnswer) {
                    const synthesizedQId = String(obj.questionId || quest?.id || quest?._id || questionId || `q_${questionIndex}`);
                    targetAnswer = {
                        questionId: synthesizedQId,
                        type: quest?.type || 'mcq',
                        score: revised,
                        initialScore: firstAssigned,
                        scoreAfterObjection: revised,
                        resolvedMarks: revised,
                        maxPoints: maxPts,
                        isObjected: true,
                        isObjectionResolved: true
                    };
                    submission.answers = submission.answers || [];
                    submission.answers.push(targetAnswer);
                } else {
                    targetAnswer.score = revised;
                    targetAnswer.scoreAfterObjection = revised;
                    targetAnswer.resolvedMarks = revised;
                    targetAnswer.maxPoints = maxPts;
                    targetAnswer.isObjectionResolved = true;
                }

                if (test) {
                    calculateSubmissionScore(submission, test);
                }
            } else if (status === 'rejected') {
                obj.marksBefore = firstAssigned;
                obj.marksAfter = firstAssigned;
                obj.marksDiff = 0;
                if (targetAnswer) {
                    targetAnswer.scoreAfterObjection = firstAssigned;
                    targetAnswer.isObjectionResolved = true;
                }
            }

            saveJSONData(db);
        }

        await logSystemAction('admin', 'OBJECTION_RESOLVED', `Admin resolved objection for Question #${Number(questionIndex) + 1} on submission ${submissionId} with status ${status}`, 'info');
        return res.json({ success: true, message: `Objection marked as ${status}.`, submission });
    } catch (err) {
        console.error("Failed to resolve objection:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// 3. Admin Get All Objections
router.get('/admin/objections', requireAdmin, async (req, res) => {
    try {
        let submissions = [];
        if (dbState.useMongo) {
            submissions = await TestSubmissionModel.find({ "objections.0": { $exists: true }, isDeleted: { $ne: true } });
            await ensureObjectionIdsSaved(submissions);
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submissions = db.testSubmissions.filter(s => !s.isDeleted && s.objections && s.objections.length > 0);
            await ensureObjectionIdsSaved(submissions);
        }

        const allObjections = [];
        await Promise.all(submissions.map(async (sub) => {
            let test = null;
            if (dbState.useMongo) {
                test = await TestConfigModel.findById(sub.testId).lean();
            } else {
                const db = getJSONData();
                test = (db.tests || []).find(t => String(t.id || t._id) === String(sub.testId));
            }

            (sub.objections || []).forEach(obj => {
                let targetAns = (sub.answers || []).find(a => String(a.questionId) === String(obj.questionId));
                if (!targetAns && sub.answers && sub.answers[obj.questionIndex]) {
                    targetAns = sub.answers[obj.questionIndex];
                }

                let targetQuest = null;
                if (test && test.questions) {
                    targetQuest = test.questions.find(q => String(q.id || q._id) === String(obj.questionId)) || test.questions[obj.questionIndex];
                }
                if (!targetQuest && targetAns) {
                    targetQuest = {
                        title: targetAns.questionTitle || targetAns.title || `Question #${(obj.questionIndex || 0) + 1}`,
                        description: targetAns.questionDescription || targetAns.questionText || targetAns.description || targetAns.problemStatement || '',
                        type: targetQuest?.type || targetAns?.type || (targetAns?.submittedHtml !== undefined || targetAns?.submittedCss !== undefined || targetAns?.submittedJs !== undefined ? 'web' : (targetAns?.submittedCode ? 'coding' : 'mcq'))
                    };
                }

                allObjections.push({
                    objectionId: obj.objectionId || generateObjectionId(),
                    submissionId: sub._id || sub.id,
                    candidateId: sub.candidateId,
                    candidateName: sub.candidateName,
                    studentId: sub.studentId,
                    testId: sub.testId,
                    testTitle: sub.testTitle,
                    submittedAt: sub.submittedAt,
                    questionIndex: obj.questionIndex,
                    questionId: obj.questionId,
                    reason: obj.reason || 'General Grievance',
                    details: obj.details || obj.studentComment || obj.description || '',
                    attachments: obj.attachments || [],
                    status: obj.status || 'pending',
                    raisedAt: obj.raisedAt || obj.createdAt || sub.submittedAt || new Date(),
                    adminRemarks: obj.adminRemarks || obj.resolutionNote || '',
                    resolvedMarks: (obj.resolvedMarks !== undefined && obj.resolvedMarks !== null) ? obj.resolvedMarks : null,
                    resolvedAt: obj.resolvedAt || null,
                    submittedAnswer: targetAns || null,
                    targetQuestion: targetQuest || null,
                    questionPoints: Number(targetQuest?.points || targetAns?.maxPoints || 10)
                });
            });
        }));

        allObjections.sort((a, b) => new Date(b.raisedAt) - new Date(a.raisedAt));
        return res.json(allObjections);
    } catch (err) {
        console.error("Failed to fetch admin objections:", err);
        return res.status(500).json({ error: err.message });
    }
});

// 4. Get Candidate Objections List (Student view)
router.get('/tests/objections/student', requireAuth, async (req, res) => {
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
                return res.status(403).json({ error: "Access denied: You cannot view objections for another candidate." });
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
                submissions = await TestSubmissionModel.find({ ...candFilter, "objections.0": { $exists: true }, isDeleted: { $ne: true } });
                await ensureObjectionIdsSaved(submissions);
            }
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            const candNorm = resolveToObjectId(String(candidateId));
            const reqStudId = String(req.user?.studentId || '');
            submissions = db.testSubmissions.filter(s => {
                if (s.isDeleted || !s.objections || s.objections.length === 0) return false;
                const sCand = s.candidateId ? String(s.candidateId) : '';
                const sCandNorm = sCand ? resolveToObjectId(sCand) : '';
                return (
                    (sCand && (sCand === String(candidateId) || sCandNorm === candNorm)) ||
                    (s.studentId && (String(s.studentId) === String(candidateId) || (reqStudId && String(s.studentId) === reqStudId)))
                );
            });
            await ensureObjectionIdsSaved(submissions);
        }

        const studentObjections = [];
        await Promise.all(submissions.map(async (sub) => {
            let test = null;
            if (dbState.useMongo) {
                test = await TestConfigModel.findById(sub.testId).lean();
            } else {
                const db = getJSONData();
                test = (db.tests || []).find(t => String(t.id || t._id) === String(sub.testId));
            }

            (sub.objections || []).forEach(obj => {
                let targetAns = (sub.answers || []).find(a => String(a.questionId) === String(obj.questionId));
                if (!targetAns && sub.answers && sub.answers[obj.questionIndex]) {
                    targetAns = sub.answers[obj.questionIndex];
                }

                let targetQuest = null;
                if (test && test.questions) {
                    targetQuest = test.questions.find(q => String(q.id || q._id) === String(obj.questionId)) || test.questions[obj.questionIndex];
                }
                if (!targetQuest && targetAns) {
                    targetQuest = {
                        title: targetAns.questionTitle || targetAns.title || `Question #${(obj.questionIndex || 0) + 1}`,
                        description: targetAns.questionDescription || targetAns.questionText || targetAns.description || targetAns.problemStatement || '',
                        type: targetQuest?.type || targetAns?.type || (targetAns?.submittedHtml !== undefined || targetAns?.submittedCss !== undefined || targetAns?.submittedJs !== undefined ? 'web' : (targetAns?.submittedCode ? 'coding' : 'mcq'))
                    };
                }

                studentObjections.push({
                    objectionId: obj.objectionId || generateObjectionId(),
                    submissionId: sub._id || sub.id,
                    testId: sub.testId,
                    testTitle: sub.testTitle,
                    submittedAt: sub.submittedAt,
                    questionIndex: obj.questionIndex,
                    questionId: obj.questionId,
                    reason: obj.reason || 'General Grievance',
                    details: obj.details || obj.studentComment || obj.description || '',
                    attachments: obj.attachments || [],
                    status: obj.status || 'pending',
                    raisedAt: obj.raisedAt || obj.createdAt || sub.submittedAt || new Date(),
                    adminRemarks: obj.adminRemarks || obj.resolutionNote || '',
                    resolvedMarks: (obj.resolvedMarks !== undefined && obj.resolvedMarks !== null) ? obj.resolvedMarks : null,
                    resolvedAt: obj.resolvedAt || null,
                    submittedAnswer: targetAns || null,
                    targetQuestion: targetQuest || null,
                    questionPoints: Number(targetQuest?.points || targetAns?.maxPoints || 10)
                });
            });
        }));

        studentObjections.sort((a, b) => new Date(b.raisedAt) - new Date(a.raisedAt));
        return res.json(studentObjections);
    } catch (err) {
        console.error("Failed to fetch candidate objections:", err);
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
