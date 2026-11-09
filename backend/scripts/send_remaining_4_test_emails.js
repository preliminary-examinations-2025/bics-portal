/**
 * Live Dispatch of Remaining 4 Mobile-Optimized Email Templates:
 * Target: preliminaryexaminations@gmail.com
 * 
 * 1. eirf_filing    - EIRF Incident Notice & 45-min Magic Link
 * 2. eirf_approved  - EIRF Verdict Approved (Score Restored + Official PDF attached)
 * 3. eirf_rejected  - EIRF Verdict Rejected (Score Annulled + Official PDF attached)
 * 4. otrf_sent      - Online Test Report Form (Verification Closed + Official OTRF PDF attached)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const {
    renderEmailTemplate,
    sendGmailRestEmail,
    formatISTDate
} = require('../services/gmailEmailService');
const { generateEirfVerdictPdfBuffer } = require('../services/pdf/eirfVerdictPdf');
const { generateOtrfReportPdfBuffer } = require('../services/pdf/otrfReportPdf');

async function main() {
    const targetEmail = 'preliminaryexaminations@gmail.com';
    const recipientName = 'Dr. S. Bubere (Chief Invigilator)';

    console.log(`======================================================================`);
    console.log(`[DISPATCHING REMAINING 4 MOBILE-OPTIMIZED EMAIL TEMPLATES]`);
    console.log(`Recipient: ${targetEmail}`);
    console.log(`Sender: ${process.env.GMAIL_SENDER_NAME} <${process.env.GMAIL_SENDER_EMAIL}>`);
    console.log(`======================================================================\n`);

    const results = [];

    // -------------------------------------------------------------------------
    // 1. TEMPLATE: eirf_filing
    // -------------------------------------------------------------------------
    console.log(`[1/4] Dispatching EIRF Filing Notice...`);
    const vars1 = {
        candidate_name: recipientName,
        submission_ref_id: 'SUB-2026-BICS-88219',
        test_title: 'Advanced Algorithms & Distributed Systems',
        course_name: 'Computer Science & Engineering',
        course_code: 'CSE-802',
        academic_term: '2026-2027 (Term I)',
        incident_type: 'Proctoring Anomaly: Telemetry Hardware Glitch',
        eirf_expires_at: formatISTDate(new Date(Date.now() + 45 * 60000)),
        eirf_link: 'https://bicsportal.netlify.app/assessment/evaluation/eirf/a1b2c3-d4e5-f6g7-h8i9j0?token=eirf_live_auth_9c915b721d2c4aba'
    };
    const res1 = await sendGmailRestEmail({
        to: targetEmail,
        toName: recipientName,
        subject: `Action Required: File EIRF within 45 minutes | ${vars1.submission_ref_id}`,
        htmlContent: renderEmailTemplate('eirf_filing', vars1),
        attachments: [],
        tags: ['bics-mobile-test', 'eirf-filing']
    });
    results.push({ template: 'eirf_filing', success: res1.success, messageId: res1.messageId });
    console.log(`   -> Message ID: ${res1.messageId}`);

    // -------------------------------------------------------------------------
    // 2. TEMPLATE: eirf_approved (with PDF attached)
    // -------------------------------------------------------------------------
    console.log(`\n[2/4] Generating PDF and Dispatching EIRF Verdict Approved...`);
    const reportId2 = 'EIRF-2026-90412';
    const subRefId2 = 'SUB-2026-BICS-88219';
    const approvedPdfBuf = await generateEirfVerdictPdfBuffer({
        reportId: reportId2,
        submissionRefId: subRefId2,
        status: 'approved',
        candidateName: recipientName,
        testTitle: 'Advanced Algorithms & Distributed Systems',
        courseName: 'Computer Science & Engineering',
        courseCode: 'CSE-802',
        resolutionCategory: 'Technical Anomaly Exonerated / Medical Emergency Granted',
        remediationAction: 'Original Score Restored (100% Score Waiver Applied)',
        adminRemarks: 'Investigation of proctoring telemetry logs validates hardware latency. Score is restored in full.',
        digitalHash: 'SHA256:7B9E2D1A8F0C3E5A6B4C2D1E0F9A8B7C6D5E4F3A2B1C0D9E8F7A6B5C4D3E2F1',
        reviewedBy: 'Academic Integrity Board Panel'
    });
    const vars2 = {
        candidate_name: recipientName,
        test_title: 'Advanced Algorithms & Distributed Systems',
        submission_ref_id: subRefId2,
        course_name: 'Computer Science & Engineering',
        course_code: 'CSE-802',
        report_id: reportId2,
        resolution_category: 'Technical Anomaly Exonerated / Medical Emergency Granted',
        remediation_action: 'Original Score Restored (100% Score Waiver Applied)',
        reviewed_by: 'Academic Integrity Board Panel',
        reviewed_at: formatISTDate(new Date()),
        hardcopy_deadline: formatISTDate(new Date(Date.now() + 48 * 3600000)),
        digital_hash: 'SHA256:7B9E2D1A8F0C3E5A6B4C2D1E0F9A8B7C6D5E4F3A2B1C0D9E8F7A6B5C4D3E2F1',
        admin_remarks: 'Investigation of proctoring telemetry logs validates hardware latency. Score is restored in full.'
    };
    const res2 = await sendGmailRestEmail({
        to: targetEmail,
        toName: recipientName,
        subject: `EIRF Approved: Your score has been restored | ${reportId2}`,
        htmlContent: renderEmailTemplate('eirf_approved', vars2),
        attachments: [
            {
                name: `EIRF_Verdict_${reportId2}.pdf`,
                content: approvedPdfBuf
            }
        ],
        tags: ['bics-mobile-test', 'eirf-approved']
    });
    results.push({ template: 'eirf_approved', success: res2.success, messageId: res2.messageId });
    console.log(`   -> Message ID: ${res2.messageId}`);

    // -------------------------------------------------------------------------
    // 3. TEMPLATE: eirf_rejected (with PDF attached)
    // -------------------------------------------------------------------------
    console.log(`\n[3/4] Generating PDF and Dispatching EIRF Verdict Rejected...`);
    const reportId3 = 'EIRF-2026-90413';
    const subRefId3 = 'SUB-2026-BICS-88219';
    const rejectedPdfBuf = await generateEirfVerdictPdfBuffer({
        reportId: reportId3,
        submissionRefId: subRefId3,
        status: 'rejected',
        candidateName: recipientName,
        testTitle: 'Advanced Algorithms & Distributed Systems',
        courseName: 'Computer Science & Engineering',
        courseCode: 'CSE-802',
        resolutionCategory: 'Proctoring Deviation Confirmed (Unauthorized Material Detected)',
        remediationAction: 'Test Score Annulled (Disciplinary Hearing Scheduled)',
        adminRemarks: 'Dual screen synchronization corroborated concurrent browser session during Section 2.',
        digitalHash: 'SHA256:A1C3E5F7B9D2E4F6A8C0B2D4E6F8A0C2E4F6A8B0C2D4E6F8A0B2C4D6E8F0A2C4',
        reviewedBy: 'Academic Integrity Board Panel'
    });
    const vars3 = {
        candidate_name: recipientName,
        test_title: 'Advanced Algorithms & Distributed Systems',
        submission_ref_id: subRefId3,
        course_name: 'Computer Science & Engineering',
        course_code: 'CSE-802',
        report_id: reportId3,
        resolution_category: 'Proctoring Deviation Confirmed (Unauthorized Material Detected)',
        remediation_action: 'Test Score Annulled (Disciplinary Hearing Scheduled)',
        reviewed_by: 'Academic Integrity Board Panel',
        reviewed_at: formatISTDate(new Date()),
        hardcopy_deadline: formatISTDate(new Date(Date.now() + 48 * 3600000)),
        digital_hash: 'SHA256:A1C3E5F7B9D2E4F6A8C0B2D4E6F8A0C2E4F6A8B0C2D4E6F8A0B2C4D6E8F0A2C4',
        admin_remarks: 'Dual screen synchronization corroborated concurrent browser session during Section 2.'
    };
    const res3 = await sendGmailRestEmail({
        to: targetEmail,
        toName: recipientName,
        subject: `EIRF Verdict: Not approved | ${reportId3}`,
        htmlContent: renderEmailTemplate('eirf_rejected', vars3),
        attachments: [
            {
                name: `EIRF_Verdict_${reportId3}.pdf`,
                content: rejectedPdfBuf
            }
        ],
        tags: ['bics-mobile-test', 'eirf-rejected']
    });
    results.push({ template: 'eirf_rejected', success: res3.success, messageId: res3.messageId });
    console.log(`   -> Message ID: ${res3.messageId}`);

    // -------------------------------------------------------------------------
    // 4. TEMPLATE: otrf_sent (with OTRF PDF attached)
    // -------------------------------------------------------------------------
    console.log(`\n[4/4] Generating PDF and Dispatching Online Test Report Form (OTRF)...`);
    const subRefId4 = 'SUB-2026-BICS-88219';
    const otrfPdfBuf = await generateOtrfReportPdfBuffer({
        submission: {
            _id: '672e819b9c915b721d2c4aba',
            submissionRefId: subRefId4,
            studentId: 'BICS-2026-088',
            candidateName: recipientName,
            candidateEmail: targetEmail,
            testTitle: 'Advanced Algorithms & Distributed Systems',
            startedAt: new Date(Date.now() - 7200000),
            submittedAt: new Date(Date.now() - 3600000),
            verificationClosedAt: new Date(),
            clientIp: '192.168.1.104',
            connectionType: 'Broadband Fiber (Gigabit)',
            location: 'Mumbai, Maharashtra, India',
            browser: 'Google Chrome 130.0.0.0',
            os: 'Windows 11 Enterprise x64',
            screenResolution: '1920x1080 @ 60Hz',
            hardwareConcurrency: 16,
            answers: [
                { questionId: 'q1', selectedOption: 'B', isCorrect: true, marksAwarded: 5 },
                { questionId: 'q2', selectedOption: 'A', isCorrect: true, marksAwarded: 5 }
            ],
            objections: []
        },
        test: {
            title: 'Advanced Algorithms & Distributed Systems',
            courseCode: 'CSE-802',
            courseName: 'Computer Science & Engineering',
            totalMarks: 100,
            durationMinutes: 120,
            verificationClosedAt: new Date(),
            questions: [
                { _id: 'q1', text: 'Analyze the asymptotic complexity of Dijkstra with Fibonacci Heap.', marks: 5 },
                { _id: 'q2', text: 'Explain the Raft consensus algorithm leader election cycle.', marks: 5 }
            ]
        },
        candidate: {
            name: recipientName,
            studentId: 'BICS-2026-088',
            email: targetEmail,
            program: 'B.Sc. Computer Science (Honours)'
        },
        verificationClosureDate: new Date()
    });

    const vars4 = {
        candidate_name: recipientName,
        test_name: 'Advanced Algorithms & Distributed Systems',
        test_ref_id: subRefId4,
        course_name: 'Computer Science & Engineering',
        course_code: 'CSE-802',
        dops_date: formatISTDate(new Date(Date.now() + 7 * 24 * 3600000))
    };

    const res4 = await sendGmailRestEmail({
        to: targetEmail,
        toName: recipientName,
        subject: `Online Test Report Form (OTRF): ${vars4.test_name} (${vars4.test_ref_id}) | BICS Preliminary Examinations 2026`,
        htmlContent: renderEmailTemplate('otrf_sent', vars4),
        attachments: [
            {
                name: `OTRF_${subRefId4}.pdf`,
                content: otrfPdfBuf
            }
        ],
        tags: ['bics-mobile-test', 'otrf-sent']
    });
    results.push({ template: 'otrf_sent', success: res4.success, messageId: res4.messageId });
    console.log(`   -> Message ID: ${res4.messageId}`);

    console.log(`\n======================================================================`);
    console.log(`DISPATCH COMPLETED FOR ALL 4 REMAINING TEMPLATES:`);
    results.forEach((r, idx) => {
        console.log(`  ${idx + 1}. ${r.template.padEnd(16)} : Success=${r.success} | MsgId=${r.messageId}`);
    });
    console.log(`======================================================================\n`);
}

main().catch(err => {
    console.error(`[FATAL_DISPATCH_ERROR]`, err);
    process.exit(1);
});
