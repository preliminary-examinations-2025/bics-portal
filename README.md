# BICS — Board of Internet Examination & Coursework System

> **Authoritative System Architecture, Security Specifications, Technical Context & Engineering Documentation**  
> Maintained continuously as the authoritative single source of truth for the BICS platform across all services, frontends, and security layers.

---

## 1. System Topography & Multi-Application Architecture

The BICS ecosystem is an enterprise-grade academic examination, proctoring, and coursework delivery platform composed of four core applications operating in concert through a reverse-proxy topology:

```
                                      +-------------------------------------------------------+
                                      |                     User Browser                      |
                                      |            https://bicsportal.netlify.app             |
                                      +---------------------------+---------------------------+
                                                                  |
                                       +--------------------------+--------------------------+
                                       |                                                     |
                         Path: /main/* (and root)                             Path: /assessment/* (Proxy)
                                       |                                                     |
                                       v                                                     v
                       +-------------------------------+                     +-------------------------------+
                       |      Main Portal Client       |                     |      OT Assessment Engine     |
                       |       (`frontend/`)           |                     |       (`frontend_ot/`)        |
                       | React + Vite + TailwindCSS    |                     | React + Monaco + AI Proctors  |
                       +---------------+---------------+                     +---------------+---------------+
                                       |                                                     |
                                       |                     Authorization: Bearer <JWT>     |
                                       +--------------------------+--------------------------+
                                                                  |
                                                                  v (Proxy: /api/*)
                                               +-------------------------------------+
                                               |          Backend API Server         |
                                               |             (`backend/`)            |
                                               | Node.js + Express + Mongoose (Atlas)|
                                               +------------------+------------------+
                                                                  |
                                       +--------------------------+--------------------------+
                                       |                                                     |
                                       v                                                     v
                       +-------------------------------+                     +-------------------------------+
                       |       Primary Database        |                     |      Offline Local Cache      |
                       |     MongoDB Atlas Cluster     |                     |    Encrypted JSON & SQLite    |
                       +-------------------------------+                     +-------------------------------+
```

### Component Directory & Responsibilities

| Application | Directory | Tech Stack | Production Role / Domain |
| :--- | :--- | :--- | :--- |
| **Backend API Server** | `backend/` | Node.js (>=20.19), Express 4, Mongoose 8 (MongoDB Atlas), JWT, BcryptJS, PDFKit, Jimp | Central authoritative REST API server, authentication engine, proctoring telemetry aggregator, C++ Docker sandbox execution, EIRF disaster recovery service, and PDF certificate generator. |
| **Main Portal Frontend** | `frontend/` | React 18, Vite 5, TailwindCSS, Lucide Icons | Student academic dashboard, registration forms, coursework player, marks ledger, hall ticket download, and administrative management interface. |
| **OT Exam Terminal** | `frontend_ot/` | React 18, Vite 5, Monaco Editor, TensorFlow.js / BlazeFace, Web Audio API | Dedicated high-security candidate examination kiosk. Enforces locked fullscreen, dual AI vision/audio proctoring, tab-switch interception, question rendering (KaTeX/Markdown), and encrypted code submission. |
| **Athenaeum Workspace** | `frontend_workspace/` | React 18, Vite 5, Lucide Icons | Competitive programming practice arena, Kata problemsets, interactive code submissions, and student leaderboard. |

### Subdomain Routing & Netlify Reverse Proxy

To provide a unified user experience while isolating build artifacts and deployment lifecycles, Netlify reverse proxy rewrites are configured in `frontend/public/_redirects`:

- **Main Application**: `https://bicsportal.netlify.app/main/*` -> Served by `frontend/` SPA.
- **Assessment Engine**: `https://bicsportal.netlify.app/assessment/*` -> Proxied with HTTP `200!` to `https://otbicsexam.netlify.app/assessment/:splat`.
- **API Services**: `https://bicsportal.netlify.app/api/*` -> Proxied with HTTP `200!` to `https://bics-portal.onrender.com/api/:splat`.
- **Cloudinary Media**: `https://bicsportal.netlify.app/media/*` -> Proxied to CDN asset storage.
- **Athenaeum / Kata Workspace**: `https://bicsportal.netlify.app/athenaeum/*` -> Proxied with HTTP `200!` to `https://bicsworkspace.netlify.app/athenaeum/:splat`.

