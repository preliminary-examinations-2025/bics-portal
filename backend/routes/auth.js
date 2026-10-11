const express = require('express');
const router = express.Router();
const { CandidateModel, ConfigModel } = require('../models');
const { dbState, getJSONData, saveJSONData, initialDB } = require('../config/db');
const { logSystemAction } = require('../utils/logger');

// 1. Unified Login (Admin & Candidate)
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    const adminUser = process.env.ADMIN_USER;
    const adminPass = process.env.ADMIN_PASS;
    if (adminUser && adminPass && username === adminUser && password === adminPass) {
        await logSystemAction('admin', 'USER_SIGN_IN', 'Admin logged into portal', 'info');
        return res.json({ success: true, role: 'admin', name: 'System Administrator' });
    }

    if (dbState.useMongo) {
        try {
            const student = await CandidateModel.findOne({ username, password });
            if (!student) {
                await logSystemAction(username || 'unknown', 'SIGN_IN_FAILED', `Failed login attempt for username: ${username}`, 'warning');
                return res.status(401).json({ error: "Invalid username or password" });
            }
            await logSystemAction(student.name || username, 'USER_SIGN_IN', `Student "${student.name || username}" logged into portal`, 'info');
            return res.json({
                success: true,
                role: 'student',
                id: student._id,
                studentId: student.studentId || student.username,
                username: student.username,
                name: student.name
            });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        const student = (db.candidates || []).find(c => c.username === username && c.password === password);
        if (!student) {
            await logSystemAction(username || 'unknown', 'SIGN_IN_FAILED', `Failed login attempt for username: ${username}`, 'warning');
            return res.status(401).json({ error: "Invalid username or password" });
        }
        await logSystemAction(student.name || username, 'USER_SIGN_IN', `Student "${student.name || username}" logged into portal`, 'info');
        return res.json({
            success: true,
            role: 'student',
            id: student.id,
            studentId: student.studentId || student.username,
            username: student.username,
            name: student.name
        });
    }
});

// Logout endpoint
router.post('/logout', async (req, res) => {
    const { username, role } = req.body;
    if (username) {
        await logSystemAction(username, 'USER_SIGN_OUT', `${role === 'admin' ? 'Admin' : 'Student'} logged out of portal`, 'info');
    }
    return res.json({ success: true });
});

// Client Error Logging endpoint
router.post('/log-client-error', async (req, res) => {
    const { actor, action, details, severity } = req.body;
    await logSystemAction(actor || 'client', action || 'CLIENT_ERROR', details || 'An external error occurred', severity || 'error');
    return res.json({ success: true });
});

