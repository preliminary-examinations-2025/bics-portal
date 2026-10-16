# BICS System Context & Engineering Architecture

> **Document Purpose**: Authoritative, persistent system context, security model, component topography, and change history for the BICS Examination & Coursework Portal. Maintained continuously across developer and AI agent pairing sessions.

---

## 1. System Topography & Component Overview

The BICS ecosystem is composed of three core applications operating in concert:

| Application | Path | Tech Stack | Role / Purpose |
| :--- | :--- | :--- | :--- |
| **Backend API Server** | `backend/` | Node.js, Express, MongoDB Atlas (Mongoose), JWT, bcryptjs | Central authoritative REST API, authentication engine, proctoring telemetry aggregator, and exam evaluation orchestrator. |
| **Main Portal Frontend** | `frontend/` | React, Vite, TailwindCSS, Lucide Icons | Student dashboard, registration forms, coursework player, marks ledger, and administrative management interface. |
| **OT Exam Terminal** | `frontend_ot/` | React, Vite, Monaco Editor, Proctoring Engine | Dedicated, high-security candidate examination kiosk. Enforces fullscreen, webcam monitoring, tab-switch detection, and code submission. |

---

## 2. Security & Authentication Architecture

### 2.1 Complete Elimination of Hardcoded Shared Secrets
- **Previous State**: A static secret (`API_ACCESS_SECRET = 'qwertty'`) was hardcoded in frontend bundles and attached to every API request via URL query parameter (`?apiSecret=qwertty`).
- **Current State**:
  - Completely purged `'qwertty'` fallback from `frontend/src/api/client.js`, `frontend_ot/src/api/client.js`, and `frontend_ot/src/App.jsx`.
  - Removed `VITE_API_ACCESS_SECRET` from `.env` files.
  - All communication uses standard HTTP `Authorization: Bearer <token>` headers.

### 2.2 Server-Side Token Hierarchy & Lifespans
Authentication is cryptographically signed using `jsonwebtoken` with `JWT_SECRET`:
- **Admin JWT (`ADMIN_JWT`)**:
  - Issued exclusively on `/api/login` when credentials match `ADMIN_USER` and `ADMIN_PASS`.
  - Claim payload: `{ id: 'admin', role: 'admin', username: 'admin' }`.
  - Expiration: **12 hours** (tailored for exam administration shifts).
- **Student JWT (`STUDENT_JWT`)**:
  - Issued on `/api/login` upon verifying candidate username and bcrypt password hash.
  - Claim payload: `{ id: candidate._id, studentId: candidate.studentId, role: 'student', username: candidate.username }`.
  - Expiration:
    - **7 Days** if the student checked **"Remember me for 7 days"** (`rememberMe: true`).
    - **24 Hours** if `rememberMe` was left unchecked (`rememberMe: false`).
- **Exam Token (`EXAM_TOKEN`)**:
  - Ephemeral, single-use, **2-minute** random token generated via `POST /api/tests/generate-token` and consumed by `POST /api/tests/verify-token` when launching the OT exam kiosk.

### 2.3 Authoritative Admin Perimeter Defense (`/api/admin/*`)
Mounted in `backend/server.js`:
```javascript
app.use('/api/admin', authenticateToken, requireAdmin);
```
- Completely gates every admin endpoint (`/api/admin/tests`, `/api/admin/recycle-bin`, `/api/admin/marks-ledger`, `/api/admin/db`, `/api/admin/register-candidate`, `/api/admin/counterfoils`, etc.).
- Query secrets (`?apiSecret=...`) are explicitly rejected for admin routes.
- Student tokens attempting admin routes are blocked with HTTP `403 Forbidden`.

### 2.4 NoSQL Query Injection Neutralization
- In `backend/routes/auth.js`, strict primitive string validation is enforced on `username` and `password`.
- Payloads containing MongoDB query operators (e.g. `{"password": {"$ne": ""}}`) are rejected immediately with HTTP `400 Bad Request`.

### 2.5 Salted Password Hashing & Zero-Downtime Migration
- Utility: `backend/utils/password.js` using `bcryptjs` (`SALT_ROUNDS = 10`).
- **Zero-Downtime Migration**: Existing candidate accounts with legacy plaintext passwords (`password123`) authenticate via timing-safe string comparison and are automatically upgraded to salted bcrypt hashes in MongoDB/db.json upon their next login.
- New candidates registered via `/api/admin/register-candidate` are hashed before insertion.

