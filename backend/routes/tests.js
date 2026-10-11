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

const activeSubmissionsProcessing = new Set();

// 1. Get active tests for student dashboard
router.get('/active', async (req, res) => {
    const { candidateId } = req.query;
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
router.get('/submitted', async (req, res) => {
    const { candidateId } = req.query;
    if (!candidateId) {
        return res.status(400).json({ error: "candidateId is required" });
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
                        webcamStatus: sub.proctoringLog.webcamStatus || 'active',
                        events: (sub.proctoringLog.events || []).filter(e => e.type === 'DISQUALIFIED' || e.type === 'ADMIN_WARNING' || (e.durationSeconds && e.durationSeconds > 5))
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

// 3. Get specific test for exam view (Strips answers)
router.get('/:id', async (req, res) => {
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

        const qSanitized = (test.questions || []).map(q => {
            if (q.type === 'mcq') {
                const { correctOptionIndex, ...rest } = q;
                return rest;
            }
            return q;
        });

        return res.json({ ...test, questions: qSanitized });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 4. Initialize test session
router.post('/start/:id', async (req, res) => {
    const { id } = req.params;
    const { candidateId, candidateName, studentId } = req.body;

    if (!candidateId) return res.status(400).json({ error: "Candidate ID is required" });

    try {
        let test = null;
        if (dbState.useMongo) {
            test = await TestConfigModel.findById(id);
        } else {
            const db = getJSONData();
            db.tests = db.tests || [];
            test = db.tests.find(t => t.id === id || t._id === id);
        }

        if (!test) return res.status(404).json({ error: "Test configuration not found" });

        let submission = null;
        if (dbState.useMongo) {
            const candFilter = buildCandidateQueryFilter(candidateId);
            const queryTestId = mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
            if (candFilter) {
                submission = await TestSubmissionModel.findOne({ ...candFilter, testId: queryTestId });
            }
            if (submission) {
                return res.status(400).json({ error: "You have already attempted or completed this examination. Re-attempts are not permitted." });
            }
            submission = new TestSubmissionModel({
                candidateId: mongoose.Types.ObjectId.isValid(candidateId) ? new mongoose.Types.ObjectId(candidateId) : undefined,
                candidateName,
                studentId,
                testId: id,
                testTitle: test.title,
                startedAt: new Date(),
                status: 'started',
                answers: []
            });
            await submission.save();
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
                status: 'started',
                proctoringLog: { fullscreenExits: 0, tabSwitches: 0, webcamStatus: 'active' },
                answers: []
            };
            db.testSubmissions.push(submission);
            saveJSONData(db);
        }

        await logSystemAction(candidateName || studentId || 'Candidate', 'TEST_STARTED', `Candidate started the examination "${test.title}" (${id})`, 'info');
        return res.json({ success: true, submission });
    } catch (e) {
        console.error(e);
        await logSystemAction('system', 'TECHNICAL_ERROR', `Failed to initialize test session for candidate ID ${candidateId}: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    }
});

// 5. Generate Exam Token
router.post('/generate-token', async (req, res) => {
    const { candidateId, testId } = req.body;
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
            student = await CandidateModel.findById(tokenDoc.candidateId);
            test = await TestConfigModel.findById(tokenDoc.testId);
            await TestTokenModel.deleteOne({ token });
        } else {
            const db = getJSONData();
            student = (db.candidates || []).find(c => c.id === tokenDoc.candidateId || c._id === tokenDoc.candidateId);
            db.tests = db.tests || [];
            test = db.tests.find(t => t.id === tokenDoc.testId || t._id === tokenDoc.testId);
            db.tokens = db.tokens.filter(t => t.token !== token);
            saveJSONData(db);
        }

        if (!student || !test) {
            return res.status(404).json({ error: "Student or Test configuration associated with this token not found." });
        }

        const qSanitized = (test.questions || []).map(q => {
            let qObj = q.toObject ? q.toObject() : { ...q };
            if (qObj.type === 'mcq') {
                const { correctOptionIndex, ...rest } = qObj;
                return rest;
            }
            return qObj;
        });

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
                        submission.proctoringLog = submission.proctoringLog || { fullscreenExits: 0, tabSwitches: 0, webcamStatus: 'active', events: [] };
                        submission.proctoringLog.fullscreenExits = proctoringLog.fullscreenExits !== undefined ? proctoringLog.fullscreenExits : submission.proctoringLog.fullscreenExits;
                        submission.proctoringLog.tabSwitches = proctoringLog.tabSwitches !== undefined ? proctoringLog.tabSwitches : submission.proctoringLog.tabSwitches;
                        submission.proctoringLog.webcamStatus = proctoringLog.webcamStatus !== undefined ? proctoringLog.webcamStatus : submission.proctoringLog.webcamStatus;

                        if (Array.isArray(proctoringLog.events) && proctoringLog.events.length > 0) {
                            submission.proctoringLog.events = submission.proctoringLog.events || [];
                            const existingKeys = new Set(submission.proctoringLog.events.map(e => `${e.type}_${new Date(e.timestamp || e.startTime || Date.now()).getTime()}_${e.details || ''}`));
                            proctoringLog.events.forEach(ev => {
                                const k = `${ev.type}_${new Date(ev.timestamp || ev.startTime || Date.now()).getTime()}_${ev.details || ''}`;
                                if (!existingKeys.has(k)) {
                                    existingKeys.add(k);
                                    submission.proctoringLog.events.push(ev);
                                }
                            });
                        }
                    }
                    submission.status = status || 'submitted';
                    if (status !== 'started') {
                        submission.submittedAt = new Date();
                    }

                    const test = await TestConfigModel.findById(submission.testId);
                    if (test) {
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
                submission.proctoringLog = submission.proctoringLog || { fullscreenExits: 0, tabSwitches: 0, webcamStatus: 'active', events: [] };
                submission.proctoringLog.fullscreenExits = proctoringLog.fullscreenExits !== undefined ? proctoringLog.fullscreenExits : submission.proctoringLog.fullscreenExits;
                submission.proctoringLog.tabSwitches = proctoringLog.tabSwitches !== undefined ? proctoringLog.tabSwitches : submission.proctoringLog.tabSwitches;
                submission.proctoringLog.webcamStatus = proctoringLog.webcamStatus !== undefined ? proctoringLog.webcamStatus : submission.proctoringLog.webcamStatus;

                if (Array.isArray(proctoringLog.events) && proctoringLog.events.length > 0) {
                    submission.proctoringLog.events = submission.proctoringLog.events || [];
                    const existingKeys = new Set(submission.proctoringLog.events.map(e => `${e.type}_${new Date(e.timestamp || e.startTime || Date.now()).getTime()}_${e.details || ''}`));
                    proctoringLog.events.forEach(ev => {
                        const k = `${ev.type}_${new Date(ev.timestamp || ev.startTime || Date.now()).getTime()}_${ev.details || ''}`;
                        if (!existingKeys.has(k)) {
                            existingKeys.add(k);
                            submission.proctoringLog.events.push(ev);
                        }
                    });
                }
            }
            submission.status = status || 'submitted';
            if (status !== 'started') {
                submission.submittedAt = new Date();
            }

            db.tests = db.tests || [];
            const test = db.tests.find(t => t.id === submission.testId || t._id === submission.testId);
            if (test) {
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
            const totalWarnings = fsExits + tabSwitches;
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

            const hasLongExit = maxFsSec > 5 || maxTabSec > 5;
            const isFlagged = status === 'auto-submitted' || totalWarnings >= 1 || hasLongExit;

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
router.post('/reevaluation/:submissionId', async (req, res) => {
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
router.post('/run', async (req, res) => {
    const { sourceCode, testCases } = req.body;
    if (!sourceCode || !testCases || !Array.isArray(testCases)) {
        return res.status(400).json({ error: "sourceCode and testCases list are required." });
    }
    try {
        const result = await executeCode(sourceCode, testCases);
        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
});

module.exports = router;
