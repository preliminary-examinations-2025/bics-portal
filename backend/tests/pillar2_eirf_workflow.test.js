/**
 * Pillar 2 Comprehensive Verification Suite:
 * Complete EIRF Workflow, Email-Only Verdict PDFs, No-Appeal Finality & Hardening
 *
 * Verifies:
 * 0. Static Audits: No /media/eirf/ Netlify proxies, no .eirf client encryption/payload APIs,
 *    no candidate Verdict PDF links, Admin Bearer-JWT Blob Verdict PDF handlers, no appeals
 * 1. Deprecated Endpoints & Role/Auth Security:
 *    - apiSecret=qwertty rejected (401)
 *    - GET /api/test/eirf/public-key & POST /api/test/eirf/generate-payload return 410 Gone
 *    - Public GET /api/test/eirf/verdict-pdf/:id removed (401/404)
 *    - Spoofed ?role=admin rejected (403) without Admin JWT
 *    - Constant-time eirfToken enforcement (403 on wrong token)
 *    - Strict 3-tier ID separation (no rawSubmissionId leak; BICSID + 12-digit submissionRefId present)
 *    - Auto-healing of empty MCQ/RADIO/CHECKBOX options on /details
 * 2. Evidence Upload Hardening:
 *    - Rejects unauth (403), invalid extension .exe (400), expired window (410)
 *    - Accepts PNG/PDF, serves under /public/uploads/eirf_proofs/
 * 3. EIRF Submission, Dynamic Validation, Confirmation Email & 409 Conflict + Post-Filing Receipt:
 *    - Enforces dynamic questionnaire validation (400 on short/missing fields)
 *    - Accepts server-telemetry submission without .eirf payload (TELEMETRY_VERIFIED)
 *    - Dispatches deferred testSubmitted email cleanly (Option B: no redundant eirfConfirmation) -> UNDER_REVIEW
 *    - Duplicate POST /submit returns 409 Conflict
 *    - Post-45m expiry: GET /details still returns 200 (canSubmit: false) for filed report,
 *      while unfiled expired submission returns 410 Gone
 * 4. Admin EIRF Queue, Actions, Score Annulment & Admin-Only Verdict PDF:
 *    - GET /api/admin/eirf/list requires Admin JWT, filters deleted submissions/orphans, includes courseCode/submissionRefId
 *    - REJECT verdict sets verificationStatus='annulled', zeroes ALL score fields (score, totalScore, evaluation.*, answers[].score),
 *      embeds NO appeal link & NO /media/eirf/, dispatches eirf_rejected email with real PDF attachment
 *    - APPROVE verdict on an unfiled/expired flagged submission auto-synthesizes audit EIRFReport,
 *      sets verificationStatus='active', restores marks, dispatches eirf_approved email with PDF attachment
 *    - GET /api/admin/eirf/verdict-pdf/:reportId blocks student/unauth (401/403) and streams valid PDF to Admin
 * 5. Autonomous Pipeline Worker Ticks:
 *    - Skips soft-deleted submissions, dispatches CLEARED email cleanly, heals stranded QUEUED/'evaluated',
 *      generates canonical /assessment/evaluation/eirf/<BICSID>?token=... magic link without clobbering emailsSent
 */

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

process.env.NODE_ENV = 'test';
process.env.PORT = '5010';
process.env.JWT_SECRET = 'pillar2_test_jwt_secret_2026';
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASS = 'admin123';
process.env.GMAIL_CLIENT_ID = 'mock_client_id';
process.env.GMAIL_CLIENT_SECRET = 'mock_client_secret';
process.env.GMAIL_REFRESH_TOKEN = 'mock_refresh_token';
process.env.PORTAL_URL = 'https://bicsportal.netlify.app';

const { DB_FILE, dbState, getJSONData, saveJSONData } = require('../config/db');
const dbBackup = fs.existsSync(DB_FILE) ? fs.readFileSync(DB_FILE, 'utf8') : null;

const app = require('../server');
const { generateToken } = require('../utils/jwt');
const { toBicsId, isBicsId, generateSubmissionRefId } = require('../utils/bicsId');
const { stopSubmissionReaper } = require('../workers/submissionReaper');
const { runPipelineTick, stopEirfPipelineWorker } = require('../workers/eirfPipelineWorker');

const pipePath = `\\\\.\\pipe\\bics_p2_${process.pid}_${Date.now()}`;
const uploadedProofPaths = [];
const capturedEmails = [];

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