---

## 2. Security, Authentication & Access Control Architecture

```
                          Incoming Request (/api/*)
                                     |
                                     v
                       +---------------------------+
                       |   authorizeApiRequest     |  <-- Verifies Bearer JWT, dual-auth x-exam-token,
                       |    (Global Gateway)       |      or 45-min EIRF magic token; enforces whitelist
                       +-------------+-------------+
                                     |
                        +------------+------------+
                        |                         |
               Route starts with /admin       Standard route
                        |                         |
                        v                         v
          +---------------------------+  +---------------------------+
          |       requireAdmin        |  |    requireOwnerOrAdmin    | <-- IDOR Guard: Matches candidate
          | (Rejects non-admin with   |  | (Resolves BICS ObjIds     |     ID in params/body to token
          |  401 / 403 Forbidden)     |  |  and validates ownership) |     identity; admins bypass.
          +-------------+-------------+  +-------------+-------------+
                        |                               |
                        +---------------+---------------+
                                        |
                                        v
                            Route Execution Handler
```

### 2.1 Server-Side Token Hierarchy & Lifespans

Authentication is cryptographically signed using `jsonwebtoken` via `backend/utils/jwt.js`:

1. **Administrator JWT (`ADMIN_JWT`)**:
   - Issued exclusively on `POST /api/login` when credentials match `ADMIN_USER` and `ADMIN_PASS`.
   - Claims: `{ id: 'admin', role: 'admin', username: 'admin' }`.
   - Lifespan: **12 hours** (scoped to proctoring/administration shifts).
2. **Student JWT (`STUDENT_JWT`)**:
   - Issued on `POST /api/login` upon verifying candidate username and Bcrypt password hash.
   - Claims: `{ id: candidate._id, studentId: candidate.studentId, role: 'student', username: candidate.username }`.
   - Lifespan:
     - **7 Days** when "Remember me" is checked (`rememberMe: true`).
     - **24 Hours** when `rememberMe` is unchecked (`rememberMe: false`).
3. **Exam Session Token (`EXAM_TOKEN`)**:
   - Ephemeral, single-use, **2-minute** verification token generated via `POST /api/tests/generate-token` and consumed by `POST /api/tests/verify-token` during OT kiosk launch.
4. **EIRF Magic Recovery Token (`EIRF_TOKEN`)**:
   - High-entropy cryptographic token generated upon exam submission failure or interruption.
   - Bound to `TestSubmissionModel.eirfToken` with a statutory **45-minute** expiration window (`eirfExpiresAt`). Allows one-time filing of incident reports and answers.

### 2.2 Authoritative Admin Perimeter Defense (`/api/admin/*`)

All administrative routes are protected by a dual-layer perimeter defense:
- Global Gateway (`authorizeApiRequest` in `backend/middleware/auth.js`): Inspects all requests targeting `/api/admin/*` or ending in `/admin`. Unauthenticated requests immediately receive `401 Unauthorized`; non-admin identities receive `403 Forbidden`.
- Router-Level Middleware (`app.use('/api/admin', authenticateToken, requireAdmin)` in `backend/server.js`): Second-pass gate validating that `req.user.role === 'admin'`.

### 2.3 Strict IDOR Protection & Identity Ownership

Student access to sensitive personal resources (e.g., test submissions, hall tickets, lecture progress, helpdesk tickets, biometric baselines) is strictly validated via `requireOwnerOrAdmin` in `backend/middleware/auth.js`:
- Supports both canonical 22-character BICS ObjectIds and legacy 24-character hexadecimal MongoDB ObjectIds.
- Automatically resolves target IDs from URL route parameters (`:id`, `:candidateId`), query strings (`?candidateId=`), or request bodies (`req.body.id`).
- Blocks cross-candidate access with HTTP `403 Forbidden` while allowing administrators full auditing capabilities.

### 2.4 Password Security & Transparent In-Flight Bcrypt Migration

