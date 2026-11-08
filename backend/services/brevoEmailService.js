/**
 * BICS Transactional Email Engine (Brevo API v3)
 * Institutional Sender: Department of Examination, BICS <noreply.bicsportal@gmail.com>
 * 
 * Manages the 5 core lifecycle email milestones:
 * 1. test_submitted - Submission confirmation (unflagged immediately, or deferred if flagged)
 * 2. eirf_filing    - Emergency Incident Report filing notice (45-min magic link)
 * 3. eirf_approved  - EIRF verdict approval (restored score, official 2-page verdict PDF attached)
 * 4. eirf_rejected  - EIRF verdict rejection (sanction upheld, appeal rights, official 2-page verdict PDF attached)
 * 5. otrf_sent      - Online Test Report Form (toggled to 'closed' for the first time, official OTRF PDF attached)
 */

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const { TestSubmissionModel } = require('../models/TestSubmission');
const { EIRFReportModel } = require('../models/EIRFReport');
const { CandidateModel } = require('../models/Candidate');
const { TestConfigModel } = require('../models/TestConfig');
const { generateEirfVerdictPdfBuffer } = require('./pdf/eirfVerdictPdf');
const { generateOtrfReportPdfBuffer } = require('./pdf/otrfReportPdf');
const { toBicsId } = require('../utils/bicsId');

// JSON DB Fallback helpers
let getJSONData, saveJSONData;
try {
    const localDb = require('../utils/localDb');
    getJSONData = localDb.getJSONData;
    saveJSONData = localDb.saveJSONData;
} catch (e) {
    getJSONData = () => ({});
    saveJSONData = () => {};
}

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'noreply.bicsportal@gmail.com';
const SENDER_NAME = process.env.BREVO_SENDER_NAME || 'Department of Examination, BICS';

// Fallback SMTP Transporter
const smtpUser = process.env.SMTP_USER || 'preliminaryexaminations@gmail.com';
const smtpPass = process.env.SMTP_PASS || 'bcrgqkpautlzkqzy';
const smtpTransporter = (smtpUser && smtpPass) ? nodemailer.createTransport({
    service: 'gmail',
    auth: { user: smtpUser, pass: smtpPass },
    connectionTimeout: 8000,
    greetingTimeout: 6000,
    socketTimeout: 8000
}) : null;

/**
 * Formats a Date object or timestamp into standard IST string representation
 * Example: "08/11/2026, 05:45:00 PM IST"
 */
function formatISTDate(dateVal) {
    try {
        const d = dateVal ? new Date(dateVal) : new Date();
        if (isNaN(d.getTime())) return new Date().toISOString();
        return d.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        }) + ' IST';
    } catch (e) {
        return new Date(dateVal || Date.now()).toISOString();
    }
}

/**
 * Loads an unaltered HTML template and merges dynamic variables
 * Without modifying any CSS, table structure, or layout tags
 */
function renderEmailTemplate(templateName, variables = {}) {
    const templatePath = path.join(__dirname, '..', 'templates', 'emails', `${templateName}.html`);
    if (!fs.existsSync(templatePath)) {
        throw new Error(`Email template not found at: ${templatePath}`);
    }
    let html = fs.readFileSync(templatePath, 'utf8');

    for (const [key, value] of Object.entries(variables)) {
        const safeVal = (value !== undefined && value !== null) ? String(value) : 'N/A';
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
        html = html.replace(regex, safeVal);
    }
    return html;
}

/**
 * Core Brevo Transactional Email Sender with Base64 Direct Binary Attachments
 * Gracefully falls back to Nodemailer SMTP and console logging
 */
