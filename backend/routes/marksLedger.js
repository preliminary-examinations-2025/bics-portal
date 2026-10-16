const express = require('express');
const router = express.Router();
const { 
    AcademicMarksLedgerModel, 
    TestConfigModel, 
    TestSubmissionModel, 
    CounterfoilSubmissionModel, 
    CandidateModel 
} = require('../models');
const { dbState, getJSONData, saveJSONData } = require('../config/db');
const { DEFAULT_ACADEMIC_COURSES } = require('../config/constants');
const { logSystemAction } = require('../utils/logger');
const { 
    getSubmissionScore, 
    buildSubmissionMap, 
    findSubmissionForStudent, 
    findCounterfoilForStudent, 
    calculateMarksLedgerEntry 
} = require('../utils/scoreCalculator');

// 1. Get Course List & Status
router.get('/courses', async (req, res) => {
    try {
        let ledgers = [];
        if (dbState.useMongo) {
            ledgers = await AcademicMarksLedgerModel.find()
                .select('courseCode linkedOnlineTestId linkedMstOnlineTestId linkedEseOnlineTestId isLocked updatedAt studentMarks.studentId')
                .lean();
        } else {
            const db = getJSONData();
            ledgers = db.academicMarksLedgers || [];
        }

        const courses = DEFAULT_ACADEMIC_COURSES.map(c => {
            const l = ledgers.find(l => l.courseCode === c.code);
            return {
                ...c,
                linkedOnlineTestId: l?.linkedOnlineTestId || '',
                linkedMstOnlineTestId: l?.linkedMstOnlineTestId || '',
                linkedEseOnlineTestId: l?.linkedEseOnlineTestId || '',
                isLocked: l?.isLocked || false,
                studentCount: l?.studentMarks?.length || 0,
                updatedAt: l?.updatedAt || null
            };
        });

        return res.json(courses);
    } catch (e) {
        console.error("Failed to list marks ledger courses:", e);
        return res.status(500).json({ error: e.message });
    }
});

// 2. Get Available Online Tests (Excludes test IDs already linked to any course/component)
router.get('/available-tests', async (req, res) => {
    try {
        const { currentCourseCode, targetExam } = req.query;
        let ledgers = [];
        let tests = [];

        if (dbState.useMongo) {
            ledgers = await AcademicMarksLedgerModel.find()
                .select('courseCode linkedOnlineTestId linkedMstOnlineTestId linkedEseOnlineTestId')
                .lean();
            tests = await TestConfigModel.find({ isDeleted: { $ne: true } })
                .select('_id title marks totalMarks courseCode')
                .lean();
        } else {
            const db = getJSONData();
            ledgers = db.academicMarksLedgers || [];
            tests = (db.tests || []).filter(t => !t.isDeleted);
        }

        // Gather all linked test IDs across all OTHER courses and components
        const assignedTestIds = new Set();
        ledgers.forEach(l => {
            if (l.courseCode !== currentCourseCode) {
                if (l.linkedOnlineTestId) assignedTestIds.add(String(l.linkedOnlineTestId));
                if (l.linkedMstOnlineTestId) assignedTestIds.add(String(l.linkedMstOnlineTestId));
                if (l.linkedEseOnlineTestId) assignedTestIds.add(String(l.linkedEseOnlineTestId));
            } else {
                // For the current course, only exclude the test assigned to the OTHER exam component
                if (targetExam === 'mst' && l.linkedEseOnlineTestId) {
                    assignedTestIds.add(String(l.linkedEseOnlineTestId));
                }
                if (targetExam === 'ese' && l.linkedMstOnlineTestId) {
                    assignedTestIds.add(String(l.linkedMstOnlineTestId));
                }
            }
        });

        // Deduplicate tests by ID and filter available ones
        const seenIds = new Set();
        const available = [];
        for (let t of tests) {
            const tid = String(t._id || t.id);
            if (!assignedTestIds.has(tid) && !seenIds.has(tid)) {
                seenIds.add(tid);
                available.push({
                    id: tid,
                    title: t.title,
                    marks: t.marks || t.totalMarks || 100,
                    courseCode: t.courseCode || ''
                });
            }
        }

        return res.json(available);
    } catch (e) {
        console.error("Failed to list available online tests:", e);
        return res.status(500).json({ error: e.message });
    }
});

