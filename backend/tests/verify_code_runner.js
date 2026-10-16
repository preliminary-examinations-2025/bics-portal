const assert = require('assert');
const { executeCode, isSafeCode, isDockerAvailable, isGppAvailable } = require('../utils/codeRunner');

async function runTests() {
    console.log("==================================================");
    console.log("🧪 TESTING CODE RUNNER & SANDBOX ENGINE");
    console.log("==================================================");

    // 1. Test isSafeCode security blacklist
    console.log("\n[Test 1] Testing isSafeCode blacklist:");
    const safeCpp = `#include <iostream>\nusing namespace std;\nint main() { int a, b; cin >> a >> b; cout << (a + b) << endl; return 0; }`;
    assert.strictEqual(isSafeCode(safeCpp), true, "Safe code should be permitted");
    console.log("  ✅ Safe C++ code permitted");

    const unsafeSystem = `#include <iostream>\n#include <cstdlib>\nint main() { system("whoami"); return 0; }`;
    assert.strictEqual(isSafeCode(unsafeSystem), false, "system() must be blocked");
    console.log("  ✅ system() call blocked");

    const unsafeFstream = `#include <iostream>\n#include <fstream>\nint main() { ofstream f("test.txt"); return 0; }`;
    assert.strictEqual(isSafeCode(unsafeFstream), false, "<fstream> must be blocked");
    console.log("  ✅ <fstream> blocked");

    const unsafeFopen = `#include <stdio.h>\nint main() { FILE *f = fopen("secrets.txt", "r"); return 0; }`;
    assert.strictEqual(isSafeCode(unsafeFopen), false, "fopen() must be blocked");
    console.log("  ✅ fopen() blocked");

    const unsafeThread = `#include <thread>\nint main() { std::thread t([]{}); t.join(); return 0; }`;
    assert.strictEqual(isSafeCode(unsafeThread), false, "<thread> must be blocked");
    console.log("  ✅ <thread> blocked");

    const unsafeAsm = `int main() { __asm { mov eax, 0 }; return 0; }`;
    assert.strictEqual(isSafeCode(unsafeAsm), false, "__asm must be blocked");
    console.log("  ✅ __asm blocked");

    // 2. Test Execution Engines availability
    console.log("\n[Test 2] Environment Check:");
    const dockerOk = await isDockerAvailable();
    const gppOk = await isGppAvailable();
    console.log(`  🐳 Docker Available: ${dockerOk}`);
    console.log(`  💻 Host g++ Available: ${gppOk}`);

    // 3. Test Correct Solution (Accepted)
    console.log("\n[Test 3] Testing Valid C++ Solution (Accepted & Wrong Answer):");
    const testCases = [
        { input: "3 4\n", output: "7" },
        { input: "10 20\n", output: "30" },
        { input: "5 5\n", output: "11" } // Intentional wrong answer for testcase 3
    ];

    const result = await executeCode(safeCpp, testCases, 2000, 128);
    console.log("  Success status:", result.status);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.results.length, 3);
    assert.strictEqual(result.results[0].status, "Accepted");
    assert.strictEqual(result.results[1].status, "Accepted");
    assert.strictEqual(result.results[2].status, "Wrong Answer");
    console.log("  ✅ Testcase 1: Accepted (3 + 4 = 7)");
    console.log("  ✅ Testcase 2: Accepted (10 + 20 = 30)");
    console.log("  ✅ Testcase 3: Correctly flagged as Wrong Answer (expected 11, got 10)");

    // 4. Test Time Limit Exceeded (TLE)
    console.log("\n[Test 4] Testing Time Limit Exceeded (TLE) with custom dynamic limit 800ms:");
    const infiniteLoopCode = `#include <iostream>\nusing namespace std;\nint main() { while(true) {} return 0; }`;
    const t0 = Date.now();
    const tleResult = await executeCode(infiniteLoopCode, [{ input: "", output: "done" }], 800, 128);
    const elapsed = Date.now() - t0;
    console.log(`  Elapsed time: ${elapsed}ms`);
    assert.strictEqual(tleResult.results[0].status, "Time Limit Exceeded (TLE)");
    console.log("  ✅ Infinite loop correctly terminated and returned 'Time Limit Exceeded (TLE)'");

    // 5. Test Compilation Error (CE)
    console.log("\n[Test 5] Testing Compilation Error (CE):");
    const brokenCode = `int main() { invalid_syntax_error here; return 0; }`;
    const ceResult = await executeCode(brokenCode, [{ input: "", output: "" }]);
    assert.strictEqual(ceResult.status, "Compilation Error");
    assert.strictEqual(ceResult.success, false);
    console.log("  ✅ Compilation Error detected and formatted cleanly");

    // 6. Test Security Violation Rejection
    console.log("\n[Test 6] Testing Security Violation Execution Block:");
    const secResult = await executeCode(unsafeSystem, [{ input: "", output: "" }]);
    assert.strictEqual(secResult.status, "Compilation Error");
    assert.strictEqual(secResult.success, false);
    assert.ok(secResult.compileError.includes("Security violation"));
    console.log("  ✅ Malicious payload execution blocked prior to running");

    console.log("\n==================================================");
    console.log("🎉 ALL CODE RUNNER TESTS PASSED SUCCESSFULLY!");
    console.log("==================================================");
}

runTests().catch(err => {
    console.error("❌ Test failed:", err);
    process.exit(1);
});
