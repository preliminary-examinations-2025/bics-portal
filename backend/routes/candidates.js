const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const qrImage = require('qr-image');
const { CandidateModel, ConfigModel, ClassroomSubmissionModel } = require('../models');
const { dbState, getJSONData, saveJSONData } = require('../config/db');
const { upload } = require('../middleware/upload');
const { formatCloudinaryMediaUrl, uploadToCloudinary } = require('../config/cloudinary');
const { logSystemAction } = require('../utils/logger');
const { sendVerificationCodeEmail, extractValidCandidateEmail } = require('../services/gmailEmailService');
const { resolveToObjectId } = require('../utils/bicsId');
const { hashPassword } = require('../utils/password');
const { requireAuth, requireAdmin, requireOwnerOrAdmin } = require('../middleware/auth');
const { streamHallTicketPdf } = require('../services/pdf/hallTicketPdf');

const inFlightOtpSends = new Set();

async function findCandidateRecordByParam(rawId) {
    const raw = String(rawId || '').trim();
    if (!raw) return null;
    const resolved = String(resolveToObjectId(raw) || raw);
    if (dbState.useMongo) {
        if (mongoose.Types.ObjectId.isValid(resolved)) {
            const byId = await CandidateModel.findById(resolved);
            if (byId) return byId;
        }
        return await CandidateModel.findOne({ $or: [{ studentId: raw }, { username: raw }] });
    }
    const db = getJSONData();
    return (db.candidates || []).find(c =>
        String(c._id) === resolved ||
        String(c.id) === resolved ||
        String(c._id) === raw ||
        String(c.id) === raw ||
        String(c.studentId) === raw ||
        String(c.username) === raw
    ) || null;
}

