const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');

// 1. In-memory detection cache
let gppChecked = null;
let dockerChecked = { available: null, lastChecked: 0 };
let dockerImageChecked = false;

const isGppAvailable = async () => {
    if (gppChecked !== null) return gppChecked;
    return new Promise((resolve) => {
        exec('g++ --version', { timeout: 3000 }, (err) => {
            gppChecked = !err;
            resolve(gppChecked);
        });
    });
};

const safeUnlink = (filePath) => {
    if (!filePath) return;
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (err) {
        setTimeout(() => {
            try {
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            } catch (_) {}
        }, 350);
    }
};

const isDockerAvailable = async () => {
    const now = Date.now();
    // Cache docker availability check for 60 seconds
    if (dockerChecked.available !== null && (now - dockerChecked.lastChecked < 60000)) {
        return dockerChecked.available;
    }

    return new Promise((resolve) => {
        exec('docker info', { timeout: 3500 }, (err, stdout, stderr) => {
            const hasError = !!err || (stderr && stderr.includes('failed to connect'));
            dockerChecked = {
                available: !hasError,
                lastChecked: now
            };
            resolve(dockerChecked.available);
        });
    });
};

const ensureDockerImage = async () => {
    if (dockerImageChecked) return true;
    return new Promise((resolve) => {
        exec('docker image inspect bics-cpp-sandbox', { timeout: 4000 }, (inspectErr) => {
            if (!inspectErr) {
                dockerImageChecked = true;
                return resolve(true);
            }
            console.log("--> Building bics-cpp-sandbox Docker image...");
            const sandboxDir = path.resolve(__dirname, '..', 'sandbox');
            exec(`docker build -t bics-cpp-sandbox "${sandboxDir}"`, { timeout: 120000 }, (buildErr, stdout, stderr) => {
                if (buildErr) {
                    console.error("Failed to build bics-cpp-sandbox image:", stderr || buildErr.message);
                    return resolve(false);
                }
                dockerImageChecked = true;
                console.log("--> bics-cpp-sandbox Docker image built successfully.");
                resolve(true);
            });
        });
    });
};

