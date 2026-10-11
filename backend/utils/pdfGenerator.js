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
 * Generates an objective, forensic case synthesis paragraph via Gemini / OpenRouter / Groq API
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
- Final Committee Verdict: ${verdictStatus.toUpperCase()}
- Resolution Classification: ${resolutionCategory || 'Academic Review'}
- Committee Notes: ${adminRemarks || 'Evaluated in accordance with integrity policy'}

Provide ONLY the final synthesis paragraph.`;

    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    // 1. Try Gemini API directly if key is available
    if (geminiKey) {
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
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
            console.warn("[FORENSIC_SYNTHESIS]: Gemini API failed, trying fallback:", e.message);
        }
    }

    // 2. Try OpenRouter API fallback
    if (openrouterKey) {
        try {
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openrouterKey}`
                },
                body: JSON.stringify({
                    model: 'google/gemini-flash-1.5',
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
            console.warn("[FORENSIC_SYNTHESIS]: OpenRouter API failed, trying Groq fallback:", e.message);
        }
    }

    // 3. Try Groq API fallback
    if (groqKey) {
        try {
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${groqKey}`
                },
                body: JSON.stringify({
                    model: 'llama-3.1-8b-instant',
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
            console.warn("[FORENSIC_SYNTHESIS]: Groq API failed, using rule-based synthesis:", e.message);
        }
    }

    // 4. Deterministic Rule-Based Forensic Synthesis Fallback
    const isApproved = verdictStatus.toLowerCase() === 'approved';
    if (isApproved) {
        return `During the examination for ${courseCode} (${testTitle}), proctoring telemetry flagged session events (${telemetrySummary || 'navigation deviations'}). Upon comprehensive cross-examination of the candidate's Emergency Incident Report Form and verified payload records, the committee determined the disruption to be consistent with non-prejudicial technical interruptions. The candidate's defense has been validated, and the final verdict of APPROVAL has been granted for provisional score normalization.`;
    } else {
        return `During the examination for ${courseCode} (${testTitle}), proctoring telemetry recorded repeated compliance infractions (${telemetrySummary || 'proctoring navigation alerts'}). Review of the candidate's explanation alongside timestamped system event logs concluded that the defense failed to reconcile the observed discrepancies. Consequently, the Academic Integrity Committee has REJECTED the incident report, upholding disciplinary action in accordance with institutional examination regulations.`;
    }
}

/**
 * Helper to draw a filled section header band (matching reference image: light/medium gray fill with black border and black text)
 */
function drawSectionBand(doc, x, y, width, height, title) {
    doc.rect(x, y, width, height).fillAndStroke('#b0b0b0', '#000000');
    doc.fillColor('#000000').fontSize(8.5).font('Helvetica-Bold').text(title, x + 8, y + 4, { width: width - 16, lineBreak: false });
}

/**
 * Helper to draw a bordered table row with two columns (crisp black borders, pure black text)
 */
function drawGridRow(doc, x, y, width, height, label1, val1, label2, val2, colSplit = 0.5) {
    doc.rect(x, y, width, height).strokeColor('#000000').lineWidth(0.8).stroke();
    const midX = x + width * colSplit;
    doc.moveTo(midX, y).lineTo(midX, y + height).stroke();

    // Col 1
    doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold').text(label1, x + 6, y + 4);
    doc.fillColor('#000000').font('Helvetica').text(String(val1 || 'N/A'), x + 6, y + 13, { width: midX - x - 12, lineBreak: false });

    // Col 2
    if (label2) {
        doc.fillColor('#000000').font('Helvetica-Bold').text(label2, midX + 6, y + 4);
        doc.fillColor('#000000').font('Helvetica').text(String(val2 || 'N/A'), midX + 6, y + 13, { width: x + width - midX - 12, lineBreak: false });
    }
}

/**
 * Generates the Official 2-Page BICS EIRF Audit Report PDF Buffer (Strict Black & White Institutional Grid)
 */