### 2.6 Data Redaction & Candidate Isolation (IDOR Mitigation)
- **Credential Redaction**:
  - `backend/models/Candidate.js`: `toJSON` and `toObject` schema transforms delete `password` and `verificationCode`.
  - `backend/routes/candidates.js`: `sanitizeCandidate()` unconditionally strips sensitive fields; `/candidate/verify-code/:id` returns sanitized student documents.
  - `backend/routes/adminDbViewer.js`: Automatically masks candidate passwords as `[PROTECTED HASH]`.
- **IDOR Protection**:
  - `/api/tests/submitted`, `/api/tests/start/:id`, `/api/tests/generate-token`, and `/api/student/lecture-progress` enforce candidate identity. Students attempting to access another candidate's submissions or progress receive HTTP `403 Forbidden`.

---

## 3. BICS ObjId Architecture (Fully Implemented)

### 3.1 Overview
To completely eliminate exposing internal MongoDB metadata (creation timestamps, machine IDs, sequential document counters) in public URLs, BICS implements format-preserving encrypted identifiers across the entire database:
- **Format**: `xxxxxx-xxxx-xxxx-xxxxxx` (6-4-4-6 alphanumeric string using lowercase letters and digits `[a-z0-9]`).
- **Algorithm**: 6-round balanced Feistel cipher on the 96-bit Mongo ObjectId with an HMAC-SHA256 round function, followed by Base36 encoding and an appended tamper-detection checksum character.
- **Bi-directional & Collision-Free**: Converts any Mongo ObjectId to a BICS ObjId and reverses it with zero database queries, zero database schema changes, and mathematical zero-collision guarantees.

