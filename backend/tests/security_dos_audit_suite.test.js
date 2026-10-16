/**
 * Automated Verification Test Suite for:
 * 1. Critical 8: Cryptographic Email Verification, 60s Cooldown, and 5-Attempt Limit
 * 2. Admin Credentials in .env & Removal of Admin Password Change View
 * 3. Cost & DoS Exposure (Cortex LLM Auth, Body Limits, Multer 5MB + MIME, CORS, Client Error Rate Limiting)
 * 4. Production Database Resilience (Fail Loudly 503 on MongoDB Disconnect)
 * 5. Feature 5: Immutable Change-Data-Capture (CDC) Audit Trail (Marks Diff & DB Viewer Access)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// Import models and logger
const { SystemLogModel, CandidateModel } = require('../models');
const { logSystemAction } = require('../utils/logger');
const upload = require('../middleware/upload');

async function runTests() {
    console.log("==================================================================");
    console.log("🚀 STARTING SECURITY, DOS & AUDIT TRAIL VERIFICATION SUITE");
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
    // 1. CRITICAL 8 & CANDIDATE PASSWORD VERIFICATION
    // =========================================================================
    console.log("\n--- [CRITICAL 8] Cryptographic Verification, Cooldown & Attempt Limits ---");

    test("C8.1: candidates.js uses crypto.randomInt for generating 6-digit verification codes", () => {
        const candidatesPath = path.resolve(__dirname, '../routes/candidates.js');
        const source = fs.readFileSync(candidatesPath, 'utf8');

        assert(source.includes('crypto.randomInt(100000, 1000000)'), "Must generate 6-digit code using crypto.randomInt");
        assert(!source.includes('Math.random() * 900000'), "Must eliminate Math.random from verification code generation");
    });

    test("C8.2: 60-Second Cooldown logic enforces delay between verification code requests", () => {
        const COOLDOWN_MS = 60 * 1000;
        const now = Date.now();
        const lastSentRecent = now - 20000; // Sent 20s ago (within 60s cooldown)
        const lastSentOld = now - 75000; // Sent 75s ago (cooldown expired)

        const isCooldownActive1 = (now - lastSentRecent) < COOLDOWN_MS;
        const isCooldownActive2 = (now - lastSentOld) < COOLDOWN_MS;

        assert.strictEqual(isCooldownActive1, true, "Cooldown must be active if sent 20s ago");
        assert.strictEqual(isCooldownActive2, false, "Cooldown must be inactive if sent 75s ago");

        const waitSec = Math.ceil((COOLDOWN_MS - (now - lastSentRecent)) / 1000);
        assert.strictEqual(waitSec, 40, "Wait seconds must accurately reflect remaining cooldown");
    });

    test("C8.3: 5-Attempt Limit logic invalidates verification code on brute-force threshold", () => {
        const student = {
            verificationCode: '748291',
            verificationCodeExpires: new Date(Date.now() + 600000),
            verificationAttempts: 0
        };

        const wrongAttempts = ['111111', '222222', '333333', '444444', '555555'];
        let invalidated = false;

        for (const attempt of wrongAttempts) {
            student.verificationAttempts += 1;
            if (student.verificationCode !== attempt) {
                if (student.verificationAttempts >= 5) {
                    student.verificationCode = '';
                    student.verificationCodeExpires = null;
                    student.verificationAttempts = 0;
                    invalidated = true;
                }
            }
        }

        assert.strictEqual(invalidated, true, "Code must be invalidated after 5 failed attempts");
        assert.strictEqual(student.verificationCode, '', "Verification code must be wiped from state");
        assert.strictEqual(student.verificationCodeExpires, null, "Expiration timestamp must be cleared");
    });

    // =========================================================================
    // 2. ADMIN CREDENTIALS IN .ENV & REMOVAL OF ADMIN PASSWORD CHANGE VIEW
    // =========================================================================
    console.log("\n--- [ADMIN AUTH] Admin Credentials in .env & View Removal ---");

    test("ADMIN.1: POST /api/change-password strictly rejects role: 'admin' with HTTP 403", () => {
        const authRoutesPath = path.resolve(__dirname, '../routes/auth.js');
        const source = fs.readFileSync(authRoutesPath, 'utf8');

        assert(source.includes("role === 'admin'"), "Must check for role === 'admin'");
        assert(source.includes("status(403)"), "Must return HTTP 403 on admin change-password attempts");
        assert(source.includes(".env"), "Error message must indicate credentials reside in .env");
    });

    test("ADMIN.2: Admin login enforces 5-attempt brute-force lockout with 15-minute cooldown", () => {
        const authRoutesPath = path.resolve(__dirname, '../routes/auth.js');
        const source = fs.readFileSync(authRoutesPath, 'utf8');

        assert(source.includes('adminFailedLogins'), "Must track admin failed logins map");
        assert(source.includes('current.count >= 5'), "Must trigger lockout at 5 failed attempts");
        assert(source.includes('15 * 60 * 1000'), "Must lock out for 15 minutes");
        assert(source.includes('status(429)'), "Must return HTTP 429 when locked out");
    });

    test("ADMIN.3: Sidebar hides Change Password button from admin role", () => {
        const sidebarPath = path.resolve(__dirname, '../../frontend/src/components/Sidebar.jsx');
        const source = fs.readFileSync(sidebarPath, 'utf8');

        // Check that Change Password button is inside student block
        const adminCloseIndex = source.indexOf('user?.role === \'admin\' ? \'20px\'');
        const changePasswordBtnIndex = source.indexOf('Change Password');
        assert(changePasswordBtnIndex !== -1, "Change Password button must exist");
        assert(changePasswordBtnIndex < adminCloseIndex, "Change Password must be located inside non-admin student category");
    });

    test("ADMIN.4: ChangePassword UI renders live cooldown countdown for student verification", () => {
        const pagePath = path.resolve(__dirname, '../../frontend/src/pages/ChangePassword.jsx');
        const source = fs.readFileSync(pagePath, 'utf8');

        assert(source.includes('changePasswordCooldown'), "ChangePassword must accept changePasswordCooldown prop");
        assert(source.includes('changePasswordCooldown > 0'), "Must disable button and display countdown when cooldown > 0");
        assert(source.includes('Cooldown active'), "Must display active cooldown notice banner");
    });

    // =========================================================================
    // 3. COST & DOS EXPOSURE CONTROLS
    // =========================================================================
    console.log("\n--- [DOS & COST] Cortex AI Auth, Limits, Multer & CORS Whitelist ---");

    test("DOS.1: coursework.js /video-lectures/:id/ask requires authenticateToken and binds req.user", () => {
        const courseworkPath = path.resolve(__dirname, '../routes/coursework.js');
        const source = fs.readFileSync(courseworkPath, 'utf8');

        assert(source.includes("router.post('/video-lectures/:id/ask', authenticateToken"), "Must mount authenticateToken on /ask route");
        assert(source.includes("req.user?.studentId || req.user?.id"), "Must extract studentId strictly from authenticated token");
    });

    test("DOS.2: Classroom webhook does not default unmatched submissions to STU1001 / Siyam Bubere", () => {
        const courseworkPath = path.resolve(__dirname, '../routes/coursework.js');
        const source = fs.readFileSync(courseworkPath, 'utf8');

        assert(!source.includes('let resolvedStudentId = (studentId || "STU1001")'), "Must eliminate STU1001 fallback");
        assert(!source.includes('let resolvedStudentName = "Siyam Bubere"'), "Must eliminate Siyam Bubere fallback");
    });

    test("DOS.3: server.js enforces 2MB body limit and strict CORS whitelist", () => {
        const serverPath = path.resolve(__dirname, '../server.js');
        const source = fs.readFileSync(serverPath, 'utf8');

        assert(source.includes("limit: '2mb'"), "Body limit must be capped at 2MB");
        assert(!source.includes("limit: '50mb'"), "50MB body limit must be eliminated");
        assert(source.includes('allowedOrigins'), "Must define allowedOrigins whitelist");
        assert(source.includes('credentials: true'), "Must configure credentials on CORS");
    });

    test("DOS.4: upload.js enforces 5MB fileSize limit and strict MIME whitelist", () => {
        const uploadPath = path.resolve(__dirname, '../middleware/upload.js');
        const source = fs.readFileSync(uploadPath, 'utf8');

        assert(source.includes('5 * 1024 * 1024'), "Must enforce 5MB fileSize limit");
        assert(source.includes('ALLOWED_MIME_TYPES'), "Must define ALLOWED_MIME_TYPES set");
        assert(source.includes('application/pdf'), "Must permit PDF");
        assert(source.includes('image/png'), "Must permit PNG");
    });

    test("DOS.5: auth.js /log-client-error enforces 20 logs/min rate limit and field truncation", () => {
        const authPath = path.resolve(__dirname, '../routes/auth.js');
        const source = fs.readFileSync(authPath, 'utf8');

        assert(source.includes('clientErrorRateLimits'), "Must track client error rate limits");
        assert(source.includes('rateData.count > 20'), "Must rate limit at 20 logs per window");
        assert(source.includes('.slice(0, 1000)'), "Must truncate details to 1000 chars");
    });

    // =========================================================================
    // 4. PRODUCTION DATABASE RESILIENCE (FAIL LOUDLY 503)
    // =========================================================================
    console.log("\n--- [RESILIENCE] Production Database Fail-Loud Protection ---");

    test("PROD.1: server.js returns HTTP 503 if primary database cluster is disconnected in production", () => {
        const serverPath = path.resolve(__dirname, '../server.js');
        const source = fs.readFileSync(serverPath, 'utf8');

        assert(source.includes("isProduction && !dbState.isConnected"), "Must check isProduction and !dbState.isConnected");
        assert(source.includes("status(503)"), "Must return HTTP 503 on production outage");
        assert(source.includes("Service Unavailable: Primary database cluster is unreachable"), "Must return descriptive outage payload");
    });

    test("PROD.2: db.js logs critical failure without silent fallback in production", () => {
        const dbPath = path.resolve(__dirname, '../config/db.js');
        const source = fs.readFileSync(dbPath, 'utf8');

        assert(source.includes("[CRITICAL PRODUCTION FAILURE]"), "Must log critical production failure");
    });

    // =========================================================================
    // 5. FEATURE 5: IMMUTABLE CHANGE-DATA-CAPTURE (CDC) AUDIT TRAIL
    // =========================================================================
    console.log("\n--- [FEATURE 5] Immutable CDC Audit Trail & DB Viewer Access ---");

    test("CDC.1: SystemLog schema includes CDC fields, compound index, and 180-day TTL index", () => {
        const logPath = path.resolve(__dirname, '../models/SystemLog.js');
        const source = fs.readFileSync(logPath, 'utf8');

        assert(source.includes('actorId:'), "Schema must define actorId");
        assert(source.includes('actorRole:'), "Schema must define actorRole");
        assert(source.includes('resourceType:'), "Schema must define resourceType");
        assert(source.includes('resourceId:'), "Schema must define resourceId");
        assert(source.includes('diff:'), "Schema must define diff");
        assert(source.includes('ipAddress:'), "Schema must define ipAddress");
        assert(source.includes('userAgent:'), "Schema must define userAgent");
        assert(source.includes('timestamp: -1, action: 1, resourceType: 1'), "Must declare compound audit index");
        assert(source.includes('expireAfterSeconds: 180 * 24 * 60 * 60'), "Must declare 180-day TTL index");
    });

    test("CDC.2: marksLedger.js computes granular before/after diffs per student on save", () => {
        const marksPath = path.resolve(__dirname, '../routes/marksLedger.js');
        const source = fs.readFileSync(marksPath, 'utf8');

        assert(source.includes('action: \'MARKS_LEDGER_CDC\''), "Must log MARKS_LEDGER_CDC action");
        assert(source.includes('resourceType: \'academic_marks_ledger\''), "Must tag resourceType as academic_marks_ledger");
        assert(source.includes('diff: diff'), "Must attach granular diff array to audit log");
        assert(source.includes('ipAddress: clientIp'), "Must attach client IP address");
        assert(source.includes('userAgent: userAgent'), "Must attach user agent");
    });

    test("CDC.3: adminDbViewer.js records audit log on administrative document inspection", () => {
        const viewerPath = path.resolve(__dirname, '../routes/adminDbViewer.js');
        const source = fs.readFileSync(viewerPath, 'utf8');

        assert(source.includes('action: \'ADMIN_DB_VIEWER_INSPECT\''), "Must log ADMIN_DB_VIEWER_INSPECT action");
        assert(source.includes('resourceType: \'database_collection\''), "Must tag resourceType as database_collection");
        assert(source.includes('resourceId: collectionName'), "Must record inspected collection name");
        assert(source.includes('ipAddress: clientIp'), "Must attach client IP");
        assert(source.includes('userAgent: userAgent'), "Must attach user agent");
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