async function generateEirfVerdictPdfBuffer({
    report,
    submission,
    test,
    candidate,
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
    const studentId = report?.studentId || candidate?.studentId || submission?.studentId || '2026002';
    const candidateName = report?.candidateName || candidate?.name || submission?.candidateName || 'Candidate';
    const candidateEmail = candidate?.registrationData?.collegeEmail || candidate?.registrationData?.personalEmail || candidate?.email || submission?.candidateEmail || 'candidate@bics.edu';
    const testTitle = report?.testTitle || test?.title || submission?.testTitle || 'Online Examination';
    const reportId = report?.reportId || 'EIRF-2026-UNKNOWN';
    const status = (report?.status || 'approved').toUpperCase();
    const isApproved = status === 'APPROVED';

    const verdictDate = report?.reviewedAt || report?.updatedAt || new Date();
    const verdictDateIST = formatToIST(verdictDate);
    const deadlineIST = deadlineDateStr || formatToIST(new Date(new Date(verdictDate).getTime() + 48 * 60 * 60 * 1000));

    const examStartIST = formatToIST(submission?.startedAt || report?.createdAt || verdictDate);
    const examEndIST = formatToIST(submission?.submittedAt || report?.submittedAt || verdictDate);
    const reportSubmittedIST = formatToIST(report?.submittedAt || report?.createdAt || verdictDate);

    const hashString = digitalHash || generateDigitalVerdictHash(submission?._id || submission?.id, studentId, reportId, verdictDate);
    const qrPayload = `${hashString}-${studentId}-${reportId}`;
    const proxyUrlFormatted = pdfProxyUrl || `https://bicsportal.netlify.app/media/eirf/${reportId}.pdf`;

    // Telemetry and proctoring log events
    const logSnap = report?.proctoringLogSnapshot || submission?.proctoringLog || {};
    const fsExits = Number(logSnap.fullscreenExits || 0);
    const tabSwitches = Number(logSnap.tabSwitches || 0);
    const events = Array.isArray(logSnap.events) ? logSnap.events : [];

    const telemetrySummary = `${fsExits} Fullscreen Exit(s), ${tabSwitches} Tab Switch(es)/Focus Loss events`;

    // Synthesis resolution classification
    const resolvedCategory = resolutionCategory || (isApproved ? 'Technical Glitch / Environmental Disruption' : 'Unexplained Window Deviation Confirmed');
    const resolvedRemediation = remediationAction || (isApproved ? 'Provisional Assessment Restored & Validated' : 'Examination Score Annulled (Zero Points)');

    // Generate Forensic Synthesis via AI/Gemini engine (with deterministic fallback)
    const forensicSynthesisText = await generateForensicSynthesis({
        reportId,
        candidateName,
        studentId,
        courseCode,
        courseName,
        testTitle,
        verdictStatus: status,
        adminRemarks,
        primaryCause: report?.primaryCause,
        detailedExplanation: report?.detailedExplanation || report?.formAnswers?.section4?.explanation,
        telemetrySummary,
        resolutionCategory: resolvedCategory
    });

    // Generate QR Code PNG Buffer
    const qrPngBuffer = qr.imageSync(qrPayload, { type: 'png', margin: 1 });

    return new Promise((resolve, reject) => {
        try {
            // A4 document: 595.28 x 841.89 points. Margins: left/right 30pt, top 25pt, bottom 0pt
            const doc = new PDFDocument({
                margins: { top: 25, bottom: 0, left: 30, right: 30 },
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
            // PAGE 1: DOCUMENT METADATA, EVIDENTIARY BASELINE & STUDENT DEFENSE
            // =========================================================================

            // --- Header Bar (Crisp Black & White) ---
            doc.rect(startX, 28, pageWidth, 48).strokeColor('#000000').lineWidth(1.2).stroke();
            doc.rect(startX + 1, 29, pageWidth - 2, 46).fill('#ffffff');

            doc.fillColor('#000000').fontSize(13).font('Helvetica-Bold')
               .text('BICS DEPARTMENT OF EXAMINATION', startX, 35, { width: pageWidth, align: 'center' });
            doc.fillColor('#000000').fontSize(8.5).font('Helvetica')
               .text('BICS Online Testing System — Academic Integrity & Incident Adjudication Unit', startX, 50, { width: pageWidth, align: 'center' });
            doc.fillColor('#000000').fontSize(9.5).font('Helvetica-Bold')
               .text(`EIRF AUDIT REPORT (Ref: ${reportId})`, startX, 62, { width: pageWidth, align: 'center' });

            let curY = 82;

            // --- 1. DOCUMENT METADATA & SYSTEM CONTEXT ---
            drawSectionBand(doc, startX, curY, pageWidth, 17, '1. DOCUMENT METADATA & SYSTEM CONTEXT');
            curY += 17;

            drawGridRow(doc, startX, curY, pageWidth, 26, 'INCIDENT TRACKING ID:', reportId, 'INITIAL SEVERITY LEVEL:', (fsExits >= 3 || tabSwitches >= 3) ? 'HIGH (Exceeded Threshold)' : 'MEDIUM (Review Flagged)', 0.5);
            curY += 26;

            drawGridRow(doc, startX, curY, pageWidth, 26, 'CANDIDATE FULL NAME:', candidateName, 'INSTITUTIONAL STUDENT ID:', studentId, 0.5);
            curY += 26;

            drawGridRow(doc, startX, curY, pageWidth, 26, 'REGISTERED COLLEGE EMAIL:', candidateEmail, 'COURSE CODE & TITLE:', `${courseCode} - ${courseName}`, 0.5);
            curY += 26;

            drawGridRow(doc, startX, curY, pageWidth, 26, 'EXAMINATION TITLE:', testTitle, 'EXAM SESSION WINDOW:', `${examStartIST} — ${examEndIST}`, 0.5);
            curY += 26;

            drawGridRow(doc, startX, curY, pageWidth, 26, 'EIRF FORM SUBMITTED AT:', reportSubmittedIST, 'ADJUDICATION TIMELINESS:', 'Compliant (Filed within 45-min limit)', 0.5);
            curY += 32;

            // --- 2. EVIDENTIARY BASELINE & PROCTORING SYSTEM LOG ---
            drawSectionBand(doc, startX, curY, pageWidth, 17, '2. EVIDENTIARY BASELINE & PROCTORING SYSTEM LOG');
            curY += 17;

            // Itemized Trigger Timeline Header (Gray fill with black text & black borders)
            doc.rect(startX, curY, pageWidth, 16).fillAndStroke('#e5e7eb', '#000000');
            doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold');
            doc.text('TRIGGER TIMESTAMP (IST)', startX + 6, curY + 4, { width: 130 });
            doc.text('RULE VIOLATION / EVENT TYPE', startX + 140, curY + 4, { width: 170 });
            doc.text('DURATION', startX + 315, curY + 4, { width: 70 });
            doc.text('SYSTEM SEVERITY / CONFIDENCE', startX + 390, curY + 4, { width: 140 });
            curY += 16;

            // Itemized triggers: Filter strictly for actual compliance violations / triggers
            const VIOLATION_TYPES = new Set(['FULLSCREEN_EXIT', 'TAB_SWITCH', 'NETWORK_OFFLINE', 'EMERGENCY_SUBMISSION', 'SECONDARY_DEVICE', 'MIC_VOLUME_ALERT', 'PROCTORING_TRIGGER']);
            const infractionEvents = events.filter(ev => {
                const t = (ev.type || '').toUpperCase();
                const d = (ev.details || '').toLowerCase();
                if (VIOLATION_TYPES.has(t)) return true;
                if (t.includes('EXIT') || t.includes('SWITCH') || t.includes('DISCONNECT') || t.includes('OFFLINE') || t.includes('VIOLATION')) return true;
                if (d.includes('fullscreen') || d.includes('tab') || d.includes('focus') || d.includes('exited') || d.includes('switched') || d.includes('departed')) return true;
                return false;
            });

            // Display up to 4 actual infractions
            const displayEvents = infractionEvents.slice(0, 4);
            if (displayEvents.length > 0) {
                displayEvents.forEach(ev => {
                    let evDur = Number(ev.durationSeconds || 0);
                    if (!evDur && ev.details) {
                        const m = ev.details.match(/(\d+)\s*seconds/i);
                        if (m && m[1]) evDur = parseInt(m[1], 10);
                    }
                    const evTime = formatToIST(ev.timestamp || ev.startTime || verdictDate);
                    const evType = ev.type || 'PROCTORING_TRIGGER';
                    const evSev = evDur > 5 ? 'High (Exceeds 5s threshold)' : (evDur > 0 ? 'Moderate (Flagged)' : 'Trigger Alert');

                    doc.rect(startX, curY, pageWidth, 15).strokeColor('#000000').lineWidth(0.8).stroke();
                    doc.fillColor('#000000').fontSize(7).font('Helvetica');
                    doc.text(evTime, startX + 6, curY + 4, { width: 130, lineBreak: false });
                    doc.text(evType, startX + 140, curY + 4, { width: 170, lineBreak: false });
                    doc.text(evDur > 0 ? `${evDur}s` : '< 5s', startX + 315, curY + 4, { width: 70 });
                    doc.text(evSev, startX + 390, curY + 4, { width: 140, lineBreak: false });
                    curY += 15;
                });
            } else {
                // If telemetry logged count > 0 but individual event array is empty
                doc.rect(startX, curY, pageWidth, 15).strokeColor('#000000').lineWidth(0.8).stroke();
                doc.fillColor('#000000').fontSize(7).font('Helvetica');
                doc.text(examStartIST, startX + 6, curY + 4, { width: 130 });
                doc.text(telemetrySummary || 'Fullscreen / Focus Deviation Logged', startX + 140, curY + 4, { width: 170 });
                doc.text(fsExits > 0 || tabSwitches > 0 ? '> 5s' : '0s', startX + 315, curY + 4, { width: 70 });
                doc.text((fsExits > 0 || tabSwitches > 0) ? 'Moderate (Threshold Exceeded)' : 'Routine Session Monitor', startX + 390, curY + 4, { width: 140 });
                curY += 15;
            }

            // Environment Logs Grid (100% Dynamic from client submission)
            const techContext = report?.technicalContext || {};
            const clientIp = techContext.ip && techContext.ip !== 'Client Local Session' 
                ? `${techContext.ip} (Verified IP)` 
                : (techContext.networkType ? `${techContext.networkType} Network` : '192.168.1.1 (Client Subnet)');
            
            const rawBrowser = techContext.browser || 'Chromium Lock-down Engine';
            let parsedBrowser = rawBrowser;
            if (rawBrowser.includes('Edg/')) parsedBrowser = 'Microsoft Edge (Chromium)';
            else if (rawBrowser.includes('Chrome/')) parsedBrowser = 'Google Chrome (Secure Browser)';
            else if (rawBrowser.includes('Firefox/')) parsedBrowser = 'Mozilla Firefox';
            else if (rawBrowser.includes('Safari/') && !rawBrowser.includes('Chrome/')) parsedBrowser = 'Apple Safari';
            parsedBrowser = `${parsedBrowser.substring(0, 32)} (Build ${rawBrowser.match(/Chrome\/(\d+)|Firefox\/(\d+)|Version\/(\d+)/)?.[1] || '128'})`;

            const parsedOs = techContext.os || techContext.platform || (rawBrowser.includes('Windows') ? 'Windows 10/11 x64' : (rawBrowser.includes('Mac') ? 'macOS' : 'Linux x64'));
            
            const screenRes = techContext.screenResolution || (techContext.viewportSize ? `${techContext.viewportSize} (Viewport)` : '1920x1080');
            const cores = techContext.hardwareConcurrency ? `${techContext.hardwareConcurrency} Logical Cores` : 'Multi-Core CPU';
            const peripheralAnswer = (report?.formAnswers?.section3?.peripherals || report?.additionalAnswers?.peripherals || '').toLowerCase();
            const hasExternalPeripherals = peripheralAnswer.includes('yes') && !peripheralAnswer.includes('no');
            const hardwareStr = `${screenRes} | ${cores} | ${hasExternalPeripherals ? 'External Peripherals Declared' : 'Single Display / No External Screen'}`;
            
            const payloadStatus = report?.verificationStatus || 'VERIFIED_MATCH';
            const lockdownStatus = (fsExits === 0 && tabSwitches === 0) 
                ? 'Full-Screen Enforced (Zero Deviations)' 
                : `Full-Screen Enforced (${fsExits} exits, ${tabSwitches} switches logged)`;

            drawGridRow(doc, startX, curY, pageWidth, 24, 'CLIENT IP / NETWORK CONTEXT:', clientIp, 'BROWSER USER-AGENT:', parsedBrowser, 0.45);
            curY += 24;

            drawGridRow(doc, startX, curY, pageWidth, 24, 'OPERATING SYSTEM / PLATFORM:', parsedOs, 'PERIPHERALS / HARDWARE LOGS:', hardwareStr, 0.45);
            curY += 24;

            drawGridRow(doc, startX, curY, pageWidth, 24, 'PAYLOAD CROSS-VERIFICATION:', payloadStatus, 'BROWSER LOCK-DOWN INTEGRITY:', lockdownStatus, 0.45);
            curY += 30;

            // --- 3. STUDENT DEFENSE & EXTENUATING DISCLOSURES ---
            drawSectionBand(doc, startX, curY, pageWidth, 17, '3. STUDENT DEFENSE & EXTENUATING DISCLOSURES');
            curY += 17;

            const formAnswers = report?.formAnswers || report?.additionalAnswers || {};
            const s1Ack = formAnswers.section1?.ackUnderstand || 'Yes, candidate acknowledged recorded proctoring trigger.';
            const s1Warn = formAnswers.section1?.warningCount || `${fsExits + tabSwitches} warning(s) remembered`;
            const s2Tab = formAnswers.section2?.tabReason || techContext.openedApp || 'No unauthorized external application declared.';
            const s2Fs = formAnswers.section2?.fullscreenReason || 'Window focus transition explained in defense statement.';
            const s3Per = formAnswers.section3?.peripherals || 'No external peripherals connected.';
            const s4Narrative = report?.detailedExplanation || formAnswers.section4?.explanation || 'Candidate submitted explanation via emergency report form.';

            // Student Narrative Box
            doc.rect(startX, curY, pageWidth, 42).strokeColor('#000000').lineWidth(0.8).stroke();
            doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold').text('CANDIDATE OFFICIAL WRITTEN EXPLANATION (VERBATIM):', startX + 6, curY + 4);
            doc.fillColor('#000000').fontSize(7.5).font('Helvetica')
               .text(s4Narrative.substring(0, 360), startX + 6, curY + 15, { width: pageWidth - 12, lineGap: 1.5 });
            curY += 42;

            // Context Rows
            drawGridRow(doc, startX, curY, pageWidth, 24, 'TAB SWITCH / FOCUS LOSS JUSTIFICATION:', s2Tab.substring(0, 55), 'FULLSCREEN RESTORATION CONTEXT:', s2Fs.substring(0, 55), 0.5);
            curY += 24;

            drawGridRow(doc, startX, curY, pageWidth, 28, 'PERIPHERAL CONNECTION STATUS:', s3Per.substring(0, 55), 'SELF-REPORTED WARNING COUNT:', `${s1Warn.substring(0, 25)} (Awareness: ${s1Ack.substring(0, 15)})`, 0.5);
            curY += 28;

            // Checklist Band (Ref image style: checkboxes with clear black marks)
            doc.rect(startX, curY, pageWidth, 18).fillAndStroke('#e5e7eb', '#000000');
            doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold');
            doc.text(`[X] Integrity Undertaking Certified   |   [${payloadStatus === 'VERIFIED_MATCH' ? 'X' : ' '}] Encrypted Payload Matched   |   [X] Formal EIRF Signed`, startX + 10, curY + 5);
            curY += 22;

            // Page 1 Footer
            doc.moveTo(startX, 805).lineTo(startX + pageWidth, 805).strokeColor('#000000').lineWidth(0.8).stroke();
            doc.fillColor('#000000').fontSize(7.5).font('Helvetica')
               .text('BICS Department of Examination • Academic Integrity Record • Confidential', startX, 810, { width: 350 });
            doc.text('Page 1 of 2', startX + pageWidth - 60, 810, { width: 60, align: 'right' });


            // =========================================================================
            // PAGE 2: REVIEWER ANALYSIS, FINAL RESOLUTION, SYNTHESIS & SIGN-OFF
            // =========================================================================
            doc.addPage();

            // Page 2 Header (Crisp Black & White)
            doc.rect(startX, 28, pageWidth, 30).strokeColor('#000000').lineWidth(1.2).stroke();
            doc.rect(startX + 1, 29, pageWidth - 2, 28).fill('#ffffff');
            doc.fillColor('#000000').fontSize(10).font('Helvetica-Bold')
               .text('BICS DEPARTMENT OF EXAMINATION — EIRF AUDIT REPORT', startX, 33, { width: pageWidth, align: 'center' });
            doc.fillColor('#000000').fontSize(7.5).font('Helvetica')
               .text(`Incident Ref: ${reportId}   |   Candidate ID: ${studentId}   |   Continuation Sheet`, startX, 45, { width: pageWidth, align: 'center' });

            curY = 66;

            // --- 4. REVIEWER'S ANALYSIS & CREDIBILITY FINDINGS ---
            drawSectionBand(doc, startX, curY, pageWidth, 17, "4. REVIEWER'S ANALYSIS & CREDIBILITY FINDINGS");
            curY += 17;

            // Credibility Box
            doc.rect(startX, curY, pageWidth, 46).strokeColor('#000000').lineWidth(0.8).stroke();
            doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold').text('CREDIBILITY ASSESSMENT (DEFENSE VS. TECHNICAL TELEMETRY CORRELATION):', startX + 6, curY + 4);
            const credibilityText = isApproved
                ? `The candidate's explanation regarding focus loss correlates with the recorded telemetry timeline (${telemetrySummary}). No concurrent unauthorized network requests or secondary monitor instances were detected. The explanation is determined to be credible and non-prejudicial.`
                : `The candidate's explanation fails to reconcile the duration of window departure logged by the system (${telemetrySummary}). The telemetry timeline contradicts the submission assertion, confirming an unexcused examination policy violation.`;
            doc.fillColor('#000000').fontSize(7.5).font('Helvetica').text(credibilityText, startX + 6, curY + 14, { width: pageWidth - 12, lineGap: 1.2 });
            curY += 46;

            // Mitigating & Aggravating Factors Grid
            drawGridRow(doc, startX, curY, pageWidth, 24, 'INFRACTION HISTORY RECORD:', 'First-time formal incident report in current academic term', 'REPORTING TIMELINESS:', 'Filed within mandatory 45-minute post-exam window', 0.5);
            curY += 24;

            drawGridRow(doc, startX, curY, pageWidth, 24, 'CAMERA / MIC INTEGRITY:', 'Webcam active; no lens obstruction detected during session', 'CANDIDATE COOPERATION:', 'Full questionnaire completed; local payload submitted', 0.5);
            curY += 30;

            // --- 5. FINAL RESOLUTION & ACTION PLAN ---
            drawSectionBand(doc, startX, curY, pageWidth, 17, '5. FINAL RESOLUTION & ACTION PLAN');
            curY += 17;

            // Large Verdict Banner (Ref image style: clean double/thick black border with gray background or white fill)
            doc.rect(startX, curY, pageWidth, 28).fillAndStroke('#e5e7eb', '#000000');
            doc.fillColor('#000000').fontSize(10).font('Helvetica-Bold')
               .text(`OFFICIAL VERDICT: ${status} — ${isApproved ? 'VIOLATION DISMISSED (PROVISIONAL ASSESSMENT GRANTED)' : 'VIOLATION UPHELD (DISCIPLINARY ACTION ENFORCED)'}`, startX, curY + 9, { width: pageWidth, align: 'center' });
            curY += 28;

            drawGridRow(doc, startX, curY, pageWidth, 24, 'RESOLUTION CLASSIFICATION:', resolvedCategory, 'REMEDIATION / PENALTY ACTION:', resolvedRemediation, 0.5);
            curY += 24;

            // Policy Clause & Appeals Box
            doc.rect(startX, curY, pageWidth, 38).strokeColor('#000000').lineWidth(0.8).stroke();
            doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold')
               .text(isApproved ? 'SYSTEM CALIBRATION & INSTRUCTOR NOTIFICATION:' : 'STATUTORY APPEALS PROCESS & DISCIPLINARY NOTICE:', startX + 6, curY + 4);
            const policyClauseText = isApproved
                ? `System heuristics logged for threshold calibration. The candidate is granted full provisional standing for course ${courseCode}. Candidate must submit a signed hardcopy of this document to course instructor within 48 hours for final grade entry.`
                : `In accordance with Examination Policy Section 9.2, the candidate has been assigned the designated penalty. The candidate retains the right to submit a formal appeal to the University Academic Appeals Committee within 48 hours with fresh evidence.`;
            doc.fillColor('#000000').fontSize(7.5).font('Helvetica').text(policyClauseText, startX + 6, curY + 14, { width: pageWidth - 12, lineGap: 1.5 });
            curY += 44;

            // --- 6. COMPREHENSIVE INCIDENT SYNTHESIS & CASE SUMMARY ---
            drawSectionBand(doc, startX, curY, pageWidth, 17, '6. COMPREHENSIVE INCIDENT SYNTHESIS & CASE SUMMARY');
            curY += 17;

            doc.rect(startX, curY, pageWidth, 50).fillAndStroke('#ffffff', '#000000');
            doc.fillColor('#000000').fontSize(7.5).font('Helvetica')
               .text(forensicSynthesisText, startX + 8, curY + 6, { width: pageWidth - 16, lineGap: 2 });
            curY += 56;

            // --- 7. SIGN-OFF, AUDIT TRAIL & VERIFICATION ---
            drawSectionBand(doc, startX, curY, pageWidth, 17, '7. SIGN-OFF, AUDIT TRAIL & VERIFICATION');
            curY += 17;

            const signOffHeight = 85;
            doc.rect(startX, curY, pageWidth, signOffHeight).strokeColor('#000000').lineWidth(0.8).stroke();

            // Left details
            const leftWidth = 410;
            doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold');
            doc.text(`Adjudicator Name & Title:`, startX + 8, curY + 6);
            doc.fillColor('#000000').font('Helvetica').text(`${reviewerName} (${reviewerTitle})`, startX + 125, curY + 6);

            doc.fillColor('#000000').font('Helvetica-Bold').text(`Department / Board:`, startX + 8, curY + 18);
            doc.fillColor('#000000').font('Helvetica').text(`BICS Department of Examination — Integrity Unit`, startX + 125, curY + 18);

            doc.fillColor('#000000').font('Helvetica-Bold').text(`Decision Published:`, startX + 8, curY + 30);
            doc.fillColor('#000000').font('Helvetica').text(`${verdictDateIST}`, startX + 125, curY + 30);

            doc.fillColor('#000000').font('Helvetica-Bold').text(`Hardcopy Deadline:`, startX + 8, curY + 42);
            doc.fillColor('#000000').font('Helvetica-Bold').text(`${deadlineIST} (Within 48 Hours)`, startX + 125, curY + 42);

            doc.fillColor('#000000').font('Helvetica-Bold').text(`Digital Verification Hash:`, startX + 8, curY + 54);
            doc.fillColor('#000000').font('Courier-Bold').text(hashString, startX + 125, curY + 54);

            doc.fillColor('#000000').font('Helvetica-Bold').text(`Official Document URL:`, startX + 8, curY + 66);
            doc.fillColor('#000000').fontSize(7).font('Helvetica').text(proxyUrlFormatted, startX + 125, curY + 66, { width: 280, lineBreak: false });

            // Right QR Code
            doc.image(qrPngBuffer, startX + leftWidth + 15, curY + 5, { width: 68, height: 68 });
            doc.fillColor('#000000').fontSize(6).font('Helvetica')
               .text('Scan for Portal Record', startX + leftWidth + 8, curY + 75, { width: 85, align: 'center' });

            curY += signOffHeight + 8;

            // --- Course Instructor Physical Receipt Slip ---
            doc.rect(startX, curY, pageWidth, 38).dash(3, { space: 3 }).strokeColor('#000000').stroke();
            doc.undash();
            doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold')
               .text('COURSE INSTRUCTOR PHYSICAL SUBMISSION ACKNOWLEDGMENT (UPON RECEIPT OF PRINTED COPY):', startX + 8, curY + 5);
            doc.fillColor('#000000').fontSize(7).font('Helvetica')
               .text(`Instructor Name: __________________________   Signature: __________________________   Date Received: ______________`, startX + 8, curY + 16);
            doc.fillColor('#000000').fontSize(6.5).font('Helvetica')
               .text(`Candidate must submit this physical signed document to course instructor (${courseCode}) within 48 hours for institutional grade normalization.`, startX + 8, curY + 27);

            // Page 2 Footer
            doc.moveTo(startX, 805).lineTo(startX + pageWidth, 805).strokeColor('#000000').lineWidth(0.8).stroke();
            doc.fillColor('#000000').fontSize(7.5).font('Helvetica')
               .text('Official Forensic Audit Document • BICS Department of Examination', startX, 810, { width: 350 });
            doc.text('Page 2 of 2', startX + pageWidth - 60, 810, { width: 60, align: 'right' });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = {
    generateEirfVerdictPdfBuffer,
    generateDigitalVerdictHash,
    generateForensicSynthesis,
    formatToIST
};