function timingSafeCodeMatch(stored, provided) {
    if (typeof stored !== 'string' || typeof provided !== 'string') return false;
    const a = Buffer.from(stored.trim(), 'utf8');
    const b = Buffer.from(provided.trim(), 'utf8');
    if (a.length === 0 || a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

async function persistCandidateRecordJson(student) {
    const db = getJSONData();
    const targetId = String(student._id || student.id || '');
    const candIdx = (db.candidates || []).findIndex(c =>
        String(c._id) === targetId ||
        String(c.id) === targetId ||
        (student.studentId && String(c.studentId) === String(student.studentId))
    );
    if (candIdx !== -1) {
        db.candidates[candIdx] = student;
        saveJSONData(db);
    }
}

const sanitizeCandidate = (c) => {
    if (!c) return c;
    let obj = typeof c.toJSON === 'function'
        ? c.toJSON()
        : (typeof c.toObject === 'function' ? c.toObject({ flattenMaps: true }) : JSON.parse(JSON.stringify(c)));
    
    // Explicitly delete sensitive credentials
    delete obj.password;
    delete obj.verificationCode;
    delete obj.taNormalizedContestMarks; // strictly internal for TA evaluation

    if (obj.midSemFeedback instanceof Map) {
        obj.midSemFeedback = Object.fromEntries(obj.midSemFeedback);
    }
    if (obj.endSemFeedback instanceof Map) {
        obj.endSemFeedback = Object.fromEntries(obj.endSemFeedback);
    }

    if (obj.registrationData) {
        if (obj.registrationData.photoUrl) obj.registrationData.photoUrl = formatCloudinaryMediaUrl(obj.registrationData.photoUrl);
        if (obj.registrationData.signatureUrl) obj.registrationData.signatureUrl = formatCloudinaryMediaUrl(obj.registrationData.signatureUrl);
        if (obj.registrationData.undertakingUrl) obj.registrationData.undertakingUrl = formatCloudinaryMediaUrl(obj.registrationData.undertakingUrl);
    }
    if (obj.midSemLedgerUrl) obj.midSemLedgerUrl = formatCloudinaryMediaUrl(obj.midSemLedgerUrl);
    if (obj.endSemLedgerUrl) obj.endSemLedgerUrl = formatCloudinaryMediaUrl(obj.endSemLedgerUrl);
    return obj;
};

// Register Candidate Shell (Admin Only)
router.post('/admin/register-candidate', requireAdmin, async (req, res) => {
    const { studentId, name, username, password, eligible } = req.body;

    if (!studentId || !name || !username || !password) {
        return res.status(400).json({ error: "All student fields are required" });
    }

    const hashedPassword = await hashPassword(password);

    if (dbState.useMongo) {
        try {
            const exists = await CandidateModel.findOne({ $or: [{ username }, { studentId }] });
            if (exists) return res.status(400).json({ error: "Candidate Username or Student ID already exists" });

            const cand = new CandidateModel({
                studentId, name, username, password: hashedPassword,
                eligible: !!eligible,
                registeredCourses: []
            });
            await cand.save();
            return res.json({ success: true, candidate: sanitizeCandidate(cand) });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        const exists = (db.candidates || []).some(c => c.username === username || c.studentId === studentId);
        if (exists) return res.status(400).json({ error: "Candidate Username or Student ID already exists" });

        const newCandId = new mongoose.Types.ObjectId().toString();
        const newCand = {
            _id: newCandId,
            id: newCandId,
            studentId, name, username, password: hashedPassword,
            eligible: !!eligible,
            signedConsent: false,
            registrationSubmitted: false,
            registrationStatus: 'Pending',
            registeredCourses: [],
            registrationData: {},
            midSemFeedback: {},
            endSemFeedback: {},
            exitFormSubmitted: false,
            exitAnswers: {}
        };
        db.candidates = db.candidates || [];
        db.candidates.push(newCand);
        saveJSONData(db);
        return res.json({ success: true, candidate: sanitizeCandidate(newCand) });
    }
});

// Get List of Candidates (Admin Only)
router.get('/admin/candidates', requireAdmin, async (req, res) => {
    if (dbState.useMongo) {
        try {
            const list = await CandidateModel.find({}).select('-password -__v').lean();
            return res.json(list.map(sanitizeCandidate));
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        const safeList = (db.candidates || []).map(({ password, ...c }) => c);
        return res.json(safeList.map(sanitizeCandidate));
    }
});

// Toggle Candidate Exam Eligibility (Admin Only)
router.post('/admin/set-eligibility/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { eligible } = req.body;

    if (dbState.useMongo) {
        try {
            const cand = await CandidateModel.findById(id);
            if (!cand) return res.status(404).json({ error: "Candidate not found" });
            cand.eligible = !!eligible;
            await cand.save();
            return res.json({ success: true, eligible: cand.eligible });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        const cand = (db.candidates || []).find(c => String(c.id || c._id || '') === String(id));
        if (!cand) return res.status(404).json({ error: "Candidate not found" });
        cand.eligible = !!eligible;
        saveJSONData(db);
        return res.json({ success: true, eligible: cand.eligible });
    }
});

// Get Candidate Profile details
router.get('/candidate/profile/:id', requireAuth, requireOwnerOrAdmin('id'), async (req, res) => {
    const { id } = req.params;

    if (dbState.useMongo) {
        try {
            const cand = await CandidateModel.findById(id).select('-password');
            if (!cand) return res.status(404).json({ error: "Profile not found" });
            return res.json(sanitizeCandidate(cand));
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        const cand = (db.candidates || []).find(c => String(c.id || c._id || '') === String(id));
        if (!cand) return res.status(404).json({ error: "Profile not found" });
        const { password, ...safeData } = cand;
        return res.json(sanitizeCandidate(safeData));
    }
});

// Submit Candidate Course Registration with files to Cloudinary
router.post('/candidate/complete-registration/:id', requireAuth, requireOwnerOrAdmin('id'), upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'signature', maxCount: 1 },
    { name: 'undertaking', maxCount: 1 }
]), async (req, res) => {
    const { id } = req.params;
    const { preferredName, dob, permanentAddress, localAddress, billingAddress, emergencyName, emergencyRelation, emergencyAddress, emergencyPhone, personalPhone, personalEmail, collegeEmail, courses } = req.body;
    
    const files = req.files;

    if (!preferredName || !dob || !permanentAddress || !localAddress || !billingAddress || !emergencyName || !emergencyRelation || !emergencyAddress || !emergencyPhone || !personalPhone || !personalEmail || !collegeEmail || !courses) {
        return res.status(400).json({ error: "All text fields are required." });
    }

    if (!files || !files.photo || !files.signature || !files.undertaking) {
        return res.status(400).json({ error: "Photo, Signature, and Undertaking file uploads are required." });
    }

    try {
        let photoUrl = '';
        let signatureUrl = '';
        let undertakingUrl = '';

        const useCloudinary = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

        if (useCloudinary) {
            photoUrl = await uploadToCloudinary(files.photo[0].buffer, 'BICS_2026/photos');
            signatureUrl = await uploadToCloudinary(files.signature[0].buffer, 'BICS_2026/signatures');
            undertakingUrl = await uploadToCloudinary(files.undertaking[0].buffer, 'BICS_2026/undertakings');
        } else {
            photoUrl = 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg';
            signatureUrl = 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg';
            undertakingUrl = 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg';
        }

        const parsedCourses = JSON.parse(courses);
        const registrationData = {
            preferredName, dob, permanentAddress, localAddress, billingAddress,
            emergencyContact: {
                name: emergencyName,
                relationship: emergencyRelation,
                address: emergencyAddress,
                phone: emergencyPhone
            },
            personalPhone, personalEmail, collegeEmail,
            photoUrl, signatureUrl, undertakingUrl
        };

        if (dbState.useMongo) {
            const cand = await CandidateModel.findById(id);
            cand.registrationData = registrationData;
            cand.registeredCourses = parsedCourses;
            cand.registrationSubmitted = true;
            await cand.save();
            await logSystemAction(cand.name || id, "REGISTRATION_COMPLETE", `Completed BICS portal student registration for ${cand.name || id}`, "info");
            return res.json({ success: true, profile: cand });
        } else {
            const db = getJSONData();
            const cand = (db.candidates || []).find(c => String(c.id || c._id || '') === String(id));
            cand.registrationData = registrationData;
            cand.registeredCourses = parsedCourses;
            cand.registrationSubmitted = true;
            saveJSONData(db);
            await logSystemAction(cand.name || id, "REGISTRATION_COMPLETE", `Completed BICS portal student registration for ${cand.name || id}`, "info");
            return res.json({ success: true, profile: cand });
        }
    } catch (e) {
        console.error(e);
        await logSystemAction(id, "REGISTRATION_FAILED", `Failed student registration attempt: ${e.message || e}`, "error");
        return res.status(500).json({ error: "Uploading files failed. Please verify Cloudinary keys." });
    }
});

// Sign Malpractice Consent
router.post('/candidate/consent/:id', requireAuth, requireOwnerOrAdmin('id'), async (req, res) => {
    const { id } = req.params;
    const { type } = req.body;

    try {
        let activeType = type;
        if (!activeType) {
            if (dbState.useMongo) {
                const config = await ConfigModel.findOne();
                activeType = config?.examType === 'midsem' ? 'mid' : 'end';
            } else {
                const db = getJSONData();
                activeType = db.config?.examType === 'midsem' ? 'mid' : 'end';
            }
        }

        if (dbState.useMongo) {
            const cand = await CandidateModel.findById(id);
            if (!cand) return res.status(404).json({ error: "Candidate not found." });
            
            cand.signedConsent = true;
            if (activeType === 'mid') {
                cand.midSemConsentSigned = true;
            } else {
                cand.endSemConsentSigned = true;
            }
            await cand.save();
            await logSystemAction(cand.name || id, 'CONSENT_SIGNED', `Candidate signed malpractice & proctoring consent for ${activeType} sem, unlocking Hall Ticket`, 'info');
            return res.json({ success: true, signedConsent: true, student: cand });
        } else {
            const db = getJSONData();
            const cand = (db.candidates || []).find(c => c.id === id || c._id === id);
            if (!cand) return res.status(404).json({ error: "Candidate not found." });

            cand.signedConsent = true;
            if (activeType === 'mid') {
                cand.midSemConsentSigned = true;
            } else {
                cand.endSemConsentSigned = true;
            }
            saveJSONData(db);
            await logSystemAction(cand.name || id, 'CONSENT_SIGNED', `Candidate signed malpractice & proctoring consent for ${activeType} sem, unlocking Hall Ticket`, 'info');
            return res.json({ success: true, signedConsent: true, student: cand });
        }
    } catch (e) {
        console.error(e);
        await logSystemAction('system', 'TECHNICAL_ERROR', `Failed to sign malpractice consent for candidate ID ${id}: ${e.message || e}`, 'error');
        return res.status(500).json({ error: e.message });
    }
});

// Submit Feedback
router.post('/candidate/feedback/:id', requireAuth, requireOwnerOrAdmin('id'), async (req, res) => {
    const { id } = req.params;
    const { type, feedback } = req.body;

    if (dbState.useMongo) {
        try {
            const cand = await CandidateModel.findById(id);
            if (!cand) return res.status(404).json({ error: "Candidate not found." });

            if (type === 'mid') {
                if (cand.midSemFeedback && cand.midSemFeedback.size > 0) {
                    return res.status(400).json({ error: "Mid Semester Feedback has already been submitted." });
                }
                cand.midSemFeedback = feedback;
            } else {
                if (cand.endSemFeedback && cand.endSemFeedback.size > 0) {
                    return res.status(400).json({ error: "End Semester Feedback has already been submitted." });
                }
                cand.endSemFeedback = feedback;
            }
            await cand.save();
            return res.json({ success: true });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        const cand = (db.candidates || []).find(c => c.id === id);
        if (!cand) return res.status(404).json({ error: "Candidate not found." });

        if (type === 'mid') {
            if (cand.midSemFeedback && Object.keys(cand.midSemFeedback).length > 0) {
                return res.status(400).json({ error: "Mid Semester Feedback has already been submitted." });
            }
            cand.midSemFeedback = feedback;
        } else {
            if (cand.endSemFeedback && Object.keys(cand.endSemFeedback).length > 0) {
                return res.status(400).json({ error: "End Semester Feedback has already been submitted." });
            }
            cand.endSemFeedback = feedback;
        }
        saveJSONData(db);
        return res.json({ success: true });
    }
});

// Generate Ledger QR Verification Data
router.get('/candidate/ledger-qr-data/:id', requireAuth, requireOwnerOrAdmin('id'), async (req, res) => {
    const { id } = req.params;
    const { type } = req.query;
    
    if (type !== 'mid' && type !== 'end') {
        return res.status(400).json({ error: "Invalid type. Must be 'mid' or 'end'." });
    }
    
    try {
        let student = null;
        if (dbState.useMongo) {
            if (mongoose.Types.ObjectId.isValid(id)) {
                student = await CandidateModel.findById(id).select('studentId name').lean();
            }
            if (!student) {
                student = await CandidateModel.findOne({
                    $or: [
                        { studentId: id },
                        { studentId: new RegExp(`^${id}$`, 'i') },
                        { id: id }
                    ]
                }).select('studentId name').lean();
            }
        } else {
            const db = getJSONData();
            student = (db.candidates || []).find(c => c.id === id || c._id === id || c.studentId === id || (c.studentId && c.studentId.toUpperCase() === id.toUpperCase()));
        }
        
        if (!student) {
            return res.json({
                success: false,
                studentId: id,
                verificationStatus: 'not_found',
                message: "Candidate ledger verification data pending."
            });
        }
        
        const studentId = student.studentId;
        
        let gradesCount = 0;
        if (dbState.useMongo) {
            gradesCount = await ClassroomSubmissionModel.countDocuments({ studentId: studentId });
        } else {
            const db = getJSONData();
            gradesCount = (db.classroomSubmissions || []).filter(s => s.studentId && s.studentId.trim().toUpperCase() === studentId.trim().toUpperCase()).length;
        }
        
        const SECRET_KEY = process.env.SECRET_KEY || 'bics_portal_secure_secret_key_2026';
        const payloadText = studentId + '_' + type + '_' + gradesCount;
        const hash = crypto.createHmac('sha256', SECRET_KEY).update(payloadText).digest('hex').substring(0, 16);
        
        return res.json({
            success: true,
            studentId,
            studentName: student.name,
            examType: type,
            gradesCount,
            signature: hash,
            verifiedAt: new Date().toISOString()
        });
    } catch (e) {
        console.error("Error in ledger-qr-data:", e);
        return res.json({
            success: false,
            studentId: id,
            verificationStatus: 'error',
            message: e.message
        });
    }
});

// Upload Signed Ledger
router.post('/candidate/upload-ledger/:id', requireAuth, requireOwnerOrAdmin('id'), upload.single('ledgerFile'), async (req, res) => {
    const { id } = req.params;
    const { type } = req.body;
    
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ error: "Ledger file is required." });
        if (type !== 'mid' && type !== 'end') return res.status(400).json({ error: "Invalid feedback/ledger type specified." });

        let student;
        if (dbState.useMongo) {
            student = await CandidateModel.findById(id);
        } else {
            const db = getJSONData();
            student = (db.candidates || []).find(c => c.id === id || c._id === id);
        }
        if (!student) return res.status(404).json({ error: "Candidate profile not found." });

        let qrValid = false;
        let qrScanError = "No security QR code detected. Please ensure you print the official ledger from the portal, scan/photograph it clearly without blur, and re-upload.";
        
        try {
            const jsQR = require('jsqr');
            const { Jimp } = require('jimp');
            
            let imgBuffer = null;
            if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
                const { pdf } = await import('pdf-to-img');
                const document = await pdf(file.buffer, { scale: 3.0 });
                for await (const pageImg of document) {
                    imgBuffer = pageImg;
                    break;
                }
            } else if (file.mimetype.startsWith('image/') || /\.(png|jpe?g)$/i.test(file.originalname)) {
                imgBuffer = file.buffer;
            }
            
            if (imgBuffer) {
                const image = await Jimp.read(imgBuffer);
                const { width, height } = image.bitmap;
                const rgbaBuffer = image.bitmap.data;
                const code = jsQR(new Uint8ClampedArray(rgbaBuffer), width, height);
                
                if (code && code.data) {
                    try {
                        const qrData = JSON.parse(code.data);
                        const SECRET_KEY = process.env.SECRET_KEY || 'bics_portal_secure_secret_key_2026';
                        const payloadText = qrData.studentId + '_' + qrData.type + '_' + qrData.gradesCount;
                        const expectedHash = crypto.createHmac('sha256', SECRET_KEY).update(payloadText).digest('hex').substring(0, 16);
                        
                        if (qrData.studentId === student.studentId && qrData.type === type && qrData.hash === expectedHash) {
                            qrValid = true;
                        } else {
                            qrScanError = "Tamper Detection Alert: Coursework Ledger QR signature mismatch. Please print the unmodified document.";
                        }
                    } catch (parseErr) {
                        qrScanError = "Decryption Error: QR code does not contain a valid BICS security payload.";
                    }
                }
            }
        } catch (qrErr) {
            console.error("[QR_VALIDATION_SYSTEM_ERROR]:", qrErr);
            qrScanError = "Verification Error: Failed to process document. Error: " + qrErr.message;
        }
        
        if (!qrValid) {
            return res.status(400).json({ error: qrScanError });
        }

        let fileUrl = '';
        const useCloudinary = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

        if (useCloudinary) {
            fileUrl = await uploadToCloudinary(file.buffer, `BICS_2026/ledgers_${type}`);
        } else {
            if (process.env.VERCEL || process.env.RENDER) {
                fileUrl = 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg';
            } else {
                const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
                if (!fs.existsSync(uploadsDir)) {
                    fs.mkdirSync(uploadsDir, { recursive: true });
                }
                const fileName = `ledger-${type}-${id}-${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
                const filePath = path.join(uploadsDir, fileName);
                fs.writeFileSync(filePath, file.buffer);
                const host = `${req.protocol}://${req.get('host')}`;
                fileUrl = `${host}/public/uploads/${fileName}`;
            }
        }

        if (dbState.useMongo) {
            const updateField = type === 'mid' ? { midSemLedgerUrl: fileUrl } : { endSemLedgerUrl: fileUrl };
            const student = await CandidateModel.findByIdAndUpdate(id, updateField, { new: true });
            if (!student) return res.status(404).json({ error: "Candidate not found." });
            await logSystemAction(student.name || 'candidate', 'LEDGER_UPLOADED', `Uploaded signed ${type} semester ledger`, 'info');
            return res.json({ success: true, student });
        } else {
            const db = getJSONData();
            const student = (db.candidates || []).find(c => c.id === id || c._id === id);
            if (!student) return res.status(404).json({ error: "Candidate not found." });
            
            if (type === 'mid') {
                student.midSemLedgerUrl = fileUrl;
            } else {
                student.endSemLedgerUrl = fileUrl;
            }
            saveJSONData(db);
            await logSystemAction(student.name || 'candidate', 'LEDGER_UPLOADED', `Uploaded signed ${type} semester ledger`, 'info');
            return res.json({ success: true, student });
        }
    } catch (err) {
        console.error("Ledger upload failed:", err);
        return res.status(500).json({ error: "Ledger upload failed." });
    }
});

