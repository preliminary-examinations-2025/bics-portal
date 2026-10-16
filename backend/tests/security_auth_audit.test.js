/**
 * Comprehensive Security & Penetration Verification Suite
 * Tests T-01 through T-08 across authentication, authorization, and data redaction.
 */

const http = require('http');

const PORT = 5001; // Run test server on separate port to avoid conflicts
process.env.PORT = PORT;
process.env.JWT_SECRET = 'test_audit_jwt_secret_hex_9c915b721d2c4abaa5c49c279dd23f68';
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASS = 'admin123';
process.env.API_ACCESS_SECRET = 'qwertty';

// Helper for making HTTP requests in tests
function request(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(path, `http://127.0.0.1:${PORT}`);
        const reqHeaders = { ...headers };
        let payload = null;

        if (body) {
            payload = typeof body === 'string' ? body : JSON.stringify(body);
            reqHeaders['Content-Type'] = 'application/json';
            reqHeaders['Content-Length'] = Buffer.byteLength(payload);
        }

        const req = http.request(parsedUrl, {
            method,
            headers: reqHeaders
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let json = null;
                try {
                    json = JSON.parse(data);
                } catch (e) {
                    json = data;
                }
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: json
                });
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function runSecurityAudit() {
    console.log('====================================================');
    console.log('   STARTING BICS SECURITY PENETRATION AUDIT        ');
    console.log('====================================================\n');

    // Boot backend server on PORT
    const app = require('../server');
    let server;
    await new Promise((resolve) => {
        server = http.createServer(app).listen(PORT, '127.0.0.1', () => {
            console.log(`[TEST HARNESS] Audit server listening on port ${PORT}\n`);
            resolve();
        });
    });

    const results = [];
    const assertTest = (name, condition, details = '') => {
        if (condition) {
            console.log(`[PASS] ${name}`);
            results.push({ name, passed: true });
        } else {
            console.error(`[FAIL] ${name} - ${details}`);
            results.push({ name, passed: false, details });
        }
    };

    try {
        // T-01: Direct unauthenticated request to /api/admin/tests
        const resT01 = await request('GET', '/api/admin/tests');
        assertTest('T-01: Direct unauthenticated request to /api/admin/tests returns 401', resT01.status === 401, `Got status ${resT01.status}`);

        // T-02: Shared secret spoofing: GET /api/admin/tests?apiSecret=qwertty
        const resT02 = await request('GET', '/api/admin/tests?apiSecret=qwertty');
        assertTest('T-02: Shared secret spoofing (?apiSecret=qwertty) is rejected on admin endpoints', resT02.status === 401, `Got status ${resT02.status}`);

        // T-04: NoSQL injection attempt on /api/login: {"username": "admin", "password": {"$ne": ""}}
        const resT04 = await request('POST', '/api/login', {
            username: 'admin',
            password: { "$ne": "" }
        });
        assertTest('T-04: NoSQL injection object payload on /api/login is rejected with 400', resT04.status === 400, `Got status ${resT04.status}`);

        // T-07: Legitimate Admin login and JWT access to /api/admin/tests
        const resAdminLogin = await request('POST', '/api/login', {
            username: 'admin',
            password: 'admin123'
        });
        const adminToken = resAdminLogin.body?.token;
        assertTest('T-07a: Admin login succeeds and returns signed JWT', resAdminLogin.status === 200 && !!adminToken, `Status: ${resAdminLogin.status}`);

        const resAdminAccess = await request('GET', '/api/admin/tests', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        assertTest('T-07b: Admin with valid JWT can access /api/admin/tests', resAdminAccess.status === 200 && Array.isArray(resAdminAccess.body), `Got status ${resAdminAccess.status}`);

        // Register a test candidate via admin API
        const testCandidateUsername = `audit_${Date.now()}`;
        const testCandidatePassword = 'AuditPassword123!';
        const resReg = await request('POST', '/api/admin/register-candidate', {
            studentId: `STU_${testCandidateUsername}`,
            name: 'Audit Test Candidate',
            username: testCandidateUsername,
            password: testCandidatePassword,
            eligible: true
        }, {
            'Authorization': `Bearer ${adminToken}`
        });
        assertTest('T-07c: Admin can register new candidate (password hashed)', resReg.status === 200 && resReg.body?.success, `Status: ${resReg.status}`);

        // T-08: Legitimate Candidate login with created candidate
        const resStudentLogin = await request('POST', '/api/login', {
            username: testCandidateUsername,
            password: testCandidatePassword
        });
        const studentToken = resStudentLogin.body?.token;
        const studentId = resStudentLogin.body?.id || resStudentLogin.body?.studentId;
        assertTest('T-08a: Student login succeeds and returns JWT', resStudentLogin.status === 200 && !!studentToken, `Status ${resStudentLogin.status}`);

        // T-03: Privilege escalation: Student JWT attempting GET /api/admin/tests
        const resStudentPrivEsc = await request('GET', '/api/admin/tests', null, {
            'Authorization': `Bearer ${studentToken}`
        });
        assertTest('T-03: Student JWT attempting /api/admin/tests is rejected with 403 Forbidden', resStudentPrivEsc.status === 403, `Got status ${resStudentPrivEsc.status}`);

        // T-05: IDOR attempt: Student querying submissions for a different candidateId
        const resIdor = await request('GET', '/api/tests/submitted?candidateId=STU9999_DIFFERENT_STUDENT', null, {
            'Authorization': `Bearer ${studentToken}`
        });
        assertTest('T-05: Student attempting to query another student submissions is rejected with 403', resIdor.status === 403, `Got status ${resIdor.status}`);

        // T-06: Database Viewer password masking check
        const resDbViewer = await request('GET', '/api/admin/db/collection/candidates', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        const candidateDocs = resDbViewer.body?.documents || [];
        const hasPlaintextPassword = candidateDocs.some(d => d.password && d.password !== '[PROTECTED HASH]' && !d.password.startsWith('$2'));
        assertTest('T-06: Database Viewer masks sensitive candidate password fields', !hasPlaintextPassword, `Password found: ${JSON.stringify(candidateDocs[0]?.password)}`);

    } finally {
        server.close();
        console.log('\n====================================================');
        const allPassed = results.every(r => r.passed);
        console.log(`AUDIT RESULT: ${allPassed ? 'ALL TESTS PASSED (100%)' : 'SOME TESTS FAILED'}`);
        console.log('====================================================\n');
        process.exit(allPassed ? 0 : 1);
    }
}

runSecurityAudit().catch(err => {
    console.error('Audit suite crashed:', err);
    process.exit(1);
});
