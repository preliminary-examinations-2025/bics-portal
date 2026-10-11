const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { EIRFReportModel, TestSubmissionModel, CandidateModel, TestConfigModel } = require('../models');
const { dbState, getJSONData, saveJSONData } = require('../config/db');
const { generateEirfReportId } = require('../config/constants');
const { logSystemAction } = require('../utils/logger');
const { encryptEirfPayload, decryptEirfPayload } = require('../utils/cipher');
const { formatISTDate, sendEirfVerdictEmail } = require('../utils/email');
const { generateEirfVerdictPdfBuffer, generateDigitalVerdictHash } = require('../utils/pdfGenerator');
const { uploadToCloudinary, cloudinary } = require('../config/cloudinary');

// 1. Get EIRF Incident Details & Breakdown by Submission ID
router.get('/test/eirf/details/:submissionId', async (req, res) => {
    const { submissionId } = req.params;
    try {
        let submission = null;
        let candidate = null;
        let testConfig = null;
        let existingReport = null;

        if (dbState.useMongo) {
            if (mongoose.Types.ObjectId.isValid(submissionId)) {
                submission = await TestSubmissionModel.findById(submissionId).lean();
            }
            if (!submission) {
                submission = await TestSubmissionModel.findOne({ _id: submissionId }).lean();
            }
            if (!submission) {
                existingReport = await EIRFReportModel.findOne({
                    $or: [{ reportId: String(submissionId) }, { submissionId: String(submissionId) }]
                }).lean();
                if (existingReport && existingReport.submissionId) {
                    submission = await TestSubmissionModel.findById(existingReport.submissionId).lean();
                }
            }
            if (!submission && mongoose.Types.ObjectId.isValid(submissionId)) {
                submission = await TestSubmissionModel.findOne({ testId: submissionId }).sort({ submittedAt: -1 }).lean();
            }

            if (submission) {
                candidate = await CandidateModel.findById(submission.candidateId).lean();
                testConfig = await TestConfigModel.findById(submission.testId).lean();
                if (!existingReport) {
                    existingReport = await EIRFReportModel.findOne({
                        $or: [{ submissionId: String(submission._id || submission.id) }, { reportId: String(submissionId) }]
                    }).lean();
                }
            }
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submission = db.testSubmissions.find(s => String(s._id || s.id) === String(submissionId));
            if (!submission) {
                db.eirfReports = db.eirfReports || [];
                existingReport = db.eirfReports.find(r => String(r.reportId) === String(submissionId) || String(r.submissionId) === String(submissionId));
                if (existingReport && existingReport.submissionId) {
                    submission = db.testSubmissions.find(s => String(s._id || s.id) === String(existingReport.submissionId));
                }
            }
            if (!submission) {
                submission = db.testSubmissions.find(s => String(s.testId) === String(submissionId));
            }
            if (submission) {
                candidate = (db.candidates || []).find(c => String(c._id || c.id) === String(submission.candidateId) || c.studentId === submission.studentId);
                testConfig = (db.tests || []).find(t => String(t._id || t.id) === String(submission.testId));
                if (!existingReport) {
                    db.eirfReports = db.eirfReports || [];
                    existingReport = db.eirfReports.find(r => String(r.submissionId) === String(submission._id || submission.id));
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
            if (ev.type === 'FULLSCREEN_EXIT') {
                if (dur > maxFullscreenSeconds) maxFullscreenSeconds = dur;
                if (dur > 5) {
                    hasFullscreenFlag = true;
                    flaggedReasons.push(`Fullscreen exit duration: ${dur} seconds (exceeds 5s threshold)`);
                }
            } else if (ev.type === 'TAB_SWITCH') {
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

        if (fsCount > 0 && !flaggedReasons.some(r => r.includes('Fullscreen'))) {
            flaggedReasons.push(`Fullscreen exit recorded: ${fsCount} exit(s) (Max: ${maxFullscreenSeconds}s)`);
        }
        if (tabCount > 0 && !flaggedReasons.some(r => r.includes('Tab switch'))) {
            flaggedReasons.push(`Tab switch / focus loss recorded: ${tabCount} switch(es) (Max: ${maxTabSwitchSeconds}s)`);
        }

        const totalWarningsCount = fsCount + tabCount;
        if (submission.status === 'auto-submitted' || totalWarningsCount >= 3) {
            flaggedReasons.push(`Exam attempt auto-submitted due to reaching maximum compliance warnings (${totalWarningsCount} warnings).`);
        }

        const hasEirfFlag = Boolean(submission.hasEirfFlag || hasFullscreenFlag || hasTabSwitchFlag || hasNetworkFlag || submission.status === 'auto-submitted' || totalWarningsCount >= 3 || fsCount > 0 || tabCount > 0);

        if (flaggedReasons.length === 0 && hasEirfFlag) {
            flaggedReasons.push(`Proctoring alert flagged by administration for incident review.`);
        }

        const uniqueFlaggedReasons = Array.from(new Set(flaggedReasons));

        const submittedAt = submission.submittedAt || submission.startedAt || new Date();
        const expiresAt = new Date(new Date(submittedAt).getTime() + 45 * 60 * 1000);
        const isExpired = Date.now() > expiresAt.getTime();

        const isAdmin = Boolean(
            req.query.role === 'admin' ||
            req.query.isAdmin === 'true' ||
            req.headers['x-admin-role'] === 'admin' ||
            req.headers['x-api-secret'] ||
            req.query.apiSecret ||
            req.session?.admin
        );

        if (isExpired && !isAdmin && !existingReport) {
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

        return res.json({
            submissionId,
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

// 2. Generate & save encrypted database payload for EIRF backup (.eirf)
router.post('/test/eirf/generate-payload', async (req, res) => {
    const { submissionId, studentId: reqStudentId, answers, proctoringLog } = req.body;
    if (!submissionId) {
        return res.status(400).json({ error: "Submission ID is required." });
    }

    try {
        let submission = null;
        if (dbState.useMongo) {
            if (mongoose.Types.ObjectId.isValid(submissionId)) {
                submission = await TestSubmissionModel.findById(submissionId);
            }
            if (!submission) {
                submission = await TestSubmissionModel.findOne({ _id: submissionId });
            }
        } else {
            const db = getJSONData();
            submission = (db.testSubmissions || []).find(s => String(s._id || s.id) === String(submissionId));
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
        let submission = null;
        let candidate = null;
        let testConfig = null;

        if (dbState.useMongo) {
            if (mongoose.Types.ObjectId.isValid(submissionId)) {
                submission = await TestSubmissionModel.findById(submissionId);
            }
            if (!submission) {
                submission = await TestSubmissionModel.findOne({ _id: submissionId });
            }
            if (submission) {
                candidate = await CandidateModel.findById(submission.candidateId).lean();
                testConfig = await TestConfigModel.findById(submission.testId).lean();
            }
        } else {
            const db = getJSONData();
            db.testSubmissions = db.testSubmissions || [];
            submission = db.testSubmissions.find(s => String(s._id || s.id) === String(submissionId));
            if (submission) {
                candidate = (db.candidates || []).find(c => String(c._id || c.id) === String(submission.candidateId) || c.studentId === submission.studentId);
                testConfig = (db.tests || []).find(t => String(t._id || t.id) === String(submission.testId));
            }
        }

        if (!submission) {
            return res.status(404).json({ error: "Examination submission record not found." });
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
        const submittedAt = submission.submittedAt || new Date();
        const expiresAt = new Date(new Date(submittedAt).getTime() + 45 * 60 * 1000);
        if (Date.now() > expiresAt.getTime()) {
            return res.status(410).json({ success: false, error: "The Emergency Incident Report Form (EIRF) is closed, moved, or unavailable at this link." });
        }

        const rawIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                       req.socket?.remoteAddress || 
                       req.ip || 
                       '127.0.0.1';
        const cleanIp = rawIp.replace(/^::ffff:/, '');

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
            encryptedPayloadUploaded: !!rawPayload,
            payloadFileName: rawFileName,
            verificationStatus,
            verificationDetails,
            status: 'pending_review',
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
            saveJSONData(db);
        }

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

// 4. Admin: List All EIRF Reports
router.get('/admin/eirf/list', async (req, res) => {
    try {
        if (dbState.useMongo) {
            const reports = await EIRFReportModel.find()
                .select('-decryptedPayloadSnapshot -proctoringLogSnapshot')
                .sort({ submittedAt: -1 })
                .lean();
            return res.json(reports);
        } else {
            const db = getJSONData();
            db.eirfReports = db.eirfReports || [];
            const safeReports = db.eirfReports.map(({ decryptedPayloadSnapshot, proctoringLogSnapshot, ...rest }) => rest);
            return res.json(safeReports);
        }
    } catch (e) {
        console.error("Admin EIRF list error:", e);
        return res.status(500).json({ error: e.message });
    }
});

// 5. Admin: Approve or Reject EIRF Incident Report
router.post('/admin/eirf/action/:reportId', async (req, res) => {
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
                submission.eirfStatus = status;
                await submission.save();
            }
        } else {
            const db = getJSONData();
            db.eirfReports = db.eirfReports || [];
            const idx = db.eirfReports.findIndex(r => String(r.reportId) === String(reportId) || String(r._id) === String(reportId));
            if (idx === -1) {
                return res.status(404).json({ error: "EIRF Incident Report not found." });
            }
            db.eirfReports[idx].status = status;
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

                await sendEirfVerdictEmail(
                    candidateEmail,
                    candidateName,
                    examTitleStr,
                    status,
                    adminRemarks,
                    finalPdfUrl,
                    { studentId, submissionId: report.submissionId }
                );

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
