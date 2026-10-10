const PDFDocument = require('pdfkit');
const qr = require('qr-image');
const crypto = require('crypto');

/**
 * Generates SHA-256 Digital Signature Hash for the Verdict
 */
function generateDigitalVerdictHash(submissionId, studentId, reportId, verdictDate) {
    const secretKey = process.env.EIRF_SECRET_KEY || 'BICS_ACADEMIC_EIRF_KEY_2026';
    const dataStr = `${submissionId}:${studentId}:${reportId}:${verdictDate}:${secretKey}`;
    return crypto.createHash('sha256').update(dataStr).digest('hex').substring(0, 16).toUpperCase();
}

/**
 * Formats a Date object to Indian Standard Time (IST) string
 */
function formatToIST(dateInput) {
    if (!dateInput) return 'N/A';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }) + ' IST';
}

/**
 * Generates an Official BICS Verdict PDF Buffer
 */
function generateEirfVerdictPdfBuffer({
    report,
    submission,
    test,
    candidate,
    courseCode = 'CS-101',
    courseName = 'Basic Computer Science',
    adminRemarks = 'Report evaluated by academic committee.',
    pdfProxyUrl = '',
    digitalHash = '',
    deadlineDateStr = ''
}) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 40, size: 'A4' });
            const buffers = [];

            doc.on('data', chunk => buffers.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            const studentId = report?.studentId || candidate?.studentId || submission?.studentId || '2026002';
            const candidateName = report?.candidateName || candidate?.name || submission?.candidateName || 'Candidate';
            const candidateEmail = candidate?.registrationData?.collegeEmail || candidate?.registrationData?.personalEmail || candidate?.email || 'candidate@bics.edu';
            const testTitle = report?.testTitle || test?.title || submission?.testTitle || 'Online Examination';
            const reportId = report?.reportId || 'EIRF-2026-UNKNOWN';
            const status = (report?.status || 'approved').toUpperCase();
            const verdictColor = status === 'APPROVED' ? '#047857' : '#b91c1c';

            const verdictDate = report?.reviewedAt || report?.updatedAt || new Date();
            const verdictDateIST = formatToIST(verdictDate);
            const deadlineIST = deadlineDateStr || formatToIST(new Date(new Date(verdictDate).getTime() + 48 * 60 * 60 * 1000));

            const hashString = digitalHash || generateDigitalVerdictHash(submission?._id || submission?.id, studentId, reportId, verdictDate);
            const qrPayload = `${hashString}-${studentId}-${reportId}`;

            // Generate QR Code PNG Buffer
            const qrPngBuffer = qr.imageSync(qrPayload, { type: 'png', margin: 1 });

            // 1. Header Banner
            doc.rect(40, 40, 515, 60).fill('#002147');
            doc.fillColor('#ffffff')
               .fontSize(16)
               .font('Helvetica-Bold')
               .text('BICS EXAMINATION AUTHORITY', 55, 52, { align: 'left' });
            doc.fontSize(9)
               .font('Helvetica')
               .text('Academic Committee Emergency Incident Report (EIRF) Verdict', 55, 74, { align: 'left' });

            // 2. Verdict Status Card
            doc.rect(40, 115, 515, 50).fillAndStroke(status === 'APPROVED' ? '#f0fdf4' : '#fef2f2', verdictColor);
            doc.fillColor(verdictColor)
               .fontSize(14)
               .font('Helvetica-Bold')
               .text(`VERDICT: ${status}`, 55, 125);
            doc.fillColor('#475569')
               .fontSize(9)
               .font('Helvetica')
               .text(`Report Ref: ${reportId}   |   Decision Date: ${verdictDateIST}`, 55, 145);

            // 3. Metadata Section
            let y = 180;
            doc.fillColor('#002147').fontSize(11).font('Helvetica-Bold').text('1. CANDIDATE & COURSE METADATA', 40, y);
            doc.moveTo(40, y + 15).lineTo(555, y + 15).strokeColor('#cbd5e1').stroke();
            
            y += 22;
            doc.fillColor('#334155').fontSize(9).font('Helvetica');
            doc.text(`Candidate Name: ${candidateName}`, 40, y);
            doc.text(`Student ID: ${studentId}`, 300, y);
            
            y += 15;
            doc.text(`College Email: ${candidateEmail}`, 40, y);
            doc.text(`Examination Title: ${testTitle}`, 300, y);

            y += 15;
            doc.text(`Course Code: ${courseCode}`, 40, y);
            doc.text(`Course Name: ${courseName}`, 300, y);

            y += 15;
            doc.text(`Submission ID: ${submission?._id || submission?.id || 'N/A'}`, 40, y);

            // 4. Telemetry Breakdown
            y += 25;
            doc.fillColor('#002147').fontSize(11).font('Helvetica-Bold').text('2. PROCTORING TELEMETRY & VERIFICATION', 40, y);
            doc.moveTo(40, y + 15).lineTo(555, y + 15).strokeColor('#cbd5e1').stroke();

            y += 22;
            const fsExits = report?.proctoringLogSnapshot?.fullscreenExits || submission?.proctoringLog?.fullscreenExits || 0;
            const tabSwitches = report?.proctoringLogSnapshot?.tabSwitches || submission?.proctoringLog?.tabSwitches || 0;
            const payloadStatus = report?.verificationStatus || 'VERIFIED_MATCH';

            doc.fillColor('#334155').fontSize(9).font('Helvetica');
            doc.text(`Fullscreen Exits Logged: ${fsExits}`, 40, y);
            doc.text(`Tab Switches / Focus Loss Logged: ${tabSwitches}`, 300, y);

            y += 15;
            doc.text(`Encrypted Payload Match: ${payloadStatus}`, 40, y);

            // 5. Candidate Questionnaire Summary
            y += 25;
            doc.fillColor('#002147').fontSize(11).font('Helvetica-Bold').text('3. CANDIDATE QUESTIONNAIRE RESPONSES', 40, y);
            doc.moveTo(40, y + 15).lineTo(555, y + 15).strokeColor('#cbd5e1').stroke();

            y += 22;
            const formAns = report?.formAnswers || {};
            const q1Ack = formAns.section1?.ackUnderstand || 'Yes';
            const q1Warn = formAns.section1?.warningCount || '3 warnings';
            const q2Tab = formAns.section2?.tabReason || report?.technicalContext?.openedApp || 'None specified';
            const q2Fs = formAns.section2?.fullscreenReason || 'None specified';
            const q3Interr = Array.isArray(formAns.section3?.interruptions) ? formAns.section3.interruptions.join(', ') : 'None reported';
            const q3Periph = formAns.section3?.peripherals || 'No peripherals connected';
            const q4Statement = report?.detailedExplanation || formAns.section4?.explanation || 'N/A';

            doc.fillColor('#334155').fontSize(8.5).font('Helvetica');
            doc.text(`• Action Awareness: ${q1Ack} (Warnings remembered: ${q1Warn})`, 40, y);
            y += 14;
            doc.text(`• Violation Context: Tab Loss: ${q2Tab.substring(0, 50)} | Fullscreen: ${q2Fs.substring(0, 50)}`, 40, y);
            y += 14;
            doc.text(`• Technical Triage: ${q3Interr} (Peripherals: ${q3Periph})`, 40, y);
            y += 14;
            doc.text(`• Written Defense Statement: ${q4Statement.substring(0, 110)}...`, 40, y);

            // 6. Committee Decision & Remarks
            y += 25;
            doc.fillColor('#002147').fontSize(11).font('Helvetica-Bold').text('4. COMMITTEE DECISION & REMARKS', 40, y);
            doc.moveTo(40, y + 15).lineTo(555, y + 15).strokeColor('#cbd5e1').stroke();

            y += 22;
            doc.rect(40, y, 515, 38).fill('#f8fafc').stroke('#cbd5e1');
            doc.fillColor('#1e293b').fontSize(8.5).font('Helvetica-Bold').text('Academic Committee Resolution Notes:', 50, y + 6);
            doc.fillColor('#475569').font('Helvetica').text(adminRemarks || 'Official committee resolution completed.', 50, y + 20);

            // 7. Physical Hardcopy Submission Deadline Notice Box
            y += 50;
            doc.rect(40, y, 515, 55).fillAndStroke('#fffbeb', '#fde68a');
            doc.fillColor('#b45309').fontSize(9.5).font('Helvetica-Bold').text('⚠️ ACTION REQUIRED: PHYSICAL HARDCOPY SUBMISSION TO INSTRUCTOR', 50, y + 8);
            doc.fillColor('#78350f').fontSize(8.5).font('Helvetica')
               .text(`You are required to print a physical hardcopy of this official PDF verdict document and submit it directly to your Course Instructor (${courseCode}: ${courseName}) by ${deadlineIST} (within 48 hours) for final grade adjustment. Note: Online PDF storage expires after 48 hours.`, 50, y + 22, { width: 495, lineGap: 2 });

            // 8. Footer: Digital Signature Hash, Netlify Proxy URL & QR Code Image
            y += 70;
            doc.moveTo(40, y).lineTo(555, y).strokeColor('#002147').lineWidth(1.5).stroke();
            y += 10;

            // Embed QR Code PNG on the right
            doc.image(qrPngBuffer, 465, y, { width: 85, height: 85 });

            // Text on the left
            doc.fillColor('#002147').fontSize(8.5).font('Helvetica-Bold').text('OFFICIAL VERIFICATION & PROXY REFERENCE', 40, y);
            y += 14;
            doc.fillColor('#0284c7').fontSize(7.5).font('Helvetica')
               .text(pdfProxyUrl || `https://bicsportal.netlify.app/media/eirf/${reportId}.pdf`, 40, y);
            
            y += 14;
            doc.fillColor('#475569').fontSize(7.5).font('Helvetica')
               .text(`Digital Verification Signature: ${hashString}`, 40, y);

            y += 14;
            doc.fillColor('#64748b').fontSize(7.5).font('Helvetica')
               .text(`Encoded QR Payload: ${qrPayload}`, 40, y);

            y += 14;
            doc.fillColor('#94a3b8').fontSize(7).font('Helvetica')
               .text('BICS Department of Examination • Official Automated Forensic Dispatch', 40, y);

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = {
    generateEirfVerdictPdfBuffer,
    generateDigitalVerdictHash,
    formatToIST
};