- Hashing implementation: `backend/utils/password.js` using `bcryptjs` with `SALT_ROUNDS = 10`.
- **Zero-Downtime Migration**: When candidates with legacy plaintext passwords log in, credentials are verified via constant-time comparison (`crypto.timingSafeEqual`) and immediately upgraded in MongoDB to salted Bcrypt hashes.
- New registrations via `/api/admin/register-candidate` are salted and hashed prior to insertion.

### 2.5 In-Flight Data Redaction

Sensitive security metadata is automatically stripped prior to network transmission:
- Mongoose schema-level transforms (`backend/models/Candidate.js`): `toJSON` and `toObject` unconditionally delete `password` and `verificationCode`.
- Controller-level sanitization: `sanitizeCandidate()` in `backend/routes/candidates.js` ensures passwords, OTPs, and internal normalized marks are stripped from all API outputs.
- Database viewer masking (`backend/routes/adminDbViewer.js`): Hashes are replaced with `[PROTECTED HASH]` and OTPs with `[PROTECTED CODE]`.

---

## 3. Format-Preserving BICS ObjId Cryptography

To eliminate the exposure of internal database metadata (creation timestamps, process IDs, and sequential counters) in public URLs, BICS implements format-preserving Feistel encryption:

```
[24-Char Mongo Hex ObjectId]  <=======>  [22-Char Canonical BICS ObjId]
 507f1f77bcf86cd799439011                 xxxxxx-xxxx-xxxx-xxxxxx
```

### 3.1 Algorithm Specifications
- **Structure**: 6-round balanced Feistel network operating on the 96-bit binary payload of the MongoDB ObjectId.
- **Round Function**: Cryptographic HMAC-SHA256 keyed with server secrets.
- **Encoding**: 21-character Base36 representation grouped into `6-4-4-6` hyphenated blocks, plus a 22nd check digit computed via polynomial modulus for immediate tamper rejection.
- **Properties**: Mathematically bijective, deterministic, collision-free, and reversible with zero database queries.

### 3.2 Global Middleware Enforcement (`bicsIdMiddleware.js`)
- **Inbound Interception**: Intercepts `req.params`, `req.query`, and `req.body`, decrypting any BICS ObjId to its 24-hex Mongo equivalent before controllers execute.
- **Outbound Interception**: Intercepts `res.json` and `res.send`, recursively converting all MongoDB ObjectIds across keys (`_id`, `candidateId`, `testId`, `submissionId`, `ticketId`) into BICS ObjIds before the response leaves the server.

---

## 4. Online Test (OT) Terminal & Anti-Cheating Infrastructure

The OT Terminal (`frontend_ot/`) provides a locked, proctored environment designed to prevent cheating while preserving exam state across unexpected network and hardware interruptions.

### 4.1 Server-Side Projection Filter for Hidden Test Cases
- **Vulnerability Solved**: Previously, `GET /api/tests/:id` sent full testcase arrays to the browser, relying on client-side slicing (`.slice(0, 2)`) to hide extra cases. Candidates could inspect DevTools and hardcode conditional outputs.
- **Remediation**: `sanitizeQuestionForCandidate()` in `backend/routes/tests.js` strictly filters testcase arrays to only those flagged `isSample: true`. Hidden evaluation testcases remain exclusively on the server and are never transmitted over the wire.

### 4.2 Dual AI Vision & Audio Proctoring Engine

```
                                  Client Browser
                                         |
                    +--------------------+--------------------+
                    |                                         |
                    v (Webcam Feed)                           v (Microphone Feed)
       +-------------------------+               +-------------------------+
       |   BlazeFace AI Vision   |               | Vocal Bandpass Filter   |
       |  TensorFlow.js (WebGL)  |               |  (300 Hz - 3000 Hz)     |
       +------------+------------+               +------------+------------+
                    |                                         |
        Head Yaw / Multi-Face                     Crest Factor Impulse Rejection
        & Absence Detection                       Keystroke & Click Filter (CF >= 4.5)
                    |                                         |
                    |                               Sustained Speech Gate (>= 1.0s)
                    |                                         |
                    +--------------------+--------------------+
                                         |
                                         v
                         Proctoring Violation Handler
                         - 600ms Event Deduplication Window
                         - Monotonic High-Water Mark Counter Sync
```

