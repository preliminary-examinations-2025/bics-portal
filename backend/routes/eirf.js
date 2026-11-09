const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const { EIRFReportModel, TestSubmissionModel, CandidateModel, TestConfigModel, ConfigModel } = require('../models');
const { dbState, getJSONData, saveJSONData } = require('../config/db');
const { generateEirfReportId } = require('../config/constants');
const { logSystemAction } = require('../utils/logger');
const { generateEirfVerdictPdfBuffer, generateDigitalVerdictHash } = require('../utils/pdfGenerator');
const {
    formatISTDate,
    sendTestSubmittedEmail,
    sendEirfFilingNoticeEmail,
    sendEirfVerdictApprovedEmail,
    sendEirfVerdictRejectedEmail,
    resolvePortalBaseUrl,
    isValidEmailAddress
} = require('../services/gmailEmailService');
const { uploadToCloudinary } = require('../config/cloudinary');
const { requireAdmin } = require('../middleware/auth');
const { runPipelineTick } = require('../workers/eirfPipelineWorker');
const { resolveToObjectId, toBicsId, isBicsId } = require('../utils/bicsId');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const ALLOWED_PROOF_MIMES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'application/pdf'
]);
const ALLOWED_PROOF_EXTS = new Set(['.jpg', '.jpeg', '.png', '.pdf']);

const proofUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const mime = String(file.mimetype || '').toLowerCase();
        if (ALLOWED_PROOF_MIMES.has(mime) && ALLOWED_PROOF_EXTS.has(ext)) {
            return cb(null, true);
        }
        const err = new Error('Unsupported evidence file format. Only JPG, PNG, and PDF files are allowed.');
        err.statusCode = 400;
        return cb(err);
    }
});

