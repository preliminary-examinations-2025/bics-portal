# OT Terminal Workflow: Issues & Improvements to Address

This document records the specific issues, breakpoints, vulnerabilities, and false-positive traps in the **OT (Online Testing) Terminal** and backend workflow identified during architectural audits that have been marked for remediation.

---

## Summary of Tracked Items

| ID | Domain | Issue Description | Priority |
| :---: | :--- | :--- | :---: |
| **B1** | **Data Leak / Integrity** | Hidden Test Cases & Expected Outputs Leaked to Client via `GET /api/tests/:id` | **Critical** |
| **B3** | **Access Control / Auth** | Admin Endpoints Gated Only by Static Shared Secret (`'qwertty'`) Without Admin Session Auth | **Critical** |
| **2.1** | **Sandbox / Security** | Isolated C++ Sandbox Container with Dynamic Memory & CPU Time Limits | **High** |
| **B4** | **Proctoring Engine** | Proctoring Violation Counter Overwrite Guard on Final Submit | **High** |
| **B5** | **Security / Encryption** | Hardcoded EIRF Backup Encryption Key & Salt in Client JavaScript | **High** |
| **3.3** | **Proctoring Engine** | Keyboard Typing & Ambient Taps Mistaken for "High Voice Detected" | **High (Definite)** |
| **3** | **State / UX** | Silent Code & Answer Loss When Switching Questions Without "Save & Next" | **High** |
| **3.1** | **Proctoring Engine** | "Double-Warning" Auto-Submit Cascade (Simultaneous Fullscreen Exit + Blur) | **High** |
| **2.4** | **Submission Lifecycle** | Instant Auto-Submit on Browser Close, Browser Crash, or OS Crash (Prevent Hanging `'started'` State) | **High** |
| **2.2** | **Security / Sandbox** | Web Preview Sandbox Main-Thread Freezing on Infinite Loops / Heavy Scripts | **Medium-High** |
| **B6** | **UX / Anti-Cheating** | Drag-and-Drop Lockdown Bypass & Explicit Copy-Paste Prohibition Warning Banner | **Medium** |
| **3.2** | **Proctoring Engine** | Widescreen Monitor Yaw False Positives (Strict 0.25 Head Turn Cutoff) | **Medium** |
| **2.3** | **Backend Security** | Client-Only Authoritative Exam Timer (Missing Server-Side Submission Deadline Validation) | **Medium** |

---

## Detailed Issue Breakdown & Remediation Blueprint