// Fetch System Configuration
router.get('/config', async (req, res) => {
    try {
        let configObj = {};
        if (dbState.useMongo) {
            const conf = await ConfigModel.findOne();
            if (conf) {
                if (!conf.timetableNotice) {
                    conf.timetableNotice = 'Mid semester test for BICS 2026 will be held in mid-August';
                    await conf.save();
                }
                configObj = conf.toObject();
            }
        } else {
            const db = getJSONData();
            if (db && db.config) {
                if (!db.config.timetableNotice) {
                    db.config.timetableNotice = 'Mid semester test for BICS 2026 will be held in mid-August';
                    saveJSONData(db);
                }
                configObj = { ...db.config };
            }
        }
        return res.json(configObj);
    } catch (e) {
        await logSystemAction('system', 'TECHNICAL_ERROR', `Failed to fetch system configuration: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    }
});

// Update System Configuration (Admin Only)
router.post('/admin/config', async (req, res) => {
    const { courseRegistrationActive, onlineExamActive, midSemFeedbackActive, endSemFeedbackActive, exitFormActive, hallTicketDownloadActive, counterfoilActive, timetable, timetableNotice, announcements, hallTicketUrl, examType, classTests } = req.body;

    if (dbState.useMongo) {
        try {
            let conf = await ConfigModel.findOne();
            if (!conf) {
                conf = new ConfigModel(initialDB.config);
            }
            if (courseRegistrationActive !== undefined) conf.courseRegistrationActive = courseRegistrationActive;
            if (onlineExamActive !== undefined) conf.onlineExamActive = onlineExamActive;
            if (midSemFeedbackActive !== undefined) conf.midSemFeedbackActive = midSemFeedbackActive;
            if (endSemFeedbackActive !== undefined) conf.endSemFeedbackActive = endSemFeedbackActive;
            if (exitFormActive !== undefined) conf.exitFormActive = exitFormActive;
            if (hallTicketDownloadActive !== undefined) conf.hallTicketDownloadActive = hallTicketDownloadActive;
            if (counterfoilActive !== undefined) conf.counterfoilActive = counterfoilActive;
            if (timetableNotice !== undefined) conf.timetableNotice = timetableNotice;
            if (hallTicketUrl !== undefined) conf.hallTicketUrl = hallTicketUrl;
            if (examType !== undefined) conf.examType = examType;
            
            if (timetable !== undefined) {
                conf.timetable = timetable;
                conf.markModified('timetable');
            }
            if (announcements !== undefined) {
                conf.announcements = announcements;
                conf.markModified('announcements');
            }
            if (classTests !== undefined) {
                conf.classTests = classTests;
                conf.markModified('classTests');
            }
            await conf.save();
            return res.json({ success: true, config: conf });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        if (courseRegistrationActive !== undefined) db.config.courseRegistrationActive = courseRegistrationActive;
        if (onlineExamActive !== undefined) db.config.onlineExamActive = onlineExamActive;
        if (midSemFeedbackActive !== undefined) db.config.midSemFeedbackActive = midSemFeedbackActive;
        if (endSemFeedbackActive !== undefined) db.config.endSemFeedbackActive = endSemFeedbackActive;
        if (exitFormActive !== undefined) db.config.exitFormActive = exitFormActive;
        if (hallTicketDownloadActive !== undefined) db.config.hallTicketDownloadActive = hallTicketDownloadActive;
        if (counterfoilActive !== undefined) db.config.counterfoilActive = counterfoilActive;
        if (timetable !== undefined) db.config.timetable = timetable;
        if (timetableNotice !== undefined) db.config.timetableNotice = timetableNotice;
        if (announcements !== undefined) db.config.announcements = announcements;
        if (hallTicketUrl !== undefined) db.config.hallTicketUrl = hallTicketUrl;
        if (examType !== undefined) db.config.examType = examType;
        if (classTests !== undefined) db.config.classTests = classTests;
        saveJSONData(db);
        return res.json({ success: true, config: db.config });
    }
});

// Change Password Endpoint (Admin & Candidate)
router.post('/change-password', async (req, res) => {
    const { role, id, newPassword, code } = req.body;

    if (!newPassword || newPassword.length < 4) {
        return res.status(400).json({ error: "Password must be at least 4 characters long" });
    }

    if (role === 'admin') {
        return res.json({ success: true, message: "Admin password changed successfully (session mock update)." });
    }

    if (!code) {
        return res.status(400).json({ error: "Email verification code is required." });
    }

    try {
        let student;
        if (dbState.useMongo) {
            student = await CandidateModel.findById(id);
        } else {
            const db = getJSONData();
            student = (db.candidates || []).find(c => c.id === id || c._id === id);
        }

        if (!student) return res.status(404).json({ error: "Candidate not found" });

        if (!student.verificationCode || student.verificationCode !== code.trim()) {
            return res.status(400).json({ error: "Invalid verification code." });
        }

        if (new Date() > new Date(student.verificationCodeExpires)) {
            return res.status(400).json({ error: "Verification code has expired. Please request a new one." });
        }

        if (dbState.useMongo) {
            student.password = newPassword;
            student.verificationCode = '';
            student.verificationCodeExpires = null;
            await student.save();
        } else {
            student.password = newPassword;
            student.verificationCode = '';
            student.verificationCodeExpires = null;
            const db = getJSONData();
            const candIdx = (db.candidates || []).findIndex(c => c.id === id || c._id === id);
            if (candIdx !== -1) {
                db.candidates[candIdx] = student;
                saveJSONData(db);
            }
        }

        await logSystemAction(student.name || 'candidate', 'PASSWORD_CHANGED', `Student changed account password`, 'info');
        return res.json({ success: true });
    } catch (e) {
        console.error("Password change failed:", e);
        return res.status(500).json({ error: "Server error updating password. Please try again." });
    }
});

// Health check endpoint
router.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

module.exports = router;
