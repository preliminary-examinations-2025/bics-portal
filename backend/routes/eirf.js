const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { EIRFReportModel, TestSubmissionModel, CandidateModel, TestConfigModel } = require('../models');
const { dbState, getJSONData, saveJSONData } = require('../config/db');
const { generateEirfReportId } = require('../config/constants');
const { logSystemAction } = require('../utils/logger');
const { encryptEirfPayload, decryptEirfPayload, getPublicKeyPem, getPublicKeyDerBase64 } = require('../utils/cipher');
const { formatISTDate, sendEirfVerdictEmail } = require('../utils/email');
const { generateEirfVerdictPdfBuffer, generateDigitalVerdictHash } = require('../utils/pdfGenerator');
const { sendEirfVerdictApprovedEmail, sendEirfVerdictRejectedEmail } = require('../services/gmailEmailService');
const { uploadToCloudinary, cloudinary } = require('../config/cloudinary');
const { requireAdmin } = require('../middleware/auth');
const { runPipelineTick } = require('../workers/eirfPipelineWorker');
const { resolveToObjectId, toBicsId, isBicsId } = require('../utils/bicsId');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const proofUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

function healGeneratedQuestions(questions) {
    if (!Array.isArray(questions) || questions.length === 0) return { healed: [], modified: false };
    let modified = false;

    const healed = questions.map((q, idx) => {
        const qObj = q.toObject ? q.toObject() : { ...q };
        const qType = String(qObj.questionType || '').toUpperCase();
        const cat = String(qObj.category || '').toUpperCase();
        const text = String(qObj.questionText || '').toLowerCase();
        let opts = Array.isArray(qObj.options) ? qObj.options.filter(o => typeof o === 'string' && o.trim().length > 0) : [];

        if ((qType === 'RADIO' || qType === 'CHECKBOX') && opts.length === 0) {
            modified = true;
            if (cat.includes('ENV') || text.includes('physical') || text.includes('surroundings') || qObj.questionId === 'Q5') {
                opts = [
                    'Private closed room with no other individuals present',
                    'Shared residential room / family environment with occasional movement',
                    'College or university computer laboratory / library',
                    'Public venue / café / coworking facility',
                    'Mobile / transit setting'
                ];
            } else if (cat.includes('REMEDIATION') || text.includes('troubleshoot') || text.includes('remediation') || text.includes('step') || qObj.questionId === 'Q6') {
                opts = [
                    'Toggled Wi-Fi off and on / reconnected to wireless access point',
                    'Switched connection to mobile hotspot or USB tethering',
                    'Rebooted home router or modem',
                    'Closed background tasks via Task Manager / Activity Monitor',
                    'Re-entered fullscreen immediately via on-screen button or key',
                    'Refreshed the browser window to restore server sync',
                    'Waited without altering system state until stability resumed'
                ];
            } else if (cat.includes('PROCESS') || cat.includes('BACKGROUND') || text.includes('software') || text.includes('popup') || qObj.questionId === 'Q4') {
                opts = [
                    'Antivirus / Security Suite scan or alert (e.g. Windows Defender, McAfee)',
                    'Communication software (e.g. Discord, Slack, Teams, WhatsApp, Zoom)',
                    'Browser extensions / popups (e.g. Grammarly, password manager, ad-blocker)',
                    'System update dialog (Windows Update, macOS Software Update)',
                    'Display or GPU utilities (e.g. NVIDIA GeForce Experience, dual monitor tools)',
                    'None of the above / Machine had only the test window open'
                ];
            } else {
                opts = [
                    'Local ISP / Home broadband disconnection or packet drop',
                    'Operating system notification / popup or antivirus interruption',
                    'Accidental keyboard shortcut / trackpad gesture / peripheral disconnect',
                    'Device power / hardware restart or low battery event',
                    'Browser freeze / crash requiring tab reload',
                    'Other unforeseen environmental disruption'
                ];
            }
            qObj.options = opts;
        }

        // Detect UTC timestamps (e.g. 08:03:20 without IST) and convert/append IST clarification
        if (typeof qObj.placeholder === 'string' && /At\s+(\d{2}:\d{2}:\d{2})(?!\s*IST)/.test(qObj.placeholder)) {
            qObj.placeholder = qObj.placeholder.replace(/At\s+(\d{2}:\d{2}:\d{2})(?!\s*IST)/g, (match, timeStr) => {
                try {
                    const parts = timeStr.split(':').map(Number);
                    let h = parts[0] + 5;
                    let m = parts[1] + 30;
                    if (m >= 60) { h += 1; m -= 60; }
                    const istStr = `${String(h % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(parts[2]).padStart(2, '0')} IST`;
                    modified = true;
                    return `At ${istStr}`;
                } catch (_) {
                    return match;
                }
            });
        }

        return qObj;
    });

    return { healed, modified };
}

