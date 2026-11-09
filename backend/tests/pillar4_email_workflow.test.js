/**
 * Pillar 4 Comprehensive Verification Suite:
 * Unified Gmail REST API Transactional & OTP Email Workflow (Option B)
 *
 * Verifies:
 * 0. Static Architecture, Legacy Removal & Single Unified Admin View Audit
 * 1. MIME RFC Compliance, XSS / $-Injection Escaping & All 6 Canonical Templates
 * 2. Delivery Truthfulness, Production Fail-Loud & Email Address Validation
 * 3. OAuth2 Single-Flight Refresh Mutex, 401 Invalidation & 429/503 Retries
 * 4. Concurrency Mutexes, Idempotency & Worker Step-Level Recovery + Cooldowns
 * 5. OTP & Change-Password Auth, IDOR, Rollback on Failure & Input Hardening
 * 6. Unified Admin Email Center (/api/admin/emails/*) RBAC, BICSID/Secret Safety,
 *    Lifecycle Pending Synthesis, Retry All 6 Types, Bulk Retry & Batch OTRF
 */

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

process.env.NODE_ENV = 'test';
process.env.PORT = '5012';
process.env.JWT_SECRET = 'pillar4_test_jwt_secret_2026';
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASS = 'admin123';
process.env.API_ACCESS_SECRET = 'qwertty';
process.env.PORTAL_URL = 'https://bicsportal.netlify.app';
process.env.GMAIL_CLIENT_ID = 'mock_gmail_client_id';
process.env.GMAIL_CLIENT_SECRET = 'mock_gmail_client_secret';
process.env.GMAIL_REFRESH_TOKEN = 'mock_gmail_refresh_token';

const { DB_FILE, dbState, getJSONData, saveJSONData } = require('../config/db');
const dbBackup = fs.existsSync(DB_FILE) ? fs.readFileSync(DB_FILE, 'utf8') : null;

const app = require('../server');
const gmailEmailService = require('../services/gmailEmailService');
const {
    renderEmailTemplate,
    buildMimeMessage,
    getGmailAccessToken,
    resetGmailTokenCache,
    isValidEmailAddress,
    extractValidCandidateEmail,
    formatISTDate,
    sendGmailRestEmail,
    sendVerificationCodeEmail,
    sendTestSubmittedEmail,
    sendEirfFilingNoticeEmail,
    sendEirfVerdictApprovedEmail,
    sendEirfVerdictRejectedEmail,
    sendOtrfEmail,
    dispatchOtrfBatchForClosedTest
} = gmailEmailService;
const { generateToken } = require('../utils/jwt');
const { toBicsId, isBicsId, generateSubmissionRefId } = require('../utils/bicsId');
const { hashPassword } = require('../utils/password');
const { stopSubmissionReaper } = require('../workers/submissionReaper');
const { runPipelineTick, processSequentialJob, stopEirfPipelineWorker } = require('../workers/eirfPipelineWorker');

const rootDir = path.resolve(__dirname, '..', '..');
const backendDir = path.join(rootDir, 'backend');
const otrfPublicDir = path.join(backendDir, 'public', 'otrf');
const pipePath = process.platform === 'win32'
    ? `\\\\.\\pipe\\bics_p4_${process.pid}_${Date.now()}`
    : `/tmp/bics_p4_${process.pid}_${Date.now()}.sock`;

// Snapshot existing env & artifacts for pristine cleanup
const envBackup = {
    NODE_ENV: process.env.NODE_ENV,
    RENDER: process.env.RENDER,
    VERCEL: process.env.VERCEL,
    GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET,
    GMAIL_REFRESH_TOKEN: process.env.GMAIL_REFRESH_TOKEN,
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET
};

const existingOtrfFiles = new Set(
    fs.existsSync(otrfPublicDir) ? fs.readdirSync(otrfPublicDir) : []
);

function setMockGmailCreds(enabled) {
    if (enabled) {
        process.env.GMAIL_CLIENT_ID = 'mock_gmail_client_id';
        process.env.GMAIL_CLIENT_SECRET = 'mock_gmail_client_secret';
        process.env.GMAIL_REFRESH_TOKEN = 'mock_gmail_refresh_token';
    } else {
        delete process.env.GMAIL_CLIENT_ID;
        delete process.env.GMAIL_CLIENT_SECRET;
        delete process.env.GMAIL_REFRESH_TOKEN;
    }
}

function httpRequest(method, urlPath, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const reqHeaders = { Host: '127.0.0.1:5000', ...headers };
        let payload = null;
        if (body !== null && body !== undefined) {
            payload = typeof body === 'string' ? body : JSON.stringify(body);
            if (!reqHeaders['Content-Type']) reqHeaders['Content-Type'] = 'application/json';
            reqHeaders['Content-Length'] = Buffer.byteLength(payload);
        }

        const req = http.request({ socketPath: pipePath, path: urlPath, method, headers: reqHeaders }, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const rawBuf = Buffer.concat(chunks);
                const contentType = String(res.headers['content-type'] || '');
                let parsedBody = rawBuf;
                if (!contentType.includes('application/pdf')) {
                    const str = rawBuf.toString('utf8');
                    parsedBody = str;
                    try { parsedBody = JSON.parse(str); } catch (_) {}
                }
                resolve({ status: res.statusCode, headers: res.headers, body: parsedBody, rawBuffer: rawBuf });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function parseCapturedMime(rawBase64Url) {
    const stdB64 = String(rawBase64Url || '').replace(/-/g, '+').replace(/_/g, '/');
    const mimeStr = Buffer.from(stdB64, 'base64').toString('utf8');
    const toMatch = mimeStr.match(/^To:\s*(.+)$/m);
    const subjMatch = mimeStr.match(/^Subject:\s*=\?UTF-8\?B\?([^?]+)\?=/m);
    const subject = subjMatch ? Buffer.from(subjMatch[1], 'base64').toString('utf8') : '';

    let textDecoded = '';
    const textSection = mimeStr.match(/Content-Type: text\/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n\r\n--/);
    if (textSection && textSection[1]) {
        textDecoded = Buffer.from(textSection[1].replace(/\s+/g, ''), 'base64').toString('utf8');
    }

    let htmlDecoded = '';
    const htmlSection = mimeStr.match(/Content-Type: text\/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n\r\n--/);
    if (htmlSection && htmlSection[1]) {
        htmlDecoded = Buffer.from(htmlSection[1].replace(/\s+/g, ''), 'base64').toString('utf8');
    }

    const attachments = [];
    const attRegex = /Content-Disposition: attachment; filename="([^"]+)"\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n\r\n--/g;
    let m;
    while ((m = attRegex.exec(mimeStr)) !== null) {
        attachments.push({
            filename: m[1],
            rawBase64Block: m[2],
            buffer: Buffer.from(m[2].replace(/\s+/g, ''), 'base64')
        });
    }

    return {
        to: toMatch ? toMatch[1].trim() : '',
        subject,
        textDecoded,
        htmlDecoded,
        attachments,
        mimeStr
    };
}

function walkFiles(dir, excludeDirs = new Set(['node_modules', '.backup', '.git', 'dist', 'build'])) {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (!excludeDirs.has(entry.name)) {
                out.push(...walkFiles(path.join(dir, entry.name), excludeDirs));
            }
        } else {
            out.push(path.join(dir, entry.name));
        }
    }
    return out;
}

function createFetchMockController() {
    const capturedEmails = [];
    let tokenFetchCount = 0;
    let sendFetchCount = 0;
    let delayMs = 0;
    let queuedSendResponses = [];
    let tokenResponseOverride = null;

    const mockFetch = async (url, opts = {}) => {
        const urlStr = String(url);
        if (urlStr.includes('oauth2.googleapis.com/token')) {
            tokenFetchCount++;
            if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
            if (tokenResponseOverride) {
                const ov = tokenResponseOverride;
                return {
                    ok: ov.status >= 200 && ov.status < 300,
                    status: ov.status,
                    text: async () => JSON.stringify(ov.body),
                    json: async () => ov.body
                };
            }
            return {
                ok: true,
                status: 200,
                text: async () => JSON.stringify({ access_token: `mock_tok_${tokenFetchCount}`, expires_in: 3600 }),
                json: async () => ({ access_token: `mock_tok_${tokenFetchCount}`, expires_in: 3600 })
            };
        }

        if (urlStr.includes('gmail.googleapis.com/gmail/v1/users/me/messages/send')) {
            sendFetchCount++;
            if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));

            const next = queuedSendResponses.length > 0 ? queuedSendResponses.shift() : { status: 200 };
            const status = next.status || 200;
            const headersMap = new Map(Object.entries(next.headers || {}));
            const headersObj = { get: (k) => headersMap.get(String(k).toLowerCase()) || headersMap.get(k) || null };

            if (status >= 200 && status < 300) {
                const body = JSON.parse(opts.body || '{}');
                const parsed = parseCapturedMime(body.raw || '');
                const msgId = `gmail_mock_msg_${capturedEmails.length + 1}`;
                capturedEmails.push({ ...parsed, messageId: msgId, raw: body.raw });
                return {
                    ok: true,
                    status,
                    headers: headersObj,
                    text: async () => JSON.stringify({ id: msgId }),
                    json: async () => ({ id: msgId })
                };
            }

            const errBody = next.body || `Mock Gmail error ${status}`;
            return {
                ok: false,
                status,
                headers: headersObj,
                text: async () => (typeof errBody === 'string' ? errBody : JSON.stringify(errBody)),
                json: async () => (typeof errBody === 'string' ? { error: errBody } : errBody)
            };
        }

        throw new Error(`Unexpected external fetch call in Pillar 4 test suite: ${urlStr}`);
    };

    return {
        mockFetch,
        capturedEmails,
        getStats: () => ({ tokenFetchCount, sendFetchCount }),
        resetStats: () => { tokenFetchCount = 0; sendFetchCount = 0; },
        setDelay: (ms) => { delayMs = ms; },
        queueResponses: (...items) => { queuedSendResponses.push(...items); },
        clearQueue: () => { queuedSendResponses = []; },
        setTokenOverride: (ov) => { tokenResponseOverride = ov; }
    };
}

