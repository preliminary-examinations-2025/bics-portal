const express = require('express');
const router = express.Router();
const { CandidateModel, ConfigModel } = require('../models');
const { dbState, getJSONData, saveJSONData, initialDB } = require('../config/db');
const { logSystemAction } = require('../utils/logger');
const { generateToken, verifyToken } = require('../utils/jwt');
const { hashPassword, comparePassword, isBcryptHash } = require('../utils/password');

// Rate limiter and lockout trackers
const adminFailedLogins = new Map(); // ip -> { count, lockedUntil }
const clientErrorRateLimits = new Map(); // ip -> { count, windowStart }

// 1. Unified Login (Admin & Candidate)
router.post('/login', async (req, res) => {
    const { username, password, rememberMe } = req.body;
    const studentExpiresIn = rememberMe ? (process.env.JWT_STUDENT_EXPIRES_IN || '7d') : '24h';

    // Strict input type validation: blocks NoSQL query operator injection (e.g., {"password": {"$ne": ""}})
    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
        return res.status(400).json({ error: "Invalid username or password format." });
    }

    const cleanUsername = username.trim();
    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';

    // Authenticate System Administrator
    const adminUser = process.env.ADMIN_USER;
    const adminPass = process.env.ADMIN_PASS;
    if (adminUser && cleanUsername === adminUser) {
        const lockRecord = adminFailedLogins.get(clientIp);
        if (lockRecord && lockRecord.lockedUntil && Date.now() < lockRecord.lockedUntil) {
            const waitMins = Math.ceil((lockRecord.lockedUntil - Date.now()) / 60000);
            return res.status(429).json({ 
                error: `Admin login locked due to multiple failed attempts. Please try again in ${waitMins} minute${waitMins === 1 ? '' : 's'}.` 
            });
        }

        if (adminPass && password === adminPass) {
            adminFailedLogins.delete(clientIp);
            const token = generateToken({
                id: 'admin',
                role: 'admin',
                username: adminUser
            }, '12h');

            await logSystemAction('admin', 'USER_SIGN_IN', 'Admin logged into portal with signed JWT', 'info');
            return res.json({
                success: true,
                token,
                role: 'admin',
                name: 'System Administrator',
                user: { id: 'admin', role: 'admin', name: 'System Administrator', username: adminUser }
            });
        } else {
            const current = adminFailedLogins.get(clientIp) || { count: 0, lockedUntil: null };
            current.count += 1;
            if (current.count >= 5) {
                current.lockedUntil = Date.now() + 15 * 60 * 1000;
                adminFailedLogins.set(clientIp, current);
                await logSystemAction('system', 'SECURITY_LOCKOUT', `Admin account locked out after 5 consecutive failed attempts from IP ${clientIp}`, 'error');
                return res.status(429).json({ 
                    error: "Admin account locked due to 5 consecutive failed attempts. Please try again in 15 minutes." 
                });
            }
            adminFailedLogins.set(clientIp, current);
            const remainingAttempts = 5 - current.count;
            return res.status(401).json({ 
                error: `Invalid admin credentials. ${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining before lockout.` 
            });
        }
    }

    // Authenticate Student
    if (dbState.useMongo) {
        try {
            const student = await CandidateModel.findOne({ username: cleanUsername });
            if (!student) {
                await logSystemAction(cleanUsername, 'SIGN_IN_FAILED', `Failed login attempt for username: ${cleanUsername}`, 'warning');
                return res.status(401).json({ error: "Invalid username or password" });
            }

            const isValidPassword = await comparePassword(password, student.password);
            if (!isValidPassword) {
                await logSystemAction(cleanUsername, 'SIGN_IN_FAILED', `Invalid password for username: ${cleanUsername}`, 'warning');
                return res.status(401).json({ error: "Invalid username or password" });
            }

            // Transparent migration: Upgrade plaintext password to salted bcrypt hash
            if (!isBcryptHash(student.password)) {
                try {
                    student.password = await hashPassword(password);
                    await student.save();
                    console.log(`[AUTH MIGRATION] Automatically upgraded password for candidate "${cleanUsername}" to salted bcrypt hash.`);
                } catch (migErr) {
                    console.warn(`[AUTH MIGRATION NOTICE] Could not save upgraded hash:`, migErr.message);
                }
            }

            const studentIdVal = student.studentId || student.username;
            const token = generateToken({
                id: student._id.toString(),
                studentId: studentIdVal,
                role: 'student',
                username: student.username
            }, studentExpiresIn);

            await logSystemAction(student.name || cleanUsername, 'USER_SIGN_IN', `Student "${student.name || cleanUsername}" logged into portal with signed JWT`, 'info');
            return res.json({
                success: true,
                token,
                role: 'student',
                id: student._id,
                studentId: studentIdVal,
                username: student.username,
                name: student.name,
                user: {
                    id: student._id,
                    studentId: studentIdVal,
                    role: 'student',
                    username: student.username,
                    name: student.name
                }
            });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        const student = (db.candidates || []).find(c => c.username === cleanUsername);
        if (!student) {
            await logSystemAction(cleanUsername, 'SIGN_IN_FAILED', `Failed login attempt for username: ${cleanUsername}`, 'warning');
            return res.status(401).json({ error: "Invalid username or password" });
        }

        const isValidPassword = await comparePassword(password, student.password);
        if (!isValidPassword) {
            await logSystemAction(cleanUsername, 'SIGN_IN_FAILED', `Invalid password for username: ${cleanUsername}`, 'warning');
            return res.status(401).json({ error: "Invalid username or password" });
        }

        // Transparent migration in fallback JSON db
        if (!isBcryptHash(student.password)) {
            try {
                student.password = await hashPassword(password);
                saveJSONData(db);
                console.log(`[AUTH MIGRATION] Automatically upgraded db.json password for candidate "${cleanUsername}" to salted bcrypt hash.`);
            } catch (migErr) {
                console.warn(`[AUTH MIGRATION NOTICE] Could not save upgraded hash in db.json:`, migErr.message);
            }
        }

        const studentIdVal = student.studentId || student.username;
        const token = generateToken({
            id: String(student.id || student._id),
            studentId: studentIdVal,
            role: 'student',
            username: student.username
        }, studentExpiresIn);

        await logSystemAction(student.name || cleanUsername, 'USER_SIGN_IN', `Student "${student.name || cleanUsername}" logged into portal with signed JWT`, 'info');
        return res.json({
            success: true,
            token,
            role: 'student',
            id: student.id || student._id,
            studentId: studentIdVal,
            username: student.username,
            name: student.name,
            user: {
                id: student.id || student._id,
                studentId: studentIdVal,
                role: 'student',
                username: student.username,
                name: student.name
            }
        });
    }
});