// Send Email Verification Code (Authenticated owner or admin)
router.post('/candidate/send-verification-code/:id', requireAuth, requireOwnerOrAdmin('id'), async (req, res) => {
    const { id } = req.params;
    const rawPurpose = typeof req.body?.purpose === 'string' ? req.body.purpose.trim() : '';
    const purpose = rawPurpose ? rawPurpose.slice(0, 64) : 'Identity Verification';
    let lockKey = '';

    try {
        const student = await findCandidateRecordByParam(id);
        if (!student) return res.status(404).json({ error: "Candidate not found." });

        const studentEmail = extractValidCandidateEmail(student);
        if (!studentEmail) {
            return res.status(400).json({ error: "No valid email registered for this candidate. Please contact support." });
        }

        lockKey = String(student._id || student.id || id);
        if (inFlightOtpSends.has(lockKey)) {
            return res.status(429).json({
                error: "A verification code request is already in progress. Please wait a moment.",
                waitSec: 5
            });
        }
        inFlightOtpSends.add(lockKey);

        // 60-Second Cooldown Check
        const now = Date.now();
        const lastSent = student.lastVerificationCodeSentAt ? new Date(student.lastVerificationCodeSentAt).getTime() : 0;
        const elapsed = now - lastSent;
        const COOLDOWN_MS = 60 * 1000;
        if (elapsed < COOLDOWN_MS) {
            const waitSec = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
            return res.status(429).json({
                error: `Please wait ${waitSec} seconds before requesting another verification code.`,
                waitSec
            });
        }

        // Snapshot previous OTP state for atomic rollback on email dispatch failure
        const prevState = {
            verificationCode: student.verificationCode || '',
            verificationCodeExpires: student.verificationCodeExpires || null,
            verificationAttempts: student.verificationAttempts || 0,
            lastVerificationCodeSentAt: student.lastVerificationCodeSentAt || null
        };

        // Cryptographically secure 6-digit code
        const code = crypto.randomInt(100000, 1000000).toString();
        const expires = new Date(now + 10 * 60 * 1000);

        student.verificationCode = code;
        student.verificationCodeExpires = expires;
        student.verificationAttempts = 0;
        student.lastVerificationCodeSentAt = new Date(now);
        if (dbState.useMongo) {
            await student.save();
        } else {
            await persistCandidateRecordJson(student);
        }

        const mailRes = await sendVerificationCodeEmail({
            candidateId: lockKey,
            studentId: student.studentId || '',
            to: studentEmail,
            fullName: student.name || student.registrationData?.preferredName || 'Candidate',
            code,
            purpose,
            expiresMinutes: 10,
            requestedAt: new Date(now),
            expiresAt: expires,
            triggerSource: 'candidate_request'
        });

        if (!mailRes || !mailRes.success) {
            // Rollback OTP & 60s cooldown so candidate is never locked out when email fails
            student.verificationCode = prevState.verificationCode;
            student.verificationCodeExpires = prevState.verificationCodeExpires;
            student.verificationAttempts = prevState.verificationAttempts;
            student.lastVerificationCodeSentAt = prevState.lastVerificationCodeSentAt;
            if (dbState.useMongo) {
                await student.save();
            } else {
                await persistCandidateRecordJson(student);
            }
            return res.status(502).json({
                success: false,
                waitSec: 0,
                cooldownSec: 0,
                error: mailRes?.error || mailRes?.reason || "Failed to send verification code email. Please try again."
            });
        }

        return res.json({
            success: true,
            cooldownSec: 60,
            message: "Verification code sent to your email."
        });
    } catch (err) {
        console.error("Failed to send verification code:", err);
        return res.status(500).json({ error: "Failed to send verification code. Please try again." });
    } finally {
        if (lockKey) inFlightOtpSends.delete(lockKey);
    }
});