1. **Vision Proctoring (BlazeFace AI)**:
   - Evaluates face presence, multi-face anomalies, and head rotation (yaw, pitch, roll) using local WebGL hardware acceleration.
   - Baseline photo verification compares student identity at start against enrolled records.
2. **Audio Proctoring with Crest Factor Impulse Filtering**:
   - **Vocal Bandpass Isolation**: Dual `BiquadFilterNode` cascade (Highpass 300 Hz + Lowpass 3000 Hz) filters low-frequency room hum and ultrasonic noise to isolate human vocal formants.
   - **Keystroke / Click Rejection**: Analyzes the time-domain Crest Factor ratio ($\text{CF} = \frac{\text{Peak Amplitude}}{\text{RMS}}$). Mechanical keyboard typing and mouse clicks produce transient spikes with $\text{CF} \ge 4.5$ and are filtered out; human speech exhibits continuous harmonic formants ($\text{CF} \in [2.2, 3.8]$).
   - **Sustained Speech Gate**: Requires $\ge 1.0\text{s}$ (10 consecutive 100ms frames) of continuous speech before recording a violation.

### 4.3 Monotonic High-Water Mark Violation Counters
- Client-submitted infraction tallies (`fullscreenExits`, `tabSwitches`, `clipboardAttempts`) are reconciled on the server using `reconcileProctoringLog()`:
  $$\text{Count}_{\text{final}} = \max(\text{Count}_{\text{server}}, \text{Count}_{\text{client}}, \text{Length}(\text{EventLog}))$$
- Prevents candidates from modifying final submission payloads in DevTools to wipe infractions.

### 4.4 Event Deduplication & Focus Interception
- **Double-Warning Elimination**: A 600ms deduplication cooldown (`DEDUPLICATION_WINDOW_MS = 600`) links `fullscreenchange` and `window.blur` events so exiting fullscreen does not consume two warnings in a single incident.
- **Drag-and-Drop Lockdown**: Monaco editor instances set `dragAndDrop: false`. Global `dragover`, `dragenter`, and `drop` events are blocked, displaying an explicit toast banner:
  > *"Action Blocked: Copy-pasting and dragging external text are strictly prohibited during the active examination environment. This attempt has been logged."*

### 4.5 Zero-Loss Draft Auto-Commit
- Question palette navigation in `frontend_ot/src/App.jsx` automatically commits Monaco editor drafts, radio selections, and web studio buffers to `localStorage` (`bics_draft_${testId}_${candId}_${subId}`) and syncs to the server before loading the next question.

### 4.6 RichText Markdown, KaTeX & Image Options
- `RichText` component (`frontend_ot/src/components/common/RichText.jsx`):
  - Renders inline and block LaTeX formulas via KaTeX (`$math$`, `$$display$$`, `\(...\)`, `\[...\]`).
  - Supports GitHub Flavored Markdown (GFM) tables with custom alignment headers.
  - Parses Markdown image syntax `![alt](url)` in MCQ options into responsive, clickable cards (`max-height: 280px`), allowing full image-based questions and options.

---

## 5. Code Execution & Isolated Sandbox Engine

```
Candidate Code Submission (C++)
               |
               v
  +-------------------------+
  |  Preflight Regex Check  |  <-- Blocks process spawning (system, fork, exec),
  |     (`isSafeCode`)      |      native file I/O (fopen, remove), and assembly
  +------------+------------+
               |
               +---------------------------------------+
               |                                       |
    Docker Daemon Available                  Docker Daemon Offline
               |                                       |
               v                                       v
  +-------------------------+             +-------------------------+
  |  Docker Sandbox Engine  |             |  Guarded Host Execution |
  | - Alpine Linux 3.19     |             | - Non-privileged thread |
  | - --network none        |             | - maxBuffer: 1MB        |
  | - --memory 128MB        |             | - Safe deferred unlink  |
  | - --pids-limit 32       |             | - Process kill on TLE   |
  | - --cap-drop ALL        |             +-------------------------+
  +-------------------------+
```

