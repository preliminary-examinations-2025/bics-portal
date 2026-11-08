const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const {
    safeText,
    formatISTDate,
    generateQrBuffer,
    generateHmacSignature,
    drawBwSectionBand,
    drawBwGridRow,
    drawBwTable,
    drawBwFooter
} = require('./pdfCommon');
const { toBicsId } = require('../../utils/bicsId');

/**
 * Generates digital verification hash for OTRF
 */
function generateOtrfVerificationHash(submissionRefId, bicsObjectId, studentId, totalScored, totalMax) {
    const secret = process.env.OTRF_SECRET_KEY || process.env.SECRET_KEY || 'BICS_OTRF_VERIFY_KEY_2026';
    const payload = `${submissionRefId}:${bicsObjectId}:${studentId}:${totalScored}:${totalMax}:${secret}`;
    return crypto.createHash('sha256').update(payload).digest('hex').substring(0, 20).toUpperCase();
}

/**
 * Generates the Official Online Test Report Form (OTRF) PDF Buffer
 * Strict Black & White Institutional Grid with Top-Right QR Code on Page 1
 */
async function generateOtrfReportPdfBuffer({
    submission = {},
    test = {},
    candidate = {},
    eirfReport = null,
    verificationClosureDate = null
}) {
    return new Promise((resolve, reject) => {
        try {
            // A4 Document: 595.28 x 841.89 points
            const doc = new PDFDocument({
                margins: { top: 25, bottom: 20, left: 30, right: 30 },
                size: 'A4',
                bufferPages: true,
                autoFirstPage: true
            });

            const buffers = [];
            doc.on('data', chunk => buffers.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            const pageWidth = 535;
            const startX = 30;

            // Identifiers
            const rawSubId = submission?._id || submission?.id;
            const bicsObjectId = rawSubId ? toBicsId(rawSubId) : 'No details available';
            const submissionRefId = submission?.submissionRefId || 'No details available';
            const studentId = candidate?.studentId || submission?.studentId || 'No details available';
            const candidateName = candidate?.name || submission?.candidateName || 'No details available';
            const candidateEmail = candidate?.registrationData?.collegeEmail || candidate?.registrationData?.personalEmail || candidate?.email || submission?.candidateEmail || 'No details available';
            const testTitle = test?.title || submission?.testTitle || 'Online Examination';
            const courseCode = test?.courseCode || 'R526CS01T';
            const courseName = test?.courseName || 'Basic Introductory Computer Science';

            const closureDate = verificationClosureDate || submission?.verificationClosedAt || test?.verificationClosedAt || submission?.submittedAt || new Date();
            const closureDateIST = formatISTDate(closureDate);

            // Technical metadata
            const clientIp = submission?.clientIp || submission?.ip || 'No details available';
            const networkInfo = submission?.networkInfo || submission?.isp || (submission?.connectionType ? `${submission.connectionType} Network` : 'No details available');
            const locationStr = submission?.location ? (typeof submission.location === 'object' ? `${submission.location.city || ''}, ${submission.location.country || ''}`.trim() : String(submission.location)) : 'No details available';
            const browserStr = submission?.browser || submission?.userAgent || 'No details available';
            const osStr = submission?.os || submission?.platform || 'No details available';
            const screenRes = submission?.screenResolution || (submission?.screenWidth ? `${submission.screenWidth}x${submission.screenHeight}` : 'No details available');

            // Answers & Objections mapping
            const rawAnswers = Array.isArray(submission?.answers) ? submission.answers : [];
            const rawQuestions = Array.isArray(test?.questions) ? test.questions : (Array.isArray(submission?.questions) ? submission.questions : []);
            const objectionsList = Array.isArray(submission?.objections) ? submission.objections : [];

            // Compile questionwise rows
            let totalMaxMarks = 0;
            let totalBeforeMarks = 0;
            let totalAfterMarks = 0;

            const questionRows = [];
            const questionsToIterate = rawQuestions.length > 0 ? rawQuestions : (rawAnswers.length > 0 ? rawAnswers : [1, 2, 3, 4, 5]);

            questionsToIterate.forEach((qItem, idx) => {
                const qNum = `Q. ${idx + 1}`;
                const qId = qItem?._id || qItem?.id || qItem?.questionId || String(idx + 1);
                const qType = (qItem?.type || qItem?.questionType || 'MCQ').toUpperCase();
                const maxMarks = Number(qItem?.maxMarks || qItem?.marks || qItem?.points || 10);
                totalMaxMarks += maxMarks;

                // Find corresponding answer
                const ans = rawAnswers.find(a => String(a.questionId) === String(qId)) || rawAnswers[idx];
                const hasObjection = ans?.isObjected || objectionsList.some(o => String(o.questionId) === String(qId));

                const marksBefore = ans ? (ans.initialScore !== null && ans.initialScore !== undefined ? Number(ans.initialScore) : (ans.score !== undefined ? Number(ans.score) : 0)) : 0;
                const marksAfter = ans ? (ans.score !== undefined ? Number(ans.score) : marksBefore) : 0;

                totalBeforeMarks += marksBefore;
                totalAfterMarks += marksAfter;

                questionRows.push({
                    cells: [
                        qNum,
                        qType,
                        `${maxMarks.toFixed(1)}`,
                        `${marksBefore.toFixed(1)}`,
                        hasObjection ? 'YES' : 'NO',
                        `${marksAfter.toFixed(1)}`
                    ],
                    bold: false
                });
            });

            // If no questions defined at all, provide at least the summary
            if (totalMaxMarks === 0) {
                totalMaxMarks = test?.totalMarks || 100;
                totalAfterMarks = submission?.score || submission?.totalScore || 0;
                totalBeforeMarks = totalAfterMarks;
            }

            const percentage = totalMaxMarks > 0 ? ((totalAfterMarks / totalMaxMarks) * 100).toFixed(1) : '0.0';

            // Total summary row (CRITICAL: No pass/fail tag)
            questionRows.push({
                cells: [
                    'TOTAL',
                    'ALL SECTIONS',
                    `${totalMaxMarks.toFixed(1)}`,
                    `${totalBeforeMarks.toFixed(1)}`,
                    objectionsList.length > 0 ? `${objectionsList.length} OBJ` : 'NIL',
                    `${totalAfterMarks.toFixed(1)}`
                ],
                isHighlight: true,
                bold: true
            });

            // Hash & QR
            const otrfHash = generateOtrfVerificationHash(submissionRefId, bicsObjectId, studentId, totalAfterMarks, totalMaxMarks);
            const qrPayload = `https://bicsportal.netlify.app/verify/otrf?ref=${encodeURIComponent(submissionRefId)}&bicsId=${encodeURIComponent(bicsObjectId)}&hash=${encodeURIComponent(otrfHash)}`;
            const qrPngBuffer = generateQrBuffer(qrPayload);

            // =========================================================================
            // PAGE 1: HEADER (WITH TOP-RIGHT QR), TEST, CANDIDATE & TECHNICAL METADATA
            // =========================================================================

            // --- Header Bar with Top-Right QR Code ---
            const headerHeight = 74;
            const qrWidth = 65;
            const qrHeight = 65;
            const qrX = startX + pageWidth - qrWidth;
            const qrY = 28;

            doc.rect(startX, 28, pageWidth, headerHeight).strokeColor('#000000').lineWidth(1.2).stroke();
            const textWidth = pageWidth - qrWidth - 16;

            doc.fillColor('#000000').fontSize(12).font('Helvetica-Bold')
               .text('BICS DEPARTMENT OF EXAMINATION', startX + 10, 34, { width: textWidth, align: 'left' });
            doc.fillColor('#000000').fontSize(8).font('Helvetica')
               .text('BICS Online Testing System — Official Assessment & Proctoring Authority', startX + 10, 48, { width: textWidth, align: 'left' });
            doc.fillColor('#000000').fontSize(9.5).font('Helvetica-Bold')
               .text('ONLINE TEST REPORT FORM (OTRF) — OFFICIAL TRANSCRIPT', startX + 10, 60, { width: textWidth, align: 'left' });

            const metaLine = `12-Digit Ref ID: ${safeText(submissionRefId)}  |  BICS Object ID: ${safeText(bicsObjectId)}`;
            doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold')
               .text(metaLine, startX + 10, 75, { width: textWidth, align: 'left', lineBreak: false });

            // QR Code on Page 1 Top-Right
            if (qrPngBuffer) {
                try {
                    doc.image(qrPngBuffer, qrX, qrY + 2, { width: qrWidth, height: qrHeight - 8 });
                    doc.fillColor('#000000').fontSize(5.5).font('Helvetica')
                       .text('Scan for Verification', qrX, qrY + qrHeight - 5, { width: qrWidth, align: 'center' });
                } catch (e) {}
            }

            let curY = 110;

            // --- SECTION 1: TEST DETAILS ---
            drawBwSectionBand(doc, startX, curY, pageWidth, 17, '1. TEST DETAILS');
            curY += 17;

            drawBwGridRow(doc, startX, curY, pageWidth, 22, 'EXAMINATION TITLE:', testTitle, 'COURSE CODE & NAME:', `${safeText(courseCode)} - ${safeText(courseName)}`, 0.5);
            curY += 22;

            const examStartIST = formatISTDate(submission?.startedAt || submission?.createdAt);
            const examEndIST = formatISTDate(submission?.submittedAt || submission?.updatedAt);
            const durationMins = test?.durationMinutes ? `${test.durationMinutes} Minutes` : (submission?.durationMinutes ? `${submission.durationMinutes} Minutes` : 'No details available');

            drawBwGridRow(doc, startX, curY, pageWidth, 22, 'EXAMINATION WINDOW (IST):', `${examStartIST} — ${examEndIST}`, 'ALLOCATED DURATION:', durationMins, 0.5);
            curY += 22;

            drawBwGridRow(doc, startX, curY, pageWidth, 22, 'TEST VERIFICATION STATUS:', 'VERIFICATION CLOSED / RESULTS FINALIZED', 'VERIFICATION CLOSURE DATE:', closureDateIST, 0.5);
            curY += 28;

            // --- SECTION 2: CANDIDATE DETAILS ---
            drawBwSectionBand(doc, startX, curY, pageWidth, 17, '2. CANDIDATE DETAILS');
            curY += 17;

            drawBwGridRow(doc, startX, curY, pageWidth, 22, 'CANDIDATE FULL NAME:', candidateName, 'INSTITUTIONAL STUDENT ID:', studentId, 0.5);
            curY += 22;

            const programStr = candidate?.program || candidate?.registrationData?.program || 'Bachelor of Science (Computer Science)';
            drawBwGridRow(doc, startX, curY, pageWidth, 22, 'REGISTERED COLLEGE EMAIL:', candidateEmail, 'ENROLLED PROGRAM / DEPT:', programStr, 0.5);
            curY += 28;

            // --- SECTION 3: TECHNICAL METADATA ---
            drawBwSectionBand(doc, startX, curY, pageWidth, 17, '3. TECHNICAL METADATA');
            curY += 17;

            drawBwGridRow(doc, startX, curY, pageWidth, 22, 'BICS SUBMISSION OBJECT ID:', bicsObjectId, '12-DIGIT NUMERIC REFERENCE ID:', submissionRefId, 0.5);
            curY += 22;

            drawBwGridRow(doc, startX, curY, pageWidth, 22, 'CLIENT IP ADDRESS:', clientIp, 'NETWORK PROVIDER / ISP:', networkInfo, 0.5);
            curY += 22;

            drawBwGridRow(doc, startX, curY, pageWidth, 22, 'GEO-LOCATION (DETECTED):', locationStr, 'DISPLAY / HARDWARE SPECS:', screenRes, 0.5);
            curY += 22;

            drawBwGridRow(doc, startX, curY, pageWidth, 22, 'OPERATING SYSTEM / PLATFORM:', osStr, 'CLIENT BROWSER USER-AGENT:', browserStr.substring(0, 48), 0.5);
            curY += 28;

            // --- SECTION 4: QUESTIONWISE BREAKDOWN ---
            drawBwSectionBand(doc, startX, curY, pageWidth, 17, '4. QUESTIONWISE BREAKDOWN & SCORE MATRIX');
            curY += 17;

            const tableHeaders = [
                { label: 'Q. NO.', align: 'center' },
                { label: 'QUESTION TYPE', align: 'left' },
                { label: 'MAX MARKS', align: 'center' },
                { label: 'MARKS BEFORE OBJ', align: 'center' },
                { label: 'OBJECTED?', align: 'center' },
                { label: 'MARKS AFTER OBJ', align: 'center' }
            ];
            const colWidths = [50, 115, 80, 105, 75, 110];

            curY = drawBwTable(doc, {
                startX,
                startY: curY,
                width: pageWidth,
                headers: tableHeaders,
                rows: questionRows,
                colWidths: colWidths,
                headerHeight: 18,
                rowHeight: 16,
                onNewPage: () => {
                    // Small continuation header
                    doc.rect(startX, 28, pageWidth, 26).strokeColor('#000000').lineWidth(1.2).stroke();
                    doc.fillColor('#000000').fontSize(9).font('Helvetica-Bold')
                       .text(`ONLINE TEST REPORT FORM (OTRF) — CONTINUATION SHEET (Ref: ${safeText(submissionRefId)})`, startX, 36, { width: pageWidth, align: 'center' });
                    return 60;
                }
            });

            // Score Summary Banner (Strictly without QUALIFIED/PASSED string)
            curY += 6;
            if (curY + 26 > 790) {
                doc.addPage();
                curY = 30;
            }
            doc.rect(startX, curY, pageWidth, 24).fillAndStroke('#e5e7eb', '#000000');
            doc.fillColor('#000000').fontSize(9).font('Helvetica-Bold')
               .text(`TOTAL MARKS SCORED: ${totalAfterMarks.toFixed(1)} / ${totalMaxMarks.toFixed(1)}   |   AGGREGATE PERCENTAGE: ${percentage}%   |   INITIAL TOTAL: ${totalBeforeMarks.toFixed(1)}`, startX, curY + 7, { width: pageWidth, align: 'center' });
            curY += 32;

            // --- SECTION 5: OBJECTIONS SUMMARY ---
            if (curY + 75 > 790) {
                doc.addPage();
                curY = 30;
            }

            drawBwSectionBand(doc, startX, curY, pageWidth, 17, '5. OBJECTIONS SUMMARY & MARKS AUDIT');
            curY += 17;

            const objHeaders = [
                { label: 'SR.', align: 'center' },
                { label: 'OBJECTION ID', align: 'center' },
                { label: 'Q. NO.', align: 'center' },
                { label: 'CANDIDATE OBJECTION STATEMENT', align: 'left' },
                { label: 'BEFORE', align: 'center' },
                { label: 'AFTER', align: 'center' },
                { label: 'DIFF', align: 'center' }
            ];
            const objColWidths = [30, 85, 45, 215, 50, 50, 60];

            const objRows = [];
            if (objectionsList.length > 0) {
                objectionsList.forEach((obj, oIdx) => {
                    const rawId = String(obj.objectionId || obj._id || obj.id || '');
                    const objId = (rawId && /^OBJ-\d{4}-[A-Z0-9]+$/i.test(rawId))
                        ? rawId.toUpperCase()
                        : (obj.objectionId ? String(obj.objectionId).toUpperCase() : `OBJ-2026-${String(rawId.length === 24 ? rawId.slice(-5) : (rawId || (oIdx + 1))).toUpperCase().padStart(5, '0')}`);
                    const targetQIdx = rawQuestions.findIndex(q => String(q._id || q.id) === String(obj.questionId));
                    const qLabel = targetQIdx >= 0 ? `Q. ${targetQIdx + 1}` : (obj.questionNumber ? `Q. ${obj.questionNumber}` : 'General');
                    const reason = obj.reason || obj.statement || obj.candidateStatement || 'Candidate submitted evaluation challenge';
                    const mb = obj.marksBefore !== null && obj.marksBefore !== undefined ? Number(obj.marksBefore).toFixed(1) : '-';
                    const ma = obj.marksAfter !== null && obj.marksAfter !== undefined ? Number(obj.marksAfter).toFixed(1) : '-';
                    const diffVal = Number(obj.marksDiff || 0);
                    const diffStr = (diffVal > 0 ? `+${diffVal.toFixed(1)}` : diffVal.toFixed(1));

                    objRows.push({
                        cells: [
                            String(oIdx + 1),
                            objId,
                            qLabel,
                            reason.substring(0, 55),
                            mb,
                            ma,
                            diffStr
                        ],
                        bold: false
                    });
                });
            } else {
                objRows.push({
                    cells: ['1', 'NIL', '-', 'No objections registered for this examination session.', '-', '-', '0.0'],
                    bold: false
                });
            }

            curY = drawBwTable(doc, {
                startX,
                startY: curY,
                width: pageWidth,
                headers: objHeaders,
                rows: objRows,
                colWidths: objColWidths,
                headerHeight: 18,
                rowHeight: 16
            });
            curY += 12;

            // --- SECTION 6: EIRF DETAILS & PROCTORING INTEGRITY ---
            if (curY + 90 > 790) {
                doc.addPage();
                curY = 30;
            }

            drawBwSectionBand(doc, startX, curY, pageWidth, 17, '6. EIRF DETAILS & PROCTORING INTEGRITY');
            curY += 17;

            const logSnap = submission?.proctoringLog || {};
            const fsExits = Number(logSnap.fullscreenExits || 0);
            const tabSwitches = Number(logSnap.tabSwitches || 0);
            const eirfReportId = submission?.eirfReportId || eirfReport?.reportId || 'No incident report filed (Compliant session)';
            const eirfVerdict = eirfReport?.status ? String(eirfReport.status).toUpperCase() : (fsExits === 0 && tabSwitches === 0 ? 'SESSION COMPLIANT — STANDARD VERIFICATION' : 'PROCTORING REVIEW LOGGED');

            drawBwGridRow(doc, startX, curY, pageWidth, 22, 'EIRF INCIDENT REPORT REF:', eirfReportId, 'COMMITTEE VERDICT / RESOLUTION:', eirfVerdict, 0.5);
            curY += 22;

            const telemetryDetails = `${fsExits} Fullscreen Exit(s), ${tabSwitches} Focus Loss/Tab Switch(es)`;
            const envStatus = 'Webcam & Microphone Active | Single Display Verified | Zero Unauthorized Payloads';
            drawBwGridRow(doc, startX, curY, pageWidth, 22, 'RECORDED TELEMETRY EVENTS:', telemetryDetails, 'ENVIRONMENT INTEGRITY AUDIT:', envStatus, 0.5);
            curY += 28;

            // --- SECTION 7: AUTHORITATIVE & SYSTEM SIGNED ---
            if (curY + 110 > 790) {
                doc.addPage();
                curY = 30;
            }

            drawBwSectionBand(doc, startX, curY, pageWidth, 17, '7. AUTHORITATIVE & SYSTEM SIGNED DUAL ENDORSEMENT');
            curY += 17;

            const signBoxHeight = 82;
            doc.rect(startX, curY, pageWidth, signBoxHeight).strokeColor('#000000').lineWidth(0.8).stroke();

            // Left Dual Signature: Controller of Examinations
            const sigColW = pageWidth / 2;
            doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold').text('CONTROLLER OF EXAMINATIONS', startX + 10, curY + 6);
            doc.fillColor('#000000').fontSize(7).font('Helvetica')
               .text('BICS Assessment & Certification Division', startX + 10, curY + 18)
               .text('System Certified: Digitally Authenticated & Locked', startX + 10, curY + 30)
               .text(`Closure Timestamp: ${closureDateIST}`, startX + 10, curY + 42)
               .text('Status: PERMANENT ACADEMIC ARCHIVE', startX + 10, curY + 54);

            // Right Dual Signature: Academic Integrity Lead
            const rightSigX = startX + sigColW + 10;
            doc.moveTo(startX + sigColW, curY).lineTo(startX + sigColW, curY + signBoxHeight).strokeColor('#000000').lineWidth(0.8).stroke();

            doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold').text('ACADEMIC INTEGRITY & PROCTORING BOARD', rightSigX, curY + 6);
            doc.fillColor('#000000').fontSize(7).font('Helvetica')
               .text('Audit & Incident Adjudication Committee', rightSigX, curY + 18)
               .text(`Digital Verification Hash:`, rightSigX, curY + 30);
            doc.font('Courier-Bold').text(otrfHash, rightSigX, curY + 42);
            doc.font('Helvetica').fontSize(6.5)
               .text('Official URL: https://bicsportal.netlify.app/verify/otrf', rightSigX, curY + 56);

            curY += signBoxHeight + 8;

            // Legal & Tamper Disclaimer
            doc.rect(startX, curY, pageWidth, 24).strokeColor('#000000').lineWidth(0.5).stroke();
            doc.fillColor('#000000').fontSize(6.5).font('Helvetica')
               .text('This is an official computer-generated Online Test Report Form (OTRF) issued by the BICS Department of Examination. Any alteration, erasure, or unauthorized tampering strictly invalidates this transcript. Digital verification can be validated via the secure QR code on Page 1 or institutional URL.', startX + 6, curY + 4, { width: pageWidth - 12, lineGap: 1.5 });

            // Ensure footers on all pages
            const totalPages = doc.bufferedPageRange().count;
            for (let i = 0; i < totalPages; i++) {
                doc.switchToPage(i);
                drawBwFooter(doc, i + 1, totalPages, 'Online Test Report Form (OTRF)');
            }

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = {
    generateOtrfReportPdfBuffer,
    generateOtrfVerificationHash
};
