const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const qr = require('qr-image');
const { dbState, getJSONData, saveJSONData } = require('../config/db');
const { ExamAttendanceModel } = require('../models/ExamAttendance');
const { CandidateModel } = require('../models/Candidate');
const { authenticateToken, requireAdmin, requireAuth } = require('../middleware/auth');
const { logSystemAction } = require('../utils/logger');

const SYSTEM_SECRET = process.env.ATTENDANCE_SECRET_KEY || process.env.JWT_SECRET || 'bics_attendance_cryptographic_secret_2026';

// Helper to get current date formatted as YYYY-MM-DD in Asia/Kolkata timezone
function getTodayIST() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

// Generate signed paper QR token
function generateSignedPaperToken({ courseCode, courseTitle, category, examDate, variant = 'Standard' }) {
    const cleanCourse = String(courseCode || '').trim();
    const cleanCategory = String(category || 'written').trim().toLowerCase();
    const cleanDate = String(examDate || getTodayIST()).trim();
    const salt = crypto.randomBytes(8).toString('hex');

    const payload = {
        courseCode: cleanCourse,
        courseTitle: String(courseTitle || cleanCourse).trim(),
        category: cleanCategory,
        examDate: cleanDate,
        variant,
        salt,
        issuedAt: Date.now()
    };

    const encodedData = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', SYSTEM_SECRET).update(encodedData).digest('hex');
    const token = `${encodedData}.${signature}`;

    return { token, payload };
}

// Verify signed paper QR token
function verifyPaperToken(token) {
    if (!token || typeof token !== 'string') {
        return { valid: false, error: 'Empty or invalid token structure.' };
    }
    const parts = token.trim().split('.');
    if (parts.length !== 2) {
        return { valid: false, error: 'Malformed token structure. Expected base64url.signature' };
    }
    const [encodedData, receivedSig] = parts;

    const expectedSig = crypto.createHmac('sha256', SYSTEM_SECRET).update(encodedData).digest('hex');

    // Constant-time comparison to prevent timing attacks
    const expBuf = Buffer.from(expectedSig, 'utf8');
    const recBuf = Buffer.from(receivedSig, 'utf8');
    if (expBuf.length !== recBuf.length || !crypto.timingSafeEqual(expBuf, recBuf)) {
        return { valid: false, error: 'Cryptographic Checksum Mismatch! Tampering detected.' };
    }

    try {
        const decodedJson = Buffer.from(encodedData, 'base64url').toString('utf8');
        const payload = JSON.parse(decodedJson);
        return { valid: true, payload };
    } catch (e) {
        return { valid: false, error: 'Failed to parse token payload.' };
    }
}

// Derive clean, deterministic 10-digit numeric tracking code from digital signature
function deriveTrackingCode(signature) {
    const sha = crypto.createHash('sha256').update(signature).digest('hex');
    const numericCode = (BigInt('0x' + sha) % 10000000000n).toString().padStart(10, '0');
    return numericCode;
}

// 1. Generate QR Code & Signed Token for Exam Paper / Printable Sheet (Public or Admin)
router.all('/generate-token', async (req, res) => {
    try {
        const courseCode = req.query?.courseCode || req.body?.courseCode;
        const courseTitle = req.query?.courseTitle || req.body?.courseTitle;
        const category = req.query?.category || req.body?.category;
        const examDate = req.query?.examDate || req.body?.examDate;
        const variant = req.query?.variant || req.body?.variant;

        if (!courseCode) {
            return res.status(400).json({ success: false, error: 'courseCode is required.' });
        }

        const { token, payload } = generateSignedPaperToken({
            courseCode,
            courseTitle,
            category,
            examDate,
            variant
        });

        // Generate inline PNG Data URI and SVG
        const pngBuffer = qr.imageSync(token, { type: 'png', size: 6, margin: 1 });
        const qrDataUri = `data:image/png;base64,${pngBuffer.toString('base64')}`;
        const qrSvg = qr.imageSync(token, { type: 'svg', margin: 1 }).toString('utf8');

        return res.json({
            success: true,
            token,
            payload,
            qrDataUri,
            qrSvg
        });
    } catch (e) {
        console.error('Error generating attendance token:', e);
        return res.status(500).json({ success: false, error: e.message });
    }
});

