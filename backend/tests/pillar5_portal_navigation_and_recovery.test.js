/**
 * Pillar 5 Comprehensive Verification Suite:
 * /main/home Stranded Hang & Return-From-Online-Test Navigation Recovery
 *
 * Verifies:
 * 1. Static Architecture & Anti-Regression Invariants across Main Portal & Online Test Terminal:
 *    - Zero blank-screen conditional mounts for HomeDashboard & sibling views
 *    - PortalErrorBoundary, PortalDataStateCard, HomeDashboard recovery UI, safe JSON parsing
 *    - Single API_BASE import, zero dead fetch monkey-patch or localStorage.clear() calls
 *    - Consolidated [view, user?.id, user?.role] effect, bfcache pageshow + visibilitychange/online wakeSync
 *    - Candidate vs Student role parity (isStudentRole) across frontend views & API calls
 *    - OT scoped storage cleanup and transient error vs 403 Forbidden separation
 * 2. Behavioral VM Verification of frontend/src/api/client.js & frontend_ot/src/api/client.js:
 *    - AbortController timeout on hung backend sockets
 *    - Exponential backoff retries on transient 502/503/504 for GET/HEAD, none for POST or retry:false
 *    - External AbortSignal immediate propagation without retry
 *    - Request cloning across retries
 *    - 401 bics_auth_expired dispatch exclusion for /login, /logout, /verify-session
 *    - safeReadJson resilient handling of HTML 502/503 gateway responses
 *    - OT client dual auth header injection (Authorization + x-exam-token) & URL param cleanup
 * 3. Pure Helper Verification (isStudentRole, parseJwtExp, parseJwtUser, sanitizeRedirectTarget)
 * 4. Live Express Server Navigation & Role Parity Checks:
 *    - /api/health, /api/config, /api/login, /api/verify-session
 *    - Both 'student' and 'candidate' JWTs authorized on profile, /tests/active, /tests/submitted,
 *      /tests/generate-token, /tests/verify-token while blocked (403) on /api/admin/*
 */

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const mongoose = require('mongoose');

process.env.NODE_ENV = 'test';
process.env.PORT = '5015';
process.env.JWT_SECRET = 'pillar5_test_jwt_secret_2026';
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASS = 'admin123';

const { DB_FILE, dbState, getJSONData, saveJSONData } = require('../config/db');
const dbBackup = fs.existsSync(DB_FILE) ? fs.readFileSync(DB_FILE, 'utf8') : null;

const app = require('../server');
const { generateToken } = require('../utils/jwt');
const { hashPassword } = require('../utils/password');
const { toBicsId } = require('../utils/bicsId');
const { stopSubmissionReaper } = require('../workers/submissionReaper');
const { stopEirfPipelineWorker } = require('../workers/eirfPipelineWorker');

const rootDir = path.resolve(__dirname, '..', '..');
const frontendDir = path.join(rootDir, 'frontend', 'src');
const frontendOtDir = path.join(rootDir, 'frontend_ot', 'src');

const pipePath = process.platform === 'win32'
    ? `\\\\.\\pipe\\bics_p5_${process.pid}_${Date.now()}`
    : `/tmp/bics_p5_${process.pid}_${Date.now()}.sock`;

const envBackup = {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    JWT_SECRET: process.env.JWT_SECRET,
    ADMIN_USER: process.env.ADMIN_USER,
    ADMIN_PASS: process.env.ADMIN_PASS
};

