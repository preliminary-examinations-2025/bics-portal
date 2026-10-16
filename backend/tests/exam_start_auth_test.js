const assert = require('assert');
const mongoose = require('mongoose');
const { generateToken, verifyToken } = require('../utils/jwt');
const { toBicsId, toMongoId } = require('../utils/bicsId');
const { authorizeApiRequest, requireAuth } = require('../middleware/auth');
const { dbState, getJSONData, saveJSONData } = require('../config/db');

function createMockReqRes({ method = 'POST', originalUrl = '/', url = '/', headers = {}, params = {}, query = {}, body = {}, user = null }) {
    const req = {
        method,
        originalUrl,
        url,
        path: originalUrl.split('?')[0],
        headers: { ...headers },
        params: { ...params },
        query: { ...query },
        body: { ...body },
        user
    };

    let statusCode = 200;
    let responseBody = null;
    let nextCalled = false;

    const res = {
        status: (code) => {
            statusCode = code;
            return res;
        },
        json: (data) => {
            responseBody = data;
            return res;
        },
        send: (data) => {
            responseBody = data;
            return res;
        }
    };

    const next = () => {
        nextCalled = true;
    };

    return {
        req,
        res,
        next,
        getResult: () => ({ statusCode, responseBody, nextCalled })
    };
}

async function runTest() {
    console.log('Testing Exam Start & Token Authentication Pipeline...');

    const candidateId = new mongoose.Types.ObjectId().toString();
    const testId = new mongoose.Types.ObjectId().toString();
    const bicsTestId = toBicsId(testId);

    // 1. Bearer JWT authorization check
    const studentJwt = generateToken({
        id: candidateId,
        role: 'candidate',
        studentId: '24BICS099',
        username: 'candidate099'
    });

    const mockBearer = createMockReqRes({
        method: 'POST',
        originalUrl: `/api/tests/start/${bicsTestId}`,
        headers: {
            'authorization': `Bearer ${studentJwt}`
        },
        params: { id: bicsTestId },
        body: { candidateId }
    });

    await authorizeApiRequest(mockBearer.req, mockBearer.res, mockBearer.next);
    const bearerResult = mockBearer.getResult();
    assert.strictEqual(bearerResult.nextCalled, true, 'Bearer JWT request should pass authorizeApiRequest');
    assert.strictEqual(mockBearer.req.user.id, candidateId, 'req.user.id should match candidateId');
    console.log('  [PASS] 1. Bearer JWT successfully authenticates /api/tests/start/:id');

    // 2. Exam Token fallback check (in JSON/Mock mode)
    dbState.useMongo = false;
    const db = getJSONData();
    db.tokens = db.tokens || [];
    const testExamToken = 'test_token_' + Date.now();
    db.tokens.push({
        token: testExamToken,
        candidateId,
        testId,
        createdAt: new Date()
    });
    saveJSONData(db);

    const mockExamToken = createMockReqRes({
        method: 'POST',
        originalUrl: `/api/tests/start/${bicsTestId}`,
        headers: {
            'x-exam-token': testExamToken
        },
        params: { id: bicsTestId },
        body: { candidateId, token: testExamToken }
    });

    await authorizeApiRequest(mockExamToken.req, mockExamToken.res, mockExamToken.next);
    const tokenResult = mockExamToken.getResult();
    assert.strictEqual(tokenResult.nextCalled, true, 'Exam token request should pass authorizeApiRequest');
    assert.strictEqual(mockExamToken.req.user.id, candidateId, 'req.user.id should be bound from tokenDoc');
    console.log('  [PASS] 2. Active TestToken successfully authenticates /api/tests/start/:id via dual-auth');

    // 3. Unauthenticated attempt blocked
    const mockUnauth = createMockReqRes({
        method: 'POST',
        originalUrl: `/api/tests/start/${bicsTestId}`,
        params: { id: bicsTestId },
        body: { candidateId }
    });

    await authorizeApiRequest(mockUnauth.req, mockUnauth.res, mockUnauth.next);
    const unauthResult = mockUnauth.getResult();
    assert.strictEqual(unauthResult.nextCalled, false, 'Unauthenticated request must NOT proceed');
    assert.strictEqual(unauthResult.statusCode, 401, 'Unauthenticated request must return 401');
    console.log('  [PASS] 3. Unauthenticated request without JWT or valid TestToken is strictly blocked with 401');

    console.log('\nAll Exam Auth Pipeline Tests Passed!');
}

runTest().catch(err => {
    console.error('Test Failed:', err);
    process.exit(1);
});
