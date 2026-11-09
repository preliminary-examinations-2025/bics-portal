/**
 * Pillar 1 Comprehensive Verification Suite:
 * Pre-Active, Active, and Post-Active Online Test Workflow + Hardened Requirements
 *
 * Verifies:
 * 1. Admin configuration, courses mapping, anti-duplicate re-save
 * 2. Removal of deprecated apiSecret / qwertty bypasses
 * 3. Pre-active token lifecycle (>10m TTL, expired/unpublished rejection, hidden testcase & key strip)
 * 4. Dual-auth resilience (stale portal JWT + fresh x-exam-token)
 * 5. Single random Biometric liveness challenge (including MOVE_HEAD_DOWN) & frontend telemetry match
 * 6. Precheck startTicket enforcement + strict 3-tier ID separation (MongoID vs BICSID vs submissionRefId)
 * 7. Active exam security (draft MCC persistence & score strip, /run hidden-case masking & prod guard,
 *    cross-student 403 on heartbeat/proctoring, beacon-disconnect & Dead-Man's Reaper 70s -> 409 lock)
 * 8. Post-active evaluation (unevaluated web pending, upload-proof, lock preservation, unanswered objection
 *    raise + resolve, /evaluation/:id ownership + zero rawId, closed window 403, no student verdict-pdf)
 */
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.PORT = '5009';
process.env.JWT_SECRET = 'pillar1_test_jwt_secret_2026';
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASS = 'admin123';

const { DB_FILE, dbState, getJSONData, saveJSONData } = require('../config/db');
const dbBackup = fs.existsSync(DB_FILE) ? fs.readFileSync(DB_FILE, 'utf8') : null;

const app = require('../server');
const { toMongoId, isBicsId, isMongoId, isSubmissionRefId } = require('../utils/bicsId');
const { reapAbandonedSubmissions, stopSubmissionReaper } = require('../workers/submissionReaper');
const { stopEirfPipelineWorker } = require('../workers/eirfPipelineWorker');

