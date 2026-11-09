const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const mongoose = require('mongoose');
const {
    EmailLogModel,
    EMAIL_TYPES,
    TestSubmissionModel,
    EIRFReportModel,
    TestConfigModel,
    CandidateModel
} = require('../models');
const { dbState, getJSONData, saveJSONData } = require('../config/db');
const { logSystemAction } = require('../utils/logger');
const { toBicsId, resolveToObjectId } = require('../utils/bicsId');
const {
    hasGmailCredentials,
    extractValidCandidateEmail,
    sendVerificationCodeEmail,
    sendTestSubmittedEmail,
    sendEirfFilingNoticeEmail,
    sendEirfVerdictApprovedEmail,
    sendEirfVerdictRejectedEmail,
    sendOtrfEmail,
    dispatchOtrfBatchForClosedTest
} = require('../services/gmailEmailService');

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function toBicsIdSafe(val) {
    if (!val) return '';
    const s = String(val).trim();
    if (!s) return '';
    const converted = toBicsId(s);
    return converted || s;
}

function redactSecrets(val) {
    return String(val || '').replace(/([?&]token=)[^&\s]+/gi, '$1[REDACTED]');
}

function hasPdfAttachment(emailType, attachmentNames = []) {
    if (Array.isArray(attachmentNames) && attachmentNames.some(a => /\.pdf$/i.test(String(a)))) {
        return true;
    }
    return ['eirf_approved', 'eirf_rejected', 'otrf_sent'].includes(emailType);
}

function serializeEmailLogEntry(raw, testTitleMap = new Map()) {
    const rawId = String(raw._id || raw.id || '');
    const rawCandId = raw.candidateId ? String(raw.candidateId) : '';
    const rawTestId = raw.testId ? String(raw.testId) : '';
    const rawSubId = raw.submissionId ? String(raw.submissionId) : '';
    const rawRetriedFrom = raw.retriedFromLogId ? String(raw.retriedFromLogId) : '';

    const bicsLogId = rawId ? (rawId.startsWith('pending_') ? rawId : toBicsIdSafe(rawId)) : '';
    const bicsCandId = rawCandId ? toBicsIdSafe(rawCandId) : '';
    const bicsTestId = rawTestId ? toBicsIdSafe(rawTestId) : '';
    const bicsSubId = rawSubId ? toBicsIdSafe(rawSubId) : '';
    const resolvedTestIdKey = rawTestId ? String(resolveToObjectId(rawTestId) || rawTestId) : '';
    const testTitle = raw.testTitle || testTitleMap.get(resolvedTestIdKey) || testTitleMap.get(rawTestId) || '';

    let targetId = '';
    if (raw.emailType === 'verification_code') {
        targetId = bicsCandId || String(raw.studentId || '');
    } else if (raw.emailType === 'eirf_approved' || raw.emailType === 'eirf_rejected') {
        targetId = raw.reportId || bicsSubId || raw.submissionRefId || '';
    } else {
        targetId = bicsSubId || raw.submissionRefId || '';
    }

    return {
        _id: bicsLogId,
        id: bicsLogId,
        logId: raw.isSyntheticPending ? '' : bicsLogId,
        isSyntheticPending: Boolean(raw.isSyntheticPending),
        emailType: raw.emailType || 'test_submitted',
        status: raw.status || 'pending',
        transport: raw.transport || (raw.isSyntheticPending ? 'pending' : 'gmail_rest_api'),
        statusCode: raw.statusCode ?? null,
        messageId: raw.messageId || '',
        attempts: Number(raw.attempts || (raw.isSyntheticPending ? 0 : 1)),
        lastError: redactSecrets(raw.lastError || ''),
        lastAttemptAt: raw.lastAttemptAt || raw.createdAt || null,
        sentAt: raw.sentAt || null,
        createdAt: raw.createdAt || raw.lastAttemptAt || null,
        recipientEmail: raw.recipientEmail || '',
        recipientName: raw.recipientName || 'Candidate',
        subject: redactSecrets(raw.subject || ''),
        attachmentNames: Array.isArray(raw.attachmentNames) ? raw.attachmentNames : [],
        hasPdf: hasPdfAttachment(raw.emailType, raw.attachmentNames),
        triggerSource: raw.triggerSource || 'system',
        purpose: raw.purpose || '',
        candidateId: bicsCandId,
        studentId: raw.studentId || '',
        testId: bicsTestId,
        testTitle,
        submissionId: bicsSubId,
        submissionRefId: raw.submissionRefId || '',
        reportId: raw.reportId || '',
        retriedFromLogId: rawRetriedFrom ? toBicsIdSafe(rawRetriedFrom) : '',
        targetId
    };
}