// Verify Code (Authenticated owner or admin)
router.post('/candidate/verify-code/:id', requireAuth, requireOwnerOrAdmin('id'), async (req, res) => {
    const { id } = req.params;
    const { code, type } = req.body || {};

    if (typeof code !== 'string' || !code.trim()) {
        return res.status(400).json({ error: "Verification code is required." });
    }

    try {
        const student = await findCandidateRecordByParam(id);
        if (!student) return res.status(404).json({ error: "Candidate not found." });

        if (!student.verificationCode) {
            return res.status(400).json({ error: "No active verification code found. Please request a new code." });
        }

        if (student.verificationCodeExpires && new Date() > new Date(student.verificationCodeExpires)) {
            student.verificationCode = '';
            student.verificationCodeExpires = null;
            student.verificationAttempts = 0;
            if (dbState.useMongo) {
                await student.save();
            } else {
                await persistCandidateRecordJson(student);
            }
            return res.status(400).json({ error: "Verification code has expired. Please request a new one." });
        }

        student.verificationAttempts = (student.verificationAttempts || 0) + 1;

        if (!timingSafeCodeMatch(student.verificationCode, code)) {
            if (student.verificationAttempts >= 5) {
                student.verificationCode = '';
                student.verificationCodeExpires = null;
                student.verificationAttempts = 0;
                if (dbState.useMongo) await student.save();
                else await persistCandidateRecordJson(student);
                return res.status(429).json({
                    error: "Maximum verification attempts (5) exceeded. Your code has been invalidated. Please request a new code."
                });
            }

            if (dbState.useMongo) await student.save();
            else await persistCandidateRecordJson(student);

            const remainingAttempts = 5 - student.verificationAttempts;
            return res.status(400).json({
                error: `Invalid verification code. ${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining.`
            });
        }

        student.verificationCode = '';
        student.verificationCodeExpires = null;
        student.verificationAttempts = 0;
        if (type === 'mid') {
            student.midSemEmailVerified = true;
        } else if (type === 'end') {
            student.endSemEmailVerified = true;
        }
        if (dbState.useMongo) {
            await student.save();
        } else {
            await persistCandidateRecordJson(student);
        }

        await logSystemAction(student.name || 'candidate', 'EMAIL_VERIFIED', `Candidate verified email successfully for ${type || 'action'}`, 'info');
        return res.json({ success: true, message: "Verification successful.", student: sanitizeCandidate(student) });
    } catch (err) {
        console.error("Code verification failed:", err);
        return res.status(500).json({ error: "Verification failed. Please try again." });
    }
});

