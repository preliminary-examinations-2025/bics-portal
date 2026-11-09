/**
 * Pillar 3 Comprehensive Verification Suite:
 * PDF Generations (OTRF, EIRF Verdict, Hall Ticket) & Admin Timetable (Mode + Report Time)
 *
 * Verifies:
 * 1. Production OTRF regression fix via end-to-end Admin close -> dispatchOtrfBatchForClosedTest -> Gmail attachment:
 *    - Passes full TestConfig, Candidate, TestSubmission & EIRFReport (no 4x fake MCQs or Question #1..#4)
 *    - Maps QuestionSchema (`id`, `points`, `scc`/`mcc`/`coding`/`web`), sparse-safe answer matching (skipped question = 0)
 *    - Unclipped multi-word question titles, resolved objection marksBefore/marksAfter/diff, real securityMetadata & biometricResult
 *    - Dynamic duration, single footer per page (`Page X of Y`), decoded Page 1 QR payload
 * 2. OTRF annulment (rejected EIRF -> 0.0 / maxMarks), empty-question clean state & GET /api/tests/otrf-report/:idParam auth (401/403/200)
 * 3. EIRF Verdict PDF (`generateEirfVerdictPdfBuffer`):
 *    - Approved & Rejected workflows reading `biometricResult`, `securityMetadata`, `uploadedProofUrl` / `eirfProofUrl`
 *    - Unclipped long User-Agent + verbatim narrative wrapping, verdict-specific slip wording, zero appeal links, Page 1 QR decode
 * 4. Admin Timetable (`Mode` + `Report Time`) -> POST /api/admin/config -> GET /api/config -> Hall Ticket PDF:
 *    - Preserves custom Mode / Report Time verbatim, normalizes legacy rows, reflects in GET /api/candidate/generate-hallticket/:id
 *    - Empty `midSemFeedback: {}` / empty Map does NOT mark `[X]`, missing reportTime renders `As Scheduled`, Page 1 QR decode
 */

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Jimp } = require('jimp');
const jsQR = require('jsqr');

process.env.NODE_ENV = 'test';
process.env.PORT = '5011';
process.env.JWT_SECRET = 'pillar3_test_jwt_secret_2026';
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASS = 'admin123';
process.env.GMAIL_CLIENT_ID = 'mock_client_id';
process.env.GMAIL_CLIENT_SECRET = 'mock_client_secret';
process.env.GMAIL_REFRESH_TOKEN = 'mock_refresh_token';
process.env.PORTAL_URL = 'https://bicsportal.netlify.app';

const { DB_FILE, getJSONData, saveJSONData } = require('../config/db');
const dbBackup = fs.existsSync(DB_FILE) ? fs.readFileSync(DB_FILE, 'utf8') : null;

const app = require('../server');
const { generateToken } = require('../utils/jwt');
const { toBicsId, generateSubmissionRefId } = require('../utils/bicsId');
const {
    generateOtrfReportPdfBuffer,
    generateEirfVerdictPdfBuffer,
    generateHallTicketPdfBuffer,
    resolveOtrfArtifactMeta,
    persistOtrfPdfArtifact
} = require('../services/pdf');
const { cloudinary, formatCloudinaryMediaUrl } = require('../config/cloudinary');
const { sendOtrfEmail, dispatchOtrfBatchForClosedTest } = require('../services/gmailEmailService');
const { stopSubmissionReaper } = require('../workers/submissionReaper');
const { stopEirfPipelineWorker } = require('../workers/eirfPipelineWorker');

const pipePath = `\\\\.\\pipe\\bics_p3_${process.pid}_${Date.now()}`;
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

function parseCapturedMime(rawBase64Url) {
    const stdB64 = rawBase64Url.replace(/-/g, '+').replace(/_/g, '/');
    const mimeStr = Buffer.from(stdB64, 'base64').toString('utf8');
    const toMatch = mimeStr.match(/^To:\s*(.+)$/m);
    const subjMatch = mimeStr.match(/^Subject:\s*=\?UTF-8\?B\?([^?]+)\?=/m);
    const subject = subjMatch ? Buffer.from(subjMatch[1], 'base64').toString('utf8') : '';

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
            buffer: Buffer.from(m[2].replace(/\s+/g, ''), 'base64')
        });
    }

    return {
        to: toMatch ? toMatch[1].trim() : '',
        subject,
        htmlDecoded,
        attachments
    };
}

let cachedPdfJs = null;
async function extractPdfText(buf) {
    if (!cachedPdfJs) {
        cachedPdfJs = await import('../node_modules/pdfjs-dist/legacy/build/pdf.mjs');
    }
    const doc = await cachedPdfJs.getDocument({ data: new Uint8Array(buf), verbosity: 0 }).promise;
    const pageTexts = [];
    for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const tc = await page.getTextContent();
        const txt = tc.items.map(i => i.str + (i.hasEOL ? ' ' : '')).join('').replace(/\s+/g, ' ').trim();
        pageTexts.push(txt);
    }
    return { allText: pageTexts.join('\n'), numPages: doc.numPages, pageTexts };
}

async function renderPdfPagesAndDecodeHeaderQr(pdfBuffer, savePrefix = null) {
    const { pdf } = await import('pdf-to-img');
    const doc = await pdf(pdfBuffer, { scale: 3.0 });
    const pageBuffers = [];
    let pIdx = 1;
    for await (const pageImgBuf of doc) {
        pageBuffers.push(pageImgBuf);
        if (savePrefix && process.env.RENDER_SAMPLE_DIR) {
            fs.mkdirSync(process.env.RENDER_SAMPLE_DIR, { recursive: true });
            fs.writeFileSync(path.join(process.env.RENDER_SAMPLE_DIR, `${savePrefix}_p${pIdx}.png`), pageImgBuf);
        }
        pIdx++;
    }

    let decodedQr = null;
    if (pageBuffers.length > 0) {
        const img = await Jimp.fromBuffer(pageBuffers[0]);
        const w = img.bitmap.width;
        const h = img.bitmap.height;
        // Scan top-right ROI first (where Page 1 header QR always sits)
        const cropW = Math.floor(w * 0.35);
        const cropH = Math.floor(h * 0.25);
        const roi = img.clone().crop({ x: w - cropW, y: 0, w: cropW, h: cropH });
        const qrRes = jsQR(new Uint8ClampedArray(roi.bitmap.data), roi.bitmap.width, roi.bitmap.height);
        if (qrRes) {
            decodedQr = qrRes.data;
        } else {
            // Full page fallback
            const fullRes = jsQR(new Uint8ClampedArray(img.bitmap.data), w, h);
            if (fullRes) decodedQr = fullRes.data;
        }
    }

    return { pageCount: pageBuffers.length, decodedQr };
}

