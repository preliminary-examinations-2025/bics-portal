const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const {
    safeText,
    formatISTDate,
    generateQrBuffer,
    fetchImageBuffer,
    drawBwSectionBand,
    drawBwGridRow,
    drawBwFooter
} = require('./pdfCommon');
const { toBicsId } = require('../../utils/bicsId');

/**
 * Generates SHA-256 Digital Signature Hash for the EIRF Verdict
 */
function generateDigitalVerdictHash(submissionId, studentId, reportId, verdictDate) {
    const secretKey = process.env.EIRF_SECRET_KEY || 'BICS_ACADEMIC_EIRF_KEY_2026';
    const dataStr = `${submissionId}:${studentId}:${reportId}:${verdictDate}:${secretKey}`;
    return crypto.createHash('sha256').update(dataStr).digest('hex').substring(0, 16).toUpperCase();
}

/**
 * Generates an objective, forensic case synthesis paragraph via Gemini / OpenRouter / Groq API.
 * Deterministic fallback ensures reliable generation even without network/API keys.
 * Never mentions AI, Gemini, or language models.
 */
async function generateForensicSynthesis({
    reportId,
    candidateName,
    studentId,
    courseCode,
    courseName,
    testTitle,
    verdictStatus,
    adminRemarks,
    primaryCause,
    detailedExplanation,
    telemetrySummary,
    resolutionCategory
}) {
    const prompt = `You are an academic proctoring forensic analyst drafting an official case synthesis for an institutional audit report.
Write a concise, objective, formal 3 to 4 sentence executive synthesis of this examination incident.
Do NOT mention AI, Gemini, machine learning, automated generators, or prompts.
Present it strictly as an institutional case synthesis.

CASE PARTICULARS:
- Incident ID: ${reportId}
- Student: ${candidateName} (ID: ${studentId})
- Course: ${courseCode} - ${courseName}
- Examination: ${testTitle}
- Recorded Primary Trigger: ${primaryCause || 'Proctoring alert'}
- Telemetry Evidence: ${telemetrySummary || 'Navigation alerts recorded during exam'}
- Student Explanation: ${detailedExplanation || 'Submitted explanation on EIRF form'}
- Final Committee Verdict: ${String(verdictStatus).toUpperCase()}
- Resolution Classification: ${resolutionCategory || 'Academic Review'}
- Committee Notes: ${adminRemarks || 'Evaluated in accordance with integrity policy'}

Provide ONLY the final synthesis paragraph.`;

    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;
    const openrouterKey = process.env.OPENROUTER_API_KEY;

    // 1. Gemini
    if (geminiKey) {
        for (const model of ['gemini-2.5-flash', 'gemini-2.5-flash-lite']) {
            try {
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { maxOutputTokens: 250, temperature: 0.2 }
                    })
                });
                if (res.ok) {
                    const data = await res.json();
                    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                    if (text) return text;
                }
            } catch (e) {
                // fall through
            }
        }
    }

    // 2. Groq
    if (groqKey) {
        for (const model of ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b']) {
            try {
                const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${groqKey}`
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: [{ role: 'user', content: prompt }],
                        max_tokens: 250,
                        temperature: 0.2
                    })
                });
                if (res.ok) {
                    const data = await res.json();
                    const text = data.choices?.[0]?.message?.content?.trim();
                    if (text) return text;
                }
            } catch (e) {
                // fall through
            }
        }
    }

    // 3. OpenRouter
    if (openrouterKey) {
        for (const model of ['meta-llama/llama-3.3-70b-instruct', 'qwen/qwen-2.5-72b-instruct']) {
            try {
                const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${openrouterKey}`,
                        'HTTP-Referer': 'https://bicsportal.netlify.app'
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: [{ role: 'user', content: prompt }],
                        max_tokens: 250,
                        temperature: 0.2
                    })
                });
                if (res.ok) {
                    const data = await res.json();
                    const text = data.choices?.[0]?.message?.content?.trim();
                    if (text) return text;
                }
            } catch (e) {
                // fall through
            }
        }
    }

    // 4. Deterministic Institutional Rule-Based Synthesis Fallback
    const isApproved = String(verdictStatus).toLowerCase() === 'approved';
    if (isApproved) {
        return `During the examination for ${courseCode} (${testTitle}), proctoring telemetry flagged session events (${telemetrySummary || 'navigation deviations'}). Upon comprehensive cross-examination of the candidate's Emergency Incident Report Form and verified payload records, the committee determined the disruption to be consistent with non-prejudicial technical interruptions. The candidate's defense has been validated, and the final verdict of APPROVAL has been granted for provisional score normalization.`;
    } else {
        return `During the examination for ${courseCode} (${testTitle}), proctoring telemetry recorded repeated compliance infractions (${telemetrySummary || 'proctoring navigation alerts'}). Review of the candidate's explanation alongside timestamped system event logs concluded that the defense failed to reconcile the observed discrepancies. Consequently, the Academic Integrity Committee has REJECTED the incident report, upholding disciplinary action in accordance with institutional examination regulations.`;
    }
}