// 1. Get EIRF Incident Details & Breakdown by Submission ID
router.get('/test/eirf/details/:submissionId', async (req, res) => {
    const { submissionId } = req.params;
    try {
        const targetSubId = resolveToObjectId(submissionId);
        let submission = null;
        let candidate = null;
        let testConfig = null;
        let existingReport = null;

        if (dbState.useMongo) {
            if (mongoose.Types.ObjectId.isValid(targetSubId)) {
                submission = await TestSubmissionModel.findById(targetSubId).lean();
            }
            if (!submission && mongoose.Types.ObjectId.isValid(submissionId)) {
                submission = await TestSubmissionModel.findById(submissionId).lean();
            }
            if (!submission) {
                submission = await TestSubmissionModel.findOne({
                    $or: [
                        { _id: targetSubId },
                        { id: targetSubId },
                        { _id: submissionId },
                        { id: submissionId }
                    ]
                }).lean();
            }
            if (!submission) {
                existingReport = await EIRFReportModel.findOne({
                    $or: [
                        { reportId: String(submissionId) },
                        { submissionId: String(submissionId) },
                        { submissionId: String(targetSubId) }
                    ]
                }).lean();
                if (existingReport && existingReport.submissionId) {
                    submission = await TestSubmissionModel.findById(resolveToObjectId(existingReport.submissionId)).lean();
                }
            }
            if (!submission && mongoose.Types.ObjectId.isValid(targetSubId)) {
                submission = await TestSubmissionModel.findOne({ testId: targetSubId }).sort({ submittedAt: -1 }).lean();
            }

            if (submission) {
                candidate = await CandidateModel.findById(submission.candidateId).lean();
                testConfig = await TestConfigModel.findById(submission.testId).lean();
                if (!existingReport) {
                    existingReport = await EIRFReportModel.findOne({
                        $or: [
                            { submissionId: String(submission._id || submission.id) },
                            { submissionId: String(targetSubId) },
                            { reportId: String(submissionId) }
                        ]
                    }).lean();
                }
            }
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submission = db.testSubmissions.find(s => 
                String(s._id || s.id) === String(targetSubId) || 
                String(s._id || s.id) === String(submissionId) ||
                toBicsId(s._id || s.id) === submissionId
            );
            if (!submission) {
                db.eirfReports = db.eirfReports || [];
                existingReport = db.eirfReports.find(r => 
                    String(r.reportId) === String(submissionId) || 
                    String(r.submissionId) === String(submissionId) ||
                    String(r.submissionId) === String(targetSubId)
                );
                if (existingReport && existingReport.submissionId) {
                    submission = db.testSubmissions.find(s => String(s._id || s.id) === String(resolveToObjectId(existingReport.submissionId)));
                }
            }
            if (!submission) {
                submission = db.testSubmissions.find(s => String(s.testId) === String(targetSubId) || String(s.testId) === String(submissionId));
            }
            if (submission) {
                candidate = (db.candidates || []).find(c => String(c._id || c.id) === String(submission.candidateId) || c.studentId === submission.studentId);
                testConfig = (db.tests || []).find(t => String(t._id || t.id) === String(submission.testId));
                if (!existingReport) {
                    db.eirfReports = db.eirfReports || [];
                    existingReport = db.eirfReports.find(r => 
                        String(r.submissionId) === String(submission._id || submission.id) ||
                        String(r.submissionId) === String(targetSubId)
                    );
                }
            }
        }

        if (!submission) {
            return res.status(404).json({ error: "Examination submission record not found." });
        }

        const events = [];
        const seenEvents = new Set();
        const addEv = (e) => {
            if (!e) return;
            const key = `${e.type}_${e.startTime || e.timestamp || ''}_${e.durationSeconds || 0}_${e.details || ''}`;
            if (!seenEvents.has(key)) {
                seenEvents.add(key);
                events.push(e);
            }
        };

        (submission.proctoringLog?.events || []).forEach(addEv);
        if (existingReport?.decryptedPayloadSnapshot?.proctoringLog?.events) {
            (existingReport.decryptedPayloadSnapshot.proctoringLog.events || []).forEach(addEv);
        }
        if (existingReport?.proctoringLogSnapshot?.events) {
            (existingReport.proctoringLogSnapshot.events || []).forEach(addEv);
        }

        const flaggedReasons = [];
        let hasFullscreenFlag = false;
        let hasTabSwitchFlag = false;
        let hasNetworkFlag = false;
        let maxFullscreenSeconds = 0;
        let maxTabSwitchSeconds = 0;

        events.forEach(ev => {
            let dur = Number(ev.durationSeconds || 0);
            if (!dur && ev.details) {
                const m1 = ev.details.match(/for\s+(\d+)\s+seconds/i);
                const m2 = ev.details.match(/Max:\s*(\d+)s/i);
                const m3 = ev.details.match(/after\s+(\d+)\s+seconds/i);
                const m4 = ev.details.match(/(\d+)\s*seconds/i);
                if (m1 && m1[1]) dur = parseInt(m1[1], 10);
                else if (m2 && m2[1]) dur = parseInt(m2[1], 10);
                else if (m3 && m3[1]) dur = parseInt(m3[1], 10);
                else if (m4 && m4[1]) dur = parseInt(m4[1], 10);
            }
            const isFsEv = ev.type === 'FULLSCREEN_EXIT' || ev.type === 'FULLSCREEN_RETURNED' || (ev.type && ev.type.includes('FULLSCREEN'));
            const isTabEv = ev.type === 'TAB_SWITCH' || ev.type === 'TAB_RETURNED' || (ev.type && ev.type.includes('TAB'));

            if (isFsEv) {
                if (dur > maxFullscreenSeconds) maxFullscreenSeconds = dur;
                if (dur > 5) {
                    hasFullscreenFlag = true;
                    flaggedReasons.push(`Fullscreen exit duration: ${dur} seconds (exceeds 5s threshold)`);
                }
            } else if (isTabEv) {
                if (dur > maxTabSwitchSeconds) maxTabSwitchSeconds = dur;
                if (dur > 5) {
                    hasTabSwitchFlag = true;
                    flaggedReasons.push(`Tab switch duration: ${dur} seconds (exceeds 5s threshold)`);
                }
            } else if (ev.type === 'NETWORK_OFFLINE' || ev.type === 'EMERGENCY_SUBMISSION') {
                hasNetworkFlag = true;
                flaggedReasons.push(`Session disconnect / emergency payload trigger`);
            }
        });

        const fsCount = submission.proctoringLog?.fullscreenExits || 0;
        const tabCount = submission.proctoringLog?.tabSwitches || 0;
        const totalWarningsCount = fsCount + tabCount;

        // EIRF Policy:
        // 1. Minor warnings: 5% of actual exam duration
        // 2. Individual major warnings (fullscreen exit or tab switch): > 5 seconds
        // 3. Auto-submitted or exhausted 3 warnings
        // 4. Session network drop
        const examDurationMin = Number(testConfig?.duration || 60);
        const minorThresholdSec = Math.max(10, Math.round(examDurationMin * 60 * 0.05));

        let hasMinorFlag = false;
        events.forEach(ev => {
            if (ev.type === 'MINOR_WARNINGS_EXCEEDED') {
                hasMinorFlag = true;
                flaggedReasons.push(`Cumulative minor proctoring violations exceeded 5% exam duration threshold (${minorThresholdSec}s).`);
            }
        });

        if (submission.status === 'auto-submitted' || totalWarningsCount >= 3) {
            flaggedReasons.push(`Exam attempt auto-submitted due to reaching maximum compliance warnings (${totalWarningsCount} warnings).`);
        }

        const hasEirfFlag = Boolean(
            submission.hasEirfFlag || 
            hasFullscreenFlag || 
            hasTabSwitchFlag || 
            hasMinorFlag || 
            hasNetworkFlag || 
            submission.status === 'auto-submitted' || 
            totalWarningsCount >= 3
        );

        if (flaggedReasons.length === 0 && hasEirfFlag) {
            flaggedReasons.push(`Proctoring alert flagged by administration for incident review.`);
        }

        const uniqueFlaggedReasons = Array.from(new Set(flaggedReasons));

        const submittedAt = submission.submittedAt || submission.startedAt || new Date();
        const expiresAt = submission.eirfExpiresAt || new Date(new Date(submittedAt).getTime() + 45 * 60 * 1000);
        const isExpired = Date.now() > new Date(expiresAt).getTime() || submission.pipelineStatus === 'EXPIRED';

        const isAdmin = Boolean(
            req.query.role === 'admin' ||
            req.query.isAdmin === 'true' ||
            req.headers['x-admin-role'] === 'admin' ||
            req.headers['x-api-secret'] ||
            req.query.apiSecret ||
            req.session?.admin
        );

        // Security Magic Link Token Verification
        const providedToken = req.query.token || req.headers['x-eirf-token'] || req.user?.eirfToken;
        const isTokenMatch = Boolean(
            submission.eirfToken &&
            providedToken && 
            String(providedToken).trim() === String(submission.eirfToken).trim()
        );

        if (!isAdmin && !isTokenMatch && req.user?.role !== 'admin') {
            return res.status(403).json({
                error: "Invalid or expired EIRF access token. Please access the form using the secure link delivered to your email.",
                invalidToken: true
            });
        }

        if (isExpired && !isAdmin && req.user?.role !== 'admin') {
            return res.status(410).json({
                error: "The Emergency Incident Report Form (EIRF) is closed, moved, or unavailable at this link.",
                isExpired: true,
                expiresAt
            });
        }

        let sanitizedExistingReport = null;
        if (existingReport) {
            const { decryptedPayloadSnapshot, proctoringLogSnapshot, ...safeReport } = existingReport;
            sanitizedExistingReport = safeReport;
        }

        // Auto-heal empty choice options or legacy UTC timestamps and persist to database
        const { healed: activeQuestions, modified } = healGeneratedQuestions(submission.generatedQuestions || []);
        if (modified) {
            submission.generatedQuestions = activeQuestions;
            if (dbState.useMongo) {
                TestSubmissionModel.updateOne(
                    { _id: submission._id || targetSubId },
                    { $set: { generatedQuestions: activeQuestions } }
                ).catch(err => console.warn('[EIRF] Auto-healing update failed:', err.message));
            } else {
                const db = getJSONData();
                const s = (db.testSubmissions || []).find(sub => String(sub._id || sub.id) === String(submission._id || submission.id));
                if (s) {
                    s.generatedQuestions = activeQuestions;
                    saveJSONData(db);
                }
            }
        }

        const formattedQuestions = activeQuestions.map((q, idx) => {
            const qObj = q.toObject ? q.toObject() : { ...q };
            const qId = qObj.questionId || qObj.id || `Q${idx + 1}`;
            const qType = String(qObj.questionType || qObj.type || 'TEXT').toUpperCase();
            return {
                ...qObj,
                id: qId,
                questionId: qId,
                type: qType.toLowerCase(),
                questionType: qType
            };
        });

        return res.json({
            submissionId: toBicsId(submission._id || submission.id) || submissionId,
            bicsId: toBicsId(submission._id || submission.id) || submissionId,
            rawSubmissionId: String(submission._id || submission.id),
            token: submission.eirfToken || providedToken || '',
            studentId: submission.studentId || candidate?.studentId || 'Candidate',
            candidateName: submission.candidateName || candidate?.name || 'Candidate',
            testId: submission.testId,
            testTitle: submission.testTitle || testConfig?.title || 'BICS Examination',
            submittedAt,
            expiresAt,
            isExpired,
            existingReport: sanitizedExistingReport,
            hasEirfFlag,
            eirfNoticeEmailSent: Boolean(submission.eirfNoticeEmailSent),
            generatedQuestions: formattedQuestions,
            pipelineStatus: submission.pipelineStatus || (hasEirfFlag ? 'AWAITING_EIRF' : 'CLEARED'),
            proctoringTelemetry: {
                fullscreenExits: submission.proctoringLog?.fullscreenExits || 0,
                tabSwitches: submission.proctoringLog?.tabSwitches || 0,
                events,
                maxFullscreenSeconds,
                maxTabSwitchSeconds
            },
            flaggedReasons: hasEirfFlag ? uniqueFlaggedReasons : [],
            eventFlags: {
                fullscreen: hasFullscreenFlag || maxFullscreenSeconds > 5,
                tabSwitch: hasTabSwitchFlag || maxTabSwitchSeconds > 5,
                network: hasNetworkFlag
            }
        });
    } catch (e) {
        console.error("Fetch EIRF details error:", e);
        return res.status(500).json({ error: e.message });
    }
});