async function runPillar3Suite() {
    console.log('=======================================================================');
    console.log('🧪 RUNNING PILLAR 3 SUITE: PDF GENERATIONS & ADMIN TIMETABLE E2E');
    console.log('=======================================================================\n');

    let passed = 0;
    let failed = 0;
    let server = null;
    const origFetch = global.fetch;

    async function test(name, fn) {
        try {
            await fn();
            console.log(`  ✅ PASS: ${name}`);
            passed++;
        } catch (err) {
            console.error(`  ❌ FAIL: ${name}`);
            console.error(`     Error: ${err.message}`);
            if (err.stack) console.error(err.stack.split('\n').slice(0, 6).join('\n'));
            failed++;
        }
    }

    // Intercept Gmail REST calls cleanly
    global.fetch = async (url, init) => {
        const urlStr = String(url);
        if (urlStr.includes('oauth2.googleapis.com/token')) {
            return {
                ok: true,
                status: 200,
                json: async () => ({ access_token: 'mock_p3_access_token', expires_in: 3600 }),
                text: async () => JSON.stringify({ access_token: 'mock_p3_access_token' })
            };
        }
        if (urlStr.includes('gmail.googleapis.com/gmail/v1/users/me/messages/send')) {
            const parsedBody = JSON.parse(init.body || '{}');
            const decoded = parseCapturedMime(parsedBody.raw || '');
            capturedEmails.push(decoded);
            return {
                ok: true,
                status: 200,
                json: async () => ({ id: 'msg_p3_' + capturedEmails.length }),
                text: async () => JSON.stringify({ id: 'msg_p3_' + capturedEmails.length })
            };
        }
        return { ok: false, status: 404, text: async () => 'Not mocked', json: async () => ({}) };
    };

    try {
        server = app.listen(pipePath);
        await new Promise((resolve) => server.once('listening', resolve));

        const pngImg = new Jimp({ width: 48, height: 48, color: 0x1d4ed8ff });
        const pngDataUrl = await pngImg.getBase64('image/png');
        const bioImg = new Jimp({ width: 48, height: 48, color: 0x0f766eff });
        const bioDataUrl = await bioImg.getBase64('image/png');

        const adminToken = generateToken({ id: 'admin', role: 'admin', username: 'admin' }, '2h');

        const candOwnerId = '66f300000000000000000001';
        const candOtherId = '66f300000000000000000002';
        const testMongoId = '66f300000000000000000010';
        const subNormalId = '66f300000000000000000101';
        const subAnnulledId = '66f300000000000000000102';
        const subEmptyId = '66f300000000000000000103';

        const subNormalRef = '903112233445';
        const subAnnulledRef = '903112233446';

        const ownerToken = generateToken({ id: candOwnerId, role: 'student', studentId: 'STU-P3-001' }, '2h');
        const otherToken = generateToken({ id: candOtherId, role: 'student', studentId: 'STU-P3-002' }, '2h');

        const sampleQuestions = [
            {
                id: 'q-scc-1',
                type: 'scc',
                title: 'Time Complexity of Red-Black Tree Insertion in Worst Case Scenarios',
                points: 10
            },
            {
                id: 'q-mcc-2',
                type: 'mcc',
                title: 'Select All Lock-Free Concurrent Data Structures With Linearizability',
                points: 15
            },
            {
                id: 'q-coding-3',
                type: 'coding',
                title: 'Implement Dijkstra Shortest Path Algorithm With Binary Min-Heap',
                points: 30
            },
            {
                id: 'q-coding-4',
                type: 'coding',
                title: 'Detect Cycle in Directed Acyclic Dependency Graph Using Kahn Algorithm',
                points: 20
            },
            {
                id: 'q-web-5',
                type: 'web',
                title: 'Build Accessible Responsive Navigation Drawer Using CSS Grid and ARIA',
                points: 25
            }
        ];

        const db = getJSONData();
        db.config = {
            ...(db.config || {}),
            examType: 'midsem',
            timetableNotice: 'Pillar 3 Preliminary Assessment Schedule',
            timetable: [
                {
                    code: 'R526CS09T',
                    course: 'Advanced Algorithms & Web Systems',
                    date: '2026-11-08',
                    time: '02:30 PM to 04:00 PM',
                    mode: 'Online Mode (Proctored)',
                    reportTime: '02:00 PM',
                    marks: 100
                }
            ]
        };
        db.candidates = [
            {
                _id: candOwnerId,
                id: candOwnerId,
                studentId: 'STU-P3-001',
                name: 'Ananya Deshmukh',
                username: 'ananya.p3',
                eligible: true,
                midSemConsentSigned: true,
                midSemFeedback: { R526CS01T: { rating: 5 } },
                midSemLedgerUrl: '/public/uploads/ledger-ananya.pdf',
                midSemEmailVerified: true,
                registeredCourses: ['R526CS09T - Advanced Algorithms & Web Systems', 'R526CS02L'],
                registrationData: {
                    collegeEmail: 'ananya.deshmukh@bics.edu',
                    personalEmail: 'ananya.personal@example.com',
                    permanentAddress: 'Block C-408, Sahyadri Academic Hostel, Pune - 411004, Maharashtra',
                    photoUrl: pngDataUrl,
                    signatureUrl: bioDataUrl
                }
            },
            {
                _id: candOtherId,
                id: candOtherId,
                studentId: 'STU-P3-002',
                name: 'Other Student',
                username: 'other.p3',
                eligible: true,
                registrationData: { personalEmail: 'other@example.com', collegeEmail: 'other@bics.edu' }
            }
        ];

        db.tests = [
            {
                _id: testMongoId,
                id: testMongoId,
                title: 'End-to-End Mixed Systems, Coding & Web Examination',
                course: 'Advanced Algorithms & Web Systems',
                courseCode: 'R526CS09T',
                marks: 100,
                duration: 90,
                isPublished: true,
                verificationStatus: 'released',
                questions: sampleQuestions
            }
        ];

        const testStartedAt = new Date('2026-11-08T09:00:00.000Z');
        const testSubmittedAt = new Date('2026-11-08T10:18:00.000Z'); // 78 mins logged

        const secMetaRealistic = {
            ip: '49.36.214.88',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
            operatingSystem: 'Windows 11 Enterprise 64-bit',
            browser: 'Google Chrome 131.0',
            browserDetails: { name: 'Google Chrome', version: '131.0.6778' },
            osDetails: { osVersion: 'Windows 11 Pro 24H2', isVirtualMachineDetected: false, vmIndicator: 'None' },
            screenResolution: '2560x1440',
            hardwareConcurrency: 12,
            deviceMemoryGB: 16,
            isExtendedDisplay: true,
            webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11)',
            network: {
                publicIp: '49.36.214.88',
                isp: 'Tata Play Fiber Broadband',
                organization: 'Tata Play Ltd',
                city: 'Pune',
                region: 'Maharashtra',
                country: 'India',
                timezone: 'Asia/Kolkata',
                isProxyOrVpn: false,
                isDatacenterHosting: false
            }
        };

        db.testSubmissions = [
            {
                _id: subNormalId,
                id: subNormalId,
                submissionRefId: subNormalRef,
                testId: testMongoId,
                candidateId: candOwnerId,
                studentId: 'STU-P3-001',
                candidateName: 'Ananya Deshmukh',
                candidateEmail: 'ananya.personal@example.com',
                testTitle: 'End-to-End Mixed Systems, Coding & Web Examination',
                startedAt: testStartedAt.toISOString(),
                submittedAt: testSubmittedAt.toISOString(),
                verificationStatus: 'active',
                eirfStatus: 'none',
                score: 75,
                totalScore: 75,
                submissionReason: 'manual_submit',
                securityMetadata: secMetaRealistic,
                biometricResult: {
                    similarityScore: 94.2,
                    decision: 'matched',
                    livenessPassed: true,
                    challengeType: 'MOVE_HEAD_DOWN',
                    referencePhotoUrl: pngDataUrl,
                    verifiedPhotoUrl: bioDataUrl,
                    evaluatedAt: testStartedAt.toISOString()
                },
                proctoringLog: {
                    fullscreenExits: 1,
                    tabSwitches: 0,
                    webcamStatus: 'active',
                    events: [
                        {
                            type: 'CONSENT_ACCEPTED',
                            timestamp: new Date('2026-11-08T08:57:00.000Z').toISOString(),
                            details: 'Candidate accepted Examination Integrity & Proctoring Undertaking.'
                        },
                        {
                            type: 'PROCTORING_ALLOWED',
                            timestamp: new Date('2026-11-08T08:58:15.000Z').toISOString(),
                            details: 'Webcam & microphone permissions granted for live biometric proctoring.'
                        },
                        {
                            type: 'TEST_STARTED',
                            timestamp: testStartedAt.toISOString(),
                            details: 'Online examination terminal launched in fullscreen lock.'
                        },
                        {
                            type: 'OPTION_MARKED',
                            timestamp: new Date('2026-11-08T09:08:00.000Z').toISOString(),
                            details: 'Candidate selected option on Q1.'
                        },
                        {
                            type: 'FULLSCREEN_EXIT',
                            timestamp: new Date('2026-11-08T09:24:10.000Z').toISOString(),
                            durationSeconds: 4,
                            details: 'OS screen magnification shortcut temporarily exited fullscreen for 4 seconds'
                        },
                        {
                            type: 'TEST_SUBMITTED',
                            timestamp: testSubmittedAt.toISOString(),
                            details: 'Candidate manually submitted completed examination.'
                        }
                    ]
                },
                // Notice q-coding-4 is deliberately omitted to test sparse-safe matching
                answers: [
                    { questionId: 'q-scc-1', score: 10, initialScore: 10, isObjected: false },
                    { questionId: 'q-mcc-2', score: 15, initialScore: 10, isObjected: true, isObjectionResolved: true, scoreAfterObjection: 15 },
                    { questionId: 'q-coding-3', score: 28, initialScore: 28, isObjected: false },
                    { questionId: 'q-web-5', score: 22, initialScore: 22, isObjected: false }
                ],
                objections: [
                    {
                        _id: '66f3obj00000000000000001',
                        objectionId: 'OBJ-2026-00419',
                        questionId: 'q-mcc-2',
                        questionIndex: 1,
                        reason: 'Wait-free and Lock-free Michael-Scott queues satisfy linearizability guarantees in Theorem 4.2',
                        marksBefore: 10,
                        marksAfter: 15,
                        marksDiff: 5,
                        status: 'resolved'
                    }
                ],
                emailsSent: {}
            },
            {
                _id: subAnnulledId,
                id: subAnnulledId,
                submissionRefId: subAnnulledRef,
                testId: testMongoId,
                candidateId: candOwnerId,
                studentId: 'STU-P3-001',
                candidateName: 'Ananya Deshmukh',
                candidateEmail: 'ananya.personal@example.com',
                testTitle: 'End-to-End Mixed Systems, Coding & Web Examination',
                startedAt: testStartedAt.toISOString(),
                submittedAt: testSubmittedAt.toISOString(),
                verificationStatus: 'annulled',
                eirfStatus: 'rejected',
                eirfReportId: 'EIRF-2026-P3REJ',
                eirfProofUrl: '/public/uploads/eirf_proofs/proof_rejected.png',
                score: 0,
                totalScore: 0,
                securityMetadata: secMetaRealistic,
                biometricResult: {
                    similarityScore: 91.8,
                    decision: 'matched',
                    livenessPassed: true,
                    challengeType: 'BLINK_BOTH_EYES',
                    referencePhotoUrl: pngDataUrl,
                    verifiedPhotoUrl: bioDataUrl,
                    evaluatedAt: testStartedAt.toISOString()
                },
                proctoringLog: { fullscreenExits: 3, tabSwitches: 2, events: [] },
                answers: [
                    { questionId: 'q-scc-1', score: 0, initialScore: 10 },
                    { questionId: 'q-web-5', score: 0, initialScore: 25 }
                ],
                objections: [],
                emailsSent: {}
            },
            {
                _id: subEmptyId,
                id: subEmptyId,
                submissionRefId: '903112233447',
                testId: '66f300000000000000000099',
                candidateId: candOwnerId,
                studentId: 'STU-P3-001',
                candidateName: 'Ananya Deshmukh',
                answers: [],
                emailsSent: { otrfSent: true }
            }
        ];

        db.eirfReports = [
            {
                _id: '66f3eirf0000000000000001',
                reportId: 'EIRF-2026-P3REJ',
                submissionId: subAnnulledId,
                submissionRefId: subAnnulledRef,
                studentId: 'STU-P3-001',
                candidateName: 'Ananya Deshmukh',
                testId: testMongoId,
                courseCode: 'R526CS09T',
                courseName: 'Advanced Algorithms & Web Systems',
                status: 'rejected',
                primaryCause: 'Unauthorized External Application Usage',
                detailedExplanation: 'Candidate switched focus for an extended duration during active algorithmic implementation, failing to correlate telemetry with an approved system disruption or institutional proctor notice.',
                uploadedProofUrl: '/public/uploads/eirf_proofs/proof_rejected.png',
                formAnswers: {
                    section2: {
                        tabReason: 'Opened external terminal documentation briefly during web layout question',
                        fullscreenReason: 'Window lost focus twice when switching virtual desktops'
                    },
                    section3: { peripherals: 'External mechanical keyboard connected via USB-C hub' },
                    section4: {
                        explanation: 'Candidate switched focus for an extended duration during active algorithmic implementation, failing to correlate telemetry with an approved system disruption or institutional proctor notice.'
                    }
                },
                adminRemarks: 'Telemetry records show sustained non-whitelisted window focus transitions inconsistent with hardware interrupt.',
                resolutionCategory: 'Unexplained Window Deviation Confirmed',
                remediationAction: 'Examination Score Annulled (Zero Points)',
                createdAt: new Date('2026-11-08T10:30:00.000Z').toISOString(),
                reviewedAt: new Date('2026-11-08T12:15:00.000Z').toISOString()
            }
        ];
        saveJSONData(db);

        // -------------------------------------------------------------------
        // TEST GROUP 1: Real OTRF Email Dispatch Pipeline & PDF Fidelity
        // -------------------------------------------------------------------
        console.log('--- 1. End-to-End OTRF Batch Dispatch (BICSID -> Email -> PDF Verification) ---');

        let otrfPdfBufNormal = null;

        await test('Admin close test via BICSID dispatches OTRF email with full mixed question titles, marks & telemetry', async () => {
            const testBicsId = toBicsId(testMongoId);
            const res = await httpRequest(
                'POST',
                `/api/admin/tests/set-verification-status/${testBicsId}`,
                { status: 'closed' },
                { Authorization: `Bearer ${adminToken}` }
            );
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.verificationStatus, 'closed');

            // Wait briefly for fire-and-forget dispatchOtrfBatchForClosedTest initiated by route
            for (let i = 0; i < 30 && capturedEmails.length < 2; i++) {
                await new Promise(r => setTimeout(r, 80));
            }
            assert.ok(capturedEmails.length >= 2, `Expected >=2 OTRF emails dispatched on close, got ${capturedEmails.length}`);

            const normalEmail = capturedEmails.find(e => e.subject.includes(subNormalRef));
            assert.ok(normalEmail, 'Normal submission OTRF email must be dispatched');
            assert.strictEqual(normalEmail.attachments.length, 1, 'OTRF email must have 1 PDF attachment');
            assert.strictEqual(normalEmail.attachments[0].filename, `OTRF_${subNormalRef}.pdf`);

            otrfPdfBufNormal = normalEmail.attachments[0].buffer;
            assert.strictEqual(otrfPdfBufNormal.slice(0, 5).toString('ascii'), '%PDF-', 'Attached OTRF must be valid PDF');

            const { allText } = await extractPdfText(otrfPdfBufNormal);

            // Production bug regressions check
            assert.strictEqual(allText.includes('Question #1'), false, 'Must NOT contain synthetic "Question #1"');
            assert.strictEqual(allText.includes('75.0 / 100.0'), true, 'Must render true total score 75.0 / 100.0 (NOT fake 40.0)');
            assert.strictEqual(allText.includes('40.0 / 40.0'), false, 'Must NOT render fake 40.0 total');

            // Full real titles unclipped across SCC, MCC, CODING, WEB
            assert.ok(allText.includes('Time Complexity of Red-Black Tree Insertion in Worst Case Scenarios'), 'SCC full title present');
            assert.ok(allText.includes('Select All Lock-Free Concurrent Data Structures With Linearizability'), 'MCC full title present');
            assert.ok(allText.includes('Implement Dijkstra Shortest Path Algorithm With Binary Min-Heap'), 'Coding q3 full title present');
            assert.ok(allText.includes('Detect Cycle in Directed Acyclic Dependency Graph Using Kahn Algorithm'), 'Skipped Coding q4 full title present');
            assert.ok(allText.includes('Build Accessible Responsive Navigation Drawer Using CSS Grid and ARIA'), 'Web full title present');

            // Real Question types
            assert.ok(allText.includes('SCC (MCQ)'), 'SCC type formatted');
            assert.ok(allText.includes('MCC (MULTI)'), 'MCC type formatted');
            assert.ok(allText.includes('CODING'), 'CODING type formatted');
            assert.ok(allText.includes('WEB'), 'WEB type formatted');

            // Real Course, Duration & Telemetry (no hardcoded 98.6% or fake 105 Mins)
            assert.ok(allText.includes('R526CS09T - Advanced Algorithms & Web Systems'), 'Real course code & course field');
            assert.ok(allText.includes('90 Minutes (Logged: 78 Min(s))'), 'Real duration 90 mins & computed 78 logged mins');
            assert.ok(allText.includes('49.36.214.88'), 'Real securityMetadata.ip');
            assert.ok(allText.includes('Tata Play Fiber Broadband'), 'Real securityMetadata.network.isp');
            assert.ok(allText.includes('2560x1440 | Extended/Multi-Display Flagged'), 'Real screenResolution + isExtendedDisplay flag');
            assert.ok(allText.includes('94.2%'), 'Real biometricResult.similarityScore');
            assert.ok(allText.includes('MOVE_HEAD_DOWN'), 'Real biometricResult.challengeType');
            assert.strictEqual(allText.includes('98.6%'), false, 'Must NOT contain hardcoded 98.6%');

            // Resolved objection check
            assert.ok(allText.includes('OBJ-2026-00419'), 'Objection ID present');
            assert.ok(allText.includes('Wait-free and Lock-free Michael-Scott queues satisfy linearizability'), 'Full unclipped objection reason present');
            assert.ok(allText.includes('+5.0'), 'Resolved marksDiff +5.0 present');
            assert.ok(allText.includes('75.0%'), 'Aggregate percentage 75.0% present');

            // Idempotency: calling batch dispatch again skips already sent
            const secondBatch = await dispatchOtrfBatchForClosedTest(testBicsId);
            assert.strictEqual(secondBatch.dispatched, 0, 'Second batch run must skip already sent submissions');
        });

        await test('OTRF PDF enforces explicit 4-page layout, KV segregation, 5A/5B split, local/Cloudinary artifact persistence & matching QR URL', async () => {
            assert.ok(otrfPdfBufNormal, 'Normal OTRF buffer required');
            const { allText, pageTexts, numPages } = await extractPdfText(otrfPdfBufNormal);
            const { pageCount, decodedQr } = await renderPdfPagesAndDecodeHeaderQr(otrfPdfBufNormal, 'otrf');
            const rawPdfStr = otrfPdfBufNormal.toString('latin1');
            const subNormalBicsId = toBicsId(subNormalId);

            assert.strictEqual(numPages, pageCount);
            assert.strictEqual(pageCount, 4, `Expected exact 4 pages for standard 5-question OTRF, got ${pageCount}`);
            for (let p = 1; p <= pageCount; p++) {
                const label = `Page ${p} of ${pageCount}`;
                const occurrences = allText.split(label).length - 1;
                assert.strictEqual(occurrences, 1, `Expected exactly 1 footer "${label}", found ${occurrences}`);
                assert.ok(pageTexts[p - 1].includes(label), `Page ${p} text must contain "${label}"`);
            }

            // Explicit page segregation assertions:
            // Page 1: Sections 1, 2, 3 only
            assert.ok(pageTexts[0].includes('1. EXAMINATION & ASSESSMENT PARTICULARS'), 'Page 1 has Section 1');
            assert.ok(pageTexts[0].includes('2. CANDIDATE DETAILS & REGISTRATION RECORD'), 'Page 1 has Section 2');
            assert.ok(pageTexts[0].includes('3. BIOMETRIC VERIFICATION & SYSTEM TELEMETRY'), 'Page 1 has Section 3');
            assert.strictEqual(pageTexts[0].includes('4. QUESTIONWISE BREAKDOWN'), false, 'Page 1 must NOT contain Section 4');

            // Page 2: Section 4 Questions Table only
            assert.ok(pageTexts[1].includes('4. QUESTIONWISE BREAKDOWN & SCORE MATRIX'), 'Page 2 has Section 4');
            assert.ok(pageTexts[1].includes('TOTAL MARKS SCORED: 75.0 / 100.0'), 'Page 2 has Section 4 Score Summary');
            assert.strictEqual(pageTexts[1].includes('5. PROCTORING TELEMETRY'), false, 'Page 2 must NOT contain Section 5');
            assert.strictEqual(pageTexts[1].includes('6. OBJECTIONS SUMMARY'), false, 'Page 2 must NOT contain Section 6');

            // Page 3: Section 5 (5A standard lifecycle + 5B violations split) only
            assert.ok(pageTexts[2].includes('5. PROCTORING TELEMETRY & AUDIT LOGS'), 'Page 3 starts Section 5');
            assert.ok(pageTexts[2].includes('5A. STANDARD SESSION LIFECYCLE & COMPLIANCE LOGS'), 'Page 3 has 5A Lifecycle');
            assert.ok(pageTexts[2].includes('5B. PROCTORING VIOLATIONS & SECURITY ANOMALY LOGS'), 'Page 3 has 5B Violations');
            assert.ok(pageTexts[2].includes('CONSENT_ACCEPTED'), '5A contains CONSENT_ACCEPTED');
            assert.ok(pageTexts[2].includes('PROCTORING_ALLOWED'), '5A contains PROCTORING_ALLOWED');
            assert.ok(pageTexts[2].includes('TEST_STARTED'), '5A contains TEST_STARTED');
            assert.ok(pageTexts[2].includes('TEST_SUBMITTED'), '5A contains TEST_SUBMITTED');
            assert.ok(pageTexts[2].includes('FULLSCREEN_EXIT'), '5B contains FULLSCREEN_EXIT');
            assert.strictEqual(pageTexts[2].includes('OPTION_MARKED'), false, 'Routine OPTION_MARKED must NOT clutter 5A/5B');
            assert.strictEqual(pageTexts[2].includes('6. OBJECTIONS SUMMARY'), false, 'Page 3 must NOT contain Section 6');

            // Page 4: Sections 6, 7, 8
            assert.ok(pageTexts[3].includes('6. OBJECTIONS SUMMARY & MARKS AUDIT'), 'Page 4 starts Section 6');
            assert.ok(pageTexts[3].includes('7. EIRF INCIDENT & ADJUDICATION SUMMARY'), 'Page 4 has Section 7');
            assert.ok(pageTexts[3].includes('8. DIGITAL VERIFICATION & AUTHORITATIVE SEAL'), 'Page 4 has Section 8');

            // KV Segregation checks: double-KV rows must precede single-KV rows in each section
            assert.ok(pageTexts[0].indexOf('Delivery Mode:') < pageTexts[0].indexOf('Examination Title:'), 'Section 1 double-KVs precede single-KVs');
            assert.ok(pageTexts[0].indexOf('College Email:') < pageTexts[0].indexOf('Enrolled Courses:'), 'Section 2 double-KVs precede single-KVs');
            assert.ok(pageTexts[0].indexOf('Submission Method:') < pageTexts[0].indexOf('Browser / Agent:'), 'Section 3 double-KVs precede single-KVs');
            assert.ok(pageTexts[3].indexOf('Score Standing:') < pageTexts[3].indexOf('Primary Cause / Flag:'), 'Section 7 double-KVs precede single-KVs');
            assert.ok(pageTexts[3].indexOf('Reference ID:') < pageTexts[3].indexOf('Verification URL:'), 'Section 8 double-KVs precede single-KVs');

            // Executive layout rules: single Submission ID on Page 1 only, Reference ID on continuation/footers, dynamic examType + academic session, static fonts
            assert.strictEqual(allText.split(subNormalBicsId).length - 1, 1, 'Submission ID (BICSID) must appear strictly ONCE across the PDF');
            assert.ok(pageTexts[0].includes(subNormalBicsId), 'Submission ID (BICSID) must appear on Page 1');
            assert.ok(allText.split(`Reference ID: ${subNormalRef}`).length - 1 >= pageCount, 'Reference ID must appear cleanly in continuation headers & footers');
            assert.ok(allText.includes('Academic Year 2026-27'), 'Academic year 2026-27 must appear');
            assert.ok(allText.includes('Semester I'), 'Semester I must appear');
            assert.ok(allText.includes('Mid-Sem Test 2026'), 'Exam type label Mid-Sem Test 2026 must resolve from config');
            assert.ok(allText.includes('Online Mode (Proctored)'), 'Delivery mode resolved dynamically from timetable');
            assert.ok(rawPdfStr.includes('PlusJakartaSans'), 'Plus Jakarta Sans embedded in OTRF');
            assert.ok(rawPdfStr.includes('Inter'), 'Inter embedded in OTRF');

            // Local fallback artifact storage & Verification URL / QR alignment
            const expectedLocalRel = `/public/otrf/otrf_${subNormalRef}.pdf`;
            const expectedLocalDisk = path.join(__dirname, '..', 'public', 'otrf', `otrf_${subNormalRef}.pdf`);
            assert.ok(fs.existsSync(expectedLocalDisk), `Local OTRF fallback file must be written at ${expectedLocalDisk}`);
            assert.strictEqual(fs.readFileSync(expectedLocalDisk).slice(0, 5).toString('ascii'), '%PDF-', 'Saved local OTRF must be valid PDF');

            const storedDb = getJSONData();
            const updatedNormalSub = storedDb.testSubmissions.find(s => s._id === subNormalId);
            assert.strictEqual(updatedNormalSub.otrfPdfUrl, expectedLocalRel, 'Submission must persist local fallback otrfPdfUrl when Cloudinary is absent');

            assert.ok(decodedQr, 'Must decode Page 1 OTRF QR code');
            assert.ok(decodedQr.endsWith(expectedLocalRel), `QR must point to ${expectedLocalRel}, got ${decodedQr}`);
            assert.ok(pageTexts[3].includes(decodedQr), `Section 8 Verification URL must match QR payload (${decodedQr})`);
            assert.strictEqual(decodedQr.includes(subNormalId), false, 'QR must NOT leak raw MongoID');

            // Static file HTTP route check
            const staticFetch = await httpRequest('GET', expectedLocalRel);
            assert.strictEqual(staticFetch.status, 200, 'Express static /public/otrf/ must serve the saved PDF');
            assert.strictEqual(staticFetch.rawBuffer.slice(0, 5).toString('ascii'), '%PDF-');
        });

        await test('25-question OTRF spans multi-page Questions cleanly and starts Section 5 on the next fresh page', async () => {
            const curDb = getJSONData();
            const cand = curDb.candidates[0];
            const questions25 = Array.from({ length: 25 }, (_, i) => ({
                id: `q-25-${i + 1}`,
                type: i % 4 === 0 ? 'scc' : (i % 4 === 1 ? 'mcc' : (i % 4 === 2 ? 'coding' : 'web')),
                title: `Comprehensive Algorithmic & Systems Verification Module Question Number ${i + 1} Evaluating Complexity, Concurrency & Fault Tolerance`,
                points: 4
            }));
            const answers25 = questions25.map((q, idx) => ({
                questionId: q.id,
                score: idx % 5 === 0 ? 3 : 4,
                initialScore: idx % 5 === 0 ? 3 : 4,
                isObjected: false
            }));
            const test25 = {
                ...curDb.tests[0],
                marks: 100,
                questions: questions25
            };
            const sub25 = {
                ...curDb.testSubmissions[0],
                answers: answers25
            };

            const pdf25 = await generateOtrfReportPdfBuffer({
                submission: sub25,
                test: test25,
                candidate: cand,
                systemConfig: curDb.config
            });
            const { pageTexts: p25Texts, numPages: p25Count } = await extractPdfText(pdf25);
            await renderPdfPagesAndDecodeHeaderQr(pdf25, 'otrf_25q');

            assert.ok(p25Count >= 5, `25-question OTRF must span at least 5 pages, got ${p25Count}`);
            assert.strictEqual(p25Texts[0].includes('4. QUESTIONWISE BREAKDOWN'), false, 'Page 1 must not start Questions');

            const sec5PageIdx = p25Texts.findIndex(t => t.includes('5. PROCTORING TELEMETRY & AUDIT LOGS'));
            const sec6PageIdx = p25Texts.findIndex(t => t.includes('6. OBJECTIONS SUMMARY & MARKS AUDIT'));
            assert.ok(sec5PageIdx >= 3, `Section 5 must start after multi-page Questions (index >= 3), got Page ${sec5PageIdx + 1}`);
            assert.ok(sec6PageIdx > sec5PageIdx, `Section 6 must start on fresh page after Section 5, got s5=${sec5PageIdx + 1}, s6=${sec6PageIdx + 1}`);

            // Ensure the Section 5 page contains NO question rows and NO Section 4 banner
            assert.strictEqual(p25Texts[sec5PageIdx].includes('4. QUESTIONWISE BREAKDOWN'), false, 'Section 5 page must NOT share with Section 4');
            assert.strictEqual(p25Texts[sec5PageIdx].includes('TOTAL MARKS SCORED:'), false, 'Section 5 page must NOT contain Score Summary from Section 4');
            assert.strictEqual(p25Texts[sec5PageIdx].includes('Q. 25'), false, 'Section 5 page must NOT contain trailing Question 25 row');
            // Verify Q.25 landed before sec5PageIdx
            const q25PageIdx = p25Texts.findIndex(t => t.includes('Question Number 25'));
            assert.ok(q25PageIdx >= 1 && q25PageIdx < sec5PageIdx, `Q25 must appear cleanly on Question page(s) before Section 5 (q25=${q25PageIdx + 1}, sec5=${sec5PageIdx + 1})`);
        });

        await test('Cloudinary-configured OTRF upload stores /media/otrf/otrf_<ref>.pdf and encodes https://bicsportal.netlify.app/media/otrf/otrf_<ref>.pdf in QR', async () => {
            const origCloudName = process.env.CLOUDINARY_CLOUD_NAME;
            const origCloudKey = process.env.CLOUDINARY_API_KEY;
            const origCloudSec = process.env.CLOUDINARY_API_SECRET;
            const origUploadStream = cloudinary.uploader.upload_stream;

            let capturedUploadOpts = null;
            let capturedByteLen = 0;

            try {
                process.env.CLOUDINARY_CLOUD_NAME = 'dl7xqcnmr';
                process.env.CLOUDINARY_API_KEY = 'mock_key_123';
                process.env.CLOUDINARY_API_SECRET = 'mock_secret_456';

                cloudinary.uploader.upload_stream = (options, cb) => {
                    capturedUploadOpts = options;
                    const { Writable } = require('stream');
                    const chunks = [];
                    return new Writable({
                        write(chunk, _enc, next) {
                            chunks.push(chunk);
                            next();
                        },
                        final(done) {
                            capturedByteLen = Buffer.concat(chunks).length;
                            cb(null, {
                                secure_url: `https://res.cloudinary.com/dl7xqcnmr/raw/upload/v1762000001/${options.folder}/${options.public_id}`
                            });
                            done();
                        }
                    });
                };

                // Verify helper formatCloudinaryMediaUrl handles OTRF raw path
                assert.strictEqual(
                    formatCloudinaryMediaUrl('https://res.cloudinary.com/dl7xqcnmr/raw/upload/v1762000001/BICS_2026/otrf/otrf_903112233445.pdf'),
                    '/media/otrf/otrf_903112233445.pdf'
                );

                // Reset idempotency for subNormalId and trigger sendOtrfEmail with Cloudinary mocked active
                const curDb = getJSONData();
                const target = curDb.testSubmissions.find(s => s._id === subNormalId);
                target.emailsSent = {};
                target.otrfPdfUrl = '';
                saveJSONData(curDb);

                await sendOtrfEmail(target);

                assert.ok(capturedUploadOpts, 'cloudinary.uploader.upload_stream must be called');
                assert.strictEqual(capturedUploadOpts.folder, 'BICS_2026/otrf');
                assert.strictEqual(capturedUploadOpts.resource_type, 'raw');
                assert.strictEqual(capturedUploadOpts.public_id, `otrf_${subNormalRef}.pdf`);
                assert.ok(capturedByteLen > 5000, 'Uploaded PDF stream must be non-empty');

                const afterDb = getJSONData();
                const afterSub = afterDb.testSubmissions.find(s => s._id === subNormalId);
                assert.strictEqual(afterSub.otrfPdfUrl, `/media/otrf/otrf_${subNormalRef}.pdf`, 'Submission must save /media/otrf/otrf_<ref>.pdf');

                const lastEmail = capturedEmails[capturedEmails.length - 1];
                const { pageTexts } = await extractPdfText(lastEmail.attachments[0].buffer);
                const { decodedQr } = await renderPdfPagesAndDecodeHeaderQr(lastEmail.attachments[0].buffer, null);
                const expectedPortalMediaUrl = `https://bicsportal.netlify.app/media/otrf/otrf_${subNormalRef}.pdf`;
                assert.strictEqual(decodedQr, expectedPortalMediaUrl, 'Cloudinary QR must point to https://bicsportal.netlify.app/media/otrf/otrf_<ref>.pdf');
                assert.ok(pageTexts[3].includes(expectedPortalMediaUrl), 'Section 8 Verification URL must match Netlify /media/otrf proxy URL');
            } finally {
                cloudinary.uploader.upload_stream = origUploadStream;
                if (origCloudName === undefined) delete process.env.CLOUDINARY_CLOUD_NAME; else process.env.CLOUDINARY_CLOUD_NAME = origCloudName;
                if (origCloudKey === undefined) delete process.env.CLOUDINARY_API_KEY; else process.env.CLOUDINARY_API_KEY = origCloudKey;
                if (origCloudSec === undefined) delete process.env.CLOUDINARY_API_SECRET; else process.env.CLOUDINARY_API_SECRET = origCloudSec;
            }
        });

        // -------------------------------------------------------------------
        // TEST GROUP 2: Annulled OTRF, Empty Submission & Route Security
        // -------------------------------------------------------------------
        console.log('\n--- 2. OTRF Annulment, Empty State & HTTP Auth Security ---');

        await test('Annulled submission OTRF enforces 0.0 / 100.0 marks, honest "Details not available" lifecycle fallback & empty submission fallback', async () => {
            const annulledEmail = capturedEmails.find(e => e.subject.includes(subAnnulledRef));
            assert.ok(annulledEmail, 'Annulled submission OTRF email must exist');
            const { allText, pageTexts } = await extractPdfText(annulledEmail.attachments[0].buffer);
            assert.ok(allText.includes('0.0 / 100.0'), 'Annulled submission must show 0.0 / 100.0');
            assert.ok(allText.includes('Score Annulled by Integrity Committee'), 'Annulment notice present');
            assert.ok(allText.includes('VERIFICATION CLOSED / ANNULLED'), 'Annulled badge present');
            assert.ok(pageTexts[2].includes('5A. STANDARD SESSION LIFECYCLE & COMPLIANCE LOGS'), 'Annulled OTRF renders 5A lifecycle');
            assert.ok(pageTexts[2].includes('Not Logged'), 'Unrecorded consent/proctoring checkpoints render honest Not Logged state');

            const emptyPdf = await generateOtrfReportPdfBuffer({
                submission: db.testSubmissions.find(s => s._id === subEmptyId),
                test: {},
                candidate: {}
            });
            const emptyText = (await extractPdfText(emptyPdf)).allText;
            assert.ok(emptyText.includes('No question records found for this submission'), 'Empty submission shows honest fallback');
            assert.ok(emptyText.includes('Details not available'), 'Missing fields render "Details not available"');
            assert.strictEqual(emptyText.includes('No details available'), false, 'Must NOT render "No details available"');
            assert.strictEqual(emptyText.includes('Question #1'), false, 'Empty submission must NOT fabricate Question #1..#4');
        });

        await test('GET /api/tests/otrf-report/:idParam enforces 401/403 ownership and streams valid OTRF PDF for owner/admin', async () => {
            const subBicsId = toBicsId(subNormalId);

            const unauth = await httpRequest('GET', `/api/tests/otrf-report/${subBicsId}`);
            assert.strictEqual(unauth.status, 401, 'Unauthenticated request must return 401');

            const wrongStudent = await httpRequest('GET', `/api/tests/otrf-report/${subBicsId}`, null, {
                Authorization: `Bearer ${otherToken}`
            });
            assert.strictEqual(wrongStudent.status, 403, 'Non-owning student must receive 403');

            const ownerRes = await httpRequest('GET', `/api/tests/otrf-report/${subBicsId}`, null, {
                Authorization: `Bearer ${ownerToken}`
            });
            assert.strictEqual(ownerRes.status, 200, 'Owning student must receive 200');
            assert.ok(String(ownerRes.headers['content-type']).includes('application/pdf'), 'Must stream application/pdf');
            assert.strictEqual(ownerRes.rawBuffer.slice(0, 5).toString('ascii'), '%PDF-');
            const ownerText = (await extractPdfText(ownerRes.rawBuffer)).allText;
            assert.ok(ownerText.includes('Build Accessible Responsive Navigation Drawer Using CSS Grid and ARIA'));

            const adminByRef = await httpRequest('GET', `/api/tests/otrf-report/${subNormalRef}`, null, {
                Authorization: `Bearer ${adminToken}`
            });
            assert.strictEqual(adminByRef.status, 200, 'Admin lookup by 12-digit submissionRefId must succeed');
            assert.strictEqual(adminByRef.rawBuffer.slice(0, 5).toString('ascii'), '%PDF-');
        });

        // -------------------------------------------------------------------
        // TEST GROUP 3: EIRF Verdict PDF Schema Alignment & QR
        // -------------------------------------------------------------------
        console.log('\n--- 3. EIRF Verdict PDF Schema Fidelity, Wrapping & QR Verification ---');

        await test('generateEirfVerdictPdfBuffer (Rejected + Approved) aligns live schemas, executive layout, proof URLs & Page 1 QR', async () => {
            const curDb = getJSONData();
            const subAnnulled = curDb.testSubmissions.find(s => s._id === subAnnulledId);
            const rejReport = curDb.eirfReports[0];
            const cand = curDb.candidates[0];
            const testDoc = curDb.tests[0];
            const subAnnulledBics = toBicsId(subAnnulledId);

            const rejPdf = await generateEirfVerdictPdfBuffer({
                report: rejReport,
                submission: subAnnulled,
                test: testDoc,
                candidate: cand,
                systemConfig: curDb.config,
                courseCode: testDoc.courseCode,
                courseName: testDoc.course,
                adminRemarks: rejReport.adminRemarks,
                resolutionCategory: rejReport.resolutionCategory,
                remediationAction: rejReport.remediationAction
            });

            assert.strictEqual(rejPdf.slice(0, 5).toString('ascii'), '%PDF-');
            const { allText: rejText, pageTexts: rejPages } = await extractPdfText(rejPdf);
            const rejRaw = rejPdf.toString('latin1');

            assert.ok(rejText.includes('91.8%'), 'Must read real biometricResult.similarityScore');
            assert.ok(rejText.includes('BLINK_BOTH_EYES'), 'Must read real biometricResult.challengeType');
            assert.strictEqual(rejText.includes('98.4%'), false, 'Must NOT hardcode 98.4%');
            assert.ok(rejText.includes('49.36.214.88'), 'Must read securityMetadata.ip fallback');
            assert.ok(rejText.includes('Google Chrome 131.0.6778'), 'Must read full unclipped browserDetails');
            assert.ok(rejText.includes('1 technical file(s) attached and cryptographically sealed'), 'Must detect report.uploadedProofUrl / eirfProofUrl');
            assert.ok(rejText.includes('failing to correlate telemetry with an approved system disruption or institutional proctor notice.'), 'Full narrative must wrap without 320-char clip');
            assert.ok(rejText.includes('No further appeals are permitted'), 'Rejected verdict must state final no-appeal clause');
            assert.ok(rejText.includes('acknowledge receipt of this disciplinary verdict'), 'Rejected physical slip must reflect disciplinary acknowledgement');
            assert.strictEqual(rejText.includes('institutional grade normalization'), false, 'Rejected slip must NOT mention grade normalization');
            assert.strictEqual(rejText.includes('Appeal Verdict'), false, 'Zero appeal references allowed');
            assert.ok(rejText.includes('Academic Year 2026-27'), 'Academic year 2026-27 present');
            assert.ok(rejText.includes('Semester I'), 'Semester I present');
            assert.ok(rejText.includes('Mid-Sem Test 2026'), 'Exam type resolved from config');
            assert.strictEqual(rejText.split(subAnnulledBics).length - 1, 1, 'Submission ID (BICSID) must appear strictly ONCE on EIRF PDF');
            assert.ok(rejPages[0].includes(subAnnulledBics), 'Submission ID (BICSID) must appear on Page 1 of EIRF PDF');
            assert.ok(rejRaw.includes('PlusJakartaSans'), 'Plus Jakarta Sans embedded in EIRF PDF');
            assert.ok(rejRaw.includes('Inter'), 'Inter embedded in EIRF PDF');
            assert.strictEqual(rejPages.length >= 2 && rejPages.length <= 3, true, `Expected 2-3 EIRF pages, got ${rejPages.length}`);
            // Verify KV segregation on EIRF Verdict PDF
            assert.ok(rejPages[0].indexOf('Reporting Timeliness:') < rejPages[0].indexOf('Course Code & Title:'), 'EIRF Section 1 double-KVs precede single-KVs');
            assert.ok(rejText.indexOf('Primary Trigger Cited:') < rejText.indexOf('Browser User-Agent:'), 'EIRF Section 3 double-KVs precede single-KVs');
            assert.ok(rejText.indexOf('Evidence Status:') < rejText.indexOf('Focus Loss Justification:'), 'EIRF Section 4 double-KVs precede single-KVs');
            assert.ok(rejText.indexOf('Submission Record:') < rejText.indexOf('Committee Remarks:'), 'EIRF Section 5 double-KVs precede single-KVs');
            for (let p = 1; p <= rejPages.length; p++) {
                const label = `Page ${p} of ${rejPages.length}`;
                assert.strictEqual(rejText.split(label).length - 1, 1, `Expected 1 footer "${label}"`);
                assert.ok(rejPages[p - 1].includes(label), `Page ${p} footer matches`);
            }

            const { pageCount, decodedQr } = await renderPdfPagesAndDecodeHeaderQr(rejPdf, 'eirf_rejected');
            assert.strictEqual(pageCount, rejPages.length, `Rendered pageCount must match ${rejPages.length}`);
            assert.ok(decodedQr && decodedQr.includes('BICS-EIRF|Report:EIRF-2026-P3REJ|Ref:903112233446|Status:REJECTED'), `Unexpected EIRF QR: ${decodedQr}`);

            // Approved check (also test End-Sem Exam 2026 & empty fallback -> Details not available)
            const appReport = { ...rejReport, reportId: 'EIRF-2026-P3APP', status: 'approved', uploadedProofUrl: '' };
            const appSub = { ...curDb.testSubmissions[0], eirfProofUrl: '' };
            const appPdf = await generateEirfVerdictPdfBuffer({
                report: appReport,
                submission: appSub,
                test: testDoc,
                candidate: cand,
                systemConfig: { examType: 'endsem' },
                courseCode: testDoc.courseCode,
                courseName: testDoc.course
            });
            const appText = (await extractPdfText(appPdf)).allText;
            assert.ok(appText.includes('No technical files uploaded'));
            assert.ok(appText.includes('institutional grade normalization'), 'Approved physical slip must reference grade normalization');
            assert.ok(appText.includes('End-Sem Exam 2026'), 'End-Sem Exam 2026 examType label rendered dynamically');

            const emptyEirfPdf = await generateEirfVerdictPdfBuffer({ report: {}, submission: {}, test: {}, candidate: {} });
            const emptyEirfText = (await extractPdfText(emptyEirfPdf)).allText;
            assert.ok(emptyEirfText.includes('Details not available'), 'Missing fields render "Details not available"');
            assert.strictEqual(emptyEirfText.includes('No details available'), false, 'Must NOT render "No details available"');
            assert.strictEqual(emptyEirfText.includes('R526CS01T'), false, 'Must NOT hardcode R526CS01T');
            assert.strictEqual(emptyEirfText.includes('Introduction to Computer Science'), false, 'Must NOT hardcode course title');
        });

        // -------------------------------------------------------------------
        // TEST GROUP 4: Admin Timetable (Mode + Report Time) & Hall Ticket PDF
        // -------------------------------------------------------------------
        console.log('\n--- 4. Admin Timetable Mode/ReportTime Config & Hall Ticket PDF E2E ---');

        await test('POST /api/admin/config & GET /api/config persist custom Mode and Report Time & normalize legacy rows', async () => {
            const payload = {
                examType: 'endsem',
                timetableNotice: 'Pillar 3 Official Examination Notice 2026',
                timetable: [
                    {
                        code: 'R526CS09T',
                        course: 'Advanced Algorithms & Web Systems (Comprehensive Long Course Name Check)',
                        date: '2026-11-20',
                        time: '10:00 AM to 01:00 PM',
                        mode: 'Online Mode (Proctored)',
                        reportTime: '09:15 AM',
                        marks: 100
                    },
                    {
                        code: 'R526CS02L',
                        course: 'Systems Programming Laboratory',
                        date: '2026-11-22',
                        time: '02:00 PM to 05:00 PM',
                        mode: 'Computer Lab',
                        reportTime: '01:15 PM',
                        marks: 50
                    },
                    {
                        code: 'R526CS10T',
                        course: 'Legacy Row Without Mode Or ReportTime',
                        date: '2026-11-24',
                        time: '03:15 PM to 04:45 PM',
                        marks: 100
                    }
                ]
            };

            const saveRes = await httpRequest('POST', '/api/admin/config', payload, {
                Authorization: `Bearer ${adminToken}`
            });
            assert.strictEqual(saveRes.status, 200);
            assert.strictEqual(saveRes.body.success, true);

            const getRes = await httpRequest('GET', '/api/config');
            assert.strictEqual(getRes.status, 200);
            assert.strictEqual(getRes.body.timetable.length, 3);
            assert.strictEqual(getRes.body.timetable[0].mode, 'Online Mode (Proctored)');
            assert.strictEqual(getRes.body.timetable[0].reportTime, '09:15 AM');
            assert.strictEqual(getRes.body.timetable[1].mode, 'Computer Lab');
            assert.strictEqual(getRes.body.timetable[1].reportTime, '01:15 PM');
            assert.strictEqual(getRes.body.timetable[2].mode, 'Online Proctored', 'Legacy theory slot normalized');
            assert.strictEqual(getRes.body.timetable[2].reportTime, '09:30 AM', 'Legacy theory slot reportTime normalized');
        });

        await test('Hall Ticket PDF renders custom timetable Mode/Report Time, handles empty feedback Map/Object & decodes QR', async () => {
            const ownerBicsId = toBicsId(candOwnerId);
            const ticketNo = '991122334455';
            const htRes = await httpRequest(
                'GET',
                `/api/candidate/generate-hallticket/${ownerBicsId}?type=mid&t=${ticketNo}`,
                null,
                { Authorization: `Bearer ${ownerToken}` }
            );
            assert.strictEqual(htRes.status, 200, 'Hall ticket endpoint must return 200');
            assert.strictEqual(htRes.rawBuffer.slice(0, 5).toString('ascii'), '%PDF-');
            assert.ok(
                String(htRes.headers['content-disposition'] || '').includes(`attachment; filename="BICS_HallTicket_midsem_STU-P3-001.pdf"`),
                `Hall ticket must download as attachment, got: ${htRes.headers['content-disposition']}`
            );

            const htRawStr = htRes.rawBuffer.toString('latin1');
            assert.ok(htRawStr.includes('Helvetica'), 'Hall ticket must use Helvetica fonts');
            assert.strictEqual(htRawStr.includes('PlusJakartaSans'), false, 'Hall ticket must NOT embed Plus Jakarta Sans');
            assert.strictEqual(htRawStr.includes('Inter-Regular'), false, 'Hall ticket must NOT embed Inter');

            const { allText: htText, numPages: htNumPages } = await extractPdfText(htRes.rawBuffer);
            assert.ok(htText.includes('CANDIDATE FULL NAME:'), 'Hall ticket preserves original candidate label format');
            assert.ok(htText.includes('STUDENT ID / ROLL NO:'), 'Hall ticket preserves student ID label format');
            assert.ok(htText.includes('Online Mode (Proctored)'), 'Must display custom admin Mode');
            assert.ok(htText.includes('09:15 AM'), 'Must display custom admin Report Time');
            assert.ok(htText.includes('01:15 PM'), 'Must display lab Report Time');
            assert.ok(htText.includes('Sahyadri Academic Hostel, Pune - 411004'), 'Wrapped address rendered');
            assert.ok(htText.includes('B.Sc. Computer Science (R526CS09T - Advanced Algorithms & Web Systems, R526CS02L)'), 'Enrolled courses rendered');
            assert.ok(htText.includes('[X] Institutional Coursework Feedback Submitted'), 'Populated feedback renders [X]');
            assert.strictEqual(htText.split(`Page 1 of ${htNumPages}`).length - 1, 1);

            const { pageCount, decodedQr } = await renderPdfPagesAndDecodeHeaderQr(htRes.rawBuffer, 'hallticket');
            assert.ok(pageCount >= 1 && pageCount <= 2, `Expected 1-2 Hall Ticket pages, got ${pageCount}`);
            assert.ok(decodedQr && decodedQr.includes(`https://bicsportal.netlify.app/verify/hallticket?tid=${ticketNo}&sid=STU-P3-001`), `Unexpected Hall Ticket QR: ${decodedQr}`);

            // Unit check: empty {} and empty Map feedback must NOT be [X], missing reportTime -> 'As Scheduled', endsem title
            const emptyFbPdf = await generateHallTicketPdfBuffer({
                candidate: {
                    studentId: 'STU-EMPTY-FB',
                    name: 'Empty Feedback Test',
                    midSemConsentSigned: true,
                    midSemFeedback: {},
                    endSemFeedback: new Map(),
                    midSemLedgerUrl: '/ledger.pdf',
                    midSemEmailVerified: false
                },
                examType: 'mid',
                ticketNumber: '777777777777',
                scheduleList: [
                    { code: 'PYTHON-101', course: 'Python Foundations', date: '2026-11-30', time: '10:00 AM - 12:00 PM' }
                ]
            });
            const emptyFbText = (await extractPdfText(emptyFbPdf)).allText;
            assert.ok(emptyFbText.includes('[ ] Institutional Coursework Feedback Submitted'), 'Empty {} feedback must render [ ], NOT [X]');
            assert.ok(emptyFbText.includes('As Scheduled'), 'Missing reportTime must render "As Scheduled", NOT fake "02:45 PM"');
            assert.strictEqual(emptyFbText.includes('02:45 PM'), false, 'Fake 02:45 PM must not appear when absent');
            assert.ok(emptyFbText.includes('Online Proctored'), 'PYTHON-101 (contains P inside word, does not end in P) must default to Online Proctored, NOT Computer Lab');

            const endMapPdf = await generateHallTicketPdfBuffer({
                candidate: {
                    studentId: 'STU-END-MAP',
                    name: 'Endsem Map Test',
                    endSemConsentSigned: true,
                    endSemFeedback: new Map(),
                    endSemLedgerUrl: '/ledger.pdf',
                    endSemEmailVerified: true
                },
                examType: 'end',
                ticketNumber: '888888888888',
                scheduleList: []
            });
            const endMapText = (await extractPdfText(endMapPdf)).allText;
            assert.ok(endMapText.includes('END-SEMESTER EXAMINATION 2026'), 'End-semester header rendered');
            assert.ok(endMapText.includes('[ ] Institutional Coursework Feedback Submitted'), 'Empty Map() feedback must render [ ], NOT [X]');
        });
    } finally {
        global.fetch = origFetch;
        stopSubmissionReaper();
        stopEirfPipelineWorker();
        if (server) {
            await new Promise(resolve => server.close(resolve));
        }
        if (dbBackup !== null) {
            fs.writeFileSync(DB_FILE, dbBackup, 'utf8');
        }
        // Clean up test-generated OTRF local fallback files
        ['903112233445', '903112233446'].forEach(ref => {
            const p = path.join(__dirname, '..', 'public', 'otrf', `otrf_${ref}.pdf`);
            if (fs.existsSync(p)) {
                try { fs.unlinkSync(p); } catch (_) {}
            }
        });
    }

    console.log('\n=======================================================================');
    console.log(`PILLAR 3 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('=======================================================================\n');

    if (failed > 0) process.exit(1);
    process.exit(0);
}

runPillar3Suite().catch(err => {
    console.error('FATAL PILLAR 3 HARNESS ERROR:', err);
    if (dbBackup !== null) fs.writeFileSync(DB_FILE, dbBackup, 'utf8');
    process.exit(1);
});
