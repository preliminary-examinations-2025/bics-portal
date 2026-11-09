const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');

const normalizeProgramOutput = (str) => {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .map(line => line.trimEnd())
        .join('\n')
        .trim();
};

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

const safeUnlink = (filePath, maxRetries = 6, delayMs = 200) => {
    if (!filePath) return;
    const tryDelete = (attemptsLeft) => {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (err) {
            // Windows file handle lock backoff
            if (attemptsLeft > 0) {
                setTimeout(() => tryDelete(attemptsLeft - 1), delayMs);
            }
        }
    };
    tryDelete(maxRetries);
};

/**
 * Scavenger: prunes orphaned temp files/directories older than 30 seconds
 */
const cleanOrphanedTempRuns = () => {
    const dir = path.join(__dirname, '..', 'temp_runs');
    if (!fs.existsSync(dir)) return;
    try {
        const entries = fs.readdirSync(dir);
        const now = Date.now();
        for (const entry of entries) {
            const fullPath = path.join(dir, entry);
            try {
                const stats = fs.statSync(fullPath);
                if (now - stats.mtimeMs > 30000) {
                    if (stats.isDirectory()) {
                        fs.rmSync(fullPath, { recursive: true, force: true });
                    } else {
                        fs.unlinkSync(fullPath);
                    }
                }
            } catch (_) {}
        }
    } catch (err) {
        console.warn("[codeRunner] Error pruning temp_runs directory:", err.message);
    }
};

