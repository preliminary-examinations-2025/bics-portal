const http = require('http');
const mongoose = require('mongoose');
const { toBicsId, toMongoId, isBicsId, isMongoId, resolveToObjectId, obfuscateObjectIds, deobfuscateBicsIds } = require('../utils/bicsId');

const PORT = 5002;
process.env.PORT = PORT;
process.env.JWT_SECRET = 'test_bicsid_jwt_secret_9c915b721d2c4abaa5c49c279dd23f68';
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASS = 'admin123';

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

async function runBicsIdAudit() {
    console.log('====================================================');
    console.log('   STARTING FULL BICS OBJID PORTAL AUDIT SUITE      ');
    console.log('====================================================\n');

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

    // 1. Cryptographic bijection & format tests
    const sampleHex = '6a5b5e98b815f34fea0cfd13';
    const bicsId = toBicsId(sampleHex);
    assertTest('Crypto-1: toBicsId produces valid 6-4-4-6 format', isBicsId(bicsId), `Output: ${bicsId}`);
    
    const recoveredHex = toMongoId(bicsId);
    assertTest('Crypto-2: toMongoId exactly recovers original 24-hex ObjectId', recoveredHex === sampleHex, `Recovered: ${recoveredHex}`);

    // Tamper detection
    const tampered = bicsId.slice(0, 5) + 'x' + bicsId.slice(6);
    const tamperedResult = toMongoId(tampered);
    assertTest('Crypto-3: Tampered BICS ObjId is rejected by checksum', tamperedResult === null, `Got: ${tamperedResult}`);

    // Object recursive obfuscation
    const testDoc = {
        _id: new mongoose.Types.ObjectId(sampleHex),
        title: 'Mid Sem Exam',
        candidateId: sampleHex,
        nested: {
            testId: sampleHex,
            plainValue: 'hello'
        }
    };
    const obfuscated = obfuscateObjectIds(testDoc);
    assertTest('Crypto-4: obfuscateObjectIds masks _id, candidateId, and nested testId', 
        isBicsId(obfuscated._id) && isBicsId(obfuscated.candidateId) && isBicsId(obfuscated.nested.testId) && obfuscated.nested.plainValue === 'hello',
        JSON.stringify(obfuscated)
    );

    // Object recursive deobfuscation
    const deobfuscated = deobfuscateBicsIds(obfuscated);
    assertTest('Crypto-5: deobfuscateBicsIds recovers original 24-hex IDs',
        deobfuscated._id === sampleHex && deobfuscated.candidateId === sampleHex && deobfuscated.nested.testId === sampleHex,
        JSON.stringify(deobfuscated)
    );

    // 2. Live HTTP API Integration Testing
    const app = require('../server');
    let server;
    await new Promise((resolve) => {
        server = http.createServer(app).listen(PORT, '127.0.0.1', () => {
            console.log(`\n[TEST HARNESS] BICS ObjId audit server listening on port ${PORT}\n`);
            resolve();
        });
    });

    try {
        // Admin Login to get token
        const resAdminLogin = await request('POST', '/api/login', {
            username: 'admin',
            password: 'admin123'
        });
        const adminToken = resAdminLogin.body?.token;
        assertTest('API-1: Admin login succeeds', resAdminLogin.status === 200 && !!adminToken);

        // Fetch configured tests via Admin API
        const resTests = await request('GET', '/api/admin/tests', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        assertTest('API-2: Admin tests returned as array', resTests.status === 200 && Array.isArray(resTests.body));

        if (Array.isArray(resTests.body) && resTests.body.length > 0) {
            const firstTest = resTests.body[0];
            const testBicsId = firstTest._id || firstTest.id;
            assertTest('API-3: Test _id in response is obfuscated as BICS ObjId (6-4-4-6)', isBicsId(testBicsId), `Received _id: ${testBicsId}`);

            // Fetch specific test using BICS ObjId in URL: GET /api/tests/:bicsId
            const resGetTest = await request('GET', `/api/tests/${testBicsId}`, null, {
                'Authorization': `Bearer ${adminToken}`
            });
            assertTest('API-4: GET /api/tests/:bicsId succeeds using BICS ObjId in URL', resGetTest.status === 200 && (resGetTest.body?.title === firstTest.title), `Status: ${resGetTest.status}`);

            // Backward compatibility: Fetch specific test using original Mongo Hex ID
            const originalHex = toMongoId(testBicsId);
            const resGetTestHex = await request('GET', `/api/tests/${originalHex}`, null, {
                'Authorization': `Bearer ${adminToken}`
            });
            assertTest('API-5: GET /api/tests/:hexId succeeds using raw Mongo ID (backward compat)', resGetTestHex.status === 200, `Status: ${resGetTestHex.status}`);
        }

        // Check active tests endpoint
        const resActive = await request('GET', '/api/tests/active', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        assertTest('API-6: GET /api/tests/active returns 200 with BICS ObjId identifiers', 
            resActive.status === 200 && Array.isArray(resActive.body) && (resActive.body.length === 0 || isBicsId(resActive.body[0]._id))
        );

    } finally {
        server.close();
        console.log('\n====================================================');
        const allPassed = results.every(r => r.passed);
        console.log(`BICS OBJID AUDIT RESULT: ${allPassed ? 'ALL TESTS PASSED (100%)' : 'SOME TESTS FAILED'}`);
        console.log('====================================================\n');
        process.exit(allPassed ? 0 : 1);
    }
}

runBicsIdAudit().catch(err => {
    console.error('BICS ObjId audit suite crashed:', err);
    process.exit(1);
});