### 5.1 Docker Sandbox Container
- Container Image: `backend/sandbox/Dockerfile` (Alpine Linux 3.19 + `g++` + unprivileged user `sandboxuser`).
- Runtime parameters:
  ```bash
  docker run --rm -i \
    --network none \
    --memory "${mem}m" \
    --memory-swap "${mem}m" \
    --cpus 1.0 \
    --pids-limit 32 \
    --read-only \
    --cap-drop ALL \
    --volume "${tempDir}:/sandbox:ro" \
    bics-cpp-sandbox /sandbox/runner
  ```
- Protects the host system against fork bombs, socket connections, disk space exhaustion, and arbitrary system modification.

### 5.2 Dynamic Limits & Standardized Competitive Verdicts
- Configurable per question: `timeLimitMs` (200–10000ms, default 2000ms) and `memoryLimitMb` (16–512MB, default 128MB).
- Reports standardized verdicts: `Accepted`, `Wrong Answer`, `Time Limit Exceeded (TLE)`, `Memory Limit Exceeded (MLE)`, `Runtime Error`, `Compilation Error`.

---

## 6. EIRF Subsystem & Cryptographic Disaster Recovery

The Emergency Incident Report Form (EIRF) provides offline resilience during catastrophic browser crashes, power failures, or campus network drops.

```
                  Client-Side Kiosk Interruption
                                 |
                                 v
        +-------------------------------------------------+
        |   EIRF Hybrid Envelope Encryption               |
        |   1. Generate ephemeral 256-bit AES-GCM key     |
        |   2. Encrypt answers & proctoring telemetry     |
        |   3. Wrap AES key with Server RSA-2048 PubKey   |
        +------------------------+------------------------+
                                 |
                     Generates `.eirf` Backup File
                                 |
                                 v
        +-------------------------------------------------+
        |   Candidate Uploads File via Magic Link         |
        |   (POST /api/test/eirf/submit)                  |
        +------------------------+------------------------+
                                 |
                                 v
        +-------------------------------------------------+
        |   Server-Side Decryption & Verification         |
        |   1. Unwrap AES key using RSA-2048 Private Key  |
        |   2. Decrypt & verify AES-GCM auth tag          |
        |   3. Ingest answers & trigger auto-evaluation   |
        +-------------------------------------------------+
```

- **Asymmetric Envelope Encryption**: Payload is encrypted with AES-256-GCM; the symmetric key is wrapped using the server's RSA-2048 public key (`RSA-OAEP-2048/SHA-256`). Marked `version: '2.0-rsa-envelope'`.
- **Local Storage Encryption**: Offline pending submissions (`bics_pending_submit_${subId}`) are encrypted in browser `localStorage` using submission-derived salts.
- **Statutory Submission Limit**: Magic link tokens enforce a strict 45-minute window (`eirfExpiresAt`).

---

## 7. Evolutionary Changelog: Deprecated vs. Improved Features

A comprehensive record of architectural upgrades and deprecated components across platform iterations:

| Feature / Domain | Deprecated Feature (Previous State) | Improved Feature (Current Production State) | Rationale & Security Impact |
| :--- | :--- | :--- | :--- |
| **API Authentication** | Static shared secret `'qwertty'` hardcoded in frontend bundles and passed via `?apiSecret=qwertty`. | Cryptographically signed Bearer JWTs (`ADMIN_JWT`, `STUDENT_JWT`) and dual-auth headers (`x-exam-token`). | Purged shared secret; eliminated credential interception and unauthorized API calls via URL inspection. |
| **Password Storage** | Plaintext candidate passwords stored directly in JSON and MongoDB (`password: "pass123"`). | Salted Bcrypt hashing (`SALT_ROUNDS = 10`) with transparent, zero-downtime auto-migration on login. | Protects candidate credentials against data dumps; zero user interruption during database upgrade. |
| **Object Identifiers** | Sequential, exposed 24-character hexadecimal MongoDB ObjectIds in public URLs (`/test/665f...`). | Format-preserving 22-character Feistel-encrypted BICS ObjectIds (`xxxxxx-xxxx-xxxx-xxxxxx`). | Prevents enumeration attacks and hides database creation timestamps and server machine IDs. |
| **EIRF Encryption** | Symmetric PBKDF2 encryption using client-exposed strings (`bics_secret_key_2026`). | Asymmetric hybrid envelope encryption (RSA-2048-OAEP + AES-256-GCM) with server private key isolation. | Clients cannot alter test answers or marks inside downloaded `.eirf` backup files. |
| **Hidden Test Cases** | Full testcase suite sent to browser; client used `.slice(0, 2)` to visually hide cases. | Strict server-side projection filter returning only testcases with `isSample: true`. | Completely eliminates inspection of hidden boundary inputs and expected outputs in browser DevTools. |
| **Proctoring Counters** | Client submitted raw infraction totals; backend directly overwrote database records. | Monotonic high-water mark reconciliation: $\max(\text{DB}, \text{Client}, \text{Events})$. | Prevents students from modifying HTTP payloads to reset violation counters to zero. |
| **Code Sandbox** | Direct unconstrained `child_process.exec` on host machine with static 2000ms timeout and no RAM caps. | Docker container sandbox (Alpine Linux, unprivileged user, memory/CPU caps, `--network none`) + guarded fallback. | Protects host machine against fork bombs, memory exhaustion, file tampering, and system compromise. |
| **Audio Proctoring** | Broadband RMS thresholding that triggered false positives on mechanical keyboard typing. | Vocal bandpass filter (300–3000 Hz) + Crest Factor impulse rejection ($\text{CF} \ge 4.5$) + 1.0s speech gate. | Rejects keystrokes, trackpad taps, and ambient noises while preserving voice anomaly detection. |
| **Warning Triggers** | Simultaneous fullscreen exit and window blur consumed 2 warnings in a single incident. | 600ms deduplication cooldown window suppressing secondary blur triggers. | Prevents premature auto-submission caused by browser window management race conditions. |
| **Code Buffer Retention** | Palette navigation without clicking "Save & Next" reloaded stale code, losing edits. | Automatic draft buffer commit flushing Monaco editors to `localStorage` and server on question switch. | Guarantees zero code loss during spontaneous question switching. |
| **Email Infrastructure** | Deprecated Brevo (Sendinblue) transactional email API keys. | Authoritative Google Gmail REST API integration with OAuth2 refresh tokens + EmailJS failover. | High delivery reliability for hall tickets, OTP verification codes, and EIRF receipts. |
| **Subdomain Routing** | Separate domain navigation causing cookie, storage, and CORS fragmentation. | Netlify reverse proxy (`_redirects`) mapping `/assessment/*` and `/api/*` under `bicsportal.netlify.app`. | Provides seamless single-origin user experience while maintaining decoupled deployment pipelines. |
| **MCQ Options** | Raw unformatted string rendering in radio/checkbox choices. | `RichText` Markdown parsing with embedded images (`![alt](url)`) and KaTeX math formulas. | Enables complex diagrams, circuit schematics, and math expressions within question choices. |

---

## 8. Database Architecture & Data Models

BICS implements a resilient persistence layer: primary operations run against **MongoDB Atlas via Mongoose**, with automatic, in-memory failover to an encrypted local JSON store (`backend/data/db.json` / `initialDB`) during network isolation.

```
                              Mongoose ODM Layer
                                      |
         +----------------------------+----------------------------+
         |                            |                            |
         v                            v                            v
  [CandidateModel]             [TestConfigModel]         [TestSubmissionModel]
  - studentId, username        - title, duration         - candidateId, testId
  - password (Bcrypt hash)     - sections (SCC, MCC,     - answers (code, opts)
  - verificationCode             Coding, Web Studio)     - proctoringLog
  - registrationData           - question limits         - eirfToken, eirfExpiresAt
         |                            |                            |
         +----------------------------+----------------------------+
                                      |
                                      v
                     Additional Enterprise Models:
                     - MediaAssetModel (BICS Media Drive assets)
                     - CounterfoilModel (Verification QR)
                     - MarksLedgerModel (Grading records)
                     - TicketModel (Helpdesk tickets)
                     - SystemLogModel (Audit telemetry)
                     - KataModel & ContestModel
```

---

## 9. Environment Variables Reference

### Backend (`backend/.env` / Render Hosting)