### 1. Item B1: Hidden Test Cases & Expected Outputs Leaked to Client
* **Files:** [`backend/routes/tests.js` (lines 257–264)](file:///C:/Users/Bubere/.gemini/antigravity/scratch/bics_website/backend/routes/tests.js#L257-L264), [`frontend_ot/src/components/exam/QuestionViewer.jsx` (lines 188–196)](file:///C:/Users/Bubere/.gemini/antigravity/scratch/bics_website/frontend_ot/src/components/exam/QuestionViewer.jsx#L188-L196)
* **Problem:**
  * When `GET /api/tests/:id` prepares the sanitized question paper for the candidate, it strips `correctOptionIndex` for MCQs but returns the entire `testCases` array intact for coding questions.
  * Every single test case—including hidden boundary test cases—is transmitted in plain JSON to the browser with both its raw `input` and expected `output`.
  * The frontend simply uses `slice(0, 2)` to visually render only the first two sample test cases in the table, giving the illusion of hidden test cases while exposing the entire evaluation suite in memory and DevTools.
  * Candidates inspecting network responses or React state can view all hidden inputs and expected outputs, allowing them to trivially hardcode conditionals (`if (input == X) cout << Y;`) to achieve 100% scores without solving the problem.
* **Proposed Remediation:**
  * **Strict Server-Side Projection Filter:** In `GET /api/tests/:id` and `POST /api/tests/verify-token`, project test cases to only include those flagged with `isSample: true`:
    ```javascript
    testCases: (q.testCases || [])
      .filter(tc => tc.isSample)
      .map(tc => ({ input: tc.input, output: tc.output, isSample: true, points: tc.points }))
    ```
  * **Authoritative Hidden Test Cases:** The full test suite (including hidden test cases) must remain strictly on the server and never be sent to the client.

---

### 2. Item B3: Admin Endpoints Gated Only by Static Shared Secret
* **Files:** [`backend/routes/adminTests.js`](file:///C:/Users/Bubere/.gemini/antigravity/scratch/bics_website/backend/routes/adminTests.js), [`backend/middleware/auth.js`](file:///C:/Users/Bubere/.gemini/antigravity/scratch/bics_website/backend/middleware/auth.js), [`frontend_ot/src/App.jsx`](file:///C:/Users/Bubere/.gemini/antigravity/scratch/bics_website/frontend_ot/src/App.jsx)
* **Problem:**
  * Admin endpoints under `/api/admin/*` do not check for an authenticated admin session or JWT. They rely solely on `authorizeApiRequest`, which matches `req.query.apiSecret` against `API_ACCESS_SECRET`.
  * Because the secret (`'qwertty'`) is hardcoded in frontend bundles, any student can make direct GET/POST requests:
    `GET http://localhost:5000/api/admin/tests?apiSecret=qwertty`
    and retrieve the master list of all configured exams, complete with MCQ answer keys (`correctOptionIndex`) and full problem solutions.
  * Restricting requests based on the `Origin` header alone is insufficient because:
    1. Non-browser tools (`curl`, Python, Postman) can spoof the `Origin` header.
    2. A candidate executing `fetch('/api/admin/tests')` in browser DevTools originates from the allowed portal domain itself.
* **Proposed Remediation:**
  * **Separate Admin Authentication Middleware:**
    - Gating `/api/admin/*` must require an authenticated admin JWT (`ADMIN_JWT`) or session cookie issued exclusively by `POST /api/login`.
    - Reject all admin routes if `req.user?.role !== 'admin'`, regardless of whether the shared `apiSecret` is present.

---

### 3. Item 2.1: Isolated C++ Sandbox Container with Dynamic Memory & CPU Time Limits
* **Files:** [`backend/utils/codeRunner.js`](file:///C:/Users/Bubere/.gemini/antigravity/scratch/bics_website/backend/utils/codeRunner.js), [`backend/models/TestConfig.js`](file:///C:/Users/Bubere/.gemini/antigravity/scratch/bics_website/backend/models/TestConfig.js), [`backend/routes/tests.js`](file:///C:/Users/Bubere/.gemini/antigravity/scratch/bics_website/backend/routes/tests.js), [`frontend/src/pages/admin/AdminTests.jsx`](file:///C:/Users/Bubere/.gemini/antigravity/scratch/bics_website/frontend/src/pages/admin/AdminTests.jsx), [`frontend_ot/src/components/exam/CodeEditor.jsx`](file:///C:/Users/Bubere/.gemini/antigravity/scratch/bics_website/frontend_ot/src/components/exam/CodeEditor.jsx)
* **Problem:**
  * Currently, `executeCode` runs directly on the host machine using Node's `child_process.exec` (compiling to native `.exe` on Windows or `.out` on Linux) with full OS user privileges.
  * Security relies strictly on a static regular expression blacklist (`isSafeCode`), which fails to catch C library file I/O (`fopen`, `remove`, `unlink`), Windows API calls (`WinExec`, `CreateProcess`), process replacement (`execl`, `execvp`), assembly blocks (`asm("...")`), or multithreaded resource exhaustion (`std::thread`).
  * Execution timeout is hardcoded to a static `2000ms`, and there is **no memory limit enforcement** (unconstrained RAM). A student allocating multi-gigabyte arrays can crash the backend via Out-Of-Memory (OOM).
* **Proposed Remediation:**
  * **Ephemeral Container Sandbox:** Execute code inside a transient, unprivileged container per run:
    ```bash
    docker run --rm -i \
      --network none \
      --memory "${memoryLimitMb}m" \
      --memory-swap "${memoryLimitMb}m" \
      --cpus 1.0 \
      --pids-limit 64 \
      --read-only \
      --cap-drop ALL \
      --volume "${tempDir}:/sandbox:ro" \
      bics-cpp-sandbox /sandbox/runner
    ```
  * **Dynamic Limits:** Add configurable `timeLimitMs` (200–10000ms) and `memoryLimitMb` (16–512MB) per question in `TestConfig.js` and expose them in the Admin Test Builder.
  * **Standardized Competitive Verdicts:** Differentiate and report `Accepted`, `Wrong Answer`, `Time Limit Exceeded (TLE)`, `Memory Limit Exceeded (MLE)`, and `Runtime Error (RTE)`.

---

### 4. Item B4: Proctoring Violation Counter Overwrite Guard
* **Files:** [`backend/routes/tests.js` (lines 568–574)](file:///C:/Users/Bubere/.gemini/antigravity/scratch/bics_website/backend/routes/tests.js#L568-L574)
* **Problem:**
  * In `POST /api/tests/submit`, the backend updates proctoring totals directly from the client payload:
    ```javascript
    submission.proctoringLog.fullscreenExits = proctoringLog.fullscreenExits !== undefined ? proctoringLog.fullscreenExits : submission.proctoringLog.fullscreenExits;
    submission.proctoringLog.tabSwitches = proctoringLog.tabSwitches !== undefined ? proctoringLog.tabSwitches : submission.proctoringLog.tabSwitches;
    ```
  * If a candidate triggers 5 fullscreen exits and 4 tab switches during the exam, they can edit the final submission request in DevTools to send zeroes, wiping their infractions clean.
* **Proposed Remediation:**
  * **Monotonic High-Water Mark:** The backend must never allow a client request to decrease accumulated violation counters:
    ```javascript
    submission.proctoringLog.fullscreenExits = Math.max(
      submission.proctoringLog.fullscreenExits || 0,
      Number(proctoringLog.fullscreenExits || 0)
    );
    submission.proctoringLog.tabSwitches = Math.max(
      submission.proctoringLog.tabSwitches || 0,
      Number(proctoringLog.tabSwitches || 0)
    );
    ```
  * **Server-Authoritative Event Log:** Total violations should be validated against the persisted events array logged in real time.

---

### 5. Item B5: Hardcoded EIRF Backup Encryption Key & Salt
* **Files:** [`frontend_ot/src/App.jsx` (lines 2221–2225)](file:///C:/Users/Bubere/.gemini/antigravity/scratch/bics_website/frontend_ot/src/App.jsx#L2221-L2225)
* **Problem:**
  * When client-side `.eirf` backup files are generated, the encryption key and salt are static strings in client code:
    ```javascript
    const secret = 'bics_secret_key_2026';
    const saltStr = 'bics_salt_2026';
    const passphrase = String(submissionId) + secret + String(studentId);
    ```
  * Anyone can decrypt an `.eirf` file, alter the answers to 100% correct, reset proctoring warnings to zero, re-encrypt it using the known passphrase, and upload it during EIRF review.
  * In addition, `localStorage.getItem("bics_pending_submit_" + subId)` stores unencrypted raw JSON that can be modified before reconnect auto-sync.
* **Proposed Remediation:**
  * **Server-Side Asymmetric Encryption (RSA-OAEP):**
    - The client should encrypt emergency backup payloads using a public key bundled with the application.
    - Only the backend holds the private key required for decryption.
    - An attacker with full access to frontend code cannot decrypt or forge a modified `.eirf` file because they lack the server's private key.

---

### 6. Item B6: Drag-and-Drop Lockdown Bypass & Explicit Copy-Paste Warning Banner
* **Files:** [`frontend_ot/src/components/exam/CodeEditor.jsx` (lines 47–79)](file:///C:/Users/Bubere/.gemini/antigravity/scratch/bics_website/frontend_ot/src/components/exam/CodeEditor.jsx#L47-L79), [`frontend_ot/src/App.jsx`](file:///C:/Users/Bubere/.gemini/antigravity/scratch/bics_website/frontend_ot/src/App.jsx)
* **Problem:**
  * The copy-paste lock intercepts `Ctrl+C/V/X`, `Shift+Insert`, and clipboard events (`copy`, `paste`, `cut`), but does not intercept **Drag-and-Drop** (`dragover`, `drop`) into the Monaco container. A candidate can drag text from another window or text file directly into the editor.
  * When a candidate accidentally or intentionally attempts to paste, there is no immediate user-facing feedback explaining that the action is blocked.
* **Proposed Remediation:**
  * **Drop Event Interception:** Add listeners to `domNode` in `handleEditorMount`:
    ```javascript
    ['dragover', 'drop'].forEach(evt => {
      domNode.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClipboardAttempt?.('drop');
      }, true);
    });
    ```
  * **User Notification Banner/Modal:** When `onClipboardAttempt` fires, immediately display a prominent non-intrusive warning banner or toast:
    > **Action Blocked**: Copy-pasting and dragging external text are strictly prohibited during the active examination environment. This attempt has been logged.

---

### 7. Item 3.3: Keyboard Typing Flags "High Voice Detected" False Positives
* **Files:** [`frontend_ot/src/App.jsx` (lines 1555–1640)](file:///C:/Users/Bubere/.gemini/antigravity/scratch/bics_website/frontend_ot/src/App.jsx#L1555-L1640)
* **Problem:** Broadband RMS threshold (`currentDb >= 45 dB` or `rms >= 0.08`) trips on mechanical keyboard typing and trackpad clicks within ~800ms.
* **Proposed Remediation:** Vocal bandpass isolation (300 Hz–3000 Hz), crest factor impulse rejection, and require sustained speech for $\ge 2.0$ seconds.

---

### 8. Item 3: Silent Code & Answer Loss When Switching Questions
* **Files:** [`frontend_ot/src/App.jsx` (lines 1887–1930)](file:///C:/Users/Bubere/.gemini/antigravity/scratch/bics_website/frontend_ot/src/App.jsx#L1887-L1930), [`frontend_ot/src/components/exam/CodeEditor.jsx` (lines 276–279)](file:///C:/Users/Bubere/.gemini/antigravity/scratch/bics_website/frontend_ot/src/components/exam/CodeEditor.jsx#L276-L279)
* **Problem:** Switching questions via the palette without clicking "Save & Next" reloads stale `examAnswers` and wipes unsaved Monaco code.
* **Proposed Remediation:** Auto-commit active drafts (`draftCode`, `draftHtml`, etc.) into `examAnswers[prevIndex]` immediately upon question index change.

---

### 9. Item 3.1: The "Double-Warning" Auto-Submit Cascade
* **Files:** [`frontend_ot/src/App.jsx` (lines 1125–1200)](file:///C:/Users/Bubere/.gemini/antigravity/scratch/bics_website/frontend_ot/src/App.jsx#L1125-L1200)
* **Problem:** Exiting fullscreen triggers both `fullscreenchange` and `window.blur`, taking 2 of 3 warnings simultaneously.
* **Proposed Remediation:** Open a 600ms deduplication window to merge simultaneous focus and fullscreen events into a single incident.

---

### 10. Item 2.4: Instant Auto-Submission on Browser Close, Browser Crash, or OS Crash
* **Files:** [`frontend_ot/src/App.jsx`](file:///C:/Users/Bubere/.gemini/antigravity/scratch/bics_website/frontend_ot/src/App.jsx), [`backend/routes/tests.js`](file:///C:/Users/Bubere/.gemini/antigravity/scratch/bics_website/backend/routes/tests.js), [`backend/models/TestSubmission.js`](file:///C:/Users/Bubere/.gemini/antigravity/scratch/bics_website/backend/models/TestSubmission.js)
* **Problem:** Closed tabs, browser crashes, or power trips leave submissions stranded indefinitely in `'started'`.
* **Proposed Remediation:** Dual-layer defense: (1) `navigator.sendBeacon` on `pagehide`/`beforeunload`, and (2) server-side dead-man's switch heartbeat with background reaper auto-finalizing sessions idle $> 45$s.

---

### 11. Item 2.2: Web Preview Sandbox Main-Thread Freezing (Infinite Loops)
* **Files:** [`frontend_ot/src/components/exam/CodeEditor.jsx` (lines 576–655)](file:///C:/Users/Bubere/.gemini/antigravity/scratch/bics_website/frontend_ot/src/components/exam/CodeEditor.jsx#L576-L655), [`frontend_ot/src/App.jsx`](file:///C:/Users/Bubere/.gemini/antigravity/scratch/bics_website/frontend_ot/src/App.jsx)
* **Problem:** Candidate JavaScript runs on the main browser thread inside the preview `iframe`; an infinite loop freezes the terminal.
* **Proposed Remediation:** Pre-parse JavaScript with a loop-breaker AST/regex transform (2-second execution timeout guard).

---

### 12. Item 3.2: Widescreen Monitor Yaw / Head Turn False Positives
* **Files:** [`frontend_ot/src/App.jsx` (lines 1476–1488)](file:///C:/Users/Bubere/.gemini/antigravity/scratch/bics_website/frontend_ot/src/App.jsx#L1476-L1488)
* **Problem:** Strict `0.25` yaw ratio repeatedly flags candidates reading wide monitors.
* **Proposed Remediation:** Recalibrate threshold to `0.35`–`0.38` and increase sustained dwell time to $\ge 4.0$ seconds.

---

### 13. Item 2.3: Server-Side Authoritative Exam Duration Validation
* **Files:** [`backend/routes/tests.js` (line 540 in `POST /submit`)](file:///C:/Users/Bubere/.gemini/antigravity/scratch/bics_website/backend/routes/tests.js#L540), [`frontend_ot/src/App.jsx`](file:///C:/Users/Bubere/.gemini/antigravity/scratch/bics_website/frontend_ot/src/App.jsx)
* **Problem:** Countdown timer is client-authoritative; backend `/submit` does not validate elapsed wall-clock time.
* **Proposed Remediation:** Validate `Date.now() - submission.startedAt <= test.duration + gracePeriod` on `POST /submit`.

---

## Operational Procedures & Non-Issue Confirmations
* **Point 1 (Token deleted immediately on verify):** User policy: If a candidate refreshes before starting (no submission created), they return to the main dashboard to generate a fresh token. Entering is blocked once a submission exists.
* **Point 2 (Re-attempt after in-progress crash):** Operational workflow: Instructor manually verifies the issue and deletes the submission directly from MongoDB Atlas; candidate then generates a new token from the dashboard.
* **Point B2 (Preliminary scoring on submission):** Accepted by design. Client-submitted test results serve only as a preliminary/transient state to eliminate submission latency; authoritative grading is conducted at the instructor's discretion on the admin side where test cases can be updated and re-evaluated server-side.
* **Point 4 (Client-side crash recovery):** Handled via administrative EIRF review or submission deletion as per instructor policy.
* **Point 3.4 (File downloads):** Verified no mid-exam downloads currently exist in the active test environment.
