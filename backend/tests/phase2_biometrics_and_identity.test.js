/**
 * Phase 2 Biometric Identity Verification, Active Liveness & Cosine Face Match Test Suite
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { compareFaceBiometrics, isPlaceholderPhoto, SIMILARITY_THRESHOLDS } = require('../utils/biometricMatcher');

async function runPhase2BiometricSuite() {
    console.log("==================================================================");
    console.log("🧬 STARTING PHASE 2 BIOMETRIC IDENTITY & LIVENESS TEST SUITE");
    console.log("==================================================================");

    const testsRoutePath = path.join(__dirname, '../routes/tests.js');
    const biometricViewPath = path.join(__dirname, '../../frontend_ot/src/views/BiometricCheckView.jsx');
    const appOtPath = path.join(__dirname, '../../frontend_ot/src/App.jsx');
    const candidateModelPath = path.join(__dirname, '../models/Candidate.js');
    const submissionModelPath = path.join(__dirname, '../models/TestSubmission.js');

    const testsSource = fs.readFileSync(testsRoutePath, 'utf8');
    const biometricViewSource = fs.readFileSync(biometricViewPath, 'utf8');
    const appOtSource = fs.readFileSync(appOtPath, 'utf8');
    const candidateModelSource = fs.readFileSync(candidateModelPath, 'utf8');
    const submissionModelSource = fs.readFileSync(submissionModelPath, 'utf8');

    // ------------------------------------------------------------------
    // TEST 1: Schema Updates for Trusted Reference Photo & Biometric Results
    // ------------------------------------------------------------------
    console.log("\n[TEST 1] Schema Verification for Reference Photo & Biometric Evidence:");
    assert(candidateModelSource.includes("referencePhotoUrl: { type: String, default: '' }"), "Candidate model must include referencePhotoUrl");
    assert(submissionModelSource.includes("biometricResult:"), "TestSubmission model must include biometricResult structure");
    assert(submissionModelSource.includes("similarityScore:"), "biometricResult must store similarityScore");
    assert(submissionModelSource.includes("decision:"), "biometricResult must store decision band");
    console.log("  ✅ Candidate and TestSubmission schemas verified for biometric evidence retention.");

    // ------------------------------------------------------------------
    // TEST 2: Active Challenge Generation Endpoint
    // ------------------------------------------------------------------
    console.log("\n[TEST 2] Server-Issued Liveness Challenge Endpoint:");
    assert(testsSource.includes("router.get('/biometrics/challenge'"), "Must expose GET /api/tests/biometrics/challenge");
    assert(testsSource.includes("TURN_LEFT") && testsSource.includes("TURN_RIGHT"), "Challenge must support active head poses");
    assert(testsSource.includes("const challengeId = `chal_"), "Must generate unique challenge ID");
    assert(testsSource.includes("expiresAt = Date.now() + (2 * 60 * 1000)"), "Challenge must have 2-minute expiration");
    console.log("  ✅ Server-issued active challenge endpoint verified.");

    // ------------------------------------------------------------------
    // TEST 3: Biometric Matcher Mathematical Integrity & Review Bands
    // ------------------------------------------------------------------
    console.log("\n[TEST 3] Biometric Matcher Engine & 3-Tier Decision Bands:");
    
    // 3a. Placeholder / Unenrolled photo fallback
    const unenrolledResult = await compareFaceBiometrics('data:image/jpeg;base64,12345', '/public/uploads/default-photo.png');
    assert.strictEqual(unenrolledResult.decision, 'unregistered-reference', "Placeholder photo must yield unregistered-reference");
    assert.strictEqual(unenrolledResult.reviewNeeded, true, "Must flag for physical proctor review");
    console.log("  ✅ Fallback verified: Missing/placeholder photo conditionally passes with proctor flag (no student lockout).");

    // 3b. Self-match exact identical comparison
    const logoPath = path.resolve(__dirname, '../../frontend/public/bics_logo.png');
    if (fs.existsSync(logoPath)) {
        const selfMatch = await compareFaceBiometrics(logoPath, logoPath);
        assert(selfMatch.similarityScore >= SIMILARITY_THRESHOLDS.HIGH_AUTO_PASS, "Identical image must exceed auto-pass threshold");
        assert.strictEqual(selfMatch.decision, 'auto-pass', "Identical image must yield auto-pass");
        assert.strictEqual(selfMatch.reviewNeeded, false, "Auto-pass must not require review");
        console.log(`  ✅ Self-match verified: Score = ${selfMatch.similarityScore} (Decision: ${selfMatch.decision}).`);
    }

    // 3c. Distinct cross-match comparison
    const kataLogoPath = path.resolve(__dirname, '../../frontend/public/kata_logo.png');
    if (fs.existsSync(logoPath) && fs.existsSync(kataLogoPath)) {
        const crossMatch = await compareFaceBiometrics(logoPath, kataLogoPath);
        assert(crossMatch.similarityScore < SIMILARITY_THRESHOLDS.HIGH_AUTO_PASS, "Distinct images must score below auto-pass threshold");
        assert.strictEqual(crossMatch.reviewNeeded, true, "Low/moderate similarity must flag for review");
        console.log(`  ✅ Cross-match distinction verified: Score = ${crossMatch.similarityScore} (Decision: ${crossMatch.decision}).`);
    }

    // ------------------------------------------------------------------
    // TEST 4: Backend POST /api/tests/biometrics/verify Endpoint
    // ------------------------------------------------------------------
    console.log("\n[TEST 4] Server-Side Verification Endpoint & HMAC Biometric Token:");
    assert(testsSource.includes("router.post('/biometrics/verify'"), "Must expose POST /api/tests/biometrics/verify");
    assert(testsSource.includes("compareFaceBiometrics(liveFrame, referencePhotoUrl)"), "Must compare live frame against enrolled reference photo");
    assert(testsSource.includes("biometricToken = `${payload}:${signature}`"), "Must issue cryptographically signed biometric token");
    assert(testsSource.includes("BIOMETRIC_VERIFIED"), "Must audit log biometric evaluations");
    console.log("  ✅ Server biometric verification endpoint verified with cryptographic token issuance.");

    // ------------------------------------------------------------------
    // TEST 5: POST /start/:id Persists Biometric Result
    // ------------------------------------------------------------------
    console.log("\n[TEST 5] Exam Start Gate Biometric Result Binding:");
    assert(testsSource.includes("const incBiometrics = req.body.biometricResult || {}"), "Must read biometricResult from start request body");
    assert(testsSource.includes("biometricResult: submissionBiometrics"), "Must persist biometricResult to submission record");
    assert(appOtSource.includes("biometricResult: biometricsCache?.biometricResult || null"), "Frontend must send biometricResult to /start/:id");
    console.log("  ✅ Exam start gate binds and retains verified biometric result on submission.");

    // ------------------------------------------------------------------
    // TEST 6: Frontend Active Liveness Tracking & Server Challenge Integration
    // ------------------------------------------------------------------
    console.log("\n[TEST 6] Frontend BiometricCheckView Active Challenge & Verification UI:");
    assert(biometricViewSource.includes("fetch(`${API_BASE}/tests/biometrics/challenge`"), "Frontend must fetch active server challenge");
    assert(biometricViewSource.includes("deltaYaw < -0.025") || biometricViewSource.includes("yawRatio < -0.075"), "Frontend must track active head turn pose from landmarks with tuned sensitivity");
    assert(biometricViewSource.includes("fetch(`${API_BASE}/tests/biometrics/verify`"), "Frontend must post live capture to /tests/biometrics/verify");
    assert(biometricViewSource.includes("biometricMatchResult.decision === 'auto-pass'"), "Frontend must render high-confidence auto-pass outcome");
    assert(biometricViewSource.includes("biometricRetryCount >= 2"), "Frontend must prevent student deadlocks by falling back to proctor review after retries");
    console.log("  ✅ Frontend BiometricCheckView verified with active pose tracking and 3-tier outcome UI.");

    console.log("\n==================================================================");
    console.log("🎉 ALL PHASE 2 BIOMETRIC VERIFICATION & IDENTITY TESTS PASSED");
    console.log("==================================================================");
}

runPhase2BiometricSuite().catch(err => {
    console.error("❌ PHASE 2 TEST FAILED:", err);
    process.exit(1);
});
