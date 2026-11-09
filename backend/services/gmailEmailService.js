/**
 * BICS Transactional & Security Email Engine (Google Gmail REST API over HTTPS port 443)
 * Institutional Sender: Department of Examination, BICS <noreply.bicsportal@gmail.com>
 *
 * Operates strictly over HTTPS port 443 via Gmail REST API (no SMTP, Nodemailer, Brevo, or EmailJS)
 * for full compatibility with Render free tier and enterprise auditability.
 *
 * Manages all 6 canonical BICS email workflows:
 * 1. verification_code - 6-digit OTP security verification (Hall Ticket Step 4 & Password Reset)
 * 2. test_submitted    - Submission confirmation (unflagged immediately, or deferred if flagged)
 * 3. eirf_filing       - Emergency Incident Report filing notice (45-min magic link)
 * 4. eirf_approved     - EIRF verdict approval (restored score, official 2-page verdict PDF attached)
 * 5. eirf_rejected     - EIRF verdict rejection (sanction upheld, final & binding, 2-page PDF attached)
 * 6. otrf_sent         - Online Test Report Form (toggled to 'closed', official OTRF PDF attached)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { TestSubmissionModel } = require('../models/TestSubmission');
const { EIRFReportModel } = require('../models/EIRFReport');
const { CandidateModel } = require('../models/Candidate');
const { TestConfigModel } = require('../models/TestConfig');
const { ConfigModel } = require('../models/Config');
const { EmailLogModel } = require('../models/EmailLog');
const { generateEirfVerdictPdfBuffer, generateDigitalVerdictHash } = require('./pdf/eirfVerdictPdf');
const {
    generateOtrfReportPdfBuffer,
    resolveOtrfArtifactMeta,
    persistOtrfPdfArtifact
} = require('./pdf/otrfReportPdf');
const { toBicsId, resolveToObjectId } = require('../utils/bicsId');
const { dbState, getJSONData, saveJSONData } = require('../config/db');
const { logSystemAction } = require('../utils/logger');

const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const SENDER_EMAIL = process.env.GMAIL_SENDER_EMAIL || 'noreply.bicsportal@gmail.com';
const SENDER_NAME = process.env.GMAIL_SENDER_NAME || 'Department of Examination, BICS';

const HTTP_TIMEOUT_MS = 15000;
const MAX_TRANSPORT_ATTEMPTS = 3;
const EMAIL_ADDRESS_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;

// Single-flight OAuth2 cache and refresh mutex
let cachedAccessToken = null;
let tokenExpiresAt = 0;
let inFlightTokenRefresh = null;

// In-process per-record claim mutex to prevent concurrent double sends
const inFlightEmailClaims = new Map();
const inFlightOtrfBatches = new Map();

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProdRuntime() {
    return process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER) || Boolean(process.env.VERCEL);
}

function hasGmailCredentials() {
    return Boolean(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN);
}

function resetGmailTokenCache() {
    cachedAccessToken = null;
    tokenExpiresAt = 0;
}

function isValidEmailAddress(email) {
    if (!email || typeof email !== 'string') return false;
    const trimmed = email.trim();
    if (!trimmed || trimmed.length > 254 || /[\r\n\0]/.test(trimmed)) return false;
    if (trimmed.includes('..')) return false;
    const [local] = trimmed.split('@');
    if (!local || local.startsWith('.') || local.endsWith('.') || local.length > 64) return false;
    return EMAIL_ADDRESS_REGEX.test(trimmed);
}

function extractValidCandidateEmail(cand, sub = null) {
    const candidates = [
        cand?.registrationData?.personalEmail,
        cand?.personalEmail,
        cand?.email,
        cand?.registrationData?.collegeEmail,
        sub?.candidateEmail,
        sub?.personalEmail,
        (typeof cand?.username === 'string' && isValidEmailAddress(cand.username.trim())) ? cand.username.trim() : null,
        (typeof cand?.studentId === 'string' && isValidEmailAddress(cand.studentId.trim())) ? cand.studentId.trim() : null
    ];
    for (const raw of candidates) {
        if (typeof raw === 'string') {
            const trimmed = raw.trim();
            if (isValidEmailAddress(trimmed)) {
                return trimmed;
            }
        }
    }
    return null;
}

function resolvePortalBaseUrl() {
    const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);
    const defaultPortalUrl = isProd ? 'https://bicsportal.netlify.app' : 'http://localhost:5174';
    return (process.env.PORTAL_URL || process.env.DASHBOARD_URL || process.env.FRONTEND_URL || process.env.BASE_URL || defaultPortalUrl).replace(/\/+$/, '');
}

/**
 * Retrieves a Google OAuth2 access token with single-flight refresh protection.
 * Returns null if Gmail OAuth credentials are not configured.
 */
async function getGmailAccessToken({ forceRefresh = false } = {}) {
    if (!hasGmailCredentials()) {
        return null;
    }

    if (forceRefresh) {
        resetGmailTokenCache();
    } else if (cachedAccessToken && Date.now() < tokenExpiresAt - 60000) {
        return cachedAccessToken;
    }

    if (inFlightTokenRefresh) {
        return await inFlightTokenRefresh;
    }

    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

    inFlightTokenRefresh = (async () => {
        try {
            const params = new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
            });

            const fetchOpts = {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString()
            };
            if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
                fetchOpts.signal = AbortSignal.timeout(HTTP_TIMEOUT_MS);
            }

            const response = await fetch(GOOGLE_TOKEN_URL, fetchOpts);
            if (!response.ok) {
                const errText = await response.text().catch(() => '');
                throw new Error(`Google OAuth token refresh failed (HTTP ${response.status}): ${errText}`);
            }

            const data = await response.json();
            if (!data?.access_token) {
                throw new Error('Google OAuth token refresh response omitted access_token');
            }
            cachedAccessToken = data.access_token;
            tokenExpiresAt = Date.now() + (Number(data.expires_in) || 3600) * 1000;
            return cachedAccessToken;
        } catch (err) {
            resetGmailTokenCache();
            console.error(`[GMAIL_API_AUTH_ERROR] ${err.message}`);
            throw err;
        } finally {
            inFlightTokenRefresh = null;
        }
    })();

    return await inFlightTokenRefresh;
}

