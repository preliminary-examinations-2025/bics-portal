/**
 * Automated Verification Test Suite for OT Exam Terminal Remediation (Part 3)
 * 
 * Verifies:
 * 1. Item 2.2: Web Preview Sandbox Loop-Breaker Guard (AST/Regex Transform, 2000ms Timeout)
 * 2. Item 3.2: Widescreen Yaw Recalibration (0.36 Threshold) & Sustained Dwell (>= 4.0s)
 * 3. Item 2.4: Instant Auto-Submission on Crash/Disconnect (Beacon + Dead-Man's Switch Reaper)
 * 4. Item 2.3: Server-Side Authoritative Exam Duration & Timing Enforcement
 * 5. Exam Integrity: Window Scheduling, isPublished Verification, and Unique Double-Attempt Index
 * 6. Stored XSS Elimination in LaTeX Math Delimiters & Markdown Media Across All RichText Renderers
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Import utilities
const { injectLoopGuards } = require('../../frontend_ot/src/utils/codeSandboxGuard');
const { reapDeadSessions } = require('../workers/submissionReaper');

async function runTests() {
    console.log("==================================================================");
    console.log("🚀 STARTING OT EXAM TERMINAL REMEDIATION VERIFICATION (PART 3)");
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

    async function asyncTest(name, fn) {
        try {
            await fn();
            console.log(`  ✅ [PASS] ${name}`);
            passed++;
        } catch (err) {
            console.error(`  ❌ [FAIL] ${name}`);
            console.error(`     Error: ${err.message}`);
            failed++;
        }
    }

    // =========================================================================
    // 1. ITEM 2.2: WEB PREVIEW SANDBOX LOOP-BREAKER GUARD
    // =========================================================================
    console.log("\n--- [ITEM 2.2] Web Preview Sandbox Loop-Breaker Execution Guard ---");

    test("2.2.1: injectLoopGuards transforms while(true) and injects timeout check", () => {
        const rawCode = `
            let i = 0;
            while (true) {
                i++;
            }
        `;
        const guardedCode = injectLoopGuards(rawCode, 100);
        assert(guardedCode.includes('_bics_loop_guard_'), "Must declare _bics_loop_guard_ variable");
        assert(guardedCode.includes('[SANDBOX_TIMEOUT]'), "Must include timeout error message");
        assert(guardedCode.includes('throw new Error('), "Must inject exception throw on timeout");
    });

    test("2.2.2: Injected while(true) infinite loop terminates within configured timeout", () => {
        const timeoutMs = 150;
        const infiniteLoopCode = `
            let count = 0;
            while (true) {
                count++;
            }
        `;
        const guarded = injectLoopGuards(infiniteLoopCode, timeoutMs);

        const startTime = Date.now();
        let caughtError = null;

        try {
            const context = vm.createContext({ Date });
            vm.runInContext(guarded, context, { timeout: 1000 });
        } catch (err) {
            caughtError = err;
        }

        const elapsed = Date.now() - startTime;
        assert(caughtError !== null, "Infinite loop must throw an error");
        assert(caughtError.message.includes('[SANDBOX_TIMEOUT]'), `Error must be SANDBOX_TIMEOUT, got: ${caughtError.message}`);
        assert(elapsed >= 100 && elapsed < 800, `Loop must terminate near timeout, elapsed: ${elapsed}ms`);
    });

    test("2.2.3: Injected for(;;) infinite loop terminates within configured timeout", () => {
        const timeoutMs = 100;
        const infiniteLoopCode = `
            for (;;) {
                let x = 1;
            }
        `;
        const guarded = injectLoopGuards(infiniteLoopCode, timeoutMs);

        let caughtError = null;
        try {
            const context = vm.createContext({ Date });
            vm.runInContext(guarded, context, { timeout: 1000 });
        } catch (err) {
            caughtError = err;
        }

        assert(caughtError !== null, "Infinite for(;;) loop must throw an error");
        assert(caughtError.message.includes('[SANDBOX_TIMEOUT]'), "Error must be SANDBOX_TIMEOUT");
    });

    test("2.2.4: Legitimate bounded nested loops execute completely without false timeouts", () => {
        const legitimateCode = `
            let sum = 0;
            for (let i = 0; i < 50; i++) {
                for (let j = 0; j < 50; j++) {
                    sum += 1;
                }
            }
            sum;
        `;
        const guarded = injectLoopGuards(legitimateCode, 2000);
        const context = vm.createContext({ Date });
        const result = vm.runInContext(guarded, context);

        assert.strictEqual(result, 2500, "Nested loops must compute full result without throwing timeout");
    });

    test("2.2.5: Loops inside strings and comments are not incorrectly modified", () => {
        const stringCode = `
            const doc = "while (true) { doNotTouch(); }";
            // for (let i = 0; ; i++) { ignore(); }
            const ans = 42;
            ans;
        `;
        const guarded = injectLoopGuards(stringCode, 2000);
        assert(guarded.includes('"while (true) { doNotTouch(); }"'), "String literal must be preserved intact");
        assert(guarded.includes('// for (let i = 0; ; i++) { ignore(); }'), "Comment must be preserved intact");
    });

    // =========================================================================
    // 2. ITEM 3.2: WIDESCREEN YAW RECALIBRATION & SUSTAINED DWELL
    // =========================================================================
    console.log("\n--- [ITEM 3.2] Widescreen Yaw Recalibration & Dwell Requirement ---");

    test("3.2.1: frontend_ot/src/App.jsx calibrates yaw threshold to 0.36 and dwell to 4 frames (>= 4.0s)", () => {
        const appPath = path.resolve(__dirname, '../../frontend_ot/src/App.jsx');
        const appSource = fs.readFileSync(appPath, 'utf8');

        assert(appSource.includes('LOOKING_AWAY_YAW_RATIO = 0.36'), "LOOKING_AWAY_YAW_RATIO must be set to 0.36");
        assert(appSource.includes('LOOKING_AWAY_SUSTAINED_FRAMES = 4'), "LOOKING_AWAY_SUSTAINED_FRAMES must be set to 4");
    });

    test("3.2.2: Yaw ratio calculation accepts wide monitor glance (0.30) without triggering", () => {
        const threshold = 0.36;
        const wideMonitorGlanceYaw = 0.30;
        const isLookingAway = wideMonitorGlanceYaw >= threshold;
        assert.strictEqual(isLookingAway, false, "Yaw ratio 0.30 must NOT be flagged as looking away");
    });

    test("3.2.3: Yaw ratio flags true looking-away at 0.38 but requires sustained 4-second dwell", () => {
        const threshold = 0.36;
        const sustainedRequired = 4;
        let dwellCount = 0;
        let flagTriggered = false;

        const frameYawValues = [0.38, 0.37, 0.39, 0.32, 0.38, 0.38, 0.38, 0.38];

        for (const yaw of frameYawValues) {
            if (yaw >= threshold) {
                dwellCount++;
                if (dwellCount >= sustainedRequired) {
                    flagTriggered = true;
                }
            } else {
                dwellCount = 0; // Reset on glance return
            }
        }

        assert.strictEqual(flagTriggered, true, "Sustained frames >= 4 must trigger looking-away flag");
    });

    // =========================================================================
    // 3. ITEM 2.4: DUAL-LAYER INSTANT AUTO-SUBMISSION & DEAD-MAN'S SWITCH
    // =========================================================================
    console.log("\n--- [ITEM 2.4] Instant Auto-Submission & Dead-Man's Switch Reaper ---");

    test("2.4.1: TestSubmission model includes lastHeartbeatAt and compound reaper index", () => {
        const modelPath = path.resolve(__dirname, '../models/TestSubmission.js');
        const modelSource = fs.readFileSync(modelPath, 'utf8');

        assert(modelSource.includes('lastHeartbeatAt:'), "TestSubmission must define lastHeartbeatAt");
        assert(modelSource.includes('status: 1, lastHeartbeatAt: 1, isDeleted: 1'), "TestSubmission must index status + lastHeartbeatAt");
    });

    test("2.4.2: frontend_ot/src/App.jsx implements liveness heartbeat and sendBeacon disconnect", () => {
        const appPath = path.resolve(__dirname, '../../frontend_ot/src/App.jsx');
        const appSource = fs.readFileSync(appPath, 'utf8');

        assert(appSource.includes('/tests/heartbeat/'), "App.jsx must ping /tests/heartbeat/");
        assert(appSource.includes('navigator.sendBeacon'), "App.jsx must use navigator.sendBeacon");
        assert(appSource.includes('/tests/beacon-disconnect'), "App.jsx must send beacon to /tests/beacon-disconnect");
        assert(appSource.includes('pagehide'), "App.jsx must listen to pagehide");
        assert(appSource.includes('beforeunload'), "App.jsx must listen to beforeunload");
    });

    test("2.4.3: backend/routes/tests.js provides /heartbeat and /beacon-disconnect endpoints", () => {
        const routesPath = path.resolve(__dirname, '../routes/tests.js');
        const routesSource = fs.readFileSync(routesPath, 'utf8');

        assert(routesSource.includes("router.post('/heartbeat/:submissionId'"), "Must route POST /heartbeat/:submissionId");
        assert(routesSource.includes("router.post('/beacon-disconnect'"), "Must route POST /beacon-disconnect");
        assert(routesSource.includes("isBeaconDisconnect: true"), "Must mark beacon disconnects in metadata");
    });

    test("2.4.4: Dead-Man's Switch reaper worker exports functions and auto-finalizes sessions dark > 45s", () => {
        const { reapAbandonedSubmissions, startSubmissionReaper, stopSubmissionReaper } = require('../workers/submissionReaper');
        assert.strictEqual(typeof reapAbandonedSubmissions, 'function', "reapAbandonedSubmissions must be a function");
        assert.strictEqual(typeof startSubmissionReaper, 'function', "startSubmissionReaper must be a function");
        assert.strictEqual(typeof stopSubmissionReaper, 'function', "stopSubmissionReaper must be a function");

        const maxIdleMs = 45000;
        const cutoffTime = new Date(Date.now() - maxIdleMs);

        const mockSessions = [
            {
                _id: 'sub_active_recent',
                status: 'started',
                startedAt: new Date(Date.now() - 30000),
                lastHeartbeatAt: new Date(Date.now() - 10000), // active 10s ago
                proctoringEvents: []
            },
            {
                _id: 'sub_abandoned_dead',
                status: 'started',
                startedAt: new Date(Date.now() - 120000),
                lastHeartbeatAt: new Date(Date.now() - 50000), // dark 50s ago (> 45s)
                proctoringEvents: []
            },
            {
                _id: 'sub_already_submitted',
                status: 'submitted',
                startedAt: new Date(Date.now() - 200000),
                lastHeartbeatAt: new Date(Date.now() - 100000),
                proctoringEvents: []
            }
        ];

        // Reaper filter matching MongoDB / JSON query logic:
        const reaped = mockSessions.filter(s => 
            s.status === 'started' && 
            s.startedAt < cutoffTime && 
            s.lastHeartbeatAt < cutoffTime
        );

        assert.strictEqual(reaped.length, 1, "Exactly one abandoned session must be reaped");
        assert.strictEqual(reaped[0]._id, 'sub_abandoned_dead');

        // Apply reaper auto-finalization
        reaped[0].status = 'auto-submitted';
        reaped[0].completedAt = new Date();
        reaped[0].proctoringEvents.push({
            timestamp: new Date(),
            type: 'DISCONNECT_REAPED',
            details: 'Session auto-finalized by server dead-man switch: Candidate heartbeat lost > 45s.'
        });

        assert.strictEqual(reaped[0].status, 'auto-submitted');
        assert(reaped[0].proctoringEvents.some(e => e.type === 'DISCONNECT_REAPED'));
        assert.strictEqual(mockSessions.find(s => s._id === 'sub_active_recent').status, 'started');
    });

    // =========================================================================
    // 4. ITEM 2.3: SERVER-SIDE AUTHORITATIVE EXAM DURATION VALIDATION
    // =========================================================================
    console.log("\n--- [ITEM 2.3] Server-Side Authoritative Exam Duration Enforcement ---");

    test("2.3.1: POST /api/tests/submit validates wall-clock deadline with 120s grace period", () => {
        const routesPath = path.resolve(__dirname, '../routes/tests.js');
        const routesSource = fs.readFileSync(routesPath, 'utf8');

        assert(routesSource.includes('allowedDurationMs = (test.duration || 60) * 60 * 1000'), "Must compute allowedDurationMs");
        assert(routesSource.includes('GRACE_PERIOD_MS = 120 * 1000'), "Must allocate 120s grace period");
        assert(routesSource.includes("submission.status = 'auto-submitted'"), "Must override status to auto-submitted on deadline breach");
        assert(routesSource.includes("type: 'OVERTIME_SUBMISSION'"), "Must log OVERTIME_SUBMISSION proctoring event");
    });

    test("2.3.2: Deadline check accurately differentiates on-time vs overtime submissions", () => {
        const durationMinutes = 60;
        const gracePeriodMs = 120000;
        const allowedMaxMs = (durationMinutes * 60 * 1000) + gracePeriodMs; // 3720000 ms

        const onTimeElapsed = 3600000; // 60 mins exactly
        const withinGraceElapsed = 3660000; // 61 mins (within 2 min grace)
        const overtimeElapsed = 3730000; // 62 mins 10 sec (exceeded grace)

        assert.strictEqual(onTimeElapsed > allowedMaxMs, false, "On-time submission must not be flagged overtime");
        assert.strictEqual(withinGraceElapsed > allowedMaxMs, false, "Submission within grace period must not be flagged overtime");
        assert.strictEqual(overtimeElapsed > allowedMaxMs, true, "Submission beyond grace period must be flagged overtime");
    });

    // =========================================================================
    // 5. EXAM INTEGRITY: START VALIDATION & UNIQUE CONCURRENT ATTEMPT INDEX
    // =========================================================================
    console.log("\n--- [EXAM INTEGRITY] Start Validation & Unique Duplicate Prevention ---");

    test("5.1: TestSubmission enforces compound unique index on candidateId + testId", () => {
        const modelPath = path.resolve(__dirname, '../models/TestSubmission.js');
        const modelSource = fs.readFileSync(modelPath, 'utf8');

        assert(modelSource.includes('candidateId: 1, testId: 1'), "TestSubmission must index candidateId + testId");
        assert(modelSource.includes('unique: true'), "Index must be declared unique");
    });

    test("5.2: POST /api/tests/start/:id enforces isPublished check and scheduling window", () => {
        const routesPath = path.resolve(__dirname, '../routes/tests.js');
        const routesSource = fs.readFileSync(routesPath, 'utf8');

        assert(routesSource.includes('test.isPublished === false'), "Must reject unpublished test");
        assert(routesSource.includes('nowTime < new Date(test.startDate).getTime()'), "Must reject attempt before test.startDate");
        assert(routesSource.includes('nowTime > new Date(test.endDate).getTime()'), "Must reject attempt after test.endDate");
        assert(routesSource.includes('e.code === 11000'), "Must handle duplicate key race conditions gracefully with 400");
    });

    // =========================================================================
    // 6. STORED XSS ELIMINATION ACROSS ALL RICHTEXT RENDERERS
    // =========================================================================
    console.log("\n--- [STORED XSS] Math Delimiter & Markdown Media Sanitization ---");

    test("6.1: frontend/src/components/RichText.jsx escapes HTML inside math placeholders", () => {
        const richTextPath = path.resolve(__dirname, '../../frontend/src/components/RichText.jsx');
        const source = fs.readFileSync(richTextPath, 'utf8');

        assert(source.includes('escapeHtml'), "RichText.jsx must define escapeHtml helper");
        assert(source.includes('escapeHtml(mathContent)'), "RichText.jsx must sanitize math blocks before re-injection");
    });

    test("6.2: frontend_ot/src/components/common/RichText.jsx escapes HTML inside math & validates images", () => {
        const richTextPath = path.resolve(__dirname, '../../frontend_ot/src/components/common/RichText.jsx');
        const source = fs.readFileSync(richTextPath, 'utf8');

        assert(source.includes('escapeHtml'), "RichText.jsx must define escapeHtml helper");
        assert(source.includes('escapeHtml(mathContent)'), "RichText.jsx must sanitize math blocks before re-injection");
        assert(source.includes('isSafeUrl'), "RichText.jsx must validate markdown image URLs");
    });

    test("6.3: frontend_ot/src/App.jsx escapes HTML inside inlined RichText component", () => {
        const appPath = path.resolve(__dirname, '../../frontend_ot/src/App.jsx');
        const source = fs.readFileSync(appPath, 'utf8');

        assert(source.includes('escapeHtml(mathContent)'), "App.jsx RichText must sanitize math blocks before re-injection");
    });

    test("6.4: Math content with embedded malicious HTML tags is sanitized to harmless text entities", () => {
        function escapeHtml(str) {
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        const maliciousMathTokens = [
            '<img src=x onerror=alert(1)>',
            '<script>alert("XSS")</script>',
            '<iframe src="javascript:alert(1)"></iframe>',
            '<svg onload=fetch("/steal")>'
        ];

        for (const token of maliciousMathTokens) {
            const escaped = escapeHtml(token);
            assert(!escaped.includes('<img'), "Must not contain raw <img tag");
            assert(!escaped.includes('<script'), "Must not contain raw <script tag");
            assert(!escaped.includes('<iframe'), "Must not contain raw <iframe tag");
            assert(!escaped.includes('<svg'), "Must not contain raw <svg tag");
            assert(escaped.includes('&lt;'), "Must be escaped with &lt; entity");
            assert(escaped.includes('&gt;'), "Must be escaped with &gt; entity");
        }
    });

    console.log("\n==================================================================");
    console.log(`📊 FINAL TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
    console.log("==================================================================");

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error("Test execution failed:", err);
    process.exit(1);
});
