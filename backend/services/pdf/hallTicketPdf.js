const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const {
    safeText,
    generateQrBuffer,
    generateHmacSignature,
    fetchImageBuffer,
    drawBwTable,
    drawBwFooter
} = require('./pdfCommon');

/**
 * Explicit built-in Helvetica font descriptor map so shared pdfCommon table/footer helpers
 * render strictly in Helvetica / Helvetica-Bold without embedding custom TTF families.
 */
const HELVETICA_FONTS = {
    titleRegular: 'Helvetica',
    titleMedium: 'Helvetica',
    titleSemiBold: 'Helvetica-Bold',
    titleBold: 'Helvetica-Bold',
    bodyRegular: 'Helvetica',
    bodyMedium: 'Helvetica',
    bodySemiBold: 'Helvetica-Bold',
    bodyBold: 'Helvetica-Bold'
};

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
            const studentId = candidate?.studentId || candidate?.id || 'Details not available';
            const candidateName = candidate?.name || 'Details not available';
            const personalEmail = candidate?.registrationData?.personalEmail || candidate?.personalEmail || candidate?.email || 'Details not available';
            const address = candidate?.registrationData?.permanentAddress || candidate?.permanentAddress || 'Details not available';
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
                margins: { top: 24, bottom: 18, left: 30, right: 30 },
                bufferPages: true,
                autoFirstPage: true
            });

            const buffers = [];
            doc.on('data', chunk => buffers.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            const pageWidth = 535;
            const startX = 30;
            const bicsLogoPath = path.join(__dirname, '..', '..', 'public', 'bics_logo.png');

            const drawSectionBand = (y, title) => {
                doc.rect(startX, y, pageWidth, 20).fillAndStroke('#e2e8f0', '#0f172a');
                doc.fillColor('#0f172a').fontSize(8.3).font('Helvetica-Bold')
                   .text(title, startX + 8, y + 5.5, { width: pageWidth - 16, lineBreak: false });
                return y + 20;
            };

            const drawContinuationHeader = (subLabel) => {
                let logoEndX = startX;
                if (fs.existsSync(bicsLogoPath)) {
                    try {
                        doc.image(bicsLogoPath, startX, 24, { width: 28 });
                        logoEndX = startX + 38;
                    } catch (e) {}
                }
                const availW = pageWidth - (logoEndX - startX);
                doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10)
                   .text('BICS PRELIMINARY EXAMINATIONS 2026 — ADMISSION PASS', logoEndX, 25, { width: availW });
                const titleBottom = doc.y;
                doc.fillColor('#334155').font('Helvetica').fontSize(7.6)
                   .text(`Academic Year 2026-27 (Semester I)   |   Hall Ticket No: ${tNumber}   |   Student ID: ${safeText(studentId)}   |   ${subLabel}`, logoEndX, Math.max(titleBottom + 2, 39), { width: availW });
                const lineY = Math.max(doc.y, 52) + 7;
                doc.moveTo(startX, lineY).lineTo(startX + pageWidth, lineY).strokeColor('#334155').lineWidth(0.75).stroke();
                return lineY + 12;
            };

            // =========================================================================
            // PAGE 1 HEADER (Helvetica strictly preserved; divider strictly below text & QR)
            // =========================================================================
            const topY = 26;
            const qrFrameW = 70;
            const qrSize = 58;
            const qrFrameX = startX + pageWidth - qrFrameW;

            let textStartX = startX;
            if (fs.existsSync(bicsLogoPath)) {
                try {
                    doc.image(bicsLogoPath, startX, topY + 2, { width: 48 });
                    textStartX = startX + 58;
                } catch (e) {}
            }

            const headerTextWidth = qrFrameX - textStartX - 14;
            let ty = topY;

            doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(12.2)
               .text('BICS PRELIMINARY EXAMINATIONS 2026', textStartX, ty, { width: headerTextWidth, lineGap: 1.5 });
            ty = doc.y + 2;

            doc.fillColor('#334155').font('Helvetica').fontSize(7.8)
               .text('Academic Year 2026-27 (Semester I)   |   Basic Introductory Computer Science (BICS)', textStartX, ty, { width: headerTextWidth, lineGap: 1.5 });
            ty = doc.y + 3;

            const typeLabel = isMid ? 'MID-SEMESTER EXAMINATION 2026' : 'END-SEMESTER EXAMINATION 2026';
            doc.fillColor('#000000').font('Helvetica-Bold').fontSize(9.5)
               .text(`${typeLabel} — ADMISSION PASS (HALL TICKET)`, textStartX, ty, { width: headerTextWidth, lineGap: 1.5 });
            ty = doc.y + 4;

            doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(7.8)
               .text(`Hall Ticket No: ${tNumber}   |   Eligibility: ${isEligible ? 'CONFIRMED' : 'PROVISIONAL'}`, textStartX, ty, { width: headerTextWidth, lineGap: 1.5 });
            const textBottomY = doc.y;

            // Top-Right Framed QR Code (subtle crisp border + caption well above divider)
            let qrBottomY = topY + 70;
            if (qrPngBuffer) {
                try {
                    const qrImgX = qrFrameX + (qrFrameW - qrSize) / 2;
                    doc.rect(qrFrameX, topY - 1, qrFrameW, qrSize + 15).strokeColor('#cbd5e1').lineWidth(0.6).stroke();
                    doc.image(qrPngBuffer, qrImgX, topY + 1, { width: qrSize, height: qrSize });
                    doc.fillColor('#334155').fontSize(5.8).font('Helvetica-Bold')
                       .text('Scan to Verify', qrFrameX, topY + qrSize + 3.5, { width: qrFrameW, align: 'center' });
                    qrBottomY = Math.max(doc.y, topY + qrSize + 14);
                } catch (e) {}
            }

            const dividerY = Math.max(textBottomY, qrBottomY, topY + 72) + 8;
            doc.moveTo(startX, dividerY).lineTo(startX + pageWidth, dividerY).strokeColor('#0f172a').lineWidth(1.0).stroke();

            let curY = dividerY + 12;

            // --- Section 1: Candidate Particulars (Layout preserved verbatim per user instruction) ---
            curY = drawSectionBand(curY, '1. CANDIDATE PARTICULARS & REGISTRATION RECORD');

            const leftW = 370;
            const valX = startX + 130;
            const valW = leftW - 135;
            const regCourses = Array.isArray(candidate?.registeredCourses) && candidate.registeredCourses.length > 0
                ? `B.Sc. Computer Science (${candidate.registeredCourses.join(', ')})`
                : null;
            const enrolledProgram = candidate?.program || candidate?.registrationData?.program || regCourses || 'Bachelor of Science (Computer Science)';

            let infoY = curY + 8;
            doc.fontSize(7.5).fillColor('#0f172a').font('Helvetica-Bold').text('CANDIDATE FULL NAME:', startX + 8, infoY);
            doc.fontSize(8.5).fillColor('#000000').font('Helvetica').text(safeText(candidateName), valX, infoY, { width: valW });
            infoY = Math.max(infoY + 15, doc.y + 4);

            doc.fontSize(7.5).fillColor('#0f172a').font('Helvetica-Bold').text('STUDENT ID / ROLL NO:', startX + 8, infoY);
            doc.fontSize(8.5).fillColor('#000000').font('Helvetica-Bold').text(safeText(studentId), valX, infoY, { width: valW });
            infoY = Math.max(infoY + 15, doc.y + 4);

            doc.fontSize(7.5).fillColor('#0f172a').font('Helvetica-Bold').text('REGISTERED EMAIL:', startX + 8, infoY);
            doc.fontSize(8).fillColor('#000000').font('Helvetica').text(safeText(personalEmail), valX, infoY, { width: valW });
            infoY = Math.max(infoY + 15, doc.y + 4);

            doc.fontSize(7.5).fillColor('#0f172a').font('Helvetica-Bold').text('PERMANENT ADDRESS:', startX + 8, infoY);
            doc.fontSize(7.5).fillColor('#000000').font('Helvetica').text(safeText(address), valX, infoY, { width: valW, lineGap: 1.4 });
            infoY = Math.max(infoY + 16, doc.y + 4);

            doc.fontSize(7.5).fillColor('#0f172a').font('Helvetica-Bold').text('ENROLLED PROGRAM:', startX + 8, infoY);
            doc.fontSize(7.5).fillColor('#000000').font('Helvetica').text(enrolledProgram, valX, infoY, { width: valW, lineGap: 1.4 });
            infoY = Math.max(infoY + 14, doc.y + 8);

            const particularsHeight = Math.max(106, Math.ceil(infoY - curY));
            doc.rect(startX, curY, pageWidth, particularsHeight).strokeColor('#334155').lineWidth(0.75).stroke();
            doc.moveTo(startX + leftW + 2, curY).lineTo(startX + leftW + 2, curY + particularsHeight).strokeColor('#94a3b8').lineWidth(0.6).stroke();

            // Photo & Signature on Right
            const photoX = startX + leftW + 10;
            const photoW = 65;
            const photoH = 75;

            doc.rect(photoX, curY + 7, photoW, photoH).strokeColor('#334155').lineWidth(0.75).stroke();
            if (photoBuffer) {
                try {
                    doc.image(photoBuffer, photoX + 1, curY + 8, { width: photoW - 2, height: photoH - 2 });
                } catch (e) {
                    doc.fillColor('#475569').fontSize(6).font('Helvetica').text('Photograph', photoX + 2, curY + 34, { width: photoW - 4, align: 'center' });
                }
            } else {
                doc.fillColor('#475569').fontSize(6).font('Helvetica').text('Photograph\n(Registered)', photoX + 2, curY + 32, { width: photoW - 4, align: 'center' });
            }
            doc.fillColor('#0f172a').fontSize(6).font('Helvetica-Bold').text('PHOTOGRAPH', photoX, curY + photoH + 10, { width: photoW, align: 'center' });

            const sigX = photoX + photoW + 10;
            const sigW = 65;
            const sigH = 75;
            doc.rect(sigX, curY + 7, sigW, sigH).strokeColor('#334155').lineWidth(0.75).stroke();
            if (sigBuffer) {
                try {
                    doc.image(sigBuffer, sigX + 1, curY + 22, { width: sigW - 2, height: 42 });
                } catch (e) {
                    doc.fillColor('#475569').fontSize(6).font('Helvetica').text('Signature', sigX + 2, curY + 34, { width: sigW - 4, align: 'center' });
                }
            } else {
                doc.fillColor('#475569').fontSize(6).font('Helvetica').text('Signature\n(Specimen)', sigX + 2, curY + 32, { width: sigW - 4, align: 'center' });
            }
            doc.fillColor('#0f172a').fontSize(6).font('Helvetica-Bold').text('SIGNATURE', sigX, curY + sigH + 10, { width: sigW, align: 'center' });

            curY += particularsHeight + 12;

            // --- Section 2: Examination Schedule & Timetable ---
            curY = drawSectionBand(curY, '2. EXAMINATION SCHEDULE & TIMETABLE');

            const defaultSchedules = [
                {
                    code: 'R526CS01T',
                    name: 'Introduction to Computer Science',
                    date: '15-11-2026',
                    time: '10:00 AM - 12:00 PM',
                    mode: 'Online Proctored',
                    report: '09:30 AM'
                },
                {
                    code: 'R526CS02T',
                    name: 'Mathematical Foundations of Computing',
                    date: '17-11-2026',
                    time: '10:00 AM - 12:00 PM',
                    mode: 'Online Proctored',
                    report: '09:30 AM'
                },
                {
                    code: 'R526CS03P',
                    name: 'Computer Programming Laboratory',
                    date: '19-11-2026',
                    time: '02:00 PM - 05:00 PM',
                    mode: 'Online Terminal',
                    report: '01:30 PM'
                }
            ];

            const rawSchedules = (Array.isArray(scheduleList) && scheduleList.length > 0)
                ? scheduleList
                : (Array.isArray(systemConfig?.timetable) && systemConfig.timetable.length > 0 ? systemConfig.timetable : defaultSchedules);

            const scheduleRows = rawSchedules.map(sch => {
                const codeStr = String(sch.code || 'R526CS01T').trim();
                const courseTitle = String(sch.course || sch.name || sch.title || 'Course Unit').trim();
                const isLab = /(?:L|P)$/i.test(codeStr) || /\blab\b/i.test(courseTitle);
                return {
                    cells: [
                        codeStr,
                        courseTitle,
                        sch.date || 'To be announced',
                        sch.time || '10:00 AM - 12:00 PM',
                        (typeof sch.mode === 'string' && sch.mode.trim()) ? sch.mode.trim() : (isLab ? 'Computer Lab' : 'Online Proctored'),
                        (typeof sch.reportTime === 'string' && sch.reportTime.trim())
                            ? sch.reportTime.trim()
                            : ((typeof sch.reportingTime === 'string' && sch.reportingTime.trim())
                                ? sch.reportingTime.trim()
                                : (sch.report || 'As Scheduled'))
                    ],
                    bold: false
                };
            });

            const schedHeaders = [
                { label: 'COURSE CODE', align: 'left' },
                { label: 'COURSE TITLE', align: 'left' },
                { label: 'DATE', align: 'center' },
                { label: 'SESSION TIME', align: 'center' },
                { label: 'MODE', align: 'center' },
                { label: 'REPORT TIME', align: 'center' }
            ];
            const schedColWidths = [74, 140, 65, 92, 92, 72];

            curY = drawBwTable(doc, {
                startX,
                startY: curY,
                width: pageWidth,
                headers: schedHeaders,
                rows: scheduleRows,
                colWidths: schedColWidths,
                headerHeight: 21,
                rowHeight: 20,
                lineGap: 2.0,
                padX: 5,
                padY: 4.5,
                fonts: HELVETICA_FONTS,
                onNewPage: () => drawContinuationHeader('Examination Schedule (Cont.)')
            });

            curY += 12;

            if (curY + 62 > 782) {
                doc.addPage();
                curY = drawContinuationHeader('Compliance & Terminal Instructions');
            }

            // --- Section 3: Eligibility Checklist & Prerequisites ---
            curY = drawSectionBand(curY, '3. CANDIDATE COMPLIANCE & PREREQUISITE CLEARANCE');

            const isMidSem = isMid;
            const consentSigned = isMidSem ? Boolean(candidate.midSemConsentSigned) : Boolean(candidate.endSemConsentSigned);
            const rawSurvey = isMidSem ? candidate.midSemFeedback : candidate.endSemFeedback;
            const surveyDone = rawSurvey instanceof Map
                ? rawSurvey.size > 0
                : (rawSurvey && typeof rawSurvey === 'object' ? Object.keys(rawSurvey).length > 0 : Boolean(rawSurvey));
            const ledgerUploaded = Boolean(isMidSem ? candidate.midSemLedgerUrl : candidate.endSemLedgerUrl);
            const emailVerified = Boolean(isMidSem ? candidate.midSemEmailVerified : candidate.endSemEmailVerified);

            const checklistH = 38;
            doc.rect(startX, curY, pageWidth, checklistH).strokeColor('#334155').lineWidth(0.75).stroke();
            doc.moveTo(startX + 266, curY).lineTo(startX + 266, curY + checklistH).strokeColor('#cbd5e1').lineWidth(0.6).stroke();
            doc.fillColor('#000000').fontSize(7.4).font('Helvetica');
            doc.text(`[${consentSigned ? 'X' : ' '}] Examination Integrity Undertaking Signed`, startX + 8, curY + 8, { width: 252 });
            doc.text(`[${surveyDone ? 'X' : ' '}] Institutional Coursework Feedback Submitted`, startX + 274, curY + 8, { width: 252 });
            doc.text(`[${ledgerUploaded ? 'X' : ' '}] Official Coursework Ledger Uploaded`, startX + 8, curY + 22, { width: 252 });
            doc.text(`[${emailVerified ? 'X' : ' '}] Institutional Email Verification Confirmed`, startX + 274, curY + 22, { width: 252 });
            curY += checklistH + 12;

            // --- Section 4: Testing Terminal Instructions & Proctoring Rules ---
            const instructions = [
                '1. Candidate must log in to the testing terminal using registered institutional credentials at least 30 minutes prior to scheduled start.',
                '2. Mandatory Biometric Face Check: A live baseline facial portrait will be captured and verified against registered photo records.',
                '3. Secure Browser Enforcement: Fullscreen mode is strictly locked. Any tab switch or window departure is recorded in proctoring telemetry.',
                '4. Prohibited Items: Secondary screens, smartwatches, headsets, unauthorized external books or paper notes are strictly prohibited.',
                '5. Emergency Protocol: If technical interruption occurs, candidate must file an Emergency Incident Report Form (EIRF) within 45 minutes.'
            ];

            doc.font('Helvetica').fontSize(7.1);
            const instHeights = instructions.map(inst => doc.heightOfString(inst, { width: pageWidth - 16, lineGap: 1.8 }));
            const rulesBoxH = Math.ceil(instHeights.reduce((sum, h) => sum + h + 4.5, 10));

            if (curY + 20 + rulesBoxH > 782) {
                doc.addPage();
                curY = drawContinuationHeader('Instructions & Undertaking');
            }

            curY = drawSectionBand(curY, '4. SYSTEM INSTRUCTIONS FOR ONLINE TESTING TERMINAL');
            doc.rect(startX, curY, pageWidth, rulesBoxH).strokeColor('#334155').lineWidth(0.75).stroke();
            doc.fillColor('#0f172a').fontSize(7.1).font('Helvetica');
            let ruleY = curY + 7;
            instructions.forEach((inst, idx) => {
                doc.text(inst, startX + 8, ruleY, { width: pageWidth - 16, lineGap: 1.8 });
                ruleY += instHeights[idx] + 4.5;
            });
            curY += rulesBoxH + 12;

            const undertakingText = 'I hereby certify that all information provided is accurate and that I have read and agree to abide by all the examination rules and academic integrity regulations. I understand that any violation will result in immediate cancellation of my candidature.';
            doc.font('Helvetica').fontSize(7.0);
            const undTextH = doc.heightOfString(undertakingText, { width: 328, lineGap: 1.8 });
            const signBoxH = Math.max(72, Math.ceil(undTextH + 34));

            if (curY + 20 + signBoxH > 782) {
                doc.addPage();
                curY = drawContinuationHeader('Undertaking & Endorsement');
            }

            // --- Section 5: Candidate Declaration & Invigilator Sign-Off ---
            curY = drawSectionBand(curY, '5. CANDIDATE UNDERTAKING & EXAMINATION ENDORSEMENT');

            doc.rect(startX, curY, pageWidth, signBoxH).strokeColor('#334155').lineWidth(0.75).stroke();

            doc.fillColor('#000000').fontSize(7.0).font('Helvetica')
               .text(undertakingText, startX + 8, curY + 8, { width: 328, lineGap: 1.8 });

            doc.fillColor('#0f172a').fontSize(7.4).font('Helvetica-Bold')
               .text('Candidate Specimen Signature: ________________________', startX + 8, curY + signBoxH - 17, { width: 330 });

            // Authority Seal on Right
            doc.moveTo(startX + 346, curY).lineTo(startX + 346, curY + signBoxH).strokeColor('#64748b').lineWidth(0.7).stroke();
            doc.fillColor('#0f172a').fontSize(7.8).font('Helvetica-Bold')
               .text('CONTROLLER OF EXAMINATIONS', startX + 356, curY + 10, { width: pageWidth - 364 });
            doc.fillColor('#334155').fontSize(7.0).font('Helvetica')
               .text('BICS Central Examination Board\nOfficial Computer-Generated Admission Pass\nSystem Signature: VALIDATED', startX + 356, curY + 25, { width: pageWidth - 364, lineGap: 2.2 });

            // Footers across all pages (strictly Helvetica via HELVETICA_FONTS)
            const totalTicketPages = doc.bufferedPageRange().count;
            for (let i = 0; i < totalTicketPages; i++) {
                doc.switchToPage(i);
                drawBwFooter(doc, i + 1, totalTicketPages, 'Examination Admission Pass (Hall Ticket)', null, HELVETICA_FONTS);
            }

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
    const disposition = options?.inline ? 'inline' : 'attachment';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="BICS_HallTicket_${examType}sem_${candidateId}.pdf"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.end(buffer);
}

module.exports = {
    generateHallTicketPdfBuffer,
    streamHallTicketPdf
};