// Centralized PDF Hall Ticket Generator
router.get('/candidate/generate-hallticket/:id', requireAuth, requireOwnerOrAdmin('id'), async (req, res) => {
    const { id } = req.params;
    const type = req.query?.type || req.body?.type;
    const t = req.query?.t || req.body?.t || Date.now();
    const hallTicketNumber = String(t);

    if (type !== 'mid' && type !== 'end') {
        return res.status(400).send("<h3>Error</h3><p>Invalid exam type specified. Must be 'mid' or 'end'.</p>");
    }

    try {
        let student;
        let systemConfig;

        if (dbState.useMongo) {
            student = await CandidateModel.findById(id);
            systemConfig = await ConfigModel.findOne();
        } else {
            const db = getJSONData();
            student = (db.candidates || []).find(c => c.id === id || c._id === id);
            systemConfig = db.config;
        }

        if (!student) {
            return res.status(404).send("<h3>Error</h3><p>Candidate profile not found.</p>");
        }

        if (!student.eligible) {
            return res.status(403).send("<h3>Error</h3><p>You are not eligible to take this examination.</p>");
        }

        const isMid = type === 'mid';
        const consentSigned = isMid ? student.midSemConsentSigned : student.endSemConsentSigned;
        const feedback = isMid ? student.midSemFeedback : student.endSemFeedback;
        const ledgerUrl = isMid ? student.midSemLedgerUrl : student.endSemLedgerUrl;
        const emailVerified = isMid ? student.midSemEmailVerified : student.endSemEmailVerified;

        if (!consentSigned) {
            return res.status(403).send("<h3>Error</h3><p>Malpractice Undertaking Consent has not been signed for this semester.</p>");
        }
        if (!feedback || (feedback.size !== undefined ? feedback.size === 0 : Object.keys(feedback).length === 0)) {
            return res.status(403).send("<h3>Error</h3><p>Course Feedback Survey has not been submitted for this semester.</p>");
        }
        if (!ledgerUrl) {
            return res.status(403).send("<h3>Error</h3><p>Signed Coursework Ledger has not been uploaded for this semester.</p>");
        }
        if (!emailVerified) {
            return res.status(403).send("<h3>Error</h3><p>Email verification is pending for this semester.</p>");
        }

        return await streamHallTicketPdf(res, {
            candidate: student,
            examType: type,
            ticketNumber: hallTicketNumber,
            systemConfig,
            inline: req.query?.inline === '1' || req.query?.inline === 'true'
        });

    } catch (err) {
        console.error("Failed to generate PDF Hall Ticket:", err);
        return res.status(500).send(`<h3>Technical Error</h3><p>Failed to generate PDF document: ${err.message}</p>`);
    }
});