async function loadUnifiedEmailState({ testIdFilter = '' } = {}) {
    let logs = [];
    let submissions = [];
    let reports = [];
    let tests = [];
    let candidates = [];

    if (dbState.useMongo) {
        [logs, submissions, reports, tests, candidates] = await Promise.all([
            EmailLogModel.find({}).sort({ lastAttemptAt: -1, createdAt: -1 }).limit(1000).lean(),
            TestSubmissionModel.find({ isDeleted: { $ne: true } })
                .select('_id candidateId studentId candidateName candidateEmail personalEmail testId testTitle status submissionRefId pipelineStatus hasEirfFlag eirfStatus eirfNoticeEmailSent eirfReportId emailsSent submittedAt createdAt verificationClosedAt')
                .lean(),
            EIRFReportModel.find({}).lean(),
            TestConfigModel.find({ isDeleted: { $ne: true } })
                .select('_id title courseCode verificationStatus verificationClosedAt')
                .lean(),
            CandidateModel.find({})
                .select('_id studentId name fullName username personalEmail email registrationData.preferredName registrationData.personalEmail registrationData.collegeEmail')
                .lean()
        ]);
    } else {
        const db = getJSONData();
        logs = [...(db.emailLogs || [])].sort(
            (a, b) => new Date(b.lastAttemptAt || b.createdAt || 0) - new Date(a.lastAttemptAt || a.createdAt || 0)
        );
        submissions = (db.testSubmissions || []).filter(s => !s.isDeleted);
        reports = (db.eirfReports || []).filter(r => !r.isDeleted);
        tests = (db.tests || []).filter(t => !t.isDeleted);
        candidates = db.candidates || [];
    }

    const candById = new Map();
    const candByStudentId = new Map();
    for (const c of candidates) {
        const cid = String(c._id || c.id || '');
        if (cid) candById.set(cid, c);
        if (c.studentId) candByStudentId.set(String(c.studentId), c);
    }

    const testById = new Map();
    const testTitleMap = new Map();
    for (const t of tests) {
        const tid = String(t._id || t.id || '');
        if (tid) {
            testById.set(tid, t);
            testTitleMap.set(tid, t.title || 'Examination');
        }
    }

    const subById = new Map();
    const subByRef = new Map();
    for (const s of submissions) {
        const sid = String(s._id || s.id || '');
        if (sid) subById.set(sid, s);
        if (s.submissionRefId) subByRef.set(String(s.submissionRefId), s);
    }

    // Track existing logged failures/pending entries to avoid duplicate virtual pending rows
    const unresolvedLogKeys = new Set();
    for (const l of logs) {
        if (l.status === 'failed' || l.status === 'pending') {
            const subKey = l.submissionId ? String(resolveToObjectId(String(l.submissionId)) || l.submissionId) : '';
            if (subKey) unresolvedLogKeys.add(`${l.emailType}:sub:${subKey}`);
            if (l.submissionRefId) unresolvedLogKeys.add(`${l.emailType}:ref:${l.submissionRefId}`);
            if (l.reportId) unresolvedLogKeys.add(`${l.emailType}:rep:${l.reportId}`);
        }
    }

    const resolveCand = (obj) => {
        const cid = obj.candidateId ? String(resolveToObjectId(String(obj.candidateId)) || obj.candidateId) : '';
        return candById.get(cid) || (obj.studentId ? candByStudentId.get(String(obj.studentId)) : null) || null;
    };

    const syntheticPending = [];

    // 1. Scan active submissions for unsent test_submitted, eirf_filing, otrf_sent
    for (const sub of submissions) {
        const sid = String(sub._id || sub.id || '');
        const tid = String(resolveToObjectId(String(sub.testId || sub.testConfigId || '')) || sub.testId || '');
        const testDoc = testById.get(tid);
        const candDoc = resolveCand(sub);
        const email = extractValidCandidateEmail(candDoc, sub) || '';
        const name = candDoc?.fullName || candDoc?.name || candDoc?.registrationData?.preferredName || sub.candidateName || 'Candidate';
        const refId = sub.submissionRefId || toBicsIdSafe(sid);
        const testTitle = sub.testTitle || testDoc?.title || 'Examination';

        // 1a. Expected test_submitted (clean finalized OR flagged after filing/expiry)
        const isFinalized = ['submitted', 'auto-submitted', 'evaluated'].includes(sub.status);
        const shouldHaveTestSubmitted = isFinalized && (
            (!sub.hasEirfFlag && sub.pipelineStatus === 'CLEARED') ||
            (sub.hasEirfFlag && (
                ['EIRF_SUBMITTED', 'SENDING_CONFIRMATION_EMAIL', 'UNDER_REVIEW', 'EXPIRED', 'VERDICT_ISSUED', 'APPROVED', 'REJECTED'].includes(sub.pipelineStatus) ||
                ['filed', 'submitted', 'expired', 'approved', 'rejected'].includes(sub.eirfStatus)
            ))
        );

        if (shouldHaveTestSubmitted && !sub.emailsSent?.testSubmitted) {
            if (!unresolvedLogKeys.has(`test_submitted:sub:${sid}`) && !unresolvedLogKeys.has(`test_submitted:ref:${refId}`)) {
                syntheticPending.push({
                    _id: `pending_test_submitted_${toBicsIdSafe(sid)}`,
                    isSyntheticPending: true,
                    emailType: 'test_submitted',
                    status: 'pending',
                    transport: 'pending',
                    attempts: 0,
                    lastError: email ? 'Queued / awaiting confirmation email dispatch' : 'Candidate email missing or invalid',
                    lastAttemptAt: sub.submittedAt || sub.createdAt || new Date(),
                    recipientEmail: email,
                    recipientName: name,
                    subject: `Test Submission Confirmation: ${testTitle} (${refId})`,
                    attachmentNames: [],
                    triggerSource: 'lifecycle_pending',
                    candidateId: sub.candidateId ? String(sub.candidateId) : '',
                    studentId: sub.studentId || candDoc?.studentId || '',
                    testId: tid,
                    testTitle,
                    submissionId: sid,
                    submissionRefId: refId
                });
            }
        }

        // 1b. Expected eirf_filing (flagged unfiled active incident)
        const expectsEirfFiling = Boolean(sub.hasEirfFlag) &&
            !sub.emailsSent?.eirfFiling &&
            !sub.eirfNoticeEmailSent &&
            ['FLAGGED', 'GENERATING_QUESTIONS', 'QUESTIONS_GENERATED', 'SENDING_INVITE_EMAIL', 'AWAITING_EIRF', 'FAILED'].includes(sub.pipelineStatus) &&
            !['submitted', 'filed', 'approved', 'rejected', 'expired'].includes(sub.eirfStatus);

        if (expectsEirfFiling) {
            if (!unresolvedLogKeys.has(`eirf_filing:sub:${sid}`) && !unresolvedLogKeys.has(`eirf_filing:ref:${refId}`)) {
                syntheticPending.push({
                    _id: `pending_eirf_filing_${toBicsIdSafe(sid)}`,
                    isSyntheticPending: true,
                    emailType: 'eirf_filing',
                    status: 'pending',
                    transport: 'pending',
                    attempts: 0,
                    lastError: email ? 'Awaiting EIRF magic-link filing notice dispatch' : 'Candidate email missing or invalid',
                    lastAttemptAt: sub.submittedAt || sub.createdAt || new Date(),
                    recipientEmail: email,
                    recipientName: name,
                    subject: `URGENT: Emergency Incident Report Form (EIRF) Required - ${testTitle} (${refId})`,
                    attachmentNames: [],
                    triggerSource: 'lifecycle_pending',
                    candidateId: sub.candidateId ? String(sub.candidateId) : '',
                    studentId: sub.studentId || candDoc?.studentId || '',
                    testId: tid,
                    testTitle,
                    submissionId: sid,
                    submissionRefId: refId
                });
            }
        }

        // 1c. Expected otrf_sent (test verificationStatus === 'closed')
        if (testDoc && testDoc.verificationStatus === 'closed' && !sub.emailsSent?.otrfSent) {
            if (!unresolvedLogKeys.has(`otrf_sent:sub:${sid}`) && !unresolvedLogKeys.has(`otrf_sent:ref:${refId}`)) {
                syntheticPending.push({
                    _id: `pending_otrf_sent_${toBicsIdSafe(sid)}`,
                    isSyntheticPending: true,
                    emailType: 'otrf_sent',
                    status: 'pending',
                    transport: 'pending',
                    attempts: 0,
                    lastError: email ? 'Test closed; OTRF report dispatch pending' : 'Candidate email missing or invalid',
                    lastAttemptAt: testDoc.verificationClosedAt || sub.submittedAt || new Date(),
                    recipientEmail: email,
                    recipientName: name,
                    subject: `Online Test Report Form (OTRF): ${testTitle} (${refId})`,
                    attachmentNames: [`OTRF_${refId}.pdf`],
                    triggerSource: 'lifecycle_pending',
                    candidateId: sub.candidateId ? String(sub.candidateId) : '',
                    studentId: sub.studentId || candDoc?.studentId || '',
                    testId: tid,
                    testTitle,
                    submissionId: sid,
                    submissionRefId: refId
                });
            }
        }
    }

    // 2. Scan EIRF reports for unsent approved/rejected verdict emails
    for (const rep of reports) {
        const linkedSub = (rep.submissionId && subById.get(String(resolveToObjectId(String(rep.submissionId)) || rep.submissionId))) ||
            (rep.submissionRefId && subByRef.get(String(rep.submissionRefId))) ||
            null;
        if (rep.submissionId && !linkedSub) {
            // Check if submission existed & is deleted vs detached
            continue;
        }
        const candDoc = resolveCand({ candidateId: rep.candidateId || linkedSub?.candidateId, studentId: rep.studentId || linkedSub?.studentId });
        const email = extractValidCandidateEmail(candDoc, linkedSub) || '';
        const name = candDoc?.fullName || candDoc?.name || rep.candidateName || linkedSub?.candidateName || 'Candidate';
        const reportId = rep.reportId || String(rep._id || '');
        const tid = String(resolveToObjectId(String(rep.testId || linkedSub?.testId || '')) || rep.testId || '');
        const testTitle = rep.testTitle || linkedSub?.testTitle || testTitleMap.get(tid) || 'Examination';
        const sid = linkedSub ? String(linkedSub._id || linkedSub.id) : String(rep.submissionId || '');
        const refId = rep.submissionRefId || linkedSub?.submissionRefId || toBicsIdSafe(sid);

        if (rep.status === 'approved' && !rep.emailsSent?.approved) {
            if (!unresolvedLogKeys.has(`eirf_approved:rep:${reportId}`) && !unresolvedLogKeys.has(`eirf_approved:sub:${sid}`)) {
                syntheticPending.push({
                    _id: `pending_eirf_approved_${reportId}`,
                    isSyntheticPending: true,
                    emailType: 'eirf_approved',
                    status: 'pending',
                    transport: 'pending',
                    attempts: 0,
                    lastError: email ? 'Verdict approved; official email & PDF pending' : 'Candidate email missing or invalid',
                    lastAttemptAt: rep.reviewedAt || rep.updatedAt || new Date(),
                    recipientEmail: email,
                    recipientName: name,
                    subject: `EIRF Verdict Notice: APPROVED - ${testTitle} (${refId})`,
                    attachmentNames: [`EIRF_Verdict_${reportId}.pdf`],
                    triggerSource: 'lifecycle_pending',
                    candidateId: String(rep.candidateId || linkedSub?.candidateId || ''),
                    studentId: rep.studentId || linkedSub?.studentId || '',
                    testId: tid,
                    testTitle,
                    submissionId: sid,
                    submissionRefId: refId,
                    reportId
                });
            }
        } else if (rep.status === 'rejected' && !rep.emailsSent?.rejected) {
            if (!unresolvedLogKeys.has(`eirf_rejected:rep:${reportId}`) && !unresolvedLogKeys.has(`eirf_rejected:sub:${sid}`)) {
                syntheticPending.push({
                    _id: `pending_eirf_rejected_${reportId}`,
                    isSyntheticPending: true,
                    emailType: 'eirf_rejected',
                    status: 'pending',
                    transport: 'pending',
                    attempts: 0,
                    lastError: email ? 'Verdict rejected; official email & PDF pending' : 'Candidate email missing or invalid',
                    lastAttemptAt: rep.reviewedAt || rep.updatedAt || new Date(),
                    recipientEmail: email,
                    recipientName: name,
                    subject: `EIRF Verdict Notice: REJECTED - ${testTitle} (${refId})`,
                    attachmentNames: [`EIRF_Verdict_${reportId}.pdf`],
                    triggerSource: 'lifecycle_pending',
                    candidateId: String(rep.candidateId || linkedSub?.candidateId || ''),
                    studentId: rep.studentId || linkedSub?.studentId || '',
                    testId: tid,
                    testTitle,
                    submissionId: sid,
                    submissionRefId: refId,
                    reportId
                });
            }
        }
    }

    const serializedLogs = logs.map(l => serializeEmailLogEntry(l, testTitleMap));
    const serializedPending = syntheticPending.map(p => serializeEmailLogEntry(p, testTitleMap));
    const allItems = [...serializedPending, ...serializedLogs].sort((a, b) => {
        const aUnresolved = a.status === 'failed' || a.status === 'pending' ? 1 : 0;
        const bUnresolved = b.status === 'failed' || b.status === 'pending' ? 1 : 0;
        if (aUnresolved !== bUnresolved) return bUnresolved - aUnresolved;
        return new Date(b.lastAttemptAt || b.createdAt || 0) - new Date(a.lastAttemptAt || a.createdAt || 0);
    });

    const resolvedFilterTestId = testIdFilter && testIdFilter !== 'ALL'
        ? String(resolveToObjectId(String(testIdFilter)) || testIdFilter)
        : '';

    const summaryItems = resolvedFilterTestId
        ? allItems.filter(item => {
            const itemRawTid = String(resolveToObjectId(String(item.testId || '')) || item.testId || '');
            return itemRawTid === resolvedFilterTestId || item.testId === testIdFilter;
        })
        : allItems;

    const summary = {
        total: summaryItems.length,
        sent: summaryItems.filter(i => i.status === 'sent').length,
        failed: summaryItems.filter(i => i.status === 'failed').length,
        pending: summaryItems.filter(i => i.status === 'pending').length,
        simulated: summaryItems.filter(i => i.status === 'simulated').length,
        needsAttention: summaryItems.filter(i => i.status === 'failed' || i.status === 'pending').length,
        byType: EMAIL_TYPES.reduce((acc, type) => {
            acc[type] = summaryItems.filter(i => i.emailType === type).length;
            return acc;
        }, {})
    };

    const closedTests = tests
        .filter(t => t.verificationStatus === 'closed')
        .map(t => {
            const tid = String(t._id || t.id || '');
            const subsForTest = submissions.filter(s => {
                const stid = String(resolveToObjectId(String(s.testId || s.testConfigId || '')) || s.testId || '');
                return stid === tid;
            });
            const sentCount = subsForTest.filter(s => Boolean(s.emailsSent?.otrfSent)).length;
            const unsentSubs = subsForTest.filter(s => !s.emailsSent?.otrfSent);
            let failedOtrfCount = 0;
            let pendingOtrfCount = 0;
            for (const s of unsentSubs) {
                const sid = String(s._id || s.id || '');
                const ref = s.submissionRefId || '';
                if (unresolvedLogKeys.has(`otrf_sent:sub:${sid}`) || (ref && unresolvedLogKeys.has(`otrf_sent:ref:${ref}`))) {
                    failedOtrfCount++;
                } else {
                    pendingOtrfCount++;
                }
            }
            return {
                testId: toBicsIdSafe(tid),
                title: t.title || 'Closed Examination',
                courseCode: t.courseCode || t.code || '',
                totalSubmissions: subsForTest.length,
                sentCount,
                failedOtrfCount,
                pendingOtrfCount,
                actionNeededCount: unsentSubs.length
            };
        });

    const filterTests = tests.map(t => ({
        testId: toBicsIdSafe(String(t._id || t.id || '')),
        title: t.title || 'Examination',
        verificationStatus: t.verificationStatus || 'not_released'
    }));

    return { allItems, summary, closedTests, filterTests };
}