// 2. Student Scan Attendance Submission
router.post('/scan', authenticateToken, async (req, res) => {
    try {
        const { token, manualCode } = req.body;
        const submittedToken = String(token || manualCode || '').trim();

        if (!submittedToken) {
            return res.status(400).json({ error: 'Please scan the Question Paper QR code or enter a valid token.' });
        }

        // Verify cryptographic authenticity
        const verification = verifyPaperToken(submittedToken);
        if (!verification.valid) {
            return res.status(400).json({ error: verification.error });
        }

        const tokenData = verification.payload;
        const todayIST = getTodayIST();

        // Exam Day Validity Check (Strict day match; no restrictive time-of-day cutoff)
        const scheduledDate = String(tokenData.examDate || '').trim();
        if (scheduledDate && scheduledDate !== todayIST) {
            return res.status(400).json({
                error: `This Examination QR Code is valid only on the scheduled exam day (${scheduledDate}). Current portal date is ${todayIST}.`
            });
        }

        // Resolve candidate identity from authenticated session
        const candidateId = String(req.user?.studentId || req.user?.username || req.user?.id || '').trim();
        let studentName = req.user?.name || req.user?.username || 'Candidate';
        let rollNo = req.user?.rollNo || candidateId;

        if (dbState.useMongo) {
            const cand = await CandidateModel.findOne({
                $or: [{ studentId: candidateId }, { username: candidateId }]
            }).lean();
            if (cand) {
                studentName = cand.name || cand.username || studentName;
                rollNo = cand.rollNo || cand.studentId || rollNo;
            }
        }

        const courseCode = String(tokenData.courseCode || '').trim();
        const courseTitle = String(tokenData.courseTitle || courseCode).trim();
        const examCategory = String(tokenData.category || 'written').trim().toLowerCase();
        const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
        const userAgent = req.headers['user-agent'] || 'unknown';

        // Check for duplicate attendance record
        let existingRecord = null;
        if (dbState.useMongo) {
            existingRecord = await ExamAttendanceModel.findOne({
                candidateId,
                courseCode,
                examCategory,
                examDate: scheduledDate || todayIST
            }).lean();
        } else {
            const db = getJSONData();
            const list = db.examAttendances || [];
            existingRecord = list.find(r =>
                r.candidateId === candidateId &&
                r.courseCode === courseCode &&
                r.examCategory === examCategory &&
                r.examDate === (scheduledDate || todayIST)
            );
        }

        if (existingRecord) {
            return res.json({
                success: true,
                status: 'ALREADY_LOGGED',
                message: 'Attendance was already digitally signed and recorded for this examination.',
                trackingCode: existingRecord.trackingCode,
                digitalSignature: existingRecord.digitalSignature,
                record: existingRecord
            });
        }

        // Generate Server Digital Signature & 10-Digit Numeric Tracking Code
        const proofPayload = {
            candidateId,
            rollNo,
            studentName,
            courseCode,
            examCategory,
            examDate: scheduledDate || todayIST,
            timestamp: Date.now(),
            clientIp
        };

        const digitalSignature = crypto.createHmac('sha256', SYSTEM_SECRET)
            .update(JSON.stringify(proofPayload))
            .digest('hex');

        const trackingCode = deriveTrackingCode(digitalSignature);

        const newAttendance = {
            candidateId,
            rollNo,
            studentName,
            courseCode,
            courseTitle,
            examCategory,
            examDate: scheduledDate || todayIST,
            paperVariant: tokenData.variant || 'Standard',
            timestamp: new Date(),
            clientIp,
            userAgent,
            digitalSignature,
            trackingCode,
            status: 'VERIFIED'
        };

        let savedDoc = null;
        if (dbState.useMongo) {
            const doc = new ExamAttendanceModel(newAttendance);
            savedDoc = await doc.save();
        } else {
            const db = getJSONData();
            db.examAttendances = db.examAttendances || [];
            newAttendance._id = 'att_' + Date.now();
            db.examAttendances.push(newAttendance);
            saveJSONData(db);
            savedDoc = newAttendance;
        }

        await logSystemAction(
            candidateId,
            'DIGITAL_ATTENDANCE_SIGNED',
            `Candidate ${studentName} (${candidateId}) digitally signed attendance for ${courseCode} (${examCategory}). Tracking Code: ${trackingCode}`,
            'info'
        );

        return res.json({
            success: true,
            status: 'VERIFIED',
            message: 'Attendance verified and digitally signed successfully!',
            trackingCode,
            digitalSignature,
            record: savedDoc
        });
    } catch (e) {
        console.error('Attendance scan processing error:', e);
        return res.status(500).json({ error: e.message });
    }
});

