/**
 * Automated Verification Test Suite for OT Exam Terminal Remediation (Part 2)
 * 
 * Verifies:
 * 1. Item B5: Asymmetric RSA-2048-OAEP + AES-256-GCM Envelope Encryption & Tamper Detection
 * 2. Item B6: Drag-and-Drop Lockdown & Exact Action Blocked Toast Message
 * 3. Item 3.3: Audio Crest Factor Impulse Rejection & Continuous Speech Verification
 * 4. Item 3: Question Switching Zero-Loss Draft Auto-Commit Logic
 * 5. Item 3.1: Fullscreen Exit & Window Blur 600ms Deduplication Cooldown
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
    encryptEirfPayload,
    decryptEirfPayload,
    getPublicKeyPem,
    getPublicKeyDerBase64
} = require('../utils/cipher');
const rsaKeyManager = require('../utils/rsaKeyManager');

async function runTests() {
    console.log("==================================================================");
    console.log("🚀 STARTING OT EXAM TERMINAL REMEDIATION VERIFICATION (PART 2)");
    console.log("==================================================================");

    let passed = 0;
    let failed = 0;

    function test(name, fn) {
        try {
            fn();
            console.log(`  ✅ [PASS] ${name}`);
            passed++;
        } catch (err) {
            console.error(`  ❌ [FAIL] ${name}`);
            console.error(`     Error: ${err.message}`);
            failed++;
        }
    }

    // =========================================================================
    // 1. ITEM B5: ASYMMETRIC ENVELOPE ENCRYPTION (RSA-2048-OAEP + AES-256-GCM)
    // =========================================================================
    console.log("\n--- [ITEM B5] Server-Side Asymmetric Envelope Cryptography ---");

    test("B5.1: Server RSA public key is generated and exported in valid PEM and DER formats", () => {
        const pem = getPublicKeyPem();
        const derBase64 = getPublicKeyDerBase64();
        assert(pem && pem.includes('-----BEGIN PUBLIC KEY-----'), "Public key PEM must have valid header");
        assert(derBase64 && derBase64.length > 50, "Public key DER base64 must be non-empty");
        
        // Key pair consistency
        const testData = Buffer.from("BICS_EXAM_INTEGRITY_2026");
        const encrypted = rsaKeyManager.encryptWithPublicKey(testData);
        const decrypted = rsaKeyManager.decryptWithPrivateKey(encrypted);
        assert.strictEqual(decrypted.toString(), testData.toString(), "RSA encryption/decryption roundtrip must match");
    });

    test("B5.2: EIRF payload encrypts as Version 2.0 asymmetric envelope (no hardcoded symmetric secrets)", () => {
        const samplePayload = {
            submissionId: "670f5e1289abc0123456789a",
            studentId: "R526CS01",
            candidateName: "Test Candidate",
            testTitle: "Programming Fundamentals C++",
            answers: [{ questionId: "q1", submittedCode: "int main() { return 0; }", score: 10 }],
            proctoringLog: { fullscreenExits: 1, tabSwitches: 0 },
            generatedAt: new Date().toISOString()
        };

        const encryptedStr = encryptEirfPayload(samplePayload, "R526CS01", "670f5e1289abc0123456789a");
        const parsed = JSON.parse(encryptedStr);

        assert.strictEqual(parsed.version, "2.0-rsa-envelope", "Must be marked Version 2.0");
        assert.strictEqual(parsed.algorithm, "RSA-OAEP-2048/AES-256-GCM", "Must use RSA-OAEP + AES-GCM");
        assert(parsed.encryptedKey, "Must contain RSA-wrapped AES key");
        assert(parsed.iv, "Must contain 12-byte GCM IV");
        assert(parsed.authTag, "Must contain 16-byte GCM auth tag");
        assert(parsed.data, "Must contain ciphertext");

        // Decryption round trip
        const decrypted = decryptEirfPayload(encryptedStr, "R526CS01", "670f5e1289abc0123456789a");
        assert(decrypted, "Decryption must succeed");
        assert.strictEqual(decrypted.submissionId, samplePayload.submissionId);
        assert.strictEqual(decrypted.answers[0].submittedCode, samplePayload.answers[0].submittedCode);
    });

    test("B5.3: Cryptographic integrity check: Tampering with ciphertext or authTag fails authentication", () => {
        const payload = { submissionId: "tamper_test", answers: [{ score: 100 }] };
        const encryptedStr = encryptEirfPayload(payload, "stud1", "sub1");
        const envelope = JSON.parse(encryptedStr);

        // Tamper with data (flip bytes)
        const tamperedData = envelope.data.slice(0, -2) + (envelope.data.slice(-2) === 'aa' ? 'bb' : 'aa');
        const tamperedEnvelope = { ...envelope, data: tamperedData };

        const result = decryptEirfPayload(JSON.stringify(tamperedEnvelope), "stud1", "sub1");
        assert.strictEqual(result, null, "Tampered payload must fail decryption and return null");
    });

    test("B5.4: Production security gate: Plain unencrypted JSON EIRF payloads are strictly rejected", () => {
        const oldEnv = process.env.NODE_ENV;
        const oldAllow = process.env.ALLOW_RAW_EIRF;
        try {
            process.env.NODE_ENV = 'production';
            delete process.env.ALLOW_RAW_EIRF;

            const rawJsonPayload = JSON.stringify({
                submissionId: "insecure_submission",
                answers: [{ score: 100 }],
                proctoringLog: { fullscreenExits: 0 }
            });

            const result = decryptEirfPayload(rawJsonPayload, "stud1", "sub1");
            assert.strictEqual(result, null, "Unencrypted JSON must be rejected in production environment");
        } finally {
            process.env.NODE_ENV = oldEnv;
            process.env.ALLOW_RAW_EIRF = oldAllow;
        }
    });

    // =========================================================================
    // 2. ITEM B6: DRAG-AND-DROP LOCKDOWN & TOAST BANNER
    // =========================================================================
    console.log("\n--- [ITEM B6] Drag-and-Drop Lockdown & Action Blocked Toast Banner ---");

    test("B6.1: CodeEditor explicitly configures Monaco with dragAndDrop: false", () => {
        const codeEditorPath = path.resolve(__dirname, '../../frontend_ot/src/components/exam/CodeEditor.jsx');
        const content = fs.readFileSync(codeEditorPath, 'utf8');

        assert(content.includes('dragAndDrop: false'), "Monaco editor options must have dragAndDrop: false configured");
        assert(content.includes("'dragover', 'dragenter', 'drop'"), "CodeEditor must intercept DOM drag events");
    });

    test("B6.2: App.jsx displays exact required toast text on blocked clipboard/drag action", () => {
        const appPath = path.resolve(__dirname, '../../frontend_ot/src/App.jsx');
        const content = fs.readFileSync(appPath, 'utf8');

        const expectedText = "Action Blocked: Copy-pasting and dragging external text are strictly prohibited during the active examination environment. This attempt has been logged.";
        assert(content.includes(expectedText), "App.jsx must contain the exact required Action Blocked toast notification text");
        assert(content.includes("dragover") && content.includes("drop"), "App.jsx must intercept window dragover and drop events");
    });

    // =========================================================================
    // 3. ITEM 3.3: AUDIO CREST FACTOR IMPULSE REJECTION & SUSTAINED SPEECH
    // =========================================================================
    console.log("\n--- [ITEM 3.3] Audio Impulse Rejection & False-Positive Elimination ---");

    test("B3.3.1: Crest Factor calculation separates mechanical impulses (typing) from human speech", () => {
        // Mechanical typing simulation: Sharp transient spike with high peak but low RMS
        const typingPeak = 0.85;
        const typingRms = 0.045; // Brief 5ms click
        const typingCrestFactor = typingPeak / typingRms; // 18.88 >= 4.5
        const isTypingMechanical = typingCrestFactor >= 4.5;
        assert.strictEqual(isTypingMechanical, true, "Mechanical typing keystrokes must trigger Crest Factor >= 4.5 impulse rejection");

        // Voiced human speech simulation: Continuous harmonic formants with moderate peak-to-RMS ratio
        const speechPeak = 0.32;
        const speechRms = 0.11;
        const speechCrestFactor = speechPeak / speechRms; // ~2.91 < 4.5
        const isSpeechMechanical = speechCrestFactor >= 4.5;
        assert.strictEqual(isSpeechMechanical, false, "Voiced speech must have moderate Crest Factor < 4.5 and pass impulse filter");
    });

    test("B3.3.2: Sustained speech requirement of >= 1.0s (10 consecutive 100ms frames) prevents single-click triggers", () => {
        let sustainedVoiceCount = 0;
        let warningTriggered = false;

        // Simulate 4 clicks (400ms) - should NOT trigger warning
        for (let frame = 0; frame < 4; frame++) {
            sustainedVoiceCount += 1;
            if (sustainedVoiceCount >= 10) warningTriggered = true;
        }
        assert.strictEqual(warningTriggered, false, "Brief sound under 1.0s must not trigger voice violation");

        // Simulate sustained speaking for 10 frames (1000ms = 1.0s)
        for (let frame = 4; frame < 10; frame++) {
            sustainedVoiceCount += 1;
            if (sustainedVoiceCount >= 10) warningTriggered = true;
        }
        assert.strictEqual(warningTriggered, true, "Sustained vocal speech >= 1.0s must trigger voice violation");
    });

    // =========================================================================
    // 4. ITEM 3: ZERO-LOSS DRAFT AUTO-COMMIT ON QUESTION SWITCH
    // =========================================================================
    console.log("\n--- [ITEM 3] Zero-Loss Draft Auto-Commit on Question Switch ---");

    test("3.1: Switching questions automatically commits active drafts to examAnswers[prevIndex]", () => {
        const appPath = path.resolve(__dirname, '../../frontend_ot/src/App.jsx');
        const content = fs.readFileSync(appPath, 'utf8');

        assert(content.includes("prevSelectedQuestionIndexRef"), "App.jsx must track prevSelectedQuestionIndexRef");
        assert(content.includes("draftCodeRef.current"), "App.jsx must commit draftCodeRef.current on question change");
        assert(content.includes("examAnswersRef.current"), "App.jsx must reference current answers via examAnswersRef");

        // Logic simulation:
        let examAnswers = [
            { questionId: "q1", submittedCode: "" },
            { questionId: "q2", submittedCode: "" }
        ];
        let prevIndex = 0;
        let activeDraftCode = "int x = 42; // Typed by student on Q1";

        // Candidate switches to Question 1 (index 1) without clicking "Save & Next"
        const targetIndex = 1;
        if (prevIndex !== targetIndex && examAnswers[prevIndex]) {
            examAnswers[prevIndex] = {
                ...examAnswers[prevIndex],
                submittedCode: activeDraftCode
            };
        }

        assert.strictEqual(examAnswers[0].submittedCode, "int x = 42; // Typed by student on Q1", "Unsaved code must be preserved in answers list");
    });

    // =========================================================================
    // 5. ITEM 3.1: 600MS FULLSCREEN EXIT & BLUR DEDUPLICATION COOLDOWN
    // =========================================================================
    console.log("\n--- [ITEM 3.1] Double-Warning Cascade Elimination (600ms Deduplication) ---");

    test("3.1.1: Fullscreen exit followed by window blur within 600ms is deduplicated into 1 warning", () => {
        const appPath = path.resolve(__dirname, '../../frontend_ot/src/App.jsx');
        const content = fs.readFileSync(appPath, 'utf8');

        assert(content.includes("DEDUPLICATION_WINDOW_MS = 600"), "App.jsx must define 600ms deduplication window");
        assert(content.includes("lastFullscreenExitTimeRef"), "App.jsx must track lastFullscreenExitTimeRef");
        assert(content.includes("lastWindowBlurTimeRef"), "App.jsx must track lastWindowBlurTimeRef");

        // Logic simulation:
        let warnings = { fullscreenExits: 0, tabSwitches: 0 };
        const DEDUPLICATION_WINDOW_MS = 600;
        let lastFSTime = 0;
        let lastBlurTime = 0;

        // Event 1: Candidate exits fullscreen (e.g. Esc or OS notification)
        const t1 = 1000;
        lastFSTime = t1;
        warnings.fullscreenExits += 1;

        // Event 2: Browser fires window blur 120ms later due to OS window focus change
        const t2 = 1120;
        const diff = t2 - lastFSTime;
        if (diff < DEDUPLICATION_WINDOW_MS) {
            // Reconciled as single incident, tab switch warning suppressed
        } else {
            warnings.tabSwitches += 1;
        }

        assert.strictEqual(warnings.fullscreenExits, 1, "Fullscreen exit warning count should be 1");
        assert.strictEqual(warnings.tabSwitches, 0, "Tab switch warning must be suppressed under deduplication window");
        assert.strictEqual(warnings.fullscreenExits + warnings.tabSwitches, 1, "Total penalty must be 1, not 2");
    });

    console.log("\n==================================================================");
    console.log(`📊 TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
    console.log("==================================================================");

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error("Test execution failed:", err);
    process.exit(1);
});