// 3. Get Course Marks Ledger (Auto-fetches Counterfoil Written Marks & Linked Online Test Scores)
router.get('/ledger/:courseCode', async (req, res) => {
    const { courseCode } = req.params;
    const courseDef = DEFAULT_ACADEMIC_COURSES.find(c => c.code === courseCode) || { code: courseCode, name: courseCode, type: courseCode.endsWith('L') ? 'lab' : 'theory' };

    try {
        let ledger = null;
        let candidates = [];
        let counterfoils = [];

        if (dbState.useMongo) {
            ledger = await AcademicMarksLedgerModel.findOne({ courseCode }).lean();
            candidates = await CandidateModel.find()
                .select('studentId name rollNo registrationData.studentId registrationData.fullName')
                .lean();
            counterfoils = await CounterfoilSubmissionModel.find({ courseCode }).lean();
        } else {
            const db = getJSONData();
            db.academicMarksLedgers = db.academicMarksLedgers || [];
            ledger = db.academicMarksLedgers.find(l => l.courseCode === courseCode);
            candidates = db.candidates || [];
            counterfoils = (db.counterfoilSubmissions || []).filter(s => s.courseCode === courseCode);
        }

        const existingMap = new Map();
        if (ledger && Array.isArray(ledger.studentMarks)) {
            ledger.studentMarks.forEach(sm => existingMap.set(String(sm.studentId), sm));
        }

        const linkedMstId = ledger?.linkedMstOnlineTestId || ledger?.linkedOnlineTestId || '';
        const linkedEseId = ledger?.linkedEseOnlineTestId || '';

        let mstSubMap = null;
        let mstTestMax = 40;
        if (linkedMstId) {
            let mstSubmissions = [];
            let mstTest = null;
            if (dbState.useMongo) {
                mstSubmissions = await TestSubmissionModel.find({ testId: linkedMstId })
                    .select('candidateId studentId candidateName status totalScore score evaluation answers')
                    .lean();
                mstTest = await TestConfigModel.findById(linkedMstId)
                    .select('marks totalMarks title')
                    .lean();
            } else {
                const db = getJSONData();
                mstSubmissions = (db.testSubmissions || []).filter(s => String(s.testId) === String(linkedMstId));
                mstTest = (db.tests || []).find(t => String(t.id || t._id) === String(linkedMstId));
            }
            mstSubMap = buildSubmissionMap(mstSubmissions);
            if (mstTest) mstTestMax = Number(mstTest.marks || mstTest.totalMarks || 40);
        }

        let eseSubMap = null;
        let eseTestMax = 100;
        if (linkedEseId) {
            let eseSubmissions = [];
            let eseTest = null;
            if (dbState.useMongo) {
                eseSubmissions = await TestSubmissionModel.find({ testId: linkedEseId })
                    .select('candidateId studentId candidateName status totalScore score evaluation answers')
                    .lean();
                eseTest = await TestConfigModel.findById(linkedEseId)
                    .select('marks totalMarks title')
                    .lean();
            } else {
                const db = getJSONData();
                eseSubmissions = (db.testSubmissions || []).filter(s => String(s.testId) === String(linkedEseId));
                eseTest = (db.tests || []).find(t => String(t.id || t._id) === String(linkedEseId));
            }
            eseSubMap = buildSubmissionMap(eseSubmissions);
            if (eseTest) eseTestMax = Number(eseTest.marks || eseTest.totalMarks || 100);
        }

        // Map candidates to studentMarks array
        const studentMarks = candidates.map(cand => {
            const sId = String(cand.studentId || cand.registrationData?.studentId || cand._id);
            const sName = cand.name || cand.registrationData?.fullName || 'Candidate';
            const rollNo = cand.rollNo || cand.studentId || '';

            const existing = existingMap.get(sId) || {};

            // Auto-fetch Written MST (Midsem) counterfoil
            const mstCf = findCounterfoilForStudent(cand, existing, counterfoils, 'midsem');
            let mstWritten = Number(existing.mstWritten || 0);
            let mstWrittenStatus = existing.mstWrittenStatus || 'manual';
            if (mstCf) {
                mstWritten = Number(mstCf.totalObtained || 0);
                mstWrittenStatus = mstCf.status === 'approved' ? 'approved' : (mstCf.status === 'rejected' ? 'rejected' : 'pending_approval');
            }

            // Auto-fetch Written ESE (Endsem) counterfoil
            const eseCf = findCounterfoilForStudent(cand, existing, counterfoils, 'endsem');
            let eseWritten = Number(existing.eseWritten || 0);
            let eseWrittenStatus = existing.eseWrittenStatus || 'manual';
            if (eseCf) {
                eseWritten = Number(eseCf.totalObtained || 0);
                eseWrittenStatus = eseCf.status === 'approved' ? 'approved' : (eseCf.status === 'rejected' ? 'rejected' : 'pending_approval');
            }

            // Auto-fetch Online MST score if test is linked
            let mstOnline = Number(existing.mstOnline || 0);
            if (mstSubMap) {
                const mstSub = findSubmissionForStudent(cand, existing, mstSubMap);
                if (mstSub) {
                    const rawScored = getSubmissionScore(mstSub);
                    mstOnline = Math.min(40, Math.round(((rawScored / mstTestMax) * 40) * 100) / 100);
                }
            }

            // Auto-fetch Online ESE score if test is linked
            let eseOnline = Number(existing.eseOnline || 0);
            if (eseSubMap) {
                const eseSub = findSubmissionForStudent(cand, existing, eseSubMap);
                if (eseSub) {
                    const rawScored = getSubmissionScore(eseSub);
                    eseOnline = Math.min(100, Math.round(((rawScored / eseTestMax) * 100) * 100) / 100);
                }
            }

            const rawEntry = {
                studentId: sId,
                studentName: sName,
                rollNo,
                taAssignment: Number(existing.taAssignment || 0),
                taClassTest: Number(existing.taClassTest || 0),
                taQuiz: Number(existing.taQuiz || 0),
                taIdeation: Number(existing.taIdeation || 0),
                taPracticalEval: Number(existing.taPracticalEval || 0),
                taLabQuiz: Number(existing.taLabQuiz || 0),
                taProject: Number(existing.taProject || 0),

                mstWritten,
                mstWrittenStatus,
                mstOnline,
                mstViva: Number(existing.mstViva || 0),

                eseWritten,
                eseWrittenStatus,
                eseOnline,
                eseViva: Number(existing.eseViva || 0)
            };

            return calculateMarksLedgerEntry(rawEntry, courseDef.type);
        });

        const fullLedger = {
            courseCode: courseDef.code,
            courseName: courseDef.name,
            courseType: courseDef.type,
            linkedOnlineTestId: ledger?.linkedOnlineTestId || '',
            linkedMstOnlineTestId: ledger?.linkedMstOnlineTestId || '',
            linkedEseOnlineTestId: ledger?.linkedEseOnlineTestId || '',
            isLocked: ledger?.isLocked || false,
            lockedAt: ledger?.lockedAt || null,
            lockedBy: ledger?.lockedBy || '',
            studentMarks
        };

        return res.json(fullLedger);
    } catch (e) {
        console.error("Failed to fetch course marks ledger:", e);
        return res.status(500).json({ error: e.message });
    }
});