async function findLogById(rawLogId) {
    if (!rawLogId || String(rawLogId).startsWith('pending_')) return null;
    const resolved = String(resolveToObjectId(String(rawLogId)) || rawLogId);
    if (dbState.useMongo) {
        if (mongoose.Types.ObjectId.isValid(resolved)) {
            return await EmailLogModel.findById(resolved).lean();
        }
        return null;
    }
    const db = getJSONData();
    return (db.emailLogs || []).find(l =>
        String(l._id || l.id) === resolved ||
        String(l._id || l.id) === String(rawLogId) ||
        toBicsIdSafe(l._id || l.id) === String(rawLogId)
    ) || null;
}

async function findCandidateForOtpRetry(targetKey) {
    if (!targetKey) return null;
    const raw = String(targetKey).trim();
    const resolved = String(resolveToObjectId(raw) || raw);
    if (dbState.useMongo) {
        if (mongoose.Types.ObjectId.isValid(resolved)) {
            const byId = await CandidateModel.findById(resolved);
            if (byId) return byId;
        }
        return await CandidateModel.findOne({
            $or: [
                { studentId: raw },
                { username: raw },
                { personalEmail: raw },
                { email: raw },
                { 'registrationData.personalEmail': raw }
            ]
        });
    }
    const db = getJSONData();
    return (db.candidates || []).find(c =>
        String(c._id) === resolved ||
        String(c.id) === resolved ||
        String(c._id) === raw ||
        String(c.id) === raw ||
        String(c.studentId || '') === raw ||
        String(c.username || '') === raw ||
        String(c.personalEmail || '') === raw ||
        String(c.email || '') === raw ||
        String(c.registrationData?.personalEmail || '') === raw
    ) || null;
}