// 1.1 Expose Server RSA Public Key for client-side asymmetric EIRF backup encryption
router.get('/test/eirf/public-key', (req, res) => {
    try {
        return res.json({
            success: true,
            algorithm: 'RSA-OAEP-2048',
            hash: 'SHA-256',
            publicKeyPem: getPublicKeyPem(),
            publicKeyDerBase64: getPublicKeyDerBase64()
        });
    } catch (e) {
        console.error("Public key export error:", e);
        return res.status(500).json({ error: "Failed to retrieve encryption public key." });
    }
});

// 1.2 Upload Candidate Supporting Evidence / Proof (JPG, PNG, PDF <= 5MB)
router.post('/test/eirf/upload-proof', proofUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No evidence file uploaded.' });
        }

        const submissionId = req.body.submissionId;
        const providedToken = req.body.token || req.query.token || req.headers['x-eirf-token'] || req.user?.eirfToken;

        const isAdmin = Boolean(
            req.user?.role === 'admin' ||
            req.headers['x-admin-role'] === 'admin' ||
            req.headers['x-api-secret'] ||
            req.session?.admin
        );

        if (!isAdmin) {
            if (!submissionId || !providedToken) {
                return res.status(403).json({ error: "EIRF submission ID and authorization token required." });
            }
            const targetSubId = resolveToObjectId(submissionId);
            let sub = null;
            if (dbState.useMongo) {
                if (mongoose.Types.ObjectId.isValid(targetSubId)) {
                    sub = await TestSubmissionModel.findById(targetSubId).select('eirfToken eirfExpiresAt pipelineStatus').lean();
                }
                if (!sub) {
                    sub = await TestSubmissionModel.findOne({
                        $or: [{ _id: targetSubId }, { id: targetSubId }, { _id: submissionId }, { id: submissionId }]
                    }).select('eirfToken eirfExpiresAt pipelineStatus').lean();
                }
            } else {
                const db = getJSONData();
                sub = (db.testSubmissions || []).find(s => 
                    String(s._id || s.id) === String(targetSubId) || 
                    String(s._id || s.id) === String(submissionId)
                );
            }

            if (!sub || !sub.eirfToken || String(sub.eirfToken).trim() !== String(providedToken).trim()) {
                return res.status(403).json({ error: "Invalid EIRF authorization token. Access denied." });
            }

            const expiresAt = sub.eirfExpiresAt || new Date(Date.now() + 45 * 60 * 1000);
            if (Date.now() > new Date(expiresAt).getTime() || sub.pipelineStatus === 'EXPIRED') {
                return res.status(410).json({ error: "The EIRF 45-minute submission window has expired. Proof uploads are closed." });
            }
        }

        const fileName = req.file.originalname || 'evidence_proof.png';
        const fileBuffer = req.file.buffer;
        const mimeType = req.file.mimetype || 'image/png';

        const useCloudinary = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
        let fileUrl = '';

        if (useCloudinary) {
            const folder = `BICS_2026/eirf_proofs/${submissionId}`;
            const resourceType = mimeType.includes('pdf') ? 'raw' : 'image';
            fileUrl = await uploadToCloudinary(fileBuffer, folder, resourceType);
        } else {
            // Local fallback
            const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'eirf_proofs');
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            const safeFileName = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            const filePath = path.join(uploadDir, safeFileName);
            fs.writeFileSync(filePath, fileBuffer);
            fileUrl = `/uploads/eirf_proofs/${safeFileName}`;
        }

        return res.json({
            success: true,
            fileUrl,
            fileName,
            fileSize: req.file.size,
            mimeType
        });
    } catch (err) {
        console.error('[EIRF Proof Upload Error]:', err);
        return res.status(500).json({ error: 'Failed to upload supporting evidence: ' + err.message });
    }
});

// 2. Generate & save encrypted database payload for EIRF backup (.eirf)
router.post('/test/eirf/generate-payload', async (req, res) => {
    const { submissionId, studentId: reqStudentId, answers, proctoringLog } = req.body;
    if (!submissionId) {
        return res.status(400).json({ error: "Submission ID is required." });
    }

    try {
        const targetSubId = resolveToObjectId(submissionId);
        let submission = null;
        if (dbState.useMongo) {
            if (mongoose.Types.ObjectId.isValid(targetSubId)) {
                submission = await TestSubmissionModel.findById(targetSubId);
            }
            if (!submission && mongoose.Types.ObjectId.isValid(submissionId)) {
                submission = await TestSubmissionModel.findById(submissionId);
            }
            if (!submission) {
                submission = await TestSubmissionModel.findOne({
                    $or: [{ _id: targetSubId }, { id: targetSubId }, { _id: submissionId }, { id: submissionId }]
                });
            }
        } else {
            const db = getJSONData();
            submission = (db.testSubmissions || []).find(s => 
                String(s._id || s.id) === String(targetSubId) || 
                String(s._id || s.id) === String(submissionId) ||
                toBicsId(s._id || s.id) === submissionId
            );
        }

        if (!submission) {
            return res.status(404).json({ error: "Submission not found." });
        }

        const studentId = submission.studentId || reqStudentId || 'Candidate';
        const candidateName = submission.candidateName || 'Candidate';
        const testTitle = submission.testTitle || 'BICS Examination';

        if (answers && Array.isArray(answers) && answers.length > 0) {
            submission.answers = answers;
        }
        if (proctoringLog) {
            submission.proctoringLog = proctoringLog;
        }

        const dbPayloadObj = {
            submissionId: String(submission._id || submission.id),
            studentId,
            candidateName,
            testTitle,
            answers: submission.answers || [],
            proctoringLog: submission.proctoringLog || {},
            generatedAt: new Date().toISOString()
        };

        const encryptedPayload = encryptEirfPayload(dbPayloadObj, studentId, String(submission._id || submission.id));
        submission.encryptedDbPayload = encryptedPayload;
        submission.hasEirfFlag = true;
        if (!submission.eirfStatus || submission.eirfStatus === 'none') {
            submission.eirfStatus = 'pending';
        }

        if (dbState.useMongo) {
            await submission.save();
        } else {
            const db = getJSONData();
            const idx = (db.testSubmissions || []).findIndex(s => String(s._id || s.id) === String(submissionId));
            if (idx !== -1) {
                db.testSubmissions[idx] = submission;
                saveJSONData(db);
            }
        }

        return res.json({
            success: true,
            submissionId: String(submission._id || submission.id),
            encryptedPayload,
            payloadFileName: `EIRF_PAYLOAD_${submission._id || submission.id}.eirf`
        });
    } catch (e) {
        console.error("Generate EIRF payload error:", e);
        return res.status(500).json({ error: e.message });
    }
});