// 4. Save Course Marks Ledger
router.post('/save/:courseCode', async (req, res) => {
    const { courseCode } = req.params;
    const { studentMarks, linkedOnlineTestId, linkedMstOnlineTestId, linkedEseOnlineTestId } = req.body;

    const courseDef = DEFAULT_ACADEMIC_COURSES.find(c => c.code === courseCode) || { code: courseCode, name: courseCode, type: courseCode.endsWith('L') ? 'lab' : 'theory' };

    try {
        const recalculated = (studentMarks || []).map(m => calculateMarksLedgerEntry(m, courseDef.type));

        const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
        const userAgent = req.headers['user-agent'] || 'unknown';
        const actorId = req.user?.id || req.user?.username || 'admin';
        const actorRole = req.user?.role || 'admin';

        let oldMarks = [];
        const diff = [];

        if (dbState.useMongo) {
            let ledger = await AcademicMarksLedgerModel.findOne({ courseCode });
            if (ledger) {
                if (ledger.isLocked) {
                    return res.status(403).json({ error: "This course marks ledger is locked by administration and cannot be modified." });
                }
                oldMarks = ledger.studentMarks || [];
                const oldMap = new Map(oldMarks.map(m => [String(m.studentId), typeof m.toObject === 'function' ? m.toObject() : m]));

                recalculated.forEach(nm => {
                    const sid = String(nm.studentId);
                    const old = oldMap.get(sid);
                    if (!old) {
                        diff.push({ studentId: sid, type: 'ADD', after: nm });
                    } else {
                        const changes = {};
                        for (const key of Object.keys(nm)) {
                            if (JSON.stringify(old[key]) !== JSON.stringify(nm[key])) {
                                changes[key] = { from: old[key], to: nm[key] };
                            }
                        }
                        if (Object.keys(changes).length > 0) {
                            diff.push({ studentId: sid, type: 'UPDATE', changes });
                        }
                    }
                });

                if (linkedOnlineTestId !== undefined) ledger.linkedOnlineTestId = linkedOnlineTestId;
                if (linkedMstOnlineTestId !== undefined) ledger.linkedMstOnlineTestId = linkedMstOnlineTestId;
                if (linkedEseOnlineTestId !== undefined) ledger.linkedEseOnlineTestId = linkedEseOnlineTestId;
                ledger.studentMarks = recalculated;
            } else {
                recalculated.forEach(nm => diff.push({ studentId: String(nm.studentId), type: 'ADD', after: nm }));
                ledger = new AcademicMarksLedgerModel({
                    courseCode: courseDef.code,
                    courseName: courseDef.name,
                    courseType: courseDef.type,
                    linkedOnlineTestId: linkedOnlineTestId || '',
                    linkedMstOnlineTestId: linkedMstOnlineTestId || '',
                    linkedEseOnlineTestId: linkedEseOnlineTestId || '',
                    studentMarks: recalculated
                });
            }
            await ledger.save();
        } else {
            const db = getJSONData();
            db.academicMarksLedgers = db.academicMarksLedgers || [];
            const idx = db.academicMarksLedgers.findIndex(l => l.courseCode === courseCode);
            if (idx !== -1 && db.academicMarksLedgers[idx].isLocked) {
                return res.status(403).json({ error: "This course marks ledger is locked by administration and cannot be modified." });
            }
            oldMarks = idx !== -1 ? (db.academicMarksLedgers[idx].studentMarks || []) : [];
            const oldMap = new Map(oldMarks.map(m => [String(m.studentId), m]));
            recalculated.forEach(nm => {
                const sid = String(nm.studentId);
                const old = oldMap.get(sid);
                if (!old) {
                    diff.push({ studentId: sid, type: 'ADD', after: nm });
                } else if (JSON.stringify(old) !== JSON.stringify(nm)) {
                    diff.push({ studentId: sid, type: 'UPDATE', before: old, after: nm });
                }
            });

            const record = {
                courseCode: courseDef.code,
                courseName: courseDef.name,
                courseType: courseDef.type,
                linkedOnlineTestId: linkedOnlineTestId !== undefined ? linkedOnlineTestId : (db.academicMarksLedgers[idx]?.linkedOnlineTestId || ''),
                linkedMstOnlineTestId: linkedMstOnlineTestId !== undefined ? linkedMstOnlineTestId : (db.academicMarksLedgers[idx]?.linkedMstOnlineTestId || ''),
                linkedEseOnlineTestId: linkedEseOnlineTestId !== undefined ? linkedEseOnlineTestId : (db.academicMarksLedgers[idx]?.linkedEseOnlineTestId || ''),
                isLocked: db.academicMarksLedgers[idx]?.isLocked || false,
                studentMarks: recalculated,
                updatedAt: new Date().toISOString()
            };
            if (idx !== -1) {
                db.academicMarksLedgers[idx] = record;
            } else {
                db.academicMarksLedgers.push(record);
            }
            saveJSONData(db);
        }

        // Feature 5: Immutable Change-Data-Capture (CDC) Audit Log
        await logSystemAction({
            actor: actorId,
            actorId: actorId,
            actorRole: actorRole,
            action: 'MARKS_LEDGER_CDC',
            resourceType: 'academic_marks_ledger',
            resourceId: courseCode,
            details: `Marks ledger updated for course ${courseCode} (${diff.length} student record(s) modified).`,
            beforeState: { studentMarksCount: oldMarks.length },
            afterState: { studentMarksCount: recalculated.length },
            diff: diff,
            ipAddress: clientIp,
            userAgent: userAgent,
            severity: diff.length > 0 ? 'warning' : 'info'
        });

        return res.json({ 
            success: true, 
            message: `Marks ledger for ${courseCode} saved successfully.`,
            recordsModified: diff.length
        });
    } catch (e) {
        console.error("Failed to save marks ledger:", e);
        return res.status(500).json({ error: e.message });
    }
});