async function persistJsonCandidate(cand) {
    const db = getJSONData();
    db.candidates = db.candidates || [];
    const idx = db.candidates.findIndex(c => String(c._id || c.id) === String(cand._id || cand.id));
    if (idx !== -1) {
        db.candidates[idx] = cand;
        saveJSONData(db);
    }
}

async function dispatchSingleEmailRetry({ logId = '', emailType = '', targetId = '', force = true, purpose = '' } = {}) {
    const cleanLogId = (logId && !String(logId).startsWith('pending_')) ? String(logId).trim() : '';
    const existingLog = cleanLogId ? await findLogById(cleanLogId) : null;
    const type = String(emailType || existingLog?.emailType || '').trim();

    if (!EMAIL_TYPES.includes(type)) {
        return { httpStatus: 400, success: false, error: `Invalid emailType. Must be one of: ${EMAIL_TYPES.join(', ')}` };
    }

    const effectiveTarget = String(targetId || '').trim();
    const triggerOpts = {
        force: force !== false,
        triggerSource: 'admin_retry',
        retriedFromLogId: existingLog ? String(existingLog._id || existingLog.id || cleanLogId) : ''
    };

    if (type === 'verification_code') {
        const candLookup = effectiveTarget || existingLog?.candidateId || existingLog?.studentId || existingLog?.recipientEmail;
        const cand = await findCandidateForOtpRetry(candLookup);
        if (!cand) {
            return { httpStatus: 404, success: false, emailType: type, error: 'Candidate not found for verification code dispatch.' };
        }
        const candEmail = extractValidCandidateEmail(cand);
        if (!candEmail) {
            return { httpStatus: 400, success: false, emailType: type, error: 'Candidate email is missing or invalid.' };
        }

        const prevState = {
            verificationCode: cand.verificationCode || '',
            verificationCodeExpires: cand.verificationCodeExpires || null,
            verificationAttempts: cand.verificationAttempts || 0,
            lastVerificationCodeSentAt: cand.lastVerificationCodeSentAt || null
        };

        const nowMs = Date.now();
        const code = crypto.randomInt(100000, 1000000).toString();
        const expires = new Date(nowMs + 10 * 60 * 1000);
        cand.verificationCode = code;
        cand.verificationCodeExpires = expires;
        cand.verificationAttempts = 0;
        cand.lastVerificationCodeSentAt = new Date(nowMs);
        if (dbState.useMongo) await cand.save();
        else await persistJsonCandidate(cand);

        const result = await sendVerificationCodeEmail({
            candidateId: String(cand._id || cand.id || ''),
            studentId: cand.studentId || '',
            to: candEmail,
            fullName: cand.name || cand.registrationData?.preferredName || 'Candidate',
            code,
            purpose: String(purpose || existingLog?.purpose || 'Identity Verification').trim(),
            expiresMinutes: 10,
            requestedAt: new Date(nowMs),
            expiresAt: expires,
            triggerSource: 'admin_retry',
            retriedFromLogId: triggerOpts.retriedFromLogId
        });

        if (!result.success) {
            cand.verificationCode = prevState.verificationCode;
            cand.verificationCodeExpires = prevState.verificationCodeExpires;
            cand.verificationAttempts = prevState.verificationAttempts;
            cand.lastVerificationCodeSentAt = prevState.lastVerificationCodeSentAt;
            if (dbState.useMongo) await cand.save();
            else await persistJsonCandidate(cand);

            return {
                httpStatus: 502,
                success: false,
                emailType: type,
                error: result.error || result.reason || 'Failed to dispatch verification code email',
                transport: result.transport || 'gmail_rest_api',
                logId: toBicsIdSafe(result.logId)
            };
        }

        return {
            httpStatus: 200,
            success: true,
            emailType: type,
            transport: result.transport || 'gmail_rest_api',
            simulated: Boolean(result.simulated),
            messageId: result.messageId || '',
            logId: toBicsIdSafe(result.logId),
            recipientEmail: candEmail
        };
    }

    let result;
    if (type === 'test_submitted') {
        const target = effectiveTarget || existingLog?.submissionId || existingLog?.submissionRefId;
        if (!target) return { httpStatus: 400, success: false, emailType: type, error: 'submissionId or targetId is required' };
        result = await sendTestSubmittedEmail(target, triggerOpts);
    } else if (type === 'eirf_filing') {
        const target = effectiveTarget || existingLog?.submissionId || existingLog?.submissionRefId;
        if (!target) return { httpStatus: 400, success: false, emailType: type, error: 'submissionId or targetId is required' };
        result = await sendEirfFilingNoticeEmail(target, triggerOpts);
    } else if (type === 'eirf_approved') {
        const target = effectiveTarget || existingLog?.reportId || existingLog?.submissionId || existingLog?.submissionRefId;
        if (!target) return { httpStatus: 400, success: false, emailType: type, error: 'reportId or targetId is required' };
        result = await sendEirfVerdictApprovedEmail(target, triggerOpts);
    } else if (type === 'eirf_rejected') {
        const target = effectiveTarget || existingLog?.reportId || existingLog?.submissionId || existingLog?.submissionRefId;
        if (!target) return { httpStatus: 400, success: false, emailType: type, error: 'reportId or targetId is required' };
        result = await sendEirfVerdictRejectedEmail(target, triggerOpts);
    } else if (type === 'otrf_sent') {
        const target = effectiveTarget || existingLog?.submissionId || existingLog?.submissionRefId;
        if (!target) return { httpStatus: 400, success: false, emailType: type, error: 'submissionId or targetId is required' };
        result = await sendOtrfEmail(target, triggerOpts);
    }

    if (!result) {
        return { httpStatus: 500, success: false, emailType: type, error: 'Email service returned empty response' };
    }

    const errText = result.error || result.reason || '';
    if (!result.success) {
        const isNotFound = /not found/i.test(errText);
        return {
            httpStatus: isNotFound ? 404 : 502,
            success: false,
            emailType: type,
            error: redactSecrets(errText || 'Email dispatch failed'),
            transport: result.transport || 'gmail_rest_api',
            logId: toBicsIdSafe(result.logId)
        };
    }

    return {
        httpStatus: 200,
        success: true,
        emailType: type,
        transport: result.transport || 'gmail_rest_api',
        simulated: Boolean(result.simulated),
        skipped: Boolean(result.skipped),
        messageId: result.messageId || '',
        logId: toBicsIdSafe(result.logId)
    };
}