// 3. Submit EIRF Incident Report & Verify Encrypted Local Payload (.eirf)
router.post('/test/eirf/submit', async (req, res) => {
    const {
        submissionId,
        primaryCause,
        detailedExplanation,
        technicalContext,
        additionalAnswers,
        formAnswers,
        encryptedPayload,
        encryptedPayloadFile,
        payloadFileName,
        eirfFileName
    } = req.body;

    if (!submissionId || !primaryCause || !detailedExplanation) {
        return res.status(400).json({ error: "Missing required fields: submissionId, primaryCause, and detailedExplanation are required." });
    }

    try {
        const targetSubId = resolveToObjectId(submissionId);
        let submission = null;
        let candidate = null;
        let testConfig = null;

        if (dbState.useMongo) {
            if (mongoose.Types.ObjectId.isValid(targetSubId)) {
                submission = await TestSubmissionModel.findById(targetSubId);
            }
            if (!submission && mongoose.Types.ObjectId.isValid(submissionId)) {
                submission = await TestSubmissionModel.findById(submissionId);
            }
            if (!submission) {
                submission = await TestSubmissionModel.findOne({
                    $or: [{ _id: targetSubId }, { id: targetSubId }, { _id: submissionId }, { id: submissionId }]
                });
            }
            if (submission) {
                candidate = await CandidateModel.findById(submission.candidateId).lean();
                testConfig = await TestConfigModel.findById(submission.testId).lean();
            }
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submission = db.testSubmissions.find(s => 
                String(s._id || s.id) === String(targetSubId) || 
                String(s._id || s.id) === String(submissionId) ||
                toBicsId(s._id || s.id) === submissionId
            );
            if (submission) {
                candidate = (db.candidates || []).find(c => String(c._id || c.id) === String(submission.candidateId) || c.studentId === submission.studentId);
                testConfig = (db.tests || []).find(t => String(t._id || t.id) === String(submission.testId));
            }
        }

        if (!submission) {
            return res.status(404).json({ error: "Examination submission record not found." });
        }

        // Strict 45-Minute Token Authorization Gate
        const providedToken = req.body.token || req.query.token || req.headers['x-eirf-token'] || req.user?.eirfToken;
        const isAdmin = Boolean(
            req.user?.role === 'admin' ||
            req.headers['x-admin-role'] === 'admin' ||
            req.session?.admin
        );

        const isTokenMatch = Boolean(
            submission.eirfToken &&
            providedToken &&
            String(providedToken).trim() === String(submission.eirfToken).trim()
        );

        if (!isAdmin && !isTokenMatch) {
            return res.status(403).json({
                error: "Invalid or missing EIRF authorization token. Access denied.",
                invalidToken: true
            });
        }

        const submittedAt = submission.submittedAt || submission.startedAt || new Date();
        const expiresAt = submission.eirfExpiresAt || new Date(new Date(submittedAt).getTime() + 45 * 60 * 1000);
        const isExpired = Date.now() > new Date(expiresAt).getTime() || submission.pipelineStatus === 'EXPIRED';

        if (!isAdmin && isExpired) {
            return res.status(410).json({
                error: "The Emergency Incident Report Form (EIRF) 45-minute submission window has expired.",
                isExpired: true
            });
        }

        const studentId = submission.studentId || candidate?.studentId || 'Candidate';
        const candidateName = submission.candidateName || candidate?.name || 'Candidate';
        const testTitle = submission.testTitle || testConfig?.title || 'BICS Examination';

        const rawPayload = encryptedPayload || encryptedPayloadFile;
        const rawFileName = payloadFileName || eirfFileName || 'local_backup.eirf';

        let verificationStatus = 'PAYLOAD_MISSING';
        let verificationDetails = {
            answersMatch: true,
            clientHashMatch: true,
            discrepancies: []
        };
        let decryptedData = null;
        let dbDecryptedData = null;

        if (rawPayload) {
            decryptedData = decryptEirfPayload(rawPayload, studentId, submissionId);
            if (!decryptedData) {
                verificationStatus = 'DECRYPTION_FAILED';
                verificationDetails.discrepancies.push('Failed to decrypt local payload using system secret key.');
            }
        }

        if (submission.encryptedDbPayload) {
            dbDecryptedData = decryptEirfPayload(submission.encryptedDbPayload, studentId, submissionId);
        }
        if (!dbDecryptedData) {
            dbDecryptedData = {
                submissionId: String(submission._id || submission.id),
                studentId,
                candidateName,
                testTitle,
                answers: submission.answers || [],
                proctoringLog: submission.proctoringLog || {},
                generatedAt: submission.submittedAt || new Date().toISOString()
            };
            submission.encryptedDbPayload = encryptEirfPayload(dbDecryptedData, studentId, submissionId);
            if (dbState.useMongo) {
                await submission.save();
            }
        }

        if (decryptedData && dbDecryptedData) {
            verificationStatus = 'VERIFIED_MATCH';

            if (decryptedData.answers && Array.isArray(decryptedData.answers)) {
                const dbAnswersMap = new Map();
                (dbDecryptedData.answers || []).forEach(a => dbAnswersMap.set(String(a.questionId), a));

                decryptedData.answers.forEach(clAns => {
                    const dbAns = dbAnswersMap.get(String(clAns.questionId));
                    if (!dbAns) {
                        verificationDetails.discrepancies.push(`Question ${clAns.questionId}: Answer present in local payload but missing from server record.`);
                        verificationStatus = 'DISCREPANCY_FLAGGED';
                    } else if (clAns.type === 'mcq' && Number(clAns.selectedOptionIndex) !== Number(dbAns.selectedOptionIndex)) {
                        verificationDetails.discrepancies.push(`MCQ Question ${clAns.questionId}: Local selection (${clAns.selectedOptionIndex}) differs from server saved selection (${dbAns.selectedOptionIndex}).`);
                        verificationStatus = 'DISCREPANCY_FLAGGED';
                    } else if (clAns.type === 'coding' && (clAns.submittedCode || '').trim() !== (dbAns.submittedCode || '').trim()) {
                        verificationDetails.discrepancies.push(`Coding Question ${clAns.questionId}: Local code snapshot differs from server saved code.`);
                        verificationStatus = 'DISCREPANCY_FLAGGED';
                    }
                });
            }

            if (decryptedData.proctoringLog && dbDecryptedData.proctoringLog) {
                const clLog = decryptedData.proctoringLog;
                const dbLog = dbDecryptedData.proctoringLog;
                if (Number(clLog.fullscreenExits || 0) !== Number(dbLog.fullscreenExits || 0)) {
                    verificationDetails.discrepancies.push(`Proctoring Telemetry: Local fullscreen exit count (${clLog.fullscreenExits || 0}) differs from server record (${dbLog.fullscreenExits || 0}).`);
                    verificationStatus = 'DISCREPANCY_FLAGGED';
                }
                if (Number(clLog.tabSwitches || 0) !== Number(dbLog.tabSwitches || 0)) {
                    verificationDetails.discrepancies.push(`Proctoring Telemetry: Local tab switch count (${clLog.tabSwitches || 0}) differs from server record (${dbLog.tabSwitches || 0}).`);
                    verificationStatus = 'DISCREPANCY_FLAGGED';
                }
            }

            verificationDetails.answersMatch = verificationDetails.discrepancies.length === 0;
        }

        const useCloudinary = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
        if (rawPayload && useCloudinary) {
            try {
                const payloadBuffer = Buffer.from(typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload), 'utf8');
                await uploadToCloudinary(payloadBuffer, 'BICS_2026/eirf_payloads', 'raw');
            } catch (cErr) {
                console.warn("Cloudinary EIRF payload upload failed, falling back to local snapshot:", cErr.message);
            }
        }

        const reportId = generateEirfReportId();

        const rawIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                       req.socket?.remoteAddress || 
                       req.ip || 
                       '127.0.0.1';
        const cleanIp = rawIp.replace(/^::ffff:/, '');

        let extractedProofUrl = req.body.uploadedProofUrl || req.body.proofUrl || '';
        if (!extractedProofUrl && formAnswers && typeof formAnswers === 'object') {
            for (const val of Object.values(formAnswers)) {
                if (val && typeof val === 'object' && val.fileUrl) {
                    extractedProofUrl = val.fileUrl;
                    break;
                }
            }
        }

        const mergedTechContext = {
            ...(technicalContext || {}),
            ip: cleanIp,
            submittedAt: new Date().toISOString()
        };

        const reportData = {
            reportId,
            submissionId: String(submission._id || submission.id),
            candidateId: String(submission.candidateId),
            studentId,
            candidateName,
            testId: String(submission.testId),
            testTitle,
            proctoringLogSnapshot: {
                fullscreenExits: submission.proctoringLog?.fullscreenExits || 0,
                tabSwitches: submission.proctoringLog?.tabSwitches || 0,
                events: (submission.proctoringLog?.events || []).map(ev => {
                    const eObj = ev.toObject ? ev.toObject() : { ...ev };
                    return {
                        timestamp: eObj.timestamp || new Date(),
                        startTime: eObj.startTime || null,
                        endTime: eObj.endTime || null,
                        durationSeconds: Number(eObj.durationSeconds || 0),
                        type: String(eObj.type || ''),
                        details: String(eObj.details || '')
                    };
                })
            },
            primaryCause,
            detailedExplanation,
            technicalContext: mergedTechContext,
            additionalAnswers: additionalAnswers || {},
            formAnswers: formAnswers || {},
            uploadedProofUrl: extractedProofUrl,
            encryptedPayloadUploaded: !!rawPayload,
            payloadFileName: rawFileName,
            verificationStatus,
            verificationDetails,
            status: 'pending_review',
            pipelineStatus: 'EIRF_SUBMITTED',
            submittedAt: new Date(),
            filedAt: new Date(),
            expiresAt
        };

        if (dbState.useMongo) {
            await EIRFReportModel.findOneAndUpdate(
                { submissionId: String(submission._id || submission.id) },
                reportData,
                { upsert: true, new: true }
            );
            submission.hasEirfFlag = true;
            submission.eirfStatus = verificationStatus === 'DISCREPANCY_FLAGGED' ? 'discrepancy' : 'pending';
            submission.pipelineStatus = 'EIRF_SUBMITTED';
            submission.eirfReportId = reportId;
            if (extractedProofUrl) {
                submission.eirfProofUrl = extractedProofUrl;
            }
            await submission.save();
        } else {
            const db = getJSONData();
            db.eirfReports = db.eirfReports || [];
            const idx = db.eirfReports.findIndex(r => String(r.submissionId) === String(submissionId));
            if (idx !== -1) {
                db.eirfReports[idx] = reportData;
            } else {
                db.eirfReports.push(reportData);
            }
            submission.hasEirfFlag = true;
            submission.eirfStatus = verificationStatus === 'DISCREPANCY_FLAGGED' ? 'discrepancy' : 'pending';
            submission.pipelineStatus = 'EIRF_SUBMITTED';
            submission.eirfReportId = reportId;
            if (extractedProofUrl) {
                submission.eirfProofUrl = extractedProofUrl;
            }
            saveJSONData(db);
        }

        // Trigger sequential pipeline worker Step 3 (confirmation email -> advance to UNDER_REVIEW)
        setImmediate(() => {
            runPipelineTick().catch(err => {
                console.error("[EIRF_PIPELINE] Asynchronous EIRF submit trigger error:", err);
            });
        });

        await logSystemAction(
            studentId,
            'EIRF_REPORT_SUBMITTED',
            `Student ${studentId} filed Emergency Incident Report ${reportId} for test "${testTitle}". Payload Status: ${verificationStatus}`,
            'info'
        );

        return res.json({
            success: true,
            message: "Emergency Incident Report submitted successfully.",
            reportId,
            verificationStatus
        });
    } catch (e) {
        console.error("EIRF submit error:", e);
        return res.status(500).json({ error: e.message });
    }
});