// 5. Link Online Test to Course & Sync Scores (Lab Courses Only)
router.post('/link-test/:courseCode', async (req, res) => {
    const { courseCode } = req.params;
    const { testId, targetExam = 'mst', syncOnlineScores } = req.body; // targetExam: 'mst' (40m) or 'ese' (100m)

    const courseDef = DEFAULT_ACADEMIC_COURSES.find(c => c.code === courseCode) || { code: courseCode, name: courseCode, type: courseCode.endsWith('L') ? 'lab' : 'theory' };

    if (courseDef.type !== 'lab') {
        return res.status(400).json({ error: "Online test linking applies strictly to Lab Courses (MST Online - 40m, ESE Online - 100m). Theory courses are evaluated via Written Counterfoil & TA." });
    }

    try {
        let allLedgers = [];
        let submissions = [];
        let testObj = null;

        if (dbState.useMongo) {
            allLedgers = await AcademicMarksLedgerModel.find().lean();
            if (testId) {
                submissions = await TestSubmissionModel.find({ testId }).lean();
                testObj = await TestConfigModel.findById(testId).lean();
            }
        } else {
            const db = getJSONData();
            allLedgers = db.academicMarksLedgers || [];
            if (testId) {
                submissions = (db.testSubmissions || []).filter(s => String(s.testId) === String(testId));
                testObj = (db.tests || []).find(t => String(t.id || t._id) === String(testId));
            }
        }

        // Check if test is assigned elsewhere
        if (testId) {
            const conflict = allLedgers.find(l => {
                const sameCourse = l.courseCode === courseCode;
                if (!sameCourse) {
                    return String(l.linkedOnlineTestId) === String(testId) ||
                           String(l.linkedMstOnlineTestId) === String(testId) ||
                           String(l.linkedEseOnlineTestId) === String(testId);
                } else {
                    if (targetExam === 'mst') {
                        return String(l.linkedEseOnlineTestId) === String(testId);
                    } else {
                        return String(l.linkedMstOnlineTestId) === String(testId);
                    }
                }
            });

            if (conflict) {
                return res.status(400).json({ error: `Test ID ${testId} is already assigned to course ${conflict.courseCode} (${conflict.courseName}) and cannot be reused.` });
            }
        }

        let ledger = null;
        if (dbState.useMongo) {
            ledger = await AcademicMarksLedgerModel.findOne({ courseCode });
            if (!ledger) {
                ledger = new AcademicMarksLedgerModel({
                    courseCode: courseDef.code,
                    courseName: courseDef.name,
                    courseType: courseDef.type,
                    linkedOnlineTestId: '',
                    linkedMstOnlineTestId: targetExam === 'mst' ? (testId || '') : '',
                    linkedEseOnlineTestId: targetExam === 'ese' ? (testId || '') : ''
                });
            } else {
                ledger.linkedOnlineTestId = '';
                if (targetExam === 'mst') ledger.linkedMstOnlineTestId = testId || '';
                else ledger.linkedEseOnlineTestId = testId || '';
            }
        } else {
            const db = getJSONData();
            db.academicMarksLedgers = db.academicMarksLedgers || [];
            let idx = db.academicMarksLedgers.findIndex(l => l.courseCode === courseCode);
            if (idx === -1) {
                ledger = {
                    courseCode: courseDef.code,
                    courseName: courseDef.name,
                    courseType: courseDef.type,
                    linkedOnlineTestId: '',
                    linkedMstOnlineTestId: targetExam === 'mst' ? (testId || '') : '',
                    linkedEseOnlineTestId: targetExam === 'ese' ? (testId || '') : '',
                    studentMarks: []
                };
                db.academicMarksLedgers.push(ledger);
            } else {
                db.academicMarksLedgers[idx].linkedOnlineTestId = '';
                if (targetExam === 'mst') db.academicMarksLedgers[idx].linkedMstOnlineTestId = testId || '';
                else db.academicMarksLedgers[idx].linkedEseOnlineTestId = testId || '';
                ledger = db.academicMarksLedgers[idx];
            }
        }

        // Sync online scores if test is linked (defaults to true unless explicitly false)
        if (syncOnlineScores !== false && testId && submissions.length > 0) {
            const testMaxMarks = Number(testObj?.marks || testObj?.totalMarks || (targetExam === 'mst' ? 40 : 100));
            const subMap = buildSubmissionMap(submissions);

            ledger.studentMarks = (ledger.studentMarks || []).map(m => {
                const sub = findSubmissionForStudent(m, m, subMap);
                if (sub) {
                    const rawScored = getSubmissionScore(sub);
                    if (targetExam === 'mst') {
                        // MST Online Exam is scaled out of 40 marks
                        m.mstOnline = Math.min(40, Math.round(((rawScored / testMaxMarks) * 40) * 100) / 100);
                    } else if (targetExam === 'ese') {
                        // ESE Online Exam is scaled out of 100 marks
                        m.eseOnline = Math.min(100, Math.round(((rawScored / testMaxMarks) * 100) * 100) / 100);
                    }
                }
                return calculateMarksLedgerEntry(m, courseDef.type);
            });
        }

        if (dbState.useMongo) {
            await ledger.save();
        } else {
            const db = getJSONData();
            saveJSONData(db);
        }

        const examLabel = targetExam === 'mst' ? 'Lab MST Online (40m max)' : 'Lab ESE Online (100m max)';
        await logSystemAction('admin', 'TEST_LINKED', `Linked online test ${testId} to ${examLabel} for course ${courseCode}`, 'info');
        return res.json({ 
            success: true, 
            message: testId ? `Successfully linked online test and synced scores for ${examLabel} in ${courseCode}.` : `Unlinked online test from ${examLabel} for course ${courseCode}.`,
            targetExam,
            testId
        });
    } catch (e) {
        console.error("Failed to link online test:", e);
        return res.status(500).json({ error: e.message });
    }
});