// Session Validation Endpoint: Allows frontend to verify currently stored JWT on page refresh
router.get('/verify-session', async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

    if (!token) {
        return res.status(401).json({ valid: false, error: "No token provided." });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ valid: false, error: "Token is invalid or expired." });
    }

    return res.json({
        valid: true,
        user: {
            id: decoded.id,
            role: decoded.role,
            username: decoded.username,
            studentId: decoded.studentId,
            name: decoded.role === 'admin' ? 'System Administrator' : decoded.username
        }
    });
});

// Logout endpoint
router.post('/logout', async (req, res) => {
    const { username, role } = req.body;
    if (username) {
        await logSystemAction(username, 'USER_SIGN_OUT', `${role === 'admin' ? 'Admin' : 'Student'} logged out of portal`, 'info');
    }
    return res.json({ success: true });
});

// Client Error Logging endpoint (Rate limited & bounded)
router.post('/log-client-error', async (req, res) => {
    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
    const now = Date.now();
    const rateData = clientErrorRateLimits.get(clientIp) || { count: 0, windowStart: now };
    if (now - rateData.windowStart > 60000) {
        rateData.count = 0;
        rateData.windowStart = now;
    }
    rateData.count++;
    clientErrorRateLimits.set(clientIp, rateData);

    if (rateData.count > 20) {
        return res.status(429).json({ error: "Too many error logs submitted. Rate limit exceeded." });
    }

    const { actor, action, details, severity } = req.body || {};
    const safeActor = String(actor || 'client').slice(0, 50).trim();
    const safeAction = String(action || 'CLIENT_ERROR').slice(0, 50).trim();
    const safeDetails = String(details || 'An external error occurred').slice(0, 1000).trim();
    const safeSeverity = ['info', 'warning', 'error'].includes(severity) ? severity : 'error';

    await logSystemAction(safeActor, safeAction, safeDetails, safeSeverity);
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
        configObj.devModeActive = !!configObj.devModeActive;
        return res.json(configObj);
    } catch (e) {
        await logSystemAction('system', 'TECHNICAL_ERROR', `Failed to fetch system configuration: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    }
});

// Update System Configuration (Admin Only)
router.post('/admin/config', async (req, res) => {
    const { courseRegistrationActive, onlineExamActive, midSemFeedbackActive, endSemFeedbackActive, exitFormActive, hallTicketDownloadActive, counterfoilActive, timetable, timetableNotice, announcements, hallTicketUrl, examType, classTests, devModeActive } = req.body;

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
            if (devModeActive !== undefined) conf.devModeActive = devModeActive;
            
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
        if (devModeActive !== undefined) db.config.devModeActive = devModeActive;
        saveJSONData(db);
        return res.json({ success: true, config: db.config });
    }
});

// Change Password Endpoint (Candidate Only)
router.post('/change-password', async (req, res) => {
    const { role, id, newPassword, code } = req.body;

    if (role === 'admin' || req.user?.role === 'admin') {
        return res.status(403).json({ 
            error: "Forbidden: Admin credentials are configuration-authoritative and managed exclusively via server environment variables (.env)." 
        });
    }

    if (!newPassword || newPassword.length < 4) {
        return res.status(400).json({ error: "Password must be at least 4 characters long" });
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

        student.verificationAttempts = (student.verificationAttempts || 0) + 1;

        if (!student.verificationCode || student.verificationCode !== code.trim()) {
            if (student.verificationAttempts >= 5) {
                student.verificationCode = '';
                student.verificationCodeExpires = null;
                student.verificationAttempts = 0;
                if (dbState.useMongo) await student.save();
                else {
                    const db = getJSONData();
                    const candIdx = (db.candidates || []).findIndex(c => c.id === id || c._id === id);
                    if (candIdx !== -1) { db.candidates[candIdx] = student; saveJSONData(db); }
                }
                return res.status(429).json({ 
                    error: "Maximum verification attempts (5) exceeded. Your code has been invalidated. Please request a new code." 
                });
            }

            if (dbState.useMongo) await student.save();
            else {
                const db = getJSONData();
                const candIdx = (db.candidates || []).findIndex(c => c.id === id || c._id === id);
                if (candIdx !== -1) { db.candidates[candIdx] = student; saveJSONData(db); }
            }

            const remainingAttempts = 5 - student.verificationAttempts;
            return res.status(400).json({ 
                error: `Invalid verification code. ${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining.` 
            });
        }

        if (new Date() > new Date(student.verificationCodeExpires)) {
            student.verificationCode = '';
            student.verificationCodeExpires = null;
            student.verificationAttempts = 0;
            if (dbState.useMongo) await student.save();
            return res.status(400).json({ error: "Verification code has expired. Please request a new one." });
        }

        // Salted bcrypt password hashing
        const hashedPassword = await hashPassword(newPassword);

        if (dbState.useMongo) {
            student.password = hashedPassword;
            student.verificationCode = '';
            student.verificationCodeExpires = null;
            student.verificationAttempts = 0;
            await student.save();
        } else {
            student.password = hashedPassword;
            student.verificationCode = '';
            student.verificationCodeExpires = null;
            student.verificationAttempts = 0;
            const db = getJSONData();
            const candIdx = (db.candidates || []).findIndex(c => c.id === id || c._id === id);
            if (candIdx !== -1) {
                db.candidates[candIdx] = student;
                saveJSONData(db);
            }
        }

        await logSystemAction(student.name || 'candidate', 'PASSWORD_CHANGED', `Student changed account password`, 'info');
        return res.json({ success: true, message: "Password updated successfully." });
    } catch (e) {
        console.error("Password change failed:", e);
        return res.status(500).json({ error: "Server error updating password. Please try again." });
    }
});

// Health check endpoint
router.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

module.exports = router;
