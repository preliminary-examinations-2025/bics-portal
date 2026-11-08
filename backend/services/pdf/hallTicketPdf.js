const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const {
    safeText,
    formatISTDate,
    generateQrBuffer,
    generateHmacSignature,
    fetchImageBuffer,
    drawBwFooter
} = require('./pdfCommon');

/**
 * Generates the Official BICS Examination Admission Pass (Hall Ticket) PDF Buffer
 */
async function generateHallTicketPdfBuffer({
    candidate = {},
    examType = 'mid', // 'mid' or 'end'
    ticketNumber = null,
    systemConfig = {},
    scheduleList = null
}) {
    return new Promise(async (resolve, reject) => {
        try {
            const isMid = examType === 'mid';
            const studentId = candidate?.studentId || candidate?.id || 'No details available';
            const candidateName = candidate?.name || 'No details available';
            const personalEmail = candidate?.registrationData?.personalEmail || candidate?.personalEmail || candidate?.email || 'No details available';
            const address = candidate?.registrationData?.permanentAddress || candidate?.permanentAddress || 'No details available';
            const isEligible = candidate?.eligible !== false;
            const tNumber = ticketNumber || String(Date.now());

            const SECRET_KEY = process.env.SECRET_KEY || 'bics_portal_secure_secret_key_2026';
            const payloadText = `${studentId}_${examType}_${tNumber}_${isEligible ? 'ELIGIBLE' : 'NOT_ELIGIBLE'}`;
            const hmacHash = generateHmacSignature(payloadText, SECRET_KEY).substring(0, 24);

            const qrPayload = `https://bicsportal.netlify.app/verify/hallticket?tid=${encodeURIComponent(tNumber)}&sid=${encodeURIComponent(studentId)}&type=${encodeURIComponent(examType)}&hash=${encodeURIComponent(hmacHash)}`;
            const qrPngBuffer = generateQrBuffer(qrPayload);

            // Fetch photo & signature buffers
            const photoUrl = candidate?.registrationData?.photoUrl || candidate?.photoUrl;
            const sigUrl = candidate?.registrationData?.signatureUrl || candidate?.signatureUrl;

            const [photoBuffer, sigBuffer] = await Promise.all([
                fetchImageBuffer(photoUrl),
                fetchImageBuffer(sigUrl)
            ]);

            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 25, bottom: 20, left: 30, right: 30 },
                bufferPages: true,
                autoFirstPage: true
            });

            const buffers = [];
            doc.on('data', chunk => buffers.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            const pageWidth = 535;
            const startX = 30;

            // --- Top Metadata & QR Code Header (No outer border box, BICS logo on top-left) ---
            const qrWidth = 65;
            const qrHeight = 65;
            const qrX = startX + pageWidth - qrWidth;
            const qrY = 26;

            // BICS Logo on Top-Left
            const bicsLogoPath = path.join(__dirname, '..', '..', 'public', 'bics_logo.png');
            let textStartX = startX;
            if (fs.existsSync(bicsLogoPath)) {
                try {
                    doc.image(bicsLogoPath, startX, 26, { width: 46 });
                    textStartX = startX + 54;
                } catch (e) {}
            }

            const headerTextWidth = qrX - textStartX - 8;

            doc.fillColor('#000000').font('Helvetica-Bold').fontSize(12)
               .text('BICS PRELIMINARY EXAMINATIONS 2026', textStartX, 28, { width: headerTextWidth });

            doc.fillColor('#000000').font('Helvetica').fontSize(8)
               .text('BASIC INTRODUCTORY COMPUTER SCIENCE (BICS) DEPARTMENT OF EXAMINATION', textStartX, 42, { width: headerTextWidth });

            const typeLabel = isMid ? 'MID-SEMESTER EXAMINATION 2026' : 'END-SEMESTER EXAMINATION 2026';
            doc.fillColor('#000000').font('Helvetica-Bold').fontSize(9.5)
               .text(`EXAMINATION ADMISSION PASS / HALL TICKET — ${typeLabel}`, textStartX, 54, { width: headerTextWidth });

            doc.fillColor('#000000').font('Courier-Bold').fontSize(7.5)
               .text(`Hall Ticket No: ${tNumber}   |   Eligibility: ${isEligible ? 'CONFIRMED' : 'PROVISIONAL'}`, textStartX, 68, { width: headerTextWidth });

            // Thin underline divider
            doc.moveTo(startX, 84).lineTo(startX + pageWidth, 84).strokeColor('#000000').lineWidth(0.8).stroke();

            // Top-Right QR Code
            if (qrPngBuffer) {
                try {
                    doc.image(qrPngBuffer, qrX, qrY + 2, { width: qrWidth, height: qrHeight - 8 });
                    doc.fillColor('#000000').fontSize(5.5).font('Helvetica')
                       .text('Scan for Verification', qrX, qrY + qrHeight - 5, { width: qrWidth, align: 'center' });
                } catch (e) {}
            }

            let curY = 110;

            // --- Section 1: Candidate Particulars ---
            doc.rect(startX, curY, pageWidth, 16).fillAndStroke('#e5e7eb', '#000000');
            doc.fillColor('#000000').fontSize(8).font('Helvetica-Bold')
               .text('1. CANDIDATE PARTICULARS & REGISTRATION RECORD', startX + 6, curY + 4);
            curY += 16;

            const particularsHeight = 94;
            doc.rect(startX, curY, pageWidth, particularsHeight).strokeColor('#000000').lineWidth(0.8).stroke();

            // Candidate Info on Left
            const leftW = 370;
            doc.fontSize(7.5).fillColor('#000000').font('Helvetica-Bold').text('CANDIDATE FULL NAME:', startX + 8, curY + 8);
            doc.fontSize(8.5).fillColor('#000000').font('Helvetica').text(safeText(candidateName), startX + 130, curY + 8, { width: leftW - 135 });

            doc.fontSize(7.5).font('Helvetica-Bold').text('STUDENT ID / ROLL NO:', startX + 8, curY + 24);
            doc.fontSize(8.5).font('Helvetica-Bold').text(safeText(studentId), startX + 130, curY + 24, { width: leftW - 135 });

            doc.fontSize(7.5).font('Helvetica-Bold').text('REGISTERED EMAIL:', startX + 8, curY + 40);
            doc.fontSize(8).font('Helvetica').text(safeText(personalEmail), startX + 130, curY + 40, { width: leftW - 135 });

            doc.fontSize(7.5).font('Helvetica-Bold').text('PERMANENT ADDRESS:', startX + 8, curY + 56);
            doc.fontSize(7.5).font('Helvetica').text(safeText(address), startX + 130, curY + 56, { width: leftW - 135, lineGap: 1.5 });

            doc.fontSize(7.5).font('Helvetica-Bold').text('ENROLLED PROGRAM:', startX + 8, curY + 76);
            doc.fontSize(7.5).font('Helvetica').text('Bachelor of Science (Computer Science)', startX + 130, curY + 76, { width: leftW - 135 });

            // Photo & Signature on Right
            const photoX = startX + leftW + 10;
            const photoW = 65;
            const photoH = 75;

            // Photo Box
            doc.rect(photoX, curY + 5, photoW, photoH).strokeColor('#000000').lineWidth(0.8).stroke();
            if (photoBuffer) {
                try {
                    doc.image(photoBuffer, photoX + 1, curY + 6, { width: photoW - 2, height: photoH - 2 });
                } catch (e) {
                    doc.fillColor('#000000').fontSize(6).font('Helvetica').text('Photograph', photoX + 2, curY + 30, { width: photoW - 4, align: 'center' });
                }
            } else {
                doc.fillColor('#000000').fontSize(6).font('Helvetica').text('Photograph\n(Registered)', photoX + 2, curY + 28, { width: photoW - 4, align: 'center' });
            }
            doc.fillColor('#000000').fontSize(6).font('Helvetica-Bold').text('PHOTOGRAPH', photoX, curY + photoH + 7, { width: photoW, align: 'center' });

            // Signature Box
            const sigX = photoX + photoW + 10;
            const sigW = 65;
            const sigH = 75;
            doc.rect(sigX, curY + 5, sigW, sigH).strokeColor('#000000').lineWidth(0.8).stroke();
            if (sigBuffer) {
                try {
                    doc.image(sigBuffer, sigX + 1, curY + 20, { width: sigW - 2, height: 42 });
                } catch (e) {
                    doc.fillColor('#000000').fontSize(6).font('Helvetica').text('Signature', sigX + 2, curY + 30, { width: sigW - 4, align: 'center' });
                }
            } else {
                doc.fillColor('#000000').fontSize(6).font('Helvetica').text('Signature\n(Specimen)', sigX + 2, curY + 28, { width: sigW - 4, align: 'center' });
            }
            doc.fillColor('#000000').fontSize(6).font('Helvetica-Bold').text('SIGNATURE', sigX, curY + sigH + 7, { width: sigW, align: 'center' });

            curY += particularsHeight + 12;

            // --- Section 2: Examination Schedule & Timetable ---
            doc.rect(startX, curY, pageWidth, 16).fillAndStroke('#e5e7eb', '#000000');
            doc.fillColor('#000000').fontSize(8).font('Helvetica-Bold')
               .text('2. EXAMINATION SCHEDULE & TIMETABLE', startX + 6, curY + 4);
            curY += 16;

            // Schedule Table Header
            const schedColWidths = [70, 165, 80, 80, 70, 70];
            doc.rect(startX, curY, pageWidth, 16).fillAndStroke('#f3f4f6', '#000000');
            doc.fillColor('#000000').fontSize(7).font('Helvetica-Bold');
            doc.text('COURSE CODE', startX + 4, curY + 4, { width: 62 });
            doc.text('COURSE TITLE', startX + 74, curY + 4, { width: 155 });
            doc.text('DATE', startX + 239, curY + 4, { width: 72 });
            doc.text('SESSION TIME', startX + 319, curY + 4, { width: 72 });
            doc.text('MODE', startX + 399, curY + 4, { width: 62 });
            doc.text('REPORT TIME', startX + 469, curY + 4, { width: 62 });
            curY += 16;

            const defaultSchedules = [
                {
                    code: 'R526CS01T',
                    name: 'Introduction to Computer Science',
                    date: '15-11-2026',
                    time: '10:00 AM - 12:00 PM',
                    mode: 'ONLINE PROCTORED',
                    report: '09:30 AM'
                },
                {
                    code: 'R526CS02T',
                    name: 'Mathematical Foundations of Computing',
                    date: '17-11-2026',
                    time: '10:00 AM - 12:00 PM',
                    mode: 'ONLINE PROCTORED',
                    report: '09:30 AM'
                },
                {
                    code: 'R526CS03P',
                    name: 'Computer Programming Laboratory',
                    date: '19-11-2026',
                    time: '02:00 PM - 05:00 PM',
                    mode: 'ONLINE TERMINAL',
                    report: '01:30 PM'
                }
            ];

            const rawSchedules = (Array.isArray(scheduleList) && scheduleList.length > 0)
                ? scheduleList
                : (Array.isArray(systemConfig?.timetable) && systemConfig.timetable.length > 0 ? systemConfig.timetable : defaultSchedules);

            const activeSchedules = rawSchedules.map(sch => ({
                code: sch.code || 'R526CS01T',
                name: sch.course || sch.name || sch.title || 'Course Unit',
                date: sch.date || 'To be announced',
                time: sch.time || '10:00 AM - 12:00 PM',
                mode: sch.mode || (String(sch.code).includes('L') || String(sch.code).includes('P') ? 'Computer Lab' : 'Online Proctored'),
                report: sch.reportTime || sch.reportingTime || sch.report || (String(sch.code).includes('L') || String(sch.code).includes('P') ? '01:30 PM' : '02:45 PM')
            }));

            activeSchedules.forEach((sch) => {
                doc.rect(startX, curY, pageWidth, 16).strokeColor('#000000').lineWidth(0.8).stroke();
                doc.fillColor('#000000').fontSize(7).font('Helvetica');
                doc.text(safeText(sch.code), startX + 4, curY + 4, { width: 62 });
                doc.text(safeText(sch.name), startX + 74, curY + 4, { width: 155, lineBreak: false });
                doc.text(safeText(sch.date), startX + 239, curY + 4, { width: 72 });
                doc.text(safeText(sch.time), startX + 319, curY + 4, { width: 72 });
                doc.text(safeText(sch.mode), startX + 399, curY + 4, { width: 62 });
                doc.text(safeText(sch.report), startX + 469, curY + 4, { width: 62 });
                curY += 16;
            });

            curY += 12;

            // --- Section 3: Eligibility Checklist & Prerequisites ---
            doc.rect(startX, curY, pageWidth, 16).fillAndStroke('#e5e7eb', '#000000');
            doc.fillColor('#000000').fontSize(8).font('Helvetica-Bold')
               .text('3. CANDIDATE COMPLIANCE & PREREQUISITE CLEARANCE', startX + 6, curY + 4);
            curY += 16;

            const isMidSem = isMid;
            const consentSigned = isMidSem ? candidate.midSemConsentSigned : candidate.endSemConsentSigned;
            const surveyDone = isMidSem ? candidate.midSemFeedback : candidate.endSemFeedback;
            const ledgerUploaded = isMidSem ? candidate.midSemLedgerUrl : candidate.endSemLedgerUrl;
            const emailVerified = isMidSem ? candidate.midSemEmailVerified : candidate.endSemEmailVerified;

            doc.rect(startX, curY, pageWidth, 28).strokeColor('#000000').lineWidth(0.8).stroke();
            doc.fillColor('#000000').fontSize(7).font('Helvetica');
            doc.text(`[${consentSigned ? 'X' : ' '}] Examination Integrity Undertaking Form Signed`, startX + 8, curY + 6);
            doc.text(`[${surveyDone ? 'X' : ' '}] Institutional Coursework Feedback Submitted`, startX + 270, curY + 6);
            doc.text(`[${ledgerUploaded ? 'X' : ' '}] Official Coursework Ledger Document Uploaded`, startX + 8, curY + 16);
            doc.text(`[${emailVerified ? 'X' : ' '}] Institutional College Email Verification Confirmed`, startX + 270, curY + 16);
            curY += 36;

            // --- Section 4: Testing Terminal Instructions & Proctoring Rules ---
            doc.rect(startX, curY, pageWidth, 16).fillAndStroke('#e5e7eb', '#000000');
            doc.fillColor('#000000').fontSize(8).font('Helvetica-Bold')
               .text('4. SYSTEM INSTRUCTIONS FOR ONLINE TESTING TERMINAL', startX + 6, curY + 4);
            curY += 16;

            const instructions = [
                '1. Candidate must log in to the testing terminal using registered institutional credentials at least 30 minutes prior to scheduled start.',
                '2. Mandatory Biometric Face Check: A live baseline facial portrait will be captured and verified against registered photo records.',
                '3. Secure Browser Enforcement: Fullscreen mode is strictly locked. Any tab switch or window departure is recorded in proctoring telemetry.',
                '4. Prohibited Items: Secondary screens, smartwatches, headsets, unauthorized external books or paper notes are strictly prohibited.',
                '5. Emergency Protocol: If technical interruption occurs, candidate must file an Emergency Incident Report Form (EIRF) within 45 minutes.'
            ];

            const rulesBoxH = 64;
            doc.rect(startX, curY, pageWidth, rulesBoxH).strokeColor('#000000').lineWidth(0.8).stroke();
            doc.fillColor('#000000').fontSize(6.5).font('Helvetica');
            let ruleY = curY + 5;
            instructions.forEach(inst => {
                doc.text(inst, startX + 8, ruleY, { width: pageWidth - 16 });
                ruleY += 11;
            });
            curY += rulesBoxH + 12;

            // --- Section 5: Candidate Declaration & Invigilator Sign-Off ---
            doc.rect(startX, curY, pageWidth, 16).fillAndStroke('#e5e7eb', '#000000');
            doc.fillColor('#000000').fontSize(8).font('Helvetica-Bold')
               .text('5. CANDIDATE UNDERTAKING & EXAMINATION ENDORSEMENT', startX + 6, curY + 4);
            curY += 16;

            const signBoxH = 65;
            doc.rect(startX, curY, pageWidth, signBoxH).strokeColor('#000000').lineWidth(0.8).stroke();

            // Candidate Undertaking
            doc.fillColor('#000000').fontSize(6.5).font('Helvetica')
               .text('I hereby certify that all information provided is accurate and that I have read and agree to abide by all the examination rules and academic integrity regulations. I understand that any violation will result in immediate cancellation of my candidature.', startX + 8, curY + 6, { width: 330, lineGap: 1.5 });

            doc.fontSize(7).font('Helvetica-Bold')
               .text('Candidate Specimen Signature: _______________________', startX + 8, curY + 45);

            // Authority Seal on Right
            doc.moveTo(startX + 345, curY).lineTo(startX + 345, curY + signBoxH).strokeColor('#000000').lineWidth(0.8).stroke();
            doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold')
               .text('CONTROLLER OF EXAMINATIONS', startX + 355, curY + 8);
            doc.fillColor('#000000').fontSize(6.5).font('Helvetica')
               .text('BICS Central Examination Board\nOfficial Computer-Generated Admission Pass\nSystem Signature: VALIDATED', startX + 355, curY + 22, { lineGap: 2 });

            // Footer
            drawBwFooter(doc, 1, 1, 'Examination Admission Pass (Hall Ticket)');

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Express router helper to stream hall ticket directly to HTTP response
 */
async function streamHallTicketPdf(res, options) {
    const buffer = await generateHallTicketPdfBuffer(options);
    const candidateId = options.candidate?.studentId || options.candidate?.id || 'candidate';
    const examType = options.examType || 'mid';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="hallticket-${examType}sem-${candidateId}.pdf"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.end(buffer);
}

module.exports = {
    generateHallTicketPdfBuffer,
    streamHallTicketPdf
};