function stripHeaderControlChars(value) {
    return String(value ?? '').replace(/[\r\n\0]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function encodeRfc2047Word(text) {
    return `=?UTF-8?B?${Buffer.from(String(text || ''), 'utf8').toString('base64')}?=`;
}

function formatMailboxAddress(rawAddress) {
    const clean = stripHeaderControlChars(rawAddress);
    if (!clean) return '';
    const angleMatch = clean.match(/^(.*?)<([^<>]+)>$/);
    if (angleMatch) {
        let displayName = angleMatch[1].trim();
        const emailAddr = angleMatch[2].trim();
        if (displayName.startsWith('"') && displayName.endsWith('"') && displayName.length >= 2) {
            displayName = displayName.slice(1, -1).replace(/\\"/g, '"').trim();
        }
        if (!displayName) return emailAddr;
        if (/[^\x20-\x7E]/.test(displayName)) {
            return `${encodeRfc2047Word(displayName)} <${emailAddr}>`;
        }
        return `"${displayName.replace(/["\\]/g, '')}" <${emailAddr}>`;
    }
    return clean;
}

function wrapBase64(b64) {
    const compact = String(b64 || '').replace(/\s+/g, '');
    if (!compact) return '';
    return compact.replace(/(.{76})/g, '$1\r\n').replace(/\r\n$/, '');
}

function derivePlainTextFromHtml(html) {
    return String(html || '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|tr|h1|h2|h3|h4|li)>/gi, '\n')
        .replace(/<td[^>]*>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&rarr;/gi, '->')
        .replace(/&copy;/gi, '(c)')
        .replace(/&#10003;/g, '[OK]')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Builds an RFC 2045 / RFC 2822 MIME multipart/mixed message containing:
 * - Nested multipart/alternative (UTF-8 Base64 wrapped text/plain + text/html)
 * - 76-char CRLF-wrapped Base64 binary attachments (PDF buffers)
 * Encodes the entire raw message to RFC 4648 Base64URL for the Gmail REST API.
 */
function buildMimeMessage({ from, to, subject, html, text, attachments = [] }) {
    const uniq = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const mixedBoundary = `----=_Mixed_${uniq}`;
    const altBoundary = `----=_Alt_${uniq}`;
    const nl = '\r\n';

    const safeFrom = formatMailboxAddress(from);
    const safeTo = formatMailboxAddress(to);
    const safeSubject = stripHeaderControlChars(subject);
    const plainText = text ? String(text) : derivePlainTextFromHtml(html);

    const mime = [];
    mime.push(`From: ${safeFrom}`);
    mime.push(`To: ${safeTo}`);
    mime.push(`Subject: ${encodeRfc2047Word(safeSubject)}`);
    mime.push('MIME-Version: 1.0');
    mime.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
    mime.push('');

    // Multipart alternative sibling container
    mime.push(`--${mixedBoundary}`);
    mime.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    mime.push('');

    // Plain-text sibling
    mime.push(`--${altBoundary}`);
    mime.push('Content-Type: text/plain; charset=UTF-8');
    mime.push('Content-Transfer-Encoding: base64');
    mime.push('');
    mime.push(wrapBase64(Buffer.from(plainText, 'utf8').toString('base64')));
    mime.push('');

    // HTML body
    mime.push(`--${altBoundary}`);
    mime.push('Content-Type: text/html; charset=UTF-8');
    mime.push('Content-Transfer-Encoding: base64');
    mime.push('');
    mime.push(wrapBase64(Buffer.from(String(html || ''), 'utf8').toString('base64')));
    mime.push('');

    mime.push(`--${altBoundary}--`);
    mime.push('');

    // Attachments
    for (const att of (attachments || [])) {
        const safeFilename = stripHeaderControlChars(att.name || att.filename || 'document.pdf').replace(/["\\;]/g, '_');
        const contentType = stripHeaderControlChars(att.contentType || 'application/pdf');
        let base64Data = '';

        if (Buffer.isBuffer(att.content)) {
            base64Data = att.content.toString('base64');
        } else if (typeof att.content === 'string') {
            base64Data = att.content.startsWith('data:') ? att.content.split(',')[1] : att.content;
        }

        mime.push(`--${mixedBoundary}`);
        mime.push(`Content-Type: ${contentType}; name="${safeFilename}"`);
        mime.push(`Content-Disposition: attachment; filename="${safeFilename}"`);
        mime.push('Content-Transfer-Encoding: base64');
        mime.push('');
        mime.push(wrapBase64(base64Data));
        mime.push('');
    }

    mime.push(`--${mixedBoundary}--`);
    mime.push('');

    const rawRfc822 = mime.join(nl);
    return Buffer.from(rawRfc822, 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function sanitizeLogSubject(subject) {
    return stripHeaderControlChars(subject).replace(/([?&]token=)[^&\s]+/gi, '$1[REDACTED]');
}

/**
 * Dispatches an email via the official Google Gmail REST API over HTTPS port 443.
 *
 * Truthfulness & Fail-Loud Contract:
 * - Invalid/missing recipient email -> returns { success: false, transport: 'validation', reason }
 * - If Gmail OAuth credentials are configured -> uses Gmail REST API with single 401 refresh +
 *   bounded 429/5xx/network retries. NEVER falls back to console_audit on error.
 * - If Gmail OAuth credentials are missing:
 *   * Production -> fails loudly { success: false, transport: 'unconfigured' }
 *   * Non-production (dev/test) -> simulates dispatch { success: true, simulated: true, transport: 'console_audit' }
 */
async function sendGmailRestEmail({ to, toName, subject, htmlContent, textContent, attachments = [], tags = [] }) {
    const cleanTo = typeof to === 'string' ? to.trim() : '';
    if (!isValidEmailAddress(cleanTo)) {
        const msg = 'Candidate email missing or invalid';
        console.warn(`[GMAIL_EMAIL_SERVICE] Aborting email dispatch: ${msg} (raw="${String(to || '')}")`);
        return {
            success: false,
            skipped: false,
            transport: 'validation',
            statusCode: 400,
            attempts: 0,
            error: msg,
            reason: msg
        };
    }

    if (!hasGmailCredentials()) {
        if (isProdRuntime()) {
            const errMsg = 'Gmail OAuth credentials are not configured in production.';
            console.error(`[GMAIL_EMAIL_SERVICE] ${errMsg}`);
            return {
                success: false,
                skipped: false,
                transport: 'unconfigured',
                statusCode: null,
                attempts: 0,
                error: errMsg,
                reason: errMsg
            };
        }

        console.warn('[GMAIL_EMAIL_SERVICE] Gmail OAuth credentials not configured (non-prod). Logging simulated dispatch.');
        console.log(`\n==================================================`);
        console.log(`[GMAIL REST API AUDIT - DISPATCH SIMULATED]`);
        console.log(`Sender: ${SENDER_NAME} <${SENDER_EMAIL}>`);
        console.log(`Recipient: ${cleanTo} (${toName || 'Candidate'})`);
        console.log(`Subject: ${sanitizeLogSubject(subject)}`);
        console.log(`Attachments: ${(attachments || []).map(a => a.name || a.filename).join(', ') || 'None'}`);
        console.log(`==================================================\n`);
        return {
            success: true,
            simulated: true,
            transport: 'console_audit',
            statusCode: null,
            attempts: 1,
            messageId: `audit_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`
        };
    }

    const raw = buildMimeMessage({
        from: `"${SENDER_NAME}" <${SENDER_EMAIL}>`,
        to: toName ? `"${toName}" <${cleanTo}>` : cleanTo,
        subject,
        html: htmlContent,
        text: textContent,
        attachments
    });

    const isTestEnv = process.env.NODE_ENV === 'test';
    let attempts = 0;
    let didForceRefreshAfter401 = false;
    let lastError = 'Unknown Gmail API error';
    let lastStatusCode = null;

    while (attempts < MAX_TRANSPORT_ATTEMPTS) {
        attempts += 1;
        try {
            const accessToken = await getGmailAccessToken({ forceRefresh: didForceRefreshAfter401 && attempts > 1 });
            if (!accessToken) {
                lastError = 'Unable to obtain Google OAuth2 access token';
                break;
            }

            const fetchOpts = {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ raw })
            };
            if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
                fetchOpts.signal = AbortSignal.timeout(HTTP_TIMEOUT_MS);
            }

            const response = await fetch(GMAIL_SEND_URL, fetchOpts);
            lastStatusCode = response.status;

            if (response.ok) {
                const resJson = await response.json();
                console.log(`[GMAIL_API_SUCCESS] Dispatched to ${cleanTo} (MessageId: ${resJson.id}, attempts: ${attempts})`);
                return {
                    success: true,
                    simulated: false,
                    transport: 'gmail_rest_api',
                    statusCode: response.status,
                    attempts,
                    messageId: resJson.id || ''
                };
            }

            const errText = await response.text().catch(() => '');
            lastError = `Gmail API HTTP ${response.status}${errText ? `: ${errText}` : ''}`;

            // Single 401 token invalidation & forced refresh retry
            if (response.status === 401 && !didForceRefreshAfter401) {
                didForceRefreshAfter401 = true;
                resetGmailTokenCache();
                console.warn('[GMAIL_API_WARN] Received 401 Unauthorized; invalidating cached token and refreshing once.');
                continue;
            }

            // Transient 429 or 5xx backoff retry
            if ((response.status === 429 || response.status >= 500) && attempts < MAX_TRANSPORT_ATTEMPTS) {
                const retryAfterHeader = response.headers && typeof response.headers.get === 'function'
                    ? response.headers.get('retry-after')
                    : null;
                let delayMs = isTestEnv ? (30 * attempts) : (350 * Math.pow(2, attempts - 1));
                if (retryAfterHeader) {
                    const parsedSec = Number(retryAfterHeader);
                    if (Number.isFinite(parsedSec) && parsedSec > 0) {
                        delayMs = Math.min(parsedSec * 1000, isTestEnv ? 120 : 5000);
                    }
                }
                console.warn(`[GMAIL_API_RETRY] Status ${response.status}; retrying attempt ${attempts + 1}/${MAX_TRANSPORT_ATTEMPTS} in ${delayMs}ms`);
                await sleep(delayMs);
                continue;
            }

            // Deterministic 4xx or exhausted retries
            console.error(`[GMAIL_API_ERROR] ${lastError}`);
            break;
        } catch (err) {
            lastError = err?.message || String(err);
            lastStatusCode = lastStatusCode || null;
            if (attempts < MAX_TRANSPORT_ATTEMPTS) {
                const delayMs = isTestEnv ? (30 * attempts) : (350 * Math.pow(2, attempts - 1));
                console.warn(`[GMAIL_API_RETRY] Network/Auth error (${lastError}); retrying attempt ${attempts + 1}/${MAX_TRANSPORT_ATTEMPTS} in ${delayMs}ms`);
                await sleep(delayMs);
                continue;
            }
            console.error(`[GMAIL_API_ERROR] Dispatch failed after ${attempts} attempt(s): ${lastError}`);
        }
    }

    return {
        success: false,
        simulated: false,
        transport: 'gmail_rest_api',
        statusCode: lastStatusCode,
        attempts,
        error: lastError,
        reason: lastError
    };
}

/**
 * Formats a Date object or timestamp into standard IST string representation.
 */
function formatISTDate(dateVal) {
    try {
        const d = dateVal ? new Date(dateVal) : new Date();
        if (isNaN(d.getTime())) return new Date().toISOString();
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
}

function escapeHtml(val) {
    return String(val)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Loads an HTML email template and safely merges HTML-escaped dynamic variables
 * using replacement functions (preventing JS $&, $1, $$ replacement injection).
 */
function renderEmailTemplate(templateName, variables = {}) {
    const templatePath = path.join(__dirname, '..', 'templates', 'emails', `${templateName}.html`);
    if (!fs.existsSync(templatePath)) {
        throw new Error(`Email template not found at: ${templatePath}`);
    }
    let html = fs.readFileSync(templatePath, 'utf8');

    for (const [key, value] of Object.entries(variables)) {
        const rawVal = (value !== undefined && value !== null && String(value).trim() !== '') ? String(value) : 'N/A';
        const safeVal = escapeHtml(rawVal);
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
        html = html.replace(regex, () => safeVal);
    }
    return html;
}

async function withEmailClaim(claimKey, fn) {
    if (!claimKey) return await fn();
    if (inFlightEmailClaims.has(claimKey)) {
        return await inFlightEmailClaims.get(claimKey);
    }
    const promise = (async () => await fn())();
    inFlightEmailClaims.set(claimKey, promise);
    try {
        return await promise;
    } finally {
        inFlightEmailClaims.delete(claimKey);
    }
}

async function findSubmissionByAnyId(idOrDoc) {
    if (!idOrDoc) return null;
    const isBsonOid = (idOrDoc instanceof mongoose.Types.ObjectId) || idOrDoc._bsontype === 'ObjectId';
    if (typeof idOrDoc === 'object' && !isBsonOid && (idOrDoc._id || idOrDoc.id) && (idOrDoc.testId || idOrDoc.studentId || idOrDoc.status || idOrDoc.pipelineStatus)) {
        if (idOrDoc.isDeleted) return null;
        return idOrDoc;
    }
    const raw = String(isBsonOid ? idOrDoc : (idOrDoc?._id || idOrDoc?.id || idOrDoc)).trim();
    const resolved = resolveToObjectId(raw);
    if (dbState.useMongo) {
        if (mongoose.Types.ObjectId.isValid(resolved)) {
            const byId = await TestSubmissionModel.findOne({ _id: resolved, isDeleted: { $ne: true } });
            if (byId) return byId;
        }
        return await TestSubmissionModel.findOne({
            isDeleted: { $ne: true },
            $or: [{ submissionRefId: raw }, { eirfReportId: raw }]
        });
    }
    const db = getJSONData();
    return (db.testSubmissions || []).find(s =>
        !s.isDeleted && (
            String(s._id || s.id) === String(resolved) ||
            String(s._id || s.id) === raw ||
            toBicsId(s._id || s.id) === raw ||
            (s.submissionRefId && String(s.submissionRefId) === raw) ||
            (s.eirfReportId && String(s.eirfReportId) === raw)
        )
    ) || null;
}

async function findReportByAnyId(reportIdOrDoc) {
    if (!reportIdOrDoc) return null;
    const isBsonOid = (reportIdOrDoc instanceof mongoose.Types.ObjectId) || reportIdOrDoc._bsontype === 'ObjectId';
    if (typeof reportIdOrDoc === 'object' && !isBsonOid && reportIdOrDoc.reportId) {
        return reportIdOrDoc;
    }
    const raw = String(isBsonOid ? reportIdOrDoc : (reportIdOrDoc?.reportId || reportIdOrDoc?._id || reportIdOrDoc?.id || reportIdOrDoc)).trim();
    const resolved = resolveToObjectId(raw);
    if (dbState.useMongo) {
        const ors = [{ reportId: raw }, { submissionId: raw }, { bicsId: raw }, { submissionRefId: raw }];
        if (mongoose.Types.ObjectId.isValid(resolved)) {
            ors.push({ _id: resolved }, { submissionId: resolved });
        }
        return await EIRFReportModel.findOne({ $or: ors });
    }
    const db = getJSONData();
    return (db.eirfReports || []).find(r =>
        (r.reportId && String(r.reportId) === raw) ||
        (r._id && (String(r._id) === raw || String(r._id) === String(resolved))) ||
        (r.submissionId && (String(r.submissionId) === raw || String(r.submissionId) === String(resolved))) ||
        (r.bicsId && String(r.bicsId) === raw) ||
        (r.submissionRefId && String(r.submissionRefId) === raw)
    ) || null;
}

async function resolveCandidateInfo(candidateIdOrStudentId, fallbackName = 'Candidate', sub = null) {
    let fullName = fallbackName || 'Candidate';
    let studentId = '';
    let candDoc = null;

    if (candidateIdOrStudentId) {
        if (dbState.useMongo) {
            try {
                let cand = null;
                const resolvedCand = resolveToObjectId(String(candidateIdOrStudentId));
                if (mongoose.Types.ObjectId.isValid(resolvedCand)) {
                    cand = await CandidateModel.findById(resolvedCand).lean();
                }
                if (!cand) {
                    cand = await CandidateModel.findOne({ studentId: String(candidateIdOrStudentId) }).lean();
                }
                if (!cand) {
                    cand = await CandidateModel.findOne({ username: String(candidateIdOrStudentId) }).lean();
                }
                if (cand) {
                    candDoc = cand;
                    fullName = cand.fullName || cand.name || cand.registrationData?.preferredName || fallbackName;
                    studentId = cand.studentId || '';
                }
            } catch (e) {
                console.warn('[GMAIL_SERVICE] Error resolving candidate Mongoose doc:', e.message);
            }
        } else {
            try {
                const db = getJSONData();
                const resolvedCand = resolveToObjectId(String(candidateIdOrStudentId || ''));
                const cand = (db.candidates || []).find(c =>
                    String(c._id) === String(candidateIdOrStudentId) ||
                    String(c._id) === String(resolvedCand) ||
                    String(c.id) === String(candidateIdOrStudentId) ||
                    String(c.studentId) === String(candidateIdOrStudentId) ||
                    String(c.username) === String(candidateIdOrStudentId)
                );
                if (cand) {
                    candDoc = cand;
                    fullName = cand.fullName || cand.name || cand.registrationData?.preferredName || fallbackName;
                    studentId = cand.studentId || '';
                }
            } catch (e) {}
        }
    }

    const email = extractValidCandidateEmail(candDoc, sub);
    return {
        email,
        emailError: email ? '' : 'Candidate email missing or invalid',
        fullName,
        studentId: studentId || sub?.studentId || '',
        candDoc
    };
}

async function resolveSystemConfig() {
    try {
        if (dbState.useMongo) {
            return await ConfigModel.findOne().lean();
        }
        const db = getJSONData();
        return db?.config || null;
    } catch (e) {
        return null;
    }
}

async function resolveTestInfo(testId, sub = null, systemConfig = null) {
    let testDoc = null;

    if (testId) {
        if (dbState.useMongo) {
            try {
                const resolvedTestId = resolveToObjectId(String(testId));
                if (mongoose.Types.ObjectId.isValid(resolvedTestId)) {
                    testDoc = await TestConfigModel.findById(resolvedTestId)
                        .select('title courseName courseCode course totalMarks maxMarks academicTerm subject code marks questions duration verificationClosedAt verificationStatus')
                        .lean();
                }
            } catch (e) {}
        } else {
            try {
                const db = getJSONData();
                const resolvedTestId = resolveToObjectId(String(testId || ''));
                testDoc = (db.tests || []).find(t =>
                    String(t._id) === String(testId) ||
                    String(t._id) === String(resolvedTestId) ||
                    String(t.id) === String(testId) ||
                    String(t.id) === String(resolvedTestId)
                ) || null;
            } catch (e) {}
        }
    }

    const testTitle = testDoc?.title || sub?.testTitle || 'Details not available';
    const courseName = testDoc?.courseName || testDoc?.course || testDoc?.subject || sub?.course || 'Details not available';
    const courseCode = testDoc?.courseCode || testDoc?.code || sub?.courseCode || 'Details not available';
    const maxMarks = testDoc?.marks || testDoc?.totalMarks || testDoc?.maxMarks || sub?.evaluation?.maxScore || 'Details not available';
    const academicTerm = testDoc?.academicTerm || systemConfig?.academicTerm || '2026-27 (Semester I)';

    return { testTitle, courseName, courseCode, maxMarks, academicTerm, testDoc };
}

/**
 * Records or updates an EmailLog entry in MongoDB or db.json without ever storing OTP or magic-link secrets.
 */
async function recordEmailLog(entry = {}) {
    try {
        const now = new Date();
        const normalizedType = String(entry.emailType || '').trim();
        const status = entry.status || (entry.success ? (entry.simulated ? 'simulated' : 'sent') : 'failed');
        const payload = {
            emailType: normalizedType,
            status,
            transport: entry.transport || (status === 'simulated' ? 'console_audit' : 'gmail_rest_api'),
            statusCode: entry.statusCode ?? null,
            messageId: entry.messageId || '',
            attempts: Math.max(1, Number(entry.attempts || 1)),
            lastError: status === 'failed' ? String(entry.lastError || entry.error || entry.reason || 'Dispatch failed') : '',
            lastAttemptAt: now,
            sentAt: (status === 'sent' || status === 'simulated') ? now : null,
            recipientEmail: String(entry.recipientEmail || ''),
            recipientName: String(entry.recipientName || ''),
            subject: sanitizeLogSubject(entry.subject || ''),
            attachmentNames: Array.isArray(entry.attachmentNames) ? entry.attachmentNames.map(String) : [],
            triggerSource: String(entry.triggerSource || 'system'),
            purpose: String(entry.purpose || ''),
            candidateId: entry.candidateId ? String(entry.candidateId) : '',
            studentId: entry.studentId ? String(entry.studentId) : '',
            testId: entry.testId ? String(entry.testId) : '',
            submissionId: entry.submissionId ? String(entry.submissionId) : '',
            submissionRefId: entry.submissionRefId ? String(entry.submissionRefId) : '',
            reportId: entry.reportId ? String(entry.reportId) : '',
            retriedFromLogId: entry.retriedFromLogId ? String(entry.retriedFromLogId) : ''
        };

        const resolvePriorId = entry.retriedFromLogId ? resolveToObjectId(String(entry.retriedFromLogId)) : '';

        if (dbState.useMongo) {
            if (resolvePriorId && mongoose.Types.ObjectId.isValid(resolvePriorId)) {
                const updated = await EmailLogModel.findByIdAndUpdate(
                    resolvePriorId,
                    {
                        $inc: { attempts: 1 },
                        $set: {
                            status: payload.status,
                            transport: payload.transport,
                            statusCode: payload.statusCode,
                            messageId: payload.messageId,
                            lastError: payload.lastError,
                            lastAttemptAt: now,
                            ...(payload.sentAt ? { sentAt: payload.sentAt } : {}),
                            recipientEmail: payload.recipientEmail,
                            recipientName: payload.recipientName,
                            subject: payload.subject,
                            attachmentNames: payload.attachmentNames,
                            triggerSource: payload.triggerSource
                        }
                    },
                    { new: true }
                );
                if (updated) return String(updated._id);
            }

            if ((status === 'sent' || status === 'simulated') && normalizedType !== 'verification_code') {
                const matchCriteria = { emailType: normalizedType, status: 'failed' };
                if (payload.reportId) matchCriteria.reportId = payload.reportId;
                else if (payload.submissionId) matchCriteria.submissionId = payload.submissionId;

                if (matchCriteria.reportId || matchCriteria.submissionId) {
                    const resolvedPrior = await EmailLogModel.findOneAndUpdate(
                        matchCriteria,
                        {
                            $inc: { attempts: 1 },
                            $set: {
                                status: payload.status,
                                transport: payload.transport,
                                statusCode: payload.statusCode,
                                messageId: payload.messageId,
                                lastError: '',
                                lastAttemptAt: now,
                                sentAt: now,
                                recipientEmail: payload.recipientEmail,
                                recipientName: payload.recipientName,
                                subject: payload.subject,
                                attachmentNames: payload.attachmentNames,
                                triggerSource: payload.triggerSource
                            }
                        },
                        { sort: { lastAttemptAt: -1 }, new: true }
                    );
                    if (resolvedPrior) return String(resolvedPrior._id);
                }
            }

            const created = await EmailLogModel.create(payload);
            return String(created._id);
        }

        // Local JSON DB mode
        const db = getJSONData();
        db.emailLogs = db.emailLogs || [];

        if (resolvePriorId) {
            const idx = db.emailLogs.findIndex(l =>
                String(l._id || l.id) === String(resolvePriorId) ||
                toBicsId(String(l._id || l.id)) === String(entry.retriedFromLogId)
            );
            if (idx !== -1) {
                const prev = db.emailLogs[idx];
                db.emailLogs[idx] = {
                    ...prev,
                    status: payload.status,
                    transport: payload.transport,
                    statusCode: payload.statusCode,
                    messageId: payload.messageId,
                    attempts: (Number(prev.attempts) || 1) + 1,
                    lastError: payload.lastError,
                    lastAttemptAt: now.toISOString(),
                    sentAt: payload.sentAt ? payload.sentAt.toISOString() : prev.sentAt,
                    recipientEmail: payload.recipientEmail,
                    recipientName: payload.recipientName,
                    subject: payload.subject,
                    attachmentNames: payload.attachmentNames,
                    triggerSource: payload.triggerSource,
                    updatedAt: now.toISOString()
                };
                saveJSONData(db);
                return String(db.emailLogs[idx]._id);
            }
        }

        if ((status === 'sent' || status === 'simulated') && normalizedType !== 'verification_code') {
            const idx = db.emailLogs.findIndex(l =>
                l.emailType === normalizedType &&
                l.status === 'failed' &&
                ((payload.reportId && l.reportId === payload.reportId) ||
                 (payload.submissionId && l.submissionId === payload.submissionId))
            );
            if (idx !== -1) {
                const prev = db.emailLogs[idx];
                db.emailLogs[idx] = {
                    ...prev,
                    status: payload.status,
                    transport: payload.transport,
                    statusCode: payload.statusCode,
                    messageId: payload.messageId,
                    attempts: (Number(prev.attempts) || 1) + 1,
                    lastError: '',
                    lastAttemptAt: now.toISOString(),
                    sentAt: now.toISOString(),
                    recipientEmail: payload.recipientEmail,
                    recipientName: payload.recipientName,
                    subject: payload.subject,
                    attachmentNames: payload.attachmentNames,
                    triggerSource: payload.triggerSource,
                    updatedAt: now.toISOString()
                };
                saveJSONData(db);
                return String(db.emailLogs[idx]._id);
            }
        }

        const newId = new mongoose.Types.ObjectId().toString();
        const record = {
            _id: newId,
            ...payload,
            lastAttemptAt: now.toISOString(),
            sentAt: payload.sentAt ? payload.sentAt.toISOString() : null,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
        };
        db.emailLogs.push(record);
        if (db.emailLogs.length > 2000) {
            db.emailLogs = db.emailLogs.slice(-2000);
        }
        saveJSONData(db);
        return newId;
    } catch (err) {
        console.error('[EMAIL_LOG_ERROR]', err.message);
        return null;
    }
}

async function persistSubmissionEmailState({ sub, extraFields = {}, jsonMutator = null }) {
    if (!sub) return;
    const subIdStr = String(sub._id || sub.id || '');
    if (dbState.useMongo && mongoose.Types.ObjectId.isValid(sub._id)) {
        await TestSubmissionModel.updateOne(
            { _id: sub._id },
            { $set: extraFields }
        );
    } else if (subIdStr) {
        const db = getJSONData();
        const target = (db.testSubmissions || []).find(s => String(s._id || s.id) === subIdStr);
        if (target) {
            target.emailsSent = target.emailsSent || {};
            if (typeof jsonMutator === 'function') {
                jsonMutator(target);
            }
            saveJSONData(db);
        }
    }
}

async function persistReportEmailState({ report, extraFields = {}, jsonMutator = null }) {
    if (!report) return;
    const repId = report.reportId || String(report._id || '');
    if (dbState.useMongo) {
        const filter = report.reportId ? { reportId: report.reportId } : { _id: report._id };
        await EIRFReportModel.updateOne(filter, { $set: extraFields });
    } else {
        const db = getJSONData();
        const target = (db.eirfReports || []).find(r =>
            (report.reportId && r.reportId === report.reportId) ||
            (r._id && String(r._id) === String(repId))
        );
        if (target) {
            target.emailsSent = target.emailsSent || {};
            if (typeof jsonMutator === 'function') {
                jsonMutator(target);
            }
            saveJSONData(db);
        }
    }
}

function buildDiagnosticsFields(result, emailType) {
    const now = new Date();
    return {
        now,
        mongoSet: {
            'emailsSent.lastTransport': result.transport || 'gmail_rest_api',
            'emailsSent.lastMessageId': result.success ? (result.messageId || '') : '',
            'emailsSent.lastAttemptAt': now,
            'emailsSent.lastAttemptType': emailType,
            'emailsSent.lastError': result.success ? '' : String(result.error || result.reason || 'Dispatch failed')
        },
        applyJson(emailsSent) {
            emailsSent.lastTransport = result.transport || 'gmail_rest_api';
            emailsSent.lastMessageId = result.success ? (result.messageId || '') : '';
            emailsSent.lastAttemptAt = now.toISOString();
            emailsSent.lastAttemptType = emailType;
            emailsSent.lastError = result.success ? '' : String(result.error || result.reason || 'Dispatch failed');
        }
    };
}

/**
 * -----------------------------------------------------------------------------
 * 1. DISPATCH VERIFICATION CODE (OTP) EMAIL
 * -----------------------------------------------------------------------------
 * Trigger: Candidate Verification (Hall Ticket Step 4 / Password Reset) or Admin retry.
 */
async function sendVerificationCodeEmail({
    candidateId = '',
    studentId = '',
    to = '',
    fullName = 'Candidate',
    code = '',
    purpose = 'Identity Verification',
    expiresMinutes = 10,
    requestedAt = null,
    expiresAt = null,
    triggerSource = 'candidate_request',
    retriedFromLogId = ''
} = {}) {
    const now = requestedAt ? new Date(requestedAt) : new Date();
    const expiryDate = expiresAt ? new Date(expiresAt) : new Date(now.getTime() + expiresMinutes * 60 * 1000);
    const cleanPurpose = String(purpose || 'Identity Verification').trim();
    const cleanCode = String(code || '').trim();

    if (!cleanCode) {
        return { success: false, reason: 'Verification code is required', error: 'Verification code is required' };
    }

    const variables = {
        candidate_name: fullName || 'Candidate',
        student_id: studentId || 'Candidate',
        purpose: cleanPurpose,
        verification_code: cleanCode,
        requested_at: formatISTDate(now),
        expires_at: formatISTDate(expiryDate),
        expires_minutes: String(expiresMinutes)
    };

    const subject = `Security Verification Code (${cleanPurpose}) | BICS Preliminary Examinations 2026`;
    const htmlContent = renderEmailTemplate('verification_code', variables);

    const result = await sendGmailRestEmail({
        to,
        toName: fullName,
        subject,
        htmlContent,
        attachments: [],
        tags: ['bics-auth', 'verification-code']
    });

    const logId = await recordEmailLog({
        emailType: 'verification_code',
        ...result,
        recipientEmail: to || '',
        recipientName: fullName || 'Candidate',
        subject,
        attachmentNames: [],
        triggerSource,
        purpose: cleanPurpose,
        candidateId: candidateId ? String(candidateId) : '',
        studentId: studentId || '',
        retriedFromLogId
    });

    if (!result.success) {
        logSystemAction('system', 'EMAIL_DISPATCH_FAILED', `[verification_code] Failed for ${studentId || candidateId}: ${result.error || result.reason}`, 'error').catch(() => {});
    }

    return { ...result, logId };
}

/**
 * -----------------------------------------------------------------------------
 * 2. DISPATCH TEST SUBMISSION CONFIRMATION EMAIL
 * -----------------------------------------------------------------------------
 * Trigger: Clean submission immediately, OR deferred after EIRF filed/expired.
 * Idempotency: emailsSent.testSubmitted === true (unless options.force === true)
 */
async function sendTestSubmittedEmail(submissionIdOrDoc, options = {}) {
    const sub = await findSubmissionByAnyId(submissionIdOrDoc);
    if (!sub) return { success: false, reason: 'Submission not found' };

    const subId = String(sub._id || sub.id || '');
    return await withEmailClaim(`${subId}:test_submitted`, async () => {
        // Reload fresh sub inside lock if not passed as live unsaved object
        const freshSub = (await findSubmissionByAnyId(subId)) || sub;
        if (!options.force && freshSub.emailsSent && freshSub.emailsSent.testSubmitted) {
            console.log(`[IDEMPOTENCY_GUARD] test_submitted email already sent for submission ${freshSub._id || freshSub.id}. Skipping.`);
            return { success: true, skipped: true, reason: 'Already sent' };
        }

        const systemConfig = options.systemConfig || await resolveSystemConfig();
        const candidate = await resolveCandidateInfo(freshSub.candidateId || freshSub.studentId, freshSub.candidateName, freshSub);
        const testInfo = await resolveTestInfo(freshSub.testId, freshSub, systemConfig);

        const testRefId = freshSub.submissionRefId || toBicsId(freshSub._id || freshSub.id);
        const testName = (freshSub.testTitle || testInfo.testTitle || 'Details not available');
        const startTime = formatISTDate(freshSub.startedAt || freshSub.createdAt);
        const submittedTime = formatISTDate(freshSub.submittedAt || freshSub.updatedAt || Date.now());

        const variables = {
            candidate_name: candidate.fullName,
            test_name: testName,
            test_ref_id: testRefId,
            course_name: testInfo.courseName,
            course_code: testInfo.courseCode,
            max_marks: testInfo.maxMarks,
            start_time: startTime,
            submitted_time: submittedTime
        };

        const subject = `Test Submission Confirmation: ${testName} (${testRefId}) | BICS Preliminary Examinations 2026`;
        const htmlContent = renderEmailTemplate('test_submitted', variables);

        const result = await sendGmailRestEmail({
            to: candidate.email,
            toName: candidate.fullName,
            subject,
            htmlContent,
            attachments: [],
            tags: ['bics-exam', 'test-submitted']
        });

        const diag = buildDiagnosticsFields(result, 'test_submitted');
        sub.emailsSent = sub.emailsSent || {};
        freshSub.emailsSent = freshSub.emailsSent || {};
        diag.applyJson(sub.emailsSent);
        diag.applyJson(freshSub.emailsSent);

        const mongoFields = { ...diag.mongoSet };
        if (result.success) {
            sub.emailsSent.testSubmitted = true;
            sub.emailsSent.testSubmittedAt = diag.now;
            freshSub.emailsSent.testSubmitted = true;
            freshSub.emailsSent.testSubmittedAt = diag.now;
            mongoFields['emailsSent.testSubmitted'] = true;
            mongoFields['emailsSent.testSubmittedAt'] = diag.now;
        }

        await persistSubmissionEmailState({
            sub: freshSub,
            extraFields: mongoFields,
            jsonMutator: (target) => {
                diag.applyJson(target.emailsSent);
                if (result.success) {
                    target.emailsSent.testSubmitted = true;
                    target.emailsSent.testSubmittedAt = diag.now.toISOString();
                }
            }
        });

        const logId = await recordEmailLog({
            emailType: 'test_submitted',
            ...result,
            recipientEmail: candidate.email || '',
            recipientName: candidate.fullName,
            subject,
            attachmentNames: [],
            triggerSource: options.triggerSource || 'submission_lifecycle',
            candidateId: freshSub.candidateId ? String(freshSub.candidateId) : '',
            studentId: candidate.studentId || freshSub.studentId || '',
            testId: freshSub.testId ? String(freshSub.testId) : '',
            submissionId: subId,
            submissionRefId: freshSub.submissionRefId || testRefId,
            retriedFromLogId: options.retriedFromLogId || ''
        });

        if (!result.success) {
            logSystemAction('system', 'EMAIL_DISPATCH_FAILED', `[test_submitted] Failed for ${testRefId}: ${result.error || result.reason}`, 'error').catch(() => {});
        }

        return { ...result, logId };
    });
}

/**
 * -----------------------------------------------------------------------------
 * 3. DISPATCH EMERGENCY INCIDENT REPORT FORM (EIRF) FILING NOTICE EMAIL
 * -----------------------------------------------------------------------------
 * Trigger: When an exam is flagged by proctoring or automated checks.
 * Idempotency: emailsSent.eirfFiling === true (unless incidentMetadata.force === true)
 */
async function sendEirfFilingNoticeEmail(submissionIdOrDoc, incidentMetadata = {}) {
    const sub = await findSubmissionByAnyId(submissionIdOrDoc);
    if (!sub) return { success: false, reason: 'Submission not found' };

    const subId = String(sub._id || sub.id || '');
    return await withEmailClaim(`${subId}:eirf_filing`, async () => {
        const freshSub = (await findSubmissionByAnyId(subId)) || sub;
        if (!incidentMetadata.force && freshSub.emailsSent && freshSub.emailsSent.eirfFiling) {
            console.log(`[IDEMPOTENCY_GUARD] eirf_filing email already sent for submission ${freshSub._id || freshSub.id}. Skipping.`);
            return { success: true, skipped: true, reason: 'Already sent' };
        }

        const systemConfig = incidentMetadata.systemConfig || await resolveSystemConfig();
        const candidate = await resolveCandidateInfo(freshSub.candidateId || freshSub.studentId, freshSub.candidateName, freshSub);
        const testInfo = await resolveTestInfo(freshSub.testId, freshSub, systemConfig);

        const bicsSubId = toBicsId(freshSub._id || freshSub.id);
        const submissionRefId = freshSub.submissionRefId || bicsSubId;
        const testTitle = freshSub.testTitle || testInfo.testTitle;

        const incidentType = incidentMetadata.incidentType ||
            freshSub.securityMetadata?.flagReason ||
            freshSub.proctoringLog?.flagReason ||
            (Array.isArray(freshSub.flaggedReasons) && freshSub.flaggedReasons[0]) ||
            'Proctoring Integrity Exception';

        const expiresAt = incidentMetadata.expiresAt ||
            freshSub.eirfExpiresAt ||
            freshSub.securityMetadata?.eirfDeadline ||
            new Date(Date.now() + 45 * 60 * 1000);
        const eirfExpiresAt = formatISTDate(expiresAt);

        let magicToken = incidentMetadata.magicToken || freshSub.securityMetadata?.magicToken || freshSub.eirfToken;
        if (!magicToken) {
            magicToken = crypto.randomBytes(24).toString('hex');
            sub.eirfToken = magicToken;
            freshSub.eirfToken = magicToken;
        }

        const basePortalUrl = resolvePortalBaseUrl();
        const eirfLink = incidentMetadata.magicLink || `${basePortalUrl}/assessment/evaluation/eirf/${bicsSubId}?token=${magicToken}`;

        const variables = {
            candidate_name: candidate.fullName,
            test_title: testTitle,
            submission_ref_id: submissionRefId,
            course_name: testInfo.courseName,
            course_code: testInfo.courseCode,
            academic_term: testInfo.academicTerm,
            incident_type: incidentType,
            eirf_link: eirfLink,
            eirf_expires_at: eirfExpiresAt
        };

        const targetEmail = (typeof incidentMetadata.recipient === 'string' && isValidEmailAddress(incidentMetadata.recipient.trim()))
            ? incidentMetadata.recipient.trim()
            : ((typeof incidentMetadata.to === 'string' && isValidEmailAddress(incidentMetadata.to.trim()))
                ? incidentMetadata.to.trim()
                : candidate.email);
        const targetName = incidentMetadata.toName || candidate.fullName;

        // Persist resolved recipient email if previously missing or updated
        if (targetEmail && targetEmail !== freshSub.candidateEmail) {
            freshSub.candidateEmail = targetEmail;
            sub.candidateEmail = targetEmail;
            if (dbState.useMongo) {
                await TestSubmissionModel.updateOne({ _id: freshSub._id }, { $set: { candidateEmail: targetEmail } }).catch(() => {});
                if (freshSub.candidateId && mongoose.Types.ObjectId.isValid(freshSub.candidateId)) {
                    await CandidateModel.updateOne({ _id: freshSub.candidateId }, { $set: { email: targetEmail, personalEmail: targetEmail, 'registrationData.personalEmail': targetEmail } }).catch(() => {});
                }
            }
        }

        const subject = `URGENT: Emergency Incident Report Form (EIRF) Required - ${testTitle} (${submissionRefId}) | BICS Examinations`;
        const htmlContent = renderEmailTemplate('eirf_filing', variables);

        const result = await sendGmailRestEmail({
            to: targetEmail,
            toName: targetName,
            subject,
            htmlContent,
            attachments: [],
            tags: ['bics-exam', 'eirf-filing']
        });

        const diag = buildDiagnosticsFields(result, 'eirf_filing');
        sub.emailsSent = sub.emailsSent || {};
        freshSub.emailsSent = freshSub.emailsSent || {};
        diag.applyJson(sub.emailsSent);
        diag.applyJson(freshSub.emailsSent);

        const mongoFields = {
            ...diag.mongoSet,
            eirfToken: magicToken
        };
        if (result.success) {
            sub.emailsSent.eirfFiling = true;
            sub.emailsSent.eirfFilingAt = diag.now;
            sub.eirfNoticeEmailSent = true;
            freshSub.emailsSent.eirfFiling = true;
            freshSub.emailsSent.eirfFilingAt = diag.now;
            freshSub.eirfNoticeEmailSent = true;
            mongoFields.eirfNoticeEmailSent = true;
            mongoFields['emailsSent.eirfFiling'] = true;
            mongoFields['emailsSent.eirfFilingAt'] = diag.now;
        }

        await persistSubmissionEmailState({
            sub: freshSub,
            extraFields: mongoFields,
            jsonMutator: (target) => {
                target.eirfToken = magicToken;
                diag.applyJson(target.emailsSent);
                if (result.success) {
                    target.eirfNoticeEmailSent = true;
                    target.emailsSent.eirfFiling = true;
                    target.emailsSent.eirfFilingAt = diag.now.toISOString();
                }
            }
        });

        const logId = await recordEmailLog({
            emailType: 'eirf_filing',
            ...result,
            recipientEmail: candidate.email || '',
            recipientName: candidate.fullName,
            subject,
            attachmentNames: [],
            triggerSource: incidentMetadata.triggerSource || 'eirf_pipeline',
            candidateId: freshSub.candidateId ? String(freshSub.candidateId) : '',
            studentId: candidate.studentId || freshSub.studentId || '',
            testId: freshSub.testId ? String(freshSub.testId) : '',
            submissionId: subId,
            submissionRefId,
            retriedFromLogId: incidentMetadata.retriedFromLogId || ''
        });

        if (!result.success) {
            logSystemAction('system', 'EMAIL_DISPATCH_FAILED', `[eirf_filing] Failed for ${submissionRefId}: ${result.error || result.reason}`, 'error').catch(() => {});
        }

        return { ...result, logId };
    });
}

/**
 * -----------------------------------------------------------------------------
 * 4. DISPATCH EIRF VERDICT APPROVED EMAIL (Official 2-Page PDF Attached)
 * -----------------------------------------------------------------------------
 */
async function sendEirfVerdictApprovedEmail(reportIdOrDoc, options = {}) {
    const report = await findReportByAnyId(reportIdOrDoc);
    if (!report) return { success: false, reason: 'EIRF Report not found' };

    const reportId = report.reportId || String(report._id || '');
    return await withEmailClaim(`${reportId}:eirf_approved`, async () => {
        const freshReport = (await findReportByAnyId(reportId)) || report;
        if (!options.force && freshReport.emailsSent && freshReport.emailsSent.approved) {
            console.log(`[IDEMPOTENCY_GUARD] eirf_approved email already sent for report ${reportId}. Skipping.`);
            return { success: true, skipped: true, reason: 'Already sent' };
        }

        const sub = await findSubmissionByAnyId(freshReport.submissionId || freshReport.submissionRefId);
        const systemConfig = options.systemConfig || await resolveSystemConfig();
        const candidate = await resolveCandidateInfo(freshReport.candidateId || sub?.candidateId || sub?.studentId, freshReport.candidateName || sub?.candidateName, sub);
        const testInfo = await resolveTestInfo(freshReport.testId || sub?.testId, sub, systemConfig);

        const testTitle = freshReport.testTitle || sub?.testTitle || testInfo.testTitle;
        const submissionRefId = freshReport.submissionRefId || sub?.submissionRefId || toBicsId(sub?._id || sub?.id) || 'Details not available';
        const courseName = options.courseName || freshReport.courseName || testInfo.courseName;
        const courseCode = options.courseCode || freshReport.courseCode || testInfo.courseCode;

        const resolutionCategory = options.resolutionCategory || freshReport.resolutionCategory || 'Medical / Technical Emergency Granted';
        const remediationAction = options.remediationAction || freshReport.remediationAction || 'Sanctions Waived, Original Marks Restored';
        const reviewedBy = options.reviewerName || freshReport.reviewedBy || freshReport.reviewerName || 'Academic Integrity Board Convener';
        const reviewerTitle = options.reviewerTitle || freshReport.reviewerTitle || 'Convener, Examination Disciplinary Committee';
        const reviewedDate = freshReport.reviewedAt ? new Date(freshReport.reviewedAt) : new Date();
        const reviewedAt = formatISTDate(reviewedDate);

        const hardcopyDeadline = options.deadlineDateStr || formatISTDate(new Date(reviewedDate.getTime() + 48 * 60 * 60 * 1000));
        const digitalHash = options.digitalHash || freshReport.digitalHash || generateDigitalVerdictHash(
            freshReport.submissionId || sub?._id || reportId,
            freshReport.studentId || candidate.studentId || sub?.studentId || 'Candidate',
            reportId,
            reviewedDate
        );
        const adminRemarks = options.adminRemarks || freshReport.adminRemarks || 'The submitted documentation and telemetry logs have been validated and approved.';

        const pdfCourseCode = options.courseCode || freshReport.courseCode || testInfo.testDoc?.courseCode || testInfo.testDoc?.code || '';
        const pdfCourseName = options.courseName || freshReport.courseName || testInfo.testDoc?.courseName || testInfo.testDoc?.course || testInfo.testDoc?.subject || '';

        const eirfPdfBuffer = options.pdfBuffer || await generateEirfVerdictPdfBuffer({
            report: freshReport,
            submission: sub,
            test: testInfo.testDoc,
            candidate: candidate.candDoc,
            systemConfig,
            courseCode: pdfCourseCode,
            courseName: pdfCourseName,
            adminRemarks: options.adminRemarks !== undefined ? options.adminRemarks : (freshReport.adminRemarks || ''),
            resolutionCategory,
            remediationAction,
            reviewerName: reviewedBy,
            reviewerTitle,
            digitalHash,
            deadlineDateStr: hardcopyDeadline
        });

        const variables = {
            candidate_name: candidate.fullName,
            test_title: testTitle,
            submission_ref_id: submissionRefId,
            course_name: courseName,
            course_code: courseCode,
            report_id: reportId,
            resolution_category: resolutionCategory,
            remediation_action: remediationAction,
            reviewed_by: reviewedBy,
            reviewed_at: reviewedAt,
            hardcopy_deadline: hardcopyDeadline,
            digital_hash: digitalHash,
            admin_remarks: adminRemarks
        };

        const attachmentName = `EIRF_Verdict_${reportId}.pdf`;
        const subject = `EIRF Verdict Notice: APPROVED - ${testTitle} (${submissionRefId}) | BICS Department of Examination`;
        const htmlContent = renderEmailTemplate('eirf_approved', variables);

        const result = await sendGmailRestEmail({
            to: candidate.email,
            toName: candidate.fullName,
            subject,
            htmlContent,
            attachments: [{ name: attachmentName, content: eirfPdfBuffer }],
            tags: ['bics-exam', 'eirf-approved']
        });

        const diag = buildDiagnosticsFields(result, 'eirf_approved');
        const repMongoFields = { ...diag.mongoSet, digitalHash };
        if (result.success) {
            repMongoFields['emailsSent.approved'] = true;
            repMongoFields['emailsSent.approvedAt'] = diag.now;
        }
        await persistReportEmailState({
            report: freshReport,
            extraFields: repMongoFields,
            jsonMutator: (target) => {
                target.digitalHash = digitalHash;
                diag.applyJson(target.emailsSent);
                if (result.success) {
                    target.emailsSent.approved = true;
                    target.emailsSent.approvedAt = diag.now.toISOString();
                }
            }
        });

        if (sub) {
            const subMongoFields = { ...diag.mongoSet };
            if (result.success) {
                subMongoFields['emailsSent.eirfApproved'] = true;
                subMongoFields['emailsSent.eirfApprovedAt'] = diag.now;
                subMongoFields['emailsSent.verdict'] = true;
                subMongoFields['emailsSent.verdictAt'] = diag.now;
            }
            await persistSubmissionEmailState({
                sub,
                extraFields: subMongoFields,
                jsonMutator: (target) => {
                    diag.applyJson(target.emailsSent);
                    if (result.success) {
                        target.emailsSent.eirfApproved = true;
                        target.emailsSent.eirfApprovedAt = diag.now.toISOString();
                        target.emailsSent.verdict = true;
                        target.emailsSent.verdictAt = diag.now.toISOString();
                    }
                }
            });
        }

        const logId = await recordEmailLog({
            emailType: 'eirf_approved',
            ...result,
            recipientEmail: candidate.email || '',
            recipientName: candidate.fullName,
            subject,
            attachmentNames: [attachmentName],
            triggerSource: options.triggerSource || 'eirf_verdict',
            candidateId: freshReport.candidateId ? String(freshReport.candidateId) : '',
            studentId: candidate.studentId || freshReport.studentId || '',
            testId: freshReport.testId ? String(freshReport.testId) : '',
            submissionId: sub ? String(sub._id || sub.id) : (freshReport.submissionId ? String(freshReport.submissionId) : ''),
            submissionRefId,
            reportId,
            retriedFromLogId: options.retriedFromLogId || ''
        });

        if (!result.success) {
            logSystemAction('system', 'EMAIL_DISPATCH_FAILED', `[eirf_approved] Failed for ${reportId}: ${result.error || result.reason}`, 'error').catch(() => {});
        }

        return { ...result, logId };
    });
}

/**
 * -----------------------------------------------------------------------------
 * 5. DISPATCH EIRF VERDICT REJECTED EMAIL (Official 2-Page PDF Attached)
 * -----------------------------------------------------------------------------
 */
async function sendEirfVerdictRejectedEmail(reportIdOrDoc, options = {}) {
    const report = await findReportByAnyId(reportIdOrDoc);
    if (!report) return { success: false, reason: 'EIRF Report not found' };

    const reportId = report.reportId || String(report._id || '');
    return await withEmailClaim(`${reportId}:eirf_rejected`, async () => {
        const freshReport = (await findReportByAnyId(reportId)) || report;
        if (!options.force && freshReport.emailsSent && freshReport.emailsSent.rejected) {
            console.log(`[IDEMPOTENCY_GUARD] eirf_rejected email already sent for report ${reportId}. Skipping.`);
            return { success: true, skipped: true, reason: 'Already sent' };
        }

        const sub = await findSubmissionByAnyId(freshReport.submissionId || freshReport.submissionRefId);
        const systemConfig = options.systemConfig || await resolveSystemConfig();
        const candidate = await resolveCandidateInfo(freshReport.candidateId || sub?.candidateId || sub?.studentId, freshReport.candidateName || sub?.candidateName, sub);
        const testInfo = await resolveTestInfo(freshReport.testId || sub?.testId, sub, systemConfig);

        const testTitle = freshReport.testTitle || sub?.testTitle || testInfo.testTitle;
        const submissionRefId = freshReport.submissionRefId || sub?.submissionRefId || toBicsId(sub?._id || sub?.id) || 'Details not available';
        const courseName = options.courseName || freshReport.courseName || testInfo.courseName;
        const courseCode = options.courseCode || freshReport.courseCode || testInfo.courseCode;

        const resolutionCategory = options.resolutionCategory || freshReport.resolutionCategory || 'Unexplained Window Deviation Confirmed';
        const remediationAction = options.remediationAction || freshReport.remediationAction || 'Examination Score Annulled (Zero Points)';
        const reviewedBy = options.reviewerName || freshReport.reviewedBy || freshReport.reviewerName || 'Academic Integrity Board Convener';
        const reviewerTitle = options.reviewerTitle || freshReport.reviewerTitle || 'Convener, Examination Disciplinary Committee';
        const reviewedDate = freshReport.reviewedAt ? new Date(freshReport.reviewedAt) : new Date();
        const reviewedAt = formatISTDate(reviewedDate);

        const hardcopyDeadline = options.deadlineDateStr || formatISTDate(new Date(reviewedDate.getTime() + 48 * 60 * 60 * 1000));
        const digitalHash = options.digitalHash || freshReport.digitalHash || generateDigitalVerdictHash(
            freshReport.submissionId || sub?._id || reportId,
            freshReport.studentId || candidate.studentId || sub?.studentId || 'Candidate',
            reportId,
            reviewedDate
        );
        const adminRemarks = options.adminRemarks || freshReport.adminRemarks || 'The submitted Emergency Incident Report documentation was reviewed and found insufficient to reconcile recorded proctoring deviations.';

        const pdfCourseCode = options.courseCode || freshReport.courseCode || testInfo.testDoc?.courseCode || testInfo.testDoc?.code || '';
        const pdfCourseName = options.courseName || freshReport.courseName || testInfo.testDoc?.courseName || testInfo.testDoc?.course || testInfo.testDoc?.subject || '';

        const eirfPdfBuffer = options.pdfBuffer || await generateEirfVerdictPdfBuffer({
            report: freshReport,
            submission: sub,
            test: testInfo.testDoc,
            candidate: candidate.candDoc,
            systemConfig,
            courseCode: pdfCourseCode,
            courseName: pdfCourseName,
            adminRemarks: options.adminRemarks !== undefined ? options.adminRemarks : (freshReport.adminRemarks || ''),
            resolutionCategory,
            remediationAction,
            reviewerName: reviewedBy,
            reviewerTitle,
            digitalHash,
            deadlineDateStr: hardcopyDeadline
        });

        const variables = {
            candidate_name: candidate.fullName,
            test_title: testTitle,
            submission_ref_id: submissionRefId,
            course_name: courseName,
            course_code: courseCode,
            report_id: reportId,
            resolution_category: resolutionCategory,
            remediation_action: remediationAction,
            reviewed_by: reviewedBy,
            reviewed_at: reviewedAt,
            hardcopy_deadline: hardcopyDeadline,
            digital_hash: digitalHash,
            admin_remarks: adminRemarks
        };

        const attachmentName = `EIRF_Verdict_${reportId}.pdf`;
        const subject = `EIRF Verdict Notice: REJECTED - ${testTitle} (${submissionRefId}) | BICS Department of Examination`;
        const htmlContent = renderEmailTemplate('eirf_rejected', variables);

        const result = await sendGmailRestEmail({
            to: candidate.email,
            toName: candidate.fullName,
            subject,
            htmlContent,
            attachments: [{ name: attachmentName, content: eirfPdfBuffer }],
            tags: ['bics-exam', 'eirf-rejected']
        });

        const diag = buildDiagnosticsFields(result, 'eirf_rejected');
        const repMongoFields = { ...diag.mongoSet, digitalHash };
        if (result.success) {
            repMongoFields['emailsSent.rejected'] = true;
            repMongoFields['emailsSent.rejectedAt'] = diag.now;
        }
        await persistReportEmailState({
            report: freshReport,
            extraFields: repMongoFields,
            jsonMutator: (target) => {
                target.digitalHash = digitalHash;
                diag.applyJson(target.emailsSent);
                if (result.success) {
                    target.emailsSent.rejected = true;
                    target.emailsSent.rejectedAt = diag.now.toISOString();
                }
            }
        });

        if (sub) {
            const subMongoFields = { ...diag.mongoSet };
            if (result.success) {
                subMongoFields['emailsSent.eirfRejected'] = true;
                subMongoFields['emailsSent.eirfRejectedAt'] = diag.now;
                subMongoFields['emailsSent.verdict'] = true;
                subMongoFields['emailsSent.verdictAt'] = diag.now;
            }
            await persistSubmissionEmailState({
                sub,
                extraFields: subMongoFields,
                jsonMutator: (target) => {
                    diag.applyJson(target.emailsSent);
                    if (result.success) {
                        target.emailsSent.eirfRejected = true;
                        target.emailsSent.eirfRejectedAt = diag.now.toISOString();
                        target.emailsSent.verdict = true;
                        target.emailsSent.verdictAt = diag.now.toISOString();
                    }
                }
            });
        }

        const logId = await recordEmailLog({
            emailType: 'eirf_rejected',
            ...result,
            recipientEmail: candidate.email || '',
            recipientName: candidate.fullName,
            subject,
            attachmentNames: [attachmentName],
            triggerSource: options.triggerSource || 'eirf_verdict',
            candidateId: freshReport.candidateId ? String(freshReport.candidateId) : '',
            studentId: candidate.studentId || freshReport.studentId || '',
            testId: freshReport.testId ? String(freshReport.testId) : '',
            submissionId: sub ? String(sub._id || sub.id) : (freshReport.submissionId ? String(freshReport.submissionId) : ''),
            submissionRefId,
            reportId,
            retriedFromLogId: options.retriedFromLogId || ''
        });

        if (!result.success) {
            logSystemAction('system', 'EMAIL_DISPATCH_FAILED', `[eirf_rejected] Failed for ${reportId}: ${result.error || result.reason}`, 'error').catch(() => {});
        }

        return { ...result, logId };
    });
}

/**
 * -----------------------------------------------------------------------------
 * 6. DISPATCH ONLINE TEST REPORT FORM (OTRF) EMAIL (PDF Attached)
 * -----------------------------------------------------------------------------
 */
async function sendOtrfEmail(submissionIdOrDoc, options = {}) {
    const sub = await findSubmissionByAnyId(submissionIdOrDoc);
    if (!sub) return { success: false, reason: 'Submission not found' };

    const subId = String(sub._id || sub.id || '');
    return await withEmailClaim(`${subId}:otrf_sent`, async () => {
        const freshSub = (await findSubmissionByAnyId(subId)) || sub;
        if (!options.force && freshSub.emailsSent && freshSub.emailsSent.otrfSent) {
            console.log(`[IDEMPOTENCY_GUARD] otrf_sent email already sent for submission ${freshSub._id || freshSub.id}. Skipping.`);
            return { success: true, skipped: true, reason: 'Already sent' };
        }

        const systemConfig = options.systemConfig || await resolveSystemConfig();
        const candidate = await resolveCandidateInfo(freshSub.candidateId || freshSub.studentId, freshSub.candidateName, freshSub);
        const testInfo = await resolveTestInfo(freshSub.testId, freshSub, systemConfig);
        const eirfReport = (freshSub.eirfReportId || freshSub.hasEirfFlag)
            ? await findReportByAnyId(freshSub.eirfReportId || freshSub._id || freshSub.id)
            : null;

        const testRefId = freshSub.submissionRefId || toBicsId(freshSub._id || freshSub.id);
        const testName = freshSub.testTitle || testInfo.testTitle;

        // Deterministic closure date & DOPS hardcopy deadline (+7 days from closure)
        const closureDateRaw = freshSub.verificationClosedAt || testInfo.testDoc?.verificationClosedAt || freshSub.submittedAt || new Date();
        const closureDate = new Date(closureDateRaw);
        const closureMs = isNaN(closureDate.getTime()) ? Date.now() : closureDate.getTime();
        const dopsDate = formatISTDate(new Date(closureMs + 7 * 24 * 60 * 60 * 1000));

        const artifactMeta = resolveOtrfArtifactMeta(freshSub);

        let otrfPdfBuffer = await generateOtrfReportPdfBuffer({
            submission: freshSub,
            test: testInfo.testDoc || {},
            candidate: candidate.candDoc || {},
            eirfReport,
            systemConfig,
            verificationClosureDate: closureDateRaw,
            verificationUrl: artifactMeta.verificationUrl
        });

        const artifact = await persistOtrfPdfArtifact({
            submission: freshSub,
            pdfBuffer: otrfPdfBuffer
        });

        if (artifact.storage === 'local' && artifactMeta.hasCloudinary && artifact.url) {
            const localServerBase = (process.env.API_PUBLIC_URL || process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/+$/, '');
            otrfPdfBuffer = await generateOtrfReportPdfBuffer({
                submission: freshSub,
                test: testInfo.testDoc || {},
                candidate: candidate.candDoc || {},
                eirfReport,
                systemConfig,
                verificationClosureDate: closureDateRaw,
                verificationUrl: `${localServerBase}${artifact.url}`
            });
            await persistOtrfPdfArtifact({
                submission: freshSub,
                pdfBuffer: otrfPdfBuffer,
                options: { verificationUrl: `${localServerBase}${artifact.url}` }
            });
        }

        const variables = {
            candidate_name: candidate.fullName,
            test_ref_id: testRefId,
            test_name: testName,
            course_name: testInfo.courseName,
            course_code: testInfo.courseCode,
            dops_date: dopsDate
        };

        const attachmentName = `OTRF_${testRefId}.pdf`;
        const subject = `Online Test Report Form (OTRF): ${testName} (${testRefId}) | BICS Preliminary Examinations 2026`;
        const htmlContent = renderEmailTemplate('otrf_sent', variables);

        const result = await sendGmailRestEmail({
            to: candidate.email,
            toName: candidate.fullName,
            subject,
            htmlContent,
            attachments: [{ name: attachmentName, content: otrfPdfBuffer }],
            tags: ['bics-exam', 'otrf-sent']
        });

        const diag = buildDiagnosticsFields(result, 'otrf_sent');
        sub.emailsSent = sub.emailsSent || {};
        freshSub.emailsSent = freshSub.emailsSent || {};
        diag.applyJson(sub.emailsSent);
        diag.applyJson(freshSub.emailsSent);

        const updateFields = { ...diag.mongoSet };
        if (artifact?.url) {
            sub.otrfPdfUrl = artifact.url;
            freshSub.otrfPdfUrl = artifact.url;
            updateFields.otrfPdfUrl = artifact.url;
        }
        if (result.success) {
            sub.emailsSent.otrfSent = true;
            sub.emailsSent.otrfSentAt = diag.now;
            freshSub.emailsSent.otrfSent = true;
            freshSub.emailsSent.otrfSentAt = diag.now;
            updateFields['emailsSent.otrfSent'] = true;
            updateFields['emailsSent.otrfSentAt'] = diag.now;
        }

        await persistSubmissionEmailState({
            sub: freshSub,
            extraFields: updateFields,
            jsonMutator: (target) => {
                diag.applyJson(target.emailsSent);
                if (artifact?.url) {
                    target.otrfPdfUrl = artifact.url;
                }
                if (result.success) {
                    target.emailsSent.otrfSent = true;
                    target.emailsSent.otrfSentAt = diag.now.toISOString();
                }
            }
        });

        const logId = await recordEmailLog({
            emailType: 'otrf_sent',
            ...result,
            recipientEmail: candidate.email || '',
            recipientName: candidate.fullName,
            subject,
            attachmentNames: [attachmentName],
            triggerSource: options.triggerSource || 'test_verification_closed',
            candidateId: freshSub.candidateId ? String(freshSub.candidateId) : '',
            studentId: candidate.studentId || freshSub.studentId || '',
            testId: freshSub.testId ? String(freshSub.testId) : '',
            submissionId: subId,
            submissionRefId: freshSub.submissionRefId || testRefId,
            retriedFromLogId: options.retriedFromLogId || ''
        });

        if (!result.success) {
            logSystemAction('system', 'EMAIL_DISPATCH_FAILED', `[otrf_sent] Failed for ${testRefId}: ${result.error || result.reason}`, 'error').catch(() => {});
        }

        return { ...result, logId, dopsDate, otrfPdfUrl: artifact?.url || freshSub.otrfPdfUrl || '' };
    });
}

/**
 * -----------------------------------------------------------------------------
 * 7. BATCH DISPATCH OTRF WHEN VERIFICATION STATUS IS TOGGLED TO 'closed'
 * -----------------------------------------------------------------------------
 * Deduplicated per resolved testId with gentle pacing across candidate sends.
 */
async function dispatchOtrfBatchForClosedTest(testId, options = {}) {
    if (!testId) return { dispatched: 0, failed: 0, skipped: 0, totalEligible: 0, failures: [] };
    const resolvedTestId = String(resolveToObjectId(String(testId)) || testId);

    if (inFlightOtrfBatches.has(resolvedTestId)) {
        return await inFlightOtrfBatches.get(resolvedTestId);
    }

    const batchPromise = (async () => {
        console.log(`[GMAIL_EMAIL_SERVICE] Initiating OTRF batch dispatch for closed test ${testId} (resolved: ${resolvedTestId})...`);

        let eligibleSubmissions = [];
        if (dbState.useMongo) {
            if (mongoose.Types.ObjectId.isValid(resolvedTestId)) {
                eligibleSubmissions = await TestSubmissionModel.find({
                    testId: resolvedTestId,
                    isDeleted: { $ne: true },
                    'emailsSent.otrfSent': { $ne: true }
                });
            }
        } else {
            const db = getJSONData();
            eligibleSubmissions = (db.testSubmissions || []).filter(s => {
                const rawSubTestId = String(s.testId || s.testConfigId || '');
                const normSubTestId = resolveToObjectId(rawSubTestId);
                const matchTest = rawSubTestId === String(testId) ||
                    rawSubTestId === resolvedTestId ||
                    (normSubTestId && (normSubTestId === String(testId) || normSubTestId === resolvedTestId));
                const notDeleted = !s.isDeleted;
                const notSent = !(s.emailsSent && s.emailsSent.otrfSent);
                return matchTest && notDeleted && notSent;
            });
        }

        console.log(`[GMAIL_EMAIL_SERVICE] Found ${eligibleSubmissions.length} candidate submission(s) pending OTRF email.`);
        let dispatched = 0;
        let failed = 0;
        let skipped = 0;
        const failures = [];
        const pacingMs = options.pacingMs !== undefined
            ? Number(options.pacingMs)
            : (hasGmailCredentials() && process.env.NODE_ENV !== 'test' ? 150 : 0);

        for (let i = 0; i < eligibleSubmissions.length; i++) {
            const sub = eligibleSubmissions[i];
            const subRef = sub.submissionRefId || toBicsId(sub._id || sub.id);
            try {
                const res = await sendOtrfEmail(sub, { triggerSource: options.triggerSource || 'otrf_batch_dispatch' });
                if (res && res.success) {
                    if (res.skipped) skipped++;
                    else dispatched++;
                } else {
                    failed++;
                    failures.push({
                        submissionId: toBicsId(sub._id || sub.id),
                        submissionRefId: subRef,
                        studentId: sub.studentId || '',
                        error: res?.error || res?.reason || 'Dispatch failed'
                    });
                }
            } catch (err) {
                failed++;
                failures.push({
                    submissionId: toBicsId(sub._id || sub.id),
                    submissionRefId: subRef,
                    studentId: sub.studentId || '',
                    error: err.message || String(err)
                });
                console.error(`[GMAIL_EMAIL_SERVICE] Failed OTRF dispatch for submission ${sub._id}:`, err.message);
            }

            if (pacingMs > 0 && i < eligibleSubmissions.length - 1) {
                await sleep(pacingMs);
            }
        }

        console.log(`[GMAIL_EMAIL_SERVICE] OTRF Batch Complete: ${dispatched} dispatched, ${skipped} skipped, ${failed} failed.`);
        return { dispatched, failed, skipped, totalEligible: eligibleSubmissions.length, failures };
    })();

    inFlightOtrfBatches.set(resolvedTestId, batchPromise);
    try {
        return await batchPromise;
    } finally {
        inFlightOtrfBatches.delete(resolvedTestId);
    }
}

module.exports = {
    formatISTDate,
    escapeHtml,
    renderEmailTemplate,
    buildMimeMessage,
    getGmailAccessToken,
    resetGmailTokenCache,
    isProdRuntime,
    hasGmailCredentials,
    isValidEmailAddress,
    extractValidCandidateEmail,
    resolvePortalBaseUrl,
    findSubmissionByAnyId,
    findReportByAnyId,
    resolveCandidateInfo,
    resolveTestInfo,
    resolveSystemConfig,
    recordEmailLog,
    sendGmailRestEmail,
    sendVerificationCodeEmail,
    sendTestSubmittedEmail,
    sendEirfFilingNoticeEmail,
    sendEirfVerdictApprovedEmail,
    sendEirfVerdictRejectedEmail,
    sendOtrfEmail,
    dispatchOtrfBatchForClosedTest
};
