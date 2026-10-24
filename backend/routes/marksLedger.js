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
const { requireAdmin } = require('../middleware/auth');
const { syncContestNormalizedMarks, syncCandidateNormalizedMarks } = require('../utils/taNormalizedMarks');

function truncateToTwoDigits(val) {
    if (val === undefined || val === null || isNaN(val)) return 0;
    return Math.trunc(Number(val) * 100 + 1e-9) / 100;
}

const ONLINE_TEST_COMPONENTS = {
    mstQuiz1: { label: 'Theory MST Quiz 1', maxMarks: 20, courseType: 'theory' },
    eseQuiz1: { label: 'Theory ESE Quiz 1', maxMarks: 30, courseType: 'theory' },
    labQuiz1: { label: 'Lab Quiz 1', maxMarks: 60, courseType: 'lab' },
    mstOnline: { label: 'Lab MST Online', maxMarks: 40, courseType: 'lab' },
    eseOnline: { label: 'Lab ESE Online', maxMarks: 100, courseType: 'lab' }
};

function normalizeTargetComponent(target) {
    if (!target) return null;
    if (target === 'mst') return 'mstOnline';
    if (target === 'ese') return 'eseOnline';
    return target;
}

function getDefaultKataContests(courseCode) {
    if (courseCode === 'R526CS02L') {
        return ['SHIN02', 'SHIN03', 'SHIN04', 'SHIN05', 'SHIN06', 'SHIN07'];
    }
    if (courseCode === 'R526CS03L') {
        return ['FORMA02', 'FORMA03', 'FORMA04', 'FORMA05', 'FORMA06', 'FORMA07'];
    }
    return [];
}

function getCourseTrack(courseCode) {
    if (courseCode === 'R526CS02L') return 'shin';
    if (courseCode === 'R526CS03L') return 'forma';
    return null;
}

