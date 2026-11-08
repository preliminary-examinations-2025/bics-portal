/**
 * Live Dispatch of All 5 BICS Transactional Email Templates to verification inbox:
 * Target: preliminaryexaminations@gmail.com
 * 
 * 1. test_submitted - Test Submission Confirmation (Unflagged/Immediate)
 * 2. eirf_filing    - EIRF Incident Filing Notice (45-min magic link)
 * 3. eirf_approved  - EIRF Verdict Approved (Score Restored + Official 2-page PDF attached)
 * 4. eirf_rejected  - EIRF Verdict Rejected (Score Annulled + Official 2-page PDF attached)
 * 5. otrf_sent      - Online Test Report Form (Verification Closed + Official OTRF PDF attached)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
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
    console.log(`[BICS ALL-TEMPLATES VERIFICATION DISPATCH]`);
    console.log(`Recipient: ${targetEmail}`);
    console.log(`Sender: ${process.env.GMAIL_SENDER_NAME} <${process.env.GMAIL_SENDER_EMAIL}>`);
    console.log(`======================================================================\n`);

    const results = [];

    // -------------------------------------------------------------------------
    // 1. TEMPLATE: test_submitted
    // -------------------------------------------------------------------------
    console.log(`[1/5] Dispatching 1. Test Submission Confirmation...`);
    const vars1 = {
        candidate_name: recipientName,
        test_name: 'Advanced Algorithms & Distributed Systems',
        test_ref_id: 'SUB-2026-BICS-88219',
        course_name: 'Computer Science & Engineering',
        course_code: 'CSE-802',
        max_marks: '100',
        start_time: formatISTDate(new Date(Date.now() - 3600000)),
        submitted_time: formatISTDate(new Date())
    };
    const res1 = await sendGmailRestEmail({
        to: targetEmail,
        toName: recipientName,
        subject: `[TEST 1/5] Submission Confirmed: ${vars1.test_name} (${vars1.test_ref_id}) | BICS 2026`,
        htmlContent: renderEmailTemplate('test_submitted', vars1),
        attachments: [],
        tags: ['bics-test', 'test-submitted']
    });
    results.push({ template: 'test_submitted', success: res1.success, messageId: res1.messageId });
    console.log(`   -> Message ID: ${res1.messageId}`);

    // -------------------------------------------------------------------------
    // 2. TEMPLATE: eirf_filing
    // -------------------------------------------------------------------------
    console.log(`\n[2/5] Dispatching 2. EIRF Filing Notice...`);
    const vars2 = {
        candidate_name: recipientName,
        submission_ref_id: 'SUB-2026-BICS-88219',
        test_title: 'Advanced Algorithms & Distributed Systems',
        course_name: 'Computer Science & Engineering',
        course_code: 'CSE-802',
        academic_term: '2026-2027 (Term I)',
        incident_type: 'Proctoring Anomaly: Telemetry Hardware Glitch',
        eirf_expires_at: formatISTDate(new Date(Date.now() + 45 * 60000)),
        eirf_link: 'https://portal.bics.edu/eirf/file?token=eirf_live_auth_9c915b721d2c4aba'
    };
    const res2 = await sendGmailRestEmail({
        to: targetEmail,
        toName: recipientName,
        subject: `[TEST 2/5] Action Required: File EIRF within 45 minutes | ${vars2.submission_ref_id}`,
        htmlContent: renderEmailTemplate('eirf_filing', vars2),
        attachments: [],
        tags: ['bics-test', 'eirf-filing']
    });
    results.push({ template: 'eirf_filing', success: res2.success, messageId: res2.messageId });
    console.log(`   -> Message ID: ${res2.messageId}`);

    // -------------------------------------------------------------------------
    // 3. TEMPLATE: eirf_approved (with EIRF Verdict PDF attached)
    // -------------------------------------------------------------------------
    console.log(`\n[3/5] Generating PDF and Dispatching 3. EIRF Verdict Approved...`);
    const reportId3 = 'EIRF-2026-90412';
    const subRefId3 = 'SUB-2026-BICS-88219';
    const approvedPdfBuf = await generateEirfVerdictPdfBuffer({
        reportId: reportId3,
        submissionRefId: subRefId3,
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
    const vars3 = {
        candidate_name: recipientName,
        test_title: 'Advanced Algorithms & Distributed Systems',
        submission_ref_id: subRefId3,
        course_name: 'Computer Science & Engineering',
        course_code: 'CSE-802',
        report_id: reportId3,
        resolution_category: 'Technical Anomaly Exonerated / Medical Emergency Granted',
        remediation_action: 'Original Score Restored (100% Score Waiver Applied)',
        reviewed_by: 'Academic Integrity Board Panel',
        reviewed_at: formatISTDate(new Date()),
        hardcopy_deadline: formatISTDate(new Date(Date.now() + 48 * 3600000)),
        digital_hash: 'SHA256:7B9E2D1A8F0C3E5A6B4C2D1E0F9A8B7C6D5E4F3A2B1C0D9E8F7A6B5C4D3E2F1',
        admin_remarks: 'Investigation of proctoring telemetry logs validates hardware latency. Score is restored in full.'
    };
    const res3 = await sendGmailRestEmail({
        to: targetEmail,
        toName: recipientName,
        subject: `[TEST 3/5] EIRF Approved: Score Restored | ${reportId3} (Verdict PDF Attached)`,
        htmlContent: renderEmailTemplate('eirf_approved', vars3),
        attachments: [
            {
                name: `EIRF_Verdict_${reportId3}.pdf`,
                content: approvedPdfBuf
            }
        ],
        tags: ['bics-test', 'eirf-approved']
    });
    results.push({ template: 'eirf_approved', success: res3.success, messageId: res3.messageId });
    console.log(`   -> Message ID: ${res3.messageId}`);

    // -------------------------------------------------------------------------
    // 4. TEMPLATE: eirf_rejected (with EIRF Verdict PDF attached)
    // -------------------------------------------------------------------------
    console.log(`\n[4/5] Generating PDF and Dispatching 4. EIRF Verdict Rejected...`);
    const reportId4 = 'EIRF-2026-90413';
    const subRefId4 = 'SUB-2026-BICS-88219';
    const rejectedPdfBuf = await generateEirfVerdictPdfBuffer({
        reportId: reportId4,
        submissionRefId: subRefId4,
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
    const vars4 = {
        candidate_name: recipientName,
        test_title: 'Advanced Algorithms & Distributed Systems',
        submission_ref_id: subRefId4,
        course_name: 'Computer Science & Engineering',
        course_code: 'CSE-802',
        report_id: reportId4,
        resolution_category: 'Proctoring Deviation Confirmed (Unauthorized Material Detected)',
        remediation_action: 'Test Score Annulled (Disciplinary Hearing Scheduled)',
        reviewed_by: 'Academic Integrity Board Panel',
        reviewed_at: formatISTDate(new Date()),
        hardcopy_deadline: formatISTDate(new Date(Date.now() + 48 * 3600000)),
        appeal_deadline: formatISTDate(new Date(Date.now() + 48 * 3600000)),
        appeal_link: 'https://portal.bics.edu/appeals/new?ref=SUB-2026-BICS-88219',
        digital_hash: 'SHA256:A1C3E5F7B9D2E4F6A8C0B2D4E6F8A0C2E4F6A8B0C2D4E6F8A0B2C4D6E8F0A2C4',
        admin_remarks: 'Dual screen synchronization corroborated concurrent browser session during Section 2.'
    };
    const res4 = await sendGmailRestEmail({
        to: targetEmail,
        toName: recipientName,
        subject: `[TEST 4/5] EIRF Verdict: Not Approved | ${reportId4} (Verdict PDF Attached)`,
        htmlContent: renderEmailTemplate('eirf_rejected', vars4),
        attachments: [
            {
                name: `EIRF_Verdict_${reportId4}.pdf`,
                content: rejectedPdfBuf
            }
        ],
        tags: ['bics-test', 'eirf-rejected']
    });
    results.push({ template: 'eirf_rejected', success: res4.success, messageId: res4.messageId });
    console.log(`   -> Message ID: ${res4.messageId}`);

    // -------------------------------------------------------------------------
    // 5. TEMPLATE: otrf_sent (with OTRF Report PDF attached)
    // -------------------------------------------------------------------------
    console.log(`\n[5/5] Generating PDF and Dispatching 5. Online Test Report Form (OTRF)...`);
    const subRefId5 = 'SUB-2026-BICS-88219';
    const otrfPdfBuf = await generateOtrfReportPdfBuffer({
        submission: {
            _id: '672e819b9c915b721d2c4aba',
            submissionRefId: subRefId5,
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

    const vars5 = {
        candidate_name: recipientName,
        test_name: 'Advanced Algorithms & Distributed Systems',
        test_ref_id: subRefId5,
        course_name: 'Computer Science & Engineering',
        course_code: 'CSE-802',
        dops_date: formatISTDate(new Date(Date.now() + 7 * 24 * 3600000))
    };

    const res5 = await sendGmailRestEmail({
        to: targetEmail,
        toName: recipientName,
        subject: `[TEST 5/5] Online Test Report Form (OTRF): ${vars5.test_name} (${vars5.test_ref_id}) | BICS 2026`,
        htmlContent: renderEmailTemplate('otrf_sent', vars5),
        attachments: [
            {
                name: `OTRF_${subRefId5}.pdf`,
                content: otrfPdfBuf
            }
        ],
        tags: ['bics-test', 'otrf-sent']
    });
    results.push({ template: 'otrf_sent', success: res5.success, messageId: res5.messageId });
    console.log(`   -> Message ID: ${res5.messageId}`);

    console.log(`\n======================================================================`);
    console.log(`ALL 5 TEMPLATES DISPATCHED TO ${targetEmail}`);
    results.forEach((r, idx) => {
        console.log(`  ${idx + 1}. ${r.template.padEnd(16)} : Success=${r.success} | MsgId=${r.messageId}`);
    });
    console.log(`======================================================================\n`);
}

main().catch(err => {
    console.error(`[FATAL_DISPATCH_ERROR]`, err);
    process.exit(1);
});