// Submit Exit Form
router.post('/candidate/exit-form/:id', requireAuth, requireOwnerOrAdmin('id'), async (req, res) => {
    const { id } = req.params;
    const { answers } = req.body;

    if (dbState.useMongo) {
        try {
            const cand = await CandidateModel.findById(id);
            cand.exitAnswers = answers;
            cand.exitFormSubmitted = true;
            await cand.save();
            return res.json({ success: true });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        const cand = (db.candidates || []).find(c => c.id === id);
        cand.exitAnswers = answers;
        cand.exitFormSubmitted = true;
        saveJSONData(db);
        return res.json({ success: true });
    }
});

// Verify Candidate Registration (Admin Only)
router.post('/admin/verify-registration/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (dbState.useMongo) {
        try {
            const cand = await CandidateModel.findById(id);
            if (!cand) return res.status(404).json({ error: "Candidate not found" });
            cand.registrationStatus = status;
            if (status === 'Rejected') {
                cand.registrationSubmitted = false;
            }
            await cand.save();
            return res.json({ success: true, registrationStatus: cand.registrationStatus, registrationSubmitted: cand.registrationSubmitted });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        const cand = (db.candidates || []).find(c => c.id === id || c._id === id);
        if (!cand) return res.status(404).json({ error: "Candidate not found" });
        cand.registrationStatus = status;
        if (status === 'Rejected') {
            cand.registrationSubmitted = false;
        }
        saveJSONData(db);
        return res.json({ success: true, registrationStatus: cand.registrationStatus, registrationSubmitted: cand.registrationSubmitted });
    }
});

module.exports = router;
