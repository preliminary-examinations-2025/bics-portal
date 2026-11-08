/**
 * Live Dispatch of Single Test Email: test_submitted (Mobile Stacked & Native 100% Width)
 * Target: preliminaryexaminations@gmail.com
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const {
    renderEmailTemplate,
    sendGmailRestEmail,
    formatISTDate
} = require('../services/gmailEmailService');

async function main() {
    const targetEmail = 'preliminaryexaminations@gmail.com';
    const recipientName = 'Dr. S. Bubere (Chief Invigilator)';

    console.log(`======================================================================`);
    console.log(`[DISPATCHING MOBILE-OPTIMIZED TEST SUBMISSION EMAIL]`);
    console.log(`Target: ${targetEmail}`);
    console.log(`Sender: ${process.env.GMAIL_SENDER_NAME} <${process.env.GMAIL_SENDER_EMAIL}>`);
    console.log(`======================================================================\n`);

    const vars = {
        candidate_name: recipientName,
        test_name: 'Advanced Algorithms & Distributed Systems',
        test_ref_id: 'SUB-2026-BICS-88219',
        course_name: 'Computer Science & Engineering',
        course_code: 'CSE-802',
        max_marks: '100',
        start_time: formatISTDate(new Date(Date.now() - 3600000)),
        submitted_time: formatISTDate(new Date())
    };

    const subject = `Submission Confirmed: ${vars.test_name} (${vars.test_ref_id}) | BICS Preliminary Examinations 2026`;
    const htmlContent = renderEmailTemplate('test_submitted', vars);

    const result = await sendGmailRestEmail({
        to: targetEmail,
        toName: recipientName,
        subject,
        htmlContent,
        attachments: [],
        tags: ['bics-mobile-test', 'test-submitted']
    });

    console.log(`Dispatch Result:`, result);
    console.log(`Google Message ID: ${result?.messageId || 'N/A'}`);
    console.log(`======================================================================\n`);
}

main().catch(err => {
    console.error(`[FATAL_DISPATCH_ERROR]`, err);
    process.exit(1);
});