// 4. Admin: List All EIRF Reports & Flagged Examination Incidents
router.get('/admin/eirf/list', requireAdmin, async (req, res) => {
    try {
        let reports = [];
        let flaggedSubmissions = [];

        if (dbState.useMongo) {
            reports = await EIRFReportModel.find()
                .select('-decryptedPayloadSnapshot -proctoringLogSnapshot')
                .sort({ submittedAt: -1 })
                .lean();

            flaggedSubmissions = await TestSubmissionModel.find({
                $or: [
                    { hasEirfFlag: true },
                    { eirfStatus: { $in: ['pending', 'discrepancy', 'approved', 'rejected'] } },
                    { pipelineStatus: { $in: ['FLAGGED', 'GENERATING_QUESTIONS', 'QUESTIONS_GENERATED', 'SENDING_INVITE_EMAIL', 'AWAITING_EIRF', 'EIRF_SUBMITTED', 'SENDING_CONFIRMATION_EMAIL', 'UNDER_REVIEW', 'EXPIRED', 'VERDICT_ISSUED'] } }
                ]
            }).sort({ submittedAt: -1 }).lean();
        } else {
            const db = getJSONData();
            db.eirfReports = db.eirfReports || [];
            reports = db.eirfReports.map(({ decryptedPayloadSnapshot, proctoringLogSnapshot, ...rest }) => rest);
            db.testSubmissions = db.testSubmissions || [];
            flaggedSubmissions = db.testSubmissions.filter(s => 
                s.hasEirfFlag ||
                ['pending', 'discrepancy', 'approved', 'rejected'].includes(s.eirfStatus) ||
                ['FLAGGED', 'GENERATING_QUESTIONS', 'QUESTIONS_GENERATED', 'SENDING_INVITE_EMAIL', 'AWAITING_EIRF', 'EIRF_SUBMITTED', 'SENDING_CONFIRMATION_EMAIL', 'UNDER_REVIEW', 'EXPIRED', 'VERDICT_ISSUED'].includes(s.pipelineStatus)
            );
        }

        const reportBySubId = new Map();
        reports.forEach(r => {
            if (r.submissionId) {
                reportBySubId.set(String(r.submissionId), r);
                reportBySubId.set(String(resolveToObjectId(r.submissionId)), r);
            }
        });

        const mergedMap = new Map();

        // 1. Populate from flagged submissions
        flaggedSubmissions.forEach(sub => {
            const rawSubId = String(sub._id || sub.id);
            const bicsId = toBicsId(rawSubId);
            const rep = reportBySubId.get(rawSubId) || (sub.eirfReportId ? reports.find(r => r.reportId === sub.eirfReportId) : null);

            let maxFullscreenSeconds = 0;
            let maxTabSwitchSeconds = 0;
            (sub.proctoringLog?.events || []).forEach(ev => {
                let dur = Number(ev.durationSeconds || 0);
                if (!dur && ev.details) {
                    const m1 = ev.details.match(/for\s+(\d+)\s+seconds/i);
                    const m2 = ev.details.match(/Max:\s*(\d+)s/i);
                    const m3 = ev.details.match(/after\s+(\d+)\s+seconds/i);
                    if (m1) dur = parseInt(m1[1], 10);
                    else if (m2) dur = parseInt(m2[1], 10);
                    else if (m3) dur = parseInt(m3[1], 10);
                }
                const t = (ev.type || '').toUpperCase();
                if (t.includes('FULLSCREEN')) {
                    maxFullscreenSeconds = Math.max(maxFullscreenSeconds, dur);
                } else if (t.includes('TAB')) {
                    maxTabSwitchSeconds = Math.max(maxTabSwitchSeconds, dur);
                }
            });

            const isExpired = (sub.eirfExpiresAt && new Date(sub.eirfExpiresAt) < new Date()) || sub.pipelineStatus === 'EXPIRED';
            const pipelineStatus = rep?.status === 'approved' || rep?.status === 'rejected' || sub.pipelineStatus === 'VERDICT_ISSUED'
                ? 'VERDICT_ISSUED'
                : (rep ? (rep.pipelineStatus || 'UNDER_REVIEW') : (isExpired ? 'EXPIRED' : (sub.pipelineStatus || 'AWAITING_EIRF')));

            let triggerViolation = 'Proctoring Warning Threshold';
            if (maxFullscreenSeconds > 5) {
                triggerViolation = `Fullscreen Exit (${maxFullscreenSeconds}s)`;
            } else if (maxTabSwitchSeconds > 5) {
                triggerViolation = `Tab Switch (${maxTabSwitchSeconds}s)`;
            } else if ((sub.proctoringLog?.warnings || 0) >= 3) {
                triggerViolation = `3 Proctor Compliance Strikes`;
            }

            mergedMap.set(rawSubId, {
                _id: rep?._id || rawSubId,
                reportId: rep?.reportId || sub.eirfReportId || 'Pending Filing',
                submissionId: bicsId,
                rawSubmissionId: rawSubId,
                bicsId,
                candidateName: sub.candidateName || rep?.candidateName || 'Candidate',
                studentId: sub.studentId || rep?.studentId || 'N/A',
                testTitle: sub.testTitle || rep?.testTitle || 'Online Assessment',
                testId: sub.testId,
                submittedAt: sub.submittedAt,
                eirfSubmittedAt: rep?.submittedAt || null,
                expiresAt: sub.eirfExpiresAt || rep?.expiresAt || null,
                isExpired,
                pipelineStatus,
                status: rep?.status || (pipelineStatus === 'EXPIRED' ? 'expired' : (sub.eirfStatus || 'pending_filing')),
                eirfStatus: sub.eirfStatus || rep?.status || (pipelineStatus === 'EXPIRED' ? 'expired' : 'pending'),
                verificationStatus: rep?.verificationStatus || (rep ? 'PENDING' : 'AWAITING_STUDENT'),
                primaryCause: rep?.primaryCause || (pipelineStatus === 'EXPIRED' ? 'Filing Expired (45 min statutory window elapsed)' : 'Awaiting Candidate Incident Report'),
                triggerViolation,
                maxFullscreenSeconds,
                maxTabSwitchSeconds,
                uploadedProofUrl: rep?.uploadedProofUrl || sub.eirfProofUrl || '',
                pdfUrl: rep?.pdfUrl || '',
                hasEirfFlag: true
            });
        });

        // 2. Add reports not matched directly by submission ID
        reports.forEach(rep => {
            const rawSubId = String(rep.submissionId || rep.reportId);
            if (!mergedMap.has(rawSubId)) {
                const bicsId = toBicsId(rawSubId);
                mergedMap.set(rawSubId, {
                    _id: rep._id,
                    reportId: rep.reportId,
                    submissionId: bicsId,
                    rawSubmissionId: rawSubId,
                    bicsId,
                    candidateName: rep.candidateName || 'Candidate',
                    studentId: rep.studentId || 'N/A',
                    testTitle: rep.testTitle || 'Online Assessment',
                    testId: rep.testId,
                    submittedAt: rep.submittedAt,
                    eirfSubmittedAt: rep.submittedAt,
                    expiresAt: rep.expiresAt,
                    isExpired: false,
                    pipelineStatus: rep.status === 'approved' || rep.status === 'rejected' ? 'VERDICT_ISSUED' : (rep.pipelineStatus || 'UNDER_REVIEW'),
                    status: rep.status || 'pending_review',
                    eirfStatus: rep.status || 'pending',
                    verificationStatus: rep.verificationStatus || 'PENDING',
                    primaryCause: rep.primaryCause || 'Incident Flagged',
                    triggerViolation: rep.flaggedReasons?.[0] || 'Proctoring Telemetry Alert',
                    maxFullscreenSeconds: 0,
                    maxTabSwitchSeconds: 0,
                    uploadedProofUrl: rep.uploadedProofUrl || '',
                    pdfUrl: rep.pdfUrl || '',
                    hasEirfFlag: true
                });
            }
        });

        const list = Array.from(mergedMap.values()).sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
        return res.json(list);
    } catch (e) {
        console.error("Admin EIRF list error:", e);
        return res.status(500).json({ error: e.message });
    }
});

