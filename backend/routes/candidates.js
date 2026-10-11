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
const { sendVerificationEmail } = require('../utils/email');

const sanitizeCandidate = (c) => {
    if (!c) return c;
    const obj = typeof c.toObject === 'function' ? c.toObject() : JSON.parse(JSON.stringify(c));
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
router.post('/admin/register-candidate', async (req, res) => {
    const { studentId, name, username, password, eligible } = req.body;

    if (!studentId || !name || !username || !password) {
        return res.status(400).json({ error: "All student fields are required" });
    }

    if (dbState.useMongo) {
        try {
            const exists = await CandidateModel.findOne({ $or: [{ username }, { studentId }] });
            if (exists) return res.status(400).json({ error: "Candidate Username or Student ID already exists" });

            const cand = new CandidateModel({
                studentId, name, username, password,
                eligible: !!eligible,
                registeredCourses: []
            });
            await cand.save();
            return res.json({ success: true, candidate: cand });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    } else {
        const db = getJSONData();
        const exists = (db.candidates || []).some(c => c.username === username || c.studentId === studentId);
        if (exists) return res.status(400).json({ error: "Candidate Username or Student ID already exists" });

        const newCand = {
            id: Date.now().toString(),
            studentId, name, username, password,
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
        return res.json({ success: true, candidate: newCand });
    }
});

// Get List of Candidates (Admin Only)
router.get('/admin/candidates', async (req, res) => {
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
router.post('/admin/set-eligibility/:id', async (req, res) => {
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
        const cand = (db.candidates || []).find(c => c.id === id);
        if (!cand) return res.status(404).json({ error: "Candidate not found" });
        cand.eligible = !!eligible;
        saveJSONData(db);
        return res.json({ success: true, eligible: cand.eligible });
    }
});

// Get Candidate Profile details
router.get('/candidate/profile/:id', async (req, res) => {
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
        const cand = (db.candidates || []).find(c => c.id === id);
        if (!cand) return res.status(404).json({ error: "Profile not found" });
        const { password, ...safeData } = cand;
        return res.json(sanitizeCandidate(safeData));
    }
});

// Submit Candidate Course Registration with files to Cloudinary
router.post('/candidate/complete-registration/:id', upload.fields([
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
            const cand = (db.candidates || []).find(c => c.id === id);
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
router.post('/candidate/consent/:id', async (req, res) => {
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
router.post('/candidate/feedback/:id', async (req, res) => {
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
router.get('/candidate/ledger-qr-data/:id', async (req, res) => {
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
router.post('/candidate/upload-ledger/:id', upload.single('ledgerFile'), async (req, res) => {
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

// Send Email Verification Code
router.post('/candidate/send-verification-code/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        let student;
        if (dbState.useMongo) {
            student = await CandidateModel.findById(id);
        } else {
            const db = getJSONData();
            student = (db.candidates || []).find(c => c.id === id || c._id === id);
        }

        if (!student) return res.status(404).json({ error: "Candidate not found." });

        const studentEmail = student.registrationData?.personalEmail || student.personalEmail;
        if (!studentEmail) {
            return res.status(400).json({ error: "No email registered for this candidate. Please contact support." });
        }

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = new Date(Date.now() + 10 * 60 * 1000);

        if (dbState.useMongo) {
            student.verificationCode = code;
            student.verificationCodeExpires = expires;
            await student.save();
        } else {
            student.verificationCode = code;
            student.verificationCodeExpires = expires;
            const db = getJSONData();
            const candIdx = (db.candidates || []).findIndex(c => c.id === id || c._id === id);
            if (candIdx !== -1) {
                db.candidates[candIdx] = student;
                saveJSONData(db);
            }
        }

        await sendVerificationEmail(studentEmail, student.name || 'Candidate', code);
        return res.json({ success: true, message: "Verification code sent to your email." });
    } catch (err) {
        console.error("Failed to send verification code:", err);
        return res.status(500).json({ error: "Failed to send verification code. Please try again." });
    }
});

// Verify Code
router.post('/candidate/verify-code/:id', async (req, res) => {
    const { id } = req.params;
    const { code, type } = req.body;

    if (!code) return res.status(400).json({ error: "Verification code is required." });

    try {
        let student;
        if (dbState.useMongo) {
            student = await CandidateModel.findById(id);
        } else {
            const db = getJSONData();
            student = (db.candidates || []).find(c => c.id === id || c._id === id);
        }

        if (!student) return res.status(404).json({ error: "Candidate not found." });

        if (!student.verificationCode || student.verificationCode !== code.trim()) {
            return res.status(400).json({ error: "Invalid verification code." });
        }

        if (new Date() > new Date(student.verificationCodeExpires)) {
            return res.status(400).json({ error: "Verification code has expired. Please request a new one." });
        }

        if (dbState.useMongo) {
            student.verificationCode = '';
            student.verificationCodeExpires = null;
            if (type === 'mid') {
                student.midSemEmailVerified = true;
            } else if (type === 'end') {
                student.endSemEmailVerified = true;
            }
            await student.save();
        } else {
            student.verificationCode = '';
            student.verificationCodeExpires = null;
            if (type === 'mid') {
                student.midSemEmailVerified = true;
            } else if (type === 'end') {
                student.endSemEmailVerified = true;
            }
            const db = getJSONData();
            const candIdx = (db.candidates || []).findIndex(c => c.id === id || c._id === id);
            if (candIdx !== -1) {
                db.candidates[candIdx] = student;
                saveJSONData(db);
            }
        }

        await logSystemAction(student.name || 'candidate', 'EMAIL_VERIFIED', `Candidate verified email successfully for ${type || 'action'}`, 'info');
        return res.json({ success: true, message: "Verification successful.", student });
    } catch (err) {
        console.error("Code verification failed:", err);
        return res.status(500).json({ error: "Verification failed. Please try again." });
    }
});

// Centralized PDF Hall Ticket Generator
router.get('/candidate/generate-hallticket/:id', async (req, res) => {
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

        const doc = new PDFDocument({ size: 'A4', margin: 30 });
        doc.page.margins.bottom = 10;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="hallticket-${type}sem-${student.studentId || id}.pdf"`);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        doc.pipe(res);

        const SECRET_KEY = process.env.SECRET_KEY || 'bics_portal_secure_secret_key_2026';
        const payloadText = `${student.studentId || id}_${type}_${hallTicketNumber}_${student.eligible ? 'ELIGIBLE' : 'NOT_ELIGIBLE'}`;
        const hmacHash = crypto.createHmac('sha256', SECRET_KEY).update(payloadText).digest('hex').substring(0, 24);

        doc.fillColor('#334155')
           .font('Courier-Bold')
           .fontSize(8.5)
           .text(`Hall Ticket Number - ${hallTicketNumber}`, 30, 16, { align: 'right', width: 535 });

        const logoPath = path.join(__dirname, '..', 'public', 'logo.png');
        if (fs.existsSync(logoPath)) {
            doc.image(logoPath, 30, 30, { width: 55 });
        }

        const bicsLogoPath = path.join(__dirname, '..', 'public', 'bics_logo.png');
        if (fs.existsSync(bicsLogoPath)) {
            doc.image(bicsLogoPath, 510, 30, { width: 55 });
        }

        doc.fillColor('#002147')
           .font('Helvetica-Bold')
           .fontSize(16)
           .text("PRELIMINARY EXAMINATIONS 2026", 95, 33, { align: 'left' });

        doc.fillColor('#475569')
           .font('Helvetica-Bold')
           .fontSize(8.5)
           .text("BASIC INTRODUCTORY COMPUTER SCIENCE (BICS) COURSE", 95, 53, { align: 'left' });

        const typeLabel = isMid ? "MID-SEMESTER TESTS 2026" : "END SEMESTER EXAMINATION 2026";
        const typeColor = isMid ? '#b91c1c' : '#002147';
        doc.fillColor(typeColor)
           .font('Helvetica-Bold')
           .fontSize(10.5)
           .text(typeLabel, 95, 70, { align: 'left' });

        doc.strokeColor('#002147')
           .lineWidth(1.5)
           .moveTo(30, 95)
           .lineTo(565, 95)
           .stroke();

        const fetchImageBuffer = async (url) => {
            if (!url) return null;
            let targetUrl = url;
            if (targetUrl.startsWith('/media/')) {
                targetUrl = `https://res.cloudinary.com/dl7xqcnmr/image/upload/BICS_2026/${targetUrl.replace(/^\/media\//, '')}`;
            } else if (targetUrl.includes('.netlify.app/media/')) {
                const subPath = targetUrl.substring(targetUrl.indexOf('/media/') + 7);
                targetUrl = `https://res.cloudinary.com/dl7xqcnmr/image/upload/BICS_2026/${subPath}`;
            }
            if (targetUrl.includes('/public/uploads/')) {
                const fileName = targetUrl.substring(targetUrl.indexOf('/public/uploads/') + 16);
                const localPath = path.join(__dirname, '..', 'public', 'uploads', fileName);
                if (fs.existsSync(localPath)) {
                    try { return fs.readFileSync(localPath); } catch (e) {}
                }
            }
            try {
                const response = await fetch(targetUrl);
                if (response.ok) {
                    return Buffer.from(await response.arrayBuffer());
                }
            } catch (e) {
                console.error("HTTP fetch failed for URL:", targetUrl, e.message);
            }
            return null;
        };

        const photoUrl = student.registrationData?.photoUrl;
        const sigUrl = student.registrationData?.signatureUrl;
        
        const [photoBuffer, sigBuffer] = await Promise.all([
            fetchImageBuffer(photoUrl),
            fetchImageBuffer(sigUrl)
        ]);

        let yOffset = 110;
        doc.fontSize(8).fillColor('#64748b').font('Helvetica-Bold').text("CANDIDATE FULL NAME:", 30, yOffset);
        doc.fontSize(10).fillColor('#002147').font('Helvetica-Bold').text(student.name || 'Candidate Name', 165, yOffset);

        yOffset += 16;
        doc.fontSize(8).fillColor('#64748b').font('Helvetica-Bold').text("STUDENT ID NUMBER:", 30, yOffset);
        doc.fontSize(10).fillColor('#002147').font('Helvetica-Bold').text(student.studentId || 'ID Number', 165, yOffset);

        yOffset += 16;
        doc.fontSize(8).fillColor('#64748b').font('Helvetica-Bold').text("EMAIL ADDRESS:", 30, yOffset);
        doc.fontSize(9.5).fillColor('#002147').font('Helvetica-Bold').text(student.registrationData?.personalEmail || student.personalEmail || 'Email', 165, yOffset);

        yOffset += 16;
        doc.fontSize(8).fillColor('#64748b').font('Helvetica-Bold').text("CANDIDATE ADDRESS:", 30, yOffset);
        const candAddr = student.registrationData?.permanentAddress || student.permanentAddress || 'Address details registered in candidate records.';
        doc.fontSize(8.5).fillColor('#334155').font('Helvetica').text(candAddr, 165, yOffset, { width: 230, align: 'left' });

        doc.rect(410, 107, 70, 85).strokeColor('#cbd5e1').lineWidth(1).stroke();
        if (photoBuffer) {
            try { doc.image(photoBuffer, 411, 108, { width: 68, height: 83 }); } catch (e) { console.error("Error drawing photo:", e); }
        }
        doc.fontSize(6.5).fillColor('#64748b').font('Helvetica-Bold').text("PHOTOGRAPH", 410, 198, { width: 70, align: 'center' });

        doc.rect(490, 107, 75, 85).strokeColor('#cbd5e1').lineWidth(1).stroke();
        if (sigBuffer) {
            try { doc.image(sigBuffer, 492, 120, { width: 71, height: 60 }); } catch (e) { console.error("Error drawing signature:", e); }
        }
        doc.fontSize(6.5).fillColor('#64748b').font('Helvetica-Bold').text("SIGNATURE", 490, 198, { width: 75, align: 'center' });

        doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(30, 212).lineTo(565, 212).stroke();

        doc.fillColor('#002147').font('Helvetica-Bold').fontSize(10).text("EXAMS & TIMETABLE SCHEDULE:", 30, 222);

        let tableY = 238;
        doc.rect(30, tableY, 535, 18).fill('#f1f5f9');
        
        doc.fillColor('#475569').font('Helvetica-Bold').fontSize(8);
        doc.text("Course Code", 35, tableY + 5);
        doc.text("Course", 110, tableY + 5);
        doc.text("Exam Date", 295, tableY + 5);
        doc.text("Time", 370, tableY + 5);
        doc.text("Marks", 450, tableY + 5);
        doc.text("Invigilator Signature", 485, tableY + 5);

        const timetable = systemConfig?.timetable || [];
        doc.font('Helvetica').fontSize(8).fillColor('#334155');

        timetable.forEach((t, idx) => {
            tableY += 18;
            doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(30, tableY).lineTo(565, tableY).stroke();

            doc.font('Helvetica-Bold').fillColor('#002147').text(t.code || `CS-10${idx+1}`, 35, tableY + 5);
            doc.font('Helvetica').fillColor('#334155').text(t.course || 'Course Name', 110, tableY + 5, { width: 175 });
            doc.text(t.date || 'TBA', 295, tableY + 5);
            doc.text(t.time || 'TBA', 370, tableY + 5);
            doc.font('Helvetica-Bold').text(t.marks !== undefined ? String(t.marks) : '50', 450, tableY + 5);
            
            doc.strokeColor('#cbd5e1').lineWidth(0.5).dash(1, { space: 1 }).moveTo(485, tableY + 13).lineTo(560, tableY + 13).stroke().undash();
        });

        tableY += 18;
        doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(30, tableY).lineTo(565, tableY).stroke();

        let conductY = tableY + 15;
        doc.rect(30, conductY, 535, 110).fillAndStroke('#f8fafc', '#cbd5e1');
        
        doc.fillColor('#002147').font('Helvetica-Bold').fontSize(8.5).text("MANDATORY EXAM CONDUCT CODES (ONLINE & OFFLINE VIOLATIONS)", 38, conductY + 8);
        doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(38, conductY + 22).lineTo(557, conductY + 22).stroke();

        doc.fillColor('#b91c1c').font('Helvetica-Bold').fontSize(7.5).text("Online Proctored Exam Rules:", 38, conductY + 28);
        doc.fillColor('#475569').font('Helvetica').fontSize(6.8);
        let ruleY = conductY + 38;
        const onlineRules = [
            "- Max 3 window focus alerts allowed. Exceeding this triggers automatic test lockout.",
            "- Continuous real-time webcam & mic feeds are matched against candidate reference files.",
            "- Active screen sharing capture and clipboard tracking are mandatory.",
            "- Closing fullscreen mode or launching background terminals constitutes disqualification."
        ];
        onlineRules.forEach(rule => {
            doc.text(rule, 38, ruleY, { width: 250 });
            ruleY += doc.heightOfString(rule, { width: 250 }) + 2;
        });

        doc.fillColor('#b91c1c').font('Helvetica-Bold').fontSize(7.5).text("Offline Center Hall Rules:", 300, conductY + 28);
        doc.fillColor('#475569').font('Helvetica').fontSize(6.8);
        ruleY = conductY + 38;
        const offlineRules = [
            "- Candidates must report 30 mins prior; late entries beyond 15 mins strictly disallowed.",
            "- Mobile phones, smartwatches, or programmable devices are strictly forbidden.",
            "- This printed Hall Ticket along with an official physical ID is mandatory.",
            "- Rough sheets must be submitted to the invigilator prior to exiting the hall."
        ];
        offlineRules.forEach(rule => {
            doc.text(rule, 300, ruleY, { width: 250 });
            ruleY += doc.heightOfString(rule, { width: 250 }) + 2;
        });

        let undertakerY = conductY + 120;
        doc.rect(30, undertakerY, 535, 40).fillAndStroke('#f1f5f9', '#cbd5e1');
        doc.fillColor('#475569').font('Helvetica-Bold').fontSize(7).text("Malpractice violation consent undertaker declaration:", 35, undertakerY + 6);
        doc.font('Helvetica').fontSize(6.5).text(
            "I hereby confirm that I have consented to the malpractice undertaking electronically. I accept that failing to comply with online proctoring parameters or offline test center regulations will terminate my test immediately and annul all marks for BICS 2026.",
            35, undertakerY + 16, { width: 525, lineGap: 1 }
        );

        let footerY = Math.max(undertakerY + 60, 665);

        if (sigBuffer) {
            try { doc.image(sigBuffer, 50, footerY - 5, { width: 70, height: 25 }); } catch(e) {}
        }
        doc.strokeColor('#002147').lineWidth(0.5).moveTo(30, footerY + 28).lineTo(140, footerY + 28).stroke();
        doc.fillColor('#475569').font('Helvetica-Bold').fontSize(7.5).text("Candidate Signature (Verification)", 30, footerY + 32);

        try {
            const qrPayload = JSON.stringify({
                sid: student.studentId || id,
                name: student.name,
                exam: type,
                ticketNo: hallTicketNumber,
                sign: hmacHash
            });
            
            const qrBuffer = qrImage.imageSync(qrPayload, { type: 'png', margin: 1, size: 2 });
            doc.image(qrBuffer, 270, footerY - 14, { width: 56, height: 56 });
            doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(5.5).text("SECURITY VERIFICATION QR", 240, footerY + 45, { width: 116, align: 'center', lineBreak: false });
        } catch (qrErr) {
            console.error("Failed to render security verification QR in PDF:", qrErr);
        }

        doc.strokeColor('#002147').lineWidth(0.5).moveTo(440, footerY + 28).lineTo(565, footerY + 28).stroke();
        doc.fillColor('#475569').font('Helvetica-Bold').fontSize(7.5).text("Chief Registrar (PE Board Exams)", 440, footerY + 32);

        const pdfFooterY = doc.page.height - 42;
        doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(30, pdfFooterY).lineTo(565, pdfFooterY).stroke();
        
        doc.fillColor('#64748b')
           .font('Helvetica-Bold')
           .fontSize(7)
           .text("Basic Introductory Computer Science (BICS) Course", 30, pdfFooterY + 6, { align: 'center', lineBreak: false });
           
        doc.font('Helvetica')
           .fontSize(6.5)
           .text("Conducted by Preliminary Examinations 2026", 30, pdfFooterY + 15, { align: 'center', lineBreak: false });
           
        doc.font('Helvetica')
           .fontSize(6)
           .text("© All rights reserved", 30, pdfFooterY + 24, { align: 'center', lineBreak: false });

        doc.end();

    } catch (err) {
        console.error("Failed to generate PDF Hall Ticket:", err);
        return res.status(500).send(`<h3>Technical Error</h3><p>Failed to generate PDF document: ${err.message}</p>`);
    }
});

// Submit Exit Form
router.post('/candidate/exit-form/:id', async (req, res) => {
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
router.post('/admin/verify-registration/:id', async (req, res) => {
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