// 6. Toggle Lock Status
router.post('/toggle-lock/:courseCode', async (req, res) => {
    const { courseCode } = req.params;

    try {
        let isLocked = false;
        if (dbState.useMongo) {
            let ledger = await AcademicMarksLedgerModel.findOne({ courseCode });
            if (!ledger) {
                const courseDef = DEFAULT_ACADEMIC_COURSES.find(c => c.code === courseCode) || { code: courseCode, name: courseCode, type: courseCode.endsWith('L') ? 'lab' : 'theory' };
                ledger = new AcademicMarksLedgerModel({
                    courseCode: courseDef.code,
                    courseName: courseDef.name,
                    courseType: courseDef.type,
                    isLocked: true,
                    lockedAt: new Date(),
                    lockedBy: 'admin'
                });
            } else {
                ledger.isLocked = !ledger.isLocked;
                ledger.lockedAt = ledger.isLocked ? new Date() : null;
                ledger.lockedBy = ledger.isLocked ? 'admin' : '';
            }
            await ledger.save();
            isLocked = ledger.isLocked;
        } else {
            const db = getJSONData();
            db.academicMarksLedgers = db.academicMarksLedgers || [];
            let idx = db.academicMarksLedgers.findIndex(l => l.courseCode === courseCode);
            if (idx === -1) {
                const courseDef = DEFAULT_ACADEMIC_COURSES.find(c => c.code === courseCode) || { code: courseCode, name: courseCode, type: courseCode.endsWith('L') ? 'lab' : 'theory' };
                db.academicMarksLedgers.push({
                    courseCode: courseDef.code,
                    courseName: courseDef.name,
                    courseType: courseDef.type,
                    isLocked: true,
                    lockedAt: new Date().toISOString(),
                    studentMarks: []
                });
                isLocked = true;
            } else {
                db.academicMarksLedgers[idx].isLocked = !db.academicMarksLedgers[idx].isLocked;
                isLocked = db.academicMarksLedgers[idx].isLocked;
            }
            saveJSONData(db);
        }

        await logSystemAction('admin', 'LEDGER_LOCK_TOGGLED', `Admin set lock status to ${isLocked} for course ${courseCode}`, 'info');
        return res.json({ success: true, isLocked, message: `Course ${courseCode} is now ${isLocked ? 'locked' : 'unlocked'}.` });
    } catch (e) {
        console.error("Failed to toggle ledger lock:", e);
        return res.status(500).json({ error: e.message });
    }
});