async function runPillar4Suite() {
    console.log('\n==============================================================');
    console.log('   PILLAR 4: UNIFIED EMAIL WORKFLOW & SECURITY VERIFICATION   ');
    console.log('==============================================================\n');

    let server = null;
    let passed = 0;
    let total = 0;

    const check = (cond, msg) => {
        total++;
        if (cond) {
            console.log(`  [PASS] ${msg}`);
            passed++;
        } else {
            console.error(`  [FAIL] ${msg}`);
            throw new Error(`Assertion failed: ${msg}`);
        }
    };

    const origUseMongo = dbState.useMongo;
    const origIsConnected = dbState.isConnected;
    const origFetch = global.fetch;

    try {
        // Ensure zero real Cloudinary calls and start clean with mock Gmail creds
        delete process.env.CLOUDINARY_CLOUD_NAME;
        delete process.env.CLOUDINARY_API_KEY;
        delete process.env.CLOUDINARY_API_SECRET;
        delete process.env.RENDER;
        delete process.env.VERCEL;
        setMockGmailCreds(true);
        resetGmailTokenCache();

        dbState.useMongo = false;
        dbState.isConnected = true;

        // ============================================================
        // GROUP 0: Static Architecture, Legacy Removal & Single-View Audit
        // ============================================================
        console.log('[Group 0] Static Architecture, Legacy Removal & Single-View Audit...');

        const backendPkg = JSON.parse(fs.readFileSync(path.join(backendDir, 'package.json'), 'utf8'));
        const depNames = Object.keys(backendPkg.dependencies || {});
        check(
            !depNames.some(d => /nodemailer|brevo|emailjs/i.test(d)),
            'G0.1: backend/package.json contains zero nodemailer, brevo, or emailjs dependencies'
        );

        check(
            !fs.existsSync(path.join(backendDir, 'utils', 'email.js')) &&
            !fs.existsSync(path.join(backendDir, 'services', 'brevoEmailService.js')) &&
            !fs.existsSync(path.join(backendDir, 'templates', 'emails', 'eirf_confirmation.html')),
            'G0.2: Legacy utils/email.js, brevoEmailService.js, and eirf_confirmation.html are permanently deleted'
        );

        const canonicalTemplates = [
            'verification_code.html',
            'test_submitted.html',
            'eirf_filing.html',
            'eirf_approved.html',
            'eirf_rejected.html',
            'otrf_sent.html'
        ];
        const templateFiles = fs.readdirSync(path.join(backendDir, 'templates', 'emails'));
        check(
            canonicalTemplates.every(f => templateFiles.includes(f)) && templateFiles.length === 6,
            `G0.3: Exactly 6 canonical HTML email templates exist (${templateFiles.join(', ')})`
        );

        const backendCodeFiles = [
            path.join(backendDir, 'server.js'),
            ...walkFiles(path.join(backendDir, 'services')),
            ...walkFiles(path.join(backendDir, 'routes')),
            ...walkFiles(path.join(backendDir, 'workers')),
            ...walkFiles(path.join(backendDir, 'models'))
        ];
        const staleBackendMatches = [];
        for (const f of backendCodeFiles) {
            const content = fs.readFileSync(f, 'utf8');
            const filtered = f.endsWith('gmailEmailService.js')
                ? content.split('\n').slice(15).join('\n') // ignore header comment note ("no SMTP, Nodemailer...")
                : content;
            if (/sendEirfConfirmationEmail|eirfConfirmation|brevoEmailService|nodemailer|emailjs/i.test(filtered)) {
                staleBackendMatches.push(path.relative(rootDir, f));
            }
        }
        check(
            staleBackendMatches.length === 0,
            `G0.4: Zero stale mailer/eirfConfirmation references in active backend code (${staleBackendMatches.join(', ') || 'clean'})`
        );

        const frontendSrcFiles = [
            ...walkFiles(path.join(rootDir, 'frontend', 'src')),
            ...walkFiles(path.join(rootDir, 'frontend_ot', 'src')),
            path.join(rootDir, 'frontend', 'index.html'),
            path.join(rootDir, 'frontend_ot', 'index.html')
        ].filter(f => fs.existsSync(f));
        const staleFrontendMatches = frontendSrcFiles.filter(f =>
            /emailjs|nodemailer|brevo|eirfConfirmation|sendEirfConfirmation/i.test(fs.readFileSync(f, 'utf8'))
        );
        check(
            staleFrontendMatches.length === 0,
            `G0.5: Zero emailjs/nodemailer/brevo/eirfConfirmation references in frontends (${staleFrontendMatches.join(', ') || 'clean'})`
        );

        const adminTestsSrc = fs.readFileSync(path.join(rootDir, 'frontend', 'src', 'pages', 'admin', 'AdminTests.jsx'), 'utf8');
        const adminProcSrc = fs.readFileSync(path.join(rootDir, 'frontend', 'src', 'pages', 'admin', 'AdminProctoring.jsx'), 'utf8');
        const proctorDashSrc = fs.readFileSync(path.join(rootDir, 'frontend', 'src', 'components', 'StudentProctorDashboard.jsx'), 'utf8');
        const adminEmailsSrc = fs.readFileSync(path.join(rootDir, 'frontend', 'src', 'pages', 'admin', 'AdminEmails.jsx'), 'utf8');
        const sidebarSrc = fs.readFileSync(path.join(rootDir, 'frontend', 'src', 'components', 'Sidebar.jsx'), 'utf8');
        const hallTicketSrc = fs.readFileSync(path.join(rootDir, 'frontend', 'src', 'pages', 'HallTicketView.jsx'), 'utf8');
        const appJsxSrc = fs.readFileSync(path.join(rootDir, 'frontend', 'src', 'App.jsx'), 'utf8');

        check(
            adminEmailsSrc.includes('/admin/emails/retry') &&
            adminEmailsSrc.includes('/admin/emails/dispatch-otrf') &&
            !adminTestsSrc.includes('/admin/emails/') &&
            !adminProcSrc.includes('/admin/emails/') &&
            !proctorDashSrc.includes('/admin/emails/') &&
            sidebarSrc.includes("setView('admin_emails')") &&
            hallTicketSrc.includes('verificationCooldown') &&
            appJsxSrc.includes('setVerificationCooldown(0)') &&
            appJsxSrc.includes('setChangePasswordCooldown(0)') &&
            appJsxSrc.includes('setAdminEmailPendingCount(0)'),
            'G0.6: Single Admin Email Center enforced in AdminEmails.jsx + Sidebar + HallTicket cooldown & logout reset'
        );

        const candRouteSrc = fs.readFileSync(path.join(backendDir, 'routes', 'candidates.js'), 'utf8');
        const authRouteSrc = fs.readFileSync(path.join(backendDir, 'routes', 'auth.js'), 'utf8');
        check(
            candRouteSrc.includes('crypto.randomInt(100000, 1000000)') &&
            !candRouteSrc.includes('Math.random() * 900000') &&
            authRouteSrc.includes("role === 'admin'") &&
            authRouteSrc.includes('.env') &&
            sidebarSrc.indexOf('Change Password') < sidebarSrc.indexOf("user?.role === 'admin' ? '20px'"),
            'G0.7: Security audit static guardrails (CSPRNG OTP, admin password block, sidebar order) preserved'
        );

        const rejectedTpl = fs.readFileSync(path.join(backendDir, 'templates', 'emails', 'eirf_rejected.html'), 'utf8');
        const otpTpl = fs.readFileSync(path.join(backendDir, 'templates', 'emails', 'verification_code.html'), 'utf8');
        check(
            !rejectedTpl.includes('appeals/') &&
            !rejectedTpl.includes('Submit an Appeal') &&
            /final and binding|no appeal/i.test(rejectedTpl) &&
            otpTpl.includes('{{verification_code}}') &&
            otpTpl.includes('{{purpose}}') &&
            otpTpl.includes('{{expires_minutes}}'),
            'G0.8: eirf_rejected.html removes appeals & affirms finality; verification_code.html includes OTP placeholders'
        );

        // Install fetch mock & boot IPC server
        const fetchCtrl = createFetchMockController();
        global.fetch = fetchCtrl.mockFetch;

        await new Promise((resolve) => {
            server = http.createServer(app).listen(pipePath, resolve);
        });

        // Generate synthetic ObjectIds & seed isolated JSON DB
        const { ObjectId } = require('mongoose').Types;
        const testIdCleanMongo = new ObjectId().toString();
        const testIdClosedMongo = new ObjectId().toString();
        const testIdReleasedMongo = new ObjectId().toString();

        const candAMongo = new ObjectId().toString();
        const candBMongo = new ObjectId().toString();
        const candBadEmailMongo = new ObjectId().toString();

        const candABics = toBicsId(candAMongo);
        const candBBics = toBicsId(candBMongo);
        const testCleanBics = toBicsId(testIdCleanMongo);
        const testClosedBics = toBicsId(testIdClosedMongo);
        const testReleasedBics = toBicsId(testIdReleasedMongo);

        const subStartedCleanMongo = new ObjectId().toString();
        const subTemplateCheckMongo = new ObjectId().toString();
        const subEirfFilingMongo = new ObjectId().toString();
        const subEirfApprovedMongo = new ObjectId().toString();
        const subEirfRejectedMongo = new ObjectId().toString();
        const subOtrfHistoricalMongo = new ObjectId().toString();
        const subBatchOtrf1Mongo = new ObjectId().toString();
        const subBatchOtrf2BadEmailMongo = new ObjectId().toString();
        const subWorkerStep2Mongo = new ObjectId().toString();
        const subWorkerStep3Mongo = new ObjectId().toString();
        const subWorkerCleanBadEmailMongo = new ObjectId().toString();
        const subWorkerCleanCooldownMongo = new ObjectId().toString();

        const initialPassHash = await hashPassword('InitialPass123!');
        const historicalCloseDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
        const expectedHistDops = formatISTDate(new Date(new Date(historicalCloseDate).getTime() + 7 * 24 * 60 * 60 * 1000));

        const nowIso = new Date().toISOString();
        const futureEnd = new Date(Date.now() + 7200000).toISOString();
        const pastStart = new Date(Date.now() - 3600000).toISOString();
        const eirfFutureExpiry = new Date(Date.now() + 45 * 60 * 1000).toISOString();

        const sampleQuestions = [
            {
                id: 'q_scc_1',
                type: 'scc',
                title: 'Asymptotic Tight Bound Question',
                description: 'Which complexity describes binary search?',
                options: ['O(n)', 'O(log n)', 'O(n log n)', 'O(1)'],
                correctOptionIndex: 1,
                correctOptionIndices: [1],
                points: 10
            }
        ];

        const seedDb = {
            config: {
                examType: 'midsem',
                academicTerm: '2026-27 (Semester I)',
                hallTicketDownloadActive: true
            },
            candidates: [
                {
                    _id: candAMongo,
                    id: candAMongo,
                    studentId: '24BICS401',
                    name: 'Aarav "Šharma"',
                    fullName: 'Aarav "Šharma"',
                    username: 'aarav.p4',
                    password: initialPassHash,
                    eligible: true,
                    registrationData: {
                        preferredName: 'Aarav "Šharma"',
                        personalEmail: 'aarav.p4@example.com',
                        collegeEmail: '24bics401@bics.edu'
                    }
                },
                {
                    _id: candBMongo,
                    id: candBMongo,
                    studentId: '24BICS402',
                    name: 'Diya Patel',
                    fullName: 'Diya Patel',
                    username: 'diya.p4',
                    password: initialPassHash,
                    eligible: true,
                    registrationData: {
                        preferredName: 'Diya Patel',
                        personalEmail: 'diya.p4@example.com'
                    }
                },
                {
                    _id: candBadEmailMongo,
                    id: candBadEmailMongo,
                    studentId: '24BICS499',
                    name: 'No Email Candidate',
                    fullName: 'No Email Candidate',
                    username: 'noemail.p4',
                    password: initialPassHash,
                    eligible: true,
                    personalEmail: 'bad@@invalid..email',
                    registrationData: {
                        preferredName: 'No Email Candidate',
                        personalEmail: ''
                    }
                }
            ],
            tests: [
                {
                    _id: testIdCleanMongo,
                    id: testIdCleanMongo,
                    title: 'BICS Mid-Sem Systems & $& Injection <Test>',
                    course: 'Algorithms & Data Structures',
                    courseCode: 'R526CS01T',
                    marks: 50,
                    duration: 60,
                    startDate: pastStart,
                    endDate: futureEnd,
                    isPublished: true,
                    verificationStatus: 'not_released',
                    questions: sampleQuestions
                },
                {
                    _id: testIdClosedMongo,
                    id: testIdClosedMongo,
                    title: 'BICS Final Closed Verification Exam',
                    course: 'Operating Systems & Security',
                    courseCode: 'R526CS02T',
                    marks: 50,
                    duration: 60,
                    startDate: pastStart,
                    endDate: futureEnd,
                    isPublished: true,
                    verificationStatus: 'closed',
                    verificationClosedAt: historicalCloseDate,
                    questions: sampleQuestions
                },
                {
                    _id: testIdReleasedMongo,
                    id: testIdReleasedMongo,
                    title: 'BICS Released Active Test',
                    course: 'Web Systems',
                    courseCode: 'R526CS03T',
                    marks: 50,
                    duration: 60,
                    startDate: pastStart,
                    endDate: futureEnd,
                    isPublished: true,
                    verificationStatus: 'released',
                    questions: sampleQuestions
                }
            ],
            testSubmissions: [
                {
                    _id: subStartedCleanMongo,
                    id: subStartedCleanMongo,
                    submissionRefId: generateSubmissionRefId(),
                    testId: testIdCleanMongo,
                    testTitle: 'BICS Mid-Sem Systems & $& Injection <Test>',
                    candidateId: candAMongo,
                    studentId: '24BICS401',
                    candidateName: 'Aarav "Šharma"',
                    status: 'started',
                    pipelineStatus: 'QUEUED',
                    startedAt: nowIso,
                    answers: [],
                    proctoringLog: { fullscreenExits: 0, tabSwitches: 0, events: [] },
                    emailsSent: {}
                },
                {
                    _id: subTemplateCheckMongo,
                    id: subTemplateCheckMongo,
                    submissionRefId: '202604010001',
                    testId: testIdCleanMongo,
                    testTitle: 'BICS <script>alert(1)</script> $&$1$$$\' Exam',
                    candidateId: candAMongo,
                    studentId: '24BICS401',
                    candidateName: 'Aarav <img onerror=alert(1)> $&',
                    status: 'submitted',
                    pipelineStatus: 'CLEARED',
                    startedAt: nowIso,
                    submittedAt: nowIso,
                    evaluation: { mcqScore: 10, codingScore: 0, webScore: 0, totalScore: 10, maxScore: 50 },
                    totalScore: 10,
                    answers: [{ questionId: 'q_scc_1', type: 'scc', selectedOptionIndex: 1, score: 10 }],
                    proctoringLog: { fullscreenExits: 0, tabSwitches: 0, events: [] },
                    emailsSent: {}
                },
                {
                    _id: subEirfFilingMongo,
                    id: subEirfFilingMongo,
                    submissionRefId: '202604010002',
                    testId: testIdCleanMongo,
                    candidateId: candBMongo,
                    studentId: '24BICS402',
                    candidateName: 'Diya Patel',
                    status: 'submitted',
                    hasEirfFlag: true,
                    eirfStatus: 'pending',
                    pipelineStatus: 'AWAITING_EIRF',
                    eirfToken: 'filing_magic_tok_abc123def456',
                    eirfExpiresAt: eirfFutureExpiry,
                    flaggedReasons: ['Fullscreen exited for 18 seconds'],
                    startedAt: nowIso,
                    submittedAt: nowIso,
                    answers: [],
                    proctoringLog: { fullscreenExits: 1, tabSwitches: 0, events: [] },
                    emailsSent: {}
                },
                {
                    _id: subEirfApprovedMongo,
                    id: subEirfApprovedMongo,
                    submissionRefId: '202604010003',
                    testId: testIdCleanMongo,
                    candidateId: candAMongo,
                    studentId: '24BICS401',
                    candidateName: 'Aarav Sharma',
                    status: 'submitted',
                    hasEirfFlag: true,
                    eirfStatus: 'approved',
                    eirfReportId: 'EIRF-2026-APP401',
                    pipelineStatus: 'VERDICT_ISSUED',
                    startedAt: nowIso,
                    submittedAt: nowIso,
                    evaluation: { totalScore: 10, maxScore: 50 },
                    totalScore: 10,
                    answers: [],
                    proctoringLog: { fullscreenExits: 1, tabSwitches: 0, events: [] },
                    emailsSent: {}
                },
                {
                    _id: subEirfRejectedMongo,
                    id: subEirfRejectedMongo,
                    submissionRefId: '202604010004',
                    testId: testIdCleanMongo,
                    candidateId: candBMongo,
                    studentId: '24BICS402',
                    candidateName: 'Diya Patel',
                    status: 'submitted',
                    hasEirfFlag: true,
                    eirfStatus: 'rejected',
                    eirfReportId: 'EIRF-2026-REJ402',
                    verificationStatus: 'annulled',
                    pipelineStatus: 'VERDICT_ISSUED',
                    startedAt: nowIso,
                    submittedAt: nowIso,
                    evaluation: { totalScore: 0, maxScore: 50 },
                    totalScore: 0,
                    answers: [],
                    proctoringLog: { fullscreenExits: 2, tabSwitches: 2, events: [] },
                    emailsSent: {}
                },
                {
                    _id: subOtrfHistoricalMongo,
                    id: subOtrfHistoricalMongo,
                    submissionRefId: '202604010005',
                    testId: testIdClosedMongo,
                    candidateId: candAMongo,
                    studentId: '24BICS401',
                    candidateName: 'Aarav Sharma',
                    status: 'submitted',
                    pipelineStatus: 'CLEARED',
                    startedAt: historicalCloseDate,
                    submittedAt: historicalCloseDate,
                    evaluation: { mcqScore: 10, totalScore: 10, maxScore: 50 },
                    totalScore: 10,
                    answers: [{ questionId: 'q_scc_1', type: 'scc', selectedOptionIndex: 1, score: 10 }],
                    proctoringLog: { fullscreenExits: 0, tabSwitches: 0, events: [] },
                    emailsSent: { testSubmitted: true }
                },
                {
                    _id: subBatchOtrf1Mongo,
                    id: subBatchOtrf1Mongo,
                    submissionRefId: '202604010006',
                    testId: testIdClosedMongo,
                    candidateId: candBMongo,
                    studentId: '24BICS402',
                    candidateName: 'Diya Patel',
                    status: 'submitted',
                    pipelineStatus: 'CLEARED',
                    startedAt: nowIso,
                    submittedAt: nowIso,
                    evaluation: { mcqScore: 10, totalScore: 10, maxScore: 50 },
                    totalScore: 10,
                    answers: [{ questionId: 'q_scc_1', type: 'scc', selectedOptionIndex: 1, score: 10 }],
                    proctoringLog: { fullscreenExits: 0, tabSwitches: 0, events: [] },
                    emailsSent: { testSubmitted: true }
                },
                {
                    _id: subBatchOtrf2BadEmailMongo,
                    id: subBatchOtrf2BadEmailMongo,
                    submissionRefId: '202604010007',
                    testId: testIdClosedMongo,
                    candidateId: candBadEmailMongo,
                    studentId: '24BICS499',
                    candidateName: 'No Email Candidate',
                    status: 'submitted',
                    pipelineStatus: 'CLEARED',
                    startedAt: nowIso,
                    submittedAt: nowIso,
                    evaluation: { mcqScore: 0, totalScore: 0, maxScore: 50 },
                    totalScore: 0,
                    answers: [],
                    proctoringLog: { fullscreenExits: 0, tabSwitches: 0, events: [] },
                    emailsSent: { testSubmitted: true }
                },
                {
                    _id: subWorkerStep2Mongo,
                    id: subWorkerStep2Mongo,
                    submissionRefId: '202604010008',
                    testId: testIdReleasedMongo,
                    candidateId: candBMongo,
                    studentId: '24BICS402',
                    candidateName: 'Diya Patel',
                    status: 'submitted',
                    hasEirfFlag: true,
                    eirfStatus: 'pending',
                    pipelineStatus: 'QUESTIONS_GENERATED',
                    pipelineRetries: 0,
                    pipelineLock: { isLocked: false },
                    generatedQuestions: [
                        { questionId: 'Q_PERSIST_1', category: 'GENERAL', questionType: 'TEXT', questionText: 'Explain the interruption.', options: [], required: true }
                    ],
                    startedAt: nowIso,
                    submittedAt: nowIso,
                    answers: [],
                    proctoringLog: { fullscreenExits: 1, tabSwitches: 0, events: [] },
                    emailsSent: {}
                },
                {
                    _id: subWorkerStep3Mongo,
                    id: subWorkerStep3Mongo,
                    submissionRefId: '202604010009',
                    testId: testIdReleasedMongo,
                    candidateId: candAMongo,
                    studentId: '24BICS401',
                    candidateName: 'Aarav Sharma',
                    status: 'submitted',
                    hasEirfFlag: true,
                    eirfStatus: 'submitted',
                    eirfReportId: 'EIRF-2026-STEP3',
                    pipelineStatus: 'EIRF_SUBMITTED',
                    pipelineRetries: 0,
                    pipelineLock: { isLocked: false },
                    startedAt: nowIso,
                    submittedAt: nowIso,
                    answers: [],
                    proctoringLog: { fullscreenExits: 1, tabSwitches: 0, events: [] },
                    emailsSent: { eirfFiling: true }
                },
                {
                    _id: subWorkerCleanBadEmailMongo,
                    id: subWorkerCleanBadEmailMongo,
                    submissionRefId: '202604010010',
                    testId: testIdReleasedMongo,
                    candidateId: candBadEmailMongo,
                    studentId: '24BICS499',
                    candidateName: 'No Email Candidate',
                    status: 'submitted',
                    hasEirfFlag: false,
                    pipelineStatus: 'CLEARED',
                    startedAt: nowIso,
                    submittedAt: nowIso,
                    answers: [],
                    proctoringLog: { fullscreenExits: 0, tabSwitches: 0, events: [] },
                    emailsSent: {}
                },
                {
                    _id: subWorkerCleanCooldownMongo,
                    id: subWorkerCleanCooldownMongo,
                    submissionRefId: '202604010011',
                    testId: testIdReleasedMongo,
                    candidateId: candAMongo,
                    studentId: '24BICS401',
                    candidateName: 'Aarav Sharma',
                    status: 'submitted',
                    hasEirfFlag: false,
                    pipelineStatus: 'CLEARED',
                    startedAt: nowIso,
                    submittedAt: nowIso,
                    answers: [],
                    proctoringLog: { fullscreenExits: 0, tabSwitches: 0, events: [] },
                    emailsSent: {
                        testSubmitted: false,
                        lastAttemptType: 'test_submitted',
                        lastError: 'Gmail API HTTP 503',
                        lastAttemptAt: new Date().toISOString()
                    }
                }
            ],
            eirfReports: [
                {
                    reportId: 'EIRF-2026-APP401',
                    submissionId: subEirfApprovedMongo,
                    bicsId: toBicsId(subEirfApprovedMongo),
                    submissionRefId: '202604010003',
                    candidateId: candAMongo,
                    studentId: '24BICS401',
                    candidateName: 'Aarav Sharma',
                    testId: testIdCleanMongo,
                    testTitle: 'BICS Mid-Sem Systems',
                    courseCode: 'R526CS01T',
                    courseName: 'Algorithms & Data Structures',
                    status: 'approved',
                    pipelineStatus: 'VERDICT_ISSUED',
                    adminRemarks: 'Validated <script>alert(1)</script> & literal $&$1$$$\' safely.',
                    reviewedAt: nowIso,
                    emailsSent: {}
                },
                {
                    reportId: 'EIRF-2026-REJ402',
                    submissionId: subEirfRejectedMongo,
                    bicsId: toBicsId(subEirfRejectedMongo),
                    submissionRefId: '202604010004',
                    candidateId: candBMongo,
                    studentId: '24BICS402',
                    candidateName: 'Diya Patel',
                    testId: testIdCleanMongo,
                    testTitle: 'BICS Mid-Sem Systems',
                    courseCode: 'R526CS01T',
                    courseName: 'Algorithms & Data Structures',
                    status: 'rejected',
                    pipelineStatus: 'VERDICT_ISSUED',
                    adminRemarks: 'Multiple unauthorized window exits documented.',
                    reviewedAt: nowIso,
                    emailsSent: {}
                }
            ],
            emailLogs: []
        };

        saveJSONData(seedDb);

        const adminJwt = generateToken({ id: 'admin', username: 'admin', role: 'admin' }, '2h');
        const studentAJwt = generateToken({ id: candAMongo, studentId: '24BICS401', username: 'aarav.p4', role: 'student' }, '2h');
        const studentBJwt = generateToken({ id: candBMongo, studentId: '24BICS402', username: 'diya.p4', role: 'student' }, '2h');

        // ============================================================
        // GROUP 1: MIME Compliance, XSS / $-Injection Escape & All 6 Templates
        // ============================================================
        console.log('\n[Group 1] MIME Compliance, XSS / $-Injection Escape & All 6 Templates...');

        const hostileRawMime = buildMimeMessage({
            from: '"Department of Examination, BICS" <noreply.bicsportal@gmail.com>',
            to: '"Aarav \"Šharma\"\r\nBcc: evil@attacker.com" <aarav.p4@example.com>',
            subject: 'URGENT Notice\r\nCc: leak@attacker.com',
            html: '<p>Hello &lt;b&gt;Test&lt;/b&gt; ' + 'X'.repeat(200) + '</p>',
            attachments: [{ name: 'test_att.pdf', content: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n' + 'A'.repeat(200)) }]
        });
        const decodedHostileMime = Buffer.from(hostileRawMime.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
        const headerSection = decodedHostileMime.split('\r\n\r\n')[0];
        const b64Chunks = [...decodedHostileMime.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n\r\n--/g)].map(m => m[1]);
        check(
            !headerSection.includes('\nBcc:') &&
            !headerSection.includes('\nCc:') &&
            /^To:\s*=\?UTF-8\?B\?/.test(headerSection.split('\r\n').find(l => l.startsWith('To:')) || '') &&
            decodedHostileMime.includes('multipart/mixed') &&
            decodedHostileMime.includes('multipart/alternative') &&
            decodedHostileMime.includes('Content-Type: text/plain; charset=UTF-8') &&
            decodedHostileMime.includes('Content-Type: text/html; charset=UTF-8') &&
            b64Chunks.length >= 3 &&
            b64Chunks.every(chunk => chunk.split('\r\n').every(line => line.length <= 76)),
            'G1.1: buildMimeMessage prevents CR/LF header injection, RFC2047 encodes non-ASCII names, emits text/plain+text/html & wraps Base64 <= 76 chars'
        );

        const renderedXss = renderEmailTemplate('eirf_approved', {
            candidate_name: 'Student <script>alert(1)</script>',
            test_title: 'CS $&$1$$$\' Exam',
            submission_ref_id: '202604010003',
            course_name: 'Algo & DS',
            course_code: 'R526CS01T',
            report_id: 'EIRF-2026-APP401',
            resolution_category: 'Medical',
            remediation_action: 'Restored',
            reviewed_by: 'Board',
            reviewed_at: '01/01/2026',
            hardcopy_deadline: '03/01/2026',
            digital_hash: 'ABCDEF1234',
            admin_remarks: 'Remarks <img src=x onerror=alert(9)> with $&$1$$$\' literal'
        });
        check(
            !renderedXss.includes('<script>alert(1)</script>') &&
            renderedXss.includes('&lt;script&gt;alert(1)&lt;/script&gt;') &&
            renderedXss.includes('&lt;img src=x onerror=alert(9)&gt;') &&
            renderedXss.includes("$&amp;$1$$$&#39;"),
            'G1.2: renderEmailTemplate HTML-escapes scripts and preserves literal $&$1$$$\' without regex expansion'
        );

        // Dispatch all 6 canonical types
        const emailCountStart = fetchCtrl.capturedEmails.length;

        const r1Otp = await sendVerificationCodeEmail({
            candidateId: candAMongo,
            studentId: '24BICS401',
            to: 'aarav.p4@example.com',
            fullName: 'Aarav Sharma',
            code: '654321',
            purpose: 'Hall Ticket Identity Verification'
        });
        const mail1Otp = fetchCtrl.capturedEmails[fetchCtrl.capturedEmails.length - 1];

        const r2Sub = await sendTestSubmittedEmail(subTemplateCheckMongo);
        const mail2Sub = fetchCtrl.capturedEmails[fetchCtrl.capturedEmails.length - 1];

        const r3Filing = await sendEirfFilingNoticeEmail(subEirfFilingMongo);
        const mail3Filing = fetchCtrl.capturedEmails[fetchCtrl.capturedEmails.length - 1];

        const r4Approved = await sendEirfVerdictApprovedEmail('EIRF-2026-APP401');
        const mail4Approved = fetchCtrl.capturedEmails[fetchCtrl.capturedEmails.length - 1];

        const r5Rejected = await sendEirfVerdictRejectedEmail('EIRF-2026-REJ402');
        const mail5Rejected = fetchCtrl.capturedEmails[fetchCtrl.capturedEmails.length - 1];

        const r6Otrf = await sendOtrfEmail(subOtrfHistoricalMongo);
        const mail6Otrf = fetchCtrl.capturedEmails[fetchCtrl.capturedEmails.length - 1];

        check(
            fetchCtrl.capturedEmails.length - emailCountStart === 6 &&
            r1Otp.success && mail1Otp.htmlDecoded.includes('654321') && mail1Otp.attachments.length === 0 &&
            r2Sub.success && mail2Sub.htmlDecoded.includes('202604010001') && !mail2Sub.htmlDecoded.includes('<script>') && mail2Sub.attachments.length === 0 &&
            r3Filing.success && mail3Filing.htmlDecoded.includes(`/assessment/evaluation/eirf/${toBicsId(subEirfFilingMongo)}?token=filing_magic_tok_abc123def456`) && mail3Filing.attachments.length === 0 &&
            r4Approved.success && mail4Approved.htmlDecoded.includes('EIRF-2026-APP401') && mail4Approved.htmlDecoded.includes("$&amp;$1$$$&#39;") &&
            mail4Approved.attachments.some(a => a.filename === 'EIRF_Verdict_EIRF-2026-APP401.pdf' && a.buffer.toString('latin1', 0, 5) === '%PDF-') &&
            r5Rejected.success && !mail5Rejected.htmlDecoded.includes('appeals/') && !mail5Rejected.htmlDecoded.includes('Submit an Appeal') &&
            mail5Rejected.attachments.some(a => a.filename === 'EIRF_Verdict_EIRF-2026-REJ402.pdf' && a.buffer.toString('latin1', 0, 5) === '%PDF-') &&
            r6Otrf.success && r6Otrf.dopsDate === expectedHistDops && mail6Otrf.htmlDecoded.includes(expectedHistDops) &&
            mail6Otrf.attachments.some(a => a.filename === 'OTRF_202604010005.pdf' && a.buffer.toString('latin1', 0, 5) === '%PDF-'),
            `G1.3: All 6 canonical templates render & dispatch via Gmail MIME cleanly, with PDFs attached & deterministic dopsDate (${r6Otrf.dopsDate})`
        );

        // Reset those submission email flags so Group 6 can also test full lifecycle / admin center freely where needed,
        // while keeping clean fixture state for Groups 2-6
        const dbAfterG1 = getJSONData();
        const resetFlagsForSub = (id, keepOtrf = false) => {
            const s = dbAfterG1.testSubmissions.find(x => x._id === id);
            if (s) s.emailsSent = keepOtrf ? { testSubmitted: true } : {};
        };
        resetFlagsForSub(subTemplateCheckMongo);
        resetFlagsForSub(subEirfFilingMongo);
        resetFlagsForSub(subEirfApprovedMongo);
        resetFlagsForSub(subEirfRejectedMongo);
        resetFlagsForSub(subOtrfHistoricalMongo, true);
        const repApp = dbAfterG1.eirfReports.find(r => r.reportId === 'EIRF-2026-APP401');
        if (repApp) repApp.emailsSent = {};
        const repRej = dbAfterG1.eirfReports.find(r => r.reportId === 'EIRF-2026-REJ402');
        if (repRej) repRej.emailsSent = {};
        dbAfterG1.emailLogs = [];
        saveJSONData(dbAfterG1);

        // ============================================================
        // GROUP 2: Delivery Truthfulness, Production Fail-Loud & Email Validation
        // ============================================================
        console.log('\n[Group 2] Delivery Truthfulness, Production Fail-Loud & Email Validation...');

        fetchCtrl.resetStats();
        const badEmailRes = await sendGmailRestEmail({
            to: 'bad@@invalid..email',
            toName: 'Bad',
            subject: 'Should fail validation',
            htmlContent: '<p>Hi</p>'
        });
        const extractedInvalid = extractValidCandidateEmail({
            personalEmail: 'invalid@localhost',
            email: 'no-at-sign',
            registrationData: { personalEmail: 'a..b@example.com' }
        });
        check(
            badEmailRes.success === false &&
            badEmailRes.transport === 'validation' &&
            badEmailRes.reason === 'Candidate email missing or invalid' &&
            fetchCtrl.getStats().sendFetchCount === 0 &&
            extractedInvalid === null &&
            !isValidEmailAddress('noreply.bicsportal@gmail.com\nBcc:evil@x.com'),
            'G2.1: Invalid/missing email aborts cleanly with transport=validation, 0 fetch calls, and zero hardcoded sender fallback'
        );

        // Deterministic 403 -> fails loudly with 1 attempt, NEVER falls back to console_audit, leaves emailsSent.testSubmitted falsy
        fetchCtrl.resetStats();
        fetchCtrl.queueResponses({ status: 403, body: 'PERMISSION_DENIED' });
        const fail403Res = await sendTestSubmittedEmail(subTemplateCheckMongo, { triggerSource: 'g2_403_test' });
        const dbPost403 = getJSONData();
        const subPost403 = dbPost403.testSubmissions.find(s => s._id === subTemplateCheckMongo);
        const logPost403 = dbPost403.emailLogs.find(l => l.submissionId === subTemplateCheckMongo && l.emailType === 'test_submitted');
        check(
            fail403Res.success === false &&
            fail403Res.transport === 'gmail_rest_api' &&
            fail403Res.attempts === 1 &&
            !subPost403.emailsSent?.testSubmitted &&
            String(subPost403.emailsSent?.lastError || '').includes('403') &&
            logPost403?.status === 'failed',
            'G2.2: Gmail 403 fails loudly on attempt 1 (no console_audit fallback), preserves testSubmitted=false, writes failed EmailLog'
        );

        // Unconfigured credentials in production -> fails loudly
        setMockGmailCreds(false);
        resetGmailTokenCache();
        try {
            process.env.RENDER = 'true';
            const prodUnconfRender = await sendGmailRestEmail({
                to: 'aarav.p4@example.com',
                subject: 'Prod check render',
                htmlContent: '<p>Prod</p>'
            });
            delete process.env.RENDER;
            process.env.NODE_ENV = 'production';
            const prodUnconfNode = await sendGmailRestEmail({
                to: 'aarav.p4@example.com',
                subject: 'Prod check node_env',
                htmlContent: '<p>Prod</p>'
            });
            check(
                prodUnconfRender.success === false &&
                prodUnconfRender.transport === 'unconfigured' &&
                prodUnconfNode.success === false &&
                prodUnconfNode.transport === 'unconfigured',
                'G2.3: Missing Gmail credentials in production (RENDER/NODE_ENV=production) fail loudly with transport=unconfigured'
            );
        } finally {
            process.env.NODE_ENV = 'test';
            delete process.env.RENDER;
            delete process.env.VERCEL;
        }

        // Unconfigured credentials in non-production -> console_audit simulation
        const devSimRes = await sendTestSubmittedEmail(subTemplateCheckMongo, { triggerSource: 'g2_dev_sim' });
        const dbPostSim = getJSONData();
        const subPostSim = dbPostSim.testSubmissions.find(s => s._id === subTemplateCheckMongo);
        const logPostSim = dbPostSim.emailLogs.find(l => l._id === devSimRes.logId);
        check(
            devSimRes.success === true &&
            devSimRes.simulated === true &&
            devSimRes.transport === 'console_audit' &&
            logPostSim?.status === 'simulated' &&
            subPostSim.emailsSent?.testSubmitted === true,
            'G2.4: Missing Gmail credentials in test mode simulate safely via console_audit and write simulated EmailLog'
        );

        // Restore Gmail creds & mark subTemplateCheckMongo clean email sent so Group 4 worker ticks stay isolated (Group 6 resets it)
        setMockGmailCreds(true);
        resetGmailTokenCache();
        {
            const dbFix = getJSONData();
            const s = dbFix.testSubmissions.find(x => x._id === subTemplateCheckMongo);
            if (s) s.emailsSent = { testSubmitted: true };
            dbFix.emailLogs = [];
            saveJSONData(dbFix);
        }

        // ============================================================
        // GROUP 3: OAuth2 Single-Flight Mutex, 401 Invalidation & 429/503 Retry
        // ============================================================
        console.log('\n[Group 3] OAuth2 Mutex, 401 Refresh & Transient 429/503 Retries...');

        resetGmailTokenCache();
        fetchCtrl.resetStats();
        fetchCtrl.setDelay(25);
        const concurrentTokens = await Promise.all([
            getGmailAccessToken(),
            getGmailAccessToken(),
            getGmailAccessToken(),
            getGmailAccessToken()
        ]);
        fetchCtrl.setDelay(0);
        check(
            fetchCtrl.getStats().tokenFetchCount === 1 &&
            concurrentTokens.every(t => t && t === concurrentTokens[0]),
            `G3.1: 4 concurrent getGmailAccessToken calls share 1 single-flight OAuth POST (actual=${fetchCtrl.getStats().tokenFetchCount})`
        );

        // Single 401 invalidates cache & refreshes token once
        const tokenCountBefore401 = fetchCtrl.getStats().tokenFetchCount;
        fetchCtrl.queueResponses({ status: 401, body: 'Token revoked' }, { status: 200 });
        const res401 = await sendGmailRestEmail({
            to: 'aarav.p4@example.com',
            subject: '401 recovery',
            htmlContent: '<p>Retry 401</p>'
        });
        check(
            res401.success === true &&
            res401.attempts === 2 &&
            fetchCtrl.getStats().tokenFetchCount === tokenCountBefore401 + 1,
            'G3.2: Single 401 Unauthorized invalidates cached OAuth token, refreshes once, and delivers on attempt 2'
        );

        // Transient 429 (with Retry-After) + 503 + 200 -> attempt 3 success
        fetchCtrl.queueResponses(
            { status: 429, headers: { 'retry-after': '1' }, body: 'Rate limit' },
            { status: 503, body: 'Backend unavailable' },
            { status: 200 }
        );
        const res429 = await sendGmailRestEmail({
            to: 'aarav.p4@example.com',
            subject: 'Transient backoff',
            htmlContent: '<p>Backoff</p>'
        });
        check(
            res429.success === true && res429.attempts === 3,
            `G3.3: Transient 429 (Retry-After) + 503 recovers cleanly on attempt 3 (attempts=${res429.attempts})`
        );

        // Exhausting 3x 500 -> clean failure
        fetchCtrl.queueResponses({ status: 500 }, { status: 500 }, { status: 500 });
        const res500 = await sendGmailRestEmail({
            to: 'aarav.p4@example.com',
            subject: 'Exhaust retry',
            htmlContent: '<p>Fail</p>'
        });
        check(
            res500.success === false && res500.attempts === 3 && res500.transport === 'gmail_rest_api',
            'G3.4: Exhausting 3x 500 returns { success: false, attempts: 3, transport: "gmail_rest_api" }'
        );

        // ============================================================
        // GROUP 4: Concurrency Mutexes, Idempotency & Worker Synchronization
        // ============================================================
        console.log('\n[Group 4] Race Conditions, Idempotency & Worker Step Synchronization...');

        // Clear cooldown item from interfering until G4.6 or test clean submit race cleanly
        const subCleanRef = getJSONData().testSubmissions.find(s => s._id === subStartedCleanMongo).submissionRefId;
        const emailsBeforeRace = fetchCtrl.capturedEmails.length;
        fetchCtrl.setDelay(30);

        const [submitRaceRes] = await Promise.all([
            httpRequest('POST', '/api/tests/submit', {
                submissionId: toBicsId(subStartedCleanMongo),
                status: 'submitted',
                answers: [{ questionId: 'q_scc_1', type: 'scc', selectedOptionIndex: 1 }],
                proctoringLog: { fullscreenExits: 0, tabSwitches: 0, events: [] }
            }, { Authorization: `Bearer ${studentAJwt}` }),
            new Promise(r => setTimeout(r, 12)).then(() => sendTestSubmittedEmail(subStartedCleanMongo, { triggerSource: 'race_competitor' })),
            new Promise(r => setTimeout(r, 18)).then(() => runPipelineTick())
        ]);
        await new Promise(r => setTimeout(r, 100));
        fetchCtrl.setDelay(0);

        const emailsForRaceSub = fetchCtrl.capturedEmails
            .slice(emailsBeforeRace)
            .filter(e => e.subject.includes(subCleanRef) || e.htmlDecoded.includes(subCleanRef));
        const skipSecondRes = await sendTestSubmittedEmail(subStartedCleanMongo);
        check(
            submitRaceRes.status === 200 &&
            emailsForRaceSub.length === 1 &&
            skipSecondRes.success === true &&
            skipSecondRes.skipped === true,
            `G4.1 & G4.2: Clean submit vs concurrent send + worker tick dispatched strictly 1 email (${emailsForRaceSub.length}); duplicate call skipped`
        );

        // Concurrent dispatchOtrfBatchForClosedTest -> sends once per eligible student with failures reported accurately
        const emailsBeforeBatch = fetchCtrl.capturedEmails.length;
        const [batchRes1, batchRes2] = await Promise.all([
            dispatchOtrfBatchForClosedTest(testIdClosedMongo, { triggerSource: 'batch_race_1' }),
            dispatchOtrfBatchForClosedTest(testIdClosedMongo, { triggerSource: 'batch_race_2' })
        ]);
        const emailsAfterBatch = fetchCtrl.capturedEmails.slice(emailsBeforeBatch);
        const batchOtrf1Emails = emailsAfterBatch.filter(e => e.attachments.some(a => a.filename === 'OTRF_202604010006.pdf'));
        check(
            batchOtrf1Emails.length === 1 &&
            batchRes1.totalEligible === 3 &&
            batchRes1.dispatched === 2 &&
            batchRes1.failed === 1 &&
            batchRes1.failures.length === 1 &&
            batchRes1.failures[0].submissionRefId === '202604010007' &&
            batchRes2.dispatched === 2 &&
            getJSONData().testSubmissions.find(s => s._id === subBatchOtrf1Mongo).otrfPdfUrl === '/public/otrf/otrf_202604010006.pdf',
            `G4.3: Concurrent OTRF batch sends strictly 1x per valid student, skips bad email with detailed failures (dispatched=${batchRes1.dispatched}, failed=${batchRes1.failed})`
        );

        // Worker Step 2 failure -> reverts to QUESTIONS_GENERATED without wiping generatedQuestions -> retry count hits 3 -> FAILED
        {
            fetchCtrl.clearQueue();
            {
                const dbPrepS2 = getJSONData();
                const s2 = dbPrepS2.testSubmissions.find(x => x._id === subWorkerStep2Mongo);
                if (s2) {
                    s2.pipelineStatus = 'QUESTIONS_GENERATED';
                    s2.pipelineRetries = 0;
                    s2.eirfToken = null;
                    s2.eirfExpiresAt = null;
                    s2.eirfNoticeEmailSent = false;
                    s2.emailsSent = {};
                    s2.pipelineLock = { isLocked: false };
                }
                const sCool = dbPrepS2.testSubmissions.find(x => x._id === subWorkerCleanCooldownMongo);
                if (sCool) {
                    sCool.emailsSent = {
                        testSubmitted: false,
                        lastAttemptType: 'test_submitted',
                        lastError: 'Gmail API HTTP 503',
                        lastAttemptAt: new Date().toISOString()
                    };
                }
                const sBad = dbPrepS2.testSubmissions.find(x => x._id === subWorkerCleanBadEmailMongo);
                if (sBad) {
                    sBad.emailsSent = {
                        testSubmitted: false,
                        lastAttemptType: 'test_submitted',
                        lastError: 'Candidate email missing or invalid',
                        lastAttemptAt: new Date().toISOString()
                    };
                }
                saveJSONData(dbPrepS2);
            }

            const step2SubBefore = getJSONData().testSubmissions.find(s => s._id === subWorkerStep2Mongo);
            for (let attempt = 1; attempt <= 3; attempt++) {
                fetchCtrl.queueResponses({ status: 500 }, { status: 500 }, { status: 500 });
                await runPipelineTick();
            }
            const step2AfterFail = getJSONData().testSubmissions.find(s => s._id === subWorkerStep2Mongo);
            check(
                step2AfterFail.pipelineStatus === 'FAILED' &&
                step2AfterFail.pipelineRetries === 3 &&
                Array.isArray(step2AfterFail.generatedQuestions) &&
                step2AfterFail.generatedQuestions[0]?.questionId === step2SubBefore.generatedQuestions[0].questionId &&
                !step2AfterFail.emailsSent?.eirfFiling,
                `G4.4: Worker Step 2 retries exhaust cleanly -> status=FAILED after 3 failures while preserving generatedQuestions`
            );
            // Reset step2 back so G4.5 can move it cleanly into AWAITING_EIRF before testing Step 3
            const dbResetS2 = getJSONData();
            const s2Fix = dbResetS2.testSubmissions.find(x => x._id === subWorkerStep2Mongo);
            s2Fix.pipelineStatus = 'QUESTIONS_GENERATED';
            s2Fix.pipelineRetries = 0;
            saveJSONData(dbResetS2);
        }

        // Worker Step 3 (EIRF_SUBMITTED) fail then recover -> dispatches ONLY deferred test_submitted -> UNDER_REVIEW
        {
            // First tick moves subWorkerStep2Mongo to AWAITING_EIRF cleanly
            await runPipelineTick();
            fetchCtrl.queueResponses({ status: 500 }, { status: 500 }, { status: 500 });
            await runPipelineTick(); // fails subWorkerStep3Mongo -> reverts to EIRF_SUBMITTED
            const step3Reverted = getJSONData().testSubmissions.find(s => s._id === subWorkerStep3Mongo);
            check(
                step3Reverted.pipelineStatus === 'EIRF_SUBMITTED' && !step3Reverted.emailsSent?.testSubmitted,
                `G4.5a: Worker Step 3 failure reverts pipelineStatus -> EIRF_SUBMITTED (actual=${step3Reverted.pipelineStatus})`
            );

            const beforeStep3Ok = fetchCtrl.capturedEmails.length;
            await runPipelineTick(); // succeeds -> sends deferred test_submitted -> UNDER_REVIEW
            const step3Done = getJSONData().testSubmissions.find(s => s._id === subWorkerStep3Mongo);
            const step3Mails = fetchCtrl.capturedEmails.slice(beforeStep3Ok).filter(e => e.subject.includes('202604010009'));
            check(
                step3Done.pipelineStatus === 'UNDER_REVIEW' &&
                step3Done.emailsSent?.testSubmitted === true &&
                step3Mails.length === 1 &&
                step3Mails[0].subject.includes('Submission Confirmation'),
                'G4.5b: Worker Step 3 recovery sends ONLY deferred test_submitted (no eirf_confirmation) & transitions -> UNDER_REVIEW'
            );
        }

        // Worker clean submission missing-email skip & 5-min transient cooldown skip + expiry
        {
            const freshCooldownIso = new Date().toISOString();
            {
                const dbGuard = getJSONData();
                const badSub = dbGuard.testSubmissions.find(s => s._id === subWorkerCleanBadEmailMongo);
                if (badSub) badSub.emailsSent = {};
                const coolSub = dbGuard.testSubmissions.find(s => s._id === subWorkerCleanCooldownMongo);
                if (coolSub) {
                    coolSub.emailsSent = {
                        testSubmitted: false,
                        lastAttemptType: 'test_submitted',
                        lastError: 'Gmail API HTTP 503',
                        lastAttemptAt: freshCooldownIso
                    };
                }
                saveJSONData(dbGuard);
            }

            const sendsBeforeCleanGuard = fetchCtrl.getStats().sendFetchCount;
            // Tick 1: subWorkerCleanBadEmailMongo attempts validation (0 fetch calls) & records missing/invalid error;
            // subWorkerCleanCooldownMongo has recent lastAttemptAt (< 5 min) so makes 0 fetch calls!
            await runPipelineTick();
            const badAfterTick1 = getJSONData().testSubmissions.find(s => s._id === subWorkerCleanBadEmailMongo);
            const badTick1Timestamp = badAfterTick1?.emailsSent?.lastAttemptAt;

            // Tick 2: permanent missing-email error & <5m cooldown are both skipped (timestamp unchanged, 0 fetch calls)
            await runPipelineTick();
            const sendsAfterTicks = fetchCtrl.getStats().sendFetchCount;
            const badAfterTick2 = getJSONData().testSubmissions.find(s => s._id === subWorkerCleanBadEmailMongo);
            const coolAfterTick2 = getJSONData().testSubmissions.find(s => s._id === subWorkerCleanCooldownMongo);

            // Backdate cooldown past 5 minutes -> Tick 3 dispatches cleanly
            {
                const dbExpiredCool = getJSONData();
                const coolSub = dbExpiredCool.testSubmissions.find(s => s._id === subWorkerCleanCooldownMongo);
                if (coolSub && coolSub.emailsSent) {
                    coolSub.emailsSent.lastAttemptAt = new Date(Date.now() - 6 * 60 * 1000).toISOString();
                }
                saveJSONData(dbExpiredCool);
            }
            await runPipelineTick();
            const sendsAfterExpiredCool = fetchCtrl.getStats().sendFetchCount;
            const coolAfterRecovery = getJSONData().testSubmissions.find(s => s._id === subWorkerCleanCooldownMongo);

            check(
                sendsAfterTicks === sendsBeforeCleanGuard &&
                String(badAfterTick1?.emailsSent?.lastError || '').includes('missing or invalid') &&
                badAfterTick2?.emailsSent?.lastAttemptAt === badTick1Timestamp &&
                coolAfterTick2?.emailsSent?.lastAttemptAt === freshCooldownIso &&
                !coolAfterTick2?.emailsSent?.testSubmitted &&
                sendsAfterExpiredCool === sendsBeforeCleanGuard + 1 &&
                coolAfterRecovery?.emailsSent?.testSubmitted === true,
                'G4.6: Worker skips permanent missing-email failure & respects 5-min cooldown until expiry cleanly'
            );
        }

        // ============================================================
        // GROUP 5: OTP & Change-Password Auth, IDOR, Rollback & Edge Cases
        // ============================================================
        console.log('\n[Group 5] OTP & Change-Password Auth, IDOR, Cooldown Rollback & Edge Cases...');

        const unauthSendOtp = await httpRequest('POST', `/api/candidate/send-verification-code/${candABics}?apiSecret=qwertty`, {});
        const unauthVerifyOtp = await httpRequest('POST', `/api/candidate/verify-code/${candABics}`, { code: '123456' });
        const idorSendOtp = await httpRequest('POST', `/api/candidate/send-verification-code/${candBBics}`, {}, { Authorization: `Bearer ${studentAJwt}` });
        const idorVerifyOtp = await httpRequest('POST', `/api/candidate/verify-code/${candBBics}`, { code: '123456' }, { Authorization: `Bearer ${studentAJwt}` });
        check(
            unauthSendOtp.status === 401 &&
            unauthVerifyOtp.status === 401 &&
            idorSendOtp.status === 403 &&
            idorVerifyOtp.status === 403,
            `G5.1 & G5.2: OTP routes enforce requireAuth (${unauthSendOtp.status}/${unauthVerifyOtp.status}) and block cross-student IDOR (${idorSendOtp.status}/${idorVerifyOtp.status})`
        );

        // Rollback OTP & 60s cooldown when Gmail fails 500 x3
        fetchCtrl.queueResponses({ status: 500 }, { status: 500 }, { status: 500 });
        const otpFailRes = await httpRequest('POST', `/api/candidate/send-verification-code/${candABics}`, {
            purpose: 'Hall Ticket Step 4'
        }, { Authorization: `Bearer ${studentAJwt}` });
        const candAAfterFail = getJSONData().candidates.find(c => c._id === candAMongo);
        check(
            otpFailRes.status === 502 &&
            otpFailRes.body?.waitSec === 0 &&
            otpFailRes.body?.cooldownSec === 0 &&
            !candAAfterFail.verificationCode &&
            !candAAfterFail.lastVerificationCodeSentAt,
            'G5.3: Failed OTP email returns 502 with waitSec: 0 and rolls back verificationCode & 60s cooldown cleanly'
        );

        // Immediate recovery send succeeds 200; second send hits 429 cooldown; no OTP leaked in EmailLog
        const otpOkRes = await httpRequest('POST', `/api/candidate/send-verification-code/${candABics}`, {
            purpose: 'Hall Ticket Step 4'
        }, { Authorization: `Bearer ${studentAJwt}` });
        const candAWithOtp = getJSONData().candidates.find(c => c._id === candAMongo);
        const liveOtp1 = candAWithOtp.verificationCode;
        const otpMail = fetchCtrl.capturedEmails[fetchCtrl.capturedEmails.length - 1];
        const otpCooldownRes = await httpRequest('POST', `/api/candidate/send-verification-code/${candABics}`, {}, { Authorization: `Bearer ${studentAJwt}` });
        const latestOtpLog = getJSONData().emailLogs.slice().reverse().find(l => l.emailType === 'verification_code' && l.status === 'sent');
        check(
            otpOkRes.status === 200 &&
            otpOkRes.body?.cooldownSec === 60 &&
            /^\d{6}$/.test(liveOtp1) &&
            otpMail.htmlDecoded.includes(liveOtp1) &&
            otpCooldownRes.status === 429 &&
            otpCooldownRes.body?.waitSec > 0 &&
            latestOtpLog &&
            !JSON.stringify(latestOtpLog).includes(liveOtp1),
            'G5.4: Recovery OTP succeeds (200), immediate repeat hits 429 cooldown, EmailLog NEVER stores plaintext OTP'
        );

        // Non-string code injection rejected cleanly (400), expired OTP cleared, 5 wrong attempts invalidates OTP (429)
        const nonStrVerify = await httpRequest('POST', `/api/candidate/verify-code/${candABics}`, { code: 123456, type: 'mid' }, { Authorization: `Bearer ${studentAJwt}` });
        const wrongAttempts = [];
        for (let i = 0; i < 5; i++) {
            const wRes = await httpRequest('POST', `/api/candidate/verify-code/${candABics}`, { code: '000000', type: 'mid' }, { Authorization: `Bearer ${studentAJwt}` });
            wrongAttempts.push(wRes.status);
        }
        const candAWiped = getJSONData().candidates.find(c => c._id === candAMongo);
        check(
            nonStrVerify.status === 400 &&
            wrongAttempts[0] === 400 &&
            wrongAttempts[3] === 400 &&
            wrongAttempts[4] === 429 &&
            !candAWiped.verificationCode,
            'G5.5: Non-string code returns 400; 5 wrong attempts invalidate OTP and return 429'
        );

        // Expired OTP clears stale verificationCode in db.json
        {
            const dbExp = getJSONData();
            const ca = dbExp.candidates.find(c => c._id === candAMongo);
            ca.verificationCode = '112233';
            ca.verificationCodeExpires = new Date(Date.now() - 60000).toISOString();
            ca.verificationAttempts = 0;
            saveJSONData(dbExp);
        }
        const expVerifyRes = await httpRequest('POST', `/api/candidate/verify-code/${candABics}`, { code: '112233', type: 'mid' }, { Authorization: `Bearer ${studentAJwt}` });
        const candAClearedExp = getJSONData().candidates.find(c => c._id === candAMongo);
        check(
            expVerifyRes.status === 400 && !candAClearedExp.verificationCode,
            'G5.6: Expired OTP returns 400 and persists cleared verificationCode in database'
        );

        // Valid OTP sets midSemEmailVerified & strips secrets from response
        {
            const dbVal = getJSONData();
            const ca = dbVal.candidates.find(c => c._id === candAMongo);
            ca.verificationCode = '778899';
            ca.verificationCodeExpires = new Date(Date.now() + 300000).toISOString();
            ca.verificationAttempts = 0;
            ca.lastVerificationCodeSentAt = null;
            saveJSONData(dbVal);
        }
        const validVerifyRes = await httpRequest('POST', `/api/candidate/verify-code/${candABics}`, { code: '778899', type: 'mid' }, { Authorization: `Bearer ${studentAJwt}` });
        check(
            validVerifyRes.status === 200 &&
            validVerifyRes.body?.student?.midSemEmailVerified === true &&
            !('verificationCode' in (validVerifyRes.body?.student || {})) &&
            !('password' in (validVerifyRes.body?.student || {})),
            'G5.7: Valid OTP returns 200, sets midSemEmailVerified=true, strips password & verificationCode'
        );

        // /api/change-password auth, IDOR, admin block, non-string 400 & valid password update
        const cpUnauth = await httpRequest('POST', '/api/change-password', { id: candABics, code: '123456', newPassword: 'NewPass123!' });
        const cpIdor = await httpRequest('POST', '/api/change-password', { id: candBBics, code: '123456', newPassword: 'NewPass123!' }, { Authorization: `Bearer ${studentAJwt}` });
        const cpAdmin = await httpRequest('POST', '/api/change-password', { role: 'admin', newPassword: 'NewPass123!', code: '123456' }, { Authorization: `Bearer ${adminJwt}` });
        const cpNonStr = await httpRequest('POST', '/api/change-password', { id: candABics, newPassword: 'NewPass123!', code: 778899 }, { Authorization: `Bearer ${studentAJwt}` });

        const cpOtpSend = await httpRequest('POST', `/api/candidate/send-verification-code/${candABics}`, { purpose: 'Password Reset' }, { Authorization: `Bearer ${studentAJwt}` });
        const cpOtpCode = getJSONData().candidates.find(c => c._id === candAMongo).verificationCode;
        const cpOk = await httpRequest('POST', '/api/change-password', { id: candABics, newPassword: 'UpdatedPassword2026!', code: cpOtpCode }, { Authorization: `Bearer ${studentAJwt}` });
        const cpLoginCheck = await httpRequest('POST', '/api/login', { username: 'aarav.p4', password: 'UpdatedPassword2026!' });
        check(
            cpUnauth.status === 401 &&
            cpIdor.status === 403 &&
            cpAdmin.status === 403 &&
            String(cpAdmin.body?.error || '').includes('.env') &&
            cpNonStr.status === 400 &&
            cpOtpSend.status === 200 &&
            cpOk.status === 200 &&
            cpLoginCheck.status === 200 &&
            Boolean(cpLoginCheck.body?.token),
            'G5.8: POST /change-password enforces auth/IDOR/admin-.env-block/string-OTP & updates bcrypt password for login'
        );

        // ============================================================
        // GROUP 6: Unified Admin Email Center (/api/admin/emails/*)
        // ============================================================
        console.log('\n[Group 6] Unified Admin Email Center (/api/admin/emails/*)...');

        // Prepare crisp Email Center state covering failed logs, secret token redaction & unsent pending lifecycle items
        {
            const dbG6 = getJSONData();
            // Reset retry fixture flags so we can retry all 6 types through /api/admin/emails/retry
            const resetSub = (id, clearSent = true) => {
                const s = dbG6.testSubmissions.find(x => x._id === id);
                if (s && clearSent) s.emailsSent = {};
            };
            resetSub(subTemplateCheckMongo, true);
            resetSub(subEirfFilingMongo, true);
            resetSub(subEirfApprovedMongo, true);
            resetSub(subEirfRejectedMongo, true);
            resetSub(subBatchOtrf1Mongo, false);
            const sBatch1 = dbG6.testSubmissions.find(x => x._id === subBatchOtrf1Mongo);
            if (sBatch1) sBatch1.emailsSent = { testSubmitted: true, otrfSent: false };

            const appRep = dbG6.eirfReports.find(r => r.reportId === 'EIRF-2026-APP401');
            if (appRep) appRep.emailsSent = {};
            const rejRep = dbG6.eirfReports.find(r => r.reportId === 'EIRF-2026-REJ402');
            if (rejRep) rejRep.emailsSent = {};

            // Seed failed logs across test_submitted, eirf_filing (with raw token secret to verify redaction), eirf_approved, eirf_rejected, otrf_sent
            dbG6.emailLogs = [
                {
                    _id: new ObjectId().toString(),
                    emailType: 'test_submitted',
                    status: 'failed',
                    transport: 'gmail_rest_api',
                    attempts: 1,
                    lastError: 'Gmail API HTTP 503 temporary outage',
                    lastAttemptAt: nowIso,
                    recipientEmail: 'aarav.p4@example.com',
                    recipientName: 'Aarav Sharma',
                    subject: 'Test Submission Confirmation: Exam (202604010001)',
                    candidateId: candAMongo,
                    studentId: '24BICS401',
                    testId: testIdCleanMongo,
                    submissionId: subTemplateCheckMongo,
                    submissionRefId: '202604010001'
                },
                {
                    _id: new ObjectId().toString(),
                    emailType: 'eirf_filing',
                    status: 'failed',
                    transport: 'gmail_rest_api',
                    attempts: 1,
                    lastError: 'Link https://bicsportal.netlify.app/assessment/evaluation/eirf/sub?token=SECRET_HEX_DO_NOT_LEAK timed out',
                    lastAttemptAt: nowIso,
                    recipientEmail: 'diya.p4@example.com',
                    recipientName: 'Diya Patel',
                    subject: 'URGENT Filing Notice ?token=ANOTHER_SECRET_XYZ',
                    candidateId: candBMongo,
                    studentId: '24BICS402',
                    testId: testIdCleanMongo,
                    submissionId: subEirfFilingMongo,
                    submissionRefId: '202604010002'
                },
                {
                    _id: new ObjectId().toString(),
                    emailType: 'eirf_approved',
                    status: 'failed',
                    transport: 'gmail_rest_api',
                    attempts: 1,
                    lastError: 'Gmail timeout',
                    lastAttemptAt: nowIso,
                    recipientEmail: 'aarav.p4@example.com',
                    recipientName: 'Aarav Sharma',
                    subject: 'EIRF Verdict Notice: APPROVED',
                    candidateId: candAMongo,
                    studentId: '24BICS401',
                    testId: testIdCleanMongo,
                    submissionId: subEirfApprovedMongo,
                    submissionRefId: '202604010003',
                    reportId: 'EIRF-2026-APP401'
                },
                {
                    _id: new ObjectId().toString(),
                    emailType: 'eirf_rejected',
                    status: 'failed',
                    transport: 'gmail_rest_api',
                    attempts: 1,
                    lastError: 'Gmail timeout',
                    lastAttemptAt: nowIso,
                    recipientEmail: 'diya.p4@example.com',
                    recipientName: 'Diya Patel',
                    subject: 'EIRF Verdict Notice: REJECTED',
                    candidateId: candBMongo,
                    studentId: '24BICS402',
                    testId: testIdCleanMongo,
                    submissionId: subEirfRejectedMongo,
                    submissionRefId: '202604010004',
                    reportId: 'EIRF-2026-REJ402'
                }
            ];
            saveJSONData(dbG6);
        }

        const unauthAdminFeed = await httpRequest('GET', '/api/admin/emails');
        const studAdminFeed = await httpRequest('GET', '/api/admin/emails', null, { Authorization: `Bearer ${studentAJwt}` });
        const studAdminRetry = await httpRequest('POST', '/api/admin/emails/retry', { emailType: 'test_submitted', targetId: subTemplateCheckMongo }, { Authorization: `Bearer ${studentAJwt}` });
        const studAdminBatch = await httpRequest('POST', `/api/admin/emails/dispatch-otrf/${testClosedBics}`, {}, { Authorization: `Bearer ${studentAJwt}` });
        check(
            unauthAdminFeed.status === 401 &&
            studAdminFeed.status === 403 &&
            studAdminRetry.status === 403 &&
            studAdminBatch.status === 403,
            'G6.1: /api/admin/emails/* strictly blocks unauth (401) and non-admin student JWTs (403)'
        );

        const feedRes = await httpRequest('GET', '/api/admin/emails?limit=200', null, { Authorization: `Bearer ${adminJwt}` });
        const feedJsonStr = JSON.stringify(feedRes.body || {});
        const feedItems = feedRes.body?.items || [];

        const idFields = feedItems.flatMap(it => [
            it._id, it.id, it.logId, it.candidateId, it.testId, it.submissionId, it.retriedFromLogId
        ]).filter(Boolean);
        const hasRawMongoId = idFields.some(v => /^[a-f0-9]{24}$/i.test(String(v)));
        const closedTestRow = (feedRes.body?.closedTests || []).find(t => t.testId === testClosedBics);
        const dupFilingPending = feedItems.some(it => it.isSyntheticPending && it.emailType === 'eirf_filing' && it.submissionRefId === '202604010002');
        const hasSyntheticOtrfPending = feedItems.some(it => it.isSyntheticPending && it.emailType === 'otrf_sent' && it.submissionRefId === '202604010006');

        // Also test filtering by emailType and search
        const filteredFilingRes = await httpRequest('GET', '/api/admin/emails?emailType=eirf_filing&status=failed&search=diya.p4', null, { Authorization: `Bearer ${adminJwt}` });

        check(
            feedRes.status === 200 &&
            feedRes.body?.success === true &&
            Array.isArray(feedRes.body?.emailTypes) &&
            feedRes.body.emailTypes.length === 6 &&
            !hasRawMongoId &&
            !feedJsonStr.includes('SECRET_HEX_DO_NOT_LEAK') &&
            !feedJsonStr.includes('ANOTHER_SECRET_XYZ') &&
            feedJsonStr.includes('[REDACTED]') &&
            !dupFilingPending &&
            hasSyntheticOtrfPending &&
            Boolean(closedTestRow) &&
            closedTestRow.pendingOtrfCount >= 1 &&
            filteredFilingRes.status === 200 &&
            filteredFilingRes.body?.items?.length === 1 &&
            filteredFilingRes.body.items[0].emailType === 'eirf_filing',
            'G6.2: GET /api/admin/emails returns BICSID-safe feed, redacts token secrets, synthesizes unsent pending without duplicating failed logs, and filters cleanly'
        );

        // POST /api/admin/emails/retry across ALL 6 types
        const findLogId = (emailType) => feedItems.find(it => !it.isSyntheticPending && it.emailType === emailType)?.logId || '';

        const retryOtpRes = await httpRequest('POST', '/api/admin/emails/retry', {
            emailType: 'verification_code',
            targetId: candABics,
            purpose: 'Admin Support Verification'
        }, { Authorization: `Bearer ${adminJwt}` });
        const adminIssuedOtp = getJSONData().candidates.find(c => c._id === candAMongo).verificationCode;
        const adminVerifyOtpCheck = await httpRequest('POST', `/api/candidate/verify-code/${candABics}`, { code: adminIssuedOtp, type: 'end' }, { Authorization: `Bearer ${studentAJwt}` });

        const retryTestSubRes = await httpRequest('POST', '/api/admin/emails/retry', {
            logId: findLogId('test_submitted'),
            emailType: 'test_submitted',
            targetId: toBicsId(subTemplateCheckMongo)
        }, { Authorization: `Bearer ${adminJwt}` });

        const retryFilingRes = await httpRequest('POST', '/api/admin/emails/retry', {
            logId: findLogId('eirf_filing'),
            emailType: 'eirf_filing',
            targetId: toBicsId(subEirfFilingMongo)
        }, { Authorization: `Bearer ${adminJwt}` });

        const retryApprovedRes = await httpRequest('POST', '/api/admin/emails/retry', {
            logId: findLogId('eirf_approved'),
            emailType: 'eirf_approved',
            targetId: 'EIRF-2026-APP401'
        }, { Authorization: `Bearer ${adminJwt}` });

        const retryRejectedRes = await httpRequest('POST', '/api/admin/emails/retry', {
            logId: findLogId('eirf_rejected'),
            emailType: 'eirf_rejected',
            targetId: 'EIRF-2026-REJ402'
        }, { Authorization: `Bearer ${adminJwt}` });

        const retryOtrfRes = await httpRequest('POST', '/api/admin/emails/retry', {
            emailType: 'otrf_sent',
            targetId: toBicsId(subBatchOtrf1Mongo)
        }, { Authorization: `Bearer ${adminJwt}` });

        const dbPostRetries = getJSONData();
        const updatedTestSubLog = dbPostRetries.emailLogs.find(l => l.submissionId === subTemplateCheckMongo && l.emailType === 'test_submitted');
        check(
            retryOtpRes.status === 200 && retryOtpRes.body?.success &&
            !JSON.stringify(retryOtpRes.body).includes(adminIssuedOtp) &&
            adminVerifyOtpCheck.status === 200 &&
            retryTestSubRes.status === 200 && retryTestSubRes.body?.success &&
            updatedTestSubLog?.status === 'sent' && updatedTestSubLog?.attempts === 2 &&
            retryFilingRes.status === 200 && retryFilingRes.body?.success &&
            retryApprovedRes.status === 200 && retryApprovedRes.body?.success &&
            retryRejectedRes.status === 200 && retryRejectedRes.body?.success &&
            retryOtrfRes.status === 200 && retryOtrfRes.body?.success &&
            dbPostRetries.testSubmissions.find(s => s._id === subBatchOtrf1Mongo).emailsSent?.otrfSent === true,
            'G6.3: POST /api/admin/emails/retry dispatches & marks sent across all 6 canonical types while hiding OTP secrets'
        );

        // POST /api/admin/emails/dispatch-otrf/:testId -> 400 on non-closed, 404 on missing, 200 on closed
        const badStatusOtrf = await httpRequest('POST', `/api/admin/emails/dispatch-otrf/${testReleasedBics}`, {}, { Authorization: `Bearer ${adminJwt}` });
        const missingTestOtrf = await httpRequest('POST', `/api/admin/emails/dispatch-otrf/${toBicsId(new ObjectId().toString())}`, {}, { Authorization: `Bearer ${adminJwt}` });

        // Reset otrfSent on subBatchOtrf1Mongo to verify dispatch-otrf clears it to 0 pending valid submissions
        {
            const dbOtrfPrep = getJSONData();
            const sb1 = dbOtrfPrep.testSubmissions.find(s => s._id === subBatchOtrf1Mongo);
            if (sb1) sb1.emailsSent.otrfSent = false;
            const shist = dbOtrfPrep.testSubmissions.find(s => s._id === subOtrfHistoricalMongo);
            if (shist) shist.emailsSent.otrfSent = false;
            saveJSONData(dbOtrfPrep);
        }
        const okBatchOtrf = await httpRequest('POST', `/api/admin/emails/dispatch-otrf/${testClosedBics}`, {}, { Authorization: `Bearer ${adminJwt}` });
        check(
            badStatusOtrf.status === 400 &&
            missingTestOtrf.status === 404 &&
            okBatchOtrf.status === 200 &&
            okBatchOtrf.body?.success === true &&
            okBatchOtrf.body?.dispatched === 2,
            `G6.4: POST /dispatch-otrf enforces closed status (400/404) & dispatches pending OTRF batch (dispatched=${okBatchOtrf.body?.dispatched})`
        );

        // POST /api/admin/emails/retry-failed bulk recovery
        {
            const dbBulk = getJSONData();
            const sBulk = dbBulk.testSubmissions.find(s => s._id === subTemplateCheckMongo);
            if (sBulk) sBulk.emailsSent.testSubmitted = false;
            const repBulk = dbBulk.eirfReports.find(r => r.reportId === 'EIRF-2026-APP401');
            if (repBulk) repBulk.emailsSent.approved = false;
            dbBulk.emailLogs.push(
                {
                    _id: new ObjectId().toString(),
                    emailType: 'test_submitted',
                    status: 'failed',
                    transport: 'gmail_rest_api',
                    attempts: 1,
                    lastError: 'Simulated transient error 1',
                    lastAttemptAt: nowIso,
                    recipientEmail: 'aarav.p4@example.com',
                    recipientName: 'Aarav Sharma',
                    subject: 'Bulk Test 1',
                    candidateId: candAMongo,
                    studentId: '24BICS401',
                    testId: testIdCleanMongo,
                    submissionId: subTemplateCheckMongo,
                    submissionRefId: '202604010001'
                },
                {
                    _id: new ObjectId().toString(),
                    emailType: 'eirf_approved',
                    status: 'failed',
                    transport: 'gmail_rest_api',
                    attempts: 1,
                    lastError: 'Simulated transient error 2',
                    lastAttemptAt: nowIso,
                    recipientEmail: 'aarav.p4@example.com',
                    recipientName: 'Aarav Sharma',
                    subject: 'Bulk Test 2',
                    candidateId: candAMongo,
                    studentId: '24BICS401',
                    testId: testIdCleanMongo,
                    submissionId: subEirfApprovedMongo,
                    submissionRefId: '202604010003',
                    reportId: 'EIRF-2026-APP401'
                }
            );
            saveJSONData(dbBulk);
        }
        const bulkRetryRes = await httpRequest('POST', '/api/admin/emails/retry-failed', {
            testId: testCleanBics,
            limit: 10
        }, { Authorization: `Bearer ${adminJwt}` });
        check(
            bulkRetryRes.status === 200 &&
            bulkRetryRes.body?.success === true &&
            bulkRetryRes.body?.retried >= 2 &&
            bulkRetryRes.body?.succeeded >= 2,
            `G6.5: POST /api/admin/emails/retry-failed bulk recovers unresolved items cleanly (retried=${bulkRetryRes.body?.retried}, succeeded=${bulkRetryRes.body?.succeeded})`
        );

        console.log(`\n==============================================================`);
        console.log(`   PILLAR 4 SUITE COMPLETE: ${passed}/${total} CHECKS PASSED`);
        console.log(`==============================================================\n`);
    } finally {
        stopEirfPipelineWorker();
        stopSubmissionReaper();
        if (server) {
            await new Promise(resolve => server.close(resolve));
        }

        // Remove any OTRF PDF artifacts generated during test run
        if (fs.existsSync(otrfPublicDir)) {
            for (const f of fs.readdirSync(otrfPublicDir)) {
                if (!existingOtrfFiles.has(f)) {
                    try { fs.unlinkSync(path.join(otrfPublicDir, f)); } catch (_) {}
                }
            }
        }

        // Restore original db.json & environment
        if (dbBackup !== null) {
            fs.writeFileSync(DB_FILE, dbBackup, 'utf8');
        }
        dbState.useMongo = origUseMongo;
        dbState.isConnected = origIsConnected;
        global.fetch = origFetch;
        resetGmailTokenCache();

        for (const [k, v] of Object.entries(envBackup)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    }
}

runPillar4Suite()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('\n[PILLAR 4 TEST SUITE FAILED]', err);
        process.exit(1);
    });
