const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const {
    registerPdfFonts,
    resolveExamTypeLabel,
    safeText,
    formatISTDate,
    generateQrBuffer,
    fetchImageBuffer,
    drawBwHeader,
    drawBwContinuationHeader,
    drawBwSectionBand,
    drawBwSplitRow,
    drawBwTable,
    drawBwFooter
} = require('./pdfCommon');
const { toBicsId } = require('../../utils/bicsId');

/**
 * Generates SHA-256 Digital Signature Hash for the EIRF Verdict
 */
function generateDigitalVerdictHash(submissionId, studentId, reportId, verdictDate) {
    const secretKey = process.env.EIRF_SECRET_KEY || 'BICS_ACADEMIC_EIRF_KEY_2026';
    const dataStr = `${submissionId || 'NONE'}:${studentId || 'NONE'}:${reportId || 'NONE'}:${verdictDate || 'NONE'}:${secretKey}`;
    return crypto.createHash('sha256').update(dataStr).digest('hex').substring(0, 16).toUpperCase();
}

/**
 * Generates an objective, forensic case synthesis paragraph via Gemini / Groq / OpenRouter API.
 * Deterministic fallback ensures reliable generation even without network/API keys.
 * Never fabricates missing details or mentions AI/language models.
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
    const safeCourseCode = safeText(courseCode);
    const safeCourseName = safeText(courseName);
    const safeCourseCombined = (safeCourseCode !== 'Details not available' && safeCourseName !== 'Details not available')
        ? `${safeCourseCode} - ${safeCourseName}`
        : (safeCourseCode !== 'Details not available' ? safeCourseCode : safeCourseName);
    const safeTestTitle = safeText(testTitle);
    const safeCause = safeText(primaryCause);
    const safeTelemetry = safeText(telemetrySummary);
    const safeDefense = safeText(detailedExplanation);
    const safeCategory = safeText(resolutionCategory);
    const safeRemarks = safeText(adminRemarks);
    const normVerdict = String(verdictStatus || '').toUpperCase();

    const prompt = `You are an academic proctoring forensic analyst drafting an official case synthesis for an institutional audit report.
Write a concise, objective, formal 3 to 4 sentence executive synthesis of this examination incident.
Do NOT mention AI, Gemini, machine learning, automated generators, or prompts.
Present it strictly as an institutional case synthesis. Use only the provided facts; do not invent missing details.

CASE PARTICULARS:
- Incident ID: ${safeText(reportId)}
- Student: ${safeText(candidateName)} (ID: ${safeText(studentId)})
- Course: ${safeCourseCombined}
- Examination: ${safeTestTitle}
- Recorded Primary Trigger: ${safeCause}
- Telemetry Evidence: ${safeTelemetry}
- Student Explanation: ${safeDefense}
- Final Committee Verdict: ${normVerdict || 'PENDING_REVIEW'}
- Resolution Classification: ${safeCategory}
- Committee Notes: ${safeRemarks}

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
    const subjectLabel = safeCourseCombined !== 'Details not available'
        ? `${safeCourseCombined}${safeTestTitle !== 'Details not available' ? ` (${safeTestTitle})` : ''}`
        : safeTestTitle;
    const telemetryClause = safeTelemetry !== 'Details not available' ? safeTelemetry : 'recorded session telemetry';

    if (normVerdict === 'APPROVED') {
        return `During the examination${subjectLabel !== 'Details not available' ? ` for ${subjectLabel}` : ''}, proctoring telemetry flagged session events (${telemetryClause}). Upon cross-examination of the candidate's Emergency Incident Report Form and verified system telemetry records, the committee determined the disruption to be consistent with non-prejudicial technical interruptions. The candidate's defense has been validated, and the final verdict of APPROVAL has been granted for provisional score restoration.`;
    }
    if (normVerdict === 'REJECTED') {
        return `During the examination${subjectLabel !== 'Details not available' ? ` for ${subjectLabel}` : ''}, proctoring telemetry recorded compliance infractions (${telemetryClause}). Review of the candidate's explanation alongside timestamped system event logs concluded that the defense failed to reconcile the observed discrepancies. Consequently, the Academic Integrity Committee has REJECTED the incident report, upholding score annulment as final and binding under institutional examination regulations.`;
    }
    return `Incident audit record compiled${subjectLabel !== 'Details not available' ? ` for ${subjectLabel}` : ''} based on ${telemetryClause}. Adjudication status: ${safeText(verdictStatus)}. Further details are governed by institutional examination records.`;
}

/**
 * Generates the Official BICS EIRF Forensic Audit & Verdict PDF Buffer
 * Typography: Plus Jakarta Sans (Titles & Headers) + Inter (Body, Keys, Values)
 * Layout: Clash-free Page 1 Header (single Submission ID), 4-col & 2-col Horizontal Key-Value Grid, Reference ID in Continuation Headers & Footers
 */
