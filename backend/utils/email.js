const nodemailer = require('nodemailer');

const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;

const transporter = (smtpUser && smtpPass) ? nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: smtpUser,
        pass: smtpPass
    },
    connectionTimeout: 5000,
    greetingTimeout: 4000,
    socketTimeout: 5000
}) : null;

if (transporter) {
    console.log(`--> Nodemailer active: verification emails will be sent via ${smtpUser}.`);
}

const sendVerificationEmail = async (toEmail, name, code) => {
    // 1. Try EmailJS (HTTPS API - Ideal for Render Free Tier)
    const ejsServiceId = process.env.EMAILJS_SERVICE_ID;
    const ejsTemplateId = process.env.EMAILJS_OTP_TEMPLATE_ID || process.env.EMAILJS_TEMPLATE_ID;
    const ejsPublicKey = process.env.EMAILJS_PUBLIC_KEY;
    const ejsPrivateKey = process.env.EMAILJS_PRIVATE_KEY;

    if (ejsServiceId && ejsTemplateId && ejsPublicKey) {
        try {
            const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    service_id: ejsServiceId,
                    template_id: ejsTemplateId,
                    user_id: ejsPublicKey,
                    accessToken: ejsPrivateKey || undefined,
                    template_params: {
                        to_email: toEmail,
                        email: toEmail,
                        to_name: name,
                        name: name,
                        code: code
                    }
                })
            });
            
            if (response.ok) {
                console.log(`[EMAIL_VERIFICATION]: Successfully sent code to ${toEmail} via EmailJS HTTPS API`);
                return;
            } else {
                const text = await response.text();
                console.error(`[EMAIL_VERIFICATION_ERROR]: EmailJS API returned status ${response.status}: ${text}`);
            }
        } catch (err) {
            console.error(`[EMAIL_VERIFICATION_ERROR]: EmailJS request failed:`, err.message);
        }
    }

    // 2. Fallback to Nodemailer SMTP
    if (transporter) {
        const mailOptions = {
            from: `"Preliminary Examinations" <${smtpUser}>`,
            to: toEmail,
            subject: 'BICS Portal - Verification Code',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <h2 style="color: #002147; border-bottom: 2px solid #002147; padding-bottom: 10px; display: inline-block;">BICS Verification Code</h2>
                    </div>
                    <p style="font-size: 11pt; color: #334155;">Dear <strong>${name}</strong>,</p>
                    <p style="font-size: 11pt; color: #334155; line-height: 1.6;">You have requested a verification code to complete a secure action (downloading your Exam Hall Ticket or changing your account password) on the BICS Candidate Portal.</p>
                    <div style="background-color: #f1f5f9; border: 1px dashed #cbd5e1; padding: 15px; margin: 25px 0; text-align: center; border-radius: 6px;">
                        <span style="font-size: 24pt; font-weight: bold; letter-spacing: 5px; color: #002147; font-family: 'Courier New', monospace;">${code}</span>
                    </div>
                    <p style="font-size: 9.5pt; color: #64748b; line-height: 1.5;">This code is valid for <strong>10 minutes</strong>. For security reasons, please do not share this code with anyone.</p>
                    <p style="font-size: 9.5pt; color: #64748b;">If you did not request this code, please secure your account credentials immediately.</p>
                    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
                    <p style="font-size: 10pt; color: #002147; font-weight: bold; margin: 0;">Preliminary Examinations 2026</p>
                    <p style="font-size: 8.5pt; color: #94a3b8; margin: 4px 0 0 0;">BICS Portal Administration System</p>
                </div>
            `
        };
        try {
            await transporter.sendMail(mailOptions);
            console.log(`[EMAIL_VERIFICATION]: Successfully sent code to ${toEmail} via SMTP`);
            return;
        } catch (emailErr) {
            console.error(`[EMAIL_VERIFICATION_ERROR]: SMTP transport failed. Error details:`, emailErr.message);
        }
    }

    // 3. Fallback to console log
    console.log(`\n==================================================`);
    console.log(`[SMTP BLOCK FALLBACK - OTP LOGGED TO SERVER CONSOLE]`);
    console.log(`Recipient: ${toEmail} (${name})`);
    console.log(`Verification Code: ${code}`);
    console.log(`==================================================\n`);
};

const formatISTDate = (dateVal) => {
    try {
        const d = dateVal ? new Date(dateVal) : new Date();
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
};

const sendEirfNoticeEmail = async (toEmail, name, examTitle, incidentSummary, submissionId, extraData = {}) => {
    const ejsServiceId = process.env.EMAILJS_SERVICE_ID;
    const ejsTemplateId = process.env.EMAILJS_EIRF_TEMPLATE_ID || process.env.EMAILJS_TEMPLATE_ID || 'template_4lyvmlr';
    const ejsPublicKey = process.env.EMAILJS_PUBLIC_KEY;
    const ejsPrivateKey = process.env.EMAILJS_PRIVATE_KEY;

    const isProd = process.env.NODE_ENV === 'production' || (typeof window === 'undefined' && process.env.RENDER);
    const defaultPortalUrl = isProd ? 'https://bicsportal.netlify.app' : 'http://localhost:5174';
    const basePortalUrl = process.env.PORTAL_URL || process.env.DASHBOARD_URL || defaultPortalUrl;
    const cleanBase = basePortalUrl.replace(/\/+$/, '');

    const eirfUrl = cleanBase.endsWith('/terminal')
        ? `${cleanBase}/eirf/${submissionId}`
        : `${cleanBase}/terminal/eirf/${submissionId}`;

    const nowIST = formatISTDate(new Date());
    const deadlineIST = formatISTDate(new Date(Date.now() + 45 * 60 * 1000));

    const noticeTitle = 'BICS Emergency Incident Report Notice';
    const noticeIntro = `An automated proctoring alert or session disruption was recorded during your recent online examination ${examTitle} on ${nowIST}.`;
    const noticeActionText = `To maintain examination integrity and ensure your score is validated, you are required to complete the Emergency Incident Report Form (EIRF) and upload your downloaded local backup file (.eirf).`;
    const buttonLabel = 'Complete Emergency Incident Report →';
    const subjectText = `BICS Emergency Incident Report Notice - ${examTitle}`;

    if (ejsServiceId && ejsTemplateId && ejsPublicKey) {
        try {
            const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    service_id: ejsServiceId,
                    template_id: ejsTemplateId,
                    user_id: ejsPublicKey,
                    accessToken: ejsPrivateKey || undefined,
                    template_params: {
                        to_email: toEmail,
                        email: toEmail,
                        to_name: name,
                        name: name,
                        from_name: 'BICS Dept. of Examination',
                        subject: subjectText,
                        notice_title: noticeTitle,
                        notice_intro: noticeIntro,
                        notice_action_text: noticeActionText,
                        button_label: buttonLabel,
                        student_id: extraData.studentId || 'Candidate',
                        submission_id: String(submissionId),
                        exam_title: examTitle,
                        incident_timestamp: nowIST,
                        expiry_deadline_ist: deadlineIST,
                        incident_summary: incidentSummary,
                        eirf_url: eirfUrl,
                        expiry_hours: '45 minutes'
                    }
                })
            });
            if (response.ok) {
                console.log(`[EIRF_EMAIL]: Successfully sent EIRF filing notice to ${toEmail} via EmailJS.`);
                return;
            } else {
                const text = await response.text();
                console.error(`[EIRF_EMAIL_ERROR]: EmailJS status ${response.status}: ${text}`);
            }
        } catch (err) {
            console.error(`[EIRF_EMAIL_ERROR]: EmailJS request failed:`, err.message);
        }
    } else {
        console.log(`\n==================================================`);
        console.log(`[EIRF EMAIL DISPATCH NOTICE LOGGED TO CONSOLE]`);
        console.log(`Recipient: ${toEmail} (${name})`);
        console.log(`Student ID: ${extraData.studentId || 'N/A'}`);
        console.log(`Exam Title: ${examTitle}`);
        console.log(`Timestamp (IST): ${nowIST}`);
        console.log(`Summary: ${incidentSummary}`);
        console.log(`EIRF Filing Link: ${eirfUrl}`);
        console.log(`==================================================\n`);
    }
};

const sendEirfVerdictEmail = async (toEmail, name, examTitle, verdictStatus, adminRemarks, pdfUrl, extraData = {}) => {
    const ejsServiceId = process.env.EMAILJS_SERVICE_ID;
    const ejsTemplateId = process.env.EMAILJS_EIRF_TEMPLATE_ID || process.env.EMAILJS_TEMPLATE_ID || 'template_4lyvmlr';
    const ejsPublicKey = process.env.EMAILJS_PUBLIC_KEY;
    const ejsPrivateKey = process.env.EMAILJS_PRIVATE_KEY;

    const nowIST = formatISTDate(new Date());

    const summaryText = `EIRF VERDICT NOTICE: ${verdictStatus.toUpperCase()}\n` +
                        `Status: ${verdictStatus === 'approved' ? 'EIRF Approved - Provisional Assessment Granted' : 'EIRF Rejected - Disciplinary Action Upheld'}\n` +
                        `Committee Remarks: ${adminRemarks || 'Standard committee evaluation recorded.'}\n` +
                        `Notice: Candidate is required to submit a physical copy of this document to the course instructor within 48 hours.`;

    const noticeTitle = `BICS Official EIRF Verdict Notice [${verdictStatus.toUpperCase()}]`;
    const noticeIntro = `The Academic Examination Committee has evaluated your Emergency Incident Report for ${examTitle} on ${nowIST}.`;
    const noticeActionText = `Your official BICS Verdict PDF Document containing proctoring telemetry, payload verification status, committee remarks, and digital signature has been generated. You are required to submit a physical hardcopy of this document to your course instructor within 48 hours.`;
    const buttonLabel = 'View & Download Verdict PDF →';
    const subjectText = `BICS Official EIRF Verdict Notice [${verdictStatus.toUpperCase()}] - ${examTitle}`;

    if (ejsServiceId && ejsTemplateId && ejsPublicKey) {
        try {
            const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    service_id: ejsServiceId,
                    template_id: ejsTemplateId,
                    user_id: ejsPublicKey,
                    accessToken: ejsPrivateKey || undefined,
                    template_params: {
                        to_email: toEmail,
                        email: toEmail,
                        to_name: name,
                        name: name,
                        from_name: 'BICS Dept. of Examination',
                        subject: subjectText,
                        notice_title: noticeTitle,
                        notice_intro: noticeIntro,
                        notice_action_text: noticeActionText,
                        button_label: buttonLabel,
                        student_id: extraData.studentId || 'Candidate',
                        submission_id: String(extraData.submissionId || ''),
                        exam_title: examTitle,
                        incident_timestamp: nowIST,
                        expiry_deadline_ist: formatISTDate(new Date(Date.now() + 48 * 60 * 60 * 1000)),
                        incident_summary: summaryText,
                        eirf_url: pdfUrl,
                        expiry_hours: '48 hours (Hardcopy submission deadline to Course Instructor)'
                    }
                })
            });
            if (response.ok) {
                console.log(`[EIRF_VERDICT_EMAIL]: Successfully sent EIRF verdict notice to ${toEmail} via EmailJS.`);
                return true;
            } else {
                const text = await response.text();
                console.error(`[EIRF_VERDICT_EMAIL_ERROR]: EmailJS status ${response.status}: ${text}`);
            }
        } catch (err) {
            console.error(`[EIRF_VERDICT_EMAIL_ERROR]: EmailJS request failed:`, err.message);
        }
    } else {
        console.log(`\n==================================================`);
        console.log(`[EIRF VERDICT EMAIL DISPATCH NOTICE LOGGED TO CONSOLE]`);
        console.log(`Recipient: ${toEmail} (${name})`);
        console.log(`Student ID: ${extraData.studentId || 'N/A'}`);
        console.log(`Exam Title: ${examTitle}`);
        console.log(`Verdict: ${verdictStatus.toUpperCase()}`);
        console.log(`PDF Proxy URL: ${pdfUrl}`);
        console.log(`==================================================\n`);
    }
};

module.exports = {
    sendVerificationEmail,
    formatISTDate,
    sendEirfNoticeEmail,
    sendEirfVerdictEmail
};