function httpRequest(method, urlPath, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const reqHeaders = { Host: '127.0.0.1:5000', ...headers };
        let payload = null;
        if (body !== null && body !== undefined) {
            payload = typeof body === 'string' ? body : JSON.stringify(body);
            if (!reqHeaders['Content-Type']) reqHeaders['Content-Type'] = 'application/json';
            reqHeaders['Content-Length'] = Buffer.byteLength(payload);
        }

        const req = http.request({ socketPath: pipePath, path: urlPath, method, headers: reqHeaders }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                let parsedBody = data;
                try { parsedBody = JSON.parse(data); } catch (_) {}
                resolve({ status: res.statusCode, headers: res.headers, body: parsedBody });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function walkSourceFiles(dirPath) {
    const out = [];
    if (!fs.existsSync(dirPath)) return out;
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        const full = path.join(dirPath, entry.name);
        if (entry.isDirectory()) out.push(...walkSourceFiles(full));
        else if (/\.(js|jsx|ts|tsx)$/i.test(entry.name)) out.push(full);
    }
    return out;
}

function createMemoryStorage() {
    const store = new Map();
    return {
        get length() { return store.size; },
        key(idx) {
            return Array.from(store.keys())[idx] ?? null;
        },
        getItem(k) {
            return store.has(String(k)) ? store.get(String(k)) : null;
        },
        setItem(k, v) {
            store.set(String(k), String(v));
        },
        removeItem(k) {
            store.delete(String(k));
        },
        clear() {
            store.clear();
        }
    };
}

class MockHeaders {
    constructor(init = {}) {
        this._map = new Map();
        if (init instanceof MockHeaders) {
            for (const [k, v] of init._map.entries()) this._map.set(k, v);
        } else if (init && typeof init === 'object') {
            for (const [k, v] of Object.entries(init)) {
                if (v !== undefined && v !== null) this._map.set(String(k).toLowerCase(), String(v));
            }
        }
    }
    has(k) { return this._map.has(String(k).toLowerCase()); }
    get(k) { return this._map.get(String(k).toLowerCase()) ?? null; }
    set(k, v) { this._map.set(String(k).toLowerCase(), String(v)); }
}

class MockRequest {
    constructor(url, init = {}) {
        this.url = typeof url === 'string' ? url : (url?.url || '');
        this.method = (init.method || url?.method || 'GET').toUpperCase();
        this.headers = new MockHeaders(init.headers || url?.headers || {});
        this.cloneCount = 0;
    }
    clone() {
        this.cloneCount += 1;
        const cloned = new MockRequest(this.url, { method: this.method, headers: this.headers });
        cloned.cloneCount = this.cloneCount;
        return cloned;
    }
}

function loadClientModuleInVm(filePath, initialUrl = 'http://localhost:5173/main/home') {
    const rawCode = fs.readFileSync(filePath, 'utf8');
    const isOt = filePath.includes('frontend_ot');

    const transformed = rawCode
        .replace(/import\.meta\.env/g, '({ VITE_API_BASE: "" })')
        .replace(/^export\s+const\s+/gm, 'const ')
        + `\nglobalThis.__exported = typeof getAuthToken !== 'undefined'
            ? { API_BASE, getAuthToken, setAuthToken, clearAuthToken, safeReadJson }
            : { API_BASE, safeReadJson };\n`;

    const parsedUrl = new URL(initialUrl);
    const dispatchedEvents = [];
    const replacedUrls = [];

    const localStorage = createMemoryStorage();
    const sessionStorage = createMemoryStorage();

    let currentFetchHandler = async () => ({
        ok: true,
        status: 200,
        headers: new MockHeaders({ 'content-type': 'application/json' }),
        json: async () => ({ ok: true }),
        text: async () => '{"ok":true}'
    });

    const mockWindow = {
        location: {
            hostname: parsedUrl.hostname,
            origin: parsedUrl.origin,
            pathname: parsedUrl.pathname,
            search: parsedUrl.search,
            hash: parsedUrl.hash
        },
        history: {
            replaceState(_state, _title, nextUrl) {
                replacedUrls.push(nextUrl);
            }
        },
        dispatchEvent(evt) {
            dispatchedEvents.push(evt);
        },
        fetch: (...args) => currentFetchHandler(...args)
    };

    const context = {
        globalThis: null,
        window: mockWindow,
        document: { title: 'BICS Portal' },
        localStorage,
        sessionStorage,
        navigator: { onLine: true },
        Headers: MockHeaders,
        Request: MockRequest,
        AbortController,
        URL,
        URLSearchParams,
        CustomEvent: function CustomEvent(type, detail) {
            this.type = type;
            this.detail = detail?.detail;
        },
        setTimeout,
        clearTimeout,
        console,
        Error,
        Set,
        Map,
        Promise
    };
    context.globalThis = context;
    context.self = context;

    vm.createContext(context);
    vm.runInContext(transformed, context, { filename: filePath });

    return {
        exports: context.__exported,
        window: context.window,
        localStorage,
        sessionStorage,
        navigator: context.navigator,
        dispatchedEvents,
        replacedUrls,
        setFetchImpl(fn) { currentFetchHandler = fn; },
        getPatchedFetch() { return context.window.fetch; },
        isOt
    };
}

function extractPureHelpersFromPortalApp(appSource) {
    const startIsStudent = appSource.indexOf('const isStudentRole =');
    const startParseExp = appSource.indexOf('function parseJwtExp(');
    const startPortalApp = appSource.indexOf('function PortalApp(');
    assert.ok(startIsStudent !== -1 && startParseExp !== -1 && startPortalApp !== -1, 'Failed to locate helpers in frontend/src/App.jsx');

    const snippet = [
        appSource.slice(startIsStudent, appSource.indexOf(';', startIsStudent) + 1),
        appSource.slice(startParseExp, startPortalApp),
        'globalThis.__helpers = { isStudentRole, parseJwtExp, parseJwtUser, sanitizeRedirectTarget };'
    ].join('\n');

    const ctx = {
        globalThis: null,
        URL,
        decodeURIComponent,
        atob: (b64) => Buffer.from(b64, 'base64').toString('utf8'),
        JSON
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(snippet, ctx);
    return ctx.__helpers;
}

async function runPillar5Suite() {
    console.log('\n==============================================================');
    console.log('   PILLAR 5: PORTAL NAVIGATION & RECOVERY VERIFICATION        ');
    console.log('==============================================================\n');

    let server = null;
    let passed = 0;
    let total = 0;

    const origUseMongo = dbState.useMongo;
    const origIsConnected = dbState.isConnected;

    const check = (cond, label) => {
        total += 1;
        assert.ok(cond, label);
        passed += 1;
        console.log(`  [PASS] ${label}`);
    };

    try {
        // =========================================================================
        // SECTION A: Static Architecture & Anti-Regression Invariants
        // =========================================================================
        console.log('[Section A] Static Architecture & Anti-Regression Audits');

        const portalAppPath = path.join(frontendDir, 'App.jsx');
        const homeDashPath = path.join(frontendDir, 'pages', 'HomeDashboard.jsx');
        const onlineTestsPath = path.join(frontendDir, 'pages', 'OnlineTestsView.jsx');
        const subVerifyPath = path.join(frontendDir, 'pages', 'SubmissionsVerificationView.jsx');
        const portalClientPath = path.join(frontendDir, 'api', 'client.js');
        const otAppPath = path.join(frontendOtDir, 'App.jsx');
        const otClientPath = path.join(frontendOtDir, 'api', 'client.js');

        const portalAppSrc = fs.readFileSync(portalAppPath, 'utf8');
        const homeDashSrc = fs.readFileSync(homeDashPath, 'utf8');
        const onlineTestsSrc = fs.readFileSync(onlineTestsPath, 'utf8');
        const subVerifySrc = fs.readFileSync(subVerifyPath, 'utf8');
        const portalClientSrc = fs.readFileSync(portalClientPath, 'utf8');
        const otAppSrc = fs.readFileSync(otAppPath, 'utf8');

        check(
            portalAppSrc.includes("import { API_BASE, getAuthToken, setAuthToken, clearAuthToken, safeReadJson } from './api/client';") &&
            !portalAppSrc.includes('window.__bics_fetch_patched'),
            'A.1: Main portal imports unified API_BASE/token helpers from ./api/client without duplicate fetch monkey-patch'
        );

        check(
            portalAppSrc.includes('const isStudentRole = (role) => role === \'student\' || role === \'candidate\';') &&
            !portalAppSrc.includes("user.role === 'student'"),
            'A.2: Main portal enforces uniform student + candidate role parity via isStudentRole'
        );

        check(
            portalAppSrc.includes('class PortalErrorBoundary extends React.Component') &&
            portalAppSrc.includes('<PortalErrorBoundary>\n      <PortalApp />\n    </PortalErrorBoundary>'),
            'A.3: Main portal wraps PortalApp inside PortalErrorBoundary recovery UI'
        );

        check(
            portalAppSrc.includes('function PortalDataStateCard(') &&
            !portalAppSrc.includes("view === 'announcements' && systemConfig") &&
            portalAppSrc.includes("view === 'announcements'") &&
            portalAppSrc.includes('className="portal-view-transition"'),
            'A.4: Main portal never blanks /main/home when systemConfig is null and preserves portal-view-transition'
        );

        check(
            !homeDashSrc.includes('if (!systemConfig) return null;') &&
            homeDashSrc.includes('Retry Connection') &&
            homeDashSrc.includes('Array.isArray(systemConfig.announcements)'),
            'A.5: HomeDashboard renders loading/retry UI when config unavailable and guards announcements array'
        );

        check(
            onlineTestsSrc.includes('activeTestsLoading') &&
            onlineTestsSrc.includes('activeTestsError') &&
            onlineTestsSrc.includes('onRetryTests') &&
            subVerifySrc.includes('submittedTestsLoading') &&
            subVerifySrc.includes('submittedTestsError') &&
            subVerifySrc.includes('onRetrySubmittedTests') &&
            subVerifySrc.includes("getAuthToken"),
            'A.6: OnlineTestsView & SubmissionsVerificationView expose explicit loading, error, and retry states'
        );

        check(
            portalAppSrc.includes("window.addEventListener('pageshow', handlePageShow)") &&
            portalAppSrc.includes("window.addEventListener('online', handleOnline)") &&
            portalAppSrc.includes("document.addEventListener('visibilitychange', handleVisibilityChange)") &&
            portalAppSrc.includes('wakeSyncRef.current') &&
            portalAppSrc.includes('enterTestSafetyTimerRef.current'),
            'A.7: Main portal wires bfcache pageshow, online, visibilitychange wakeSync, and exam redirect safety timers'
        );

        const viewUserRawMatches = portalAppSrc.match(/},\s*\[view,\s*user\]/g) || [];
        const stableViewEffects = portalAppSrc.match(/},\s*\[view,\s*user\?\.id,\s*user\?\.role\]\);/g) || [];
        const changePwdSrc = fs.readFileSync(path.join(frontendDir, 'pages', 'ChangePassword.jsx'), 'utf8');
        const notFoundSrc = fs.readFileSync(path.join(frontendDir, 'pages', 'NotFound.jsx'), 'utf8');
        check(
            viewUserRawMatches.length === 0 &&
            stableViewEffects.length === 2 &&
            changePwdSrc.includes("user?.role === 'candidate'") &&
            notFoundSrc.includes("user?.role === 'candidate'"),
            'A.8: Duplicate [view, user] effects consolidated to [view, user?.id, user?.role] & ChangePassword/NotFound support candidate role'
        );

        check(
            portalAppSrc.includes('isLoggingOutRef.current = false;') &&
            portalAppSrc.includes('res.status === 401 || res.status === 403') &&
            portalAppSrc.includes('data.valid === false'),
            'A.9: Login resets isLoggingOutRef & verify-session only purges auth on 401/403 or explicit valid===false'
        );

        check(
            !otAppSrc.includes('localStorage.clear(') &&
            !otAppSrc.includes('sessionStorage.clear(') &&
            otAppSrc.includes('clearScopedOtStorage') &&
            otAppSrc.includes("verifyErrorKind === 'transient'") &&
            otAppSrc.includes('setVerifyError("You do not have permission to view this directory or page using the credentials that you supplied.")') &&
            otAppSrc.includes('Return to BICS Portal'),
            'A.10: frontend_ot eliminates blanket storage.clear() and renders Retry + Portal Return on transient errors while keeping 403 exactness'
        );

        const allClientFiles = [...walkSourceFiles(frontendDir), ...walkSourceFiles(frontendOtDir)];
        const bannedPatterns = [];
        for (const f of allClientFiles) {
            const c = fs.readFileSync(f, 'utf8');
            if (/localStorage\.clear\(|sessionStorage\.clear\(/i.test(c)) {
                bannedPatterns.push(`${path.basename(f)}:storage.clear`);
            }
            if (/onrender\.com/i.test(c) && !/!envBase\.includes\('onrender\.com'\)/.test(c)) {
                bannedPatterns.push(`${path.basename(f)}:direct_onrender`);
            }
            if (/emailjs|nodemailer|brevo|eirfConfirmation/i.test(c)) {
                bannedPatterns.push(`${path.basename(f)}:legacy_email`);
            }
        }
        check(
            bannedPatterns.length === 0 && portalClientSrc.includes('DEFAULT_FETCH_TIMEOUT_MS = 20000'),
            `A.11: Zero banned patterns across both frontends (violations=${bannedPatterns.length})`
        );

        // =========================================================================
        // SECTION B: Behavioral VM Execution of API Clients
        // =========================================================================
        console.log('\n[Section B] Behavioral VM Verification of Main Portal & OT API Clients');

        const vmPortal = loadClientModuleInVm(portalClientPath, 'http://localhost:5173/main/home');
        const portalFetch = vmPortal.getPatchedFetch();

        // B.1: Token management helpers
        vmPortal.exports.setAuthToken('jwt_remember_tok', true);
        const storedLocal = vmPortal.localStorage.getItem('bics_auth_token');
        const resolved1 = vmPortal.exports.getAuthToken();
        vmPortal.exports.setAuthToken('jwt_session_tok', false);
        const storedSession = vmPortal.sessionStorage.getItem('bics_auth_token');
        const removedLocal = vmPortal.localStorage.getItem('bics_auth_token');
        vmPortal.localStorage.setItem('token', 'legacy_tok');
        vmPortal.sessionStorage.removeItem('bics_auth_token');
        const legacyResolved = vmPortal.exports.getAuthToken();
        vmPortal.exports.clearAuthToken();
        check(
            storedLocal === 'jwt_remember_tok' &&
            resolved1 === 'jwt_remember_tok' &&
            storedSession === 'jwt_session_tok' &&
            removedLocal === null &&
            legacyResolved === 'legacy_tok' &&
            vmPortal.exports.getAuthToken() === null,
            'B.1: Portal client setAuthToken/getAuthToken/clearAuthToken handles rememberMe & legacy token keys cleanly'
        );

        // B.2: Hung request AbortController timeout
        let timeoutAborted = false;
        vmPortal.setFetchImpl((_url, init) => new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
                timeoutAborted = true;
                const e = new Error('The operation was aborted.');
                e.name = 'AbortError';
                reject(e);
            });
        }));
        let caughtTimeoutErr = null;
        try {
            await portalFetch('/api/config', { timeoutMs: 60, retry: false });
        } catch (err) {
            caughtTimeoutErr = err;
        }
        check(
            timeoutAborted && caughtTimeoutErr?.name === 'AbortError',
            'B.2: Hung backend GET aborts cleanly when exceeding timeoutMs'
        );

        // B.3: Transient 502/503 GET backoff retry succeeds on 3rd attempt + clones Request object
        let getAttempts = 0;
        const cloneReq = new MockRequest('http://127.0.0.1:5000/api/config', { method: 'GET' });
        vmPortal.setFetchImpl(async () => {
            getAttempts += 1;
            if (getAttempts === 1) {
                return { ok: false, status: 502, headers: new MockHeaders({ 'content-type': 'text/html' }), text: async () => '<html>502</html>' };
            }
            if (getAttempts === 2) {
                return { ok: false, status: 503, headers: new MockHeaders({ 'content-type': 'text/html' }), text: async () => '<html>503</html>' };
            }
            return {
                ok: true,
                status: 200,
                headers: new MockHeaders({ 'content-type': 'application/json' }),
                json: async () => ({ announcements: [{ id: '1', text: 'Recovered' }] })
            };
        });
        const retryRes = await portalFetch(cloneReq);
        const retryBody = await vmPortal.exports.safeReadJson(retryRes);
        check(
            retryRes.status === 200 &&
            getAttempts === 3 &&
            cloneReq.cloneCount === 3 &&
            retryBody?.announcements?.[0]?.text === 'Recovered',
            'B.3: GET recovers from transient 502->503 cold-start sequence on attempt 3 with Request cloning'
        );

        // B.4: Non-idempotent POST never auto-retries on 503, and retry:false blocks GET retries
        let postAttempts = 0;
        vmPortal.setFetchImpl(async () => {
            postAttempts += 1;
            return { ok: false, status: 503, headers: new MockHeaders({ 'content-type': 'application/json' }), json: async () => ({ error: 'Busy' }) };
        });
        const postRes = await portalFetch('/api/candidate/consent/123', { method: 'POST', body: '{}' });

        let noRetryGetAttempts = 0;
        vmPortal.setFetchImpl(async () => {
            noRetryGetAttempts += 1;
            return { ok: false, status: 502, headers: new MockHeaders({ 'content-type': 'text/html' }), text: async () => '<html>Bad Gateway</html>' };
        });
        const noRetryGetRes = await portalFetch('/api/config', { retry: false });
        const htmlParsedSafe = await vmPortal.exports.safeReadJson(noRetryGetRes);
        check(
            postAttempts === 1 &&
            postRes.status === 503 &&
            noRetryGetAttempts === 1 &&
            noRetryGetRes.status === 502 &&
            htmlParsedSafe === null,
            'B.4: POST never retries on 503, retry:false prevents GET retry, and safeReadJson returns null on HTML 502'
        );

        // B.5: External AbortSignal aborts immediately without retry
        const extController = new AbortController();
        let extAttempts = 0;
        vmPortal.setFetchImpl((_u, init) => {
            extAttempts += 1;
            return new Promise((_resolve, reject) => {
                init.signal.addEventListener('abort', () => {
                    const e = new Error('External abort');
                    e.name = 'AbortError';
                    reject(e);
                });
            });
        });
        setTimeout(() => extController.abort(), 30);
        let extCaught = null;
        try {
            await portalFetch('/api/config', { signal: extController.signal });
        } catch (err) {
            extCaught = err;
        }
        check(
            extAttempts === 1 && extCaught?.name === 'AbortError',
            'B.5: External AbortSignal aborts in-flight GET immediately without triggering retry attempts'
        );

        // B.6: 401 bics_auth_expired dispatch behavior
        vmPortal.exports.setAuthToken('active_jwt_for_401', true);
        vmPortal.dispatchedEvents.length = 0;
        vmPortal.setFetchImpl(async () => ({ ok: false, status: 401, headers: new MockHeaders() }));

        await portalFetch('/api/login', { method: 'POST', body: '{}' });
        await portalFetch('/api/verify-session');
        await portalFetch('/api/logout', { method: 'POST' });
        const eventsOnAuthRoutes = vmPortal.dispatchedEvents.length;
        const tokenKeptOnVerify = vmPortal.exports.getAuthToken() === 'active_jwt_for_401';

        await portalFetch('/api/candidate/profile/123');
        const firedOnProtected = vmPortal.dispatchedEvents.filter(e => e.type === 'bics_auth_expired').length === 1;
        const clearedAfterProtected401 = vmPortal.exports.getAuthToken() === null;
        check(
            eventsOnAuthRoutes === 0 &&
            tokenKeptOnVerify &&
            firedOnProtected &&
            clearedAfterProtected401,
            'B.6: 401 clears credentials & fires bics_auth_expired on protected routes, but never on /login, /logout, or /verify-session'
        );

        // B.7: Online Test Terminal (frontend_ot) API client URL extraction, dual headers & 503 GET retry
        const vmOt = loadClientModuleInVm(otClientPath, 'http://localhost:5174/assessment/test?token=exam_abc&authToken=ot_jwt_123');
        const otFetch = vmOt.getPatchedFetch();
        let otAttempts = 0;
        let capturedAuthHeader = '';
        let capturedExamHeader = '';
        vmOt.setFetchImpl(async (_url, init) => {
            otAttempts += 1;
            capturedAuthHeader = init.headers.get('authorization');
            capturedExamHeader = init.headers.get('x-exam-token');
            if (otAttempts === 1) {
                return { ok: false, status: 503, headers: new MockHeaders({ 'content-type': 'text/html' }), text: async () => '<html>Booting</html>' };
            }
            return { ok: true, status: 200, headers: new MockHeaders({ 'content-type': 'application/json' }), json: async () => ({ status: 'ok' }) };
        });
        const otRes = await otFetch('/api/health');
        const otJson = await vmOt.exports.safeReadJson(otRes);
        check(
            otRes.status === 200 &&
            otJson?.status === 'ok' &&
            otAttempts === 2 &&
            capturedAuthHeader === 'Bearer ot_jwt_123' &&
            capturedExamHeader === 'exam_abc' &&
            vmOt.sessionStorage.getItem('bics_ot_auth_token') === 'ot_jwt_123' &&
            vmOt.sessionStorage.getItem('bics_exam_token') === 'exam_abc' &&
            vmOt.replacedUrls.some(u => !u.includes('authToken=')),
            'B.7: OT API client strips authToken from URL, attaches Authorization + x-exam-token, and retries GET on 503'
        );

        // =========================================================================
        // SECTION C: Pure Navigation, Redirect & Role Logic
        // =========================================================================
        console.log('\n[Section C] Navigation Sanitizer, JWT & Role Parity Helpers');

        const helpers = extractPureHelpersFromPortalApp(portalAppSrc);

        const futurePayload = Buffer.from(JSON.stringify({
            id: '671111111111111111111111',
            username: 'p5student',
            role: 'candidate',
            name: 'Pillar5 Candidate',
            exp: Math.floor(Date.now() / 1000) + 3600
        })).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
        const sampleJwt = `eyJhbGciOiJIUzI1NiJ9.${futurePayload}.sig`;

        const parsedUser = helpers.parseJwtUser(sampleJwt);
        const parsedExp = helpers.parseJwtExp(sampleJwt);

        check(
            helpers.isStudentRole('student') === true &&
            helpers.isStudentRole('candidate') === true &&
            helpers.isStudentRole('admin') === false &&
            helpers.isStudentRole(undefined) === false &&
            parsedUser?.role === 'candidate' &&
            parsedUser?.name === 'Pillar5 Candidate' &&
            typeof parsedExp === 'number' && parsedExp > Date.now(),
            'C.1: isStudentRole grants student & candidate (never admin) and parseJwtUser/parseJwtExp decode Base64Url claims'
        );

        check(
            helpers.sanitizeRedirectTarget('/main/home') === '/main/home' &&
            helpers.sanitizeRedirectTarget('%2Fcoursework%2Fonline-tests') === '/coursework/online-tests' &&
            helpers.sanitizeRedirectTarget('/login?redirect=/assessment/test?token=abc') === '/assessment/test?token=abc' &&
            helpers.sanitizeRedirectTarget('/main/login') === null &&
            helpers.sanitizeRedirectTarget('/logout?clean=1') === null &&
            helpers.sanitizeRedirectTarget('/home?clean=1') === null &&
            helpers.sanitizeRedirectTarget('') === null,
            'C.2: sanitizeRedirectTarget unwraps encoded/nested targets while blocking login/logout/clean=1 loops'
        );

        // =========================================================================
        // SECTION D: Live Express Server Role Parity & Session Recovery Checks
        // =========================================================================
        console.log('\n[Section D] Live Express Session Recovery, Navigation & Student/Candidate Role Parity');

        dbState.useMongo = false;
        dbState.isConnected = true;

        const studentMongoId = new mongoose.Types.ObjectId().toString();
        const studentBicsId = toBicsId(studentMongoId);
        const testMongoId = new mongoose.Types.ObjectId().toString();
        const testBicsId = toBicsId(testMongoId);
        const seededPasswordHash = await hashPassword('PassP5@2026');

        const seededDb = getJSONData();
        seededDb.config = {
            ...(seededDb.config || {}),
            examType: 'midsem',
            announcements: [{ id: 'p5_ann', date: 'Nov 09, 2026', text: 'Pillar 5 Live Check' }],
            timetable: [{ code: 'R526CS01T', course: 'Intro CS', date: '2026-11-20', time: '10:00 AM', marks: 50 }]
        };
        seededDb.candidates = [
            ...(seededDb.candidates || []).filter(c => c.username !== 'p5_cand_user'),
            {
                _id: studentMongoId,
                id: studentMongoId,
                studentId: '26P5BICS01',
                username: 'p5_cand_user',
                name: 'Pillar5 Student',
                password: seededPasswordHash,
                eligible: true,
                registrationSubmitted: true,
                registrationStatus: 'Approved',
                registrationData: { collegeEmail: 'p5student@example.com' }
            }
        ];
        seededDb.tests = [
            ...(seededDb.tests || []).filter(t => String(t._id) !== testMongoId),
            {
                _id: testMongoId,
                id: testMongoId,
                title: 'Pillar 5 Verification Quiz',
                course: 'Intro CS',
                courseCode: 'R526CS01T',
                marks: 10,
                duration: 30,
                isPublished: true,
                isDeleted: false,
                startDate: new Date(Date.now() - 60000).toISOString(),
                endDate: new Date(Date.now() + 3600000).toISOString(),
                questions: [
                    {
                        _id: new mongoose.Types.ObjectId().toString(),
                        id: new mongoose.Types.ObjectId().toString(),
                        type: 'mcq',
                        questionText: '2 + 2 = ?',
                        options: ['3', '4', '5'],
                        correctOptionIndex: 1,
                        points: 10
                    }
                ]
            }
        ];
        saveJSONData(seededDb);

        server = http.createServer(app);
        await new Promise((resolve) => server.listen(pipePath, resolve));

        const healthRes = await httpRequest('GET', '/api/health');
        const configRes = await httpRequest('GET', '/api/config');
        check(
            healthRes.status === 200 &&
            healthRes.body?.status === 'ok' &&
            configRes.status === 200 &&
            Array.isArray(configRes.body?.announcements) &&
            Array.isArray(configRes.body?.timetable),
            'D.1: /api/health and /api/config return valid JSON arrays for HomeDashboard & Schedule'
        );

        const loginRes = await httpRequest('POST', '/api/login', {
            username: 'p5_cand_user',
            password: 'PassP5@2026',
            rememberMe: false
        });
        const studentJwt = loginRes.body?.token;
        check(
            loginRes.status === 200 &&
            loginRes.body?.success === true &&
            loginRes.body?.role === 'student' &&
            !!studentJwt,
            'D.2: /api/login authenticates seeded candidate and issues student JWT'
        );

        const verifyValid = await httpRequest('GET', '/api/verify-session', null, { Authorization: `Bearer ${studentJwt}` });
        const verifyMissing = await httpRequest('GET', '/api/verify-session');
        const verifyInvalid = await httpRequest('GET', '/api/verify-session', null, { Authorization: 'Bearer invalid.jwt.token' });
        check(
            verifyValid.status === 200 &&
            verifyValid.body?.valid === true &&
            verifyValid.body?.user?.role === 'student' &&
            verifyMissing.status === 401 &&
            verifyMissing.body?.success === false &&
            verifyInvalid.status === 401 &&
            verifyInvalid.body?.success === false,
            'D.3: /api/verify-session returns 200 valid:true for active tokens and 401 for missing/invalid tokens'
        );

        // Candidate-role JWT (as minted by /api/tests/verify-token) must also retain portal read/test access without 403
        const candidateJwt = generateToken({
            id: studentMongoId,
            studentId: '26P5BICS01',
            role: 'candidate',
            username: 'p5_cand_user'
        }, '2h');

        const studProfileRes = await httpRequest('GET', `/api/candidate/profile/${studentBicsId}`, null, { Authorization: `Bearer ${studentJwt}` });
        const candProfileRes = await httpRequest('GET', `/api/candidate/profile/${studentBicsId}`, null, { Authorization: `Bearer ${candidateJwt}` });
        const studTestsRes = await httpRequest('GET', '/api/tests/active', null, { Authorization: `Bearer ${studentJwt}` });
        const candTestsRes = await httpRequest('GET', '/api/tests/active', null, { Authorization: `Bearer ${candidateJwt}` });
        const candSubmittedRes = await httpRequest('GET', `/api/tests/submitted?id=${studentBicsId}`, null, { Authorization: `Bearer ${candidateJwt}` });

        check(
            studProfileRes.status === 200 &&
            candProfileRes.status === 200 &&
            studProfileRes.body?.studentId === '26P5BICS01' &&
            candProfileRes.body?.studentId === '26P5BICS01' &&
            studTestsRes.status === 200 && Array.isArray(studTestsRes.body) &&
            candTestsRes.status === 200 && Array.isArray(candTestsRes.body) &&
            candSubmittedRes.status === 200 && Array.isArray(candSubmittedRes.body),
            'D.4: Both student & candidate JWTs succeed seamlessly across profile, active tests, and submitted tests endpoints'
        );

        // Token handoff round-trip + role elevation boundary check
        const genTokRes = await httpRequest('POST', '/api/tests/generate-token', {
            candidateId: studentBicsId,
            testId: testBicsId
        }, { Authorization: `Bearer ${studentJwt}` });
        const examAccessToken = genTokRes.body?.token;
        const verifyOtRes = await httpRequest('POST', '/api/tests/verify-token', { token: examAccessToken });

        const adminGateStud = await httpRequest('GET', '/api/admin/candidates', null, { Authorization: `Bearer ${studentJwt}` });
        const adminGateCand = await httpRequest('POST', '/api/admin/config', { onlineExamActive: false }, { Authorization: `Bearer ${candidateJwt}` });
        check(
            genTokRes.status === 200 &&
            !!examAccessToken &&
            verifyOtRes.status === 200 &&
            verifyOtRes.body?.success === true &&
            Array.isArray(verifyOtRes.body?.test?.questions) &&
            verifyOtRes.body?.test?.questions?.[0]?.correctOptionIndex === undefined &&
            adminGateStud.status === 403 &&
            adminGateCand.status === 403,
            'D.5: Exam token handoff strips answer keys & both student/candidate roles remain strictly blocked (403) from /api/admin/*'
        );

        console.log(`\n==============================================================`);
        console.log(`   PILLAR 5 SUITE COMPLETE: ${passed}/${total} CHECKS PASSED`);
        console.log(`==============================================================\n`);
    } finally {
        stopEirfPipelineWorker();
        stopSubmissionReaper();
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }

        if (dbBackup !== null) {
            fs.writeFileSync(DB_FILE, dbBackup, 'utf8');
        }
        dbState.useMongo = origUseMongo;
        dbState.isConnected = origIsConnected;

        for (const [k, v] of Object.entries(envBackup)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    }
}

runPillar5Suite()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('\n[PILLAR 5 TEST SUITE FAILED]', err);
        process.exit(1);
    });