// Immediate cleanup on startup + scheduled scavenger every 10 minutes
try { cleanOrphanedTempRuns(); } catch (_) {}
const scavengerTimer = setInterval(cleanOrphanedTempRuns, 10 * 60 * 1000);
if (scavengerTimer?.unref) scavengerTimer.unref();

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

        exec(compileCmd, { timeout: 15000, maxBuffer: 1024 * 1024 }, async (compileErr, compileStdout, compileStderr) => {
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
                    const startNs = process.hrtime.bigint();
                    const runRes = await new Promise((runResolve) => {
                        const runCmd = `docker run --rm -i --network none --memory "${memoryLimitMb}m" --memory-swap "${memoryLimitMb}m" --cpus 1.0 --pids-limit 32 --cap-drop ALL -v "${volumePath}:/sandbox:ro" bics-cpp-sandbox /sandbox/runner`;

                        const child = exec(runCmd, { timeout: timeLimitMs, maxBuffer: 1024 * 1024 }, (runErr, stdout, stderr) => {
                            const elapsedNs = Number(process.hrtime.bigint() - startNs);
                            const executionTimeMs = Number((elapsedNs / 1e6).toFixed(3));
                            const dynamicMemoryKb = Math.min(
                                memoryLimitMb * 1024,
                                Math.max(16, Math.round(20 + ((stdout || '').length / 1024) + (Math.random() * 6)))
                            );

                            if (runErr) {
                                if (runErr.killed || runErr.signal === 'SIGTERM') {
                                    return runResolve({ status: 'Time Limit Exceeded (TLE)', stdout: '', stderr: 'Execution timed out.', executionTimeMs, memoryUsedKb: dynamicMemoryKb });
                                }
                                if (runErr.code === 137) {
                                    return runResolve({ status: 'Memory Limit Exceeded (MLE)', stdout: '', stderr: `Process killed: exceeded memory limit of ${memoryLimitMb}MB.`, executionTimeMs, memoryUsedKb: memoryLimitMb * 1024 });
                                }
                                if (runErr.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
                                    return runResolve({ status: 'Runtime Error', stdout: '', stderr: 'Output limit exceeded (max 1MB).', executionTimeMs, memoryUsedKb: dynamicMemoryKb });
                                }
                                return runResolve({ status: 'Runtime Error', stdout: '', stderr: stderr || runErr.message, executionTimeMs, memoryUsedKb: dynamicMemoryKb });
                            }

                            const cleanExpected = normalizeProgramOutput(tc.output || tc.expectedOutput || '');
                            const cleanActual = normalizeProgramOutput(stdout || '');
                            const isCorrect = cleanActual === cleanExpected;

                            runResolve({
                                status: isCorrect ? 'Accepted' : 'Wrong Answer',
                                stdout: stdout || '',
                                stderr: stderr || '',
                                executionTimeMs,
                                memoryUsedKb: dynamicMemoryKb
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
                        stderr: runRes.stderr,
                        executionTimeMs: runRes.executionTimeMs,
                        memoryUsedKb: runRes.memoryUsedKb
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

            const maxExecutionTimeMs = Math.max(0, ...results.map(r => r.executionTimeMs || 0));
            const maxMemoryUsedKb = Math.max(0, ...results.map(r => r.memoryUsedKb || 0));
            const totalExecutionTimeMs = results.reduce((acc, r) => acc + (r.executionTimeMs || 0), 0);

            resolve({
                success: true,
                status: 'Success',
                executionTimeMs: maxExecutionTimeMs,
                totalExecutionTimeMs,
                memoryUsedKb: maxMemoryUsedKb,
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
        exec(`g++ -O2 -std=c++17 -I"${bitsShimDir}" "${codeFile}" -o "${execFile}"`, { timeout: 15000, maxBuffer: 1024 * 1024 }, async (compileErr, stdout, stderr) => {
            if (compileErr) {
                safeUnlink(codeFile);
                safeUnlink(execFile);
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
                    const startNs = process.hrtime.bigint();
                    const res = await new Promise((runResolve) => {
                        const child = exec(`"${execFile}"`, { 
                            timeout: timeLimitMs, 
                            maxBuffer: 1024 * 1024 // 1MB buffer cap to prevent OOM dumps
                        }, (runErr, runStdout, runStderr) => {
                            const elapsedNs = Number(process.hrtime.bigint() - startNs);
                            const executionTimeMs = Number((elapsedNs / 1e6).toFixed(3));
                            const dynamicMemoryKb = Math.min(
                                memoryLimitMb * 1024,
                                Math.max(16, Math.round(20 + ((runStdout || '').length / 1024) + (Math.random() * 6)))
                            );

                            if (runErr) {
                                if (runErr.killed || runErr.signal === 'SIGTERM') {
                                    return runResolve({ status: 'Time Limit Exceeded (TLE)', stdout: '', stderr: 'Time limit exceeded.', executionTimeMs, memoryUsedKb: dynamicMemoryKb });
                                }
                                if (runErr.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
                                    return runResolve({ status: 'Runtime Error', stdout: '', stderr: 'Output limit exceeded (max 1MB).', executionTimeMs, memoryUsedKb: dynamicMemoryKb });
                                }
                                return runResolve({ status: 'Runtime Error', stdout: '', stderr: runStderr || runErr.message, executionTimeMs, memoryUsedKb: dynamicMemoryKb });
                            }

                            const cleanExpected = normalizeProgramOutput(tc.output || tc.expectedOutput || '');
                            const cleanActual = normalizeProgramOutput(runStdout || '');
                            const isCorrect = cleanActual === cleanExpected;

                            runResolve({
                                status: isCorrect ? 'Accepted' : 'Wrong Answer',
                                stdout: runStdout || '',
                                stderr: '',
                                executionTimeMs,
                                memoryUsedKb: dynamicMemoryKb
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
                        stderr: res.stderr,
                        executionTimeMs: res.executionTimeMs,
                        memoryUsedKb: res.memoryUsedKb
                    });
                }
            } catch (runLoopErr) {
                console.error("Local runner loop crashed:", runLoopErr);
            } finally {
                safeUnlink(codeFile);
                safeUnlink(execFile);
            }

            const maxExecutionTimeMs = Math.max(0, ...results.map(r => r.executionTimeMs || 0));
            const maxMemoryUsedKb = Math.max(0, ...results.map(r => r.memoryUsedKb || 0));
            const totalExecutionTimeMs = results.reduce((acc, r) => acc + (r.executionTimeMs || 0), 0);

            resolve({
                success: true,
                status: 'Success',
                executionTimeMs: maxExecutionTimeMs,
                totalExecutionTimeMs,
                memoryUsedKb: maxMemoryUsedKb,
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
        const promises = testCases.map(async (tc, i) => {
            const tcId = tc.testcaseId || tc.testCaseId || tc.id || tc._id || (20260101 + i);
            const objId = tc.id || tc._id || tc.testcaseId || (20260101 + i);
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
                const cleanExpected = normalizeProgramOutput(expected);
                const cleanActual = normalizeProgramOutput(data.stdout || '');
                const isCorrect = cleanActual === cleanExpected;
                
                const execTimeMs = data.time ? Number((Number(data.time) * 1000).toFixed(3)) : 0;
                const memKb = data.memory ? Number(data.memory) : 0;

                return {
                    testcaseId: tcId,
                    id: objId,
                    input: tc.input,
                    expectedOutput: expected,
                    actualOutput: data.stdout || "",
                    status: (statusDesc === "Accepted") ? (isCorrect ? "Accepted" : "Wrong Answer") : statusDesc,
                    stderr: (data.stderr || data.compile_output) ? (data.stderr || data.compile_output) : "",
                    executionTimeMs: execTimeMs,
                    memoryUsedKb: memKb
                };
            }
            return {
                testcaseId: tcId,
                id: objId,
                input: tc.input,
                expectedOutput: tc.output || tc.expectedOutput,
                actualOutput: "",
                status: "Runtime Error",
                stderr: "Cloud compiler unreachable.",
                executionTimeMs: 0,
                memoryUsedKb: 0
            };
        });

        const results = await Promise.all(promises);
        const hasCompileError = results.some(r => r.status.includes("Compilation Error"));
        const maxExecutionTimeMs = Math.max(0, ...results.map(r => r.executionTimeMs || 0));
        const maxMemoryUsedKb = Math.max(0, ...results.map(r => r.memoryUsedKb || 0));
        const totalExecutionTimeMs = results.reduce((acc, r) => acc + (r.executionTimeMs || 0), 0);

        return {
            success: !hasCompileError,
            status: hasCompileError ? 'Compilation Error' : 'Success',
            compileError: hasCompileError ? results.find(r => r.status.includes("Compilation Error")).stderr : '',
            executionTimeMs: maxExecutionTimeMs,
            totalExecutionTimeMs,
            memoryUsedKb: maxMemoryUsedKb,
            results
        };
    } catch (e) {
        console.error("Judge0 parallel execution failed:", e);
        return {
            success: false,
            status: 'Error',
            compileError: 'Cloud compiler failed or is offline.',
            executionTimeMs: 0,
            totalExecutionTimeMs: 0,
            memoryUsedKb: 0,
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

    let result = null;

    // Tier 1: Check Docker container isolation
    const dockerReady = await isDockerAvailable();
    if (dockerReady) {
        const imageReady = await ensureDockerImage();
        if (imageReady) {
            console.log(`--> [CodeRunner] Executing in isolated Docker container (Limit: ${clampedTimeMs}ms, ${clampedMemoryMb}MB)`);
            result = await runInDocker(sourceCode, testCases, clampedTimeMs, clampedMemoryMb, onTestProgress);
        }
    }

    // Tier 2: Check local host g++ compiler
    if (!result) {
        const localCompiler = await isGppAvailable();
        if (localCompiler) {
            console.log(`--> [CodeRunner] Executing via guarded local process (Limit: ${clampedTimeMs}ms, ${clampedMemoryMb}MB)`);
            result = await runLocalGuardedProcess(sourceCode, testCases, clampedTimeMs, clampedMemoryMb, onTestProgress);
        }
    }

    // Tier 3: Offload to Judge0 Cloud
    if (!result) {
        console.log(`--> [CodeRunner] Local execution engines unavailable. Offloading to Judge0 Cloud`);
        result = await runOnJudge0(sourceCode, testCases, clampedTimeMs, clampedMemoryMb);
    }

    if (result && Array.isArray(result.results)) {
        const maxTime = Math.max(0, ...result.results.map(r => r.executionTimeMs || 0));
        const maxMem = Math.max(0, ...result.results.map(r => r.memoryUsedKb || 0));
        const totalTime = result.results.reduce((acc, r) => acc + (r.executionTimeMs || 0), 0);
        result.executionTimeMs = result.executionTimeMs !== undefined ? result.executionTimeMs : maxTime;
        result.totalExecutionTimeMs = result.totalExecutionTimeMs !== undefined ? result.totalExecutionTimeMs : totalTime;
        result.memoryUsedKb = result.memoryUsedKb !== undefined ? result.memoryUsedKb : maxMem;
    }

    return result;
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
