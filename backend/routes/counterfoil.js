const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { CounterfoilSubmissionModel, AcademicMarksLedgerModel } = require('../models');
const { dbState, getJSONData, saveJSONData } = require('../config/db');
const { DEFAULT_ACADEMIC_COURSES } = require('../config/constants');
const { logSystemAction } = require('../utils/logger');
const { calculateMarksLedgerEntry } = require('../utils/scoreCalculator');

// 1. Get student's counterfoil submissions
router.get('/counterfoil/my-submissions/:studentId', async (req, res) => {
    const { studentId } = req.params;
    try {
        if (dbState.useMongo) {
            const submissions = await CounterfoilSubmissionModel.find({ 
                studentId: new RegExp(`^${studentId.trim()}$`, 'i') 
            }).sort({ submittedAt: -1 });
            return res.json(submissions);
        } else {
            const db = getJSONData();
            db.counterfoilSubmissions = db.counterfoilSubmissions || [];
            const submissions = db.counterfoilSubmissions.filter(s => 
                s.studentId && s.studentId.trim().toUpperCase() === studentId.trim().toUpperCase()
            );
            return res.json(submissions);
        }
    } catch (e) {
        console.error("Counterfoil fetch error:", e);
        return res.status(500).json({ error: e.message });
    }
});

// 2. Submit or update student counterfoil
router.post('/counterfoil/submit', async (req, res) => {
    const { studentId, studentName, courseCode, courseName, examType, examinationName, questionMarks } = req.body;
    if (!studentId || !courseCode || !examType || !questionMarks || !Array.isArray(questionMarks)) {
        return res.status(400).json({ error: "Missing required counterfoil fields." });
    }

    const sId = studentId.trim().toUpperCase();
    const cCode = courseCode.trim().toUpperCase();

    let totalObtained = 0;
    let totalMax = 0;
    questionMarks.forEach(q => {
        totalObtained += Number(q.obtainedMarks || 0);
        totalMax += Number(q.maxMarks || 0);
    });

    try {
        let submission;
        if (dbState.useMongo) {
            submission = await CounterfoilSubmissionModel.findOne({
                studentId: sId,
                courseCode: cCode,
                examType
            });

            if (submission) {
                if (submission.status === 'approved') {
                    return res.status(400).json({ error: "Counterfoil for this course has already been approved by admin and cannot be modified." });
                }
                submission.studentName = studentName || submission.studentName;
                submission.courseName = courseName || submission.courseName;
                submission.examinationName = examinationName || submission.examinationName;
                submission.questionMarks = questionMarks;
                submission.totalObtained = totalObtained;
                submission.totalMax = totalMax;
                submission.status = 'pending_approval';
                submission.adminRemarks = '';
                submission.submittedAt = new Date();
                await submission.save();
            } else {
                submission = new CounterfoilSubmissionModel({
                    studentId: sId,
                    studentName: studentName || "Candidate",
                    courseCode: cCode,
                    courseName: courseName || cCode,
                    examType,
                    examinationName: examinationName || (examType === 'midsem' ? 'Mid Semester Examination 2026' : 'End Semester Examination 2026'),
                    questionMarks,
                    totalObtained,
                    totalMax,
                    status: 'pending_approval',
                    submittedAt: new Date()
                });
                await submission.save();
            }
        } else {
            const db = getJSONData();
            db.counterfoilSubmissions = db.counterfoilSubmissions || [];
            const idx = db.counterfoilSubmissions.findIndex(s => s.studentId === sId && s.courseCode === cCode && s.examType === examType);
            if (idx !== -1) {
                if (db.counterfoilSubmissions[idx].status === 'approved') {
                    return res.status(400).json({ error: "Counterfoil for this course has already been approved by admin and cannot be modified." });
                }
                db.counterfoilSubmissions[idx].studentName = studentName || db.counterfoilSubmissions[idx].studentName;
                db.counterfoilSubmissions[idx].courseName = courseName || db.counterfoilSubmissions[idx].courseName;
                db.counterfoilSubmissions[idx].examinationName = examinationName || db.counterfoilSubmissions[idx].examinationName;
                db.counterfoilSubmissions[idx].questionMarks = questionMarks;
                db.counterfoilSubmissions[idx].totalObtained = totalObtained;
                db.counterfoilSubmissions[idx].totalMax = totalMax;
                db.counterfoilSubmissions[idx].status = 'pending_approval';
                db.counterfoilSubmissions[idx].adminRemarks = '';
                db.counterfoilSubmissions[idx].submittedAt = new Date().toISOString();
                submission = db.counterfoilSubmissions[idx];
            } else {
                submission = {
                    _id: "counterfoil_" + Date.now(),
                    studentId: sId,
                    studentName: studentName || "Candidate",
                    courseCode: cCode,
                    courseName: courseName || cCode,
                    examType,
                    examinationName: examinationName || (examType === 'midsem' ? 'Mid Semester Examination 2026' : 'End Semester Examination 2026'),
                    questionMarks,
                    totalObtained,
                    totalMax,
                    status: 'pending_approval',
                    submittedAt: new Date().toISOString()
                };
                db.counterfoilSubmissions.push(submission);
            }
            saveJSONData(db);
        }

        await logSystemAction(
            sId,
            'COUNTERFOIL_SUBMITTED',
            `Student ${sId} submitted counterfoil for ${cCode} (${examType}): ${totalObtained}/${totalMax}`,
            'info'
        );

        return res.json({ success: true, submission });
    } catch (e) {
        console.error("Counterfoil submit error:", e);
        return res.status(500).json({ error: e.message });
    }
});