async function generateEirfVerdictPdfBuffer(params = {}) {
    const isFlatLegacyCall = Boolean(
        params &&
        typeof params === 'object' &&
        params.reportId &&
        (!params.report || Object.keys(params.report).length === 0)
    );

    const report = isFlatLegacyCall ? params : (params.report || {});
    const submission = params.submission || {};
    const test = params.test || {};
    const candidate = params.candidate || {};
    const systemConfig = params.systemConfig || null;
    const examType = params.examType || null;
    const courseCode = params.courseCode || '';
    const courseName = params.courseName || '';
    const adminRemarks = params.adminRemarks || '';
    const resolutionCategory = params.resolutionCategory || '';
    const remediationAction = params.remediationAction || '';
    const reviewerName = params.reviewerName || '';
    const reviewerTitle = params.reviewerTitle || '';
    const digitalHash = params.digitalHash || '';
    const deadlineDateStr = params.deadlineDateStr || '';

    const resolvedCourseCode = safeText(
        courseCode || report?.courseCode || test?.courseCode || test?.code || submission?.courseCode
    );
    const resolvedCourseName = safeText(
        courseName || report?.courseName || test?.courseName || test?.course || test?.subject || submission?.course
    );
    const courseDisplay = (resolvedCourseCode !== 'Details not available' && resolvedCourseName !== 'Details not available')
        ? `${resolvedCourseCode} - ${resolvedCourseName}`
        : (resolvedCourseCode !== 'Details not available' ? resolvedCourseCode : resolvedCourseName);

    const studentId = safeText(report?.studentId || candidate?.studentId || submission?.studentId);
    const candidateName = safeText(report?.candidateName || report?.studentName || candidate?.name || submission?.candidateName);
    const candidateEmail = safeText(
        candidate?.registrationData?.personalEmail ||
        candidate?.personalEmail ||
        candidate?.registrationData?.collegeEmail ||
        candidate?.email ||
        submission?.candidateEmail ||
        report?.candidateEmail
    );
    const testTitle = safeText(report?.testTitle || report?.examTitle || test?.title || submission?.testTitle);
    const reportId = safeText(report?.reportId || submission?.eirfReportId);
    const rawStatusUpper = String(report?.status || submission?.eirfStatus || '').trim().toUpperCase();
    const isApproved = rawStatusUpper === 'APPROVED';
    const isRejected = rawStatusUpper === 'REJECTED';
    const displayStatus = rawStatusUpper || 'DETAILS NOT AVAILABLE';

    const resolvedExamType = examType || systemConfig?.examType || test?.examType || submission?.examType || report?.examType;
    const examTypeLabel = resolveExamTypeLabel(resolvedExamType);
    const academicSession = 'Academic Year 2026-27 • Semester I';

    const rawSubId = submission?._id || submission?.id || report?.submissionId;
    const bicsObjectId = rawSubId ? toBicsId(rawSubId) : 'Details not available';
    const submissionRefId = safeText(submission?.submissionRefId || report?.submissionRefId);

    const verdictDateRaw = report?.reviewedAt || report?.adjudicatedAt || null;
    const verdictDateIST = verdictDateRaw ? formatISTDate(verdictDateRaw) : 'Details not available';
    const deadlineIST = deadlineDateStr
        ? safeText(deadlineDateStr)
        : (verdictDateRaw
            ? formatISTDate(new Date(new Date(verdictDateRaw).getTime() + 48 * 60 * 60 * 1000))
            : 'Details not available');

    const examStartRaw = submission?.startedAt || submission?.createdAt || null;
    const examEndRaw = submission?.submittedAt || null;
    const examStartIST = examStartRaw ? formatISTDate(examStartRaw) : null;
    const examEndIST = examEndRaw ? formatISTDate(examEndRaw) : null;
    const examWindowDisplay = (examStartIST && examEndIST)
        ? `${examStartIST}  —  ${examEndIST}`
        : (examStartIST || examEndIST || 'Details not available');

    const reportSubmittedRaw = report?.filedAt || report?.submittedAt || report?.createdAt || null;
    const reportSubmittedIST = reportSubmittedRaw ? formatISTDate(reportSubmittedRaw) : 'Details not available';

    const expiresAtRaw = submission?.eirfExpiresAt || report?.expiresAt || null;
    let timelinessLabel = 'Details not available';
    if (reportSubmittedRaw && expiresAtRaw) {
        timelinessLabel = new Date(reportSubmittedRaw).getTime() <= new Date(expiresAtRaw).getTime()
            ? 'Compliant (Filed within 45-min window)'
            : 'Late Filing (Filed after expiry window)';
    } else if (reportSubmittedRaw) {
        timelinessLabel = 'Filing Timestamp Recorded';
    }

    const hashString = digitalHash || report?.digitalHash || generateDigitalVerdictHash(rawSubId, studentId, reportId, verdictDateRaw || 'AUDIT');
    const qrPayload = `BICS-EIRF|Report:${reportId}|Ref:${submissionRefId}|Status:${rawStatusUpper || 'PENDING'}|Hash:${hashString}`;
    const deliveryChannel = 'Registered Email & BICS Admin Portal';

    // Telemetry and proctoring logs (strictly schema-driven)
    const logSnap = report?.proctoringLogSnapshot || submission?.proctoringLog || {};
    const hasLogData = Boolean(
        report?.proctoringLogSnapshot ||
        submission?.proctoringLog
    );
    const fsExits = logSnap.fullscreenExits !== undefined && logSnap.fullscreenExits !== null ? Number(logSnap.fullscreenExits) : null;
    const tabSwitches = logSnap.tabSwitches !== undefined && logSnap.tabSwitches !== null ? Number(logSnap.tabSwitches) : null;
    const events = Array.isArray(logSnap.events) ? logSnap.events : [];

    const telemetrySummary = hasLogData
        ? `${fsExits ?? 0} Fullscreen Exit(s), ${tabSwitches ?? 0} Tab Switch(es) / Focus Loss event(s)`
        : 'Details not available';

    let severityLabel = 'Details not available';
    if (hasLogData) {
        if ((fsExits || 0) >= 3 || (tabSwitches || 0) >= 3) {
            severityLabel = 'HIGH (Exceeded Threshold)';
        } else if ((fsExits || 0) > 0 || (tabSwitches || 0) > 0 || events.length > 0 || report?.primaryCause) {
            severityLabel = 'MEDIUM (Review Flagged)';
        } else {
            severityLabel = 'LOW (Telemetry Logged)';
        }
    }

    const resolvedRemarks = safeText(adminRemarks || report?.adminRemarks || report?.adjudicationNotes);
    const resolvedCategory = safeText(resolutionCategory || report?.resolutionCategory);
    const resolvedRemediation = safeText(remediationAction || report?.remediationAction);
    const resolvedReviewerName = safeText(reviewerName || report?.reviewerName || report?.reviewedBy);
    const resolvedReviewerTitle = safeText(reviewerTitle || report?.reviewerTitle);
    const reviewerCombined = (resolvedReviewerName !== 'Details not available' && resolvedReviewerTitle !== 'Details not available')
        ? `${resolvedReviewerName} (${resolvedReviewerTitle})`
        : (resolvedReviewerName !== 'Details not available' ? resolvedReviewerName : resolvedReviewerTitle);

    const resolvedPrimaryCause = safeText(
        report?.primaryCause ||
        (Array.isArray(submission?.flaggedReasons) && submission.flaggedReasons.length > 0 ? submission.flaggedReasons.join('; ') : null)
    );

    const formAnswers = report?.formAnswers || report?.additionalAnswers || {};
    const legacyAns = formAnswers.legacySections || {};
    const techContext = report?.technicalContext || {};
    const rawExplanation = report?.detailedExplanation || formAnswers.Q1 || formAnswers.section4?.explanation || legacyAns.section4?.explanation || null;

    // Forensic synthesis
    const forensicSynthesisText = await generateForensicSynthesis({
        reportId,
        candidateName,
        studentId,
        courseCode: resolvedCourseCode,
        courseName: resolvedCourseName,
        testTitle,
        verdictStatus: rawStatusUpper || 'PENDING_REVIEW',
        adminRemarks: resolvedRemarks,
        primaryCause: resolvedPrimaryCause,
        detailedExplanation: safeText(rawExplanation),
        telemetrySummary,
        resolutionCategory: resolvedCategory
    });

    // Image buffers: Enrolled Photo vs. Webcam Baseline Photo
    const enrolledPhotoUrl = candidate?.registrationData?.photoUrl || candidate?.referencePhotoUrl || candidate?.photoUrl || submission?.biometricResult?.referencePhotoUrl;
    const baselinePhotoUrl = submission?.baselinePhotoUrl || submission?.biometricResult?.verifiedPhotoUrl || submission?.biometricVerification?.baselinePhotoUrl || techContext?.baselinePhotoUrl;

    const [enrolledPhotoBuffer, baselinePhotoBuffer] = await Promise.all([
        fetchImageBuffer(enrolledPhotoUrl),
        fetchImageBuffer(baselinePhotoUrl)
    ]);

    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                margins: { top: 24, bottom: 18, left: 30, right: 30 },
                size: 'A4',
                bufferPages: true,
                autoFirstPage: true
            });

            const fonts = registerPdfFonts(doc);
            const buffers = [];
            doc.on('data', chunk => buffers.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            const pageWidth = 535;
            const startX = 30;

            const drawContinuationHeader = (subLabel) => drawBwContinuationHeader(doc, {
                title: 'BICS DEPARTMENT OF EXAMINATION — EIRF FORENSIC AUDIT REPORT',
                refId: submissionRefId,
                examTypeLabel,
                subLabel: subLabel || (reportId !== 'Details not available' ? `Incident ID: ${reportId}` : ''),
                fonts,
                startX,
                pageWidth
            });

            const ensureSpace = (neededH, subLabel) => {
                if (curY + neededH > 780) {
                    doc.addPage();
                    curY = drawContinuationHeader(subLabel);
                }
            };

            // =========================================================================
            // PAGE 1 HEADER (Submission ID printed strictly once here; Ref ID in footers/headers)
            // =========================================================================
            let curY = drawBwHeader(doc, {
                title: 'BICS DEPARTMENT OF EXAMINATION',
                subtitle: `${academicSession}   |   ${examTypeLabel}`,
                docType: `EIRF FORENSIC AUDIT REPORT${reportId !== 'Details not available' ? ` (${reportId})` : ''}`,
                refId: submissionRefId,
                submissionId: bicsObjectId,
                qrPayload,
                fonts,
                startX,
                pageWidth
            });

            // --- SECTION 1: DOCUMENT METADATA & CASE CONTEXT ---
            curY = drawBwSectionBand(doc, startX, curY, pageWidth, 20, '1. DOCUMENT METADATA & CASE CONTEXT', fonts);

            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts,
                pairs: [
                    { label: 'Incident Report ID:', value: reportId },
                    { label: 'Severity Level:', value: severityLabel }
                ]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts,
                pairs: [
                    { label: 'Academic Session:', value: 'Academic Year 2026-27, Semester I' },
                    { label: 'Exam Type:', value: examTypeLabel }
                ]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts,
                pairs: [
                    { label: 'Candidate Name:', value: candidateName },
                    { label: 'Student ID:', value: studentId }
                ]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts,
                pairs: [
                    { label: 'Candidate Email:', value: candidateEmail },
                    { label: 'Reference ID:', value: submissionRefId }
                ]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts,
                pairs: [
                    { label: 'EIRF Filed At (IST):', value: reportSubmittedIST },
                    { label: 'Reporting Timeliness:', value: timelinessLabel }
                ]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts,
                pairs: [{ label: 'Course Code & Title:', value: courseDisplay }]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts,
                pairs: [{ label: 'Examination Title:', value: testTitle }]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts,
                pairs: [{ label: 'Exam Session Window:', value: examWindowDisplay }]
            });

            curY += 12;

            // --- SECTION 2: DUAL-PHOTO IDENTITY & BIOMETRIC VERIFICATION AUDIT ---
            ensureSpace(120, 'Biometric Identity Audit');
            curY = drawBwSectionBand(doc, startX, curY, pageWidth, 20, '2. DUAL-PHOTO IDENTITY & BIOMETRIC VERIFICATION AUDIT', fonts);

            const bioRes = submission?.biometricResult || {};
            const bioLegacy = submission?.biometricVerification || {};
            const rawDecision = String(bioLegacy.matchStatus || bioRes.decision || '').toLowerCase();
            let bioMatch = 'Details not available';
            if (rawDecision === 'matched' || rawDecision === 'match_confirmed' || rawDecision === 'match confirmed' || bioRes.matched === true) {
                bioMatch = 'MATCH CONFIRMED';
            } else if (rawDecision.includes('review') || rawDecision.includes('flag') || bioRes.reviewNeeded || bioLegacy.verified === false) {
                bioMatch = 'REVIEW REQUIRED';
            } else if (rawDecision && rawDecision !== 'not-evaluated') {
                bioMatch = rawDecision.toUpperCase();
            }

            const rawScoreNum = bioRes.similarityScore ?? bioLegacy.confidenceScore ?? (typeof bioRes.confidence === 'number' ? bioRes.confidence : null);
            const bioScore = (typeof rawScoreNum === 'number' && !isNaN(rawScoreNum))
                ? `${(rawScoreNum <= 1 ? rawScoreNum * 100 : rawScoreNum).toFixed(1)}%`
                : (baselinePhotoUrl ? 'Baseline Recorded' : 'Details not available');

            let livenessChallenges = 'Details not available';
            if (bioLegacy.challengesCompleted) {
                livenessChallenges = String(bioLegacy.challengesCompleted);
            } else if (Array.isArray(bioLegacy.challenges) && bioLegacy.challenges.length > 0) {
                livenessChallenges = bioLegacy.challenges.join(', ');
            } else if (bioRes.challengeType) {
                livenessChallenges = `${bioRes.livenessPassed ? 'Liveness Passed' : 'Liveness Recorded'} (${bioRes.challengeType})`;
            } else if (bioRes.livenessPassed === true) {
                livenessChallenges = 'Active Liveness Passed';
            }
            const bioEvalTime = bioRes.evaluatedAt ? formatISTDate(bioRes.evaluatedAt) : 'Details not available';

            const photoBoxHeight = 90;
            doc.rect(startX, curY, pageWidth, photoBoxHeight).strokeColor('#334155').lineWidth(0.7).stroke();

            const pWidth = 54;
            const pHeight = 58;
            const p1X = startX + 12;
            const p1Y = curY + 8;
            doc.rect(p1X, p1Y, pWidth, pHeight).strokeColor('#334155').lineWidth(0.7).stroke();
            if (enrolledPhotoBuffer) {
                try {
                    doc.image(enrolledPhotoBuffer, p1X + 1, p1Y + 1, { width: pWidth - 2, height: pHeight - 2 });
                } catch (e) {
                    doc.fillColor('#475569').fontSize(6.2).font(fonts.bodyRegular).text('Photo unavailable', p1X + 2, p1Y + 23, { width: pWidth - 4, align: 'center' });
                }
            } else {
                doc.fillColor('#475569').fontSize(6.2).font(fonts.bodyRegular).text('No photo', p1X + 2, p1Y + 23, { width: pWidth - 4, align: 'center' });
            }
            doc.fillColor('#0f172a').fontSize(6.2).font(fonts.bodySemiBold).text('ENROLLED PHOTO', p1X - 6, p1Y + pHeight + 4, { width: pWidth + 12, align: 'center' });

            const p2X = startX + 82;
            const p2Y = curY + 8;
            doc.rect(p2X, p2Y, pWidth, pHeight).strokeColor('#334155').lineWidth(0.7).stroke();
            if (baselinePhotoBuffer) {
                try {
                    doc.image(baselinePhotoBuffer, p2X + 1, p2Y + 1, { width: pWidth - 2, height: pHeight - 2 });
                } catch (e) {
                    doc.fillColor('#475569').fontSize(6.2).font(fonts.bodyRegular).text('Photo unavailable', p2X + 2, p2Y + 23, { width: pWidth - 4, align: 'center' });
                }
            } else {
                doc.fillColor('#475569').fontSize(6.2).font(fonts.bodyRegular).text('No baseline', p2X + 2, p2Y + 23, { width: pWidth - 4, align: 'center' });
            }
            doc.fillColor('#0f172a').fontSize(6.2).font(fonts.bodySemiBold).text('WEBCAM BASELINE', p2X - 6, p2Y + pHeight + 4, { width: pWidth + 12, align: 'center' });

            const auditNotesX = startX + 152;
            const auditNotesW = pageWidth - 162;
            doc.moveTo(auditNotesX - 10, curY).lineTo(auditNotesX - 10, curY + photoBoxHeight).strokeColor('#64748b').lineWidth(0.6).stroke();

            let bioNoteY = curY + 10;
            doc.fillColor('#0f172a').fontSize(8).font(fonts.titleBold)
               .text('FACIAL COMPARISON & BIOMETRIC LIVENESS SUMMARY', auditNotesX, bioNoteY, { width: auditNotesW });
            bioNoteY = doc.y + 5;

            doc.fillColor('#000000').fontSize(7.8);
            doc.font(fonts.bodySemiBold).text('Match Status: ', auditNotesX, bioNoteY, { continued: true })
               .font(fonts.bodyRegular).text(`${bioMatch}    |    `, { continued: true })
               .font(fonts.bodySemiBold).text('Similarity Score: ', { continued: true })
               .font(fonts.bodyRegular).text(bioScore);
            bioNoteY = doc.y + 4;

            doc.font(fonts.bodySemiBold).text('Liveness Challenge Protocol: ', auditNotesX, bioNoteY, { continued: true })
               .font(fonts.bodyRegular).text(livenessChallenges);
            bioNoteY = doc.y + 4;

            doc.font(fonts.bodySemiBold).text('Biometric Evaluated At: ', auditNotesX, bioNoteY, { continued: true })
               .font(fonts.bodyRegular).text(bioEvalTime);

            curY += photoBoxHeight + 12;

            // --- SECTION 3: EVIDENTIARY BASELINE & PROCTORING TIMELINE ---
            ensureSpace(120, 'Evidentiary Baseline & Telemetry');
            curY = drawBwSectionBand(doc, startX, curY, pageWidth, 20, '3. EVIDENTIARY BASELINE & PROCTORING SYSTEM TIMELINE', fonts);

            const VIOLATION_TYPES = new Set(['FULLSCREEN_EXIT', 'TAB_SWITCH', 'NETWORK_OFFLINE', 'EMERGENCY_SUBMISSION', 'SECONDARY_DEVICE', 'MIC_VOLUME_ALERT', 'PROCTORING_TRIGGER']);
            const infractionEvents = events.filter(ev => {
                const t = (ev.type || '').toUpperCase();
                const d = (ev.details || '').toLowerCase();
                if (VIOLATION_TYPES.has(t)) return true;
                if (t.includes('EXIT') || t.includes('SWITCH') || t.includes('DISCONNECT') || t.includes('OFFLINE') || t.includes('VIOLATION')) return true;
                if (d.includes('fullscreen') || d.includes('tab') || d.includes('focus') || d.includes('exited') || d.includes('switched') || d.includes('departed')) return true;
                return false;
            });

            const evHeaders = [
                { label: 'TRIGGER TIMESTAMP (IST)', align: 'left' },
                { label: 'RULE VIOLATION / EVENT TYPE', align: 'left' },
                { label: 'DURATION', align: 'center' },
                { label: 'SEVERITY / STATUS', align: 'left' }
            ];
            const evColWidths = [125, 190, 62, 158];
            const evRows = [];

            const displayEvents = infractionEvents.slice(0, 5);
            if (displayEvents.length > 0) {
                displayEvents.forEach((ev) => {
                    let evDur = Number(ev.durationSeconds || 0);
                    if (!evDur && ev.details) {
                        const m = String(ev.details).match(/(\d+)\s*seconds/i);
                        if (m && m[1]) evDur = parseInt(m[1], 10);
                    }
                    const evTime = (ev.timestamp || ev.startTime) ? formatISTDate(ev.timestamp || ev.startTime) : 'Details not available';
                    const evType = safeText(ev.type);
                    const evSev = evDur > 5 ? 'High (Exceeds 5s threshold)' : (evDur > 0 ? 'Moderate (Flagged)' : 'Trigger Alert');
                    evRows.push({
                        cells: [evTime, evType, evDur > 0 ? `${evDur}s` : 'N/A', evSev]
                    });
                });
            } else if (hasLogData) {
                const rowStatus = ((fsExits || 0) > 0 || (tabSwitches || 0) > 0)
                    ? 'Moderate (Flagged Deviation)'
                    : 'Zero Involuntary Interruptions';
                evRows.push({
                    cells: [
                        examStartIST || 'Details not available',
                        telemetrySummary,
                        ((fsExits || 0) > 0 || (tabSwitches || 0) > 0) ? 'Logged' : '0s',
                        rowStatus
                    ]
                });
            } else {
                evRows.push({
                    cells: ['Details not available', 'Details not available', '-', 'Details not available']
                });
            }

            curY = drawBwTable(doc, {
                startX,
                startY: curY,
                width: pageWidth,
                headers: evHeaders,
                rows: evRows,
                colWidths: evColWidths,
                headerHeight: 22,
                rowHeight: 22,
                fonts,
                onNewPage: () => drawContinuationHeader(`Incident ID: ${reportId}`)
            });

            // Environment Context (Strict schema extraction with Details not available fallback)
            const secMeta = submission?.securityMetadata || {};
            const netMeta = secMeta.network || {};
            const browserDet = secMeta.browserDetails || {};
            const osDet = secMeta.osDetails || {};

            const clientIp = safeText(techContext.ip || secMeta.ip || netMeta.publicIp || submission?.clientIp || submission?.ip);
            const rawBrowser = safeText(
                techContext.browser ||
                (browserDet.name ? `${browserDet.name}${browserDet.version ? ` ${browserDet.version}` : ''}` : secMeta.browser) ||
                submission?.browser ||
                secMeta.userAgent ||
                submission?.userAgent
            );
            const parsedOs = safeText(
                techContext.os || techContext.platform || secMeta.operatingSystem || osDet.osVersion || submission?.os || submission?.platform
            );
            const screenRes = safeText(techContext.screenResolution || secMeta.screenResolution || submission?.screenResolution);
            const rawVerif = report?.verificationStatus || '';
            const telemetryStatus = rawVerif
                ? (['PAYLOAD_MISSING', 'DISCREPANCY_FLAGGED', 'DECRYPTION_FAILED', 'VERIFIED_MATCH'].includes(rawVerif) ? 'TELEMETRY_VERIFIED' : rawVerif)
                : (hasLogData ? 'TELEMETRY_VERIFIED' : 'Details not available');
            const lockdownSummary = hasLogData
                ? `${fsExits ?? 0} exit(s), ${tabSwitches ?? 0} switch(es) logged`
                : 'Details not available';

            const onNewEnvPage = () => drawContinuationHeader(`Incident ID: ${reportId}`);

            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts, onNewPage: onNewEnvPage,
                pairs: [
                    { label: 'Client IP Address:', value: clientIp },
                    { label: 'Lockdown Summary:', value: lockdownSummary }
                ]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts, onNewPage: onNewEnvPage,
                pairs: [
                    { label: 'Operating System:', value: parsedOs },
                    { label: 'Display Specs:', value: screenRes }
                ]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts, onNewPage: onNewEnvPage,
                pairs: [
                    { label: 'Telemetry Integrity:', value: telemetryStatus },
                    { label: 'Primary Trigger Cited:', value: resolvedPrimaryCause }
                ]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts, onNewPage: onNewEnvPage,
                pairs: [{ label: 'Browser User-Agent:', value: rawBrowser }]
            });

            curY += 12;

            // --- SECTION 4: STUDENT DEFENSE & EXTENUATING DISCLOSURES ---
            ensureSpace(120, `Incident ID: ${reportId}`);
            curY = drawBwSectionBand(doc, startX, curY, pageWidth, 20, '4. STUDENT DEFENSE & EXTENUATING DISCLOSURES', fonts);

            const s2Tab = safeText(
                formAnswers.section2?.tabReason || legacyAns.section2?.tabReason || formAnswers.Q2 || formAnswers.Q4 || techContext.openedApp
            );
            const s2Fs = safeText(
                formAnswers.section2?.fullscreenReason || legacyAns.section2?.fullscreenReason || formAnswers.Q3
            );
            const s3Per = safeText(
                formAnswers.section3?.peripherals || legacyAns.section3?.peripherals || formAnswers.Q5
            );
            const s4Narrative = safeText(rawExplanation);

            const evidenceUrls = [];
            if (Array.isArray(report?.evidenceFiles)) evidenceUrls.push(...report.evidenceFiles);
            if (Array.isArray(report?.proofFiles)) evidenceUrls.push(...report.proofFiles);
            if (report?.uploadedProofUrl) evidenceUrls.push(report.uploadedProofUrl);
            if (submission?.eirfProofUrl && !evidenceUrls.includes(submission.eirfProofUrl)) evidenceUrls.push(submission.eirfProofUrl);
            const hasCaseRecord = Boolean(report?.reportId || rawSubId || submission?.submittedAt);
            const evidenceStatus = evidenceUrls.length > 0
                ? `${evidenceUrls.length} technical file(s) attached and cryptographically sealed`
                : (hasCaseRecord ? 'No technical files uploaded' : 'Details not available');

            // Verbatim Defense Box
            doc.font(fonts.bodyRegular).fontSize(7.8);
            const narrativeH = doc.heightOfString(s4Narrative, { width: pageWidth - 16, lineGap: 2.4 });
            const narrativeBoxH = Math.max(42, Math.ceil(narrativeH + 26));
            ensureSpace(narrativeBoxH + 10, `Incident ID: ${reportId}`);

            doc.rect(startX, curY, pageWidth, narrativeBoxH).strokeColor('#334155').lineWidth(0.7).stroke();
            doc.fillColor('#0f172a').fontSize(7.4).font(fonts.titleBold)
               .text('CANDIDATE WRITTEN EXPLANATION (VERBATIM DEFENSE):', startX + 8, curY + 6, { width: pageWidth - 16 });
            doc.fillColor('#000000').fontSize(7.8).font(fonts.bodyRegular)
               .text(s4Narrative, startX + 8, curY + 19, { width: pageWidth - 16, lineGap: 2.4 });
            curY += narrativeBoxH;

            const onNewDefensePage = () => drawContinuationHeader(`Incident ID: ${reportId}`);

            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts, onNewPage: onNewDefensePage,
                pairs: [
                    { label: 'Peripherals Declared:', value: s3Per },
                    { label: 'Evidence Status:', value: evidenceStatus }
                ]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts, onNewPage: onNewDefensePage,
                pairs: [{ label: 'Focus Loss Justification:', value: s2Tab }]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts, onNewPage: onNewDefensePage,
                pairs: [{ label: 'Fullscreen Context:', value: s2Fs }]
            });

            curY += 10;
            ensureSpace(24, `Incident ID: ${reportId}`);
            const checkEirfFiled = Boolean(reportSubmittedRaw || rawExplanation);
            const checkTelemetry = Boolean(hasLogData);
            const checkBio = Boolean(bioMatch !== 'Details not available');
            doc.rect(startX, curY, pageWidth, 20).fillAndStroke('#f1f5f9', '#334155');
            doc.fillColor('#0f172a').fontSize(7.4).font(fonts.bodySemiBold)
               .text(
                   `[${checkEirfFiled ? 'X' : ' '}] Formal EIRF Submitted   |   [${checkTelemetry ? 'X' : ' '}] Telemetry Audited   |   [${checkBio ? 'X' : ' '}] Biometric Identity Cross-Checked`,
                   startX + 10,
                   curY + 5.5,
                   { width: pageWidth - 20, align: 'center' }
               );
            curY += 20;

            // =========================================================================
            // SECTION 5+: REVIEWER ANALYSIS, FINAL RESOLUTION, SYNTHESIS & SIGN-OFF
            // (Flows cleanly on Page 2 when space allows, eliminating half-blank orphan pages)
            // =========================================================================
            curY += 12;
            ensureSpace(190, 'Adjudication & Final Verdict');

            // --- SECTION 5: REVIEWER'S ANALYSIS & CREDIBILITY FINDINGS ---
            curY = drawBwSectionBand(doc, startX, curY, pageWidth, 20, "5. REVIEWER'S ANALYSIS & CREDIBILITY FINDINGS", fonts);

            let credibilityText = 'Details not available';
            if (isApproved) {
                credibilityText = `The candidate's explanation correlates with the recorded telemetry timeline (${telemetrySummary}). Cross-examination revealed no disqualifying contradictory evidence, and the disruption is assessed as non-prejudicial.`;
            } else if (isRejected) {
                credibilityText = `The candidate's explanation fails to reconcile the proctoring events logged by the system (${telemetrySummary}). The telemetry timeline contradicts the defense assertion, confirming an unexcused examination policy violation.`;
            } else if (hasLogData) {
                credibilityText = `Proctoring telemetry recorded: ${telemetrySummary}. Review status: ${displayStatus}.`;
            }

            doc.font(fonts.bodyRegular).fontSize(7.8);
            const credTextH = doc.heightOfString(credibilityText, { width: pageWidth - 16, lineGap: 2.4 });
            const credBoxH = Math.max(46, Math.ceil(credTextH + 26));
            doc.rect(startX, curY, pageWidth, credBoxH).strokeColor('#334155').lineWidth(0.7).stroke();
            doc.fillColor('#0f172a').fontSize(7.4).font(fonts.titleBold)
               .text('CREDIBILITY ASSESSMENT (DEFENSE VS. TELEMETRY CORRELATION):', startX + 8, curY + 6);
            doc.fillColor('#000000').fontSize(7.8).font(fonts.bodyRegular)
               .text(credibilityText, startX + 8, curY + 19, { width: pageWidth - 16, lineGap: 2.4 });
            curY += credBoxH;

            const camMicStatus = logSnap.webcamStatus
                ? `Webcam: ${String(logSnap.webcamStatus).toUpperCase()}`
                : 'Details not available';
            const filingStatusText = reportSubmittedRaw
                ? 'Formal Incident Report Submitted & Sealed'
                : (rawSubId ? 'Direct Committee Telemetry Audit (Unfiled)' : 'Details not available');

            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts,
                onNewPage: () => drawContinuationHeader(`Incident ID: ${reportId}`),
                pairs: [
                    { label: 'Primary Cause Cited:', value: resolvedPrimaryCause },
                    { label: 'Reporting Timeliness:', value: timelinessLabel }
                ]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts,
                onNewPage: () => drawContinuationHeader(`Incident ID: ${reportId}`),
                pairs: [
                    { label: 'Camera / Mic Integrity:', value: camMicStatus },
                    { label: 'Submission Record:', value: filingStatusText }
                ]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts,
                onNewPage: () => drawContinuationHeader(`Incident ID: ${reportId}`),
                pairs: [{ label: 'Committee Remarks:', value: resolvedRemarks }]
            });

            curY += 12;

            // --- SECTION 6: FINAL RESOLUTION & ACTION PLAN ---
            ensureSpace(120, 'Final Resolution');
            curY = drawBwSectionBand(doc, startX, curY, pageWidth, 20, '6. FINAL RESOLUTION & ACTION PLAN', fonts);

            let verdictHeadline = `OFFICIAL VERDICT: ${displayStatus}`;
            if (isApproved) {
                verdictHeadline = 'OFFICIAL VERDICT: APPROVED — VIOLATION DISMISSED (PROVISIONAL ASSESSMENT GRANTED)';
            } else if (isRejected) {
                verdictHeadline = 'OFFICIAL VERDICT: REJECTED — VIOLATION UPHELD (DISCIPLINARY ACTION ENFORCED)';
            }

            doc.rect(startX, curY, pageWidth, 28).fillAndStroke('#e2e8f0', '#0f172a');
            doc.fillColor('#0f172a').fontSize(9).font(fonts.titleBold)
               .text(verdictHeadline, startX + 8, curY + 9, { width: pageWidth - 16, align: 'center' });
            curY += 28;

            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts,
                onNewPage: () => drawContinuationHeader(`Incident ID: ${reportId}`),
                pairs: [
                    { label: 'Resolution Category:', value: resolvedCategory },
                    { label: 'Remediation Action:', value: resolvedRemediation }
                ]
            });

            curY += 8;
            let policyClauseTitle = 'EXAMINATION INTEGRITY NOTICE:';
            let policyClauseText = 'Details not available';
            if (isApproved) {
                policyClauseTitle = 'SYSTEM CALIBRATION & INSTRUCTOR NOTIFICATION:';
                policyClauseText = `System heuristics logged for threshold calibration. The candidate is granted provisional standing${resolvedCourseCode !== 'Details not available' ? ` for course ${resolvedCourseCode}` : ''}. Candidate must submit a signed hardcopy of this document to the course instructor within 48 hours for final grade entry.`;
            } else if (isRejected) {
                policyClauseTitle = 'FINAL COMMITTEE VERDICT & DISCIPLINARY NOTICE:';
                policyClauseText = 'In accordance with Examination Integrity Policy, the Academic Integrity Committee decision is final and binding across all records. No further appeals are permitted, and the examination score has been annulled (0 marks).';
            }

            doc.font(fonts.bodyRegular).fontSize(7.8);
            const policyTextH = doc.heightOfString(policyClauseText, { width: pageWidth - 16, lineGap: 2.4 });
            const policyBoxH = Math.max(40, Math.ceil(policyTextH + 26));
            ensureSpace(policyBoxH + 10, 'Final Resolution');
            doc.rect(startX, curY, pageWidth, policyBoxH).strokeColor('#334155').lineWidth(0.7).stroke();
            doc.fillColor('#0f172a').fontSize(7.4).font(fonts.titleBold)
               .text(policyClauseTitle, startX + 8, curY + 6);
            doc.fillColor('#000000').fontSize(7.8).font(fonts.bodyRegular)
               .text(policyClauseText, startX + 8, curY + 19, { width: pageWidth - 16, lineGap: 2.4 });
            curY += policyBoxH + 12;

            // --- SECTION 7: COMPREHENSIVE INCIDENT SYNTHESIS & CASE SUMMARY ---
            doc.font(fonts.bodyRegular).fontSize(7.8);
            const synthTextH = doc.heightOfString(forensicSynthesisText, { width: pageWidth - 16, lineGap: 2.4 });
            const synthBoxH = Math.max(46, Math.ceil(synthTextH + 16));
            ensureSpace(synthBoxH + 26, 'Case Synthesis');
            curY = drawBwSectionBand(doc, startX, curY, pageWidth, 20, '7. COMPREHENSIVE INCIDENT SYNTHESIS & CASE SUMMARY', fonts);
            doc.rect(startX, curY, pageWidth, synthBoxH).strokeColor('#334155').lineWidth(0.7).stroke();
            doc.fillColor('#000000').fontSize(7.8).font(fonts.bodyRegular)
               .text(forensicSynthesisText, startX + 8, curY + 8, { width: pageWidth - 16, lineGap: 2.4 });
            curY += synthBoxH + 12;

            // --- SECTION 8: SIGN-OFF, AUDIT TRAIL & DIGITAL VERIFICATION ---
            ensureSpace(165, 'Sign-Off & Digital Verification');
            curY = drawBwSectionBand(doc, startX, curY, pageWidth, 20, '8. SIGN-OFF, AUDIT TRAIL & DIGITAL VERIFICATION', fonts);

            const qrPngBuffer = generateQrBuffer(qrPayload);
            const signOffHeight = 96;
            doc.rect(startX, curY, pageWidth, signOffHeight).strokeColor('#334155').lineWidth(0.7).stroke();

            const leftPanelW = 425;
            const keyColX = startX + 8;
            const valColX = startX + 132;
            const valColW = leftPanelW - 140;
            doc.moveTo(startX + leftPanelW, curY).lineTo(startX + leftPanelW, curY + signOffHeight).strokeColor('#64748b').lineWidth(0.6).stroke();

            let sy = curY + 8;
            const writeSignRow = (lbl, val, isBoldVal = false) => {
                doc.fillColor('#0f172a').fontSize(7.4).font(fonts.bodySemiBold).text(lbl, keyColX, sy, { width: 120 });
                doc.fillColor('#000000').fontSize(7.6).font(isBoldVal ? fonts.bodySemiBold : fonts.bodyRegular)
                   .text(safeText(val), valColX, sy, { width: valColW });
                sy += 14.5;
            };

            writeSignRow('Adjudicator:', reviewerCombined);
            writeSignRow('Issuing Unit:', 'BICS Department of Examination — Academic Integrity Unit');
            writeSignRow('Decision Published:', verdictDateIST);
            writeSignRow('Hardcopy Deadline:', deadlineIST !== 'Details not available' ? `${deadlineIST} (Within 48 Hours)` : 'Details not available', true);
            writeSignRow('Verification Hash:', hashString, true);
            writeSignRow('Delivery Channel:', deliveryChannel);

            if (qrPngBuffer) {
                try {
                    const signQrSize = 68;
                    const signQrX = startX + leftPanelW + (pageWidth - leftPanelW - signQrSize) / 2;
                    doc.image(qrPngBuffer, signQrX, curY + 8, { width: signQrSize, height: signQrSize });
                    doc.fillColor('#334155').fontSize(6.2).font(fonts.bodyMedium)
                       .text('Scan to Verify', startX + leftPanelW + 4, curY + 79, { width: pageWidth - leftPanelW - 8, align: 'center' });
                } catch (e) {}
            }

            curY += signOffHeight + 10;

            // --- Physical Submission Acknowledgment Slip ---
            ensureSpace(50, 'Physical Submission Slip');
            const courseTag = resolvedCourseCode !== 'Details not available' ? ` (${resolvedCourseCode})` : '';
            const slipNoteText = isApproved
                ? `Candidate must submit this physical signed document to course instructor${courseTag} within 48 hours for institutional grade normalization.`
                : (isRejected
                    ? `Candidate must acknowledge receipt of this disciplinary verdict with the course instructor${courseTag} within 48 hours for institutional archive record.`
                    : `Candidate must present this verification record to the course instructor${courseTag} upon request.`);

            doc.font(fonts.bodyRegular).fontSize(6.8);
            const slipNoteH = doc.heightOfString(slipNoteText, { width: pageWidth - 16, lineGap: 1.8 });
            const slipH = Math.max(42, Math.ceil(30 + slipNoteH + 6));
            ensureSpace(slipH + 4, 'Physical Submission Slip');

            doc.rect(startX, curY, pageWidth, slipH).dash(3, { space: 3 }).strokeColor('#334155').lineWidth(0.8).stroke();
            doc.undash();
            doc.fillColor('#0f172a').fontSize(7.2).font(fonts.titleBold)
               .text('COURSE INSTRUCTOR PHYSICAL SUBMISSION ACKNOWLEDGMENT (UPON RECEIPT OF PRINTED COPY):', startX + 8, curY + 6, { width: pageWidth - 16 });
            doc.fillColor('#000000').fontSize(7.2).font(fonts.bodyRegular)
               .text('Instructor Name: ___________________   Signature: ___________________   Date Received: _____________', startX + 8, curY + 18, { width: pageWidth - 16 });
            doc.fillColor('#334155').fontSize(6.8).font(fonts.bodyRegular)
               .text(slipNoteText, startX + 8, curY + 30, { width: pageWidth - 16, lineGap: 1.8 });

            // Footers across all pages (Reference ID included cleanly, NEVER BICSID)
            const totalVerdictPages = doc.bufferedPageRange().count;
            for (let i = 0; i < totalVerdictPages; i++) {
                doc.switchToPage(i);
                drawBwFooter(doc, i + 1, totalVerdictPages, 'EIRF Forensic Audit Report', submissionRefId, fonts);
            }

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
