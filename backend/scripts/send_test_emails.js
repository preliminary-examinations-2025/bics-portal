/**
 * Test script to dispatch live verification emails via Google Gmail REST API:
 * 1. Success Message: Test Submission Confirmation
 * 2. Message with Attachment: EIRF Approved Verdict Notice with in-memory generated official 2-Page PDF
 * 
 * Recipient: preliminaryexaminations@gmail.com
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const {
    renderEmailTemplate,
    sendGmailRestEmail,
    formatISTDate
} = require('../services/gmailEmailService');
const { generateEirfVerdictPdfBuffer } = require('../services/pdf/eirfVerdictPdf');

async function run() {
    const targetRecipient = 'preliminaryexaminations@gmail.com';
    const recipientName = 'BICS Examination Board';

    console.log(`\n======================================================`);
    console.log(`[BICS GMAIL REST API DISPATCH TEST]`);
    console.log(`Target: ${targetRecipient}`);
    console.log(`Sender: ${process.env.GMAIL_SENDER_NAME} <${process.env.GMAIL_SENDER_EMAIL}>`);
    console.log(`======================================================\n`);

    // -------------------------------------------------------------------------
    // TEST EMAIL 1: Success Message (Test Submission Confirmation)
    // -------------------------------------------------------------------------
    console.log(`[1/2] Preparing and dispatching Test Submission Success Email...`);
    const submissionVars = {
        candidate_name: 'Dr. S. Bubere (Chief Invigilator)',
        test_name: 'Advanced Algorithms & Distributed Systems',
        test_ref_id: 'SUB-2026-BICS-88219',
        course_name: 'Computer Science & Engineering',
        course_code: 'CSE-802',
        max_marks: '100',
        start_time: formatISTDate(new Date(Date.now() - 3600000)),
        submitted_time: formatISTDate(new Date())
    };

    const submissionSubject = `Test Submission Confirmation: ${submissionVars.test_name} (${submissionVars.test_ref_id}) | BICS Preliminary Examinations 2026`;
    const submissionHtml = renderEmailTemplate('test_submitted', submissionVars);

    const res1 = await sendGmailRestEmail({
        to: targetRecipient,
        toName: recipientName,
        subject: submissionSubject,
        htmlContent: submissionHtml,
        attachments: [],
        tags: ['bics-test', 'success-confirmation']
    });

    console.log(`[1/2] Success Email Result:`, res1);

    // -------------------------------------------------------------------------
    // TEST EMAIL 2: Email with Attachment (EIRF Verdict Approved Notice + PDF)
    // -------------------------------------------------------------------------
    console.log(`\n[2/2] Generating PDF and dispatching EIRF Verdict with Attachment...`);
    const reportId = 'EIRF-2026-90412';
    const submissionRefId = 'SUB-2026-BICS-88219';

    console.log(`Generating in-memory watermarked 2-page EIRF verdict PDF...`);
    const eirfPdfBuffer = await generateEirfVerdictPdfBuffer({
        reportId,
        submissionRefId,
        status: 'approved',
        candidateName: 'Dr. S. Bubere (Chief Invigilator)',
        testTitle: 'Advanced Algorithms & Distributed Systems',
        courseName: 'Computer Science & Engineering',
        courseCode: 'CSE-802',
        resolutionCategory: 'Proctoring Anomaly Exonerated / Medical Emergency Granted',
        remediationAction: 'Original Marks Restored (100% Score Waiver Applied)',
        adminRemarks: 'Full verification completed by Examination Board. Candidate camera glitch validated via hardware proctoring telemetry.',
        digitalHash: 'SHA256:7B9E2D1A8F0C3E5A6B4C2D1E0F9A8B7C6D5E4F3A2B1C0D9E8F7A6B5C4D3E2F1',
        reviewedBy: 'Chief Examination Controller'
    });

    console.log(`Generated PDF buffer size: ${eirfPdfBuffer.length} bytes.`);

    const verdictVars = {
        candidate_name: 'Dr. S. Bubere (Chief Invigilator)',
        test_title: 'Advanced Algorithms & Distributed Systems',
        submission_ref_id: submissionRefId,
        course_name: 'Computer Science & Engineering',
        course_code: 'CSE-802',
        report_id: reportId,
        resolution_category: 'Proctoring Anomaly Exonerated / Medical Emergency Granted',
        remediation_action: 'Original Marks Restored (100% Score Waiver Applied)',
        reviewed_by: 'Chief Examination Controller',
        reviewed_at: formatISTDate(new Date()),
        hardcopy_deadline: formatISTDate(new Date(Date.now() + 7 * 24 * 3600000)),
        digital_hash: 'SHA256:7B9E2D1A8F0C3E5A6B4C2D1E0F9A8B7C6D5E4F3A2B1C0D9E8F7A6B5C4D3E2F1',
        admin_remarks: 'Full verification completed by Examination Board. Candidate camera glitch validated via hardware proctoring telemetry.'
    };

    const verdictSubject = `EIRF Verdict Notice: APPROVED - ${verdictVars.test_title} (${submissionRefId}) | BICS Department of Examination`;
    const verdictHtml = renderEmailTemplate('eirf_approved', verdictVars);

    const res2 = await sendGmailRestEmail({
        to: targetRecipient,
        toName: recipientName,
        subject: verdictSubject,
        htmlContent: verdictHtml,
        attachments: [
            {
                name: `EIRF_Verdict_${reportId}.pdf`,
                content: eirfPdfBuffer
            }
        ],
        tags: ['bics-test', 'verdict-attachment']
    });

    console.log(`[2/2] Attachment Email Result:`, res2);

    console.log(`\n======================================================`);
    console.log(`DISPATCH COMPLETED FOR preliminaryexaminations@gmail.com`);
    console.log(`Email 1 (Success): Message ID ${res1?.messageId || 'N/A'}`);
    console.log(`Email 2 (Attachment): Message ID ${res2?.messageId || 'N/A'}`);
    console.log(`======================================================\n`);
}

run().catch(err => {
    console.error(`[FATAL_TEST_ERROR]`, err);
    process.exit(1);
});