// 1. Get Course List & Status
router.get('/courses', async (req, res) => {
    try {
        let ledgers = [];
        if (dbState.useMongo) {
            ledgers = await AcademicMarksLedgerModel.find()
                .select('courseCode linkedOnlineTestId linkedMstOnlineTestId linkedEseOnlineTestId linkedOnlineTestIds configuredKataContests isLocked updatedAt studentMarks.studentId')
                .lean();
        } else {
            const db = getJSONData();
            ledgers = db.academicMarksLedgers || [];
        }

        const courses = DEFAULT_ACADEMIC_COURSES.map(c => {
            const l = ledgers.find(l => l.courseCode === c.code);
            const linkedIds = {
                mstQuiz1: l?.linkedOnlineTestIds?.mstQuiz1 || '',
                eseQuiz1: l?.linkedOnlineTestIds?.eseQuiz1 || '',
                labQuiz1: l?.linkedOnlineTestIds?.labQuiz1 || '',
                mstOnline: l?.linkedOnlineTestIds?.mstOnline || l?.linkedMstOnlineTestId || (c.type === 'lab' ? l?.linkedOnlineTestId : '') || '',
                eseOnline: l?.linkedOnlineTestIds?.eseOnline || l?.linkedEseOnlineTestId || ''
            };
            return {
                ...c,
                linkedOnlineTestId: l?.linkedOnlineTestId || '',
                linkedMstOnlineTestId: l?.linkedMstOnlineTestId || '',
                linkedEseOnlineTestId: l?.linkedEseOnlineTestId || '',
                linkedOnlineTestIds: linkedIds,
                configuredKataContests: (l?.configuredKataContests && l.configuredKataContests.length > 0)
                    ? l.configuredKataContests
                    : getDefaultKataContests(c.code),
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
        const { currentCourseCode, targetComponent, targetExam } = req.query;
        const normTarget = normalizeTargetComponent(targetComponent || targetExam);

        let ledgers = [];
        let tests = [];

        if (dbState.useMongo) {
            ledgers = await AcademicMarksLedgerModel.find()
                .select('courseCode linkedOnlineTestId linkedMstOnlineTestId linkedEseOnlineTestId linkedOnlineTestIds')
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
            const lIds = l.linkedOnlineTestIds || {};
            const allTargetKeys = ['mstQuiz1', 'eseQuiz1', 'labQuiz1', 'mstOnline', 'eseOnline'];

            allTargetKeys.forEach(tKey => {
                const tid = lIds[tKey] || (tKey === 'mstOnline' ? (l.linkedMstOnlineTestId || l.linkedOnlineTestId) : (tKey === 'eseOnline' ? l.linkedEseOnlineTestId : ''));
                if (tid) {
                    if (l.courseCode !== currentCourseCode) {
                        assignedTestIds.add(String(tid));
                    } else if (normTarget && tKey !== normTarget) {
                        // For the current course, only exclude tests assigned to OTHER components
                        assignedTestIds.add(String(tid));
                    }
                }
            });
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
                .select('studentId name rollNo username registrationData.studentId registrationData.fullName +taNormalizedContestMarks')
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

        // Determine all linked online test IDs
        const linkedIds = {
            mstQuiz1: ledger?.linkedOnlineTestIds?.mstQuiz1 || '',
            eseQuiz1: ledger?.linkedOnlineTestIds?.eseQuiz1 || '',
            labQuiz1: ledger?.linkedOnlineTestIds?.labQuiz1 || '',
            mstOnline: ledger?.linkedOnlineTestIds?.mstOnline || ledger?.linkedMstOnlineTestId || (courseDef.type === 'lab' ? ledger?.linkedOnlineTestId : '') || '',
            eseOnline: ledger?.linkedOnlineTestIds?.eseOnline || ledger?.linkedEseOnlineTestId || ''
        };

        // Fetch submissions for all linked online tests
        const subMaps = {};
        for (const [key, testId] of Object.entries(linkedIds)) {
            if (testId) {
                let subs = [];
                let testCfg = null;
                if (dbState.useMongo) {
                    subs = await TestSubmissionModel.find({ testId })
                        .select('candidateId studentId candidateName status totalScore score evaluation answers')
                        .lean();
                    testCfg = await TestConfigModel.findById(testId).select('marks totalMarks title').lean();
                } else {
                    const db = getJSONData();
                    subs = (db.testSubmissions || []).filter(s => String(s.testId) === String(testId));
                    testCfg = (db.tests || []).find(t => String(t.id || t._id) === String(testId));
                }
                const defaultMax = ONLINE_TEST_COMPONENTS[key]?.maxMarks || 100;
                const testMax = Number(testCfg?.marks || testCfg?.totalMarks || defaultMax);
                subMaps[key] = {
                    subMap: buildSubmissionMap(subs),
                    testMax
                };
            }
        }

        const configuredContests = (ledger?.configuredKataContests && ledger.configuredKataContests.length > 0)
            ? ledger.configuredKataContests
            : getDefaultKataContests(courseDef.code);
        const track = getCourseTrack(courseDef.code);

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

            // Theory Quizzes
            const existTQ = existing.theoryQuizzes || {};
            let mstQuiz1 = Number(existTQ.mstQuiz1 ?? existing.mstQuiz1 ?? 0);
            if (subMaps.mstQuiz1) {
                const sub = findSubmissionForStudent(cand, existing, subMaps.mstQuiz1.subMap);
                if (sub) {
                    const rawScored = getSubmissionScore(sub);
                    mstQuiz1 = truncateToTwoDigits(Math.min(20, (rawScored / subMaps.mstQuiz1.testMax) * 20));
                }
            }

            let eseQuiz1 = Number(existTQ.eseQuiz1 ?? existing.eseQuiz1 ?? 0);
            if (subMaps.eseQuiz1) {
                const sub = findSubmissionForStudent(cand, existing, subMaps.eseQuiz1.subMap);
                if (sub) {
                    const rawScored = getSubmissionScore(sub);
                    eseQuiz1 = truncateToTwoDigits(Math.min(30, (rawScored / subMaps.eseQuiz1.testMax) * 30));
                }
            }

            const theoryQuizzes = {
                mstQuiz1,
                mstQuiz2: Number(existTQ.mstQuiz2 ?? 0),
                mstQuiz3: Number(existTQ.mstQuiz3 ?? 0),
                eseQuiz1,
                eseQuiz2: Number(existTQ.eseQuiz2 ?? 0),
                eseQuiz3: Number(existTQ.eseQuiz3 ?? 0)
            };

            // Lab Quizzes
            const existLQ = existing.labQuizzes || {};
            let labQuiz1 = Number(existLQ.quiz1 ?? existing.labQuiz1 ?? 0);
            if (subMaps.labQuiz1) {
                const sub = findSubmissionForStudent(cand, existing, subMaps.labQuiz1.subMap);
                if (sub) {
                    const rawScored = getSubmissionScore(sub);
                    labQuiz1 = truncateToTwoDigits(Math.min(60, (rawScored / subMaps.labQuiz1.testMax) * 60));
                }
            }
            const labQuizzes = {
                quiz1: labQuiz1,
                quiz2: Number(existLQ.quiz2 ?? 0)
            };

            // Lab MST Online (40m)
            let mstOnline = Number(existing.mstOnline || 0);
            if (subMaps.mstOnline) {
                const sub = findSubmissionForStudent(cand, existing, subMaps.mstOnline.subMap);
                if (sub) {
                    const rawScored = getSubmissionScore(sub);
                    mstOnline = truncateToTwoDigits(Math.min(40, (rawScored / subMaps.mstOnline.testMax) * 40));
                }
            }

            // Lab ESE Online (100m)
            let eseOnline = Number(existing.eseOnline || 0);
            if (subMaps.eseOnline) {
                const sub = findSubmissionForStudent(cand, existing, subMaps.eseOnline.subMap);
                if (sub) {
                    const rawScored = getSubmissionScore(sub);
                    eseOnline = truncateToTwoDigits(Math.min(100, (rawScored / subMaps.eseOnline.testMax) * 100));
                }
            }

            // Lab Kata Contests
            let labKataContests = Array.isArray(existing.labKataContests) && existing.labKataContests.length > 0
                ? existing.labKataContests
                : [];
            
            // If empty and course is lab, auto-populate from candidate's normalized marks if available
            if (courseDef.type === 'lab' && labKataContests.length === 0 && track && cand.taNormalizedContestMarks?.[track]) {
                const trackList = cand.taNormalizedContestMarks[track] || [];
                labKataContests = configuredContests.map(cId => {
                    const cleanId = String(cId).trim().toUpperCase();
                    const entry = trackList.find(e => String(e.contestId).trim().toUpperCase() === cleanId);
                    const normScore = entry ? Number(entry.totalNormalizedScore || 0) : 0;
                    const maxPts = entry ? Number(entry.maxPossibleScore || 5) : 5;
                    const scaled = truncateToTwoDigits(Math.min(1.0, (normScore / (maxPts || 5)) * 1.0));
                    return { contestId: cId, normalizedScore: truncateToTwoDigits(normScore), scaledMark: scaled };
                });
            }

            const rawEntry = {
                studentId: sId,
                studentName: sName,
                rollNo,

                // Theory Granular
                theoryAssignments: existing.theoryAssignments || { a1: 0, a2: 0, a3: 0, a4: 0, a5: 0 },
                theoryClassTests: existing.theoryClassTests || { ct1: 0, ct2: 0, ct3: 0, ct4: 0, ct5: 0 },
                theoryQuizzes,
                theoryProject: Number(existing.theoryProject ?? existing.project ?? 0),

                // Lab Granular
                labPracticals: existing.labPracticals || { p1: 0, p2: 0, p3: 0, p4: 0, p5: 0, p6: 0, p7: 0, p8: 0, p9: 0, p10: 0 },
                labKataContests,
                labQuizzes,
                labProject: Number(existing.labProject ?? existing.project ?? 0),

                // MST & ESE
                mstWritten,
                mstWrittenStatus,
                mstOnline,
                mstViva: Number(existing.mstViva || 0),

                eseWritten,
                eseWrittenStatus,
                eseOnline,
                eseViva: Number(existing.eseViva || 0),

                // Legacy
                taAssignment: Number(existing.taAssignment || 0),
                taClassTest: Number(existing.taClassTest || 0),
                taQuiz: Number(existing.taQuiz || 0),
                taIdeation: Number(existing.taIdeation || 0),
                taPracticalEval: Number(existing.taPracticalEval || 0),
                taKata: Number(existing.taKata || 0),
                taLabQuiz: Number(existing.taLabQuiz || 0),
                taProject: Number(existing.taProject || 0)
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
            linkedOnlineTestIds: linkedIds,
            configuredKataContests: configuredContests,
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
    const { 
        studentMarks, 
        linkedOnlineTestId, 
        linkedMstOnlineTestId, 
        linkedEseOnlineTestId,
        linkedOnlineTestIds,
        configuredKataContests 
    } = req.body;

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
                if (linkedOnlineTestIds !== undefined) ledger.linkedOnlineTestIds = linkedOnlineTestIds;
                if (configuredKataContests !== undefined) ledger.configuredKataContests = configuredKataContests;
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
                    linkedOnlineTestIds: linkedOnlineTestIds || {},
                    configuredKataContests: configuredKataContests || getDefaultKataContests(courseDef.code),
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
                linkedOnlineTestIds: linkedOnlineTestIds !== undefined ? linkedOnlineTestIds : (db.academicMarksLedgers[idx]?.linkedOnlineTestIds || {}),
                configuredKataContests: configuredKataContests !== undefined ? configuredKataContests : (db.academicMarksLedgers[idx]?.configuredKataContests || getDefaultKataContests(courseDef.code)),
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

// 5. Universal Online Test Linking & Score Sync
router.post('/link-test/:courseCode', async (req, res) => {
    const { courseCode } = req.params;
    const { testId, targetComponent, targetExam, syncOnlineScores = true } = req.body;
    const normTarget = normalizeTargetComponent(targetComponent || targetExam || 'mstOnline');

    const courseDef = DEFAULT_ACADEMIC_COURSES.find(c => c.code === courseCode) || { code: courseCode, name: courseCode, type: courseCode.endsWith('L') ? 'lab' : 'theory' };
    const compMeta = ONLINE_TEST_COMPONENTS[normTarget];

    if (!compMeta) {
        return res.status(400).json({ 
            error: `Invalid targetComponent '${normTarget}'. Must be one of: ${Object.keys(ONLINE_TEST_COMPONENTS).join(', ')}` 
        });
    }

    if (compMeta.courseType !== courseDef.type) {
        return res.status(400).json({ 
            error: `Component '${compMeta.label}' belongs to ${compMeta.courseType} courses, but course ${courseCode} is a ${courseDef.type} course.` 
        });
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

        // Validate conflict: check if testId is already linked elsewhere
        if (testId) {
            const conflict = allLedgers.find(l => {
                const sameCourse = l.courseCode === courseCode;
                const lIds = l.linkedOnlineTestIds || {};
                for (const tKey of Object.keys(ONLINE_TEST_COMPONENTS)) {
                    const tid = lIds[tKey] || (tKey === 'mstOnline' ? (l.linkedMstOnlineTestId || l.linkedOnlineTestId) : (tKey === 'eseOnline' ? l.linkedEseOnlineTestId : ''));
                    if (tid && String(tid) === String(testId)) {
                        if (!sameCourse || tKey !== normTarget) {
                            return true;
                        }
                    }
                }
                return false;
            });

            if (conflict) {
                return res.status(400).json({ 
                    error: `Test ID ${testId} is already linked to course ${conflict.courseCode} (${conflict.courseName}) and cannot be reused.` 
                });
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
                    linkedOnlineTestIds: { [normTarget]: testId || '' }
                });
            } else {
                if (!ledger.linkedOnlineTestIds) ledger.linkedOnlineTestIds = {};
                ledger.linkedOnlineTestIds[normTarget] = testId || '';
            }
            if (normTarget === 'mstOnline') ledger.linkedMstOnlineTestId = testId || '';
            if (normTarget === 'eseOnline') ledger.linkedEseOnlineTestId = testId || '';
        } else {
            const db = getJSONData();
            db.academicMarksLedgers = db.academicMarksLedgers || [];
            let idx = db.academicMarksLedgers.findIndex(l => l.courseCode === courseCode);
            if (idx === -1) {
                ledger = {
                    courseCode: courseDef.code,
                    courseName: courseDef.name,
                    courseType: courseDef.type,
                    linkedOnlineTestIds: { [normTarget]: testId || '' },
                    studentMarks: []
                };
                if (normTarget === 'mstOnline') ledger.linkedMstOnlineTestId = testId || '';
                if (normTarget === 'eseOnline') ledger.linkedEseOnlineTestId = testId || '';
                db.academicMarksLedgers.push(ledger);
            } else {
                if (!db.academicMarksLedgers[idx].linkedOnlineTestIds) db.academicMarksLedgers[idx].linkedOnlineTestIds = {};
                db.academicMarksLedgers[idx].linkedOnlineTestIds[normTarget] = testId || '';
                if (normTarget === 'mstOnline') db.academicMarksLedgers[idx].linkedMstOnlineTestId = testId || '';
                if (normTarget === 'eseOnline') db.academicMarksLedgers[idx].linkedEseOnlineTestId = testId || '';
                ledger = db.academicMarksLedgers[idx];
            }
        }

        // Sync online scores if test is linked
        if (syncOnlineScores !== false && testId && submissions.length > 0) {
            const testMaxMarks = Number(testObj?.marks || testObj?.totalMarks || compMeta.maxMarks);
            const subMap = buildSubmissionMap(submissions);

            ledger.studentMarks = (ledger.studentMarks || []).map(m => {
                const sub = findSubmissionForStudent(m, m, subMap);
                if (sub) {
                    const rawScored = getSubmissionScore(sub);
                    const scaled = truncateToTwoDigits(Math.min(compMeta.maxMarks, (rawScored / testMaxMarks) * compMeta.maxMarks));

                    if (normTarget === 'mstQuiz1') {
                        if (!m.theoryQuizzes) m.theoryQuizzes = {};
                        m.theoryQuizzes.mstQuiz1 = scaled;
                    } else if (normTarget === 'eseQuiz1') {
                        if (!m.theoryQuizzes) m.theoryQuizzes = {};
                        m.theoryQuizzes.eseQuiz1 = scaled;
                    } else if (normTarget === 'labQuiz1') {
                        if (!m.labQuizzes) m.labQuizzes = {};
                        m.labQuizzes.quiz1 = scaled;
                    } else if (normTarget === 'mstOnline') {
                        m.mstOnline = scaled;
                    } else if (normTarget === 'eseOnline') {
                        m.eseOnline = scaled;
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

        await logSystemAction('admin', 'TEST_LINKED', `Linked online test ${testId} to ${compMeta.label} (${compMeta.maxMarks}m) for course ${courseCode}`, 'info');
        return res.json({ 
            success: true, 
            message: testId ? `Successfully linked online test and synced scores for ${compMeta.label} in ${courseCode}.` : `Unlinked online test from ${compMeta.label} for course ${courseCode}.`,
            targetComponent: normTarget,
            testId
        });
    } catch (e) {
        console.error("Failed to link online test:", e);
        return res.status(500).json({ error: e.message });
    }
});

// 5b. Sync Kata Contests for Lab Course (Option A: 6 selected contests)
router.post('/sync-kata/:courseCode', requireAdmin, async (req, res) => {
    const { courseCode } = req.params;
    const courseDef = DEFAULT_ACADEMIC_COURSES.find(c => c.code === courseCode) || { code: courseCode, name: courseCode, type: courseCode.endsWith('L') ? 'lab' : 'theory' };

    if (courseDef.type !== 'lab') {
        return res.status(400).json({ error: "Kata sync only applies to lab courses (R526CS02L and R526CS03L)." });
    }

    const track = getCourseTrack(courseCode);
    if (!track) {
        return res.status(400).json({ error: `No Kata track associated with course ${courseCode}.` });
    }

    try {
        let ledger = null;
        let candidates = [];
        if (dbState.useMongo) {
            ledger = await AcademicMarksLedgerModel.findOne({ courseCode });
            candidates = await CandidateModel.find()
                .select('name studentId username rollNo +taNormalizedContestMarks')
                .lean();
        } else {
            const db = getJSONData();
            db.academicMarksLedgers = db.academicMarksLedgers || [];
            ledger = db.academicMarksLedgers.find(l => l.courseCode === courseCode);
            candidates = db.candidates || [];
        }

        if (!ledger) {
            ledger = dbState.useMongo
                ? new AcademicMarksLedgerModel({
                    courseCode: courseDef.code,
                    courseName: courseDef.name,
                    courseType: courseDef.type,
                    configuredKataContests: getDefaultKataContests(courseCode),
                    studentMarks: []
                })
                : {
                    courseCode: courseDef.code,
                    courseName: courseDef.name,
                    courseType: courseDef.type,
                    configuredKataContests: getDefaultKataContests(courseCode),
                    studentMarks: []
                };
        }

        const selectedContests = (ledger.configuredKataContests && ledger.configuredKataContests.length > 0)
            ? ledger.configuredKataContests
            : getDefaultKataContests(courseCode);

        // First, trigger normalized sync for these contests so any recent submissions are included
        for (const cId of selectedContests) {
            try {
                await syncContestNormalizedMarks(cId);
            } catch (syncErr) {
                console.warn(`[MarksLedger] Warning during sync of contest ${cId}:`, syncErr.message);
            }
        }

        // Re-fetch candidates after sync
        if (dbState.useMongo) {
            candidates = await CandidateModel.find()
                .select('name studentId username rollNo +taNormalizedContestMarks')
                .lean();
        } else {
            const db = getJSONData();
            candidates = db.candidates || [];
        }

        // Ensure each candidate is present in studentMarks
        const existingStudentMarksMap = new Map();
        (ledger.studentMarks || []).forEach(sm => {
            existingStudentMarksMap.set(String(sm.studentId), typeof sm.toObject === 'function' ? sm.toObject() : sm);
        });

        const updatedStudentMarks = candidates.map(c => {
            const sid = String(c.studentId || c._id);
            const sname = c.name || c.username || 'Candidate';
            const rollNo = c.rollNo || c.studentId || '';

            const m = existingStudentMarksMap.get(sid) || {
                studentId: sid,
                studentName: sname,
                rollNo
            };

            const trackEntries = c.taNormalizedContestMarks?.[track] || [];

            const kataContestResults = selectedContests.map(cId => {
                const cleanId = String(cId).trim().toUpperCase();
                const matched = trackEntries.find(te => String(te.contestId).trim().toUpperCase() === cleanId);
                const normalizedScore = matched ? Number(matched.totalNormalizedScore || 0) : 0;
                const maxPossible = matched ? Number(matched.maxPossibleScore || 5) : 5;
                const scaledMark = truncateToTwoDigits(Math.min(1.0, (normalizedScore / (maxPossible || 5)) * 1.0));
                return {
                    contestId: cId,
                    normalizedScore: truncateToTwoDigits(normalizedScore),
                    scaledMark
                };
            });

            m.labKataContests = kataContestResults;
            m.taKata = truncateToTwoDigits(kataContestResults.reduce((acc, kc) => acc + kc.scaledMark, 0));

            return calculateMarksLedgerEntry(m, courseDef.type);
        });

        ledger.studentMarks = updatedStudentMarks;
        ledger.configuredKataContests = selectedContests;

        if (dbState.useMongo) {
            await ledger.save();
        } else {
            const db = getJSONData();
            const idx = db.academicMarksLedgers.findIndex(l => l.courseCode === courseCode);
            if (idx >= 0) db.academicMarksLedgers[idx] = ledger;
            else db.academicMarksLedgers.push(ledger);
            saveJSONData(db);
        }

        return res.json({
            success: true,
            message: `Synchronized ${selectedContests.length} Kata contests for course ${courseCode}.`,
            selectedContests,
            studentCount: updatedStudentMarks.length
        });
    } catch (e) {
        console.error("Failed to sync Kata contest scores:", e);
        return res.status(500).json({ error: e.message });
    }
});

// 5c. Configure Kata Contests for Lab Course (Option A: 6 contests)
router.post('/config-kata-contests/:courseCode', requireAdmin, async (req, res) => {
    const { courseCode } = req.params;
    const { contests } = req.body;

    if (!Array.isArray(contests) || contests.length !== 6) {
        return res.status(400).json({ error: "Exactly 6 contests must be selected for Option A ledger calculation." });
    }

    try {
        let ledger = null;
        if (dbState.useMongo) {
            ledger = await AcademicMarksLedgerModel.findOne({ courseCode });
            if (!ledger) {
                const courseDef = DEFAULT_ACADEMIC_COURSES.find(c => c.code === courseCode) || { code: courseCode, name: courseCode, type: 'lab' };
                ledger = new AcademicMarksLedgerModel({
                    courseCode: courseDef.code,
                    courseName: courseDef.name,
                    courseType: courseDef.type,
                    configuredKataContests: contests
                });
            } else {
                ledger.configuredKataContests = contests;
            }
            await ledger.save();
        } else {
            const db = getJSONData();
            db.academicMarksLedgers = db.academicMarksLedgers || [];
            let idx = db.academicMarksLedgers.findIndex(l => l.courseCode === courseCode);
            if (idx === -1) {
                const courseDef = DEFAULT_ACADEMIC_COURSES.find(c => c.code === courseCode) || { code: courseCode, name: courseCode, type: 'lab' };
                db.academicMarksLedgers.push({
                    courseCode: courseDef.code,
                    courseName: courseDef.name,
                    courseType: courseDef.type,
                    configuredKataContests: contests,
                    studentMarks: []
                });
            } else {
                db.academicMarksLedgers[idx].configuredKataContests = contests;
            }
            saveJSONData(db);
        }

        return res.json({
            success: true,
            message: `Updated configured Kata contests for ${courseCode}.`,
            configuredKataContests: contests
        });
    } catch (e) {
        console.error("Failed to configure Kata contests:", e);
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

/**
 * GET /api/marks-ledger/kata-ta-normalized
 * Retrieves TA evaluation normalized contest marks across candidates.
 * Admin-only: strictly concealed from candidates.
 * Query params: contestId, track ('shin' | 'forma'), studentId
 */
router.get('/kata-ta-normalized', requireAdmin, async (req, res) => {
    try {
        const { contestId, track, studentId } = req.query;
        const cleanContestId = contestId ? String(contestId).trim().toUpperCase() : null;

        let candidates = [];
        if (dbState.useMongo) {
            const query = {};
            if (studentId) {
                query.$or = [{ studentId }, { username: studentId }];
            }
            candidates = await CandidateModel.find(query)
                .select('name studentId username rollNo +taNormalizedContestMarks')
                .lean();
        } else {
            const db = getJSONData();
            candidates = (db.candidates || []).filter(c => {
                if (studentId) {
                    return c.studentId === studentId || c.username === studentId;
                }
                return true;
            });
        }

        const formatted = candidates.map(cand => {
            const taMarks = cand.taNormalizedContestMarks || { shin: [], forma: [] };
            let shinEntries = taMarks.shin || [];
            let formaEntries = taMarks.forma || [];

            if (cleanContestId) {
                shinEntries = shinEntries.filter(e => String(e.contestId).toUpperCase() === cleanContestId);
                formaEntries = formaEntries.filter(e => String(e.contestId).toUpperCase() === cleanContestId);
            }

            return {
                studentId: cand.studentId || '',
                username: cand.username || '',
                name: cand.name || cand.registrationData?.fullName || '',
                rollNo: cand.rollNo || cand.studentId || '',
                ...(track === 'shin' ? { shin: shinEntries } : {}),
                ...(track === 'forma' ? { forma: formaEntries } : {}),
                ...(!track ? { shin: shinEntries, forma: formaEntries } : {})
            };
        });

        return res.json({
            success: true,
            count: formatted.length,
            trackFilter: track || 'all',
            contestFilter: cleanContestId || 'all',
            candidates: formatted
        });
    } catch (err) {
        console.error('[MarksLedger] Error retrieving TA normalized marks:', err);
        return res.status(500).json({ error: 'Failed to retrieve TA normalized marks' });
    }
});

/**
 * POST /api/marks-ledger/kata-ta-normalized/sync/:contestId
 * Manually or on-demand triggers synchronization of TA normalized contest marks for all participants.
 * Admin-only.
 */
router.post('/kata-ta-normalized/sync/:contestId', requireAdmin, async (req, res) => {
    try {
        const { contestId } = req.params;
        const result = await syncContestNormalizedMarks(contestId);
        return res.json(result);
    } catch (err) {
        console.error('[MarksLedger] Error triggering TA normalized marks sync:', err);
        return res.status(500).json({ error: 'Failed to trigger normalized marks sync' });
    }
});

module.exports = router;
