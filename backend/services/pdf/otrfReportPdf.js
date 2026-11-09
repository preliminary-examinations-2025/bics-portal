const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
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
const { isCloudinaryConfigured, uploadToCloudinary } = require('../../config/cloudinary');

/**
 * Resolves deterministic OTRF filename, Cloudinary/local paths, and Verification URL.
 */
function resolveOtrfArtifactMeta(submission = {}, options = {}) {
    const rawSubId = submission?._id || submission?.id;
    const bicsObjectId = rawSubId ? toBicsId(rawSubId) : null;
    const rawRef = submission?.submissionRefId ? String(submission.submissionRefId).trim() : '';
    const fileToken = (rawRef || bicsObjectId || 'record').replace(/[^a-zA-Z0-9_-]/g, '') || 'record';
    const fileName = `otrf_${fileToken}.pdf`;
    const cloudinaryRelativePath = `/media/otrf/${fileName}`;
    const localRelativePath = `/public/otrf/${fileName}`;
    const localFilePath = path.join(__dirname, '..', '..', 'public', 'otrf', fileName);

    const hasCloudinary = isCloudinaryConfigured();
    const isProd = process.env.NODE_ENV === 'production' || !!process.env.RENDER || !!process.env.VERCEL;
    const portalBaseUrl = (
        options.portalBaseUrl ||
        process.env.PORTAL_URL ||
        process.env.FRONTEND_URL ||
        process.env.DASHBOARD_URL ||
        'https://bicsportal.netlify.app'
    ).replace(/\/+$/, '');
    const serverBaseUrl = (
        options.serverBaseUrl ||
        process.env.API_PUBLIC_URL ||
        process.env.BACKEND_URL ||
        (isProd ? 'https://bics-portal.onrender.com' : `http://localhost:${process.env.PORT || 5000}`)
    ).replace(/\/+$/, '');

    let storedUrl = hasCloudinary ? cloudinaryRelativePath : localRelativePath;
    let verificationUrl = options.verificationUrl
        ? String(options.verificationUrl).trim()
        : (hasCloudinary ? `${portalBaseUrl}${cloudinaryRelativePath}` : `${serverBaseUrl}${localRelativePath}`);

    if (!options.verificationUrl && !hasCloudinary && submission?.otrfPdfUrl) {
        const existingUrl = String(submission.otrfPdfUrl).trim();
        if (/^https?:\/\//i.test(existingUrl)) {
            verificationUrl = existingUrl;
        } else if (existingUrl.startsWith('/media/')) {
            verificationUrl = `${portalBaseUrl}${existingUrl}`;
        } else if (existingUrl.startsWith('/public/')) {
            verificationUrl = `${serverBaseUrl}${existingUrl}`;
        }
    }

    return {
        fileToken,
        fileName,
        cloudinaryRelativePath,
        localRelativePath,
        localFilePath,
        storedUrl,
        verificationUrl,
        hasCloudinary
    };
}

/**
 * Persists a generated OTRF PDF buffer to Cloudinary (/media/otrf/otrf_<refid>.pdf)
 * or falls back to local server storage (/public/otrf/otrf_<refid>.pdf) in testing.
 */
async function persistOtrfPdfArtifact({ submission = {}, pdfBuffer, options = {} }) {
    const meta = resolveOtrfArtifactMeta(submission, options);
    if (!Buffer.isBuffer(pdfBuffer)) {
        return { url: '', storage: 'none', ...meta };
    }

    if (meta.hasCloudinary) {
        try {
            const uploadedUrl = await uploadToCloudinary(pdfBuffer, 'BICS_2026/otrf', 'raw', meta.fileName);
            const normalizedUrl = uploadedUrl || meta.cloudinaryRelativePath;
            return {
                ...meta,
                url: normalizedUrl,
                storage: 'cloudinary'
            };
        } catch (err) {
            console.error(`[OTRF_STORAGE] Cloudinary upload failed for ${meta.fileName}:`, err.message);
            const isProd = process.env.NODE_ENV === 'production' || !!process.env.RENDER || !!process.env.VERCEL;
            if (isProd) {
                return { ...meta, url: '', storage: 'error', error: err.message };
            }
        }
    }

    try {
        fs.mkdirSync(path.dirname(meta.localFilePath), { recursive: true });
        fs.writeFileSync(meta.localFilePath, pdfBuffer);
        return {
            ...meta,
            url: meta.localRelativePath,
            storage: 'local'
        };
    } catch (fsErr) {
        console.error(`[OTRF_STORAGE] Local fallback write failed for ${meta.fileName}:`, fsErr.message);
        return { ...meta, url: '', storage: 'error', error: fsErr.message };
    }
}

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
 * Typography: Plus Jakarta Sans (Titles & Headers) + Inter (Body, Keys, Values)
 * Layout: Page 1 (Summary & Telemetry), Page 2+ (Questions Only), Next Page (Proctoring Lifecycle + Violations), Final Page (Objections, EIRF & Verification)
 */