### 3.2 Global Middleware & Universal Coverage
- **Incoming Requests (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`)**:
  - `bicsIdMiddleware` (`backend/middleware/bicsIdMiddleware.js`) intercepts `req.params`, `req.query`, and `req.body`.
  - Dynamic setter on `req.params` deobfuscates any route parameter (`:id`, `:candidateId`, `:testId`, `:submissionId`, `:ticketId`, `:lectureId`, etc.) from BICS ObjId to the internal 24-character hexadecimal Mongo ObjectId.
  - Recursively decrypts any BICS ObjId in query strings and JSON request payloads before route handlers execute.
  - Legacy 24-hex Mongo ObjectIds continue to be accepted cleanly for backwards compatibility.
- **Outgoing Responses (`res.json` and `res.send`)**:
  - Intercepted globally by `bicsIdMiddleware`.
  - Universal recursive traversal automatically obfuscates all ObjectId instances and 24-hex Mongo ObjectIds across all document keys (`_id`, `candidateId`, `testId`, `submissionId`, `ticketId`, `lectureId`, `linkedOnlineTestId`, etc.) into BICS ObjIds before leaving the server.
  - Preserves date formats, buffers, arrays, and Mongoose schema redaction transforms (`toJSON`/`toObject`).
- **Query Filter Resolvers**:
  - `buildCandidateQueryFilter` (`backend/config/constants.js`) and `findTestConfig` (`backend/routes/adminTests.js`) automatically resolve BICS ObjIds.
- **Test Coverage**:
  - `backend/tests/bics_objid_full_suite.test.js` tests bijection, tamper resistance, format integrity, and live test APIs (100% pass rate).
  - `backend/tests/bics_objid_crud_suite.test.js` tests live end-to-end CRUD across candidates, helpdesk tickets, and admin resolution (100% pass rate).

---

## 4. Installed Developer & Agent Skills

Installed under `.agents/skills/` for autonomous execution:
1. **`roocode`**: Multi-mode architecture (Architect, Code, Debug, Test, Ask) and Memory Bank state maintenance.
2. **`gsd`**: Goal-backward project management (roadmapping, phase planning, atomic execution, verification).
3. **`ralph` & `ralph-loop-workflow`**: Autonomous developer iteration loop (`/ralph`) with self-contained preflight and build verification.
4. **`code-review` & `autofix`**: CodeRabbit static analysis, security review, and instant patch generation.

---

## 5. Verification & Test Suite Status

The automated penetration suite at `backend/tests/security_auth_audit.test.js` tests all core invariants:
- **T-01**: Unauthenticated request to `/api/admin/tests` -> `401 Unauthorized` (PASS)
- **T-02**: Shared secret spoofing on admin endpoints -> `401 Unauthorized` (PASS)
- **T-03**: Student token attempting `/api/admin/tests` -> `403 Forbidden` (PASS)
- **T-04**: NoSQL injection on `/api/login` (`{"$ne": ""}`) -> `400 Bad Request` (PASS)
- **T-05**: Student IDOR attempt on another candidate's submissions -> `403 Forbidden` (PASS)
- **T-06**: Database Viewer password masking -> `[PROTECTED HASH]` (PASS)
- **T-07**: Legitimate Admin login & full CRUD operations -> `200 OK` (PASS)
- **T-08**: Legitimate Student login & transparent bcrypt migration -> `200 OK` (PASS)
- **BICS ObjId Bi-directional Crypto Suite** (`backend/tests/bics_objid_full_suite.test.js`): All 6 tests PASSED (100%).
- **BICS ObjId Cross-Domain CRUD Suite** (`backend/tests/bics_objid_crud_suite.test.js`): All 10 tests across Candidates, Helpdesk Tickets, Submissions, and Admin Resolution PASSED (100%).
- **Production Builds**: `frontend` and `frontend_ot` compile with 0 errors.

---

## 6. Production Environment Variables Reference

### Backend (`backend/.env` / Host Environment)
- `NODE_ENV`: `production`
- `PORT`: `5000`
- `MONGO_URI`: Production MongoDB Atlas connection URI
- `JWT_SECRET`: 64-byte random hex string (`node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`)
- `JWT_EXPIRES_IN`: `12h` (Admin)
- `JWT_STUDENT_EXPIRES_IN`: `7d` (Student with rememberMe)
- `ADMIN_USER` & `ADMIN_PASS`: Administrator login credentials
- `GOOGLE_CLASSROOM_WEBHOOK_KEY`: Dedicated secret for Google Classroom Google Apps Script webhooks (transmitted via `x-api-secret` or `x-api-key` header)

### Frontends (`frontend/.env` and `frontend_ot/.env`)
- `VITE_API_BASE`: `https://api.yourdomain.com/api`
- `VITE_API_ACCESS_SECRET`: **Deleted**

---

## 7. External Integrations & Webhook Authentication

### 7.1 Google Classroom Webhook Security
- **Path**: `backend/routes/coursework.js` (`POST /api/webhooks/google-classroom/submission`)
- **Authentication**: Gated exclusively via constant-time comparison against `GOOGLE_CLASSROOM_WEBHOOK_KEY`.
- **Header Transmission**: Accepts secret in `x-api-secret` or `x-api-key` HTTP header. Rejects missing or invalid secrets with HTTP `401 Unauthorized`.
- **Client Script**: Deployed via Google Apps Script hourly trigger with cached student metadata and course mapping.

---

## 8. OT Terminal Security Architecture & Code Sandbox Engine

### 8.1 Server-Side Projection Filter for Hidden Test Cases (Item B1)
- **Vulnerability**: `GET /api/tests/:id` previously stripped MCQ answers but forwarded full `testCases` arrays to the client. The UI used `slice(0, 2)` to visually hide extra cases, allowing candidates to inspect DevTools and hardcode outputs.
- **Remediation**:
  - `sanitizeQuestionForCandidate(q)` in `backend/routes/tests.js` strictly filters test cases to only those with `isSample: true`.
  - Hidden boundary test cases remain exclusively on the server and are never sent over the network.
  - Applied across `GET /api/tests/:id` and `POST /api/tests/verify-token`.
  - Client UI in `frontend_ot/src/components/exam/QuestionViewer.jsx` renders all returned sample test cases cleanly.

### 8.2 Proctoring Violation Counter Overwrite Guard (Item B4)
- **Vulnerability**: Proctoring violation counts (`fullscreenExits`, `tabSwitches`, `clipboardAttempts`) were tracked on the client and submitted via `POST /api/tests/submit`, allowing candidates to tamper with the JSON payload to reset counters to 0.
- **Remediation**:
  - `reconcileProctoringLog(existingDbLog, incomingClientLog)` in `backend/routes/tests.js` enforces an authoritative monotonic high-water mark:
    $$\text{count} = \max(\text{existingDB}, \text{incomingClient}, \text{count}(\text{eventLog}))$$
  - Merges events without loss or duplication and guarantees violation tallies can never decrease.

### 8.3 Isolated C++ Sandbox Container & Dynamic Limits (Item 2.1)
- **Vulnerability**: Direct unconstrained execution via `child_process.exec` on host machine without memory limits, static 2000ms timeout, and weak regex blacklist.
- **Remediation**:
  - **Docker Container Sandbox**:
    - Container definition: `backend/sandbox/Dockerfile` (Alpine Linux 3.19 + `g++` + unprivileged user `sandboxuser`).
    - Executes transient, unprivileged containers with `--network none --memory "${mem}m" --memory-swap "${mem}m" --cpus 1.0 --pids-limit 32 --read-only --cap-drop ALL`.
    - Auto-detects Docker daemon availability via `isDockerAvailable()` with cached status.
  - **Guarded Local Process Fallback**:
    - Seamless fallback when Docker daemon is not active on host.
    - Expanded regex security blacklist (`isSafeCode`) blocking C file I/O (`fopen`, `remove`), process creation (`system`, `fork`, `exec*`, `WinExec`), inline assembly (`__asm`), multithreading (`std::thread`, `pthread`), and system headers (`<windows.h>`, `<unistd.h>`).
    - Standard output buffer cap (`maxBuffer: 1024 * 1024`) preventing OOM buffer dumps.
    - Safe file cleanup (`safeUnlink`) handling Windows file locks with deferred retry.
  - **Dynamic Limits**:
    - `timeLimitMs` (200 - 10000ms, default 2000ms) and `memoryLimitMb` (16 - 512MB, default 128MB) stored in `QuestionSchema` (`backend/models/TestConfig.js`).
    - Admin UI in `frontend/src/pages/admin/AdminTests.jsx` includes numeric inputs for configuring time and memory limits.
    - Student terminal in `frontend_ot/src/components/exam/QuestionViewer.jsx` displays execution limit badges (`⏱️ 2s`, `💾 128 MB`).
  - **Standardized Competitive Verdicts**:
    - `Accepted`, `Wrong Answer`, `Time Limit Exceeded (TLE)`, `Memory Limit Exceeded (MLE)`, `Runtime Error`, `Compilation Error`.
  - **Automated Verification**:
    - `backend/tests/ot_terminal_security.test.js` passes all tests verifying Item B1, Item B4, and Item 2.1.

### 8.4 Server-Side Asymmetric Encryption & LocalStorage Protection (Item B5)
- **Vulnerabilities**:
  - Emergency Incident Report Form (.eirf) backup files previously used symmetric PBKDF2 with hardcoded client strings (`secret = 'bics_secret_key_2026'`, `salt = 'bics_salt_2026'`), enabling anyone to decrypt, alter scores, and re-encrypt files.
  - Offline pending submissions (`bics_pending_submit_${subId}`) stored unencrypted raw JSON in `localStorage`.
- **Remediation**:
  - **Server-Side Asymmetric Encryption (RSA-2048-OAEP + AES-256-GCM)**:
    - Authoritative key manager `backend/utils/rsaKeyManager.js` manages 2048-bit RSA keypair (`backend/keys/eirf_private_key.pem` and `eirf_public_key.pem`). Added `backend/keys/` to `.gitignore`.
    - Public key endpoint `GET /api/test/eirf/public-key` exports server public key in PEM and DER formats.
    - `frontend_ot/src/utils/eirfCrypto.js` encrypts backups via hybrid envelope encryption: generates an ephemeral 256-bit AES-GCM key, encrypts payload data, and wraps the AES key using the server's RSA public key (`RSA-OAEP-2048/SHA-256`). Marked `version: '2.0-rsa-envelope'`.
    - Only the server holding the private key can decrypt or verify backups.
    - Decryption utility `backend/utils/cipher.js` verifies GCM authentication tags; tampered payloads fail verification. Plain unencrypted JSON files are strictly rejected in production.
  - **Client LocalStorage Encryption**:
    - `encryptPendingStorage` and `decryptPendingStorage` wrap offline pending submissions in AES-GCM using submission-derived salt before writing to `bics_pending_submit_${subId}`, neutralizing browser DevTools tampering.

### 8.5 Drag-and-Drop Lockdown & Action Blocked Toast Banner (Item B6)
- **Vulnerabilities**:
  - Copy-paste locks intercepted keyboard shortcuts and clipboard events, but candidates could drag and drop external text directly into Monaco editor containers.
  - Candidates lacked immediate user-facing feedback when actions were blocked.
- **Remediation**:
  - Explicit Monaco configuration `dragAndDrop: false` added to code and web studio editors in `frontend_ot/src/components/exam/CodeEditor.jsx`.
  - Added DOM event interception for `dragover`, `dragenter`, and `drop` across editor containers, `window`, and `document` in `CodeEditor.jsx` and `App.jsx`.
  - Immediate user-facing feedback via a persistent bottom-right toast notification displaying the exact required warning:
    > *"Action Blocked: Copy-pasting and dragging external text are strictly prohibited during the active examination environment. This attempt has been logged."*

### 8.6 Audio Crest Factor Impulse Rejection & False-Positive Elimination (Item 3.3)
- **Vulnerability**:
  - High voice detection previously tripped on mechanical keyboard clicks and trackpad taps within ~800ms due to broadband RMS thresholding.
- **Remediation**:
  - **Vocal Bandpass Isolation**: Dual `BiquadFilterNode` cascade (Highpass 300 Hz + Lowpass 3000 Hz) filters out low-frequency rumble and ultrasonic transient clicks, isolating human speech formants.
  - **Crest Factor Impulse Rejection**:
    - Time-domain Crest Factor ratio: $\text{CF} = \frac{\text{Peak Amplitude}}{\text{RMS}}$.
    - Mechanical keystrokes and clicks generate brief, high-energy transient spikes with $\text{CF} \ge 4.5$.
    - Continuous voiced human speech exhibits harmonic formants with moderate $\text{CF} \in [2.2, 3.8]$.
    - Keystrokes with $\text{CF} \ge 4.5$ are identified as mechanical impulses and rejected.
  - **Sustained Speech Gate**:
    - Requires $\ge 1.0\text{s}$ (10 consecutive 100ms frames) of continuous non-impulsive speech before raising a proctoring violation.

### 8.7 Zero-Loss Draft Auto-Commit on Question Navigation (Item 3)
- **Vulnerability**:
  - Candidates switching questions via the palette without clicking "Save & Next" lost unsaved Monaco code because switching questions immediately reloaded stale answers from `examAnswers`.
- **Remediation**:
  - Auto-commit hook in `frontend_ot/src/App.jsx` tracks `prevSelectedQuestionIndexRef` and active draft buffers (`draftCodeRef`, `draftMCQRef`, `draftLanguageRef`, `draftHtmlRef`, `draftCssRef`, `draftJsRef`).
  - Upon question index switch, active drafts are immediately committed into `examAnswers[prevIndex]`, persisted to `localStorage` (`bics_draft_${testId}_${candId}_${subId}`), and synced to background server draft before loading the next question.

### 8.8 Double-Warning Auto-Submit Cascade Elimination (Item 3.1)
- **Vulnerability**:
  - Exiting fullscreen triggered both `fullscreenchange` and `window.blur` almost simultaneously, consuming 2 of 3 allowed warnings in a single incident and triggering premature auto-submission.
- **Remediation**:
  - Implemented 600ms deduplication cooldown window (`DEDUPLICATION_WINDOW_MS = 600`) with `lastFullscreenExitTimeRef` and `lastWindowBlurTimeRef`.
  - If a window blur occurs within 600ms of a fullscreen exit (or vice versa), the second event is suppressed and reconciled into a single incident with proctoring logs.

### 8.9 Verification Test Suite
- Automated test suite `backend/tests/ot_security_part2.test.js` covers 10 targeted assertions across all 5 items with a 100% pass rate.