// 5. Admin: Approve or Reject EIRF Incident Report
router.post('/admin/eirf/action/:reportId', requireAdmin, async (req, res) => {
    const { reportId } = req.params;
    let { status, action, adminRemarks, courseCode, courseName, resolutionCategory, remediationAction, reviewerName, reviewerTitle } = req.body;

    let rawStatus = (status || action || '').toLowerCase().trim();
    if (rawStatus === 'approve') rawStatus = 'approved';
    if (rawStatus === 'reject') rawStatus = 'rejected';

    if (!['approved', 'rejected'].includes(rawStatus)) {
        return res.status(400).json({ error: "Invalid status parameter. Must be 'approved' or 'rejected'." });
    }

    status = rawStatus;
    const finalCourseCode = courseCode || 'R526CS01T';
    const finalCourseName = courseName || 'Introduction to Computer Science';
    const finalResolutionCategory = resolutionCategory || (status === 'approved' ? 'Technical Glitch / Environmental Disruption' : 'Unexplained Window Deviation Confirmed');
    const finalRemediationAction = remediationAction || (status === 'approved' ? 'Provisional Assessment Restored & Validated' : 'Examination Score Annulled (Zero Points)');
    const finalReviewerName = reviewerName || 'Academic Integrity Board Convener';
    const finalReviewerTitle = reviewerTitle || 'Convener, Examination Disciplinary Committee';

    try {
        let report = null;
        let submission = null;

        if (dbState.useMongo) {
            const query = mongoose.Types.ObjectId.isValid(reportId)
                ? { $or: [{ _id: reportId }, { reportId }, { submissionId: reportId }] }
                : { $or: [{ reportId }, { submissionId: reportId }] };
            report = await EIRFReportModel.findOne(query);
            if (!report) {
                return res.status(404).json({ error: "EIRF Incident Report not found." });
            }
            report.status = status;
            report.pipelineStatus = 'VERDICT_ISSUED';
            report.adminRemarks = adminRemarks || '';
            report.courseCode = finalCourseCode;
            report.courseName = finalCourseName;
            report.resolutionCategory = finalResolutionCategory;
            report.remediationAction = finalRemediationAction;
            report.reviewerName = finalReviewerName;
            report.reviewerTitle = finalReviewerTitle;
            report.reviewedAt = new Date();
            report.reviewedBy = finalReviewerName;
            await report.save();

            submission = await TestSubmissionModel.findById(report.submissionId);
            if (submission) {
                const subUpdate = {
                    eirfStatus: status,
                    pipelineStatus: 'VERDICT_ISSUED',
                    ...(status === 'approved' ? { verificationStatus: 'released' } : {}),
                    ...(status === 'rejected' ? {
                        verificationStatus: 'annulled',
                        'evaluation.mcqScore': 0,
                        'evaluation.codingScore': 0,
                        'evaluation.totalScore': 0,
                        'evaluation.percentage': 0,
                        'evaluation.adminRemarks': `Annulled by Committee: ${finalResolutionCategory} (${finalRemediationAction})`
                    } : {})
                };
                await TestSubmissionModel.updateOne({ _id: submission._id }, { $set: subUpdate });
                submission = await TestSubmissionModel.findById(submission._id);
            }
        } else {
            const db = getJSONData();
            db.eirfReports = db.eirfReports || [];
            const idx = db.eirfReports.findIndex(r => String(r.reportId) === String(reportId) || String(r._id) === String(reportId));
            if (idx === -1) {
                return res.status(404).json({ error: "EIRF Incident Report not found." });
            }
            db.eirfReports[idx].status = status;
            db.eirfReports[idx].pipelineStatus = 'VERDICT_ISSUED';
            db.eirfReports[idx].adminRemarks = adminRemarks || '';
            db.eirfReports[idx].courseCode = finalCourseCode;
            db.eirfReports[idx].courseName = finalCourseName;
            db.eirfReports[idx].resolutionCategory = finalResolutionCategory;
            db.eirfReports[idx].remediationAction = finalRemediationAction;
            db.eirfReports[idx].reviewerName = finalReviewerName;
            db.eirfReports[idx].reviewerTitle = finalReviewerTitle;
            db.eirfReports[idx].reviewedAt = new Date().toISOString();
            db.eirfReports[idx].reviewedBy = finalReviewerName;
            report = db.eirfReports[idx];

            db.testSubmissions = db.testSubmissions || [];
            const subIdx = db.testSubmissions.findIndex(s => String(s._id || s.id) === String(report.submissionId));
            if (subIdx !== -1) {
                db.testSubmissions[subIdx].eirfStatus = status;
                db.testSubmissions[subIdx].pipelineStatus = 'VERDICT_ISSUED';
                if (status === 'approved') {
                    db.testSubmissions[subIdx].verificationStatus = 'released';
                } else if (status === 'rejected') {
                    db.testSubmissions[subIdx].verificationStatus = 'annulled';
                    if (db.testSubmissions[subIdx].evaluation) {
                        db.testSubmissions[subIdx].evaluation.mcqScore = 0;
                        db.testSubmissions[subIdx].evaluation.codingScore = 0;
                        db.testSubmissions[subIdx].evaluation.totalScore = 0;
                        db.testSubmissions[subIdx].evaluation.percentage = 0;
                        db.testSubmissions[subIdx].evaluation.adminRemarks = `Annulled by Committee: ${finalResolutionCategory} (${finalRemediationAction})`;
                    }
                }
                submission = db.testSubmissions[subIdx];
            }
            saveJSONData(db);
        }

        await logSystemAction(
            'admin',
            'EIRF_ACTION',
            `Admin set EIRF Report ${reportId} status to ${status.toUpperCase()} for course ${finalCourseCode}. Remarks: "${adminRemarks || 'N/A'}"`,
            'info'
        );

        res.json({ success: true, report, message: `EIRF Incident Report ${reportId} marked as ${status.toUpperCase()}.` });

        // Non-blocking background worker
        (async () => {
            try {
                let candidateObj = null;
                let testObj = null;

                if (dbState.useMongo) {
                    if (submission && submission.candidateId) {
                        candidateObj = await CandidateModel.findById(submission.candidateId);
                    }
                    if (submission && submission.testId) {
                        testObj = await TestConfigModel.findById(submission.testId);
                    }
                } else {
                    const db = getJSONData();
                    if (submission) {
                        candidateObj = (db.candidates || []).find(c => c.studentId === submission.studentId || c.id === submission.candidateId);
                        testObj = (db.tests || []).find(t => String(t.id || t._id) === String(submission.testId));
                    }
                }

                const studentId = report.studentId || candidateObj?.studentId || submission?.studentId || '2026002';
                const candidateEmail = candidateObj?.registrationData?.collegeEmail || candidateObj?.registrationData?.personalEmail || candidateObj?.email || submission?.candidateEmail || 'candidate@bics.edu';
                const candidateName = submission?.candidateName || candidateObj?.name || 'Candidate';
                const examTitleStr = `${finalCourseCode} - ${finalCourseName} (${submission?.testTitle || 'Examination'})`;

                const digitalHash = generateDigitalVerdictHash(
                    report.submissionId || reportId,
                    studentId,
                    report.reportId || reportId,
                    report.reviewedAt
                );

                const targetReportId = report.reportId || reportId;
                const proxyUrl = `https://bicsportal.netlify.app/media/eirf/${targetReportId}.pdf`;
                const deadlineDateStr = formatISTDate(new Date(Date.now() + 48 * 60 * 60 * 1000));

                const pdfBuffer = await generateEirfVerdictPdfBuffer({
                    report,
                    submission,
                    test: testObj,
                    candidate: candidateObj,
                    courseCode: finalCourseCode,
                    courseName: finalCourseName,
                    adminRemarks: adminRemarks || 'Standard academic committee evaluation recorded.',
                    resolutionCategory: finalResolutionCategory,
                    remediationAction: finalRemediationAction,
                    reviewerName: finalReviewerName,
                    reviewerTitle: finalReviewerTitle,
                    pdfProxyUrl: proxyUrl,
                    digitalHash,
                    deadlineDateStr
                });

                let pdfCloudinaryPublicId = `BICS_2026/eirf/${targetReportId}.pdf`;
                let finalPdfUrl = proxyUrl;
                const useCloudinary = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

                if (useCloudinary) {
                    try {
                        const uploadedUrl = await uploadToCloudinary(pdfBuffer, 'BICS_2026/eirf', 'raw', `${targetReportId}.pdf`);
                        if (uploadedUrl) {
                            if (uploadedUrl.startsWith('http')) {
                                finalPdfUrl = uploadedUrl;
                            } else {
                                finalPdfUrl = `https://bicsportal.netlify.app${uploadedUrl}`;
                            }
                        }
                    } catch (cErr) {
                        console.warn("[EIRF_PDF_UPLOAD_WARN]: Cloudinary PDF stream failed, keeping proxy URL:", cErr.message);
                    }
                }

                const cleanupDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000);
                if (dbState.useMongo) {
                    report.pdfUrl = finalPdfUrl;
                    report.pdfCloudinaryPublicId = pdfCloudinaryPublicId;
                    report.digitalHash = digitalHash;
                    report.scheduledCleanupAt = cleanupDeadline;
                    report.pdfDeletedFromCloudinary = false;
                    await report.save();
                } else {
                    const db = getJSONData();
                    const idx = (db.eirfReports || []).findIndex(r => String(r.reportId) === String(report.reportId));
                    if (idx !== -1) {
                        db.eirfReports[idx].pdfUrl = finalPdfUrl;
                        db.eirfReports[idx].pdfCloudinaryPublicId = pdfCloudinaryPublicId;
                        db.eirfReports[idx].digitalHash = digitalHash;
                        db.eirfReports[idx].scheduledCleanupAt = cleanupDeadline.toISOString();
                        db.eirfReports[idx].pdfDeletedFromCloudinary = false;
                        saveJSONData(db);
                    }
                }

                // Dispatch Brevo verdict email with 2-page verdict PDF directly attached
                try {
                    const verdictOptions = {
                        adminRemarks,
                        resolutionCategory: finalResolutionCategory,
                        remediationAction: finalRemediationAction,
                        reviewerName: finalReviewerName,
                        courseCode: finalCourseCode,
                        courseName: finalCourseName
                    };
                    if (status === 'approved') {
                        await sendEirfVerdictApprovedEmail(report._id || report.reportId || reportId, verdictOptions);
                    } else if (status === 'rejected') {
                        await sendEirfVerdictRejectedEmail(report._id || report.reportId || reportId, verdictOptions);
                    }
                } catch (brevoErr) {
                    console.error("[EIRF_BREVO_VERDICT_ERROR]:", brevoErr.message);
                    // Legacy fallback
                    await sendEirfVerdictEmail(
                        candidateEmail,
                        candidateName,
                        examTitleStr,
                        status,
                        adminRemarks,
                        finalPdfUrl,
                        { studentId, submissionId: report.submissionId }
                    ).catch(() => {});
                }

                console.log(`[EIRF_BACKGROUND_PIPELINE]: Verdict PDF generated, uploaded & email dispatched for ${report.reportId}. Proxy URL: ${finalPdfUrl}`);
            } catch (bgErr) {
                console.error("[EIRF_BACKGROUND_PIPELINE_ERROR]:", bgErr);
            }
        })();

    } catch (e) {
        console.error("Admin EIRF action error:", e);
        return res.status(500).json({ error: e.message });
    }
});