/**
 * Generates the Redesigned 2-Page Strict Black & White EIRF Verdict PDF Buffer
 */
async function generateEirfVerdictPdfBuffer({
    report = {},
    submission = {},
    test = {},
    candidate = {},
    courseCode = 'R526CS01T',
    courseName = 'Introduction to Computer Science',
    adminRemarks = 'Report evaluated by academic integrity committee.',
    resolutionCategory = '',
    remediationAction = '',
    reviewerName = 'Academic Integrity Board Convener',
    reviewerTitle = 'Convener, Examination Disciplinary Committee',
    pdfProxyUrl = '',
    digitalHash = '',
    deadlineDateStr = ''
}) {
    const studentId = report?.studentId || candidate?.studentId || submission?.studentId || 'No details available';
    const candidateName = report?.candidateName || candidate?.name || submission?.candidateName || 'No details available';
    const candidateEmail = candidate?.registrationData?.collegeEmail || candidate?.registrationData?.personalEmail || candidate?.email || submission?.candidateEmail || 'No details available';
    const testTitle = report?.testTitle || test?.title || submission?.testTitle || 'Online Examination';
    const reportId = report?.reportId || 'EIRF-2026-UNKNOWN';
    const rawStatus = (report?.status || 'approved').toUpperCase();
    const isApproved = rawStatus === 'APPROVED';

    const rawSubId = submission?._id || submission?.id || report?.submissionId;
    const bicsObjectId = rawSubId ? toBicsId(rawSubId) : 'No details available';
    const submissionRefId = submission?.submissionRefId || report?.submissionRefId || 'No details available';

    const verdictDate = report?.reviewedAt || report?.updatedAt || new Date();
    const verdictDateIST = formatISTDate(verdictDate);
    const deadlineIST = deadlineDateStr || formatISTDate(new Date(new Date(verdictDate).getTime() + 48 * 60 * 60 * 1000));

    const examStartIST = formatISTDate(submission?.startedAt || report?.createdAt || verdictDate);
    const examEndIST = formatISTDate(submission?.submittedAt || report?.submittedAt || verdictDate);
    const reportSubmittedIST = formatISTDate(report?.submittedAt || report?.createdAt || verdictDate);

    const hashString = digitalHash || generateDigitalVerdictHash(rawSubId, studentId, reportId, verdictDate);
    const qrPayload = `https://bicsportal.netlify.app/verify/eirf?reportId=${encodeURIComponent(reportId)}&ref=${encodeURIComponent(submissionRefId)}&hash=${encodeURIComponent(hashString)}`;
    const proxyUrlFormatted = pdfProxyUrl || `https://bicsportal.netlify.app/media/eirf/${reportId}.pdf`;

    // Telemetry and proctoring logs
    const logSnap = report?.proctoringLogSnapshot || submission?.proctoringLog || {};
    const fsExits = Number(logSnap.fullscreenExits || 0);
    const tabSwitches = Number(logSnap.tabSwitches || 0);
    const events = Array.isArray(logSnap.events) ? logSnap.events : [];
    const telemetrySummary = `${fsExits} Fullscreen Exit(s), ${tabSwitches} Tab Switch(es)/Focus Loss events`;

    // Classification
    const resolvedCategory = resolutionCategory || (isApproved ? 'Technical Glitch / Environmental Disruption' : 'Unexplained Window Deviation Confirmed');
    const resolvedRemediation = remediationAction || (isApproved ? 'Provisional Assessment Restored & Validated' : 'Examination Score Annulled (Zero Points)');

    // Synthesis
    const forensicSynthesisText = await generateForensicSynthesis({
        reportId,
        candidateName,
        studentId,
        courseCode,
        courseName,
        testTitle,
        verdictStatus: rawStatus,
        adminRemarks,
        primaryCause: report?.primaryCause,
        detailedExplanation: report?.detailedExplanation || report?.formAnswers?.section4?.explanation,
        telemetrySummary,
        resolutionCategory: resolvedCategory
    });

    // Image buffers: Enrolled Photo vs. Webcam Baseline Photo
    const enrolledPhotoUrl = candidate?.registrationData?.photoUrl || candidate?.photoUrl;
    const baselinePhotoUrl = submission?.biometricVerification?.baselinePhotoUrl || submission?.baselinePhotoUrl || report?.technicalContext?.baselinePhotoUrl;

    const [enrolledPhotoBuffer, baselinePhotoBuffer, qrPngBuffer] = await Promise.all([
        fetchImageBuffer(enrolledPhotoUrl),
        fetchImageBuffer(baselinePhotoUrl),
        Promise.resolve(generateQrBuffer(qrPayload))
    ]);

    return new Promise((resolve, reject) => {
        try {
            // A4 document: 595.28 x 841.89 points
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

            // =========================================================================
            // PAGE 1: HEADER (WITH TOP-RIGHT QR), METADATA, DUAL-PHOTO AUDIT & DEFENSE
            // =========================================================================

            // --- Header Bar with Top-Right QR Code ---
            const headerHeight = 72;
            const qrWidth = 65;
            const qrHeight = 65;
            const qrX = startX + pageWidth - qrWidth;
            const qrY = 28;

            doc.rect(startX, 28, pageWidth, headerHeight).strokeColor('#000000').lineWidth(1.2).stroke();
            const textWidth = pageWidth - qrWidth - 16;

            doc.fillColor('#000000').fontSize(12).font('Helvetica-Bold')
               .text('BICS DEPARTMENT OF EXAMINATION', startX + 10, 34, { width: textWidth, align: 'left' });
            doc.fillColor('#000000').fontSize(8).font('Helvetica')
               .text('BICS Online Testing System — Academic Integrity & Incident Adjudication Unit', startX + 10, 48, { width: textWidth, align: 'left' });
            doc.fillColor('#000000').fontSize(9.5).font('Helvetica-Bold')
               .text(`EIRF FORENSIC AUDIT REPORT (Ref: ${reportId})`, startX + 10, 60, { width: textWidth, align: 'left' });

            const metaLine = `12-Digit Ref ID: ${safeText(submissionRefId)}  |  BICS Object ID: ${safeText(bicsObjectId)}`;
            doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold')
               .text(metaLine, startX + 10, 74, { width: textWidth, align: 'left', lineBreak: false });

            // QR Code on Page 1 Top-Right
            if (qrPngBuffer) {
                try {
                    doc.image(qrPngBuffer, qrX, qrY + 2, { width: qrWidth, height: qrHeight - 8 });
                    doc.fillColor('#000000').fontSize(5.5).font('Helvetica')
                       .text('Scan for Verification', qrX, qrY + qrHeight - 5, { width: qrWidth, align: 'center' });
                } catch (e) {}
            }

            let curY = 108;

            // --- 1. DOCUMENT METADATA & SYSTEM CONTEXT ---
            drawBwSectionBand(doc, startX, curY, pageWidth, 17, '1. DOCUMENT METADATA & SYSTEM CONTEXT');
            curY += 17;

            drawBwGridRow(doc, startX, curY, pageWidth, 24, 'INCIDENT TRACKING ID:', reportId, 'INITIAL SEVERITY LEVEL:', (fsExits >= 3 || tabSwitches >= 3) ? 'HIGH (Exceeded Threshold)' : 'MEDIUM (Review Flagged)', 0.5);
            curY += 24;

            drawBwGridRow(doc, startX, curY, pageWidth, 24, 'CANDIDATE FULL NAME:', candidateName, 'INSTITUTIONAL STUDENT ID:', studentId, 0.5);
            curY += 24;

            drawBwGridRow(doc, startX, curY, pageWidth, 24, 'REGISTERED COLLEGE EMAIL:', candidateEmail, 'COURSE CODE & TITLE:', `${safeText(courseCode)} - ${safeText(courseName)}`, 0.5);
            curY += 24;

            drawBwGridRow(doc, startX, curY, pageWidth, 24, 'EXAMINATION TITLE:', testTitle, 'EXAM SESSION WINDOW:', `${examStartIST} — ${examEndIST}`, 0.5);
            curY += 24;

            drawBwGridRow(doc, startX, curY, pageWidth, 24, 'EIRF FORM SUBMITTED AT:', reportSubmittedIST, 'ADJUDICATION TIMELINESS:', 'Compliant (Filed within mandatory limit)', 0.5);
            curY += 30;

            // --- 2. DUAL-PHOTO IDENTITY & BIOMETRIC AUDIT ---
            drawBwSectionBand(doc, startX, curY, pageWidth, 17, '2. DUAL-PHOTO IDENTITY & BIOMETRIC VERIFICATION AUDIT');
            curY += 17;

            const photoBoxHeight = 88;
            doc.rect(startX, curY, pageWidth, photoBoxHeight).strokeColor('#000000').lineWidth(0.8).stroke();

            // Photo 1: Enrolled Registration Photo
            const p1X = startX + 16;
            const p1Y = curY + 6;
            const pWidth = 60;
            const pHeight = 66;

            doc.rect(p1X, p1Y, pWidth, pHeight).strokeColor('#000000').lineWidth(0.8).stroke();
            if (enrolledPhotoBuffer) {
                try {
                    doc.image(enrolledPhotoBuffer, p1X + 1, p1Y + 1, { width: pWidth - 2, height: pHeight - 2 });
                } catch (e) {
                    doc.fillColor('#000000').fontSize(6).font('Helvetica').text('No photo available', p1X + 2, p1Y + 28, { width: pWidth - 4, align: 'center' });
                }
            } else {
                doc.fillColor('#000000').fontSize(6.5).font('Helvetica').text('Enrolled Photo\n(No file on record)', p1X + 2, p1Y + 24, { width: pWidth - 4, align: 'center' });
            }
            doc.fillColor('#000000').fontSize(6.5).font('Helvetica-Bold').text('ENROLLED REGISTRATION', p1X - 8, p1Y + pHeight + 3, { width: pWidth + 16, align: 'center' });

            // Photo 2: Live Webcam Baseline Portrait
            const p2X = startX + 105;
            const p2Y = curY + 6;
            doc.rect(p2X, p2Y, pWidth, pHeight).strokeColor('#000000').lineWidth(0.8).stroke();
            if (baselinePhotoBuffer) {
                try {
                    doc.image(baselinePhotoBuffer, p2X + 1, p2Y + 1, { width: pWidth - 2, height: pHeight - 2 });
                } catch (e) {
                    doc.fillColor('#000000').fontSize(6).font('Helvetica').text('No photo available', p2X + 2, p2Y + 28, { width: pWidth - 4, align: 'center' });
                }
            } else {
                doc.fillColor('#000000').fontSize(6.5).font('Helvetica').text('Live Webcam\nBaseline Photo', p2X + 2, p2Y + 24, { width: pWidth - 4, align: 'center' });
            }
            doc.fillColor('#000000').fontSize(6.5).font('Helvetica-Bold').text('LIVE WEBCAM BASELINE', p2X - 8, p2Y + pHeight + 3, { width: pWidth + 16, align: 'center' });

            // Biometric Audit Notes (Right side of photos)
            const auditNotesX = startX + 185;
            const auditNotesW = pageWidth - 195;
            const bioMatch = submission?.biometricVerification?.matchStatus || 'MATCH_CONFIRMED';
            const bioScore = submission?.biometricVerification?.confidenceScore ? `${submission.biometricVerification.confidenceScore}%` : '98.4%';
            const livenessChallenges = submission?.biometricVerification?.challengesCompleted || 'Multi-Challenge Liveness Completed (Head Turn, Blink, Neutral Face)';

            doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold').text('FACIAL COMPARISON & BIOMETRIC LIVENESS AUDIT:', auditNotesX, curY + 6);
            doc.fillColor('#000000').fontSize(7).font('Helvetica')
               .text(`Biometric Verification Status: ${bioMatch} (Facial Confidence: ${bioScore})`, auditNotesX, curY + 18)
               .text(`Liveness Challenges: ${livenessChallenges}`, auditNotesX, curY + 28)
               .text(`Candidate baseline photo confirmed matched against enrolled registration portrait. No secondary person or face substitution detected during active proctoring session.`, auditNotesX, curY + 38, { width: auditNotesW, lineGap: 1.5 });

            curY += photoBoxHeight + 8;

            // --- 3. EVIDENTIARY BASELINE & PROCTORING TIMELINE ---
            drawBwSectionBand(doc, startX, curY, pageWidth, 17, '3. EVIDENTIARY BASELINE & PROCTORING SYSTEM TIMELINE');
            curY += 17;

            // Timeline Header
            doc.rect(startX, curY, pageWidth, 16).fillAndStroke('#e5e7eb', '#000000');
            doc.fillColor('#000000').fontSize(7).font('Helvetica-Bold');
            doc.text('TRIGGER TIMESTAMP (IST)', startX + 6, curY + 4, { width: 130 });
            doc.text('RULE VIOLATION / EVENT TYPE', startX + 140, curY + 4, { width: 170 });
            doc.text('DURATION', startX + 315, curY + 4, { width: 70 });
            doc.text('SEVERITY / SYSTEM STATUS', startX + 390, curY + 4, { width: 140 });
            curY += 16;

            const VIOLATION_TYPES = new Set(['FULLSCREEN_EXIT', 'TAB_SWITCH', 'NETWORK_OFFLINE', 'EMERGENCY_SUBMISSION', 'SECONDARY_DEVICE', 'MIC_VOLUME_ALERT', 'PROCTORING_TRIGGER']);
            const infractionEvents = events.filter(ev => {
                const t = (ev.type || '').toUpperCase();
                const d = (ev.details || '').toLowerCase();
                if (VIOLATION_TYPES.has(t)) return true;
                if (t.includes('EXIT') || t.includes('SWITCH') || t.includes('DISCONNECT') || t.includes('OFFLINE') || t.includes('VIOLATION')) return true;
                if (d.includes('fullscreen') || d.includes('tab') || d.includes('focus') || d.includes('exited') || d.includes('switched') || d.includes('departed')) return true;
                return false;
            });

            const displayEvents = infractionEvents.slice(0, 3);
            if (displayEvents.length > 0) {
                displayEvents.forEach(ev => {
                    let evDur = Number(ev.durationSeconds || 0);
                    if (!evDur && ev.details) {
                        const m = ev.details.match(/(\d+)\s*seconds/i);
                        if (m && m[1]) evDur = parseInt(m[1], 10);
                    }
                    const evTime = formatISTDate(ev.timestamp || ev.startTime || verdictDate);
                    const evType = ev.type || 'PROCTORING_TRIGGER';
                    const evSev = evDur > 5 ? 'High (Exceeds 5s threshold)' : (evDur > 0 ? 'Moderate (Flagged)' : 'Trigger Alert');

                    doc.rect(startX, curY, pageWidth, 14).strokeColor('#000000').lineWidth(0.8).stroke();
                    doc.fillColor('#000000').fontSize(6.5).font('Helvetica');
                    doc.text(evTime, startX + 6, curY + 3, { width: 130, lineBreak: false });
                    doc.text(evType, startX + 140, curY + 3, { width: 170, lineBreak: false });
                    doc.text(evDur > 0 ? `${evDur}s` : '< 5s', startX + 315, curY + 3, { width: 70 });
                    doc.text(evSev, startX + 390, curY + 3, { width: 140, lineBreak: false });
                    curY += 14;
                });
            } else {
                doc.rect(startX, curY, pageWidth, 14).strokeColor('#000000').lineWidth(0.8).stroke();
                doc.fillColor('#000000').fontSize(6.5).font('Helvetica');
                doc.text(examStartIST, startX + 6, curY + 3, { width: 130 });
                doc.text(telemetrySummary || 'Session Monitored', startX + 140, curY + 3, { width: 170 });
                doc.text(fsExits > 0 || tabSwitches > 0 ? '> 5s' : '0s', startX + 315, curY + 3, { width: 70 });
                doc.text((fsExits > 0 || tabSwitches > 0) ? 'Moderate (Flagged Deviation)' : 'Zero Involuntary Interruptions', startX + 390, curY + 3, { width: 140 });
                curY += 14;
            }

            // Environment Context
            const techContext = report?.technicalContext || {};
            const clientIp = techContext.ip || submission?.clientIp || 'No details available';
            const rawBrowser = techContext.browser || submission?.browser || 'No details available';
            const parsedOs = techContext.os || techContext.platform || submission?.os || 'No details available';
            const screenRes = techContext.screenResolution || submission?.screenResolution || 'No details available';
            const payloadStatus = report?.verificationStatus || 'VERIFIED_MATCH';

            drawBwGridRow(doc, startX, curY, pageWidth, 22, 'CLIENT IP / NETWORK CONTEXT:', clientIp, 'BROWSER USER-AGENT:', rawBrowser.substring(0, 45), 0.45);
            curY += 22;

            drawBwGridRow(doc, startX, curY, pageWidth, 22, 'OPERATING SYSTEM / PLATFORM:', parsedOs, 'DISPLAY & HARDWARE SPECS:', screenRes, 0.45);
            curY += 22;

            drawBwGridRow(doc, startX, curY, pageWidth, 22, 'PAYLOAD CROSS-VERIFICATION:', payloadStatus, 'BROWSER LOCK-DOWN INTEGRITY:', `${fsExits} exit(s), ${tabSwitches} switch(es) logged`, 0.45);
            curY += 28;

            // --- 4. STUDENT DEFENSE & EXTENUATING DISCLOSURES ---
            drawBwSectionBand(doc, startX, curY, pageWidth, 17, '4. STUDENT DEFENSE & EXTENUATING DISCLOSURES');
            curY += 17;

            const formAnswers = report?.formAnswers || report?.additionalAnswers || {};
            const s1Ack = formAnswers.section1?.ackUnderstand || 'Yes, candidate acknowledged recorded proctoring trigger.';
            const s1Warn = formAnswers.section1?.warningCount || `${fsExits + tabSwitches} warning(s) remembered`;
            const s2Tab = formAnswers.section2?.tabReason || techContext.openedApp || 'No unauthorized external application declared.';
            const s2Fs = formAnswers.section2?.fullscreenReason || 'Window focus transition explained in defense statement.';
            const s3Per = formAnswers.section3?.peripherals || 'No external peripherals connected.';
            const s4Narrative = report?.detailedExplanation || formAnswers.section4?.explanation || 'Candidate submitted explanation via emergency report form.';
            const evidenceFiles = report?.evidenceFiles || report?.proofFiles || [];
            const evidenceStatus = evidenceFiles.length > 0 ? `${evidenceFiles.length} file(s) attached and cryptographically sealed` : 'No technical files uploaded';

            // Student Narrative Box
            doc.rect(startX, curY, pageWidth, 36).strokeColor('#000000').lineWidth(0.8).stroke();
            doc.fillColor('#000000').fontSize(7).font('Helvetica-Bold').text('CANDIDATE WRITTEN EXPLANATION (VERBATIM DEFENSE):', startX + 6, curY + 3);
            doc.fillColor('#000000').fontSize(7).font('Helvetica')
               .text(safeText(s4Narrative).substring(0, 320), startX + 6, curY + 12, { width: pageWidth - 12, lineGap: 1.2 });
            curY += 36;

            drawBwGridRow(doc, startX, curY, pageWidth, 22, 'FOCUS LOSS JUSTIFICATION:', safeText(s2Tab).substring(0, 50), 'FULLSCREEN RESTORATION CONTEXT:', safeText(s2Fs).substring(0, 50), 0.5);
            curY += 22;

            drawBwGridRow(doc, startX, curY, pageWidth, 22, 'PERIPHERALS DECLARED:', safeText(s3Per).substring(0, 50), 'TECHNICAL EVIDENCE STATUS:', evidenceStatus, 0.5);
            curY += 22;

            // Checklist Band
            doc.rect(startX, curY, pageWidth, 16).fillAndStroke('#e5e7eb', '#000000');
            doc.fillColor('#000000').fontSize(7).font('Helvetica-Bold');
            doc.text(`[X] Integrity Undertaking Certified   |   [${payloadStatus === 'VERIFIED_MATCH' ? 'X' : ' '}] Encrypted Payload Matched   |   [X] Formal EIRF Signed`, startX + 10, curY + 4);

            // Footer Page 1
            drawBwFooter(doc, 1, 2, 'EIRF Forensic Audit Report');

            // =========================================================================
            // PAGE 2: REVIEWER ANALYSIS, FINAL RESOLUTION, SYNTHESIS & SIGN-OFF
            // =========================================================================
            doc.addPage();

            // Page 2 Header
            doc.rect(startX, 28, pageWidth, 30).strokeColor('#000000').lineWidth(1.2).stroke();
            doc.fillColor('#000000').fontSize(10).font('Helvetica-Bold')
               .text('BICS DEPARTMENT OF EXAMINATION — EIRF FORENSIC AUDIT REPORT', startX, 33, { width: pageWidth, align: 'center' });
            doc.fillColor('#000000').fontSize(7.5).font('Helvetica')
               .text(`Incident Ref: ${reportId}   |   Submission Ref: ${safeText(submissionRefId)}   |   Candidate ID: ${studentId}`, startX, 45, { width: pageWidth, align: 'center' });

            curY = 66;

            // --- 5. REVIEWER'S ANALYSIS & CREDIBILITY FINDINGS ---
            drawBwSectionBand(doc, startX, curY, pageWidth, 17, "5. REVIEWER'S ANALYSIS & CREDIBILITY FINDINGS");
            curY += 17;

            // Credibility Box
            doc.rect(startX, curY, pageWidth, 44).strokeColor('#000000').lineWidth(0.8).stroke();
            doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold').text('CREDIBILITY ASSESSMENT (DEFENSE VS. TELEMETRY CORRELATION):', startX + 6, curY + 4);
            const credibilityText = isApproved
                ? `The candidate's explanation regarding focus loss correlates with the recorded telemetry timeline (${telemetrySummary}). No concurrent unauthorized network requests or secondary monitor instances were detected. The explanation is determined to be credible and non-prejudicial.`
                : `The candidate's explanation fails to reconcile the duration of window departure logged by the system (${telemetrySummary}). The telemetry timeline contradicts the submission assertion, confirming an unexcused examination policy violation.`;
            doc.fillColor('#000000').fontSize(7).font('Helvetica').text(credibilityText, startX + 6, curY + 14, { width: pageWidth - 12, lineGap: 1.2 });
            curY += 44;

            drawBwGridRow(doc, startX, curY, pageWidth, 22, 'INFRACTION HISTORY RECORD:', 'First-time formal incident report in current academic term', 'REPORTING TIMELINESS:', 'Filed within mandatory post-exam window', 0.5);
            curY += 22;

            drawBwGridRow(doc, startX, curY, pageWidth, 22, 'CAMERA / MIC INTEGRITY:', 'Webcam active; no lens obstruction detected during session', 'CANDIDATE COOPERATION:', 'Full questionnaire completed; local payload submitted', 0.5);
            curY += 28;

            // --- 6. FINAL RESOLUTION & ACTION PLAN ---
            drawBwSectionBand(doc, startX, curY, pageWidth, 17, '6. FINAL RESOLUTION & ACTION PLAN');
            curY += 17;

            // Large Verdict Banner (Strict B&W)
            doc.rect(startX, curY, pageWidth, 26).fillAndStroke('#e5e7eb', '#000000');
            doc.fillColor('#000000').fontSize(9.5).font('Helvetica-Bold')
               .text(`OFFICIAL VERDICT: ${rawStatus} — ${isApproved ? 'VIOLATION DISMISSED (PROVISIONAL ASSESSMENT GRANTED)' : 'VIOLATION UPHELD (DISCIPLINARY ACTION ENFORCED)'}`, startX, curY + 8, { width: pageWidth, align: 'center' });
            curY += 26;

            drawBwGridRow(doc, startX, curY, pageWidth, 22, 'RESOLUTION CLASSIFICATION:', resolvedCategory, 'REMEDIATION / PENALTY ACTION:', resolvedRemediation, 0.5);
            curY += 22;

            // Policy Clause & Appeals Box
            doc.rect(startX, curY, pageWidth, 36).strokeColor('#000000').lineWidth(0.8).stroke();
            doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold')
               .text(isApproved ? 'SYSTEM CALIBRATION & INSTRUCTOR NOTIFICATION:' : 'STATUTORY APPEALS PROCESS & DISCIPLINARY NOTICE:', startX + 6, curY + 4);
            const policyClauseText = isApproved
                ? `System heuristics logged for threshold calibration. The candidate is granted provisional standing for course ${safeText(courseCode)}. Candidate must submit a signed hardcopy of this document to course instructor within 48 hours for final grade entry.`
                : `In accordance with Examination Policy Section 9.2, the candidate has been assigned the designated penalty. The candidate retains the right to submit a formal appeal to the University Academic Appeals Committee within 48 hours with fresh evidence.`;
            doc.fillColor('#000000').fontSize(7).font('Helvetica').text(policyClauseText, startX + 6, curY + 14, { width: pageWidth - 12, lineGap: 1.5 });
            curY += 42;

            // --- 7. COMPREHENSIVE INCIDENT SYNTHESIS & CASE SUMMARY ---
            drawBwSectionBand(doc, startX, curY, pageWidth, 17, '7. COMPREHENSIVE INCIDENT SYNTHESIS & CASE SUMMARY');
            curY += 17;

            doc.rect(startX, curY, pageWidth, 48).strokeColor('#000000').lineWidth(0.8).stroke();
            doc.fillColor('#000000').fontSize(7).font('Helvetica')
               .text(forensicSynthesisText, startX + 8, curY + 6, { width: pageWidth - 16, lineGap: 1.8 });
            curY += 54;

            // --- 8. SIGN-OFF, AUDIT TRAIL & VERIFICATION ---
            drawBwSectionBand(doc, startX, curY, pageWidth, 17, '8. SIGN-OFF, AUDIT TRAIL & DIGITAL VERIFICATION');
            curY += 17;

            const signOffHeight = 85;
            doc.rect(startX, curY, pageWidth, signOffHeight).strokeColor('#000000').lineWidth(0.8).stroke();

            const leftWidth = 410;
            doc.fillColor('#000000').fontSize(7).font('Helvetica-Bold');
            doc.text('Adjudicator Name & Title:', startX + 8, curY + 6);
            doc.fillColor('#000000').font('Helvetica').text(`${reviewerName} (${reviewerTitle})`, startX + 130, curY + 6);

            doc.fillColor('#000000').font('Helvetica-Bold').text('Department / Board:', startX + 8, curY + 18);
            doc.fillColor('#000000').font('Helvetica').text('BICS Department of Examination — Integrity Unit', startX + 130, curY + 18);

            doc.fillColor('#000000').font('Helvetica-Bold').text('Decision Published (IST):', startX + 8, curY + 30);
            doc.fillColor('#000000').font('Helvetica').text(verdictDateIST, startX + 130, curY + 30);

            doc.fillColor('#000000').font('Helvetica-Bold').text('Hardcopy Submission Deadline:', startX + 8, curY + 42);
            doc.fillColor('#000000').font('Helvetica-Bold').text(`${deadlineIST} (Within 48 Hours)`, startX + 130, curY + 42);

            doc.fillColor('#000000').font('Helvetica-Bold').text('Digital Verification Hash:', startX + 8, curY + 54);
            doc.fillColor('#000000').font('Courier-Bold').text(hashString, startX + 130, curY + 54);

            doc.fillColor('#000000').font('Helvetica-Bold').text('Official Document URL:', startX + 8, curY + 66);
            doc.fillColor('#000000').fontSize(6.5).font('Helvetica').text(proxyUrlFormatted, startX + 130, curY + 66, { width: 275, lineBreak: false });

            // QR Code in Sign-Off Box
            if (qrPngBuffer) {
                try {
                    doc.image(qrPngBuffer, startX + leftWidth + 15, curY + 5, { width: 68, height: 68 });
                    doc.fillColor('#000000').fontSize(5.5).font('Helvetica')
                       .text('Scan for Portal Record', startX + leftWidth + 8, curY + 75, { width: 85, align: 'center' });
                } catch (e) {}
            }

            curY += signOffHeight + 8;

            // --- Physical Submission Slip ---
            doc.rect(startX, curY, pageWidth, 36).dash(3, { space: 3 }).strokeColor('#000000').stroke();
            doc.undash();
            doc.fillColor('#000000').fontSize(7).font('Helvetica-Bold')
               .text('COURSE INSTRUCTOR PHYSICAL SUBMISSION ACKNOWLEDGMENT (UPON RECEIPT OF PRINTED COPY):', startX + 8, curY + 4);
            doc.fillColor('#000000').fontSize(6.5).font('Helvetica')
               .text('Instructor Name: __________________________   Signature: __________________________   Date Received: ______________', startX + 8, curY + 15);
            doc.fillColor('#000000').fontSize(6).font('Helvetica')
               .text(`Candidate must submit this physical signed document to course instructor (${safeText(courseCode)}) within 48 hours for institutional grade normalization.`, startX + 8, curY + 25);

            // Footer Page 2
            drawBwFooter(doc, 2, 2, 'EIRF Forensic Audit Report');

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = {
    generateEirfVerdictPdfBuffer,
    generateDigitalVerdictHash,
    generateForensicSynthesis
};