async function sendBrevoTransactionalEmail({ to, toName, subject, htmlContent, attachments = [], tags = [] }) {
    const apiKey = process.env.BREVO_API_KEY;

    // Format attachments for Brevo: array of { name: 'file.pdf', content: '<base64>' }
    const brevoAttachments = (attachments || []).map(att => {
        let b64Content = '';
        if (Buffer.isBuffer(att.content)) {
            b64Content = att.content.toString('base64');
        } else if (typeof att.content === 'string') {
            b64Content = att.content.startsWith('data:') ? att.content.split(',')[1] : att.content;
        }
        return {
            name: att.name || 'document.pdf',
            content: b64Content
        };
    });

    if (apiKey) {
        try {
            const payload = {
                sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                to: [{ email: to, name: toName || 'Candidate' }],
                subject,
                htmlContent,
                tags: Array.isArray(tags) ? tags : [tags]
            };

            if (brevoAttachments.length > 0) {
                payload.attachment = brevoAttachments;
            }

            const response = await fetch(BREVO_API_URL, {
                method: 'POST',
                headers: {
                    'api-key': apiKey,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const resJson = await response.json();
                console.log(`[BREVO_EMAIL_SERVICE] Dispatched successfully to ${to}. MessageId: ${resJson.messageId}`);
                return { success: true, transport: 'brevo', messageId: resJson.messageId };
            } else {
                const errText = await response.text();
                console.error(`[BREVO_EMAIL_SERVICE_ERROR] Brevo status ${response.status}: ${errText}. Attempting SMTP fallback...`);
            }
        } catch (fetchErr) {
            console.error(`[BREVO_EMAIL_SERVICE_ERROR] Brevo network request failed: ${fetchErr.message}. Attempting SMTP fallback...`);
        }
    } else {
        console.warn(`[BREVO_EMAIL_SERVICE] BREVO_API_KEY not configured. Falling back to SMTP.`);
    }

    // Secondary Fallback: Nodemailer SMTP
    if (smtpTransporter) {
        try {
            const smtpAttachments = (attachments || []).map(att => ({
                filename: att.name || 'document.pdf',
                content: Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content, 'base64')
            }));

            const mailOptions = {
                from: `"${SENDER_NAME}" <${smtpUser}>`,
                to,
                subject,
                html: htmlContent,
                attachments: smtpAttachments
            };

            const info = await smtpTransporter.sendMail(mailOptions);
            console.log(`[BREVO_EMAIL_SERVICE] (SMTP Fallback) Email delivered to ${to}. MessageId: ${info.messageId}`);
            return { success: true, transport: 'smtp', messageId: info.messageId };
        } catch (smtpErr) {
            console.error(`[BREVO_EMAIL_SERVICE_ERROR] SMTP fallback failed: ${smtpErr.message}`);
        }
    }

    // Tertiary Fallback: Structured Console Log
    console.log(`\n==================================================`);
    console.log(`[BREVO EMAIL SERVICE AUDIT - DISPATCH SIMULATED]`);
    console.log(`Sender: ${SENDER_NAME} <${SENDER_EMAIL}>`);
    console.log(`Recipient: ${to} (${toName})`);
    console.log(`Subject: ${subject}`);
    console.log(`Attachments: ${brevoAttachments.map(a => a.name).join(', ') || 'None'}`);
    console.log(`==================================================\n`);
    return { success: true, transport: 'console_audit', messageId: `audit_${Date.now()}` };
}

/**
 * Resolves candidate email and profile details
 */
async function resolveCandidateInfo(candidateId, fallbackName = 'Candidate') {
    let email = null;
    let fullName = fallbackName;
    let studentId = '';

    if (candidateId && mongoose.connection.readyState === 1) {
        try {
            const cand = await CandidateModel.findById(candidateId).select('email personalEmail fullName name studentId');
            if (cand) {
                email = cand.personalEmail || cand.email;
                fullName = cand.fullName || cand.name || fallbackName;
                studentId = cand.studentId || '';
            }
        } catch (e) {}
    }

    if (!email) {
        try {
            const db = getJSONData();
            const cand = (db.candidates || []).find(c => String(c._id) === String(candidateId) || String(c.id) === String(candidateId));
            if (cand) {
                email = cand.personalEmail || cand.email;
                fullName = cand.fullName || cand.name || fallbackName;
                studentId = cand.studentId || '';
            }
        } catch (e) {}
    }

    return { email: email || 'noreply.bicsportal@gmail.com', fullName, studentId };
}

/**
 * Resolves test config metadata
 */
async function resolveTestInfo(testId) {
    let testTitle = 'Preliminary Examination 2026';
    let courseName = 'Preliminary Examination Course';
    let courseCode = 'BICS-2026';
    let maxMarks = 100;
    let academicTerm = '2026-2027';

    if (testId && mongoose.connection.readyState === 1) {
        try {
            const test = await TestConfigModel.findById(testId).select('title courseName courseCode totalMarks maxMarks academicTerm subject code');
            if (test) {
                testTitle = test.title || testTitle;
                courseName = test.courseName || test.subject || courseName;
                courseCode = test.courseCode || test.code || courseCode;
                maxMarks = test.totalMarks || test.maxMarks || maxMarks;
                academicTerm = test.academicTerm || academicTerm;
            }
        } catch (e) {}
    }

    if (courseName === 'Preliminary Examination Course') {
        try {
            const db = getJSONData();
            const test = (db.tests || []).find(t => String(t._id) === String(testId) || String(t.id) === String(testId));
            if (test) {
                testTitle = test.title || testTitle;
                courseName = test.courseName || test.subject || courseName;
                courseCode = test.courseCode || test.code || courseCode;
                maxMarks = test.totalMarks || test.maxMarks || maxMarks;
                academicTerm = test.academicTerm || academicTerm;
            }
        } catch (e) {}
    }

    return { testTitle, courseName, courseCode, maxMarks, academicTerm };
}

/**
 * -----------------------------------------------------------------------------
 * 1. DISPATCH TEST SUBMISSION CONFIRMATION EMAIL
 * -----------------------------------------------------------------------------
 * Trigger:
 *   - If hasEirfFlag === false: Sent immediately upon submission
 *   - If hasEirfFlag === true: Held and sent ONLY AFTER EIRF is submitted OR 45m expires
 * Idempotency: emailsSent.testSubmitted === true
 */
async function sendTestSubmittedEmail(submissionId) {
    if (!submissionId) return { success: false, reason: 'Missing submissionId' };

    let sub = null;
    if (mongoose.connection.readyState === 1) {
        sub = await TestSubmissionModel.findById(submissionId);
    } else {
        const db = getJSONData();
        sub = (db.testSubmissions || []).find(s => String(s._id) === String(submissionId) || String(s.id) === String(submissionId));
    }
    if (!sub) return { success: false, reason: 'Submission not found' };

    // Idempotency check: strictly sent only once
    if (sub.emailsSent && sub.emailsSent.testSubmitted) {
        console.log(`[IDEMPOTENCY_GUARD] test_submitted email already sent for submission ${sub._id}. Skipping.`);
        return { success: true, skipped: true, reason: 'Already sent' };
    }

    const candidate = await resolveCandidateInfo(sub.candidateId, sub.candidateName);
    const testInfo = await resolveTestInfo(sub.testId);

    const testRefId = sub.submissionRefId || String(sub._id);
    const testName = sub.testTitle || testInfo.testTitle;
    const courseName = testInfo.courseName;
    const courseCode = testInfo.courseCode;
    const maxMarks = testInfo.maxMarks;
    const startTime = formatISTDate(sub.startedAt);
    const submittedTime = formatISTDate(sub.submittedAt || Date.now());

    const variables = {
        candidate_name: candidate.fullName,
        test_ref_id: testRefId,
        test_name: testName,
        course_name: courseName,
        course_code: courseCode,
        max_marks: maxMarks,
        start_time: startTime,
        submitted_time: submittedTime
    };

    const subject = `Submission Confirmed: ${testName} (${testRefId}) | BICS Preliminary Examinations 2026`;
    const htmlContent = renderEmailTemplate('test_submitted', variables);

    const result = await sendBrevoTransactionalEmail({
        to: candidate.email,
        toName: candidate.fullName,
        subject,
        htmlContent,
        tags: ['bics-exam', 'test-submitted']
    });

    // Mark idempotency flag atomically
    if (mongoose.connection.readyState === 1) {
        await TestSubmissionModel.updateOne(
            { _id: sub._id },
            { $set: { 'emailsSent.testSubmitted': true, 'emailsSent.testSubmittedAt': new Date() } }
        );
    } else {
        const db = getJSONData();
        const target = (db.testSubmissions || []).find(s => String(s._id) === String(sub._id) || String(s.id) === String(sub._id));
        if (target) {
            target.emailsSent = target.emailsSent || {};
            target.emailsSent.testSubmitted = true;
            target.emailsSent.testSubmittedAt = new Date().toISOString();
            saveJSONData(db);
        }
    }

    return result;
}

/**
 * -----------------------------------------------------------------------------
 * 2. DISPATCH EIRF FILING NOTICE EMAIL (45-Minute Window)
 * -----------------------------------------------------------------------------
 * Trigger: Immediately when proctoring security evaluation flags an incident (hasEirfFlag === true)
 * Idempotency: emailsSent.eirfFiling === true
 */
async function sendEirfFilingNoticeEmail(submissionId, options = {}) {
    if (!submissionId) return { success: false, reason: 'Missing submissionId' };

    let sub = null;
    if (mongoose.connection.readyState === 1) {
        sub = await TestSubmissionModel.findById(submissionId);
    } else {
        const db = getJSONData();
        sub = (db.testSubmissions || []).find(s => String(s._id) === String(submissionId) || String(s.id) === String(submissionId));
    }
    if (!sub) return { success: false, reason: 'Submission not found' };

    // Idempotency check
    if (sub.emailsSent && sub.emailsSent.eirfFiling) {
        console.log(`[IDEMPOTENCY_GUARD] eirf_filing notice already sent for submission ${sub._id}. Skipping.`);
        return { success: true, skipped: true, reason: 'Already sent' };
    }

    const candidate = await resolveCandidateInfo(sub.candidateId, sub.candidateName);
    const testInfo = await resolveTestInfo(sub.testId);

    const submissionRefId = sub.submissionRefId || String(sub._id);
    const testTitle = sub.testTitle || testInfo.testTitle;
    const courseName = testInfo.courseName;
    const courseCode = testInfo.courseCode;
    const academicTerm = testInfo.academicTerm || '2026-2027';

    // Format incident summary
    let incidentType = 'UNAUTHORIZED_WINDOW_DEVIATION / FULLSCREEN_EXIT';
    if (sub.flaggedReasons && sub.flaggedReasons.length > 0) {
        incidentType = sub.flaggedReasons.join('; ');
    }

    const expiresAt = sub.eirfExpiresAt || options.expiresAt || new Date(Date.now() + 45 * 60 * 1000);
    const eirfExpiresAt = formatISTDate(expiresAt);

    // Build one-time magic link from 24-byte token
    const isProd = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
    const defaultPortalUrl = isProd ? 'https://bicsportal.netlify.app' : 'http://localhost:5174';
    const basePortalUrl = (process.env.PORTAL_URL || process.env.DASHBOARD_URL || defaultPortalUrl).replace(/\/+$/, '');
    const encryptedBicsId = toBicsId(sub._id || sub.id || submissionId);
    const token = sub.eirfToken || options.token || '';
    const eirfLink = options.magicLink || `${basePortalUrl}/assessment/evaluation/eirf/${encryptedBicsId}?token=${token}`;

    const variables = {
        candidate_name: candidate.fullName,
        submission_ref_id: submissionRefId,
        test_title: testTitle,
        course_name: courseName,
        course_code: courseCode,
        academic_term: academicTerm,
        incident_type: incidentType,
        eirf_expires_at: eirfExpiresAt,
        eirf_link: eirfLink
    };

    const subject = `Action Required: File your Emergency Incident Report Form within 45 minutes | ${submissionRefId}`;
    const htmlContent = renderEmailTemplate('eirf_filing', variables);

    const result = await sendBrevoTransactionalEmail({
        to: candidate.email,
        toName: candidate.fullName,
        subject,
        htmlContent,
        tags: ['bics-integrity', 'eirf-filing-notice']
    });

    // Mark idempotency flag atomically
    if (mongoose.connection.readyState === 1) {
        await TestSubmissionModel.updateOne(
            { _id: sub._id },
            { $set: { 'emailsSent.eirfFiling': true, 'emailsSent.eirfFilingAt': new Date() } }
        );
    } else {
        const db = getJSONData();
        const target = (db.testSubmissions || []).find(s => String(s._id) === String(sub._id) || String(s.id) === String(sub._id));
        if (target) {
            target.emailsSent = target.emailsSent || {};
            target.emailsSent.eirfFiling = true;
            target.emailsSent.eirfFilingAt = new Date().toISOString();
            saveJSONData(db);
        }
    }

    return result;
}

/**
 * -----------------------------------------------------------------------------
 * 3. DISPATCH EIRF VERDICT: APPROVED (Score Restored, PDF Attached)
 * -----------------------------------------------------------------------------
 * Trigger: Administrator decides 'approve' on EIRF Report (POST /admin/eirf/action/:reportId)
 * Mandatory Attachment: {{report_id}}.pdf (Binary Base64 direct attachment)
 * Idempotency: report.emailsSent.approved === true
 */
async function sendEirfVerdictApprovedEmail(reportIdOrDoc, adminDecisionData = {}) {
    let report = null;
    if (typeof reportIdOrDoc === 'object' && reportIdOrDoc !== null) {
        report = reportIdOrDoc;
    } else if (mongoose.connection.readyState === 1) {
        report = await EIRFReportModel.findOne({ reportId: reportIdOrDoc }) || await EIRFReportModel.findById(reportIdOrDoc);
    } else {
        const db = getJSONData();
        report = (db.eirfReports || []).find(r => r.reportId === reportIdOrDoc || String(r._id) === String(reportIdOrDoc) || String(r.id) === String(reportIdOrDoc));
    }
    if (!report) return { success: false, reason: 'EIRF Report not found' };

    // Idempotency check
    if (report.emailsSent && report.emailsSent.approved) {
        console.log(`[IDEMPOTENCY_GUARD] eirf_approved email already sent for report ${report.reportId}. Skipping.`);
        return { success: true, skipped: true, reason: 'Already sent' };
    }

    // Resolve parent submission
    let sub = null;
    if (mongoose.connection.readyState === 1) {
        sub = await TestSubmissionModel.findById(report.submissionId);
    } else {
        const db = getJSONData();
        sub = (db.testSubmissions || []).find(s => String(s._id) === String(report.submissionId) || String(s.id) === String(report.submissionId));
    }

    const candidate = await resolveCandidateInfo(report.candidateId || sub?.candidateId, report.candidateName || sub?.candidateName);
    const testInfo = await resolveTestInfo(report.testId || sub?.testId);

    const reportId = report.reportId || String(report._id);
    const submissionRefId = sub?.submissionRefId || report.submissionId;
    const testTitle = report.testTitle || sub?.testTitle || testInfo.testTitle;
    const courseName = testInfo.courseName;
    const courseCode = testInfo.courseCode;
    const resolutionCategory = adminDecisionData.resolutionCategory || report.resolutionCategory || 'INCIDENT_EXONERATED';
    const remediationAction = adminDecisionData.remediationAction || report.remediationAction || 'SCORE_RESTORED — UNCONDITIONAL RETENTION';
    const reviewedBy = adminDecisionData.reviewedBy || report.reviewedBy || 'BICS Academic Integrity Review Committee';
    const reviewedAtDate = report.reviewedAt || new Date();
    const reviewedAt = formatISTDate(reviewedAtDate);
    const adminRemarks = adminDecisionData.adminRemarks || report.adminRemarks || 'The committee evaluated candidate telemetry and confirmed incident resolution.';
    const digitalHash = report.digitalHash || 'N/A';
    
    // Statutory hardcopy deadline: reviewed_at + 48 hours
    const hardcopyDeadlineDate = new Date(new Date(reviewedAtDate).getTime() + 48 * 60 * 60 * 1000);
    const hardcopyDeadline = formatISTDate(hardcopyDeadlineDate);

    // Generate Official 2-Page Verdict PDF Buffer
    console.log(`[BREVO_EMAIL_SERVICE] Generating official EIRF Verdict PDF Buffer for ${reportId}...`);
    const pdfBuffer = await generateEirfVerdictPdfBuffer({
        reportId,
        submissionId: sub?._id || report.submissionId,
        submissionRefId,
        studentId: report.studentId || candidate.studentId,
        candidateName: candidate.fullName,
        testTitle,
        courseName,
        courseCode,
        verdict: 'approved',
        resolutionCategory,
        remediationAction,
        adminRemarks,
        reviewedBy,
        reviewedAt: reviewedAtDate,
        proctoringLog: sub?.proctoringLog || report.proctoringLogSnapshot,
        formAnswers: report.formAnswers || report.additionalAnswers,
        digitalHash
    });

    const variables = {
        candidate_name: candidate.fullName,
        report_id: reportId,
        submission_ref_id: submissionRefId,
        test_title: testTitle,
        course_name: courseName,
        course_code: courseCode,
        resolution_category: resolutionCategory,
        remediation_action: remediationAction,
        reviewed_by: reviewedBy,
        reviewed_at: reviewedAt,
        admin_remarks: adminRemarks,
        digital_hash: digitalHash,
        hardcopy_deadline: hardcopyDeadline
    };

    const subject = `EIRF Approved: Your score has been restored | ${reportId}`;
    const htmlContent = renderEmailTemplate('eirf_approved', variables);

    const result = await sendBrevoTransactionalEmail({
        to: candidate.email,
        toName: candidate.fullName,
        subject,
        htmlContent,
        attachments: [
            {
                name: `${reportId}.pdf`,
                content: pdfBuffer
            }
        ],
        tags: ['bics-verdict', 'eirf-approved']
    });

    // Mark idempotency flags
    if (mongoose.connection.readyState === 1) {
        await EIRFReportModel.updateOne(
            { reportId },
            { $set: { 'emailsSent.approved': true, 'emailsSent.approvedAt': new Date() } }
        );
        if (sub?._id) {
            await TestSubmissionModel.updateOne(
                { _id: sub._id },
                { $set: { 'emailsSent.eirfApproved': true, 'emailsSent.eirfApprovedAt': new Date() } }
            );
        }
    } else {
        const db = getJSONData();
        const rTarget = (db.eirfReports || []).find(r => r.reportId === reportId);
        if (rTarget) {
            rTarget.emailsSent = rTarget.emailsSent || {};
            rTarget.emailsSent.approved = true;
            rTarget.emailsSent.approvedAt = new Date().toISOString();
        }
        if (sub?._id) {
            const sTarget = (db.testSubmissions || []).find(s => String(s._id) === String(sub._id) || String(s.id) === String(sub._id));
            if (sTarget) {
                sTarget.emailsSent = sTarget.emailsSent || {};
                sTarget.emailsSent.eirfApproved = true;
                sTarget.emailsSent.eirfApprovedAt = new Date().toISOString();
            }
        }
        saveJSONData(db);
    }

    return result;
}

/**
 * -----------------------------------------------------------------------------
 * 4. DISPATCH EIRF VERDICT: REJECTED (Score Annulled, Appeal Rights, PDF Attached)
 * -----------------------------------------------------------------------------
 * Trigger: Administrator decides 'reject' on EIRF Report (POST /admin/eirf/action/:reportId)
 * Mandatory Attachment: {{report_id}}.pdf (Binary Base64 direct attachment)
 * Idempotency: report.emailsSent.rejected === true
 */
async function sendEirfVerdictRejectedEmail(reportIdOrDoc, adminDecisionData = {}) {
    let report = null;
    if (typeof reportIdOrDoc === 'object' && reportIdOrDoc !== null) {
        report = reportIdOrDoc;
    } else if (mongoose.connection.readyState === 1) {
        report = await EIRFReportModel.findOne({ reportId: reportIdOrDoc }) || await EIRFReportModel.findById(reportIdOrDoc);
    } else {
        const db = getJSONData();
        report = (db.eirfReports || []).find(r => r.reportId === reportIdOrDoc || String(r._id) === String(reportIdOrDoc) || String(r.id) === String(reportIdOrDoc));
    }
    if (!report) return { success: false, reason: 'EIRF Report not found' };

    // Idempotency check
    if (report.emailsSent && report.emailsSent.rejected) {
        console.log(`[IDEMPOTENCY_GUARD] eirf_rejected email already sent for report ${report.reportId}. Skipping.`);
        return { success: true, skipped: true, reason: 'Already sent' };
    }

    // Resolve parent submission
    let sub = null;
    if (mongoose.connection.readyState === 1) {
        sub = await TestSubmissionModel.findById(report.submissionId);
    } else {
        const db = getJSONData();
        sub = (db.testSubmissions || []).find(s => String(s._id) === String(report.submissionId) || String(s.id) === String(report.submissionId));
    }

    const candidate = await resolveCandidateInfo(report.candidateId || sub?.candidateId, report.candidateName || sub?.candidateName);
    const testInfo = await resolveTestInfo(report.testId || sub?.testId);

    const reportId = report.reportId || String(report._id);
    const submissionRefId = sub?.submissionRefId || report.submissionId;
    const testTitle = report.testTitle || sub?.testTitle || testInfo.testTitle;
    const courseName = testInfo.courseName;
    const courseCode = testInfo.courseCode;
    const resolutionCategory = adminDecisionData.resolutionCategory || report.resolutionCategory || 'UNAUTHORIZED_WINDOW_DEVIATION';
    const remediationAction = adminDecisionData.remediationAction || report.remediationAction || 'SESSION ANNULLED — ZERO SCORE RECORDED';
    const reviewedBy = adminDecisionData.reviewedBy || report.reviewedBy || 'BICS Academic Integrity Review Committee';
    const reviewedAtDate = report.reviewedAt || new Date();
    const reviewedAt = formatISTDate(reviewedAtDate);
    const adminRemarks = adminDecisionData.adminRemarks || report.adminRemarks || 'The committee concluded that security violations invalidate the examination session.';
    const digitalHash = report.digitalHash || 'N/A';

    // Statutory deadlines: reviewed_at + 48 hours
    const deadlineDate = new Date(new Date(reviewedAtDate).getTime() + 48 * 60 * 60 * 1000);
    const hardcopyDeadline = formatISTDate(deadlineDate);
    const appealDeadline = formatISTDate(deadlineDate);

    // Appeal link
    const isProd = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
    const defaultPortalUrl = isProd ? 'https://bicsportal.netlify.app' : 'http://localhost:5174';
    const basePortalUrl = (process.env.PORTAL_URL || process.env.DASHBOARD_URL || defaultPortalUrl).replace(/\/+$/, '');
    const appealLink = `${basePortalUrl}/candidate/grievance?reportId=${reportId}`;

    // Generate Official 2-Page Verdict PDF Buffer
    console.log(`[BREVO_EMAIL_SERVICE] Generating official EIRF Verdict PDF Buffer for ${reportId}...`);
    const pdfBuffer = await generateEirfVerdictPdfBuffer({
        reportId,
        submissionId: sub?._id || report.submissionId,
        submissionRefId,
        studentId: report.studentId || candidate.studentId,
        candidateName: candidate.fullName,
        testTitle,
        courseName,
        courseCode,
        verdict: 'rejected',
        resolutionCategory,
        remediationAction,
        adminRemarks,
        reviewedBy,
        reviewedAt: reviewedAtDate,
        proctoringLog: sub?.proctoringLog || report.proctoringLogSnapshot,
        formAnswers: report.formAnswers || report.additionalAnswers,
        digitalHash
    });

    const variables = {
        candidate_name: candidate.fullName,
        report_id: reportId,
        submission_ref_id: submissionRefId,
        test_title: testTitle,
        course_name: courseName,
        course_code: courseCode,
        resolution_category: resolutionCategory,
        remediation_action: remediationAction,
        reviewed_by: reviewedBy,
        reviewed_at: reviewedAt,
        admin_remarks: adminRemarks,
        digital_hash: digitalHash,
        hardcopy_deadline: hardcopyDeadline,
        appeal_deadline: appealDeadline,
        appeal_link: appealLink
    };

    const subject = `EIRF Verdict: Not approved | ${reportId}`;
    const htmlContent = renderEmailTemplate('eirf_rejected', variables);

    const result = await sendBrevoTransactionalEmail({
        to: candidate.email,
        toName: candidate.fullName,
        subject,
        htmlContent,
        attachments: [
            {
                name: `${reportId}.pdf`,
                content: pdfBuffer
            }
        ],
        tags: ['bics-verdict', 'eirf-rejected']
    });

    // Mark idempotency flags
    if (mongoose.connection.readyState === 1) {
        await EIRFReportModel.updateOne(
            { reportId },
            { $set: { 'emailsSent.rejected': true, 'emailsSent.rejectedAt': new Date() } }
        );
        if (sub?._id) {
            await TestSubmissionModel.updateOne(
                { _id: sub._id },
                { $set: { 'emailsSent.eirfRejected': true, 'emailsSent.eirfRejectedAt': new Date() } }
            );
        }
    } else {
        const db = getJSONData();
        const rTarget = (db.eirfReports || []).find(r => r.reportId === reportId);
        if (rTarget) {
            rTarget.emailsSent = rTarget.emailsSent || {};
            rTarget.emailsSent.rejected = true;
            rTarget.emailsSent.rejectedAt = new Date().toISOString();
        }
        if (sub?._id) {
            const sTarget = (db.testSubmissions || []).find(s => String(s._id) === String(sub._id) || String(s.id) === String(sub._id));
            if (sTarget) {
                sTarget.emailsSent = sTarget.emailsSent || {};
                sTarget.emailsSent.eirfRejected = true;
                sTarget.emailsSent.eirfRejectedAt = new Date().toISOString();
            }
        }
        saveJSONData(db);
    }

    return result;
}

/**
 * -----------------------------------------------------------------------------
 * 5. DISPATCH ONLINE TEST REPORT FORM (OTRF) EMAIL (PDF Attached)
 * -----------------------------------------------------------------------------
 * Trigger: When verificationStatus is toggled to 'closed' for the first time
 * Mandatory Attachment: OTRF_{{test_ref_id}}.pdf (Binary Base64 direct attachment)
 * Idempotency: emailsSent.otrfSent === true
 */
async function sendOtrfEmail(submissionIdOrDoc) {
    let sub = null;
    if (typeof submissionIdOrDoc === 'object' && submissionIdOrDoc !== null) {
        sub = submissionIdOrDoc;
    } else if (mongoose.connection.readyState === 1) {
        sub = await TestSubmissionModel.findById(submissionIdOrDoc);
    } else {
        const db = getJSONData();
        sub = (db.testSubmissions || []).find(s => String(s._id) === String(submissionIdOrDoc) || String(s.id) === String(submissionIdOrDoc));
    }
    if (!sub) return { success: false, reason: 'Submission not found' };

    // Idempotency check: strictly sent only once when closed for the first time
    if (sub.emailsSent && sub.emailsSent.otrfSent) {
        console.log(`[IDEMPOTENCY_GUARD] otrf_sent email already sent for submission ${sub._id}. Skipping.`);
        return { success: true, skipped: true, reason: 'Already sent' };
    }

    const candidate = await resolveCandidateInfo(sub.candidateId, sub.candidateName);
    const testInfo = await resolveTestInfo(sub.testId);

    const testRefId = sub.submissionRefId || String(sub._id);
    const testName = sub.testTitle || testInfo.testTitle;
    const courseName = testInfo.courseName;
    const courseCode = testInfo.courseCode;

    // Physical submission deadline to course instructor: submission closure + 7 days
    const dopsDate = formatISTDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

    // Generate Official Multi-Page OTRF PDF Buffer
    console.log(`[BREVO_EMAIL_SERVICE] Generating official OTRF PDF Buffer for ${testRefId}...`);
    const otrfPdfBuffer = await generateOtrfReportPdfBuffer({
        submissionId: sub._id,
        testId: sub.testId,
        submissionRefId: testRefId
    });

    const variables = {
        candidate_name: candidate.fullName,
        test_ref_id: testRefId,
        test_name: testName,
        course_name: courseName,
        course_code: courseCode,
        dops_date: dopsDate
    };

    const subject = `Online Test Report Form (OTRF): ${testName} (${testRefId}) | BICS Preliminary Examinations 2026`;
    const htmlContent = renderEmailTemplate('otrf_sent', variables);

    const result = await sendBrevoTransactionalEmail({
        to: candidate.email,
        toName: candidate.fullName,
        subject,
        htmlContent,
        attachments: [
            {
                name: `OTRF_${testRefId}.pdf`,
                content: otrfPdfBuffer
            }
        ],
        tags: ['bics-exam', 'otrf-sent']
    });

    // Mark idempotency flag atomically
    if (mongoose.connection.readyState === 1) {
        await TestSubmissionModel.updateOne(
            { _id: sub._id },
            { $set: { 'emailsSent.otrfSent': true, 'emailsSent.otrfSentAt': new Date() } }
        );
    } else {
        const db = getJSONData();
        const target = (db.testSubmissions || []).find(s => String(s._id) === String(sub._id) || String(s.id) === String(sub._id));
        if (target) {
            target.emailsSent = target.emailsSent || {};
            target.emailsSent.otrfSent = true;
            target.emailsSent.otrfSentAt = new Date().toISOString();
            saveJSONData(db);
        }
    }

    return result;
}

/**
 * -----------------------------------------------------------------------------
 * 6. BATCH DISPATCH OTRF WHEN VERIFICATION STATUS IS TOGGLED TO 'closed'
 * -----------------------------------------------------------------------------
 * Called when verificationStatus changes to 'closed' for a test.
 * Dispatches only to candidate submissions that have not yet received their OTRF.
 */
async function dispatchOtrfBatchForClosedTest(testId) {
    if (!testId) return { dispatched: 0, skipped: 0 };
    console.log(`[BREVO_EMAIL_SERVICE] Initiating first-time OTRF batch dispatch for closed test ${testId}...`);

    let eligibleSubmissions = [];
    if (mongoose.connection.readyState === 1) {
        eligibleSubmissions = await TestSubmissionModel.find({
            testId,
            isDeleted: false,
            'emailsSent.otrfSent': { $ne: true }
        });
    } else {
        const db = getJSONData();
        eligibleSubmissions = (db.testSubmissions || []).filter(s => {
            const matchTest = String(s.testId) === String(testId) || String(s.testConfigId) === String(testId);
            const notDeleted = !s.isDeleted;
            const notSent = !(s.emailsSent && s.emailsSent.otrfSent);
            return matchTest && notDeleted && notSent;
        });
    }

    console.log(`[BREVO_EMAIL_SERVICE] Found ${eligibleSubmissions.length} candidate submission(s) pending first-time OTRF email.`);
    let dispatched = 0;
    let failed = 0;

    for (const sub of eligibleSubmissions) {
        try {
            const res = await sendOtrfEmail(sub);
            if (res && res.success && !res.skipped) {
                dispatched++;
            }
        } catch (err) {
            failed++;
            console.error(`[BREVO_EMAIL_SERVICE] Failed OTRF dispatch for submission ${sub._id}:`, err.message);
        }
    }

    console.log(`[BREVO_EMAIL_SERVICE] OTRF Batch Complete: ${dispatched} dispatched, ${failed} failed.`);
    return { dispatched, failed, totalEligible: eligibleSubmissions.length };
}

module.exports = {
    formatISTDate,
    renderEmailTemplate,
    sendBrevoTransactionalEmail,
    sendTestSubmittedEmail,
    sendEirfFilingNoticeEmail,
    sendEirfVerdictApprovedEmail,
    sendEirfVerdictRejectedEmail,
    sendOtrfEmail,
    dispatchOtrfBatchForClosedTest
};
