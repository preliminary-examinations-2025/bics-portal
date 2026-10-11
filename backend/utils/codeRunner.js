const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

let gppChecked = null;
const isGppAvailable = async () => {
    if (gppChecked !== null) return gppChecked;
    return new Promise((resolve) => {
        exec('g++ --version', (err) => {
            gppChecked = !err;
            resolve(gppChecked);
        });
    });
};

const runLocalGpp = async (sourceCode, testCases, timeLimitMs = 2000) => {
    return new Promise((resolve) => {
        const dir = path.join(__dirname, '..', 'temp_runs');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const fileId = Math.random().toString(36).substring(7);
        const codeFile = path.join(dir, `${fileId}.cpp`);
        const isWin = process.platform === 'win32';
        const execFile = path.join(dir, isWin ? `${fileId}.exe` : `${fileId}.out`);

        fs.writeFileSync(codeFile, sourceCode);

        exec(`g++ "${codeFile}" -o "${execFile}"`, async (compileErr, stdout, stderr) => {
            if (compileErr || stderr) {
                try {
                    if (fs.existsSync(codeFile)) fs.unlinkSync(codeFile);
                } catch (unlinkErr) {
                    console.warn("Temporary code file cleanup warning (compile phase):", unlinkErr.message);
                }
                return resolve({
                    success: false,
                    status: 'Compilation Error',
                    compileError: stderr || compileErr.message,
                    results: []
                });
            }

            const results = [];
            try {
                for (let i = 0; i < testCases.length; i++) {
                    const tc = testCases[i];
                    const res = await new Promise((runResolve) => {
                        const child = exec(`"${execFile}"`, { timeout: timeLimitMs }, (runErr, runStdout, runStderr) => {
                            if (runErr && runErr.killed) {
                                return runResolve({ status: 'Time Limit Exceeded (TLE)', stdout: '', stderr: 'Time limit exceeded.' });
                            }
                            if (runErr || runStderr) {
                                return runResolve({ status: 'Runtime Error', stdout: '', stderr: runStderr || runErr.message });
                            }
                            const cleanExpected = (tc.output || tc.expectedOutput || '').trim().replace(/\r\n/g, '\n');
                            const cleanActual = (runStdout || '').trim().replace(/\r\n/g, '\n');
                            const isCorrect = cleanActual === cleanExpected;

                            runResolve({
                                status: isCorrect ? 'Accepted' : 'Wrong Answer',
                                stdout: runStdout,
                                stderr: ''
                            });
                        });

                        child.stdin.on('error', (stdinErr) => {
                            console.warn("Local runner stdin write error (process probably exited early):", stdinErr.message);
                        });

                        if (tc.input) {
                            child.stdin.write(tc.input);
                            child.stdin.end();
                        } else {
                            child.stdin.end();
                        }
                    });
                    results.push({
                        testcaseId: tc.testcaseId || tc.testCaseId || tc.id || tc._id || (20260101 + i),
                        id: tc.id || tc._id || tc.testcaseId || (20260101 + i),
                        input: tc.input,
                        expectedOutput: tc.output || tc.expectedOutput,
                        actualOutput: res.stdout,
                        status: res.status,
                        stderr: res.stderr
                    });
                }
            } catch (runLoopErr) {
                console.error("Local runner loop crashed:", runLoopErr);
            } finally {
                try {
                    if (fs.existsSync(codeFile)) fs.unlinkSync(codeFile);
                } catch (unlinkErr) {
                    console.warn("Temporary code file cleanup warning:", unlinkErr.message);
                }
                try {
                    if (fs.existsSync(execFile)) fs.unlinkSync(execFile);
                } catch (unlinkErr) {
                    console.warn("Temporary executable cleanup warning:", unlinkErr.message);
                }
            }

            resolve({
                success: true,
                status: 'Success',
                results
            });
        });
    });
};

const JUDGE0_URL = process.env.JUDGE0_API_URL || "https://demo.judge0.com/submissions?wait=true";
const JUDGE0_KEY = process.env.JUDGE0_API_KEY;

const runOnJudge0 = async (sourceCode, testCases) => {
    try {
        const promises = testCases.map(async (tc) => {
            const body = {
                source_code: sourceCode,
                language_id: 54, // C++
                stdin: tc.input || "",
                cpu_time_limit: 2.0
            };
            const headers = { "Content-Type": "application/json" };
            if (JUDGE0_KEY) {
                if (JUDGE0_URL.includes('rapidapi')) {
                    headers['x-rapidapi-key'] = JUDGE0_KEY;
                    headers['x-rapidapi-host'] = new URL(JUDGE0_URL).hostname;
                } else {
                    headers['X-Auth-Token'] = JUDGE0_KEY;
                }
            }
            const res = await fetch(JUDGE0_URL, {
                method: "POST",
                headers,
                body: JSON.stringify(body)
            });
            if (res.ok) {
                const data = await res.json();
                const statusDesc = data.status?.description || "Runtime Error";
                const expected = (tc.output || tc.expectedOutput || '');
                const cleanExpected = expected.trim().replace(/\r\n/g, '\n');
                const cleanActual = (data.stdout || '').trim().replace(/\r\n/g, '\n');
                const isCorrect = cleanActual === cleanExpected;
                
                return {
                    input: tc.input,
                    expectedOutput: expected,
                    actualOutput: data.stdout || "",
                    status: isCorrect ? "Accepted" : (statusDesc === "Accepted" ? "Wrong Answer" : statusDesc),
                    stderr: (data.stderr || data.compile_output) ? (data.stderr || data.compile_output) : ""
                };
            }
            return {
                input: tc.input,
                expectedOutput: tc.output || tc.expectedOutput,
                actualOutput: "",
                status: "Error",
                stderr: "Cloud compiler unreachable."
            };
        });

        const results = await Promise.all(promises);
        const hasCompileError = results.some(r => r.status.includes("Compilation Error"));
        return {
            success: !hasCompileError,
            status: hasCompileError ? 'Compilation Error' : 'Success',
            compileError: hasCompileError ? results.find(r => r.status.includes("Compilation Error")).stderr : '',
            results
        };
    } catch (e) {
        console.error("Judge0 parallel execution failed:", e);
        return {
            success: false,
            status: 'Error',
            compileError: 'Cloud compiler failed or is offline.',
            results: []
        };
    }
};

const isSafeCode = (sourceCode) => {
    const unsafePatterns = [
        /system\s*\(/,
        /popen\s*\(/,
        /fork\s*\(/,
        /exec\s*\(/,
        /fstream/,
        /ofstream/,
        /ifstream/,
        /#include\s*<filesystem>/,
        /#include\s*<fstream>/,
        /std::filesystem/
    ];
    return !unsafePatterns.some(pattern => pattern.test(sourceCode));
};

const executeCode = async (sourceCode, testCases) => {
    if (!isSafeCode(sourceCode)) {
        return {
            success: false,
            status: 'Compilation Error',
            compileError: 'Security violation: Unsafe file operations or process commands detected in code. Run blocked.',
            results: []
        };
    }
    const localCompiler = await isGppAvailable();
    if (localCompiler) {
        console.log(`--> Compiling & executing locally using g++`);
        return await runLocalGpp(sourceCode, testCases);
    } else {
        console.log(`--> Local compiler unavailable. Offloading to Judge0 Cloud Compiler`);
        return await runOnJudge0(sourceCode, testCases);
    }
};

module.exports = {
    isGppAvailable,
    runLocalGpp,
    runOnJudge0,
    isSafeCode,
    executeCode
};