const pipePath = `\\\\.\\pipe\\bics_p1_${process.pid}_${Date.now()}`;
const uploadedTestFiles = [];

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
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                let parsedBody = data;
                try { parsedBody = JSON.parse(data); } catch (_) {}
                resolve({ status: res.statusCode, headers: res.headers, body: parsedBody });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function uploadMultipartProof(urlPath, token, filename, mimeType, fileBuffer) {
    return new Promise((resolve, reject) => {
        const boundary = '----BicsPillar1Boundary' + Date.now();
        const headerPart = Buffer.from(
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="imageFile"; filename="${filename}"\r\n` +
            `Content-Type: ${mimeType}\r\n\r\n`,
            'utf8'
        );
        const footerPart = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
        const payload = Buffer.concat([headerPart, fileBuffer, footerPart]);

        const req = http.request({
            socketPath: pipePath,
            path: urlPath,
            method: 'POST',
            headers: {
                'Host': '127.0.0.1:5000',
                'Authorization': `Bearer ${token}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': payload.length
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                let parsedBody = data;
                try { parsedBody = JSON.parse(data); } catch (_) {}
                resolve({ status: res.statusCode, body: parsedBody });
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

function walkFiles(dirPath) {
    const out = [];
    if (!fs.existsSync(dirPath)) return out;
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        const full = path.join(dirPath, entry.name);
        if (entry.isDirectory()) out.push(...walkFiles(full));
        else if (/\.(js|jsx|ts|tsx)$/i.test(entry.name)) out.push(full);
    }
    return out;
}

async function runPillar1Suite() {
    console.log('\n==============================================================');
    console.log('   PILLAR 1: ONLINE TEST LIFECYCLE & HARDENING VERIFICATION   ');
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

    const origPrecheckEnforce = process.env.PRECHECK_ENFORCE;
    const origNodeEnv = process.env.NODE_ENV;
    const origDbConnected = dbState.isConnected;
    const origFetch = global.fetch;

    try {
        // ============================================================
        // GROUP 0: Static UI & Hardening Code Audits
        // ============================================================
        console.log('[Group 0] Static UI & Hardening Verification...');
        const rootDir = path.resolve(__dirname, '..', '..');
        const bioView = fs.readFileSync(path.join(rootDir, 'frontend_ot/src/views/BiometricCheckView.jsx'), 'utf8');
        check(
            bioView.includes('MOVE_HEAD_DOWN') && bioView.includes('deltaPitch') && bioView.includes('deltaCenterY'),
            'S0.1: BiometricCheckView implements MOVE_HEAD_DOWN with deltaPitch & deltaCenterY telemetry'
        );

        const verifView = fs.readFileSync(path.join(rootDir, 'frontend_ot/src/views/VerificationReviewView.jsx'), 'utf8');
        const onlineTestsView = fs.readFileSync(path.join(rootDir, 'frontend/src/pages/OnlineTestsView.jsx'), 'utf8');
        check(
            !verifView.includes('verdict-pdf') && !onlineTestsView.includes('verdict-pdf'),
            'S0.2: Student views contain zero verdict-pdf download links (email-only policy)'
        );

        const frontendSrcFiles = [
            ...walkFiles(path.join(rootDir, 'frontend_ot/src')),
            ...walkFiles(path.join(rootDir, 'frontend/src'))
        ];
        const leakedSecretFiles = frontendSrcFiles.filter(f => {
            const c = fs.readFileSync(f, 'utf8');
            return /apiSecret|qwertty|API_ACCESS_SECRET/i.test(c);
        });
        check(
            leakedSecretFiles.length === 0,
            `S0.3: Zero deprecated apiSecret / qwertty references in frontend_ot/src & frontend/src (found: ${leakedSecretFiles.length})`
        );

        const sysCheckView = fs.readFileSync(path.join(rootDir, 'frontend_ot/src/views/SystemChecksView.jsx'), 'utf8');
        check(
            sysCheckView.includes('startTicket') && sysCheckView.includes('precheck'),
            'S0.4: SystemChecksView integrates server /precheck & startTicket capture'
        );

        const examHeader = fs.readFileSync(path.join(rootDir, 'frontend_ot/src/components/exam/ExamHeader.jsx'), 'utf8');
        const otApp = fs.readFileSync(path.join(rootDir, 'frontend_ot/src/App.jsx'), 'utf8');
        check(
            examHeader.includes('disconnectCountdown : 70') && examHeader.includes('Auto-submitting') && otApp.includes('70000') && otApp.includes('/assessment/evaluation/'),
            'S0.5: ExamHeader countdown aligns with 70s reaper (70000ms in App.jsx) & mounts /assessment/evaluation/ route'
        );

        // ============================================================
        // Start Isolated HTTP Test Server
        // ============================================================
        await new Promise((resolve) => {
            server = http.createServer(app).listen(pipePath, () => {
                resolve();
            });
        });
        console.log(`\n[Harness] Live HTTP server bound on IPC pipe ${pipePath}\n`);

        // ============================================================
        // GROUP 1: Admin Config, Courses & Anti-Duplicate Re-Save + IDs
        // ============================================================
        console.log('[Group 1] Admin Config, Anti-Duplicate Re-Save & 3-Tier ID Setup...');
        const adminLogin = await httpRequest('POST', '/api/login', { username: 'admin', password: 'admin123' });
        check(adminLogin.status === 200 && !!adminLogin.body.token, '1.1: Admin login returns JWT');
        const adminToken = adminLogin.body.token;
        const adminAuth = { 'Authorization': `Bearer ${adminToken}` };

        const ts = Date.now();
        const mkStudent = async (suffix) => {
            const reg = await httpRequest('POST', '/api/admin/register-candidate', {
                studentId: `P1_${suffix}_${ts}`,
                name: `Pillar1 Candidate ${suffix}`,
                username: `p1_${suffix}_${ts}@bics.edu`,
                password: 'Password@123',
                eligible: true
            }, adminAuth);
            assert.strictEqual(reg.status, 200, `Failed to register ${suffix}: ${JSON.stringify(reg.body)}`);
            const login = await httpRequest('POST', '/api/login', {
                username: `p1_${suffix}_${ts}@bics.edu`,
                password: 'Password@123'
            });
            assert.strictEqual(login.status, 200, `Failed login ${suffix}: ${JSON.stringify(login.body)}`);
            return {
                bicsId: reg.body.candidate._id || reg.body.candidate.id,
                mongoId: toMongoId(reg.body.candidate._id || reg.body.candidate.id),
                studentId: reg.body.candidate.studentId,
                token: login.body.token
            };
        };

        const studA = await mkStudent('A');
        const studB = await mkStudent('B');
        const studC = await mkStudent('C');
        check(
            isBicsId(studA.bicsId) && isMongoId(studA.mongoId) && isBicsId(studB.bicsId) && isBicsId(studC.bicsId),
            '1.2: Newly registered JSON candidates get 24-hex MongoID internally & 6-4-4-6 BICSID in API'
        );

        const nowMs = Date.now();
        const testPayload = {
            title: 'Pillar 1 Comprehensive Lifecycle Exam',
            course: 'Systems Architecture',
            courseCode: 'R526CS99T',
            marks: 100,
            instructions: 'Read carefully.',
            duration: 60,
            startDate: new Date(nowMs - 15 * 60 * 1000).toISOString(),
            endDate: new Date(nowMs + 120 * 60 * 1000).toISOString(),
            isPublished: true,
            questions: [
                {
                    id: `p1_q_scc_${ts}`,
                    type: 'scc',
                    title: 'SCC Pointer Size Question',
                    description: 'Select single correct option.',
                    points: 10,
                    options: ['A', 'B (Correct)', 'C', 'D'],
                    correctOptionIndex: 1
                },
                {
                    id: `p1_q_mcc_${ts}`,
                    type: 'mcc',
                    isMultiChoice: true,
                    title: 'MCC Kernel Locks Question',
                    description: 'Select all correct options.',
                    points: 20,
                    options: ['Spinlock (Correct)', 'No-op', 'Mutex (Correct)', 'Sleep'],
                    correctOptionIndices: [0, 2]
                },
                {
                    id: `p1_q_code_${ts}`,
                    type: 'coding',
                    title: 'Sum Two Numbers C++',
                    description: 'Compute a + b.',
                    points: 30,
                    timeLimitMs: 2000,
                    memoryLimitMb: 128,
                    language: 'cpp',
                    testCases: [
                        { id: 'tc_sample', input: '2 3', output: '5', isSample: true, points: 15 },
                        { id: 'tc_hidden', input: '99 101', output: '200', isSample: false, points: 15 }
                    ]
                },
                {
                    id: `p1_q_web_${ts}`,
                    type: 'web',
                    title: 'Responsive Banner Card',
                    description: 'Build a flexbox banner.',
                    points: 30
                },
                {
                    id: `p1_q_unans_${ts}`,
                    type: 'scc',
                    title: 'Unanswered Objection Test Question',
                    description: 'Left blank by candidate C.',
                    points: 10,
                    options: ['X', 'Y', 'Z', 'W'],
                    correctOptionIndex: 0
                }
            ]
        };

        const createTestRes = await httpRequest('POST', '/api/admin/tests', testPayload, adminAuth);
        check(createTestRes.status === 200 && createTestRes.body.success, '1.3: Admin created exam config');
        const testBicsId = createTestRes.body.test?._id || createTestRes.body.test?.id;
        const testMongoId = toMongoId(testBicsId);
        check(
            isBicsId(testBicsId) && isMongoId(testMongoId) && testBicsId !== testMongoId,
            `1.4: Created test has 6-4-4-6 BICSID (${testBicsId}) mapped to 24-hex MongoID (${testMongoId})`
        );

        // Re-save existing test to ensure zero duplication
        const resaveRes = await httpRequest('POST', '/api/admin/tests', {
            ...testPayload,
            _id: testBicsId,
            title: 'Pillar 1 Comprehensive Lifecycle Exam (Updated)'
        }, adminAuth);
        check(
            resaveRes.status === 200 && (resaveRes.body.test?._id || resaveRes.body.test?.id) === testBicsId,
            '1.5: Re-saving test with BICSID _id preserves exact same ID'
        );
        const allTestsRes = await httpRequest('GET', '/api/admin/tests', null, adminAuth);
        const matchingTests = (allTestsRes.body || []).filter(t => (t._id || t.id) === testBicsId);
        check(
            matchingTests.length === 1 && matchingTests[0].title === 'Pillar 1 Comprehensive Lifecycle Exam (Updated)',
            '1.6: Re-save updated existing test in place with zero duplicate records'
        );

        // ============================================================
        // GROUP 2: Pre-Active Security, Token Lifecycle & Sanitization
        // ============================================================
        console.log('\n[Group 2] Pre-Active APIs, apiSecret Removal & Token Lifecycle...');
        const secBypassActive = await httpRequest('GET', '/api/tests/active?apiSecret=qwertty');
        const secBypassAdmin = await httpRequest('GET', '/api/admin/tests?apiSecret=qwertty');
        check(secBypassActive.status === 401 && secBypassAdmin.status === 401, '2.1: Deprecated ?apiSecret=qwertty rejected with 401 on student & admin routes');

        const activeTestsA = await httpRequest('GET', '/api/tests/active', null, { 'Authorization': `Bearer ${studA.token}` });
        const foundActive = (activeTestsA.body || []).find(t => t._id === testBicsId);
        check(
            activeTestsA.status === 200 && foundActive && foundActive.course === 'Systems Architecture' && foundActive.courseCode === 'R526CS99T',
            '2.2: GET /api/tests/active projects course & courseCode with BICSID'
        );

        // Unpublished gate check
        await httpRequest('POST', `/api/admin/tests/toggle-publish/${testBicsId}`, {}, adminAuth);
        const genUnpub = await httpRequest('POST', '/api/tests/generate-token', { candidateId: studA.bicsId, testId: testBicsId }, { 'Authorization': `Bearer ${studA.token}` });
        check(genUnpub.status === 403, '2.3: Unpublished test rejects token generation (403)');
        await httpRequest('POST', `/api/admin/tests/toggle-publish/${testBicsId}`, {}, adminAuth);

        const genTokA = await httpRequest('POST', '/api/tests/generate-token', { candidateId: studA.bicsId, testId: testBicsId }, { 'Authorization': `Bearer ${studA.token}` });
        check(genTokA.status === 200 && !!genTokA.body.token, '2.4: Candidate A generated exam token');
        const examTokenA = genTokA.body.token;

        // Verify token doc TTL > 10 minutes
        const dbAfterTok = getJSONData();
        const storedTok = (dbAfterTok.tokens || []).find(t => t.token === examTokenA);
        const ttlMs = storedTok?.expiresAt ? (new Date(storedTok.expiresAt).getTime() - Date.now()) : 0;
        check(ttlMs > 10 * 60 * 1000, `2.5: Exam token expiresAt exceeds 10m window (${Math.round(ttlMs / 60000)}m remaining)`);

        const badVerify = await httpRequest('POST', '/api/tests/verify-token', { token: 'nonexistent_expired_token_123456' });
        check(badVerify.status === 401, '2.6: Invalid/expired exam token returns 401');

        const verTokA = await httpRequest('POST', '/api/tests/verify-token', { token: examTokenA });
        check(verTokA.status === 200 && verTokA.body.success, '2.7: Valid exam token verified');
        const verQuestions = verTokA.body.test?.questions || [];
        const verScc = verQuestions.find(q => q.id === testPayload.questions[0].id);
        const verMcc = verQuestions.find(q => q.id === testPayload.questions[1].id);
        const verCode = verQuestions.find(q => q.id === testPayload.questions[2].id);
        check(
            verScc?.correctOptionIndex === undefined &&
            verMcc?.correctOptionIndices === undefined &&
            Array.isArray(verCode?.testCases) && verCode.testCases.length === 1 && verCode.testCases[0].input === '2 3',
            '2.8: verify-token strips answer keys (SCC/MCC) & hidden coding test cases'
        );

        // ============================================================
        // GROUP 3: Dual-Auth Resilience & Single Random Biometric + MOVE_HEAD_DOWN
        // ============================================================
        console.log('\n[Group 3] Dual-Auth Stale JWT Fallback & Biometric Single Challenge...');
        const staleDualHeaders = {
            'Authorization': 'Bearer invalid.stale.portal.jwt',
            'x-exam-token': examTokenA
        };
        const seenActions = new Set();
        let moveHeadDownChal = null;
        let lastChal = null;
        for (let i = 0; i < 32; i++) {
            const chRes = await httpRequest('GET', '/api/tests/biometrics/challenge', null, staleDualHeaders);
            assert.strictEqual(chRes.status, 200, `Challenge #${i} failed with stale Bearer + x-exam-token: ${JSON.stringify(chRes.body)}`);
            const chBody = chRes.body;
            assert.ok(Array.isArray(chBody.challenges) && chBody.challenges.length === 1 && chBody.totalSteps === 1, 'Expected single challenge per session');
            assert.ok(['TURN_LEFT', 'TURN_RIGHT', 'TILT_HEAD', 'MOVE_HEAD_DOWN'].includes(chBody.action), `Unexpected action: ${chBody.action}`);
            seenActions.add(chBody.action);
            lastChal = chBody;
            if (chBody.action === 'MOVE_HEAD_DOWN') moveHeadDownChal = chBody;
        }
        check(
            seenActions.size >= 2,
            `3.1: Biometrics challenge returns 1 randomized action per call with stale Bearer + x-exam-token fallback (observed: ${Array.from(seenActions).join(', ')})`
        );

        const targetChal = moveHeadDownChal || lastChal;
        const verBioRes = await httpRequest('POST', '/api/tests/biometrics/verify', {
            candidateId: studA.bicsId,
            testId: testBicsId,
            challengeId: targetChal.challengeId,
            challengeTelemetry: {
                action: targetChal.action,
                allCompleted: true,
                deltaPitch: 0.28,
                deltaCenterY: 0.09
            },
            liveFrame: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAA=='
        }, staleDualHeaders);
        check(
            verBioRes.status === 200 && verBioRes.body.livenessPassed === true && !!verBioRes.body.biometricToken,
            `3.2: Biometric verification passes (${targetChal.action}) & mints signed biometricToken`
        );

        // Confirm non-OT protected endpoint rejects stale Bearer + x-exam-token
        const nonOtBypassRes = await httpRequest('GET', `/api/tests/evaluation/${testBicsId}`, null, staleDualHeaders);
        check(nonOtBypassRes.status === 401, '3.3: Non-OT dual-auth route (/evaluation/:id) rejects stale Bearer JWT even with x-exam-token');

        // ============================================================
        // GROUP 4: Start Ticket Gate & Strict 3-Tier ID Separation
        // ============================================================
        console.log('\n[Group 4] Precheck Start Ticket Gate & 3-Tier ID Separation...');
        process.env.PRECHECK_ENFORCE = 'true';

        const startMissingTicket = await httpRequest('POST', `/api/tests/start/${testBicsId}`, {
            candidateId: studA.bicsId
        }, staleDualHeaders);
        check(
            startMissingTicket.status === 403 && startMissingTicket.body.code === 'PRECHECK_TICKET_MISSING',
            '4.1: PRECHECK_ENFORCE=true blocks start without startTicket (403)'
        );

        const startForgedTicket = await httpRequest('POST', `/api/tests/start/${testBicsId}`, {
            candidateId: studA.bicsId,
            startTicket: `${studA.mongoId}:${testMongoId}:${Date.now() + 60000}:nonce123:000000forged`
        }, staleDualHeaders);
        check(
            startForgedTicket.status === 403 && startForgedTicket.body.code === 'PRECHECK_TICKET_FORGERY',
            '4.2: PRECHECK_ENFORCE=true blocks forged startTicket (403)'
        );

        const badProbePrecheck = await httpRequest('POST', '/api/tests/precheck', {
            testId: testBicsId,
            candidateId: studA.bicsId,
            probes: { display: { isExtended: true, screenCount: 2 } }
        }, staleDualHeaders);
        check(badProbePrecheck.status === 400 && badProbePrecheck.body.code === 'MULTI_DISPLAY_DETECTED', '4.3: Multi-display probe rejected at /precheck');

        const precheckResA = await httpRequest('POST', '/api/tests/precheck', {
            testId: testBicsId,
            candidateId: studA.bicsId,
            probes: { display: { isExtended: false, screenCount: 1 }, camera: { virtualCameraDetected: false }, network: { passed: true, latencyMs: 42 } }
        }, staleDualHeaders);
        check(precheckResA.status === 200 && precheckResA.body.passed && !!precheckResA.body.startTicket, '4.4: Valid /precheck issues signed HMAC startTicket under stale Bearer + x-exam-token');

        const startARes = await httpRequest('POST', `/api/tests/start/${testBicsId}`, {
            candidateId: studA.bicsId,
            candidateName: 'Pillar1 Candidate A',
            studentId: studA.studentId,
            token: examTokenA,
            startTicket: precheckResA.body.startTicket
        }, staleDualHeaders);
        check(startARes.status === 200 && startARes.body.success, '4.5: Candidate A started exam with valid startTicket');

        const subAApi = startARes.body.submission || {};
        const subABicsId = subAApi.bicsId || subAApi._id || subAApi.id;
        const subAMongoId = toMongoId(subABicsId);
        const subARefId = subAApi.submissionRefId;
        const dbAfterStartA = getJSONData();
        const storedSubA = (dbAfterStartA.testSubmissions || []).find(s => String(s._id || s.id) === String(subAMongoId));
        check(
            Boolean(storedSubA) &&
            isMongoId(String(storedSubA._id)) &&
            isBicsId(subABicsId) &&
            subABicsId === subAApi._id &&
            isSubmissionRefId(subARefId) &&
            String(storedSubA._id) !== subABicsId &&
            subABicsId !== subARefId &&
            String(storedSubA._id) !== subARefId,
            `4.6: Strict 3-Tier ID separation verified (MongoID=${storedSubA?._id}, BICSID=${subABicsId}, RefID=${subARefId})`
        );

        const dupStartRes = await httpRequest('POST', `/api/tests/start/${testBicsId}`, {
            candidateId: studA.bicsId,
            startTicket: precheckResA.body.startTicket
        }, { 'Authorization': `Bearer ${studA.token}` });
        check(dupStartRes.status === 400, '4.7: Duplicate start attempt blocked with 400');

        // ============================================================
        // GROUP 5: Active Exam Security, /run, Beacon & Dead-Man Reaper
        // ============================================================
        console.log('\n[Group 5] Active Exam Security, /run Masking, Beacon & Reaper...');
        const draftResA = await httpRequest('PUT', `/api/tests/draft/${subABicsId}`, {
            answers: [
                { questionId: testPayload.questions[0].id, type: 'scc', selectedOptionIndex: 1 },
                { questionId: testPayload.questions[1].id, type: 'mcc', selectedOptionIndices: [0, 2], score: 999, isManuallyGraded: true },
                {
                    questionId: testPayload.questions[2].id,
                    type: 'coding',
                    submittedCode: '#include <iostream>\nint main(){ int a,b; std::cin>>a>>b; std::cout<<a+b; }',
                    testCaseResults: [{ testCaseIndex: 0, status: 'Accepted', points: 15, scoredPoints: 15 }]
                },
                { questionId: testPayload.questions[3].id, type: 'web', submittedHtml: '<h1>Draft</h1>' }
            ]
        }, staleDualHeaders);
        check(
            draftResA.status === 200 && draftResA.body.reaperGraceSeconds === 70 && draftResA.body.answersCount === 4,
            '5.1: Draft autosave works via dual-auth with reaperGraceSeconds === 70'
        );
        const dbAfterDraft = getJSONData().testSubmissions.find(s => String(s._id) === subAMongoId);
        const savedMccAns = (dbAfterDraft?.answers || []).find(a => a.questionId === testPayload.questions[1].id);
        check(
            Array.isArray(savedMccAns?.selectedOptionIndices) && savedMccAns.selectedOptionIndices.length === 2 &&
            savedMccAns.score === undefined && savedMccAns.isManuallyGraded === undefined,
            '5.2: Draft persists MCC array & strips spoofed score/isManuallyGraded'
        );

        // Cross-student 403 checks on heartbeat & proctoring signal
        const crossHb = await httpRequest('POST', `/api/tests/heartbeat/${subABicsId}`, {}, { 'Authorization': `Bearer ${studB.token}` });
        const crossSig = await httpRequest('POST', `/api/tests/proctoring/signal/${subABicsId}`, {
            sender: 'candidate', type: 'offer', data: { sdp: 'fake' }
        }, { 'Authorization': `Bearer ${studB.token}` });
        check(crossHb.status === 403 && crossSig.status === 403, '5.3: Cross-student heartbeat & WebRTC signal rejected with 403');

        // POST /api/tests/run: Hidden benchmark masking + malicious code + production unauth 401
        global.fetch = async (url, opts) => {
            if (String(url).includes('judge0')) {
                const payload = JSON.parse(opts.body);
                const stdout = payload.stdin.trim() === '2 3' ? '5' : '200';
                return {
                    ok: true,
                    json: async () => ({ status: { description: 'Accepted' }, stdout, time: '0.01', memory: 1024 })
                };
            }
            return origFetch(url, opts);
        };
        const runSpoofedAdminRes = await httpRequest('POST', '/api/tests/run', {
            sourceCode: '#include <iostream>\nusing namespace std;\nint main(){int a,b;cin>>a>>b;cout<<a+b;return 0;}',
            questionId: testPayload.questions[2].id,
            testId: testBicsId,
            isAdmin: true
        }, { 'Authorization': `Bearer ${studA.token}`, 'X-Admin-Role': 'admin', 'x-admin': 'true' });
        global.fetch = origFetch;

        const hiddenCaseOut = (runSpoofedAdminRes.body?.results || []).find(r => r.isSample === false);
        check(
            runSpoofedAdminRes.status === 200 && hiddenCaseOut &&
            hiddenCaseOut.input === '[Hidden Benchmark Case]' &&
            hiddenCaseOut.expectedOutput === '[Hidden]' &&
            hiddenCaseOut.actualOutput === '[Hidden]',
            '5.4: POST /api/tests/run masks hidden benchmark inputs/outputs even with spoofed admin headers/body'
        );

        const maliciousRunRes = await httpRequest('POST', '/api/tests/run', {
            sourceCode: '#include <cstdlib>\nint main(){ system("whoami"); return 0; }',
            testCases: [{ input: '', output: '' }]
        }, { 'Authorization': `Bearer ${studA.token}` });
        check(
            maliciousRunRes.status === 200 && maliciousRunRes.body.status === 'Compilation Error' &&
            String(maliciousRunRes.body.compileError).includes('Security violation'),
            '5.5: POST /api/tests/run blocks unsafe system() calls before execution'
        );

        // Temporarily simulate production guard on /api/tests/run (dbState.isConnected true prevents 503 gate)
        process.env.NODE_ENV = 'production';
        dbState.isConnected = true;
        const runProdNoAuth = await httpRequest('POST', '/api/tests/run', {
            sourceCode: 'int main(){return 0;}', testCases: [{ input: '', output: '' }]
        });
        const runProdSpoofTok = await httpRequest('POST', '/api/tests/run', {
            sourceCode: 'int main(){return 0;}', testCases: [{ input: '', output: '' }], token: 'tok_test_spoof'
        }, { 'x-exam-token': 'tok_test_spoof' });
        process.env.NODE_ENV = origNodeEnv;
        dbState.isConnected = origDbConnected;
        check(runProdNoAuth.status === 401 && runProdSpoofTok.status === 401, '5.6: Production mode blocks unauthenticated & tok_test calls on /api/tests/run (401)');

        // Beacon disconnect finalization -> 409 lock
        const beaconRes = await httpRequest('POST', '/api/tests/beacon-disconnect', {
            submissionId: subABicsId,
            authToken: studA.token
        });
        check(beaconRes.status === 200 && beaconRes.body.success, '5.7: beacon-disconnect returns 200 and finalizes active session');
        const draftAfterBeacon = await httpRequest('PUT', `/api/tests/draft/${subABicsId}`, { answers: [] }, { 'Authorization': `Bearer ${studA.token}` });
        const submitAfterBeacon = await httpRequest('POST', '/api/tests/submit', { submissionId: subABicsId, answers: [] }, { 'Authorization': `Bearer ${studA.token}` });
        check(draftAfterBeacon.status === 409 && submitAfterBeacon.status === 409, '5.8: Closed beacon-finalized session enforces 409 Conflict on draft & submit');

        // Candidate B: Deleted submission re-attempt + Dead-Man's Reaper
        const genTokB = await httpRequest('POST', '/api/tests/generate-token', { candidateId: studB.bicsId, testId: testBicsId }, { 'Authorization': `Bearer ${studB.token}` });
        const precheckB = await httpRequest('POST', '/api/tests/precheck', {
            testId: testBicsId, candidateId: studB.bicsId,
            probes: { display: { isExtended: false, screenCount: 1 }, camera: { virtualCameraDetected: false }, network: { passed: true, latencyMs: 25 } }
        }, { 'Authorization': `Bearer ${studB.token}` });
        const startB1 = await httpRequest('POST', `/api/tests/start/${testBicsId}`, {
            candidateId: studB.bicsId, token: genTokB.body.token, startTicket: precheckB.body.startTicket
        }, { 'Authorization': `Bearer ${studB.token}` });
        assert.strictEqual(startB1.status, 200);
        const subB1MongoId = toMongoId(startB1.body.submission.bicsId);

        // Mark B1 soft-deleted in JSON DB and allow fresh start
        const dbDel = getJSONData();
        const b1Record = dbDel.testSubmissions.find(s => String(s._id) === subB1MongoId);
        b1Record.isDeleted = true;
        saveJSONData(dbDel);

        const startB2 = await httpRequest('POST', `/api/tests/start/${testBicsId}`, {
            candidateId: studB.bicsId, startTicket: precheckB.body.startTicket
        }, { 'Authorization': `Bearer ${studB.token}` });
        check(
            startB2.status === 200 && startB2.body.submission.bicsId !== startB1.body.submission.bicsId,
            '5.9: Deleted prior attempt permits fresh exam start with newly minted IDs'
        );
        const subB2BicsId = startB2.body.submission.bicsId;
        const subB2MongoId = toMongoId(subB2BicsId);

        // Backdate heartbeat past 70s and trigger Dead-Man's Reaper
        const dbReapPrep = getJSONData();
        const b2Record = dbReapPrep.testSubmissions.find(s => String(s._id) === subB2MongoId);
        const staleIso = new Date(Date.now() - 95000).toISOString();
        b2Record.startedAt = staleIso;
        b2Record.lastHeartbeatAt = staleIso;
        saveJSONData(dbReapPrep);

        await reapAbandonedSubmissions(70000);
        const b2AfterReap = getJSONData().testSubmissions.find(s => String(s._id) === subB2MongoId);
        const draftAfterReap = await httpRequest('PUT', `/api/tests/draft/${subB2BicsId}`, { answers: [] }, { 'Authorization': `Bearer ${studB.token}` });
        check(
            b2AfterReap?.status === 'auto-submitted' && b2AfterReap.submissionReason === 'dead_man_reaper' &&
            b2AfterReap.hasEirfFlag === true && draftAfterReap.status === 409,
            '5.10: Dead-Man Reaper transitions >70s idle session to auto-submitted, sets EIRF flag, and locks writes (409)'
        );

        // ============================================================
        // GROUP 6: Post-Active Submission, Evaluation, Proof Upload, Objections & Window Closure
        // ============================================================
        console.log('\n[Group 6] Post-Active Submission, Evaluation, Objections & Window Lifecycle...');
        const genTokC = await httpRequest('POST', '/api/tests/generate-token', { candidateId: studC.bicsId, testId: testBicsId }, { 'Authorization': `Bearer ${studC.token}` });
        const precheckC = await httpRequest('POST', '/api/tests/precheck', {
            testId: testBicsId, candidateId: studC.bicsId,
            probes: { display: { isExtended: false, screenCount: 1 }, camera: { virtualCameraDetected: false }, network: { passed: true, latencyMs: 18 } }
        }, { 'Authorization': `Bearer ${studC.token}` });
        const startC = await httpRequest('POST', `/api/tests/start/${testBicsId}`, {
            candidateId: studC.bicsId, token: genTokC.body.token, startTicket: precheckC.body.startTicket
        }, { 'Authorization': `Bearer ${studC.token}` });
        assert.strictEqual(startC.status, 200);
        const subCBicsId = startC.body.submission.bicsId;
        const subCMongoId = toMongoId(subCBicsId);
        const subCRefId = startC.body.submission.submissionRefId;

        const submitC = await httpRequest('POST', '/api/tests/submit', {
            submissionId: subCBicsId,
            status: 'submitted',
            answers: [
                { questionId: testPayload.questions[0].id, type: 'scc', selectedOptionIndex: 1 },
                { questionId: testPayload.questions[1].id, type: 'mcc', selectedOptionIndices: [0, 2] },
                {
                    questionId: testPayload.questions[2].id,
                    type: 'coding',
                    submittedCode: 'int main(){}',
                    testCaseResults: [
                        { testCaseIndex: 0, status: 'Accepted', points: 15, scoredPoints: 15 },
                        { testCaseIndex: 1, status: 'Wrong Answer', points: 15, scoredPoints: 0 }
                    ]
                },
                { questionId: testPayload.questions[3].id, type: 'web', submittedHtml: '<section>Hi</section>' }
                // Question #5 intentionally unanswered for unanswered objection test
            ],
            proctoringLog: { fullscreenExits: 0, tabSwitches: 0, inspectAttempts: 0, clipboardAttempts: 0, events: [] }
        }, { 'Authorization': `Bearer ${studC.token}` });
        check(
            submitC.status === 200 &&
            submitC.body.submission?.status === 'submitted' &&
            submitC.body.submission?.hasEirfFlag === false &&
            submitC.body.submission?.evaluation?.mcqScore === 30 &&
            submitC.body.submission?.evaluation?.codingScore === 15 &&
            submitC.body.submission?.evaluation?.webScore === 0 &&
            submitC.body.submission?.evaluation?.totalScore === 45,
            '6.1: Final submit scores SCC(10)+MCC(20)+Coding(15)=45, defers Web(0), and clears clean exam (hasEirfFlag=false)'
        );

        const webAnsC = (submitC.body.submission?.answers || []).find(a => a.questionId === testPayload.questions[3].id);
        check(webAnsC?.pendingEvaluation === true && webAnsC?.score === 0, '6.2: Unevaluated Web answer tagged pendingEvaluation=true & score=0');

        const dupSubmitC = await httpRequest('POST', '/api/tests/submit', { submissionId: subCBicsId, answers: [] }, { 'Authorization': `Bearer ${studC.token}` });
        check(dupSubmitC.status === 409, '6.3: Duplicate submit blocked with 409 Conflict');

        // Upload proof check
        const dummyPng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52]);
        const uploadProofRes = await uploadMultipartProof('/api/tests/upload-proof', studC.token, 'p1_proof.png', 'image/png', dummyPng);
        if (uploadProofRes.body?.url) {
            const fname = path.basename(uploadProofRes.body.url.split('?')[0]);
            uploadedTestFiles.push(path.join(__dirname, '..', 'public', 'uploads', fname));
        }
        check(uploadProofRes.status === 200 && uploadProofRes.body.success && !!uploadProofRes.body.url, '6.4: Candidate POST /api/tests/upload-proof succeeds and returns proof URL');

        // Evaluation before release -> 403
        const evalUnreleased = await httpRequest('GET', `/api/tests/evaluation/${subCBicsId}`, null, { 'Authorization': `Bearer ${studC.token}` });
        check(
            evalUnreleased.status === 403 && evalUnreleased.body?.verificationStatus === 'not_released',
            `6.5: Evaluation locked (403 not_released) prior to Admin release (got status=${evalUnreleased.status}, body=${JSON.stringify(evalUnreleased.body)})`
        );

        // Admin release
        const releaseRes = await httpRequest('POST', `/api/admin/tests/toggle-release/${testBicsId}`, { status: 'released' }, adminAuth);
        check(releaseRes.status === 200 && releaseRes.body.verificationStatus === 'released', '6.6: Admin toggles verificationStatus to released');

        // Ownership & privacy checks on /evaluation/:id
        const evalCrossStud = await httpRequest('GET', `/api/tests/evaluation/${subCBicsId}`, null, { 'Authorization': `Bearer ${studA.token}` });
        check(evalCrossStud.status === 403, '6.7: Cross-student GET /api/tests/evaluation/:id denied with 403');

        const evalC = await httpRequest('GET', `/api/tests/evaluation/${subCBicsId}`, null, { 'Authorization': `Bearer ${studC.token}` });
        check(
            evalC.status === 200 &&
            evalC.body.candidate?.rawId === undefined &&
            evalC.body.test?.rawId === undefined &&
            evalC.body.submission?.rawId === undefined &&
            isBicsId(evalC.body.candidate?.id) &&
            isBicsId(evalC.body.test?.id) &&
            isBicsId(evalC.body.submission?.id) &&
            isBicsId(evalC.body.submission?.bicsId) &&
            evalC.body.submission?.submissionRefId === subCRefId &&
            evalC.body.test?.course === 'Systems Architecture' &&
            evalC.body.test?.courseCode === 'R526CS99T',
            '6.8: Authorized GET /api/tests/evaluation/:id exposes BICSIDs + submissionRefId + course metadata with ZERO rawId leaks'
        );

        // Raise objection on unanswered Q5 & resolve via Admin
        const raiseObjRes = await httpRequest('POST', `/api/tests/objection/${subCBicsId}`, {
            questionId: testPayload.questions[4].id,
            questionIndex: 4,
            reason: 'Question ambiguity',
            details: 'Unanswered question had ambiguous wording.',
            attachments: [uploadProofRes.body.url]
        }, { 'Authorization': `Bearer ${studC.token}` });
        check(raiseObjRes.status === 200 && !!raiseObjRes.body.objectionId, '6.9: Candidate raises objection on unanswered Q5 and persists in DB');

        const resolveObjRes = await httpRequest('POST', '/api/admin/tests/objection/resolve', {
            submissionId: subCBicsId,
            questionId: testPayload.questions[4].id,
            questionIndex: 4,
            status: 'resolved_accepted',
            adminRemarks: 'Partial credit awarded on review',
            revisedMarks: 8
        }, adminAuth);
        check(
            resolveObjRes.status === 200 &&
            resolveObjRes.body.submission?.totalScore === 53 &&
            resolveObjRes.body.submission?.evaluation?.totalScore === 53,
            '6.10: Admin resolves unanswered objection (+8 marks) & updates totalScore to 53'
        );

        // Verify admin submissions endpoint preserves resolved marks & annulled zero lock
        const adminSubsRes = await httpRequest('GET', `/api/admin/tests/submissions/${testBicsId}`, null, adminAuth);
        const fetchedSubC = (adminSubsRes.body || []).find(s => (s._id || s.id) === subCBicsId);
        const fetchedSubA = (adminSubsRes.body || []).find(s => (s._id || s.id) === subABicsId);
        check(
            adminSubsRes.status === 200 && fetchedSubC?.totalScore === 53,
            '6.11: Admin submissions listing preserves resolved objection score without overwrite'
        );
        // Annulment zero-lock verification in JSON DB
        const dbLockTest = getJSONData();
        const lockSubA = dbLockTest.testSubmissions.find(s => String(s._id) === subAMongoId);
        lockSubA.verificationStatus = 'annulled';
        lockSubA.totalScore = 99;
        saveJSONData(dbLockTest);
        const adminSubsAfterAnnul = await httpRequest('GET', `/api/admin/tests/submissions/${testBicsId}`, null, adminAuth);
        const annulledFetched = (adminSubsAfterAnnul.body || []).find(s => (s._id || s.id) === subABicsId);
        check(annulledFetched?.totalScore === 0, '6.12: Admin submissions enforces zero score lock on annulled submissions');
        assert.ok(fetchedSubA, 'SubA listed');

        // Close verification window -> confirm evaluation, objection, reevaluation all return 403
        const closeRes = await httpRequest('POST', `/api/admin/tests/toggle-release/${testBicsId}`, { status: 'closed' }, adminAuth);
        check(closeRes.status === 200 && closeRes.body.verificationStatus === 'closed', '6.13: Admin closes verification window');

        const evalClosed = await httpRequest('GET', `/api/tests/evaluation/${subCBicsId}`, null, { 'Authorization': `Bearer ${studC.token}` });
        const objClosed = await httpRequest('POST', `/api/tests/objection/${subCBicsId}`, {
            questionId: testPayload.questions[0].id, questionIndex: 0, reason: 'Late', details: 'After closure'
        }, { 'Authorization': `Bearer ${studC.token}` });
        const reevalClosed = await httpRequest('POST', `/api/tests/reevaluation/${subCBicsId}`, {
            complaintText: 'Late request'
        }, { 'Authorization': `Bearer ${studC.token}` });
        check(
            evalClosed.status === 403 && objClosed.status === 403 && reevalClosed.status === 403,
            '6.14: Closed verification window blocks /evaluation/:id, /objection/:id, and /reevaluation/:id with 403'
        );

        console.log('\n==============================================================');
        console.log(`PILLAR 1 VERIFICATION COMPLETE: ${passed}/${total} CHECKS PASSED (100%)`);
        console.log('==============================================================\n');
    } finally {
        process.env.PRECHECK_ENFORCE = origPrecheckEnforce;
        process.env.NODE_ENV = origNodeEnv;
        dbState.isConnected = origDbConnected;
        global.fetch = origFetch;

        stopSubmissionReaper();
        stopEirfPipelineWorker();

        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }

        // Allow any fire-and-forget async email/pipeline/OTRF batch ticks to settle before restoring db.json
        await new Promise((resolve) => setTimeout(resolve, 1800));

        for (const fPath of uploadedTestFiles) {
            try { if (fs.existsSync(fPath)) fs.unlinkSync(fPath); } catch (_) {}
        }
        try {
            const curDb = getJSONData();
            const testSubRefs = (curDb.testSubmissions || [])
                .filter(s => [subAMongoId, subBMongoId, subCMongoId].includes(String(s._id || s.id)))
                .map(s => s.submissionRefId)
                .filter(Boolean);
            testSubRefs.forEach(ref => {
                const otrfPath = path.join(__dirname, '..', 'public', 'otrf', `otrf_${ref}.pdf`);
                if (fs.existsSync(otrfPath)) fs.unlinkSync(otrfPath);
            });
        } catch (_) {}

        if (dbBackup !== null) {
            fs.writeFileSync(DB_FILE, dbBackup, 'utf8');
        }
    }
}

runPillar1Suite()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[PILLAR 1 TEST SUITE CRASHED]:', err);
        process.exit(1);
    });