// 1. GET /api/admin/emails - Unified Email Center Feed across all 6 types + Pending Lifecycle Items
router.get('/', async (req, res) => {
    try {
        const emailType = String(req.query.emailType || 'ALL').trim();
        const status = String(req.query.status || 'ALL').trim();
        const testId = String(req.query.testId || 'ALL').trim();
        const search = String(req.query.search || '').trim().toLowerCase();
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));

        const { allItems, summary, closedTests, filterTests } = await loadUnifiedEmailState({ testIdFilter: testId });

        const resolvedTestFilter = (testId && testId !== 'ALL')
            ? String(resolveToObjectId(testId) || testId)
            : '';

        const filtered = allItems.filter(item => {
            if (emailType && emailType !== 'ALL' && item.emailType !== emailType) return false;
            if (status && status !== 'ALL' && item.status !== status) return false;
            if (resolvedTestFilter) {
                const itemRawTid = String(resolveToObjectId(String(item.testId || '')) || item.testId || '');
                if (item.testId !== testId && itemRawTid !== resolvedTestFilter) return false;
            }
            if (search) {
                const haystack = [
                    item.recipientName,
                    item.recipientEmail,
                    item.studentId,
                    item.submissionRefId,
                    item.reportId,
                    item.subject,
                    item.messageId,
                    item.lastError,
                    item.triggerSource,
                    item.purpose,
                    item.testTitle,
                    item.submissionId,
                    item.candidateId,
                    item.testId
                ].filter(Boolean).join(' ').toLowerCase();
                if (!haystack.includes(search)) return false;
            }
            return true;
        });

        const totalCount = filtered.length;
        const totalPages = Math.max(1, Math.ceil(totalCount / limit));
        const safePage = Math.min(page, totalPages);
        const offset = (safePage - 1) * limit;
        const items = filtered.slice(offset, offset + limit);

        return res.json({
            success: true,
            items,
            summary,
            closedTests,
            filterTests,
            emailTypes: EMAIL_TYPES,
            pagination: {
                page: safePage,
                limit,
                totalCount,
                totalPages,
                startIndex: totalCount > 0 ? offset + 1 : 0,
                endIndex: Math.min(offset + limit, totalCount)
            }
        });
    } catch (err) {
        console.error('[ADMIN_EMAILS] GET / error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// 2. POST /api/admin/emails/retry - Single unified dispatch / retry endpoint across all 6 types
router.post('/retry', async (req, res) => {
    try {
        const { logId, emailType, targetId, force, purpose } = req.body || {};
        if (!emailType && !logId) {
            return res.status(400).json({ success: false, error: 'emailType or logId is required' });
        }

        const outcome = await dispatchSingleEmailRetry({ logId, emailType, targetId, force, purpose });
        const { httpStatus, ...payload } = outcome;

        if (outcome.success) {
            await logSystemAction(
                req.user?.username || 'admin',
                'ADMIN_EMAIL_RETRY',
                `Dispatched [${outcome.emailType}] retry via ${outcome.transport} (target: ${toBicsIdSafe(targetId || '') || outcome.logId || 'n/a'}, messageId: ${outcome.messageId || 'n/a'})`,
                'info'
            );
        }

        return res.status(httpStatus).json(payload);
    } catch (err) {
        console.error('[ADMIN_EMAILS] POST /retry error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// 3. POST /api/admin/emails/retry-failed - Batch retry unresolved failed & pending items
router.post('/retry-failed', async (req, res) => {
    try {
        const { emailType = 'ALL', testId = 'ALL', limit = 25 } = req.body || {};
        const maxBatch = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));

        const { allItems } = await loadUnifiedEmailState({ testIdFilter: testId });
        const resolvedTestFilter = (testId && testId !== 'ALL')
            ? String(resolveToObjectId(String(testId)) || testId)
            : '';

        const candidates = allItems.filter(item => {
            if (item.status !== 'failed' && item.status !== 'pending') return false;
            if (emailType && emailType !== 'ALL' && item.emailType !== emailType) return false;
            if (resolvedTestFilter) {
                const itemRawTid = String(resolveToObjectId(String(item.testId || '')) || item.testId || '');
                if (item.testId !== testId && itemRawTid !== resolvedTestFilter) return false;
            }
            return true;
        }).slice(0, maxBatch);

        let succeeded = 0;
        let stillFailed = 0;
        const results = [];
        const pacingMs = (hasGmailCredentials() && process.env.NODE_ENV !== 'test') ? 120 : 0;

        for (let i = 0; i < candidates.length; i++) {
            const item = candidates[i];
            const outcome = await dispatchSingleEmailRetry({
                logId: item.logId || '',
                emailType: item.emailType,
                targetId: item.targetId,
                force: true,
                purpose: item.purpose || ''
            });
            if (outcome.success) succeeded++;
            else stillFailed++;

            results.push({
                emailType: item.emailType,
                targetId: toBicsIdSafe(item.targetId),
                logId: outcome.logId || item.logId || '',
                recipientEmail: item.recipientEmail || outcome.recipientEmail || '',
                success: Boolean(outcome.success),
                transport: outcome.transport || '',
                messageId: outcome.messageId || '',
                error: outcome.error || ''
            });

            if (pacingMs > 0 && i < candidates.length - 1) {
                await sleep(pacingMs);
            }
        }

        await logSystemAction(
            req.user?.username || 'admin',
            'ADMIN_EMAIL_BULK_RETRY',
            `Bulk retried ${candidates.length} unresolved email(s): ${succeeded} succeeded, ${stillFailed} still failed`,
            stillFailed > 0 ? 'warning' : 'info'
        );

        return res.json({
            success: true,
            retried: candidates.length,
            succeeded,
            stillFailed,
            results
        });
    } catch (err) {
        console.error('[ADMIN_EMAILS] POST /retry-failed error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// 4. POST /api/admin/emails/dispatch-otrf/:testId - Trigger/retry pending OTRF batch for a closed test
router.post('/dispatch-otrf/:testId', async (req, res) => {
    try {
        const rawTestId = String(req.params.testId || '').trim();
        const resolvedId = String(resolveToObjectId(rawTestId) || rawTestId);

        let testDoc = null;
        if (dbState.useMongo) {
            if (mongoose.Types.ObjectId.isValid(resolvedId)) {
                testDoc = await TestConfigModel.findOne({ _id: resolvedId, isDeleted: { $ne: true } }).lean();
            }
        } else {
            const db = getJSONData();
            testDoc = (db.tests || []).find(t =>
                !t.isDeleted &&
                (String(t._id || t.id) === resolvedId || String(t._id || t.id) === rawTestId)
            ) || null;
        }

        if (!testDoc) {
            return res.status(404).json({ success: false, error: 'Test configuration not found.' });
        }

        if (testDoc.verificationStatus !== 'closed') {
            return res.status(400).json({
                success: false,
                error: `OTRF batch dispatch requires verificationStatus === 'closed' (current: '${testDoc.verificationStatus || 'not_released'}').`
            });
        }

        const canonicalTestId = String(testDoc._id || testDoc.id || resolvedId);
        const batchResult = await dispatchOtrfBatchForClosedTest(canonicalTestId, {
            triggerSource: 'admin_email_center_batch'
        });

        await logSystemAction(
            req.user?.username || 'admin',
            'ADMIN_OTRF_BATCH_DISPATCH',
            `Dispatched OTRF batch for closed test "${testDoc.title || canonicalTestId}" (${toBicsIdSafe(canonicalTestId)}): ${batchResult.dispatched} sent, ${batchResult.failed} failed`,
            batchResult.failed > 0 ? 'warning' : 'info'
        );

        return res.json({
            success: true,
            testId: toBicsIdSafe(canonicalTestId),
            testTitle: testDoc.title || '',
            ...batchResult
        });
    } catch (err) {
        console.error('[ADMIN_EMAILS] POST /dispatch-otrf/:testId error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
