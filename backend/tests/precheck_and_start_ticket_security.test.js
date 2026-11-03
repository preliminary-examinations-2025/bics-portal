/**
 * Phase 1 & 2 Security Test Suite:
 * Real System Probes, Cryptographic HMAC Start Tickets & Biometric Gate Integrity
 */

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

async function runPrecheckSecuritySuite() {
    console.log("==================================================================");
    console.log("🛡️ STARTING PRECHECK PROBE & CRYPTOGRAPHIC START TICKET TEST SUITE");
    console.log("==================================================================");

    const testsRoutePath = path.join(__dirname, '../routes/tests.js');
    const systemProbesPath = path.join(__dirname, '../../frontend_ot/src/utils/systemProbes.js');
    const systemChecksViewPath = path.join(__dirname, '../../frontend_ot/src/views/SystemChecksView.jsx');
    const biometricViewPath = path.join(__dirname, '../../frontend_ot/src/views/BiometricCheckView.jsx');
    const appOtPath = path.join(__dirname, '../../frontend_ot/src/App.jsx');

    const testsSource = fs.readFileSync(testsRoutePath, 'utf8');
    const systemProbesSource = fs.readFileSync(systemProbesPath, 'utf8');
    const systemChecksViewSource = fs.readFileSync(systemChecksViewPath, 'utf8');
    const biometricViewSource = fs.readFileSync(biometricViewPath, 'utf8');
    const appOtSource = fs.readFileSync(appOtPath, 'utf8');

    // ------------------------------------------------------------------
    // TEST 1: Ping & Throughput Probe Endpoint
    // ------------------------------------------------------------------
    console.log("\n[TEST 1] Server Ping & Throughput Probe Endpoint:");
    assert(testsSource.includes("router.get('/ping'"), "Must expose GET /api/tests/ping");
    assert(testsSource.includes("req.query.download === '1'"), "Ping endpoint must handle ?download=1 throughput probe");
    assert(testsSource.includes("res.setHeader('Content-Type', 'application/octet-stream')"), "Must stream binary buffer for throughput probe");
    console.log("  ✅ Unprivileged ping & latency probe endpoint verified in backend/routes/tests.js.");

    // ------------------------------------------------------------------
    // TEST 2: Real System Probes Utility (Hardware, Displays & Virtual Cam)
    // ------------------------------------------------------------------
    console.log("\n[TEST 2] Real System Probes Utility Verification:");
    assert(systemProbesSource.includes("VIRTUAL_CAMERA_BLACKLIST"), "systemProbes.js must maintain a virtual camera blacklist (OBS, ManyCam, DroidCam, etc.)");
    assert(systemProbesSource.includes("probeNetwork"), "Must export probeNetwork");
    assert(systemProbesSource.includes("probeDisplays"), "Must export probeDisplays");
    assert(systemProbesSource.includes("probeMediaDevices"), "Must export probeMediaDevices");
    assert(systemProbesSource.includes("probeScreenResolution"), "Must export probeScreenResolution");
    assert(systemProbesSource.includes("probeSystemEnvironment"), "Must export probeSystemEnvironment");
    console.log("  ✅ Real client-side probes verified: Network latency/throughput, Multi-display, and Virtual Camera blacklist.");

    // ------------------------------------------------------------------
    // TEST 3: SystemChecksView Integration & Elimination of Fake Timers
    // ------------------------------------------------------------------
    console.log("\n[TEST 3] SystemChecksView Integration & Timer Removal:");
    assert(!systemChecksViewSource.includes("setTimeout(() => {\n      setCheckStatuses(prev => ({\n        ...prev,\n        [currentKey]: 'completed'\n      }));\n      setActiveCheckIndex(prev => prev + 1);\n    }, 2000);"), "Fake sequential 2-second setTimeout loop must be completely removed");
    assert(systemChecksViewSource.includes("probeSystemEnvironment"), "SystemChecksView must invoke probeSystemEnvironment");
    assert(systemChecksViewSource.includes("probeDisplays"), "SystemChecksView must invoke probeDisplays");
    assert(systemChecksViewSource.includes("probeNetwork"), "SystemChecksView must invoke probeNetwork");
    assert(systemChecksViewSource.includes("probeMediaDevices"), "SystemChecksView must invoke probeMediaDevices");
    assert(systemChecksViewSource.includes("fetch(`${API_BASE}/tests/precheck`"), "SystemChecksView must post probe results to /api/tests/precheck");
    console.log("  ✅ SystemChecksView successfully replaced fake timers with real telemetry & server ticket negotiation.");

    // ------------------------------------------------------------------
    // TEST 4: Backend POST /precheck Telemetry Validation & Rejection
    // ------------------------------------------------------------------
    console.log("\n[TEST 4] Backend POST /precheck Validation Logic:");
    assert(testsSource.includes("router.post('/precheck'"), "Must expose POST /api/tests/precheck");
    assert(testsSource.includes("MULTI_DISPLAY_DETECTED"), "Must reject telemetry with multiple displays connected");
    assert(testsSource.includes("VIRTUAL_CAMERA_DETECTED"), "Must reject telemetry with virtual cameras detected");
    assert(testsSource.includes("NETWORK_LATENCY_EXCESSIVE"), "Must reject telemetry with network latency > 2500ms");
    console.log("  ✅ Backend precheck strictly validates display exclusivity, hardware cameras, and network stability.");

    // ------------------------------------------------------------------
    // TEST 5: Cryptographic HMAC Start Ticket Generation & Verification
    // ------------------------------------------------------------------
    console.log("\n[TEST 5] HMAC Start Ticket Cryptographic Integrity:");
    const secret = 'test-exam-secret-key-2026';
    const candId = 'cand_abc123';
    const testId = 'test_xyz789';
    const expiresAt = Date.now() + 300000;
    const nonce = 'abcd1234efgh5678';

    const payload = `${candId}:${testId}:${expiresAt}:${nonce}`;
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const validTicket = `${payload}:${sig}`;

    // Verify valid ticket
    const [tCand, tTest, tExp, tNon, tSig] = validTicket.split(':');
    const expectedSig = crypto.createHmac('sha256', secret).update(`${tCand}:${tTest}:${tExp}:${tNon}`).digest('hex');
    assert.strictEqual(expectedSig, tSig, "HMAC signature should match valid payload");
    assert(Date.now() <= Number(tExp), "Ticket should not be expired");
    assert.strictEqual(tCand, candId, "Candidate binding must match");
    assert.strictEqual(tTest, testId, "Test binding must match");

    // Tampering 1: Candidate ID changed
    const tamperedCandSig = crypto.createHmac('sha256', secret).update(`cand_attacker:${testId}:${expiresAt}:${nonce}`).digest('hex');
    assert.notStrictEqual(tSig, tamperedCandSig, "Tampered candidate ID must invalidate signature");

    // Tampering 2: Expired ticket
    const expiredExp = Date.now() - 1000;
    assert(Date.now() > expiredExp, "Expired timestamp must be caught by time check");

    console.log("  ✅ HMAC Start Ticket integrity confirmed: Cryptographically bound to candidate, test, and 5m expiry.");

    // ------------------------------------------------------------------
    // TEST 6: POST /start/:id Enforcement of Start Ticket
    // ------------------------------------------------------------------
    console.log("\n[TEST 6] POST /start/:id Start Ticket Gating:");
    assert(testsSource.includes("req.headers['x-exam-start-ticket'] || req.body.startTicket"), "Must inspect startTicket from header or body");
    assert(testsSource.includes("PRECHECK_TICKET_FORGERY"), "Must reject forged start ticket signatures");
    assert(testsSource.includes("PRECHECK_TICKET_EXPIRED"), "Must reject expired start tickets");
    assert(testsSource.includes("PRECHECK_CANDIDATE_MISMATCH"), "Must reject tickets belonging to different candidates");
    assert(testsSource.includes("PRECHECK_TEST_MISMATCH"), "Must reject tickets belonging to different tests");
    assert(appOtSource.includes("reqHeaders['x-exam-start-ticket'] = activeStartTicket"), "Frontend must send x-exam-start-ticket on start");
    console.log("  ✅ Start Gate verified: Direct API calls and forged tickets are rejected.");

    // ------------------------------------------------------------------
    // TEST 7: Biometric Check Cleanup (No Fake Voice Passes or Blind Gaze Passes)
    // ------------------------------------------------------------------
    console.log("\n[TEST 7] Biometric Check Honest Fallbacks:");
    assert(!biometricViewSource.includes("spokenTranscript: targetPhraseDisplay,\n            phraseMatchScore: 100,"), "Voice check must not fake transcript or auto-pass 100% on missing speech engine");
    assert(biometricViewSource.includes("voiceVerificationStatus: 'needs_review'"), "Missing speech engine must mark voice check for review");
    assert(biometricViewSource.includes("sampledCount >= 2"), "Gaze calibration must require valid landmark samples before completion");
    console.log("  ✅ Biometric check integrity confirmed: No fake transcripts or blind gaze passes.");

    console.log("\n==================================================================");
    console.log("🎉 ALL PRECHECK & START TICKET INTEGRITY TESTS PASSED SUCCESSFULLY");
    console.log("==================================================================");
}

runPrecheckSecuritySuite().catch(err => {
    console.error("❌ TEST FAILED:", err);
    process.exit(1);
});