function isConstantTimeTokenMatch(provided, stored) {
    const a = String(provided || '').trim();
    const b = String(stored || '').trim();
    if (!a || !b || a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

async function findEirfSubmissionAndReport({ identifier, requireNotDeleted = true } = {}) {
    if (!identifier) return { submission: null, existingReport: null, targetSubId: null };
    const rawId = String(identifier).trim();
    const targetSubId = resolveToObjectId(rawId);
    let submission = null;
    let existingReport = null;

    if (dbState.useMongo) {
        const subFilterBase = requireNotDeleted ? { isDeleted: { $ne: true } } : {};

        if (mongoose.Types.ObjectId.isValid(targetSubId)) {
            submission = await TestSubmissionModel.findOne({ _id: targetSubId, ...subFilterBase });
        }
        if (!submission && mongoose.Types.ObjectId.isValid(rawId)) {
            submission = await TestSubmissionModel.findOne({ _id: rawId, ...subFilterBase });
        }
        if (!submission) {
            const orConds = [
                { submissionRefId: rawId },
                { eirfReportId: rawId }
            ];
            if (isBicsId(rawId) && mongoose.Types.ObjectId.isValid(targetSubId)) {
                orConds.push({ _id: targetSubId });
            }
            submission = await TestSubmissionModel.findOne({ ...subFilterBase, $or: orConds });
        }

        const reportOrs = [
            { reportId: rawId },
            { submissionId: rawId },
            { submissionId: String(targetSubId) },
            { bicsId: rawId },
            { submissionRefId: rawId }
        ];
        if (mongoose.Types.ObjectId.isValid(rawId)) {
            reportOrs.push({ _id: rawId });
        }
        if (mongoose.Types.ObjectId.isValid(targetSubId)) {
            reportOrs.push({ _id: targetSubId });
        }
        if (submission) {
            const rawSubStr = String(submission._id || submission.id);
            reportOrs.push({ submissionId: rawSubStr });
            if (submission.eirfReportId) reportOrs.push({ reportId: submission.eirfReportId });
            if (submission.submissionRefId) reportOrs.push({ submissionRefId: submission.submissionRefId });
        }
        existingReport = await EIRFReportModel.findOne({ $or: reportOrs });

        if (!submission && existingReport && existingReport.submissionId) {
            const repSubResolved = resolveToObjectId(existingReport.submissionId);
            if (mongoose.Types.ObjectId.isValid(repSubResolved)) {
                submission = await TestSubmissionModel.findOne({ _id: repSubResolved, ...subFilterBase });
            } else {
                submission = await TestSubmissionModel.findOne({
                    ...subFilterBase,
                    $or: [
                        { submissionRefId: String(existingReport.submissionId) },
                        { eirfReportId: existingReport.reportId }
                    ]
                });
            }
        }
    } else {
        const db = getJSONData();
        db.testSubmissions = db.testSubmissions || [];
        db.eirfReports = db.eirfReports || [];

        const matchesSub = (s) => {
            if (requireNotDeleted && s.isDeleted) return false;
            const sId = String(s._id || s.id || '');
            return (
                sId === String(targetSubId) ||
                sId === rawId ||
                toBicsId(sId) === rawId ||
                (s.submissionRefId && String(s.submissionRefId) === rawId) ||
                (s.eirfReportId && String(s.eirfReportId) === rawId)
            );
        };
        submission = db.testSubmissions.find(matchesSub) || null;

        const matchesRep = (r) => {
            const rId = String(r._id || '');
            const rSub = String(r.submissionId || '');
            const subRawId = submission ? String(submission._id || submission.id || '') : '';
            return (
                String(r.reportId || '') === rawId ||
                rId === rawId ||
                rId === String(targetSubId) ||
                rSub === rawId ||
                rSub === String(targetSubId) ||
                (subRawId && rSub === subRawId) ||
                (r.bicsId && String(r.bicsId) === rawId) ||
                (r.submissionRefId && String(r.submissionRefId) === rawId) ||
                (submission?.eirfReportId && String(r.reportId || '') === String(submission.eirfReportId))
            );
        };
        existingReport = db.eirfReports.find(matchesRep) || null;

        if (!submission && existingReport && existingReport.submissionId) {
            const repSubResolved = resolveToObjectId(existingReport.submissionId);
            submission = db.testSubmissions.find(s =>
                (!requireNotDeleted || !s.isDeleted) &&
                (String(s._id || s.id) === String(repSubResolved) || String(s._id || s.id) === String(existingReport.submissionId))
            ) || null;
        }
    }

    return { submission, existingReport, targetSubId };
}

async function resolveCandidateAndTestForSubmission(submission) {
    let candidate = null;
    let testConfig = null;
    if (!submission) return { candidate, testConfig };

    if (dbState.useMongo) {
        if (submission.candidateId && mongoose.Types.ObjectId.isValid(submission.candidateId)) {
            candidate = await CandidateModel.findById(submission.candidateId).lean();
        }
        if (!candidate && submission.studentId) {
            candidate = await CandidateModel.findOne({ studentId: String(submission.studentId) }).lean();
        }
        if (submission.testId && mongoose.Types.ObjectId.isValid(submission.testId)) {
            testConfig = await TestConfigModel.findById(submission.testId).lean();
        }
    } else {
        const db = getJSONData();
        candidate = (db.candidates || []).find(c =>
            String(c._id || c.id) === String(submission.candidateId) ||
            (submission.studentId && String(c.studentId) === String(submission.studentId))
        ) || null;
        testConfig = (db.tests || []).find(t =>
            String(t._id || t.id) === String(submission.testId)
        ) || null;
    }

    return { candidate, testConfig };
}

async function resolveSystemConfig() {
    try {
        if (dbState.useMongo) {
            return await ConfigModel.findOne().lean();
        }
        const db = getJSONData();
        return db?.config || null;
    } catch (e) {
        return null;
    }
}

function healGeneratedQuestions(questions) {
    if (!Array.isArray(questions) || questions.length === 0) return { healed: [], modified: false };
    let modified = false;

    const healed = questions.map((q) => {
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

// 1. Get EIRF Incident Details & Breakdown by Submission ID / BICS ID / Ref ID / Report ID
router.get('/test/eirf/details/:submissionId', async (req, res) => {
    const { submissionId } = req.params;
    try {
        const { submission: rawSub, existingReport: rawReport, targetSubId } = await findEirfSubmissionAndReport({
            identifier: submissionId,
            requireNotDeleted: true
        });

        if (!rawSub) {
            return res.status(404).json({ error: 'Examination submission record not found.' });
        }

        const submission = rawSub.toObject ? rawSub.toObject() : { ...rawSub };
        const existingReport = rawReport ? (rawReport.toObject ? rawReport.toObject() : { ...rawReport }) : null;
        const { candidate, testConfig } = await resolveCandidateAndTestForSubmission(submission);

        const isAdmin = req.user?.role === 'admin';
        const providedToken = req.query.token || req.headers['x-eirf-token'] || req.user?.eirfToken;
        const isTokenMatch = isConstantTimeTokenMatch(providedToken, submission.eirfToken);

        if (!isAdmin && !isTokenMatch) {
            return res.status(403).json({
                error: 'Invalid or expired EIRF access token. Please access the form using the secure link delivered to your email.',
                invalidToken: true
            });
        }

        const submittedAt = submission.submittedAt || submission.startedAt || new Date();
        const expiresAt = submission.eirfExpiresAt || new Date(new Date(submittedAt).getTime() + 45 * 60 * 1000);
        const isExpired = Date.now() > new Date(expiresAt).getTime() || submission.pipelineStatus === 'EXPIRED';

        // Allow post-filing confirmation receipt view even after 45m expiry; block only unfiled expired sessions
        if (isExpired && !existingReport && !isAdmin) {
            return res.status(410).json({
                error: 'The Emergency Incident Report Form (EIRF) 45-minute submission window has expired.',
                isExpired: true,
                expiresAt
            });
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
        if (existingReport?.proctoringLogSnapshot?.events) {
            (existingReport.proctoringLogSnapshot.events || []).forEach(addEv);
        }

        const flaggedReasons = [];
        let hasFullscreenFlag = false;
        let hasTabSwitchFlag = false;
        let hasInspectFlag = false;
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
            const tUpper = String(ev.type || '').toUpperCase();
            const isFsEv = tUpper.includes('FULLSCREEN');
            const isTabEv = tUpper.includes('TAB');
            const isInspectEv = tUpper.includes('DEVTOOLS') || tUpper.includes('INSPECT');

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
            } else if (isInspectEv) {
                if (dur > 5) {
                    hasInspectFlag = true;
                    flaggedReasons.push(`Developer tools / inspect event duration: ${dur} seconds (exceeds 5s threshold)`);
                }
            } else if (tUpper === 'NETWORK_OFFLINE' || tUpper === 'EMERGENCY_SUBMISSION') {
                hasNetworkFlag = true;
                flaggedReasons.push('Session disconnect / emergency trigger recorded');
            }
        });

        const fsCount = Number(submission.proctoringLog?.fullscreenExits || 0);
        const tabCount = Number(submission.proctoringLog?.tabSwitches || 0);
        const inspectCount = Number(submission.proctoringLog?.inspectAttempts || 0);
        const totalWarningsCount = Math.max(fsCount + tabCount + inspectCount, Number(submission.proctoringLog?.warnings || 0));

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
            flaggedReasons.push(`Exam attempt auto-submitted due to compliance warnings (${totalWarningsCount} warnings).`);
        }

        const hasEirfFlag = Boolean(
            submission.hasEirfFlag ||
            hasFullscreenFlag ||
            hasTabSwitchFlag ||
            hasInspectFlag ||
            hasMinorFlag ||
            hasNetworkFlag ||
            submission.status === 'auto-submitted' ||
            totalWarningsCount >= 3
        );

        if (flaggedReasons.length === 0 && hasEirfFlag) {
            flaggedReasons.push('Proctoring alert flagged by administration for incident review.');
        }

        const uniqueFlaggedReasons = Array.from(new Set(flaggedReasons));

        let sanitizedExistingReport = null;
        if (existingReport) {
            const { decryptedPayloadSnapshot, proctoringLogSnapshot, pdfUrl, pdfCloudinaryPublicId, ...safeReport } = existingReport;
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

        const rawSubIdStr = String(submission._id || submission.id);
        const bicsId = toBicsId(rawSubIdStr) || submissionId;

        return res.json({
            submissionId: bicsId,
            bicsId,
            submissionRefId: submission.submissionRefId || '',
            token: isTokenMatch ? String(providedToken).trim() : '',
            studentId: submission.studentId || candidate?.studentId || 'Candidate',
            candidateName: submission.candidateName || candidate?.name || 'Candidate',
            testId: toBicsId(submission.testId) || submission.testId,
            testTitle: submission.testTitle || testConfig?.title || 'BICS Examination',
            courseCode: existingReport?.courseCode || testConfig?.courseCode || testConfig?.code || '',
            courseName: existingReport?.courseName || testConfig?.courseName || testConfig?.course || '',
            submittedAt,
            expiresAt,
            isExpired,
            canSubmit: !existingReport && !isExpired && !['UNDER_REVIEW', 'VERDICT_ISSUED', 'EIRF_SUBMITTED'].includes(submission.pipelineStatus),
            existingReport: sanitizedExistingReport,
            hasEirfFlag,
            eirfNoticeEmailSent: Boolean(submission.eirfNoticeEmailSent),
            lastPipelineError: submission.lastPipelineError || submission.emailsSent?.lastError || '',
            candidateEmail: submission.candidateEmail || candidate?.email || candidate?.personalEmail || candidate?.registrationData?.personalEmail || candidate?.registrationData?.collegeEmail || '',
            magicLink: (isAdmin && submission.eirfToken) ? `${resolvePortalBaseUrl()}/assessment/evaluation/eirf/${bicsId}?token=${submission.eirfToken}` : undefined,
            eirfToken: isAdmin ? submission.eirfToken : undefined,
            generatedQuestions: formattedQuestions,
            pipelineStatus: submission.pipelineStatus || (hasEirfFlag ? 'AWAITING_EIRF' : 'CLEARED'),
            proctoringTelemetry: {
                fullscreenExits: fsCount,
                tabSwitches: tabCount,
                inspectAttempts: inspectCount,
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
        console.error('Fetch EIRF details error:', e);
        return res.status(500).json({ error: e.message });
    }
});

// 1.1 Deprecated RSA Public Key Endpoint (Retired in Pillar 2)
router.get('/test/eirf/public-key', (req, res) => {
    return res.status(410).json({
        error: 'Deprecated endpoint: the client-side .eirf payload encryption mechanism has been retired.',
        deprecated: true
    });
});

// 1.2 Upload Candidate Supporting Evidence / Proof (JPG, PNG, PDF <= 5MB)
router.post('/test/eirf/upload-proof', (req, res) => {
    proofUpload.single('file')(req, res, async (uploadErr) => {
        if (uploadErr) {
            const status = uploadErr.statusCode || (uploadErr.code === 'LIMIT_FILE_SIZE' ? 400 : 400);
            return res.status(status).json({ error: uploadErr.message || 'Invalid evidence file upload.' });
        }

        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No evidence file uploaded.' });
            }

            const submissionId = req.body.submissionId;
            const providedToken = req.body.token || req.query.token || req.headers['x-eirf-token'] || req.user?.eirfToken;
            const isAdmin = req.user?.role === 'admin';

            let resolvedBicsId = submissionId || 'proof';

            if (!isAdmin) {
                if (!submissionId || !providedToken) {
                    return res.status(403).json({ error: 'EIRF submission ID and authorization token required.' });
                }

                const { submission: sub } = await findEirfSubmissionAndReport({
                    identifier: submissionId,
                    requireNotDeleted: true
                });

                if (!sub || !isConstantTimeTokenMatch(providedToken, sub.eirfToken)) {
                    return res.status(403).json({ error: 'Invalid EIRF authorization token. Access denied.' });
                }

                const expiresAt = sub.eirfExpiresAt || new Date(Date.now() + 45 * 60 * 1000);
                if (Date.now() > new Date(expiresAt).getTime() || sub.pipelineStatus === 'EXPIRED') {
                    return res.status(410).json({ error: 'The EIRF 45-minute submission window has expired. Proof uploads are closed.' });
                }

                resolvedBicsId = toBicsId(String(sub._id || sub.id)) || submissionId;
            }

            const fileName = req.file.originalname || 'evidence_proof.png';
            const fileBuffer = req.file.buffer;
            const mimeType = req.file.mimetype || 'image/png';

            const useCloudinary = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
            let fileUrl = '';

            if (useCloudinary) {
                const folder = `BICS_2026/eirf_proofs/${resolvedBicsId}`;
                const resourceType = mimeType.includes('pdf') ? 'raw' : 'image';
                fileUrl = await uploadToCloudinary(fileBuffer, folder, resourceType);
            } else {
                const isProd = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
                if (isProd) {
                    return res.status(503).json({
                        error: 'Evidence storage service is temporarily unavailable. Please try again later.'
                    });
                }
                const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'eirf_proofs');
                if (!fs.existsSync(uploadDir)) {
                    fs.mkdirSync(uploadDir, { recursive: true });
                }
                const safeFileName = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
                const filePath = path.join(uploadDir, safeFileName);
                fs.writeFileSync(filePath, fileBuffer);
                fileUrl = `/public/uploads/eirf_proofs/${safeFileName}`;
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
});

// 2. Deprecated Generate .eirf Encrypted Payload Endpoint (Retired in Pillar 2)
router.post('/test/eirf/generate-payload', (req, res) => {
    return res.status(410).json({
        error: 'Deprecated endpoint: .eirf backup payload generation has been retired.',
        deprecated: true
    });
});

// 3. Submit EIRF Incident Report (Server-Side Telemetry Verification, No .eirf Payload)
router.post('/test/eirf/submit', async (req, res) => {
    const {
        submissionId,
        primaryCause,
        detailedExplanation,
        technicalContext,
        additionalAnswers,
        formAnswers
    } = req.body;

    if (!submissionId || !primaryCause || !detailedExplanation) {
        return res.status(400).json({ error: 'Missing required fields: submissionId, primaryCause, and detailedExplanation are required.' });
    }

    try {
        const { submission, existingReport } = await findEirfSubmissionAndReport({
            identifier: submissionId,
            requireNotDeleted: true
        });

        if (!submission) {
            return res.status(404).json({ error: 'Examination submission record not found.' });
        }

        const isAdmin = req.user?.role === 'admin';
        const providedToken = req.body.token || req.query.token || req.headers['x-eirf-token'] || req.user?.eirfToken;
        const isTokenMatch = isConstantTimeTokenMatch(providedToken, submission.eirfToken);

        if (!isAdmin && !isTokenMatch) {
            return res.status(403).json({
                error: 'Invalid or missing EIRF authorization token. Access denied.',
                invalidToken: true
            });
        }

        // Reject duplicate filings cleanly with 409 Conflict
        if (
            existingReport ||
            ['EIRF_SUBMITTED', 'SENDING_CONFIRMATION_EMAIL', 'UNDER_REVIEW', 'VERDICT_ISSUED'].includes(submission.pipelineStatus) ||
            ['approved', 'rejected'].includes(submission.eirfStatus)
        ) {
            return res.status(409).json({
                error: 'An Emergency Incident Report has already been filed for this examination attempt and cannot be modified.',
                alreadySubmitted: true,
                reportId: existingReport?.reportId || submission.eirfReportId || null
            });
        }

        const submittedAt = submission.submittedAt || submission.startedAt || new Date();
        const expiresAt = submission.eirfExpiresAt || new Date(new Date(submittedAt).getTime() + 45 * 60 * 1000);
        const isExpired = Date.now() > new Date(expiresAt).getTime() || submission.pipelineStatus === 'EXPIRED';

        if (!isAdmin && isExpired) {
            return res.status(410).json({
                error: 'The Emergency Incident Report Form (EIRF) 45-minute submission window has expired.',
                isExpired: true
            });
        }

        // Server-side validation of dynamic questionnaire responses when generatedQuestions exist
        const generatedQuestions = Array.isArray(submission.generatedQuestions) ? submission.generatedQuestions : [];
        if (generatedQuestions.length > 0) {
            const answersObj = (formAnswers && typeof formAnswers === 'object') ? formAnswers : {};
            const dynFallback = (additionalAnswers && typeof additionalAnswers === 'object' && additionalAnswers.dynamicAnswers)
                ? additionalAnswers.dynamicAnswers
                : {};

            for (let qIdx = 0; qIdx < generatedQuestions.length; qIdx++) {
                const q = generatedQuestions[qIdx];
                const qId = q.questionId || q.id || `Q${qIdx + 1}`;
                const qType = String(q.questionType || q.type || 'TEXT').toUpperCase();
                const isReq = q.isRequired !== false && q.required !== false;
                if (!isReq) continue;

                const val = answersObj[qId] ?? dynFallback[qId] ?? answersObj[`Q${qIdx + 1}`];
                if (qType === 'TEXT') {
                    if (typeof val !== 'string' || val.trim().length < 15) {
                        return res.status(400).json({
                            error: `Please provide a complete explanation (at least 15 characters) for question ${qId}.`
                        });
                    }
                } else if (qType === 'RADIO') {
                    if (typeof val !== 'string' || !val.trim()) {
                        return res.status(400).json({
                            error: `Please select an option for question ${qId}.`
                        });
                    }
                } else if (qType === 'CHECKBOX') {
                    if (!Array.isArray(val) || val.length === 0) {
                        return res.status(400).json({
                            error: `Please select at least one option for question ${qId}.`
                        });
                    }
                } else if (qType === 'FILE_UPLOAD') {
                    if (!val || typeof val !== 'object' || !val.uploaded || !val.fileUrl) {
                        return res.status(400).json({
                            error: `Supporting evidence upload is mandatory for question ${qId}.`
                        });
                    }
                }
            }
        }

        const { candidate, testConfig } = await resolveCandidateAndTestForSubmission(submission);

        const rawSubIdStr = String(submission._id || submission.id);
        const bicsId = toBicsId(rawSubIdStr);
        const studentId = submission.studentId || candidate?.studentId || 'Candidate';
        const candidateName = submission.candidateName || candidate?.name || 'Candidate';
        const testTitle = submission.testTitle || testConfig?.title || '';
        const courseCode = testConfig?.courseCode || testConfig?.code || '';
        const courseName = testConfig?.courseName || testConfig?.course || testConfig?.subject || '';

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

        const nowDate = new Date();
        const ua = String(technicalContext?.browser || req.headers['user-agent'] || '');
        const inferredOs = technicalContext?.os || (ua.includes('Windows') ? 'Windows' : ua.includes('Mac') ? 'macOS' : ua.includes('Linux') ? 'Linux' : 'Desktop OS');

        const mergedTechContext = {
            ...(technicalContext || {}),
            ip: cleanIp,
            browser: technicalContext?.browser || ua || 'Unknown Browser',
            platform: technicalContext?.platform || 'Desktop',
            os: inferredOs,
            screenResolution: technicalContext?.screenResolution || 'Unknown',
            viewportSize: technicalContext?.viewportSize || 'Unknown',
            hardwareConcurrency: Number(technicalContext?.hardwareConcurrency || 0) || undefined,
            baselinePhotoUrl: submission.biometricVerification?.baselinePhotoUrl || submission.baselinePhotoUrl || '',
            submittedAt: nowDate.toISOString()
        };

        const reportData = {
            reportId,
            submissionId: rawSubIdStr,
            bicsId,
            submissionRefId: submission.submissionRefId || '',
            candidateId: String(submission.candidateId || ''),
            studentId,
            candidateName,
            testId: String(submission.testId || ''),
            testTitle,
            courseCode,
            courseName,
            proctoringLogSnapshot: {
                fullscreenExits: submission.proctoringLog?.fullscreenExits || 0,
                tabSwitches: submission.proctoringLog?.tabSwitches || 0,
                events: (submission.proctoringLog?.events || []).map(ev => {
                    const eObj = ev.toObject ? ev.toObject() : { ...ev };
                    return {
                        timestamp: eObj.timestamp || nowDate,
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
            encryptedPayloadUploaded: false,
            payloadFileName: '',
            verificationStatus: 'TELEMETRY_VERIFIED',
            verificationDetails: {
                answersMatch: true,
                clientHashMatch: true,
                discrepancies: []
            },
            status: 'pending_review',
            pipelineStatus: 'EIRF_SUBMITTED',
            submittedAt: nowDate,
            filedAt: nowDate,
            expiresAt
        };

        let savedReport = null;
        if (dbState.useMongo) {
            savedReport = await EIRFReportModel.create(reportData);
            submission.hasEirfFlag = true;
            submission.eirfStatus = 'pending';
            submission.pipelineStatus = 'EIRF_SUBMITTED';
            submission.eirfReportId = reportId;
            if (extractedProofUrl) {
                submission.eirfProofUrl = extractedProofUrl;
            }
            await submission.save();
        } else {
            const db = getJSONData();
            db.eirfReports = db.eirfReports || [];
            reportData._id = new mongoose.Types.ObjectId().toString();
            reportData.id = reportData._id;
            db.eirfReports.push(reportData);
            db.testSubmissions = db.testSubmissions || [];
            const subIdx = db.testSubmissions.findIndex(s => String(s._id || s.id) === rawSubIdStr);
            if (subIdx !== -1) {
                db.testSubmissions[subIdx].hasEirfFlag = true;
                db.testSubmissions[subIdx].eirfStatus = 'pending';
                db.testSubmissions[subIdx].pipelineStatus = 'EIRF_SUBMITTED';
                db.testSubmissions[subIdx].eirfReportId = reportId;
                if (extractedProofUrl) {
                    db.testSubmissions[subIdx].eirfProofUrl = extractedProofUrl;
                }
                submission.hasEirfFlag = true;
                submission.eirfStatus = 'pending';
                submission.pipelineStatus = 'EIRF_SUBMITTED';
                submission.eirfReportId = reportId;
            }
            saveJSONData(db);
            savedReport = reportData;
        }

        // Dispatch deferred test submission confirmation email cleanly & advance to UNDER_REVIEW
        // (Claim mutex inside gmailEmailService + optional pipelineLock prevents worker race)
        let pipelineStage = 'EIRF_SUBMITTED';
        try {
            let emailSucceeded = Boolean(submission.emailsSent?.testSubmitted);
            if (!emailSucceeded) {
                const tsRes = await sendTestSubmittedEmail(rawSubIdStr, {
                    triggerSource: 'eirf_filed_deferred'
                });
                emailSucceeded = Boolean(tsRes && tsRes.success);
            }

            if (!emailSucceeded) {
                throw new Error('Deferred test submission confirmation email failed to dispatch');
            }

            pipelineStage = 'UNDER_REVIEW';
            if (dbState.useMongo) {
                await TestSubmissionModel.updateOne(
                    { _id: submission._id },
                    { $set: { pipelineStatus: 'UNDER_REVIEW' } }
                );
                await EIRFReportModel.updateOne(
                    { reportId },
                    { $set: { pipelineStatus: 'UNDER_REVIEW' } }
                );
            } else {
                const db = getJSONData();
                const sIdx = (db.testSubmissions || []).findIndex(s => String(s._id || s.id) === rawSubIdStr);
                if (sIdx !== -1) db.testSubmissions[sIdx].pipelineStatus = 'UNDER_REVIEW';
                const rIdx = (db.eirfReports || []).findIndex(r => r.reportId === reportId);
                if (rIdx !== -1) db.eirfReports[rIdx].pipelineStatus = 'UNDER_REVIEW';
                saveJSONData(db);
            }
        } catch (emailErr) {
            console.error('[EIRF_SUBMIT_EMAIL_WARN]: Deferring confirmation email retry to pipeline worker:', emailErr.message);
            setImmediate(() => {
                runPipelineTick().catch(err => {
                    console.error('[EIRF_PIPELINE] Asynchronous EIRF submit trigger error:', err);
                });
            });
        }

        await logSystemAction(
            studentId,
            'EIRF_REPORT_SUBMITTED',
            `Student ${studentId} filed Emergency Incident Report ${reportId} for test "${testTitle}". Status: ${pipelineStage}`,
            'info'
        );

        return res.json({
            success: true,
            message: 'Emergency Incident Report submitted successfully.',
            reportId,
            submissionRefId: submission.submissionRefId || '',
            pipelineStatus: pipelineStage,
            verificationStatus: 'TELEMETRY_VERIFIED'
        });
    } catch (e) {
        console.error('EIRF submit error:', e);
        return res.status(500).json({ error: e.message });
    }
});

// 4. Admin: List All EIRF Reports & Flagged Examination Incidents
router.get('/admin/eirf/list', requireAdmin, async (req, res) => {
    try {
        let reports = [];
        let flaggedSubmissions = [];
        let testMap = new Map();

        if (dbState.useMongo) {
            reports = await EIRFReportModel.find()
                .select('-decryptedPayloadSnapshot -proctoringLogSnapshot -pdfUrl -pdfCloudinaryPublicId')
                .sort({ submittedAt: -1 })
                .lean();

            flaggedSubmissions = await TestSubmissionModel.find({
                isDeleted: { $ne: true },
                $or: [
                    { hasEirfFlag: true },
                    { eirfStatus: { $in: ['pending', 'discrepancy', 'approved', 'rejected', 'expired'] } },
                    { pipelineStatus: { $in: ['FLAGGED', 'GENERATING_QUESTIONS', 'QUESTIONS_GENERATED', 'SENDING_INVITE_EMAIL', 'AWAITING_EIRF', 'EIRF_SUBMITTED', 'SENDING_CONFIRMATION_EMAIL', 'UNDER_REVIEW', 'EXPIRED', 'VERDICT_ISSUED'] } }
                ]
            }).sort({ submittedAt: -1 }).lean();

            const allTests = await TestConfigModel.find().select('title courseCode code courseName course subject').lean();
            allTests.forEach(t => testMap.set(String(t._id || t.id), t));
        } else {
            const db = getJSONData();
            db.eirfReports = db.eirfReports || [];
            reports = db.eirfReports.map(({ decryptedPayloadSnapshot, proctoringLogSnapshot, pdfUrl, pdfCloudinaryPublicId, ...rest }) => rest);
            db.testSubmissions = db.testSubmissions || [];
            flaggedSubmissions = db.testSubmissions.filter(s =>
                !s.isDeleted && (
                    s.hasEirfFlag ||
                    ['pending', 'discrepancy', 'approved', 'rejected', 'expired'].includes(s.eirfStatus) ||
                    ['FLAGGED', 'GENERATING_QUESTIONS', 'QUESTIONS_GENERATED', 'SENDING_INVITE_EMAIL', 'AWAITING_EIRF', 'EIRF_SUBMITTED', 'SENDING_CONFIRMATION_EMAIL', 'UNDER_REVIEW', 'EXPIRED', 'VERDICT_ISSUED'].includes(s.pipelineStatus)
                )
            );
            (db.tests || []).forEach(t => testMap.set(String(t._id || t.id), t));
        }

        const reportBySubId = new Map();
        reports.forEach(r => {
            if (r.submissionId) {
                reportBySubId.set(String(r.submissionId), r);
                reportBySubId.set(String(resolveToObjectId(r.submissionId)), r);
            }
        });

        const mergedMap = new Map();

        // 1. Populate from active (non-deleted) flagged submissions
        flaggedSubmissions.forEach(sub => {
            const rawSubId = String(sub._id || sub.id);
            const bicsId = toBicsId(rawSubId);
            const rep = reportBySubId.get(rawSubId) || (sub.eirfReportId ? reports.find(r => r.reportId === sub.eirfReportId) : null);
            const tMeta = testMap.get(String(sub.testId));

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

            const isVerdict = rep?.status === 'approved' || rep?.status === 'rejected' || ['approved', 'rejected'].includes(sub.eirfStatus) || sub.pipelineStatus === 'VERDICT_ISSUED';
            const isFailed = sub.pipelineStatus === 'FAILED';
            const isExpired = !isVerdict && !rep && !isFailed && (
                (sub.eirfExpiresAt && new Date(sub.eirfExpiresAt) < new Date()) ||
                sub.pipelineStatus === 'EXPIRED' ||
                sub.eirfStatus === 'expired'
            );

            const pipelineStatus = isVerdict
                ? 'VERDICT_ISSUED'
                : (rep ? (rep.pipelineStatus || 'UNDER_REVIEW') : (isFailed ? 'FAILED' : (isExpired ? 'EXPIRED' : (sub.pipelineStatus || 'AWAITING_EIRF'))));

            const fsCount = Number(sub.proctoringLog?.fullscreenExits || 0);
            const tabCount = Number(sub.proctoringLog?.tabSwitches || 0);
            const inspectCount = Number(sub.proctoringLog?.inspectAttempts || 0);
            const totalStrikes = Math.max(fsCount + tabCount + inspectCount, Number(sub.proctoringLog?.warnings || 0));

            let triggerViolation = 'Proctoring Warning Threshold';
            if (maxFullscreenSeconds > 5) {
                triggerViolation = `Fullscreen Exit (${maxFullscreenSeconds}s)`;
            } else if (maxTabSwitchSeconds > 5) {
                triggerViolation = `Tab Switch (${maxTabSwitchSeconds}s)`;
            } else if (totalStrikes >= 3) {
                triggerViolation = `${totalStrikes} Proctor Compliance Strikes`;
            }

            mergedMap.set(rawSubId, {
                _id: toBicsId(String(rep?._id || rawSubId)) || bicsId,
                reportId: rep?.reportId || sub.eirfReportId || 'Pending Filing',
                submissionId: bicsId,
                bicsId,
                submissionRefId: sub.submissionRefId || rep?.submissionRefId || '',
                candidateName: sub.candidateName || rep?.candidateName || 'Candidate',
                studentId: sub.studentId || rep?.studentId || 'N/A',
                testTitle: sub.testTitle || rep?.testTitle || tMeta?.title || 'Online Assessment',
                testId: toBicsId(sub.testId) || sub.testId,
                courseCode: rep?.courseCode || tMeta?.courseCode || tMeta?.code || '',
                courseName: rep?.courseName || tMeta?.courseName || tMeta?.course || tMeta?.subject || '',
                submittedAt: sub.submittedAt,
                eirfSubmittedAt: rep?.filedAt || rep?.submittedAt || null,
                expiresAt: sub.eirfExpiresAt || rep?.expiresAt || null,
                isExpired,
                pipelineStatus,
                status: rep?.status || (isVerdict ? sub.eirfStatus : (isFailed ? 'dispatch_failed' : (pipelineStatus === 'EXPIRED' ? 'expired' : (sub.eirfStatus || 'pending_filing')))),
                eirfStatus: sub.eirfStatus || rep?.status || (pipelineStatus === 'EXPIRED' ? 'expired' : 'pending'),
                verificationStatus: rep?.verificationStatus || (rep ? 'TELEMETRY_VERIFIED' : 'AWAITING_STUDENT'),
                primaryCause: rep?.primaryCause || (isFailed ? 'Email Dispatch Failed (Candidate email missing or delivery error)' : (pipelineStatus === 'EXPIRED' ? 'Filing Expired (45 min statutory window elapsed)' : 'Awaiting Candidate Incident Report')),
                triggerViolation,
                maxFullscreenSeconds,
                maxTabSwitchSeconds,
                uploadedProofUrl: rep?.uploadedProofUrl || sub.eirfProofUrl || '',
                lastError: sub.lastPipelineError || sub.emailsSent?.lastError || '',
                eirfNoticeEmailSent: Boolean(sub.eirfNoticeEmailSent),
                eirfToken: sub.eirfToken || null,
                candidateEmail: sub.candidateEmail || '',
                hasEirfFlag: true
            });
        });

        // 2. Add non-orphaned reports not already in mergedMap
        for (const rep of reports) {
            const rawSubId = String(rep.submissionId || rep.reportId);
            const resolvedRepSubId = String(resolveToObjectId(rawSubId));
            if (mergedMap.has(rawSubId) || mergedMap.has(resolvedRepSubId)) continue;

            // Check whether referenced submission was soft-deleted
            if (rep.submissionId) {
                let referencedSubDeleted = false;
                if (dbState.useMongo && mongoose.Types.ObjectId.isValid(resolvedRepSubId)) {
                    const checkSub = await TestSubmissionModel.findById(resolvedRepSubId).select('isDeleted').lean();
                    if (checkSub?.isDeleted) referencedSubDeleted = true;
                } else if (!dbState.useMongo) {
                    const db = getJSONData();
                    const checkSub = (db.testSubmissions || []).find(s => String(s._id || s.id) === resolvedRepSubId);
                    if (checkSub?.isDeleted) referencedSubDeleted = true;
                }
                if (referencedSubDeleted) continue;
            }

            const bicsId = toBicsId(resolvedRepSubId);
            const tMeta = testMap.get(String(rep.testId));

            mergedMap.set(resolvedRepSubId, {
                _id: toBicsId(String(rep._id || rep.reportId)) || rep.reportId,
                reportId: rep.reportId,
                submissionId: bicsId,
                bicsId,
                submissionRefId: rep.submissionRefId || '',
                candidateName: rep.candidateName || 'Candidate',
                studentId: rep.studentId || 'N/A',
                testTitle: rep.testTitle || tMeta?.title || 'Online Assessment',
                testId: toBicsId(rep.testId) || rep.testId,
                courseCode: rep.courseCode || tMeta?.courseCode || tMeta?.code || '',
                courseName: rep.courseName || tMeta?.courseName || tMeta?.course || tMeta?.subject || '',
                submittedAt: rep.submittedAt,
                eirfSubmittedAt: rep.filedAt || rep.submittedAt,
                expiresAt: rep.expiresAt,
                isExpired: false,
                pipelineStatus: rep.status === 'approved' || rep.status === 'rejected' ? 'VERDICT_ISSUED' : (rep.pipelineStatus || 'UNDER_REVIEW'),
                status: rep.status || 'pending_review',
                eirfStatus: rep.status || 'pending',
                verificationStatus: rep.verificationStatus || 'TELEMETRY_VERIFIED',
                primaryCause: rep.primaryCause || 'Incident Flagged',
                triggerViolation: rep.flaggedReasons?.[0] || 'Proctoring Telemetry Alert',
                maxFullscreenSeconds: 0,
                maxTabSwitchSeconds: 0,
                uploadedProofUrl: rep.uploadedProofUrl || '',
                hasEirfFlag: true
            });
        }

        const list = Array.from(mergedMap.values()).sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
        return res.json(list);
    } catch (e) {
        console.error('Admin EIRF list error:', e);
        return res.status(500).json({ error: e.message });
    }
});

// 5. Admin: Approve or Reject EIRF Incident Report (Supports unfiled/expired flagged cases via audit synthesis)
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
    const finalResolutionCategory = resolutionCategory || (status === 'approved' ? 'Technical Glitch / Environmental Disruption' : 'Unexplained Window Deviation Confirmed');
    const finalRemediationAction = remediationAction || (status === 'approved' ? 'Provisional Assessment Restored & Validated' : 'Examination Score Annulled (Zero Points)');
    const finalReviewerName = reviewerName || 'Academic Integrity Board Convener';
    const finalReviewerTitle = reviewerTitle || 'Convener, Examination Disciplinary Committee';

    try {
        const nowDate = new Date();
        const { submission: foundSub, existingReport: foundRep } = await findEirfSubmissionAndReport({
            identifier: reportId,
            requireNotDeleted: true
        });

        if (!foundRep && !foundSub) {
            return res.status(404).json({ error: 'EIRF Incident Report or Examination Submission not found.' });
        }

        const { candidate: candidateObj, testConfig: testObj } = await resolveCandidateAndTestForSubmission(foundSub);

        const finalCourseCode = courseCode || foundRep?.courseCode || testObj?.courseCode || testObj?.code || '';
        const finalCourseName = courseName || foundRep?.courseName || testObj?.courseName || testObj?.course || testObj?.subject || '';

        let report = foundRep;
        let submission = foundSub;
        let targetReportId = report?.reportId || submission?.eirfReportId || generateEirfReportId();

        if (!report && submission) {
            const rawSubIdStr = String(submission._id || submission.id);
            const syntheticReport = {
                reportId: targetReportId,
                submissionId: rawSubIdStr,
                bicsId: toBicsId(rawSubIdStr),
                submissionRefId: submission.submissionRefId || '',
                candidateId: String(submission.candidateId || ''),
                studentId: submission.studentId || candidateObj?.studentId || 'Candidate',
                candidateName: submission.candidateName || candidateObj?.name || 'Candidate',
                testId: String(submission.testId || ''),
                testTitle: submission.testTitle || testObj?.title || 'BICS Examination',
                courseCode: finalCourseCode,
                courseName: finalCourseName,
                proctoringLogSnapshot: {
                    fullscreenExits: submission.proctoringLog?.fullscreenExits || 0,
                    tabSwitches: submission.proctoringLog?.tabSwitches || 0,
                    events: submission.proctoringLog?.events || []
                },
                primaryCause: (submission.eirfStatus === 'expired' || submission.pipelineStatus === 'EXPIRED')
                    ? 'Filing Window Expired (Admin Adjudicated)'
                    : 'Admin Direct Adjudication',
                detailedExplanation: 'Committee verdict issued directly following proctoring telemetry audit without candidate-filed EIRF documentation.',
                verificationStatus: 'TELEMETRY_VERIFIED',
                status,
                pipelineStatus: 'VERDICT_ISSUED',
                adminRemarks: adminRemarks || '',
                resolutionCategory: finalResolutionCategory,
                remediationAction: finalRemediationAction,
                reviewerName: finalReviewerName,
                reviewerTitle: finalReviewerTitle,
                reviewedAt: nowDate,
                reviewedBy: finalReviewerName,
                submittedAt: submission.submittedAt || nowDate,
                filedAt: null,
                expiresAt: submission.eirfExpiresAt || null
            };

            if (dbState.useMongo) {
                report = await EIRFReportModel.create(syntheticReport);
            } else {
                const db = getJSONData();
                db.eirfReports = db.eirfReports || [];
                syntheticReport._id = new mongoose.Types.ObjectId().toString();
                syntheticReport.id = syntheticReport._id;
                db.eirfReports.push(syntheticReport);
                saveJSONData(db);
                report = syntheticReport;
            }
        }

        targetReportId = report.reportId || targetReportId;
        const rawSubIdStr = submission ? String(submission._id || submission.id) : String(report.submissionId || targetReportId);
        const studentId = report.studentId || candidateObj?.studentId || submission?.studentId || 'Candidate';
        const digitalHash = generateDigitalVerdictHash(
            report.submissionId || rawSubIdStr,
            studentId,
            targetReportId,
            nowDate
        );

        if (dbState.useMongo) {
            report.status = status;
            report.pipelineStatus = 'VERDICT_ISSUED';
            report.adminRemarks = adminRemarks || '';
            report.courseCode = finalCourseCode;
            report.courseName = finalCourseName;
            report.resolutionCategory = finalResolutionCategory;
            report.remediationAction = finalRemediationAction;
            report.reviewerName = finalReviewerName;
            report.reviewerTitle = finalReviewerTitle;
            report.reviewedAt = nowDate;
            report.reviewedBy = finalReviewerName;
            report.digitalHash = digitalHash;
            report.bicsId = report.bicsId || toBicsId(rawSubIdStr);
            report.submissionRefId = report.submissionRefId || submission?.submissionRefId || '';
            await report.save();

            if (submission) {
                if (status === 'approved') {
                    await TestSubmissionModel.updateOne(
                        { _id: submission._id },
                        {
                            $set: {
                                eirfStatus: 'approved',
                                pipelineStatus: 'VERDICT_ISSUED',
                                verificationStatus: 'active',
                                eirfReportId: targetReportId
                            }
                        }
                    );
                } else {
                    const zeroedAnswers = Array.isArray(submission.answers)
                        ? submission.answers.map(a => {
                            const ansObj = a.toObject ? a.toObject() : { ...a };
                            ansObj.score = 0;
                            if (ansObj.aiEvaluation && typeof ansObj.aiEvaluation === 'object') {
                                ansObj.aiEvaluation = { ...ansObj.aiEvaluation, score: 0 };
                            }
                            return ansObj;
                        })
                        : [];

                    await TestSubmissionModel.updateOne(
                        { _id: submission._id },
                        {
                            $set: {
                                eirfStatus: 'rejected',
                                pipelineStatus: 'VERDICT_ISSUED',
                                verificationStatus: 'annulled',
                                eirfReportId: targetReportId,
                                score: 0,
                                totalScore: 0,
                                'evaluation.mcqScore': 0,
                                'evaluation.codingScore': 0,
                                'evaluation.webScore': 0,
                                'evaluation.score': 0,
                                'evaluation.totalScore': 0,
                                'evaluation.percentage': 0,
                                'evaluation.adminRemarks': `Annulled by Committee: ${finalResolutionCategory} (${finalRemediationAction})`,
                                answers: zeroedAnswers
                            }
                        }
                    );
                }
                submission = await TestSubmissionModel.findById(submission._id);
            }
        } else {
            const db = getJSONData();
            db.eirfReports = db.eirfReports || [];
            const idx = db.eirfReports.findIndex(r =>
                (targetReportId && String(r.reportId) === String(targetReportId)) ||
                (report._id && r._id && String(r._id) === String(report._id))
            );
            if (idx !== -1) {
                db.eirfReports[idx].status = status;
                db.eirfReports[idx].pipelineStatus = 'VERDICT_ISSUED';
                db.eirfReports[idx].adminRemarks = adminRemarks || '';
                db.eirfReports[idx].courseCode = finalCourseCode;
                db.eirfReports[idx].courseName = finalCourseName;
                db.eirfReports[idx].resolutionCategory = finalResolutionCategory;
                db.eirfReports[idx].remediationAction = finalRemediationAction;
                db.eirfReports[idx].reviewerName = finalReviewerName;
                db.eirfReports[idx].reviewerTitle = finalReviewerTitle;
                db.eirfReports[idx].reviewedAt = nowDate.toISOString();
                db.eirfReports[idx].reviewedBy = finalReviewerName;
                db.eirfReports[idx].digitalHash = digitalHash;
                db.eirfReports[idx].bicsId = db.eirfReports[idx].bicsId || toBicsId(rawSubIdStr);
                db.eirfReports[idx].submissionRefId = db.eirfReports[idx].submissionRefId || submission?.submissionRefId || '';
                report = db.eirfReports[idx];
            }

            if (submission) {
                db.testSubmissions = db.testSubmissions || [];
                const subIdx = db.testSubmissions.findIndex(s => String(s._id || s.id) === rawSubIdStr);
                if (subIdx !== -1) {
                    const sTarget = db.testSubmissions[subIdx];
                    sTarget.eirfStatus = status;
                    sTarget.pipelineStatus = 'VERDICT_ISSUED';
                    sTarget.eirfReportId = targetReportId;
                    if (status === 'approved') {
                        sTarget.verificationStatus = 'active';
                    } else if (status === 'rejected') {
                        sTarget.verificationStatus = 'annulled';
                        sTarget.score = 0;
                        sTarget.totalScore = 0;
                        sTarget.evaluation = sTarget.evaluation || {};
                        sTarget.evaluation.mcqScore = 0;
                        sTarget.evaluation.codingScore = 0;
                        sTarget.evaluation.webScore = 0;
                        sTarget.evaluation.score = 0;
                        sTarget.evaluation.totalScore = 0;
                        sTarget.evaluation.percentage = 0;
                        sTarget.evaluation.adminRemarks = `Annulled by Committee: ${finalResolutionCategory} (${finalRemediationAction})`;
                        if (Array.isArray(sTarget.answers)) {
                            sTarget.answers = sTarget.answers.map(a => {
                                const ansObj = { ...a, score: 0 };
                                if (ansObj.aiEvaluation && typeof ansObj.aiEvaluation === 'object') {
                                    ansObj.aiEvaluation = { ...ansObj.aiEvaluation, score: 0 };
                                }
                                return ansObj;
                            });
                        }
                    }
                    submission = sTarget;
                }
            }
            saveJSONData(db);
        }

        await logSystemAction(
            'admin',
            'EIRF_ACTION',
            `Admin set EIRF Report ${targetReportId} status to ${status.toUpperCase()} for course ${finalCourseCode || 'N/A'}. Remarks: "${adminRemarks || 'N/A'}"`,
            'info'
        );

        res.json({ success: true, report, message: `EIRF Incident Report ${targetReportId} marked as ${status.toUpperCase()}.` });

        // Non-blocking background worker: build Verdict PDF buffer and dispatch strictly via Gmail API (email-only candidate delivery)
        (async () => {
            try {
                const systemConfig = await resolveSystemConfig();
                const deadlineDateStr = formatISTDate(new Date(nowDate.getTime() + 48 * 60 * 60 * 1000));

                const pdfBuffer = await generateEirfVerdictPdfBuffer({
                    report,
                    submission,
                    test: testObj,
                    candidate: candidateObj,
                    systemConfig,
                    courseCode: finalCourseCode,
                    courseName: finalCourseName,
                    adminRemarks: adminRemarks || '',
                    resolutionCategory: finalResolutionCategory,
                    remediationAction: finalRemediationAction,
                    reviewerName: finalReviewerName,
                    reviewerTitle: finalReviewerTitle,
                    digitalHash,
                    deadlineDateStr
                });

                const verdictOptions = {
                    adminRemarks: adminRemarks || 'Standard academic committee evaluation recorded.',
                    resolutionCategory: finalResolutionCategory,
                    remediationAction: finalRemediationAction,
                    reviewerName: finalReviewerName,
                    reviewerTitle: finalReviewerTitle,
                    courseCode: finalCourseCode,
                    courseName: finalCourseName,
                    systemConfig,
                    digitalHash,
                    deadlineDateStr,
                    pdfBuffer
                };

                let dispatchResult = null;
                if (status === 'approved') {
                    dispatchResult = await sendEirfVerdictApprovedEmail(report.reportId || targetReportId, verdictOptions);
                } else if (status === 'rejected') {
                    dispatchResult = await sendEirfVerdictRejectedEmail(report.reportId || targetReportId, verdictOptions);
                }

                if (!dispatchResult || !dispatchResult.success) {
                    console.warn(`[EIRF_BACKGROUND_PIPELINE_WARN]: Verdict email dispatch incomplete for ${targetReportId}:`, dispatchResult?.reason || 'unknown');
                } else {
                    console.log(`[EIRF_BACKGROUND_PIPELINE]: Verdict PDF generated & verdict email dispatched for ${targetReportId}.`);
                }
            } catch (bgErr) {
                console.error(`[EIRF_BACKGROUND_PIPELINE_ERROR] Verdict dispatch failed for ${targetReportId}:`, bgErr.message, bgErr.stack);
            }
        })();
    } catch (e) {
        console.error('Admin EIRF action error:', e);
        return res.status(500).json({ error: e.message });
    }
});

// Helper: Stream on-demand cryptographically signed BICS Verdict PDF (Admin-only preview)
async function streamVerdictPdfForReport(reportId, res) {
    try {
        const { submission, existingReport: report } = await findEirfSubmissionAndReport({
            identifier: reportId,
            requireNotDeleted: true
        });

        if (!report && !submission) {
            return res.status(404).json({ error: 'Official EIRF record or examination submission not found.' });
        }

        const { candidate, testConfig } = await resolveCandidateAndTestForSubmission(submission);
        const systemConfig = await resolveSystemConfig();

        const status = (report?.status || submission?.eirfStatus || 'approved').toLowerCase();
        const finalCourseCode = report?.courseCode || testConfig?.courseCode || testConfig?.code || '';
        const finalCourseName = report?.courseName || testConfig?.courseName || testConfig?.course || testConfig?.subject || '';
        const finalResolutionCategory = report?.resolutionCategory || (status === 'approved' ? 'Technical Glitch / Environmental Disruption' : 'Unexplained Window Deviation Confirmed');
        const finalRemediationAction = report?.remediationAction || (status === 'approved' ? 'Provisional Assessment Restored & Validated' : 'Examination Score Annulled (Zero Points)');
        const finalReviewerName = report?.reviewerName || 'Academic Integrity Board Convener';
        const finalReviewerTitle = report?.reviewerTitle || 'Convener, Examination Disciplinary Committee';
        const finalRemarks = report?.adminRemarks || '';

        const studentId = report?.studentId || candidate?.studentId || submission?.studentId || '';
        const targetReportId = report?.reportId || submission?.eirfReportId || `EIRF-2026-${String(reportId).slice(-6).toUpperCase()}`;

        const digitalHash = report?.digitalHash || generateDigitalVerdictHash(
            report?.submissionId || submission?._id || reportId,
            studentId,
            targetReportId,
            report?.reviewedAt || new Date()
        );

        const deadlineDateStr = formatISTDate(new Date((report?.reviewedAt ? new Date(report.reviewedAt).getTime() : Date.now()) + 48 * 60 * 60 * 1000));

        const pdfBuffer = await generateEirfVerdictPdfBuffer({
            report: report || { reportId: targetReportId, status, studentId, candidateName: submission?.candidateName },
            submission,
            test: testConfig,
            candidate,
            systemConfig,
            courseCode: finalCourseCode,
            courseName: finalCourseName,
            adminRemarks: finalRemarks,
            resolutionCategory: finalResolutionCategory,
            remediationAction: finalRemediationAction,
            reviewerName: finalReviewerName,
            reviewerTitle: finalReviewerTitle,
            digitalHash,
            deadlineDateStr
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="BICS_Verdict_${targetReportId}.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.setHeader('Cache-Control', 'private, no-store');
        return res.send(pdfBuffer);
    } catch (err) {
        console.error('[EIRF Verdict PDF Generation Error]:', err);
        return res.status(500).json({ error: 'Failed to generate signed verdict PDF: ' + err.message });
    }
}

// 6. Admin-Only Verdict PDF Preview Endpoint (Candidates receive Verdict PDF exclusively via Email)
router.get('/admin/eirf/verdict-pdf/:reportId', requireAdmin, async (req, res) => {
    return streamVerdictPdfForReport(req.params.reportId, res);
});

// 7. Admin: Dispatch or Retry EIRF Filing Notice Email (with optional email update/override)
router.post('/admin/eirf/dispatch-notice/:submissionId', requireAdmin, async (req, res) => {
    const { submissionId } = req.params;
    const { email } = req.body || {};

    try {
        const { submission, candidate, targetSubId } = await findEirfSubmissionAndReport({
            identifier: submissionId,
            requireNotDeleted: true
        });

        if (!submission) {
            return res.status(404).json({ error: 'Examination submission record not found.' });
        }

        let targetEmail = '';
        if (typeof email === 'string' && email.trim()) {
            if (!isValidEmailAddress(email.trim())) {
                return res.status(400).json({ error: 'The provided email address is invalid.' });
            }
            targetEmail = email.trim();
        } else {
            targetEmail = submission.candidateEmail || candidate?.email || candidate?.personalEmail || candidate?.registrationData?.personalEmail || candidate?.registrationData?.collegeEmail || '';
        }

        if (!targetEmail || !isValidEmailAddress(targetEmail)) {
            return res.status(400).json({ error: 'Candidate has no registered email. Please provide a valid email address to dispatch the notice.' });
        }

        // Update email on submission and candidate doc
        submission.candidateEmail = targetEmail;
        if (candidate) {
            candidate.email = targetEmail;
            candidate.personalEmail = targetEmail;
            if (candidate.registrationData) {
                candidate.registrationData.personalEmail = targetEmail;
            }
            if (candidate.save) await candidate.save().catch(() => {});
        }

        // Ensure token and fresh 45m window
        if (!submission.eirfToken) {
            submission.eirfToken = crypto.randomBytes(24).toString('hex');
        }
        submission.eirfExpiresAt = new Date(Date.now() + 45 * 60 * 1000);
        submission.pipelineRetries = 0;
        submission.lastPipelineError = null;
        submission.pipelineStatus = 'QUESTIONS_GENERATED';
        if (submission.save) await submission.save().catch(() => {});

        const basePortalUrl = resolvePortalBaseUrl();
        const encryptedBicsId = toBicsId(submission._id || submission.id || targetSubId);
        const magicLink = `${basePortalUrl}/assessment/evaluation/eirf/${encryptedBicsId}?token=${submission.eirfToken}`;

        const incidentSummary = (submission.flaggedReasons && submission.flaggedReasons.length > 0)
            ? submission.flaggedReasons.join('; ')
            : 'Proctoring alert flagged for post-exam incident review.';

        const mailRes = await sendEirfFilingNoticeEmail(submission, {
            magicLink,
            magicToken: submission.eirfToken,
            expiresAt: submission.eirfExpiresAt,
            incidentType: incidentSummary,
            recipient: targetEmail,
            force: true,
            triggerSource: 'admin_manual_dispatch'
        });

        if (!mailRes || !mailRes.success) {
            const errMsg = mailRes?.error || mailRes?.reason || 'EIRF notice email dispatch failed';
            submission.pipelineStatus = 'FAILED';
            submission.lastPipelineError = errMsg;
            if (submission.save) await submission.save().catch(() => {});
            return res.status(500).json({ error: errMsg, success: false });
        }

        submission.emailsSent = submission.emailsSent || {};
        submission.emailsSent.eirfFiling = true;
        submission.emailsSent.eirfFilingAt = new Date();
        submission.eirfNoticeEmailSent = true;
        submission.pipelineStatus = 'AWAITING_EIRF';
        submission.eirfStatus = 'pending';
        if (submission.save) await submission.save().catch(() => {});

        await logSystemAction(
            req.user?.username || 'admin',
            'EIRF_NOTICE_DISPATCHED',
            `Dispatched EIRF filing notice to ${targetEmail} for submission #${submission.submissionRefId || encryptedBicsId}`,
            'info'
        );

        return res.json({
            success: true,
            message: `EIRF filing notice successfully dispatched to ${targetEmail}`,
            recipient: targetEmail,
            expiresAt: submission.eirfExpiresAt,
            magicLink
        });
    } catch (err) {
        console.error('[Admin EIRF Notice Dispatch Error]:', err);
        return res.status(500).json({ error: 'Failed to dispatch EIRF notice: ' + err.message });
    }
});

module.exports = router;