// 7. Get Master Transcripts Grid (All Students * All Courses)
router.get('/master-transcripts', async (req, res) => {
    try {
        let candidates = [];
        let ledgers = [];

        if (dbState.useMongo) {
            candidates = await CandidateModel.find()
                .select('studentId name rollNo registrationData.studentId registrationData.fullName')
                .lean();
            ledgers = await AcademicMarksLedgerModel.find()
                .select('courseCode studentMarks.studentId studentMarks.finalScore studentMarks.grade studentMarks.gradePoint studentMarks.status')
                .lean();
        } else {
            const db = getJSONData();
            candidates = db.candidates || [];
            ledgers = db.academicMarksLedgers || [];
        }

        const courseDefs = DEFAULT_ACADEMIC_COURSES;
        const masterRows = candidates.map(cand => {
            const sId = String(cand.studentId || cand.registrationData?.studentId || cand._id);
            const sName = cand.name || cand.registrationData?.fullName || 'Candidate';
            const rollNo = cand.rollNo || cand.studentId || '';

            const courseScores = {};
            let totalGradePoints = 0;
            let countCourses = 0;

            courseDefs.forEach(c => {
                const ledger = ledgers.find(l => l.courseCode === c.code);
                const sm = (ledger?.studentMarks || []).find(m => String(m.studentId) === sId);
                if (sm) {
                    courseScores[c.code] = {
                        finalScore: sm.finalScore,
                        grade: sm.grade,
                        gradePoint: sm.gradePoint,
                        status: sm.status
                    };
                    totalGradePoints += Number(sm.gradePoint || 0);
                    countCourses++;
                } else {
                    courseScores[c.code] = {
                        finalScore: 0,
                        grade: 'FF',
                        gradePoint: 0,
                        status: 'FAIL'
                    };
                }
            });

            const cgpa = countCourses > 0 ? Math.round((totalGradePoints / countCourses) * 100) / 100 : 0;

            return {
                studentId: sId,
                studentName: sName,
                rollNo,
                courseScores,
                cgpa
            };
        });

        return res.json({
            courses: courseDefs,
            transcripts: masterRows
        });
    } catch (e) {
        console.error("Failed to generate master transcripts:", e);
        return res.status(500).json({ error: e.message });
    }
});

module.exports = router;