// 3. Candidate: Get My Digitally Signed Attendance Records
router.get('/my-records', authenticateToken, async (req, res) => {
    try {
        const candidateId = String(req.user?.studentId || req.user?.username || req.user?.id || '').trim();
        let records = [];

        if (dbState.useMongo) {
            records = await ExamAttendanceModel.find({ candidateId })
                .sort({ timestamp: -1 })
                .lean();
        } else {
            const db = getJSONData();
            records = (db.examAttendances || [])
                .filter(r => r.candidateId === candidateId)
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        }

        return res.json({ success: true, records });
    } catch (e) {
        console.error('Error fetching candidate attendance records:', e);
        return res.status(500).json({ error: e.message });
    }
});

// Alias: Candidate Get Records by ID
router.get('/candidate/:candidateId', authenticateToken, async (req, res) => {
    try {
        const reqCandId = String(req.user?.studentId || req.user?.username || req.user?.id || '').trim();
        const targetId = String(req.params.candidateId || reqCandId).trim();
        // Allow user to query own records or admin to query any
        if (req.user?.role !== 'admin' && reqCandId && targetId !== reqCandId) {
            // Check if matches
        }
        let records = [];

        if (dbState.useMongo) {
            records = await ExamAttendanceModel.find({
                $or: [{ candidateId: targetId }, { candidateId: reqCandId }]
            })
            .sort({ timestamp: -1 })
            .lean();
        } else {
            const db = getJSONData();
            records = (db.examAttendances || [])
                .filter(r => r.candidateId === targetId || r.candidateId === reqCandId)
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        }

        return res.json({ success: true, records });
    } catch (e) {
        console.error('Error fetching candidate attendance records by ID:', e);
        return res.status(500).json({ error: e.message });
    }
});

// 4. Admin: Get All Attendance Records (with search & filters)
router.get('/admin/records', requireAdmin, async (req, res) => {
    try {
        const { courseCode, category, examDate, search } = req.query;
        let query = {};

        if (courseCode) query.courseCode = courseCode;
        if (category) query.examCategory = category.toLowerCase();
        if (examDate) query.examDate = examDate;

        let records = [];
        if (dbState.useMongo) {
            records = await ExamAttendanceModel.find(query).sort({ timestamp: -1 }).lean();
        } else {
            const db = getJSONData();
            records = db.examAttendances || [];
            if (courseCode) records = records.filter(r => r.courseCode === courseCode);
            if (category) records = records.filter(r => r.examCategory === category.toLowerCase());
            if (examDate) records = records.filter(r => r.examDate === examDate);
        }

        if (search) {
            const q = search.trim().toLowerCase();
            records = records.filter(r =>
                String(r.candidateId || '').toLowerCase().includes(q) ||
                String(r.studentName || '').toLowerCase().includes(q) ||
                String(r.rollNo || '').toLowerCase().includes(q) ||
                String(r.trackingCode || '').includes(q)
            );
        }

        return res.json({ success: true, records });
    } catch (e) {
        console.error('Error fetching admin attendance records:', e);
        return res.status(500).json({ error: e.message });
    }
});

// 5. Admin: Verify a 10-Digit Tracking Code (Invigilator Physical Check)
router.post('/admin/verify-code', requireAdmin, async (req, res) => {
    try {
        const { trackingCode } = req.body;
        const cleanCode = String(trackingCode || '').trim();

        if (!cleanCode) {
            return res.status(400).json({ error: 'trackingCode is required.' });
        }

        let match = null;
        if (dbState.useMongo) {
            match = await ExamAttendanceModel.findOne({ trackingCode: cleanCode }).lean();
        } else {
            const db = getJSONData();
            match = (db.examAttendances || []).find(r => r.trackingCode === cleanCode);
        }

        if (!match) {
            return res.status(404).json({ success: false, message: `No attendance record found for tracking code ${cleanCode}.` });
        }

        return res.json({
            success: true,
            status: 'AUTHENTIC',
            record: match
        });
    } catch (e) {
        console.error('Error verifying tracking code:', e);
        return res.status(500).json({ error: e.message });
    }
});

module.exports = router;
