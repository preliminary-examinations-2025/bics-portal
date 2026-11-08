/**
 * Live Dispatch of updated otrf_sent template (single line "ONLINE TEST REPORT FORM")
 * Target: preliminaryexaminations@gmail.com
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const {
    renderEmailTemplate,
    sendGmailRestEmail,
    formatISTDate
} = require('../services/gmailEmailService');
const { generateOtrfReportPdfBuffer } = require('../services/pdf/otrfReportPdf');

async function main() {
    const targetEmail = 'preliminaryexaminations@gmail.com';
    const recipientName = 'Dr. S. Bubere (Chief Invigilator)';

    console.log(`[DISPATCHING UPDATED OTRF EMAIL - SINGLE LINE BADGE]`);
    const subRefId = 'SUB-2026-BICS-88219';

    const otrfPdfBuf = await generateOtrfReportPdfBuffer({
        submission: {
            _id: '672e819b9c915b721d2c4aba',
            submissionRefId: subRefId,
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

    const vars = {
        candidate_name: recipientName,
        test_name: 'Advanced Algorithms & Distributed Systems',
        test_ref_id: subRefId,
        course_name: 'Computer Science & Engineering',
        course_code: 'CSE-802',
        dops_date: formatISTDate(new Date(Date.now() + 7 * 24 * 3600000))
    };

    const res = await sendGmailRestEmail({
        to: targetEmail,
        toName: recipientName,
        subject: `Online Test Report Form: ${vars.test_name} (${vars.test_ref_id}) | BICS Preliminary Examinations 2026`,
        htmlContent: renderEmailTemplate('otrf_sent', vars),
        attachments: [
            {
                name: `OTRF_${subRefId}.pdf`,
                content: otrfPdfBuf
            }
        ],
        tags: ['bics-mobile-test', 'otrf-sent-single-line']
    });

    console.log(`Dispatch Result:`, res);
    console.log(`Google Message ID: ${res?.messageId || 'N/A'}`);
}

main().catch(err => {
    console.error(`[FATAL_DISPATCH_ERROR]`, err);
    process.exit(1);
});