function uploadMultipartProof(urlPath, headers, fields = {}, fileInfo = null) {
    return new Promise((resolve, reject) => {
        const boundary = '----BicsPillar2Boundary' + Date.now() + Math.random().toString(16).slice(2);
        const parts = [];

        for (const [k, v] of Object.entries(fields)) {
            parts.push(Buffer.from(
                `--${boundary}\r\n` +
                `Content-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`,
                'utf8'
            ));
        }

        if (fileInfo) {
            parts.push(Buffer.from(
                `--${boundary}\r\n` +
                `Content-Disposition: form-data; name="${fileInfo.fieldName || 'file'}"; filename="${fileInfo.filename}"\r\n` +
                `Content-Type: ${fileInfo.mimeType}\r\n\r\n`,
                'utf8'
            ));
            parts.push(fileInfo.buffer);
            parts.push(Buffer.from('\r\n', 'utf8'));
        }

        parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
        const payload = Buffer.concat(parts);

        const req = http.request({
            socketPath: pipePath,
            path: urlPath,
            method: 'POST',
            headers: {
                Host: '127.0.0.1:5000',
                ...headers,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': payload.length
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                let parsed = data;
                try { parsed = JSON.parse(data); } catch (_) {}
                resolve({ status: res.statusCode, body: parsed });
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

function parseCapturedMime(rawBase64Url) {
    const stdB64 = rawBase64Url.replace(/-/g, '+').replace(/_/g, '/');
    const mimeStr = Buffer.from(stdB64, 'base64').toString('utf8');
    const toMatch = mimeStr.match(/^To:\s*(.+)$/m);
    const subjMatch = mimeStr.match(/^Subject:\s*=\?UTF-8\?B\?([^?]+)\?=/m);
    const subject = subjMatch ? Buffer.from(subjMatch[1], 'base64').toString('utf8') : '';

    // Decode text/html base64 section
    let htmlDecoded = '';
    const htmlSection = mimeStr.match(/Content-Type: text\/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n\r\n--/);
    if (htmlSection && htmlSection[1]) {
        htmlDecoded = Buffer.from(htmlSection[1].replace(/\s+/g, ''), 'base64').toString('utf8');
    }

    // Extract attachment metadata + decoded buffers
    const attachments = [];
    const attRegex = /Content-Disposition: attachment; filename="([^"]+)"\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n\r\n--/g;
    let m;
    while ((m = attRegex.exec(mimeStr)) !== null) {
        attachments.push({
            filename: m[1],
            buffer: Buffer.from(m[2].replace(/\s+/g, ''), 'base64')
        });
    }

    return {
        to: toMatch ? toMatch[1].trim() : '',
        subject,
        htmlDecoded,
        attachments,
        mimeStr
    };
}

function extractAllPdfText(buf) {
    let fullDecoded = '';
    let pos = 0;
    while ((pos = buf.indexOf('stream', pos)) !== -1) {
        let start = pos + 6;
        while (buf[start] === 10 || buf[start] === 13) start++;
        const end = buf.indexOf('endstream', start);
        if (end === -1) break;
        let dataEnd = end;
        while (buf[dataEnd - 1] === 10 || buf[dataEnd - 1] === 13) dataEnd--;
        const data = buf.slice(start, dataEnd);
        try {
            const inflated = zlib.inflateSync(data).toString('latin1');
            const hexMatches = inflated.match(/<[0-9a-fA-F]+>/g) || [];
            for (const h of hexMatches) {
                fullDecoded += Buffer.from(h.slice(1, -1), 'hex').toString('utf8');
            }
            const strMatches = inflated.match(/\(([^)]+)\)/g) || [];
            for (const s of strMatches) {
                fullDecoded += s.slice(1, -1);
            }
        } catch (_) {
            fullDecoded += data.toString('latin1');
        }
        pos = end + 9;
    }
    fullDecoded += ' ' + buf.toString('latin1');
    return fullDecoded;
}

async function runPillar2Suite() {
    console.log('\n==============================================================');
    console.log('   PILLAR 2: COMPLETE EIRF WORKFLOW & SECURITY VERIFICATION   ');
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
        // ============================================================
        // GROUP 0: Static Frontend, Redirects & Template Integrity
        // ============================================================
        console.log('[Group 0] Static Frontend, Redirects & Template Integrity...');
        const rootDir = path.resolve(__dirname, '..', '..');

        const mainRedirects = fs.readFileSync(path.join(rootDir, 'frontend/public/_redirects'), 'utf8');
        const otRedirects = fs.readFileSync(path.join(rootDir, 'frontend_ot/public/_redirects'), 'utf8');
        check(
            !mainRedirects.includes('/media/eirf/') && !otRedirects.includes('/media/eirf/'),
            'G0.1: Netlify _redirects files contain zero /media/eirf/* public Verdict PDF proxies'
        );

        const eirfCryptoSrc = fs.readFileSync(path.join(rootDir, 'frontend_ot/src/utils/eirfCrypto.js'), 'utf8');
        check(
            !eirfCryptoSrc.includes('fetchServerPublicKey') &&
            !eirfCryptoSrc.includes('encryptEirfEnvelope') &&
            eirfCryptoSrc.includes('encryptPendingStorage') &&
            eirfCryptoSrc.includes('decryptPendingStorage'),
            'G0.2: eirfCrypto.js removes .eirf RSA envelope APIs while preserving offline IndexedDB/storage encryption'
        );

        const otAppSrc = fs.readFileSync(path.join(rootDir, 'frontend_ot/src/App.jsx'), 'utf8');
        const eirfFormSrc = fs.readFileSync(path.join(rootDir, 'frontend_ot/src/views/EirfFormView.jsx'), 'utf8');
        check(
            !otAppSrc.includes('downloadEirfBackupFile') &&
            !otAppSrc.includes('encryptEirfPayloadClient') &&
            !otAppSrc.includes('fetchServerPublicKey') &&
            !eirfFormSrc.includes('Choose .eirf File') &&
            !eirfFormSrc.includes('encryptedPayload') &&
            eirfFormSrc.includes('submissionRefId') &&
            eirfFormSrc.includes('final and binding') &&
            eirfFormSrc.includes('loadEirfDetails(subId, token)'),
            'G0.3: OT App & EirfFormView remove .eirf upload UI, show submissionRefId & finality notice, and pass token on reload'
        );

        const proctorDashSrc = fs.readFileSync(path.join(rootDir, 'frontend/src/components/StudentProctorDashboard.jsx'), 'utf8');
        const adminProctSrc = fs.readFileSync(path.join(rootDir, 'frontend/src/pages/admin/AdminProctoring.jsx'), 'utf8');
        check(
            !proctorDashSrc.includes('/test/eirf/verdict-pdf/') &&
            !proctorDashSrc.includes('DISCREPANCY_FLAGGED') &&
            !proctorDashSrc.includes('?role=admin') &&
            proctorDashSrc.includes('/admin/eirf/verdict-pdf/') &&
            proctorDashSrc.includes('iframe') &&
            !adminProctSrc.includes('/test/eirf/verdict-pdf/') &&
            !adminProctSrc.includes('row.rawSubmissionId') &&
            adminProctSrc.includes('/admin/eirf/verdict-pdf/'),
            'G0.4: Admin UI uses Bearer-JWT Blob preview on /admin/eirf/verdict-pdf/, drops DISCREPANCY_FLAGGED & rawSubmissionId, supports PDF proof preview'
        );

        const rejectedHtml = fs.readFileSync(path.join(rootDir, 'backend/templates/emails/eirf_rejected.html'), 'utf8');
        check(
            !rejectedHtml.includes('appeal_link') &&
            !rejectedHtml.includes('appeal_deadline') &&
            !rejectedHtml.includes('Submit an Appeal') &&
            rejectedHtml.includes('Final &amp; Binding (No Appeals Permitted)'),
            'G0.5: eirf_rejected.html removes all appeal links and enforces final & binding notice'
        );

        // ============================================================
        // Setup Isolated Test Database & HTTP Pipe + Gmail Mock
        // ============================================================
        dbState.useMongo = false;
        dbState.isConnected = true;

        global.fetch = async (url, opts = {}) => {
            const urlStr = String(url || '');
            if (urlStr.includes('oauth2.googleapis.com/token')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ access_token: 'mock_gmail_token_p2', expires_in: 3600 })
                };
            }
            if (urlStr.includes('gmail.googleapis.com/gmail/v1/users/me/messages/send')) {
                const bodyObj = JSON.parse(opts.body || '{}');
                const parsed = parseCapturedMime(bodyObj.raw || '');
                capturedEmails.push(parsed);
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ id: `mock_msg_${capturedEmails.length}` })
                };
            }
            return origFetch ? origFetch(url, opts) : { ok: false, status: 500, text: async () => 'unmocked fetch' };
        };

        const candMongoId = '66a100000000000000002001';
        const candMongoId2 = '66a100000000000000002002';
        const testMongoId = '66b200000000000000002010';
        const subFiledMongoId = '66c300000000000000002101';
        const subExpiredUnfiledMongoId = '66c300000000000000002102';
        const subWorkerClearedMongoId = '66c300000000000000002103';
        const subWorkerFlaggedMongoId = '66c300000000000000002104';
        const subDeletedMongoId = '66c300000000000000002105';

        const subFiledBicsId = toBicsId(subFiledMongoId);
        const subExpiredUnfiledBicsId = toBicsId(subExpiredUnfiledMongoId);
        const subClearedBicsId = toBicsId(subWorkerClearedMongoId);
        const subFlaggedBicsId = toBicsId(subWorkerFlaggedMongoId);
        const subDeletedBicsId = toBicsId(subDeletedMongoId);

        const filedRefId = generateSubmissionRefId();
        const expiredRefId = generateSubmissionRefId();
        const clearedRefId = generateSubmissionRefId();
        const flaggedRefId = generateSubmissionRefId();
        const deletedRefId = generateSubmissionRefId();

        const validEirfToken = crypto.randomBytes(24).toString('hex');
        const expiredEirfToken = crypto.randomBytes(24).toString('hex');
        const deletedEirfToken = crypto.randomBytes(24).toString('hex');

        const futureExpiry = new Date(Date.now() + 40 * 60 * 1000).toISOString();
        const pastExpiry = new Date(Date.now() - 10 * 60 * 1000).toISOString();

        saveJSONData({
            candidates: [
                {
                    _id: candMongoId,
                    id: candMongoId,
                    studentId: 'BICS-P2-001',
                    name: 'Aarav Sharma',
                    username: 'aarav.p2',
                    personalEmail: 'aarav.p2@example.com',
                    registrationData: {
                        personalEmail: 'aarav.p2@example.com',
                        fullName: 'Aarav Sharma'
                    }
                },
                {
                    _id: candMongoId2,
                    id: candMongoId2,
                    studentId: 'BICS-P2-002',
                    name: 'Diya Patel',
                    username: 'diya.p2',
                    personalEmail: 'diya.p2@example.com',
                    registrationData: {
                        personalEmail: 'diya.p2@example.com',
                        fullName: 'Diya Patel'
                    }
                }
            ],
            tests: [
                {
                    _id: testMongoId,
                    id: testMongoId,
                    title: 'Comprehensive Algorithms & Systems Exam',
                    courseCode: 'R526CS01T',
                    courseName: 'Comprehensive Algorithms & Systems',
                    duration: 60,
                    totalMarks: 100,
                    isPublished: true
                }
            ],
            testSubmissions: [
                {
                    _id: subFiledMongoId,
                    id: subFiledMongoId,
                    submissionRefId: filedRefId,
                    candidateId: candMongoId,
                    studentId: 'BICS-P2-001',
                    candidateName: 'Aarav Sharma',
                    testId: testMongoId,
                    testTitle: 'Comprehensive Algorithms & Systems Exam',
                    status: 'auto-submitted',
                    hasEirfFlag: true,
                    eirfStatus: 'pending',
                    pipelineStatus: 'AWAITING_EIRF',
                    eirfToken: validEirfToken,
                    eirfExpiresAt: futureExpiry,
                    eirfNoticeEmailSent: true,
                    verificationStatus: 'pending_review',
                    submittedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
                    score: 78,
                    totalScore: 78,
                    evaluation: {
                        mcqScore: 28,
                        codingScore: 30,
                        webScore: 20,
                        score: 78,
                        totalScore: 78,
                        percentage: 78
                    },
                    answers: [
                        { questionId: 'Q1', type: 'mcq', score: 28, aiEvaluation: { score: 28 } },
                        { questionId: 'Q2', type: 'coding', score: 30, aiEvaluation: { score: 30 } },
                        { questionId: 'Q3', type: 'web', score: 20 }
                    ],
                    proctoringLog: {
                        fullscreenExits: 2,
                        tabSwitches: 1,
                        warnings: 3,
                        events: [
                            { type: 'FULLSCREEN_EXIT', durationSeconds: 14, details: 'Candidate exited fullscreen for 14 seconds', timestamp: new Date().toISOString() },
                            { type: 'TAB_SWITCH', durationSeconds: 9, details: 'Tab focus lost for 9 seconds', timestamp: new Date().toISOString() }
                        ]
                    },
                    flaggedReasons: ['Fullscreen exit duration: 14 seconds (exceeds 5s threshold)', 'Tab switch duration: 9 seconds (exceeds 5s threshold)'],
                    generatedQuestions: [
                        { questionId: 'Q1', questionType: 'RADIO', questionText: 'Primary cause of disruption?', options: [], isRequired: true },
                        { questionId: 'Q2', questionType: 'TEXT', questionText: 'Explain the interruption between 14s fullscreen exit and tab switch.', isRequired: true },
                        { questionId: 'Q3', questionType: 'CHECKBOX', questionText: 'Which active background alerts or tools were running?', options: [], isRequired: true },
                        { questionId: 'Q4', questionType: 'FILE_UPLOAD', questionText: 'Upload supporting disruption evidence (image or PDF).', isRequired: true }
                    ]
                },
                {
                    _id: subExpiredUnfiledMongoId,
                    id: subExpiredUnfiledMongoId,
                    submissionRefId: expiredRefId,
                    candidateId: candMongoId2,
                    studentId: 'BICS-P2-002',
                    candidateName: 'Diya Patel',
                    testId: testMongoId,
                    testTitle: 'Comprehensive Algorithms & Systems Exam',
                    status: 'auto-submitted',
                    hasEirfFlag: true,
                    eirfStatus: 'expired',
                    pipelineStatus: 'EXPIRED',
                    eirfToken: expiredEirfToken,
                    eirfExpiresAt: pastExpiry,
                    eirfNoticeEmailSent: true,
                    verificationStatus: 'pending_review',
                    submittedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
                    score: 64,
                    totalScore: 64,
                    evaluation: { mcqScore: 34, codingScore: 30, webScore: 0, score: 64, totalScore: 64, percentage: 64 },
                    answers: [{ questionId: 'Q1', type: 'mcq', score: 34 }],
                    proctoringLog: { fullscreenExits: 1, tabSwitches: 2, warnings: 3, events: [{ type: 'FULLSCREEN_EXIT', durationSeconds: 22 }] },
                    flaggedReasons: ['Fullscreen exit duration: 22 seconds'],
                    generatedQuestions: []
                },
                {
                    _id: subWorkerClearedMongoId,
                    id: subWorkerClearedMongoId,
                    submissionRefId: clearedRefId,
                    candidateId: candMongoId,
                    studentId: 'BICS-P2-001',
                    candidateName: 'Aarav Sharma',
                    candidateEmail: 'aarav.p2@example.com',
                    testId: testMongoId,
                    testTitle: 'Comprehensive Algorithms & Systems Exam',
                    status: 'submitted',
                    hasEirfFlag: false,
                    eirfStatus: 'none',
                    pipelineStatus: 'CLEARED',
                    verificationStatus: 'active',
                    submittedAt: new Date().toISOString(),
                    score: 90,
                    totalScore: 90
                },
                {
                    _id: subWorkerFlaggedMongoId,
                    id: subWorkerFlaggedMongoId,
                    submissionRefId: flaggedRefId,
                    candidateId: candMongoId2,
                    studentId: 'BICS-P2-002',
                    candidateName: 'Diya Patel',
                    candidateEmail: 'diya.p2@example.com',
                    testId: testMongoId,
                    testTitle: 'Comprehensive Algorithms & Systems Exam',
                    status: 'evaluated',
                    pipelineStatus: 'QUEUED',
                    pipelineLock: { isLocked: false },
                    proctoringLog: {
                        fullscreenExits: 1,
                        tabSwitches: 1,
                        warnings: 3,
                        events: [{ type: 'TAB_SWITCH', durationSeconds: 19, details: 'Tab switched for 19 seconds' }]
                    }
                },
                {
                    _id: subDeletedMongoId,
                    id: subDeletedMongoId,
                    submissionRefId: deletedRefId,
                    candidateId: candMongoId2,
                    studentId: 'BICS-P2-002',
                    candidateName: 'Deleted Candidate Record',
                    candidateEmail: 'deleted.p2@example.com',
                    testId: testMongoId,
                    testTitle: 'Comprehensive Algorithms & Systems Exam',
                    status: 'submitted',
                    hasEirfFlag: true,
                    eirfStatus: 'pending',
                    pipelineStatus: 'FLAGGED',
                    isDeleted: true,
                    pipelineLock: { isLocked: false }
                }
            ],
            eirfReports: [],
            tokens: []
        });

        server = http.createServer(app);
        await new Promise((resolve) => server.listen(pipePath, resolve));

        const adminJwt = generateToken({ id: 'admin', username: 'admin', role: 'admin' });
        const studentJwt = generateToken({ id: candMongoId, username: 'aarav.p2', studentId: 'BICS-P2-001', role: 'student' });

        // ============================================================
        // GROUP 1: Deprecated Endpoints, Security Gates & 3-Tier IDs
        // ============================================================
        console.log('\n[Group 1] Deprecated Endpoints, Auth & 3-Tier ID Enforcement...');

        const apiSecretTry = await httpRequest('GET', '/api/test/eirf/public-key?apiSecret=qwertty');
        check(apiSecretTry.status === 401 || apiSecretTry.status === 403, `G1.1: apiSecret=qwertty bypass rejected (got ${apiSecretTry.status})`);

        const pubKeyRes = await httpRequest('GET', '/api/test/eirf/public-key', null, { Authorization: `Bearer ${studentJwt}` });
        check(pubKeyRes.status === 410 && pubKeyRes.body?.deprecated === true, `G1.2: GET /public-key returns 410 Gone (got ${pubKeyRes.status})`);

        const genPayloadRes = await httpRequest('POST', '/api/test/eirf/generate-payload', { submissionId: subFiledBicsId }, { Authorization: `Bearer ${studentJwt}` });
        check(genPayloadRes.status === 410 && genPayloadRes.body?.deprecated === true, `G1.3: POST /generate-payload returns 410 Gone (got ${genPayloadRes.status})`);

        const oldPdfRouteUnauth = await httpRequest('GET', `/api/test/eirf/verdict-pdf/${subFiledBicsId}`);
        const oldPdfRouteAuth = await httpRequest('GET', `/api/test/eirf/verdict-pdf/${subFiledBicsId}`, null, { Authorization: `Bearer ${studentJwt}` });
        check(
            (oldPdfRouteUnauth.status === 401 || oldPdfRouteUnauth.status === 403) &&
            oldPdfRouteAuth.status === 404,
            `G1.4: Public GET /test/eirf/verdict-pdf/:id blocked unauth (${oldPdfRouteUnauth.status}) and removed even with student JWT (${oldPdfRouteAuth.status})`
        );

        const spoofAdminRes = await httpRequest('GET', `/api/test/eirf/details/${subFiledBicsId}?role=admin`, null, { Authorization: `Bearer ${studentJwt}` });
        check(spoofAdminRes.status === 403, `G1.5: Spoofed ?role=admin without admin JWT rejected with 403 (got ${spoofAdminRes.status})`);

        const badTokenRes = await httpRequest('GET', `/api/test/eirf/details/${subFiledBicsId}?token=wrong_bad_token_0000`);
        check(badTokenRes.status === 401 || badTokenRes.status === 403, `G1.6: Invalid eirfToken rejected cleanly (got ${badTokenRes.status})`);

        const detailsRes = await httpRequest('GET', `/api/test/eirf/details/${subFiledBicsId}?token=${validEirfToken}`);
        check(detailsRes.status === 200, `G1.7: Valid BICSID + eirfToken GET /details returns 200 (got ${detailsRes.status})`);
        check(!('rawSubmissionId' in detailsRes.body), 'G1.8: /details strips rawSubmissionId completely');
        check(isBicsId(detailsRes.body.bicsId) && detailsRes.body.bicsId === subFiledBicsId, 'G1.9: /details returns 6-4-4-6 BICSID');
        check(detailsRes.body.submissionRefId === filedRefId, 'G1.10: /details returns 12-digit submissionRefId');
        check(detailsRes.body.canSubmit === true, 'G1.11: /details marks unfiled active incident canSubmit: true');

        const healedQ1 = detailsRes.body.generatedQuestions.find(q => q.questionId === 'Q1');
        const healedQ3 = detailsRes.body.generatedQuestions.find(q => q.questionId === 'Q3');
        check(
            Array.isArray(healedQ1?.options) && healedQ1.options.length > 0 &&
            Array.isArray(healedQ3?.options) && healedQ3.options.length > 0,
            'G1.12: Auto-heals empty RADIO/CHECKBOX options dynamically on /details'
        );

        // ============================================================
        // GROUP 2: Evidence Proof Upload Hardening
        // ============================================================
        console.log('\n[Group 2] Evidence Upload Security & Storage...');

        const noTokUpload = await uploadMultipartProof('/api/test/eirf/upload-proof', {}, { submissionId: subFiledBicsId }, {
            fieldName: 'file', filename: 'test.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex')
        });
        check(noTokUpload.status === 401 || noTokUpload.status === 403, `G2.1: Upload without auth rejected (got ${noTokUpload.status})`);

        const badExtUpload = await uploadMultipartProof(
            `/api/test/eirf/upload-proof?token=${validEirfToken}`,
            { 'x-eirf-token': validEirfToken },
            { submissionId: subFiledBicsId, token: validEirfToken },
            { fieldName: 'file', filename: 'malware.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ90') }
        );
        check(badExtUpload.status === 400, `G2.2: Unsupported .exe file rejected with 400 (got ${badExtUpload.status})`);

        const expUpload = await uploadMultipartProof(
            `/api/test/eirf/upload-proof?token=${expiredEirfToken}`,
            { 'x-eirf-token': expiredEirfToken },
            { submissionId: subExpiredUnfiledBicsId, token: expiredEirfToken },
            { fieldName: 'file', filename: 'late.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') }
        );
        check(expUpload.status === 410, `G2.3: Upload on expired window rejected with 410 Gone (got ${expUpload.status})`);

        const validPngUpload = await uploadMultipartProof(
            `/api/test/eirf/upload-proof?token=${validEirfToken}`,
            { 'x-eirf-token': validEirfToken },
            { submissionId: subFiledBicsId, token: validEirfToken },
            { fieldName: 'file', filename: 'isp_outage.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex') }
        );
        check(validPngUpload.status === 200 && validPngUpload.body?.success === true, `G2.4: Valid PNG proof uploaded successfully (got ${validPngUpload.status})`);
        check(String(validPngUpload.body?.fileUrl || '').startsWith('/public/uploads/eirf_proofs/'), `G2.5: Local upload path matches /public static route (${validPngUpload.body?.fileUrl})`);
        if (validPngUpload.body?.fileUrl?.startsWith('/public/')) {
            uploadedProofPaths.push(path.join(rootDir, 'backend', validPngUpload.body.fileUrl));
        }

        // ============================================================
        // GROUP 3: EIRF Submit, Validation, Email Flow & 409/Receipt
        // ============================================================
        console.log('\n[Group 3] EIRF Submission, Email Dispatch, 409 Conflict & Post-Expiry Receipt...');

        const missingDynRes = await httpRequest('POST', '/api/test/eirf/submit', {
            submissionId: subFiledBicsId,
            token: validEirfToken,
            primaryCause: healedQ1.options[0],
            detailedExplanation: 'Short answer',
            formAnswers: { Q1: healedQ1.options[0], Q2: 'Too short' }
        }, { 'x-eirf-token': validEirfToken });
        check(missingDynRes.status === 400, `G3.1: Short/incomplete required dynamic questionnaire fails with 400 (got ${missingDynRes.status})`);

        const emailsBeforeSubmit = capturedEmails.length;
        const submitPayload = {
            submissionId: subFiledBicsId,
            token: validEirfToken,
            primaryCause: healedQ1.options[0],
            detailedExplanation: 'My local broadband disconnected cleanly and triggered the browser warning overlay for 14 seconds before hotspot recovery.',
            formAnswers: {
                Q1: healedQ1.options[0],
                Q2: 'Broadband router dropped packets for 14 seconds; immediately reconnected via USB mobile tethering hotspot.',
                Q3: [healedQ3.options[0]],
                Q4: {
                    uploaded: true,
                    fileUrl: validPngUpload.body.fileUrl,
                    fileName: 'isp_outage.png',
                    fileSize: 16,
                    mimeType: 'image/png'
                },
                declarationChecked: true
            },
            technicalContext: {
                browser: 'Mozilla/5.0 Chrome/126.0',
                os: 'Windows 10/11 x64',
                platform: 'Win32',
                screenResolution: '1920x1080',
                viewportSize: '1920x960',
                hardwareConcurrency: 8
            }
        };

        const submitRes = await httpRequest('POST', '/api/test/eirf/submit', submitPayload, { 'x-eirf-token': validEirfToken });
        check(submitRes.status === 200 && submitRes.body?.success === true, `G3.2: Valid server-telemetry submit succeeds (got ${submitRes.status})`);
        check(submitRes.body.verificationStatus === 'TELEMETRY_VERIFIED', 'G3.3: Verification status is TELEMETRY_VERIFIED (no .eirf payload required)');
        check(submitRes.body.pipelineStatus === 'UNDER_REVIEW', `G3.4: Synchronous email dispatch advances pipeline to UNDER_REVIEW (got ${submitRes.body.pipelineStatus})`);
        const filedReportId = submitRes.body.reportId;
        check(/^EIRF-2026-[A-Z0-9]+$/i.test(filedReportId), `G3.5: Assigned formal reportId (${filedReportId})`);

        const emailsAfterSubmit = capturedEmails.slice(emailsBeforeSubmit);
        check(
            emailsAfterSubmit.length === 1 &&
            (emailsAfterSubmit[0].subject.includes('Submission Confirmed') || emailsAfterSubmit[0].subject.includes('Submission Confirmation')) &&
            !emailsAfterSubmit.some(e => e.subject.includes('Incident Report Received')),
            `G3.6: Dispatched single deferred testSubmitted confirmation email (Option B; captured ${emailsAfterSubmit.length})`
        );

        const dupSubmitRes = await httpRequest('POST', '/api/test/eirf/submit', submitPayload, { 'x-eirf-token': validEirfToken });
        check(dupSubmitRes.status === 409 && dupSubmitRes.body?.alreadySubmitted === true, `G3.7: Duplicate submission returns 409 Conflict (got ${dupSubmitRes.status})`);

        // Simulate 45-minute window expiration AFTER filing
        const dbNow = getJSONData();
        const filedSubIdx = dbNow.testSubmissions.findIndex(s => s._id === subFiledMongoId);
        dbNow.testSubmissions[filedSubIdx].eirfExpiresAt = pastExpiry;
        saveJSONData(dbNow);

        const postExpiryFiledDetails = await httpRequest('GET', `/api/test/eirf/details/${subFiledBicsId}?token=${validEirfToken}`);
        check(
            postExpiryFiledDetails.status === 200 &&
            postExpiryFiledDetails.body.existingReport?.reportId === filedReportId &&
            postExpiryFiledDetails.body.isExpired === true &&
            postExpiryFiledDetails.body.canSubmit === false,
            'G3.8: Post-expiry GET /details for ALREADY FILED report stays accessible (200) in read-only receipt mode (canSubmit: false)'
        );

        const postExpiryUnfiledDetails = await httpRequest('GET', `/api/test/eirf/details/${subExpiredUnfiledBicsId}?token=${expiredEirfToken}`);
        check(postExpiryUnfiledDetails.status === 410, `G3.9: Unfiled expired GET /details returns 410 Gone (got ${postExpiryUnfiledDetails.status})`);

        // ============================================================
        // GROUP 4: Admin EIRF Queue, Adjudication, Annulment & Verdict PDF
        // ============================================================
        console.log('\n[Group 4] Admin Queue, Reject Score Annulment, Approve Unfiled & Admin-Only Verdict PDF...');

        const unauthListRes = await httpRequest('GET', '/api/admin/eirf/list');
        check(unauthListRes.status === 401, `G4.1: Unauthenticated admin queue rejected (401)`);

        const studListRes = await httpRequest('GET', '/api/admin/eirf/list', null, { Authorization: `Bearer ${studentJwt}` });
        check(studListRes.status === 403, `G4.2: Student JWT rejected on admin queue (403)`);

        const adminListRes = await httpRequest('GET', '/api/admin/eirf/list', null, { Authorization: `Bearer ${adminJwt}` });
        check(adminListRes.status === 200 && Array.isArray(adminListRes.body), 'G4.3: Admin JWT loads EIRF queue (200)');
        const deletedInQueue = adminListRes.body.find(r => r.bicsId === subDeletedBicsId);
        check(!deletedInQueue, 'G4.4: Soft-deleted (isDeleted) submission excluded from admin queue');
        const filedQueueRow = adminListRes.body.find(r => r.reportId === filedReportId);
        check(
            filedQueueRow &&
            !('rawSubmissionId' in filedQueueRow) &&
            isBicsId(filedQueueRow.bicsId) &&
            filedQueueRow.submissionRefId === filedRefId &&
            filedQueueRow.courseCode === 'R526CS01T' &&
            filedQueueRow.isExpired === false,
            'G4.5: Queue row enforces BICSID/submissionRefId, hides rawSubmissionId, preserves courseCode, and clears isExpired for filed reports'
        );

        // Admin REJECTS filed report -> score annulment + no-appeal verdict email + PDF attachment
        const emailsBeforeReject = capturedEmails.length;
        const rejectRes = await httpRequest('POST', `/api/admin/eirf/action/${filedReportId}`, {
            status: 'rejected',
            courseCode: 'R526CS01T',
            courseName: 'Comprehensive Algorithms & Systems',
            adminRemarks: 'Telemetry logs confirm repeated secondary focus exit without device crash.'
        }, { Authorization: `Bearer ${adminJwt}` });
        check(rejectRes.status === 200 && rejectRes.body?.success === true, `G4.6: Admin reject action succeeds (got ${rejectRes.status})`);

        // Allow async background PDF + email task to settle cleanly
        for (let i = 0; i < 40 && !capturedEmails.slice(emailsBeforeReject).some(e => e.subject.includes('REJECTED')); i++) {
            await new Promise(r => setTimeout(r, 80));
        }

        const dbPostReject = getJSONData();
        const rejectedSub = dbPostReject.testSubmissions.find(s => s._id === subFiledMongoId);
        const rejectedRep = dbPostReject.eirfReports.find(r => r.reportId === filedReportId);
        check(
            rejectedSub.verificationStatus === 'annulled' &&
            rejectedSub.eirfStatus === 'rejected' &&
            rejectedSub.score === 0 &&
            rejectedSub.totalScore === 0 &&
            rejectedSub.evaluation?.mcqScore === 0 &&
            rejectedSub.evaluation?.codingScore === 0 &&
            rejectedSub.evaluation?.webScore === 0 &&
            rejectedSub.evaluation?.score === 0 &&
            rejectedSub.evaluation?.totalScore === 0 &&
            rejectedSub.evaluation?.percentage === 0 &&
            rejectedSub.answers.every(a => a.score === 0 && (!a.aiEvaluation || a.aiEvaluation.score === 0)),
            'G4.7: REJECT sets verificationStatus=annulled and zeroes all top-level, evaluation.*, and answers[] scores'
        );
        check(
            rejectedRep.status === 'rejected' &&
            rejectedRep.pipelineStatus === 'VERDICT_ISSUED' &&
            !rejectedRep.pdfUrl,
            'G4.8: REJECT stores no public Cloudinary pdfUrl on EIRFReport'
        );

        const rejectEmails = capturedEmails.slice(emailsBeforeReject);
        const rejectVerdictMail = rejectEmails.find(e => e.subject.includes('REJECTED'));
        check(
            Boolean(rejectVerdictMail) &&
            !rejectVerdictMail.htmlDecoded.includes('appeals/') &&
            !rejectVerdictMail.htmlDecoded.includes('Submit an Appeal') &&
            rejectVerdictMail.htmlDecoded.includes('Final &amp; Binding') &&
            rejectVerdictMail.attachments.some(a => a.filename === `EIRF_Verdict_${filedReportId}.pdf` && a.buffer.toString('latin1', 0, 5) === '%PDF-'),
            'G4.9: Rejected email attaches valid Verdict PDF and contains NO appeal link'
        );

        // Verify Admin Verdict PDF preview endpoint auth & PDF contents
        const studPdfTry = await httpRequest('GET', `/api/admin/eirf/verdict-pdf/${filedReportId}`, null, { Authorization: `Bearer ${studentJwt}` });
        check(studPdfTry.status === 403, `G4.10: Student JWT blocked from /admin/eirf/verdict-pdf (got ${studPdfTry.status})`);

        const adminPdfRes = await httpRequest('GET', `/api/admin/eirf/verdict-pdf/${filedReportId}`, null, { Authorization: `Bearer ${adminJwt}` });
        check(
            adminPdfRes.status === 200 &&
            String(adminPdfRes.headers['content-type'] || '').includes('application/pdf') &&
            String(adminPdfRes.headers['cache-control'] || '').includes('no-store') &&
            adminPdfRes.rawBuffer.toString('latin1', 0, 5) === '%PDF-',
            `G4.11: Admin JWT streams private no-store Verdict PDF (${adminPdfRes.rawBuffer.length} bytes)`
        );

        const pdfText = extractAllPdfText(adminPdfRes.rawBuffer);
        check(
            !pdfText.includes('/media/eirf/') &&
            !pdfText.includes('appeals/new') &&
            !pdfText.includes('Submit an Appeal'),
            'G4.12: Verdict PDF text contains zero /media/eirf/ links and zero appeal links'
        );

        // Admin APPROVES unfiled & expired flagged submission using BICSID directly (audit synthesis test)
        const emailsBeforeApprove = capturedEmails.length;
        const approveUnfiledRes = await httpRequest('POST', `/api/admin/eirf/action/${subExpiredUnfiledBicsId}`, {
            status: 'approved',
            adminRemarks: 'Hospital admission note verified directly by Examination Committee.'
        }, { Authorization: `Bearer ${adminJwt}` });
        check(approveUnfiledRes.status === 200 && approveUnfiledRes.body?.success === true, `G4.13: Admin approve on unfiled/expired BICSID synthesizes audit report (got ${approveUnfiledRes.status})`);

        for (let i = 0; i < 40 && !capturedEmails.slice(emailsBeforeApprove).some(e => e.subject.includes('APPROVED')); i++) {
            await new Promise(r => setTimeout(r, 80));
        }

        const dbPostApprove = getJSONData();
        const approvedSub = dbPostApprove.testSubmissions.find(s => s._id === subExpiredUnfiledMongoId);
        check(
            approvedSub.verificationStatus === 'active' &&
            approvedSub.eirfStatus === 'approved' &&
            approvedSub.score === 64 &&
            Boolean(approvedSub.eirfReportId),
            'G4.14: APPROVE sets verificationStatus=active (matching Mongoose enum), keeps score=64, and links synthetic reportId'
        );

        const approveEmails = capturedEmails.slice(emailsBeforeApprove);
        const approveMail = approveEmails.find(e => e.subject.includes('APPROVED'));
        check(
            Boolean(approveMail) &&
            approveMail.to.includes('diya.p2@example.com') &&
            approveMail.htmlDecoded.includes(approvedSub.eirfReportId) &&
            approveMail.attachments.some(a => a.filename === `EIRF_Verdict_${approvedSub.eirfReportId}.pdf` && a.buffer.toString('latin1', 0, 5) === '%PDF-'),
            'G4.15: Approved verdict email dispatched to exact candidate with synthetic report PDF attachment'
        );

        // ============================================================
        // GROUP 5: Autonomous EIRF Pipeline Worker Verification
        // ============================================================
        console.log('\n[Group 5] Autonomous Pipeline Worker Magic Link & State Transitions...');
        const emailsBeforeWorker = capturedEmails.length;
        await runPipelineTick();
        await new Promise(r => setTimeout(r, 300));
        await runPipelineTick();

        const dbPostWorker = getJSONData();
        const workerCleared = dbPostWorker.testSubmissions.find(s => s._id === subWorkerClearedMongoId);
        const workerFlagged = dbPostWorker.testSubmissions.find(s => s._id === subWorkerFlaggedMongoId);
        const workerDeleted = dbPostWorker.testSubmissions.find(s => s._id === subDeletedMongoId);

        check(workerCleared.emailsSent?.testSubmitted === true, 'G5.1: Worker dispatches CLEARED testSubmitted confirmation and sets emailsSent flag');
        check(workerDeleted.pipelineStatus === 'FLAGGED' && !workerDeleted.eirfToken, 'G5.2: Worker ignores soft-deleted submission cleanly');
        check(
            workerFlagged.hasEirfFlag === true &&
            workerFlagged.pipelineStatus === 'AWAITING_EIRF' &&
            Array.isArray(workerFlagged.generatedQuestions) &&
            workerFlagged.generatedQuestions.length > 0 &&
            workerFlagged.emailsSent?.eirfFiling === true,
            `G5.3: Worker recovers QUEUED/evaluated flagged submission -> AWAITING_EIRF with generated questions & invite flag (status=${workerFlagged.pipelineStatus})`
        );

        const workerEmails = capturedEmails.slice(emailsBeforeWorker);
        const filingNoticeMail = workerEmails.find(e => e.to.includes('diya.p2@example.com') && e.htmlDecoded.includes('/assessment/evaluation/eirf/'));
        check(
            Boolean(filingNoticeMail) &&
            filingNoticeMail.htmlDecoded.includes(`/assessment/evaluation/eirf/${subFlaggedBicsId}?token=${workerFlagged.eirfToken}`) &&
            !filingNoticeMail.htmlDecoded.includes(subWorkerFlaggedMongoId),
            'G5.4: Worker invite email uses canonical /assessment/evaluation/eirf/<BICSID>?token=... with zero MongoID exposure'
        );

        console.log(`\n==============================================================`);
        console.log(`   PILLAR 2 SUITE COMPLETE: ${passed}/${total} CHECKS PASSED`);
        console.log(`==============================================================\n`);
    } finally {
        stopEirfPipelineWorker();
        stopSubmissionReaper();
        if (server) {
            await new Promise(resolve => server.close(resolve));
        }
        for (const p of uploadedProofPaths) {
            try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
        }
        if (dbBackup !== null) {
            fs.writeFileSync(DB_FILE, dbBackup, 'utf8');
        }
        dbState.useMongo = origUseMongo;
        dbState.isConnected = origIsConnected;
        global.fetch = origFetch;
    }
}

runPillar2Suite()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('\n[PILLAR 2 TEST SUITE FAILED]', err);
        process.exit(1);
    });