// 2. Comprehensive Security Pattern Blacklist (Defense-in-depth)
const isSafeCode = (sourceCode) => {
    const unsafePatterns = [
        // File I/O
        /\b(fopen|freopen|remove|unlink|rename|tmpfile)\s*\(/,
        /\b(fstream|ifstream|ofstream)\b/,
        /#include\s*<fstream>/i,
        /#include\s*<filesystem>/i,
        /\bstd::filesystem\b/,
        
        // Process creation & Execution
        /\b(system|popen|fork|vfork|clone)\s*\(/,
        /\b(execl|execlp|execle|execv|execvp|execvpe)\s*\(/,
        /\b(WinExec|CreateProcess[AW]?|ShellExecute[AW]?)\s*\(/,
        
        // System / Native Headers
        /#include\s*<(windows\.h|process\.h|unistd\.h|sys\/|dirent\.h|fcntl\.h)>/i,
        
        // Inline Assembly
        /\b(__asm__|__asm|asm)\b\s*(\(|{)/,
        
        // Multithreading / Resource exhaustion
        /#include\s*<(thread|pthread\.h|future|coroutine)>/i,
        /\b(std::thread|pthread_create)\b/
    ];
    return !unsafePatterns.some(pattern => pattern.test(sourceCode));
};

// 3. Execution inside Isolated Docker Container
const runInDocker = async (sourceCode, testCases, timeLimitMs = 2000, memoryLimitMb = 128, onTestProgress = null) => {
    const dir = path.resolve(__dirname, '..', 'temp_runs', `docker_${Math.random().toString(36).substring(7)}`);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const codeFile = path.join(dir, 'solution.cpp');
    fs.writeFileSync(codeFile, sourceCode);

    // Docker volume mount path formatting (handles Windows and POSIX paths)
    const volumePath = dir.replace(/\\/g, '/');

    return new Promise(async (resolve) => {
        // Step A: Compile inside Docker container
        const compileCmd = `docker run --rm --network none --memory 256m --cpus 1.0 -v "${volumePath}:/sandbox" bics-cpp-sandbox g++ -O2 -std=c++17 /sandbox/solution.cpp -o /sandbox/runner`;

        exec(compileCmd, { timeout: 15000 }, async (compileErr, compileStdout, compileStderr) => {
            if (compileErr) {
                try {
                    fs.rmSync(dir, { recursive: true, force: true });
                } catch (rmErr) {
                    console.warn("Docker temp dir cleanup warning:", rmErr.message);
                }
                return resolve({
                    success: false,
                    status: 'Compilation Error',
                    compileError: compileStderr || compileErr.message,
                    results: []
                });
            }

            const results = [];
            try {
                // Step B: Run each testcase in an isolated, unprivileged, read-only container
                for (let i = 0; i < testCases.length; i++) {
                    if (typeof onTestProgress === 'function') {
                        try { await onTestProgress(i + 1, testCases.length); } catch (e) {}
                    }
                    const tc = testCases[i];
                    const runRes = await new Promise((runResolve) => {
                        const runCmd = `docker run --rm -i --network none --memory "${memoryLimitMb}m" --memory-swap "${memoryLimitMb}m" --cpus 1.0 --pids-limit 32 --cap-drop ALL -v "${volumePath}:/sandbox:ro" bics-cpp-sandbox /sandbox/runner`;

                        const child = exec(runCmd, { timeout: timeLimitMs, maxBuffer: 1024 * 1024 }, (runErr, stdout, stderr) => {
                            if (runErr) {
                                if (runErr.killed || runErr.signal === 'SIGTERM') {
                                    return runResolve({ status: 'Time Limit Exceeded (TLE)', stdout: '', stderr: 'Execution timed out.' });
                                }
                                if (runErr.code === 137) {
                                    return runResolve({ status: 'Memory Limit Exceeded (MLE)', stdout: '', stderr: `Process killed: exceeded memory limit of ${memoryLimitMb}MB.` });
                                }
                                if (runErr.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
                                    return runResolve({ status: 'Runtime Error', stdout: '', stderr: 'Output limit exceeded (max 1MB).' });
                                }
                                return runResolve({ status: 'Runtime Error', stdout: '', stderr: stderr || runErr.message });
                            }

                            const cleanExpected = (tc.output || tc.expectedOutput || '').trim().replace(/\r\n/g, '\n');
                            const cleanActual = (stdout || '').trim().replace(/\r\n/g, '\n');
                            const isCorrect = cleanActual === cleanExpected;

                            runResolve({
                                status: isCorrect ? 'Accepted' : 'Wrong Answer',
                                stdout: stdout || '',
                                stderr: stderr || ''
                            });
                        });

                        child.stdin.on('error', (stdinErr) => {
                            console.warn("Docker runner stdin write warning:", stdinErr.message);
                        });

                        if (tc.input) {
                            child.stdin.write(tc.input);
                        }
                        child.stdin.end();
                    });

                    results.push({
                        testcaseId: tc.testcaseId || tc.testCaseId || tc.id || tc._id || (20260101 + i),
                        id: tc.id || tc._id || tc.testcaseId || (20260101 + i),
                        input: tc.input,
                        expectedOutput: tc.output || tc.expectedOutput,
                        actualOutput: runRes.stdout,
                        status: runRes.status,
                        stderr: runRes.stderr
                    });
                }
            } catch (err) {
                console.error("Docker runner loop crashed:", err);
            } finally {
                try {
                    fs.rmSync(dir, { recursive: true, force: true });
                } catch (rmErr) {
                    console.warn("Docker temp dir cleanup warning:", rmErr.message);
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

// 4. Guarded Local Host Process (Robust fallback when Docker daemon is offline/unavailable)
const runLocalGuardedProcess = async (sourceCode, testCases, timeLimitMs = 2000, memoryLimitMb = 128, onTestProgress = null) => {
    return new Promise((resolve) => {
        const dir = path.join(__dirname, '..', 'temp_runs');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const fileId = Math.random().toString(36).substring(7);
        const codeFile = path.join(dir, `${fileId}.cpp`);
        const isWin = process.platform === 'win32';
        const execFile = path.join(dir, isWin ? `${fileId}.exe` : `${fileId}.out`);

        fs.writeFileSync(codeFile, sourceCode);

        // Inject bundled bits/stdc++.h shim so #include<bits/stdc++.h> resolves on
        // any host regardless of GCC installation completeness (e.g., Render, minimal Alpine).
        const bitsShimDir = path.resolve(__dirname, '..', 'sandbox');

        // Compile with standard optimization and modern C++ standard
        exec(`g++ -O2 -std=c++17 -I"${bitsShimDir}" "${codeFile}" -o "${execFile}"`, { timeout: 15000 }, async (compileErr, stdout, stderr) => {
            if (compileErr) {
                try {
                    if (fs.existsSync(codeFile)) fs.unlinkSync(codeFile);
                } catch (unlinkErr) {
                    console.warn("Local compiler temp code unlink warning:", unlinkErr.message);
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
                    if (typeof onTestProgress === 'function') {
                        try { await onTestProgress(i + 1, testCases.length); } catch (e) {}
                    }
                    const tc = testCases[i];
                    const res = await new Promise((runResolve) => {
                        const child = exec(`"${execFile}"`, { 
                            timeout: timeLimitMs, 
                            maxBuffer: 1024 * 1024 // 1MB buffer cap to prevent OOM dumps
                        }, (runErr, runStdout, runStderr) => {
                            if (runErr) {
                                if (runErr.killed || runErr.signal === 'SIGTERM') {
                                    return runResolve({ status: 'Time Limit Exceeded (TLE)', stdout: '', stderr: 'Time limit exceeded.' });
                                }
                                if (runErr.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
                                    return runResolve({ status: 'Runtime Error', stdout: '', stderr: 'Output limit exceeded (max 1MB).' });
                                }
                                return runResolve({ status: 'Runtime Error', stdout: '', stderr: runStderr || runErr.message });
                            }

                            const normalizeOutput = (str) => {
                                if (!str || typeof str !== 'string') return '';
                                return str
                                    .replace(/\r\n/g, '\n')
                                    .replace(/\r/g, '\n')
                                    .split('\n')
                                    .map(line => line.trimEnd())
                                    .join('\n')
                                    .trim();
                            };

                            const cleanExpected = normalizeOutput(tc.output || tc.expectedOutput || '');
                            const cleanActual = normalizeOutput(runStdout || '');
                            const isCorrect = cleanActual === cleanExpected;

                            runResolve({
                                status: isCorrect ? 'Accepted' : 'Wrong Answer',
                                stdout: runStdout || '',
                                stderr: ''
                            });
                        });

                        child.stdin.on('error', (stdinErr) => {
                            console.warn("Local runner stdin write warning:", stdinErr.message);
                        });

                        if (tc.input) {
                            child.stdin.write(tc.input);
                        }
                        child.stdin.end();
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
                safeUnlink(codeFile);
                safeUnlink(execFile);
            }

            resolve({
                success: true,
                status: 'Success',
                results
            });
        });
    });
};

// 5. Cloud Compiler (Judge0) fallback
const JUDGE0_URL = process.env.JUDGE0_API_URL || "https://demo.judge0.com/submissions?wait=true";
const JUDGE0_KEY = process.env.JUDGE0_API_KEY;

const runOnJudge0 = async (sourceCode, testCases, timeLimitMs = 2000, memoryLimitMb = 128) => {
    try {
        const promises = testCases.map(async (tc) => {
            const body = {
                source_code: sourceCode,
                language_id: 54, // C++ (GCC 9.2.0)
                stdin: tc.input || "",
                cpu_time_limit: Math.max(0.5, timeLimitMs / 1000),
                memory_limit: memoryLimitMb * 1024 // in KB
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
                let statusDesc = data.status?.description || "Runtime Error";
                
                // Map Judge0 statuses to standardized competitive programming verdicts
                if (statusDesc.includes("Time Limit Exceeded")) {
                    statusDesc = "Time Limit Exceeded (TLE)";
                } else if (statusDesc.includes("Memory Limit Exceeded")) {
                    statusDesc = "Memory Limit Exceeded (MLE)";
                } else if (statusDesc.includes("Runtime Error")) {
                    statusDesc = "Runtime Error";
                }

                const expected = (tc.output || tc.expectedOutput || '');
                const cleanExpected = expected.trim().replace(/\r\n/g, '\n');
                const cleanActual = (data.stdout || '').trim().replace(/\r\n/g, '\n');
                const isCorrect = cleanActual === cleanExpected;
                
                return {
                    input: tc.input,
                    expectedOutput: expected,
                    actualOutput: data.stdout || "",
                    status: (statusDesc === "Accepted") ? (isCorrect ? "Accepted" : "Wrong Answer") : statusDesc,
                    stderr: (data.stderr || data.compile_output) ? (data.stderr || data.compile_output) : ""
                };
            }
            return {
                input: tc.input,
                expectedOutput: tc.output || tc.expectedOutput,
                actualOutput: "",
                status: "Runtime Error",
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

// 6. Master Unified Code Execution Engine
const executeCode = async (sourceCode, testCases, timeLimitMs = 2000, memoryLimitMb = 128, onTestProgress = null) => {
    // Clamp dynamic limits to safe bounds
    const clampedTimeMs = Math.max(200, Math.min(Number(timeLimitMs) || 2000, 10000));
    const clampedMemoryMb = Math.max(16, Math.min(Number(memoryLimitMb) || 128, 512));

    // Defense-in-depth safety validation
    if (!isSafeCode(sourceCode)) {
        return {
            success: false,
            status: 'Compilation Error',
            compileError: 'Security violation: Unsafe file operations, system calls, or prohibited libraries detected.',
            results: []
        };
    }

    // Tier 1: Check Docker container isolation
    const dockerReady = await isDockerAvailable();
    if (dockerReady) {
        const imageReady = await ensureDockerImage();
        if (imageReady) {
            console.log(`--> [CodeRunner] Executing in isolated Docker container (Limit: ${clampedTimeMs}ms, ${clampedMemoryMb}MB)`);
            return await runInDocker(sourceCode, testCases, clampedTimeMs, clampedMemoryMb, onTestProgress);
        }
    }

    // Tier 2: Check local host g++ compiler
    const localCompiler = await isGppAvailable();
    if (localCompiler) {
        console.log(`--> [CodeRunner] Executing via guarded local process (Limit: ${clampedTimeMs}ms, ${clampedMemoryMb}MB)`);
        return await runLocalGuardedProcess(sourceCode, testCases, clampedTimeMs, clampedMemoryMb, onTestProgress);
    }

    // Tier 3: Offload to Judge0 Cloud
    console.log(`--> [CodeRunner] Local execution engines unavailable. Offloading to Judge0 Cloud`);
    return await runOnJudge0(sourceCode, testCases, clampedTimeMs, clampedMemoryMb);
};

module.exports = {
    isGppAvailable,
    isDockerAvailable,
    ensureDockerImage,
    runInDocker,
    runLocalGuardedProcess,
    runOnJudge0,
    isSafeCode,
    executeCode
};