```bash
# Server Runtime
PORT=5000
NODE_ENV=production

# Database
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/bics?retryWrites=true&w=majority

# Security & JWT Lifespans
JWT_SECRET=your_64_byte_random_hex_secret_here
JWT_EXPIRES_IN=12h
JWT_STUDENT_EXPIRES_IN=7d
EXAM_TICKET_SECRET=your_start_ticket_hmac_secret_here
PRECHECK_ENFORCE=true

# Administrative Access
ADMIN_USER=admin
ADMIN_PASS=your_strong_admin_password

# Cloudinary Media Storage
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Google Gmail REST API (Authoritative Mailer)
GMAIL_SENDER_EMAIL=portal@bics.edu
GMAIL_SENDER_NAME="BICS Examination Directorate"
GMAIL_CLIENT_ID=your_oauth_client_id
GMAIL_CLIENT_SECRET=your_oauth_client_secret
GMAIL_REFRESH_TOKEN=your_oauth_refresh_token

# Google Classroom Webhook Secret
GOOGLE_CLASSROOM_WEBHOOK_KEY=your_webhook_key
```

### Frontends (`frontend/.env` & `frontend_ot/.env`)

```bash
# Main Frontend
VITE_API_BASE=https://bicsportal.netlify.app/api

# OT Terminal Frontend
VITE_API_BASE=https://bicsportal.netlify.app/api
VITE_DASHBOARD_URL=https://bicsportal.netlify.app
```

---

## 10. Installation, Verification & Test Execution

### 10.1 Local Development Setup

```bash
# 1. Clone repository
git clone https://github.com/your-org/bics_website.git
cd bics_website

# 2. Install dependencies across projects
cd backend && npm install
cd ../frontend && npm install
cd ../frontend_ot && npm install
cd ../frontend_workspace && npm install

# 3. Start Backend Development Server
cd ../backend
npm start   # Runs on http://localhost:5000

# 4. Start Frontends (in separate terminals)
cd ../frontend && npm run dev       # Runs on http://localhost:5173
cd ../frontend_ot && npm run dev    # Runs on http://localhost:5174
```

### 10.2 Automated Test Execution

The backend contains dedicated test suites verifying security invariants, cryptographic engines, and proctoring telemetry:

```bash
cd backend

# Security & Penetration Audit Suite (Auth, IDOR, NoSQL injection, passwords)
node tests/security_auth_audit.test.js

# Enterprise Authorization & RBAC Suite (Perimeter gates, token validation)
node tests/bics_enterprise_auth_suite.test.js

# Exam Start & Dual Token Pipeline
node tests/exam_start_auth_test.js

# BICS ObjId Feistel Cryptographic Invariants
node tests/bics_objid_full_suite.test.js

# BICS ObjId Live End-to-End CRUD Operations
node tests/bics_objid_crud_suite.test.js

# OT Terminal Sandbox & Proctoring Verification
node tests/ot_terminal_security.test.js
node tests/ot_security_part2.test.js

# BICS Media Drive Upload & Asset Management Suite
node tests/admin_media_drive.test.js
```

---

## 11. Security Audit Findings & Hardening Checklist

| Priority | Hardening Recommendation | Location | Implementation Details |
| :---: | :--- | :--- | :--- |
| **P0** | **Explicit Production Flag** | `backend/middleware/auth.js` | Require `process.env.NODE_ENV === 'development'` before granting simulated dev test sessions. |
| **P1** | **Candidate Login Rate Limiting** | `backend/routes/auth.js` | Apply a 5-failure sliding-window lockout tracker on student logins to mitigate brute-force attacks. |
| **P2** | **Session Storage Namespacing** | `frontend_ot/src/api/client.js` | Use `bics_ot_auth_token` exclusively to prevent `localStorage` eviction conflicts with the main portal. |
| **P3** | **URL Token Scrubbing** | `frontend_ot/src/api/client.js` | Invoke `history.replaceState` to strip `authToken` from the address bar once cached in session memory. |
| **P3** | **Enforce Precheck Start Tickets** | `backend/.env` | Set `PRECHECK_ENFORCE=true` in production to prevent skipping biometric/system verification wizards. |