async function generateOtrfReportPdfBuffer({
    submission = {},
    test = {},
    candidate = {},
    eirfReport = null,
    systemConfig = null,
    examType = null,
    verificationClosureDate = null,
    portalBaseUrl = null,
    serverBaseUrl = null,
    verificationUrl = null
}) {
    const rawSubId = submission?._id || submission?.id;
    const bicsObjectId = rawSubId ? toBicsId(rawSubId) : 'Details not available';
    const submissionRefId = safeText(submission?.submissionRefId);
    const studentId = safeText(candidate?.studentId || submission?.studentId);
    const candidateName = safeText(candidate?.name || submission?.candidateName);
    const collegeEmail = safeText(candidate?.registrationData?.collegeEmail || candidate?.email);
    const personalEmail = safeText(candidate?.registrationData?.personalEmail || candidate?.personalEmail || submission?.candidateEmail);
    const permanentAddress = safeText(candidate?.registrationData?.permanentAddress || candidate?.permanentAddress);

    const regCourses = Array.isArray(candidate?.registeredCourses) && candidate.registeredCourses.length > 0
        ? candidate.registeredCourses.join(', ')
        : null;
    const programStr = safeText(candidate?.program || candidate?.registrationData?.program || regCourses);

    const testTitle = safeText(test?.title || submission?.testTitle);
    const courseCodeRaw = test?.courseCode || test?.code || submission?.courseCode || eirfReport?.courseCode || '';
    const courseNameRaw = test?.courseName || test?.course || test?.subject || submission?.course || eirfReport?.courseName || '';
    const courseDisplay = (courseCodeRaw && courseNameRaw)
        ? `${String(courseCodeRaw).trim()} - ${String(courseNameRaw).trim()}`
        : safeText(courseCodeRaw || courseNameRaw);

    const resolvedExamType = examType || systemConfig?.examType || test?.examType || submission?.examType;
    const examTypeLabel = resolveExamTypeLabel(resolvedExamType);
    const academicSession = 'Academic Year 2026-27 • Semester I';

    // Match delivery mode dynamically from test config or admin timetable slot if available
    const matchedTimetableSlot = Array.isArray(systemConfig?.timetable)
        ? systemConfig.timetable.find(slot =>
            (courseCodeRaw && String(slot?.code || '').trim().toLowerCase() === String(courseCodeRaw).trim().toLowerCase()) ||
            (courseNameRaw && String(slot?.course || '').trim().toLowerCase() === String(courseNameRaw).trim().toLowerCase())
        )
        : null;
    const deliveryMode = safeText(test?.deliveryMode || test?.mode || matchedTimetableSlot?.mode);

    const closureDate = verificationClosureDate || submission?.verificationClosedAt || test?.verificationClosedAt || submission?.submittedAt || null;
    const closureDateIST = closureDate ? formatISTDate(closureDate) : 'Details not available';

    // Technical telemetry strictly from live schema objects (fallback -> Details not available)
    const secMeta = submission?.securityMetadata || {};
    const techCtx = eirfReport?.technicalContext || {};
    const netMeta = secMeta.network || {};
    const browserDet = secMeta.browserDetails || {};
    const osDet = secMeta.osDetails || {};

    const clientIp = safeText(secMeta.ip || netMeta.publicIp || submission?.clientIp || submission?.ip || techCtx.ip);

    const ispName = netMeta.isp || netMeta.organization || submission?.networkInfo || submission?.isp || techCtx.networkType || '';
    const vpnFlag = netMeta.isProxyOrVpn ? ' (Proxy/VPN Flagged)' : (netMeta.isDatacenterHosting ? ' (Datacenter IP)' : '');
    const networkInfo = ispName
        ? `${ispName}${vpnFlag}`
        : (submission?.connectionType ? `${submission.connectionType}` : 'Details not available');

    const geoCity = netMeta.city && netMeta.city !== 'Unknown' ? netMeta.city : '';
    const geoRegion = netMeta.region && netMeta.region !== 'Unknown' ? netMeta.region : '';
    const geoCountry = netMeta.country && netMeta.country !== 'Unknown' ? netMeta.country : '';
    const geoParts = [geoCity, geoRegion, geoCountry].filter(Boolean);
    const locationStr = geoParts.length > 0
        ? geoParts.join(', ')
        : (submission?.location && typeof submission.location === 'object'
            ? safeText([submission.location.city, submission.location.region, submission.location.country].filter(Boolean).join(', '))
            : safeText(submission?.location));

    const connTzOrQuality = netMeta.timezone
        ? `${netMeta.timezone}${netMeta.isProxyOrVpn ? ' (VPN/Proxy)' : ' (Direct)'}`
        : safeText(submission?.connectionQuality);

    const rawBrowserName = browserDet.name
        ? `${browserDet.name}${browserDet.version ? ` ${browserDet.version}` : ''}`
        : (secMeta.browser || submission?.browser || techCtx.browser || secMeta.userAgent || submission?.userAgent || '');
    const browserStr = safeText(rawBrowserName);

    const rawOsName = secMeta.operatingSystem || osDet.osVersion || submission?.os || techCtx.os || submission?.platform || techCtx.platform || '';
    const vmWarn = osDet.isVirtualMachineDetected ? ` (VM Flag: ${osDet.vmIndicator || 'Detected'})` : '';
    const osStr = rawOsName ? `${rawOsName}${vmWarn}` : 'Details not available';

    const rawRes = secMeta.screenResolution || submission?.screenResolution || techCtx.screenResolution || (submission?.screenWidth ? `${submission.screenWidth}x${submission.screenHeight}` : '');
    const extDisplayTag = typeof secMeta.isExtendedDisplay === 'boolean'
        ? (secMeta.isExtendedDisplay ? ' | Extended/Multi-Display Flagged' : ' | Single Display Verified')
        : '';
    const screenRes = rawRes ? `${rawRes}${extDisplayTag}` : (extDisplayTag ? extDisplayTag.replace(/^ \| /, '') : 'Details not available');

    const rawCores = secMeta.hardwareConcurrency || submission?.hardwareConcurrency || techCtx.hardwareConcurrency;
    const rawMem = secMeta.deviceMemoryGB && secMeta.deviceMemoryGB !== 'N/A' ? `, ${secMeta.deviceMemoryGB} GB RAM` : '';
    const hardwareStr = (rawCores && rawCores !== 'N/A')
        ? `${rawCores} Logical Cores${rawMem}`
        : 'Details not available';

    const startRaw = submission?.startedAt || submission?.createdAt;
    const endRaw = submission?.submittedAt || submission?.updatedAt;
    const examStartIST = startRaw ? formatISTDate(startRaw) : null;
    const examEndIST = endRaw ? formatISTDate(endRaw) : null;
    const examWindowDisplay = (examStartIST && examEndIST)
        ? `${examStartIST}  —  ${examEndIST}`
        : (examStartIST || examEndIST || 'Details not available');

    const allocatedMins = test?.duration ?? test?.durationMinutes ?? submission?.durationMinutes ?? null;
    const startTimeMs = submission?.startedAt ? new Date(submission.startedAt).getTime() : NaN;
    const endTimeMs = submission?.submittedAt ? new Date(submission.submittedAt).getTime() : NaN;
    const loggedMinsStr = (Number.isFinite(startTimeMs) && Number.isFinite(endTimeMs) && endTimeMs >= startTimeMs)
        ? `${Math.max(1, Math.round((endTimeMs - startTimeMs) / 60000))} Min(s)`
        : (submission?.durationMinutes ? `${submission.durationMinutes} Min(s)` : null);

    let durationDisplay = 'Details not available';
    if (allocatedMins !== null && allocatedMins !== undefined && loggedMinsStr) {
        durationDisplay = `${allocatedMins} Minutes (Logged: ${loggedMinsStr})`;
    } else if (allocatedMins !== null && allocatedMins !== undefined) {
        durationDisplay = `${allocatedMins} Minutes`;
    } else if (loggedMinsStr) {
        durationDisplay = `Logged: ${loggedMinsStr}`;
    }

    // Questions, Answers, Objections & Annulment State
    const rawAnswers = Array.isArray(submission?.answers) ? submission.answers : [];
    const rawQuestions = Array.isArray(test?.questions) ? test.questions : (Array.isArray(submission?.questions) ? submission.questions : []);
    const objectionsList = Array.isArray(submission?.objections) ? submission.objections : [];

    const normalizedEirfStatus = String(eirfReport?.status || submission?.eirfStatus || '').toLowerCase();
    const isAnnulled = submission?.verificationStatus === 'annulled' || normalizedEirfStatus === 'rejected';

    const formatQuestionTypeLabel = (item, ans) => {
        const rawT = String(item?.type || item?.questionType || ans?.type || '').trim().toLowerCase();
        if (!rawT) return 'Details not available';
        if (rawT === 'scc') return 'SCC (MCQ)';
        if (rawT === 'mcc' || (rawT === 'mcq' && item?.isMultiChoice)) return 'MCC (MULTI)';
        if (rawT === 'mcq') return 'MCQ';
        if (rawT === 'coding') return 'CODING';
        if (rawT === 'web') return 'WEB';
        return rawT.toUpperCase();
    };

    let totalMaxMarks = 0;
    let totalBeforeMarks = 0;
    let totalAfterMarks = 0;
    let objSecTotal = 0;
    let codingSecTotal = 0;
    let webSecTotal = 0;

    const questionRows = [];
    const questionsToIterate = rawQuestions.length > 0 ? rawQuestions : rawAnswers;

    if (questionsToIterate.length > 0) {
        questionsToIterate.forEach((qItem, idx) => {
            const qNum = `Q. ${idx + 1}`;
            const qIdCandidates = [qItem?.id, qItem?._id, qItem?.questionId]
                .filter(v => v !== undefined && v !== null && String(v).trim() !== '')
                .map(v => String(v));

            const ans = rawQuestions.length > 0
                ? (qIdCandidates.length > 0
                    ? rawAnswers.find(a => a && a.questionId !== undefined && a.questionId !== null && qIdCandidates.includes(String(a.questionId)))
                    : rawAnswers[idx]) || (!rawAnswers[idx]?.questionId ? rawAnswers[idx] : null)
                : qItem;

            const matchedObj = objectionsList.find(o =>
                (qIdCandidates.length > 0 && o.questionId && qIdCandidates.includes(String(o.questionId))) ||
                (o.questionIndex !== undefined && o.questionIndex !== null && Number(o.questionIndex) === idx)
            );

            const qType = formatQuestionTypeLabel(qItem, ans);
            const qTitle = safeText(
                rawQuestions.length > 0
                    ? (qItem?.title || qItem?.questionText || qItem?.description || qItem?.text || ans?.questionTitle)
                    : (qItem?.questionTitle || qItem?.title)
            );

            const maxMarks = Number(qItem?.points ?? qItem?.maxMarks ?? qItem?.marks ?? ans?.maxPoints ?? 0);
            totalMaxMarks += maxMarks;

            const hasObjection = Boolean(ans?.isObjected || matchedObj);

            const marksBefore = (matchedObj && matchedObj.marksBefore !== null && matchedObj.marksBefore !== undefined)
                ? Number(matchedObj.marksBefore)
                : (ans && ans.initialScore !== null && ans.initialScore !== undefined
                    ? Number(ans.initialScore)
                    : (ans && ans.score !== undefined && ans.score !== null ? Number(ans.score) : 0));

            let marksAfter;
            if (isAnnulled) {
                marksAfter = 0;
            } else if (matchedObj && ['resolved', 'resolved_accepted'].includes(String(matchedObj.status || '').toLowerCase()) && (matchedObj.marksAfter !== null && matchedObj.marksAfter !== undefined)) {
                marksAfter = Number(matchedObj.marksAfter);
            } else if (matchedObj && ['resolved', 'resolved_accepted'].includes(String(matchedObj.status || '').toLowerCase()) && (matchedObj.resolvedMarks !== null && matchedObj.resolvedMarks !== undefined)) {
                marksAfter = Number(matchedObj.resolvedMarks);
            } else if (ans?.isObjectionResolved && ans?.scoreAfterObjection !== null && ans?.scoreAfterObjection !== undefined) {
                marksAfter = Number(ans.scoreAfterObjection);
            } else if (ans && ans.score !== undefined && ans.score !== null) {
                marksAfter = Number(ans.score);
            } else {
                marksAfter = marksBefore;
            }

            totalBeforeMarks += marksBefore;
            totalAfterMarks += marksAfter;

            const rawTypeLower = String(qItem?.type || ans?.type || '').toLowerCase();
            if (rawTypeLower === 'coding') codingSecTotal += marksAfter;
            else if (rawTypeLower === 'web') webSecTotal += marksAfter;
            else objSecTotal += marksAfter;

            questionRows.push({
                cells: [
                    qNum,
                    qType,
                    String(qTitle),
                    `${maxMarks.toFixed(1)}`,
                    `${marksBefore.toFixed(1)}`,
                    hasObjection ? 'YES' : 'NO',
                    `${marksAfter.toFixed(1)}`
                ],
                bold: false
            });
        });
    } else {
        questionRows.push({
            cells: ['-', 'Details not available', 'No question records found for this submission', '0.0', '0.0', 'NO', '0.0'],
            bold: false
        });
    }

    const configuredTestMarks = Number(test?.marks ?? test?.totalMarks ?? submission?.evaluation?.maxScore ?? 0);
    if (totalMaxMarks === 0 && configuredTestMarks > 0) {
        totalMaxMarks = configuredTestMarks;
    }
    if (questionsToIterate.length === 0 && !isAnnulled) {
        totalAfterMarks = Number(submission?.score ?? submission?.totalScore ?? 0);
        totalBeforeMarks = totalAfterMarks;
    } else if (configuredTestMarks > 0 && totalAfterMarks > configuredTestMarks) {
        totalAfterMarks = configuredTestMarks;
    }
    if (isAnnulled) {
        totalAfterMarks = 0;
        objSecTotal = 0;
        codingSecTotal = 0;
        webSecTotal = 0;
    }

    const percentage = totalMaxMarks > 0 ? ((totalAfterMarks / totalMaxMarks) * 100).toFixed(1) : '0.0';

    questionRows.push({
        cells: [
            'TOTAL',
            'ALL',
            isAnnulled ? 'Aggregate Score Matrix (Annulled)' : 'Aggregate Score Matrix',
            `${totalMaxMarks.toFixed(1)}`,
            `${totalBeforeMarks.toFixed(1)}`,
            objectionsList.length > 0 ? `${objectionsList.length} Raised` : '0',
            `${totalAfterMarks.toFixed(1)}`
        ],
        isHighlight: true,
        bold: true
    });

    const otrfHash = generateOtrfVerificationHash(submissionRefId, bicsObjectId, studentId, totalAfterMarks, totalMaxMarks);
    const artifactMeta = resolveOtrfArtifactMeta(submission, { portalBaseUrl, serverBaseUrl, verificationUrl });
    const resolvedVerificationUrl = artifactMeta.verificationUrl;
    const qrPayload = resolvedVerificationUrl;

    const enrolledPhotoUrl = candidate?.registrationData?.photoUrl || candidate?.referencePhotoUrl || candidate?.photoUrl || submission?.biometricResult?.referencePhotoUrl || submission?.photoUrl;
    const baselinePhotoUrl = submission?.baselinePhotoUrl || submission?.biometricResult?.verifiedPhotoUrl || submission?.biometricVerification?.baselinePhotoUrl || techCtx?.baselinePhotoUrl;

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
                title: 'BICS DEPARTMENT OF EXAMINATION — ONLINE TEST REPORT FORM (OTRF)',
                refId: submissionRefId,
                examTypeLabel,
                subLabel,
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
                docType: 'ONLINE TEST REPORT FORM (OTRF)',
                refId: submissionRefId,
                submissionId: bicsObjectId,
                qrPayload,
                fonts,
                startX,
                pageWidth
            });

            // --- SECTION 1: EXAMINATION & ASSESSMENT PARTICULARS ---
            curY = drawBwSectionBand(doc, startX, curY, pageWidth, 20, '1. EXAMINATION & ASSESSMENT PARTICULARS', fonts);

            const totalAllocatedCount = rawQuestions.length > 0 ? rawQuestions.length : rawAnswers.length;
            let verificationBadge = 'Details not available';
            if (isAnnulled) {
                verificationBadge = 'VERIFICATION CLOSED / ANNULLED (ZERO MARKS)';
            } else if (test?.verificationStatus === 'released') {
                verificationBadge = 'VERIFICATION OPEN / PROVISIONAL';
            } else if (test?.verificationStatus === 'closed' || submission?.submittedAt) {
                verificationBadge = 'VERIFICATION CLOSED / RESULTS FINALIZED';
            } else if (test?.verificationStatus) {
                verificationBadge = String(test.verificationStatus).toUpperCase();
            }

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
                    { label: 'Allocated Duration:', value: durationDisplay },
                    { label: 'Maximum Marks:', value: totalMaxMarks > 0 ? `${totalMaxMarks.toFixed(1)} Points` : 'Details not available' }
                ]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts,
                pairs: [
                    { label: 'Questions Count:', value: totalAllocatedCount > 0 ? `${totalAllocatedCount} Item(s)` : 'Details not available' },
                    { label: 'Verification Status:', value: verificationBadge }
                ]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts,
                pairs: [
                    { label: 'Closure Timestamp:', value: closureDateIST },
                    { label: 'Delivery Mode:', value: deliveryMode }
                ]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts,
                pairs: [{ label: 'Examination Title:', value: testTitle }]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts,
                pairs: [{ label: 'Course Code & Title:', value: courseDisplay }]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts,
                pairs: [{ label: 'Session Window (IST):', value: examWindowDisplay }]
            });

            curY += 12;

            // --- SECTION 2: CANDIDATE DETAILS & REGISTRATION RECORD ---
            ensureSpace(120, 'Candidate Details');
            curY = drawBwSectionBand(doc, startX, curY, pageWidth, 20, '2. CANDIDATE DETAILS & REGISTRATION RECORD', fonts);

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
                    { label: 'Registered Email:', value: personalEmail },
                    { label: 'College Email:', value: collegeEmail }
                ]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts,
                pairs: [{ label: 'Enrolled Courses:', value: programStr }]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts,
                pairs: [{ label: 'Permanent Address:', value: permanentAddress }]
            });

            curY += 12;

            // --- SECTION 3: BIOMETRIC VERIFICATION & SYSTEM TELEMETRY ---
            ensureSpace(190, 'Biometric Verification & System Telemetry');
            curY = drawBwSectionBand(doc, startX, curY, pageWidth, 20, '3. BIOMETRIC VERIFICATION & SYSTEM TELEMETRY', fonts);

            const bioRes = submission?.biometricResult || {};
            const bioLegacy = submission?.biometricVerification || {};
            const similarityScoreVal = bioRes.similarityScore ?? bioLegacy.confidenceScore ?? submission?.biometricScore ?? null;
            const formattedScore = (typeof similarityScoreVal === 'number' && !isNaN(similarityScoreVal))
                ? (similarityScoreVal <= 1 ? (similarityScoreVal * 100).toFixed(1) : similarityScoreVal.toFixed(1)) + '%'
                : safeText(similarityScoreVal);

            const rawDecision = String(bioLegacy.matchStatus || bioRes.decision || '').toLowerCase();
            let matchStatusStr = 'Details not available';
            if (rawDecision === 'matched' || rawDecision === 'match_confirmed' || rawDecision === 'match confirmed' || bioRes.matched === true) {
                matchStatusStr = 'MATCH CONFIRMED';
            } else if (rawDecision.includes('review') || rawDecision.includes('flag') || bioRes.reviewNeeded) {
                matchStatusStr = 'REVIEW FLAGGED';
            } else if (rawDecision && rawDecision !== 'not-evaluated') {
                matchStatusStr = rawDecision.toUpperCase();
            }

            let challengesStr = 'Details not available';
            if (bioLegacy.challengesCompleted) {
                challengesStr = String(bioLegacy.challengesCompleted);
            } else if (bioRes.challengeType) {
                challengesStr = `${bioRes.livenessPassed ? 'Liveness Passed' : 'Liveness Recorded'} (${bioRes.challengeType})`;
            } else if (bioRes.livenessPassed === true) {
                challengesStr = 'Active Liveness Passed';
            }
            const bioEvalTimeStr = bioRes.evaluatedAt ? formatISTDate(bioRes.evaluatedAt) : 'Details not available';

            const bioPanelH = 88;
            doc.rect(startX, curY, pageWidth, bioPanelH).strokeColor('#334155').lineWidth(0.7).stroke();

            const pWidth = 52;
            const pHeight = 56;
            const p1X = startX + 12;
            const p1Y = curY + 8;
            doc.rect(p1X, p1Y, pWidth, pHeight).strokeColor('#334155').lineWidth(0.7).stroke();
            if (enrolledPhotoBuffer) {
                try {
                    doc.image(enrolledPhotoBuffer, p1X + 1, p1Y + 1, { width: pWidth - 2, height: pHeight - 2 });
                } catch (e) {
                    doc.fillColor('#475569').fontSize(6.2).font(fonts.bodyRegular).text('Photo unavailable', p1X + 2, p1Y + 22, { width: pWidth - 4, align: 'center' });
                }
            } else {
                doc.fillColor('#475569').fontSize(6.2).font(fonts.bodyRegular).text('No photo', p1X + 2, p1Y + 22, { width: pWidth - 4, align: 'center' });
            }
            doc.fillColor('#0f172a').fontSize(6.2).font(fonts.bodySemiBold).text('REGISTERED PHOTO', p1X - 6, p1Y + pHeight + 4, { width: pWidth + 12, align: 'center' });

            const p2X = startX + 80;
            const p2Y = curY + 8;
            doc.rect(p2X, p2Y, pWidth, pHeight).strokeColor('#334155').lineWidth(0.7).stroke();
            if (baselinePhotoBuffer) {
                try {
                    doc.image(baselinePhotoBuffer, p2X + 1, p2Y + 1, { width: pWidth - 2, height: pHeight - 2 });
                } catch (e) {
                    doc.fillColor('#475569').fontSize(6.2).font(fonts.bodyRegular).text('Photo unavailable', p2X + 2, p2Y + 22, { width: pWidth - 4, align: 'center' });
                }
            } else {
                doc.fillColor('#475569').fontSize(6.2).font(fonts.bodyRegular).text('No baseline', p2X + 2, p2Y + 22, { width: pWidth - 4, align: 'center' });
            }
            doc.fillColor('#0f172a').fontSize(6.2).font(fonts.bodySemiBold).text('WEBCAM BASELINE', p2X - 6, p2Y + pHeight + 4, { width: pWidth + 12, align: 'center' });

            const bioDetailsX = startX + 150;
            const bioDetailsW = pageWidth - 160;
            doc.moveTo(bioDetailsX - 10, curY).lineTo(bioDetailsX - 10, curY + bioPanelH).strokeColor('#64748b').lineWidth(0.6).stroke();

            let bY = curY + 10;
            doc.fillColor('#0f172a').fontSize(8).font(fonts.titleBold)
               .text('BIOMETRIC IDENTITY VERIFICATION SUMMARY', bioDetailsX, bY, { width: bioDetailsW });
            bY = doc.y + 5;

            doc.fillColor('#000000').fontSize(7.8);
            doc.font(fonts.bodySemiBold).text('Facial Similarity Score: ', bioDetailsX, bY, { continued: true })
               .font(fonts.bodyRegular).text(`${formattedScore}    |    `, { continued: true })
               .font(fonts.bodySemiBold).text('Match Status: ', { continued: true })
               .font(fonts.bodyRegular).text(matchStatusStr);
            bY = doc.y + 4;

            doc.font(fonts.bodySemiBold).text('Liveness Challenge Protocol: ', bioDetailsX, bY, { continued: true })
               .font(fonts.bodyRegular).text(challengesStr);
            bY = doc.y + 4;

            doc.font(fonts.bodySemiBold).text('Biometric Evaluated At: ', bioDetailsX, bY, { continued: true })
               .font(fonts.bodyRegular).text(bioEvalTimeStr);

            curY += bioPanelH;

            // Technical telemetry rows (NO duplicate Submission ID / BICSID here)
            const onNewTelemetryPage = () => drawContinuationHeader('System Environment Telemetry');

            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts, onNewPage: onNewTelemetryPage,
                pairs: [
                    { label: 'Reference ID:', value: submissionRefId },
                    { label: 'Client IP Address:', value: clientIp }
                ]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts, onNewPage: onNewTelemetryPage,
                pairs: [
                    { label: 'Network ISP:', value: networkInfo },
                    { label: 'Detected Location:', value: locationStr }
                ]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts, onNewPage: onNewTelemetryPage,
                pairs: [
                    { label: 'Timezone / Route:', value: connTzOrQuality },
                    { label: 'Operating System:', value: osStr }
                ]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts, onNewPage: onNewTelemetryPage,
                pairs: [
                    { label: 'Display Specs:', value: screenRes },
                    { label: 'Hardware Specs:', value: hardwareStr }
                ]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts, onNewPage: onNewTelemetryPage,
                pairs: [
                    { label: 'WebGL Renderer:', value: safeText(secMeta.webglRenderer) },
                    { label: 'Submission Method:', value: safeText(submission?.submissionReason) }
                ]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts, onNewPage: onNewTelemetryPage,
                pairs: [{ label: 'Browser / Agent:', value: browserStr }]
            });

            // =========================================================================
            // PAGE 2+: SECTION 4 (QUESTIONWISE BREAKDOWN & SCORE MATRIX)
            // =========================================================================
            doc.addPage();
            curY = drawContinuationHeader('Questionwise Evaluation Transcript');

            curY = drawBwSectionBand(doc, startX, curY, pageWidth, 20, '4. QUESTIONWISE BREAKDOWN & SCORE MATRIX', fonts);

            const tableHeaders = [
                { label: 'Q. NO.', align: 'center' },
                { label: 'TYPE', align: 'left' },
                { label: 'QUESTION TITLE', align: 'left' },
                { label: 'MAX', align: 'center' },
                { label: 'BEFORE', align: 'center' },
                { label: 'OBJECTED', align: 'center' },
                { label: 'AFTER', align: 'center' }
            ];
            const colWidths = [40, 68, 202, 52, 58, 57, 58];

            curY = drawBwTable(doc, {
                startX,
                startY: curY,
                width: pageWidth,
                headers: tableHeaders,
                rows: questionRows,
                colWidths,
                headerHeight: 24,
                rowHeight: 24,
                fonts,
                onNewPage: () => drawContinuationHeader('Questionwise Evaluation Transcript (Cont.)')
            });

            ensureSpace(95, 'Assessment Score Summary');
            curY += 14;

            doc.rect(startX, curY, pageWidth, 30).fillAndStroke('#e2e8f0', '#0f172a');
            doc.fillColor('#0f172a').fontSize(9.2).font(fonts.titleBold)
               .text(
                   `TOTAL MARKS SCORED: ${totalAfterMarks.toFixed(1)} / ${totalMaxMarks.toFixed(1)}   |   PERCENTAGE: ${percentage}%   |   INITIAL TOTAL: ${totalBeforeMarks.toFixed(1)}`,
                   startX,
                   curY + 9,
                   { width: pageWidth, align: 'center' }
               );
            curY += 36;

            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts,
                pairs: [
                    { label: 'Objective / MCQ Score:', value: `${objSecTotal.toFixed(1)} Points` },
                    { label: 'Coding / Web Score:', value: `${codingSecTotal.toFixed(1)} (Coding)  |  ${webSecTotal.toFixed(1)} (Web)` }
                ]
            });

            // =========================================================================
            // PAGE 3+ (AFTER QUESTIONS): SECTION 5 — PROCTORING TELEMETRY & SESSION AUDIT LOGS
            // Always starts cleanly on a new page regardless of how many pages Questions span
            // =========================================================================
            doc.addPage();
            curY = drawContinuationHeader('Proctoring Telemetry & Audit Logs');

            curY = drawBwSectionBand(doc, startX, curY, pageWidth, 20, '5. PROCTORING TELEMETRY & AUDIT LOGS', fonts);

            const logSnap = submission?.proctoringLog || {};
            const events = Array.isArray(logSnap.events) ? logSnap.events : [];
            const fsExits = logSnap.fullscreenExits !== undefined && logSnap.fullscreenExits !== null ? Number(logSnap.fullscreenExits) : null;
            const tabSwitches = logSnap.tabSwitches !== undefined && logSnap.tabSwitches !== null ? Number(logSnap.tabSwitches) : null;
            const inspectAtt = logSnap.inspectAttempts !== undefined && logSnap.inspectAttempts !== null ? Number(logSnap.inspectAttempts) : null;
            const clipAtt = logSnap.clipboardAttempts !== undefined && logSnap.clipboardAttempts !== null ? Number(logSnap.clipboardAttempts) : null;

            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts,
                pairs: [
                    { label: 'Webcam Status:', value: logSnap.webcamStatus ? String(logSnap.webcamStatus).toUpperCase() : 'Details not available' },
                    { label: 'Fullscreen Exits:', value: fsExits !== null ? String(fsExits) : 'Details not available' }
                ]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts,
                pairs: [
                    { label: 'Tab / Focus Switches:', value: tabSwitches !== null ? String(tabSwitches) : 'Details not available' },
                    { label: 'Inspect Attempts:', value: inspectAtt !== null ? String(inspectAtt) : 'Details not available' }
                ]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts,
                pairs: [
                    { label: 'Clipboard Attempts:', value: clipAtt !== null ? String(clipAtt) : 'Details not available' },
                    {
                        label: 'Extended Display:',
                        value: typeof secMeta.isExtendedDisplay === 'boolean'
                            ? (secMeta.isExtendedDisplay ? 'Detected (Flagged)' : 'Single Display')
                            : 'Details not available'
                    }
                ]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts,
                pairs: [
                    {
                        label: 'Offline Heartbeat Gaps:',
                        value: Array.isArray(logSnap.serverOfflineGaps) ? `${logSnap.serverOfflineGaps.length} Gap(s) Logged` : 'Details not available'
                    },
                    {
                        label: 'EIRF Flag Raised:',
                        value: typeof submission?.hasEirfFlag === 'boolean'
                            ? (submission.hasEirfFlag ? `Yes (${(submission.flaggedReasons || []).length} reason(s))` : 'No')
                            : 'Details not available'
                    }
                ]
            });

            // 5A: Standard Session Lifecycle & Compliance Logs (Consent Accepted, Proctoring Allowed, Test Started, Test Submitted)
            curY += 12;
            ensureSpace(85, 'Session Lifecycle Logs');
            curY = drawBwSectionBand(doc, startX, curY, pageWidth, 20, '5A. STANDARD SESSION LIFECYCLE & COMPLIANCE LOGS', fonts);

            const sortedEvents = [...events].sort((a, b) =>
                new Date(a?.timestamp || a?.startTime || 0) - new Date(b?.timestamp || b?.startTime || 0)
            );
            const findEventByTypes = (typeList, pickLatest = false) => {
                const matches = sortedEvents.filter(e => typeList.includes(String(e?.type || '').toUpperCase()));
                if (matches.length === 0) return null;
                return pickLatest ? matches[matches.length - 1] : matches[0];
            };

            const consentEv = findEventByTypes(['CONSENT_ACCEPTED']);
            const proctorAllowedEv = findEventByTypes(['PROCTORING_ALLOWED', 'CAM_GRANTED']);
            const startedEv = findEventByTypes(['TEST_STARTED']);
            const submittedEv = findEventByTypes(['TEST_AUTO_SUBMITTED', 'TEST_SUBMITTED'], true);

            const submitTypeLabel = submittedEv?.type
                ? String(submittedEv.type).toUpperCase()
                : (submission?.status === 'auto-submitted' ? 'TEST_AUTO_SUBMITTED' : 'TEST_SUBMITTED');

            const lifecycleHeaders = [
                { label: 'TIMESTAMP (IST)', align: 'left' },
                { label: 'CHECKPOINT EVENT', align: 'left' },
                { label: 'EVENT DETAILS', align: 'left' },
                { label: 'STATUS', align: 'center' }
            ];
            const lifecycleColWidths = [115, 118, 227, 75];

            const lifecycleRows = [
                {
                    cells: [
                        consentEv ? formatISTDate(consentEv.timestamp || consentEv.startTime) : 'Details not available',
                        'CONSENT_ACCEPTED',
                        safeText(consentEv?.details),
                        consentEv ? 'Logged' : 'Not Logged'
                    ]
                },
                {
                    cells: [
                        proctorAllowedEv ? formatISTDate(proctorAllowedEv.timestamp || proctorAllowedEv.startTime) : 'Details not available',
                        proctorAllowedEv?.type ? String(proctorAllowedEv.type).toUpperCase() : 'PROCTORING_ALLOWED',
                        safeText(proctorAllowedEv?.details),
                        proctorAllowedEv ? 'Logged' : 'Not Logged'
                    ]
                },
                {
                    cells: [
                        startedEv
                            ? formatISTDate(startedEv.timestamp || startedEv.startTime || submission?.startedAt)
                            : (submission?.startedAt ? formatISTDate(submission.startedAt) : 'Details not available'),
                        'TEST_STARTED',
                        startedEv
                            ? safeText(startedEv.details)
                            : (submission?.startedAt ? 'Test session initialized on examination server.' : 'Details not available'),
                        (startedEv || submission?.startedAt) ? 'Verified' : 'Not Logged'
                    ]
                },
                {
                    cells: [
                        submittedEv
                            ? formatISTDate(submittedEv.timestamp || submittedEv.startTime || submission?.submittedAt)
                            : (submission?.submittedAt ? formatISTDate(submission.submittedAt) : 'Details not available'),
                        submitTypeLabel,
                        submittedEv
                            ? safeText(submittedEv.details)
                            : (submission?.submittedAt
                                ? `Examination finalized and submitted (${safeText(submission?.submissionReason, 'recorded')}).`
                                : 'Details not available'),
                        (submittedEv || submission?.submittedAt) ? 'Sealed' : 'Not Logged'
                    ]
                }
            ];

            curY = drawBwTable(doc, {
                startX,
                startY: curY,
                width: pageWidth,
                headers: lifecycleHeaders,
                rows: lifecycleRows,
                colWidths: lifecycleColWidths,
                headerHeight: 22,
                rowHeight: 22,
                fonts,
                onNewPage: () => drawContinuationHeader('Session Lifecycle Logs (Cont.)')
            });

            // 5B: Proctoring Violations & Security Anomaly Logs
            curY += 12;
            ensureSpace(85, 'Proctoring Violations & Security Logs');
            curY = drawBwSectionBand(doc, startX, curY, pageWidth, 20, '5B. PROCTORING VIOLATIONS & SECURITY ANOMALY LOGS', fonts);

            const LIFECYCLE_AND_ROUTINE_TYPES = new Set([
                'CONSENT_ACCEPTED',
                'PROCTORING_ALLOWED',
                'CAM_GRANTED',
                'TEST_STARTED',
                'TEST_SUBMITTED',
                'TEST_AUTO_SUBMITTED',
                'OPTION_MARKED',
                'OPTION_CLEARED',
                'CODE_RUN',
                'CODE_SAVED',
                'CODE_RESET',
                'WEB_SAVED',
                'WEB_RESET',
                'BASELINE_REFERENCE'
            ]);

            const violationEvents = sortedEvents.filter(ev => {
                const t = String(ev?.type || '').toUpperCase().trim();
                return t && !LIFECYCLE_AND_ROUTINE_TYPES.has(t);
            });

            const violationHeaders = [
                { label: 'TIMESTAMP (IST)', align: 'left' },
                { label: 'VIOLATION TYPE', align: 'left' },
                { label: 'DURATION', align: 'center' },
                { label: 'EVENT DETAILS', align: 'left' },
                { label: 'SEVERITY', align: 'center' }
            ];
            const violationColWidths = [112, 96, 62, 188, 77];

            const violationRows = [];
            if (violationEvents.length > 0) {
                violationEvents.forEach((ev) => {
                    const evTime = formatISTDate(ev.timestamp || ev.startTime || submission?.startedAt);
                    const evType = safeText(ev.type ? String(ev.type).toUpperCase() : null);
                    let evDur = Number(ev.durationSeconds || 0);
                    if (!evDur && ev.details) {
                        const m = String(ev.details).match(/(\d+)\s*seconds/i);
                        if (m && m[1]) evDur = parseInt(m[1], 10);
                    }
                    const evDet = safeText(ev.details || ev.reason);
                    const evSev = evDur > 5 ? 'High (>5s)' : (evDur > 0 ? 'Moderate' : 'Flagged');
                    violationRows.push({
                        cells: [evTime, evType, evDur > 0 ? `${evDur}s` : 'N/A', String(evDet), evSev]
                    });
                });
            } else if ((fsExits || 0) > 0 || (tabSwitches || 0) > 0 || (inspectAtt || 0) > 0 || (clipAtt || 0) > 0) {
                violationRows.push({
                    cells: [
                        examStartIST || 'Details not available',
                        'WINDOW_DEVIATION',
                        'N/A',
                        `${fsExits || 0} Fullscreen Exit(s), ${tabSwitches || 0} Tab Switch(es), ${inspectAtt || 0} Inspect, ${clipAtt || 0} Clipboard attempt(s) logged`,
                        'Flagged'
                    ]
                });
            } else {
                violationRows.push({
                    cells: [
                        examStartIST || 'Details not available',
                        'SESSION_MONITOR',
                        '0s',
                        'Zero proctoring violation events recorded in session telemetry log.',
                        'Cleared'
                    ]
                });
            }

            curY = drawBwTable(doc, {
                startX,
                startY: curY,
                width: pageWidth,
                headers: violationHeaders,
                rows: violationRows,
                colWidths: violationColWidths,
                headerHeight: 22,
                rowHeight: 22,
                fonts,
                onNewPage: () => drawContinuationHeader('Proctoring Violations (Cont.)')
            });

            // =========================================================================
            // PAGE 4+: SECTIONS 6, 7, 8 (OBJECTIONS, EIRF SUMMARY & ENDORSEMENT)
            // =========================================================================
            doc.addPage();
            curY = drawContinuationHeader('Objections, EIRF & Verification');

            // --- SECTION 6: OBJECTIONS SUMMARY & MARKS AUDIT ---
            curY = drawBwSectionBand(doc, startX, curY, pageWidth, 20, '6. OBJECTIONS SUMMARY & MARKS AUDIT', fonts);

            const objHeaders = [
                { label: 'SR.', align: 'center' },
                { label: 'OBJECTION ID', align: 'center' },
                { label: 'Q. NO.', align: 'center' },
                { label: 'QUESTION TITLE', align: 'left' },
                { label: 'CANDIDATE STATEMENT', align: 'left' },
                { label: 'BEFORE', align: 'center' },
                { label: 'AFTER', align: 'center' },
                { label: 'DIFF', align: 'center' }
            ];
            const objColWidths = [26, 82, 40, 118, 133, 46, 45, 45];

            const objRows = [];
            if (objectionsList.length > 0) {
                objectionsList.forEach((obj, oIdx) => {
                    const rawId = String(obj.objectionId || obj._id || obj.id || '');
                    const objId = (rawId && /^OBJ-\d{4}-[A-Z0-9]+$/i.test(rawId))
                        ? rawId.toUpperCase()
                        : (obj.objectionId ? String(obj.objectionId).toUpperCase() : `OBJ-2026-${String(rawId.length === 24 ? rawId.slice(-5) : (rawId || (oIdx + 1))).toUpperCase().padStart(5, '0')}`);

                    let targetQIdx = rawQuestions.findIndex(q => {
                        const candIds = [q?.id, q?._id, q?.questionId].filter(Boolean).map(String);
                        return obj.questionId && candIds.includes(String(obj.questionId));
                    });
                    if (targetQIdx < 0 && obj.questionIndex !== undefined && obj.questionIndex !== null && rawQuestions[Number(obj.questionIndex)]) {
                        targetQIdx = Number(obj.questionIndex);
                    }
                    const qLabel = targetQIdx >= 0 ? `Q. ${targetQIdx + 1}` : (obj.questionIndex !== undefined ? `Q. ${Number(obj.questionIndex) + 1}` : (obj.questionNumber ? `Q. ${obj.questionNumber}` : 'General'));
                    const targetQ = targetQIdx >= 0 ? rawQuestions[targetQIdx] : null;
                    const qTitle = safeText(targetQ?.title || targetQ?.questionText || targetQ?.description || targetQ?.text);

                    const reason = safeText(obj.reason || obj.details || obj.statement || obj.candidateStatement);
                    const mbVal = (obj.marksBefore !== null && obj.marksBefore !== undefined) ? Number(obj.marksBefore) : null;
                    const maRaw = (obj.marksAfter !== null && obj.marksAfter !== undefined)
                        ? Number(obj.marksAfter)
                        : ((obj.resolvedMarks !== null && obj.resolvedMarks !== undefined) ? Number(obj.resolvedMarks) : (obj.status === 'rejected' && mbVal !== null ? mbVal : null));
                    const mb = mbVal !== null ? mbVal.toFixed(1) : '-';
                    const ma = isAnnulled ? '0.0' : (maRaw !== null ? maRaw.toFixed(1) : '-');
                    const diffVal = isAnnulled && mbVal !== null
                        ? -mbVal
                        : (obj.marksDiff !== undefined && obj.marksDiff !== null ? Number(obj.marksDiff) : (maRaw !== null && mbVal !== null ? maRaw - mbVal : 0));
                    const diffStr = (diffVal > 0 ? `+${diffVal.toFixed(1)}` : diffVal.toFixed(1));

                    objRows.push({
                        cells: [String(oIdx + 1), objId, qLabel, String(qTitle), String(reason), mb, ma, diffStr]
                    });
                });
            } else {
                objRows.push({
                    cells: ['1', '-', '-', 'No Objections Registered', 'No objections were raised for this examination submission.', '-', '-', '0.0']
                });
            }

            curY = drawBwTable(doc, {
                startX,
                startY: curY,
                width: pageWidth,
                headers: objHeaders,
                rows: objRows,
                colWidths: objColWidths,
                headerHeight: 22,
                rowHeight: 22,
                fonts,
                onNewPage: () => drawContinuationHeader('Objections Summary (Cont.)')
            });
            curY += 14;

            // --- SECTION 7: EIRF INCIDENT & ADJUDICATION SUMMARY ---
            ensureSpace(125, 'EIRF & Adjudication Summary');
            curY = drawBwSectionBand(doc, startX, curY, pageWidth, 20, '7. EIRF INCIDENT & ADJUDICATION SUMMARY', fonts);

            const eirfReportId = safeText(submission?.eirfReportId || eirfReport?.reportId);
            let eirfVerdict = 'Details not available';
            if (eirfReport?.status) {
                eirfVerdict = String(eirfReport.status).toUpperCase();
            } else if (submission?.eirfStatus && submission.eirfStatus !== 'none') {
                eirfVerdict = String(submission.eirfStatus).toUpperCase();
            } else if (submission?.hasEirfFlag === false) {
                eirfVerdict = 'NO INCIDENT FLAGGED';
            }

            const eirfCause = safeText(
                eirfReport?.primaryCause ||
                (Array.isArray(submission?.flaggedReasons) && submission.flaggedReasons.length > 0 ? submission.flaggedReasons.join('; ') : null)
            );
            const resolutionClass = safeText(
                eirfReport?.resolutionCategory ||
                (isAnnulled ? 'Violation Upheld — Examination Score Annulled' : null)
            );
            let normStatusText = 'Details not available';
            if (isAnnulled) {
                normStatusText = 'Score Annulled by Integrity Committee (0.0 Points Awarded)';
            } else if (submission?.submittedAt || submission?.score !== undefined) {
                normStatusText = 'Provisional Marks Recorded & Sealed';
            }

            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts,
                pairs: [
                    { label: 'EIRF Report ID:', value: eirfReportId },
                    { label: 'Adjudication Status:', value: eirfVerdict }
                ]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts,
                pairs: [
                    { label: 'Resolution Category:', value: resolutionClass },
                    { label: 'Score Standing:', value: normStatusText }
                ]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts,
                pairs: [{ label: 'Primary Cause / Flag:', value: eirfCause }]
            });
            curY += 14;

            // --- SECTION 8: DIGITAL VERIFICATION & AUTHORITATIVE SEAL ---
            ensureSpace(135, 'Digital Verification & Sign-Off');
            curY = drawBwSectionBand(doc, startX, curY, pageWidth, 20, '8. DIGITAL VERIFICATION & AUTHORITATIVE SEAL', fonts);

            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts,
                pairs: [
                    { label: 'Issuing Authority:', value: 'Controller of Examinations, BICS Department of Examination' },
                    { label: 'Verification Hash:', value: otrfHash }
                ]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts,
                pairs: [
                    { label: 'Closure Timestamp:', value: closureDateIST },
                    { label: 'Reference ID:', value: submissionRefId }
                ]
            });
            curY = drawBwSplitRow(doc, {
                x: startX, y: curY, width: pageWidth, fonts,
                pairs: [{ label: 'Verification URL:', value: resolvedVerificationUrl }]
            });

            curY += 12;
            ensureSpace(48, 'Verification Disclaimer');
            const disclaimerText = 'This is an official computer-generated Online Test Report Form (OTRF) issued by the BICS Department of Examination. Authenticity can be verified directly by scanning the QR code on Page 1 or opening the archived transcript at the Verification URL listed above.';
            doc.font(fonts.bodyRegular).fontSize(7.4);
            const discH = doc.heightOfString(disclaimerText, { width: pageWidth - 16, lineGap: 2.4 });
            const discBoxH = Math.ceil(discH + 14);
            doc.rect(startX, curY, pageWidth, discBoxH).strokeColor('#64748b').lineWidth(0.6).stroke();
            doc.fillColor('#334155').font(fonts.bodyRegular).fontSize(7.4)
               .text(disclaimerText, startX + 8, curY + 7, { width: pageWidth - 16, lineGap: 2.4 });

            // Single Footer Pass across all pages (Reference ID on footer, never BICSID)
            const totalPages = doc.bufferedPageRange().count;
            for (let i = 0; i < totalPages; i++) {
                doc.switchToPage(i);
                drawBwFooter(doc, i + 1, totalPages, 'Online Test Report Form (OTRF)', submissionRefId, fonts);
            }

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = {
    generateOtrfReportPdfBuffer,
    generateOtrfVerificationHash,
    resolveOtrfArtifactMeta,
    persistOtrfPdfArtifact
};
