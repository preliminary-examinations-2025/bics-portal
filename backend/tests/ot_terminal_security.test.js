const assert = require('assert');
const { executeCode, isSafeCode, isDockerAvailable, isGppAvailable } = require('../utils/codeRunner');
const { sanitizeQuestionForCandidate, reconcileProctoringLog } = require('../routes/tests');

async function testOtTerminalSecurity() {
    console.log("==================================================");
    console.log("🛡️ OT TERMINAL SECURITY & SANDBOX VERIFICATION");
    console.log("==================================================");

    // ==========================================
    // 1. Verify Item B1: Hidden Test Cases Strip
    // ==========================================
    console.log("\n[Item B1] Testing Server-Side Projection Filter for Questions:");
    
    // Test Coding Question with Sample and Hidden Testcases
    const codingQuestion = {
        id: "q_coding_1",
        type: "coding",
        title: "Sum of Array",
        description: "Given an array of integers, output the sum.",
        timeLimitMs: 1500,
        memoryLimitMb: 64,
        testCases: [
            { input: "3\n1 2 3\n", output: "6", isSample: true, points: 10 },
            { input: "1\n5\n", output: "5", isSample: true, points: 10 },
            { input: "1000\n[hidden huge boundary data]", output: "500500", isSample: false, points: 30 },
            { input: "0\n", output: "0", isSample: false, points: 20 }
        ]
    };

    const sanitizedCoding = sanitizeQuestionForCandidate(codingQuestion);
    assert.strictEqual(sanitizedCoding.testCases.length, 2, "Only sample test cases should be returned to candidate");
    assert.strictEqual(sanitizedCoding.testCases[0].isSample, true);
    assert.strictEqual(sanitizedCoding.testCases[1].isSample, true);
    assert.strictEqual(sanitizedCoding.testCases.some(tc => !tc.isSample), false, "Hidden test cases must be strictly omitted");
    console.log("  ✅ Coding question sanitized: 2 sample cases kept, 2 hidden cases stripped");

    // Test MCQ Question with correctOptionIndex
    const mcqQuestion = {
        id: "q_mcq_1",
        type: "mcq",
        title: "Complexity Question",
        options: ["O(1)", "O(n)", "O(n log n)", "O(n^2)"],
        correctOptionIndex: 2
    };

    const sanitizedMcq = sanitizeQuestionForCandidate(mcqQuestion);
    assert.strictEqual(sanitizedMcq.correctOptionIndex, undefined, "correctOptionIndex must never be leaked to client");
    assert.strictEqual(sanitizedMcq.options.length, 4);
    console.log("  ✅ MCQ question sanitized: correctOptionIndex stripped from candidate payload");


    // ==========================================
    // 2. Verify Item B4: Proctoring Monotonic High-Water Mark
    // ==========================================
    console.log("\n[Item B4] Testing Proctoring Violation Counter Overwrite Guard:");

    const existingDbLog = {
        fullscreenExits: 3,
        tabSwitches: 5,
        clipboardAttempts: 2,
        events: [
            { type: 'TAB_SWITCH', timestamp: '2026-10-16T10:00:00Z', details: 'Candidate switched tabs' },
            { type: 'TAB_SWITCH', timestamp: '2026-10-16T10:01:00Z', details: 'Candidate switched tabs' },
            { type: 'FULLSCREEN_EXIT', timestamp: '2026-10-16T10:02:00Z', details: 'Exited fullscreen' }
        ]
    };

    // Malicious attempt by client during final submit: zeroing out counters
    const maliciousIncomingLog = {
        fullscreenExits: 0,
        tabSwitches: 0,
        clipboardAttempts: 0,
        events: [
            { type: 'TAB_SWITCH', timestamp: '2026-10-16T10:05:00Z', details: 'New tab switch' }
        ]
    };

    const reconciled = reconcileProctoringLog(existingDbLog, maliciousIncomingLog);
    assert.strictEqual(reconciled.fullscreenExits, 3, "Fullscreen exits counter must not decrease to 0");
    assert.strictEqual(reconciled.tabSwitches, 5, "Tab switches counter must preserve highest recorded count");
    assert.strictEqual(reconciled.clipboardAttempts, 2, "Clipboard attempts counter must not decrease");
    assert.strictEqual(reconciled.events.length, 4, "Events must merge cleanly without losing previous history");
    console.log("  ✅ Monotonic guard verified: Client attempt to zero out violation counters was completely blocked");


    // ==========================================
    // 3. Verify Item 2.1: Sandbox Code Runner & Dynamic Limits
    // ==========================================
    console.log("\n[Item 2.1] Testing Code Runner Dynamic Limits & Standardized Verdicts:");

    const safeSolution = `#include <iostream>\nusing namespace std;\nint main() { int a; cin >> a; cout << (a * 10); return 0; }`;
    const evalResult = await executeCode(safeSolution, [
        { input: "5\n", output: "50" },
        { input: "8\n", output: "90" } // Wrong answer
    ], 2000, 128);

    assert.strictEqual(evalResult.results[0].status, "Accepted");
    assert.strictEqual(evalResult.results[1].status, "Wrong Answer");
    console.log("  ✅ Evaluated verdicts: Accepted and Wrong Answer correctly identified");

    // Dynamic Time Limit Exceeded
    const loopSolution = `int main() { while(1); return 0; }`;
    const tleResult = await executeCode(loopSolution, [{ input: "", output: "" }], 500, 64);
    assert.strictEqual(tleResult.results[0].status, "Time Limit Exceeded (TLE)");
    console.log("  ✅ Dynamic limit enforced: 500ms timeout returned Time Limit Exceeded (TLE)");

    // Malicious injection block
    const exploitCode = `#include <windows.h>\nint main() { WinExec("calc.exe", 1); return 0; }`;
    const blockResult = await executeCode(exploitCode, [{ input: "", output: "" }]);
    assert.strictEqual(blockResult.status, "Compilation Error");
    assert.ok(blockResult.compileError.includes("Security violation"));
    console.log("  ✅ Security blacklist enforced: Dangerous Windows API injection blocked");

    console.log("\n==================================================");
    console.log("🎉 ALL OT TERMINAL SECURITY CHECKS PASSED (B1, B4, 2.1)!");
    console.log("==================================================");
}

testOtTerminalSecurity().catch(err => {
    console.error("❌ Test suite failed:", err);
    process.exit(1);
});