// Helper: Stream on-demand cryptographically signed BICS Verdict PDF
async function streamVerdictPdfForReport(reportId, res) {
    try {
        let report = null;
        let submission = null;
        let candidate = null;
        let testConfig = null;

        const targetId = resolveToObjectId(reportId);

        if (dbState.useMongo) {
            const query = mongoose.Types.ObjectId.isValid(targetId)
                ? { $or: [{ _id: targetId }, { reportId: String(reportId) }, { submissionId: String(targetId) }, { submissionId: String(reportId) }] }
                : { $or: [{ reportId: String(reportId) }, { submissionId: String(targetId) }, { submissionId: String(reportId) }] };
            report = await EIRFReportModel.findOne(query).lean();

            if (!report) {
                submission = await TestSubmissionModel.findOne({
                    $or: [{ _id: targetId }, { id: targetId }, { _id: reportId }, { id: reportId }]
                }).lean();
                if (submission) {
                    report = await EIRFReportModel.findOne({
                        $or: [{ submissionId: String(submission._id || submission.id) }, { reportId: String(reportId) }]
                    }).lean();
                }
            } else if (report.submissionId) {
                submission = await TestSubmissionModel.findById(resolveToObjectId(report.submissionId)).lean();
            }

            if (submission) {
                candidate = await CandidateModel.findById(submission.candidateId).lean();
                testConfig = await TestConfigModel.findById(submission.testId).lean();
            }
        } else {
            const db = getJSONData();
            db.eirfReports = db.eirfReports || [];
            report = db.eirfReports.find(r => 
                String(r.reportId) === String(reportId) || 
                String(r._id) === String(reportId) || 
                String(r.submissionId) === String(targetId) ||
                String(r.submissionId) === String(reportId)
            );

            db.testSubmissions = db.testSubmissions || [];
            if (!report) {
                submission = db.testSubmissions.find(s => 
                    String(s._id || s.id) === String(targetId) || 
                    String(s._id || s.id) === String(reportId) ||
                    toBicsId(s._id || s.id) === reportId
                );
                if (submission) {
                    report = db.eirfReports.find(r => String(r.submissionId) === String(submission._id || submission.id));
                }
            } else if (report.submissionId) {
                submission = db.testSubmissions.find(s => String(s._id || s.id) === String(resolveToObjectId(report.submissionId)));
            }

            if (submission) {
                candidate = (db.candidates || []).find(c => String(c._id || c.id) === String(submission.candidateId) || c.studentId === submission.studentId);
                testConfig = (db.tests || []).find(t => String(t._id || t.id) === String(submission.testId));
            }
        }

        if (!report && !submission) {
            return res.status(404).json({ error: 'Official EIRF record or examination submission not found.' });
        }

        const status = (report?.status || submission?.eirfStatus || 'approved').toLowerCase();
        const finalCourseCode = report?.courseCode || 'R526CS01T';
        const finalCourseName = report?.courseName || testConfig?.title || 'Academic Assessment';
        const finalResolutionCategory = report?.resolutionCategory || (status === 'approved' ? 'Technical Glitch / Environmental Disruption' : 'Unexplained Window Deviation Confirmed');
        const finalRemediationAction = report?.remediationAction || (status === 'approved' ? 'Provisional Assessment Restored & Validated' : 'Examination Score Annulled (Zero Points)');
        const finalReviewerName = report?.reviewerName || 'Academic Integrity Board Convener';
        const finalReviewerTitle = report?.reviewerTitle || 'Convener, Examination Disciplinary Committee';
        const finalRemarks = report?.adminRemarks || 'Standard academic disciplinary committee evaluation.';

        const studentId = report?.studentId || candidate?.studentId || submission?.studentId || '2026002';
        const targetReportId = report?.reportId || `EIRF-2026-${String(reportId).slice(-6).toUpperCase()}`;

        const digitalHash = report?.digitalHash || generateDigitalVerdictHash(
            report?.submissionId || submission?._id || reportId,
            studentId,
            targetReportId,
            report?.reviewedAt || new Date()
        );

        const proxyUrl = `https://bicsportal.netlify.app/media/eirf/${targetReportId}.pdf`;
        const deadlineDateStr = formatISTDate(new Date(Date.now() + 48 * 60 * 60 * 1000));

        const pdfBuffer = await generateEirfVerdictPdfBuffer({
            report: report || { reportId: targetReportId, status, studentId, candidateName: submission?.candidateName },
            submission,
            test: testConfig,
            candidate,
            courseCode: finalCourseCode,
            courseName: finalCourseName,
            adminRemarks: finalRemarks,
            resolutionCategory: finalResolutionCategory,
            remediationAction: finalRemediationAction,
            reviewerName: finalReviewerName,
            reviewerTitle: finalReviewerTitle,
            pdfProxyUrl: proxyUrl,
            digitalHash,
            deadlineDateStr
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="BICS_Verdict_${targetReportId}.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.send(pdfBuffer);
    } catch (err) {
        console.error('[EIRF Verdict PDF Generation Error]:', err);
        return res.status(500).json({ error: 'Failed to generate signed verdict PDF: ' + err.message });
    }
}

// 6. Admin & Student On-Demand Verdict PDF Endpoints
router.get('/admin/eirf/verdict-pdf/:reportId', requireAdmin, async (req, res) => {
    return streamVerdictPdfForReport(req.params.reportId, res);
});

router.get('/test/eirf/verdict-pdf/:reportId', async (req, res) => {
    return streamVerdictPdfForReport(req.params.reportId, res);
});

// 48-Hour Cloudinary Auto-Deletion Cleanup Routine
const cleanupExpiredEirfPdfs = async () => {
    try {
        const now = new Date();
        const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);
        const useCloudinary = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

        if (dbState.useMongo) {
            const expiredReports = await EIRFReportModel.find({
                status: { $in: ['approved', 'rejected'] },
                pdfDeletedFromCloudinary: { $ne: true },
                reviewedAt: { $lte: cutoff }
            });

            for (const report of expiredReports) {
                if (useCloudinary && report.pdfCloudinaryPublicId) {
                    try {
                        await cloudinary.uploader.destroy(report.pdfCloudinaryPublicId, { resource_type: 'raw' });
                        console.log(`[CLOUDINARY_CLEANUP]: Auto-deleted expired EIRF verdict PDF ${report.pdfCloudinaryPublicId} after 48-hour deadline.`);
                    } catch (cErr) {
                        console.error(`[CLOUDINARY_CLEANUP_ERROR]: Failed to delete ${report.pdfCloudinaryPublicId}:`, cErr.message);
                    }
                }
                report.pdfDeletedFromCloudinary = true;
                await report.save();
            }
        } else {
            const db = getJSONData();
            let modified = false;
            (db.eirfReports || []).forEach(report => {
                if (['approved', 'rejected'].includes(report.status) && !report.pdfDeletedFromCloudinary) {
                    const reviewedAt = report.reviewedAt ? new Date(report.reviewedAt) : null;
                    if (reviewedAt && reviewedAt <= cutoff) {
                        if (useCloudinary && report.pdfCloudinaryPublicId) {
                            cloudinary.uploader.destroy(report.pdfCloudinaryPublicId, { resource_type: 'raw' })
                                .then(() => console.log(`[CLOUDINARY_CLEANUP]: Auto-deleted expired EIRF verdict PDF ${report.pdfCloudinaryPublicId} after 48-hour deadline.`))
                                .catch(err => console.error(`[CLOUDINARY_CLEANUP_ERROR]: Failed to delete ${report.pdfCloudinaryPublicId}:`, err.message));
                        }
                        report.pdfDeletedFromCloudinary = true;
                        modified = true;
                    }
                }
            });
            if (modified) saveJSONData(db);
        }
    } catch (err) {
        console.error("[CLOUDINARY_CLEANUP_JOB_ERROR]:", err.message);
    }
};

setInterval(cleanupExpiredEirfPdfs, 30 * 60 * 1000);
setTimeout(cleanupExpiredEirfPdfs, 10000);

module.exports = router;