// 3. Admin: list all counterfoil submissions
router.get('/admin/counterfoil/list', async (req, res) => {
    try {
        if (dbState.useMongo) {
            const submissions = await CounterfoilSubmissionModel.find().sort({ submittedAt: -1 });
            return res.json(submissions);
        } else {
            const db = getJSONData();
            db.counterfoilSubmissions = db.counterfoilSubmissions || [];
            return res.json(db.counterfoilSubmissions);
        }
    } catch (e) {
        console.error("Admin counterfoil list error:", e);
        return res.status(500).json({ error: e.message });
    }
});

// 4. Admin: approve or reject counterfoil submission
router.post('/admin/counterfoil/action/:id', async (req, res) => {
    const { id } = req.params;
    const { status, adminRemarks } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: "Invalid status parameter. Must be 'approved' or 'rejected'." });
    }

    try {
        let submission;
        if (dbState.useMongo) {
            if (mongoose.Types.ObjectId.isValid(id)) {
                submission = await CounterfoilSubmissionModel.findById(id);
            }
            if (!submission) {
                submission = await CounterfoilSubmissionModel.findOne({ _id: id });
            }
            if (!submission) {
                return res.status(404).json({ error: "Counterfoil submission not found." });
            }
            submission.status = status;
            submission.adminRemarks = adminRemarks || '';
            if (status === 'approved') {
                submission.approvedAt = new Date();
            }
            await submission.save();
        } else {
            const db = getJSONData();
            db.counterfoilSubmissions = db.counterfoilSubmissions || [];
            const idx = db.counterfoilSubmissions.findIndex(s => String(s._id) === String(id) || String(s.id) === String(id));
            if (idx === -1) {
                return res.status(404).json({ error: "Counterfoil submission not found." });
            }
            db.counterfoilSubmissions[idx].status = status;
            db.counterfoilSubmissions[idx].adminRemarks = adminRemarks || '';
            if (status === 'approved') {
                db.counterfoilSubmissions[idx].approvedAt = new Date().toISOString();
            }
            submission = db.counterfoilSubmissions[idx];
            saveJSONData(db);
        }

        try {
            const cCode = submission.courseCode;
            const sId = submission.studentId;
            const examType = submission.examType;

            if (dbState.useMongo) {
                const ledger = await AcademicMarksLedgerModel.findOne({ courseCode: cCode });
                if (ledger && Array.isArray(ledger.studentMarks)) {
                    let updated = false;
                    ledger.studentMarks.forEach(m => {
                        if (String(m.studentId).toUpperCase().trim() === String(sId).toUpperCase().trim()) {
                            if (examType === 'midsem') {
                                m.mstWritten = Number(submission.totalObtained || 0);
                                m.mstWrittenStatus = status;
                            } else if (examType === 'endsem') {
                                m.eseWritten = Number(submission.totalObtained || 0);
                                m.eseWrittenStatus = status;
                            }
                            const courseDef = DEFAULT_ACADEMIC_COURSES.find(c => c.code === cCode) || { type: cCode.endsWith('L') ? 'lab' : 'theory' };
                            const recalculated = calculateMarksLedgerEntry(m, courseDef.type);
                            Object.assign(m, recalculated);
                            updated = true;
                        }
                    });
                    if (updated) await ledger.save();
                }
            } else {
                const db = getJSONData();
                db.academicMarksLedgers = db.academicMarksLedgers || [];
                const ledgerIdx = db.academicMarksLedgers.findIndex(l => l.courseCode === cCode);
                if (ledgerIdx !== -1 && Array.isArray(db.academicMarksLedgers[ledgerIdx].studentMarks)) {
                    const courseDef = DEFAULT_ACADEMIC_COURSES.find(c => c.code === cCode) || { type: cCode.endsWith('L') ? 'lab' : 'theory' };
                    db.academicMarksLedgers[ledgerIdx].studentMarks.forEach(m => {
                        if (String(m.studentId).toUpperCase().trim() === String(sId).toUpperCase().trim()) {
                            if (examType === 'midsem') {
                                m.mstWritten = Number(submission.totalObtained || 0);
                                m.mstWrittenStatus = status;
                            } else if (examType === 'endsem') {
                                m.eseWritten = Number(submission.totalObtained || 0);
                                m.eseWrittenStatus = status;
                            }
                            const recalculated = calculateMarksLedgerEntry(m, courseDef.type);
                            Object.assign(m, recalculated);
                        }
                    });
                    saveJSONData(db);
                }
            }
        } catch (syncErr) {
            console.error("Failed to auto-sync counterfoil action to marks ledger:", syncErr);
        }

        await logSystemAction(
            'admin',
            'COUNTERFOIL_ACTION',
            `Admin marked counterfoil ${id} as ${status.toUpperCase()}. Remarks: "${adminRemarks || 'N/A'}"`,
            'info'
        );

        return res.json({ success: true, submission });
    } catch (e) {
        console.error("Admin counterfoil action error:", e);
        return res.status(500).json({ error: e.message });
    }
});

module.exports = router;
