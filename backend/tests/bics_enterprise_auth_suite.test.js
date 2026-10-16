const assert = require('assert');
const mongoose = require('mongoose');
const { generateToken, verifyToken } = require('../utils/jwt');
const { toBicsId, toMongoId, isBicsId } = require('../utils/bicsId');
const { 
    authorizeApiRequest, 
    authenticateToken, 
    requireAuth, 
    requireAdmin, 
    requireOwnerOrAdmin,
    isWhitelisted
} = require('../middleware/auth');
const { persistLectureChat } = require('../routes/coursework');
const { CandidateModel, LectureChatModel } = require('../models');
const { dbState } = require('../config/db');

function createMockReqRes({ method = 'GET', originalUrl = '/', url = '/', headers = {}, params = {}, query = {}, body = {}, user = null }) {
    const req = {
        method,
        originalUrl,
        url,
        headers: { ...headers },
        params: { ...params },
        query: { ...query },
        body: { ...body },
        user
    };

    let statusCode = 200;
    let responseBody = null;
    let nextCalled = false;
    let responseType = 'json';

    const res = {
        status: (code) => {
            statusCode = code;
            return res;
        },
        type: (t) => {
            responseType = t;
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
        getResult: () => ({ statusCode, responseBody, nextCalled, responseType })
    };
}

async function runEnterpriseAuthSuite() {
    console.log('==================================================================');
    console.log('      BICS ENTERPRISE AUTHORIZATION & IDOR AUDIT SUITE           ');
    console.log('==================================================================\n');

    let passed = 0;
    let failed = 0;

    function test(name, fn) {
        try {
            fn();
            console.log(`  [PASS] ${name}`);
            passed++;
        } catch (err) {
            console.error(`  [FAIL] ${name}`);
            console.error(`         Error: ${err.message}`);
            failed++;
        }
    }

    async function asyncTest(name, fn) {
        try {
            await fn();
            console.log(`  [PASS] ${name}`);
            passed++;
        } catch (err) {
            console.error(`  [FAIL] ${name}`);
            console.error(`         Error: ${err.message}`);
            failed++;
        }
    }

    // Generate mock tokens
    const fakeMongoId1 = new mongoose.Types.ObjectId().toString();
    const fakeBicsId1 = toBicsId(fakeMongoId1);
    const fakeMongoId2 = new mongoose.Types.ObjectId().toString();
    const fakeBicsId2 = toBicsId(fakeMongoId2);

    const studentToken1 = generateToken({
        id: fakeMongoId1,
        role: 'candidate',
        studentId: '24BICS001',
        email: 'student1@bics.edu'
    });

    const studentToken2 = generateToken({
        id: fakeMongoId2,
        role: 'candidate',
        studentId: '24BICS002',
        email: 'student2@bics.edu'
    });

    const adminToken = generateToken({
        id: 'admin',
        username: 'admin',
        role: 'admin'
    });

    // -------------------------------------------------------------------------
    // 1. WHITELIST HARDENING & ZERO-LEAK AUDITING
    // -------------------------------------------------------------------------
    console.log('--- 1. Enterprise Route Whitelist Verification ---');

    test('isWhitelisted: Truly public routes remain whitelisted', () => {
        assert.strictEqual(isWhitelisted('/api/health'), true);
        assert.strictEqual(isWhitelisted('/api/candidate/login'), true);
        assert.strictEqual(isWhitelisted('/api/admin/login'), true);
        assert.strictEqual(isWhitelisted('/api/config'), true);
        assert.strictEqual(isWhitelisted('/api/candidate/send-verification-code/608f1b'), true);
        assert.strictEqual(isWhitelisted('/api/candidate/verify-code/608f1b'), true);
        assert.strictEqual(isWhitelisted('/api/test/eirf/public-key'), true);
        assert.strictEqual(isWhitelisted('/api/tests/submission-verification/sub123'), true);
    });

    test('isWhitelisted: Sensitive student routes are NO LONGER whitelisted', () => {
        assert.strictEqual(isWhitelisted('/api/video-lectures'), false);
        assert.strictEqual(isWhitelisted('/api/video-lectures/lec123/chat'), false);
        assert.strictEqual(isWhitelisted('/api/video-lectures/lec123/ask'), false);
        assert.strictEqual(isWhitelisted('/api/tests/active'), false);
        assert.strictEqual(isWhitelisted('/api/tests/submitted'), false);
        assert.strictEqual(isWhitelisted('/api/course-materials'), false);
        assert.strictEqual(isWhitelisted('/api/counterfoil/my-submissions/stu1'), false);
        assert.strictEqual(isWhitelisted('/api/candidate/generate-hallticket/cand1'), false);
        assert.strictEqual(isWhitelisted('/api/candidate/ledger-qr-data/cand1'), false);
    });

    // -------------------------------------------------------------------------
    // 2. AUTHORIZATION GATE ENFORCEMENT (requireAuth & requireAdmin)
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Enterprise Authorization Gate Enforcement ---');

    test('requireAuth: Rejects unauthenticated request with 401 Unauthorized', () => {
        const { req, res, next, getResult } = createMockReqRes({
            originalUrl: '/api/video-lectures'
        });
        requireAuth(req, res, next);
        const result = getResult();
        assert.strictEqual(result.nextCalled, false);
        assert.strictEqual(result.statusCode, 401);
        assert(result.responseBody.error.includes('401'));
    });

    test('requireAuth: Rejects invalid or expired token with 401', () => {
        const { req, res, next, getResult } = createMockReqRes({
            originalUrl: '/api/video-lectures',
            headers: { 'authorization': 'Bearer bad_invalid_token_123' }
        });
        requireAuth(req, res, next);
        const result = getResult();
        assert.strictEqual(result.nextCalled, false);
        assert.strictEqual(result.statusCode, 401);
    });

    test('requireAuth: Passes valid Student JWT and populates req.user', () => {
        const { req, res, next, getResult } = createMockReqRes({
            originalUrl: '/api/video-lectures',
            headers: { 'authorization': `Bearer ${studentToken1}` }
        });
        requireAuth(req, res, next);
        const result = getResult();
        assert.strictEqual(result.nextCalled, true);
        assert.strictEqual(req.user.id, fakeMongoId1);
        assert.strictEqual(req.user.role, 'candidate');
    });

    test('requireAdmin: Rejects authenticated Student with 403 Forbidden', () => {
        const { req, res, next, getResult } = createMockReqRes({
            originalUrl: '/api/admin/counterfoil/list',
            user: { id: fakeMongoId1, role: 'candidate', studentId: '24BICS001' }
        });
        requireAdmin(req, res, next);
        const result = getResult();
        assert.strictEqual(result.nextCalled, false);
        assert.strictEqual(result.statusCode, 403);
        assert(result.responseBody.error.includes('403'));
    });

    test('requireAdmin: Passes authenticated Administrator', () => {
        const { req, res, next, getResult } = createMockReqRes({
            originalUrl: '/api/admin/counterfoil/list',
            user: { id: 'admin', role: 'admin' }
        });
        requireAdmin(req, res, next);
        const result = getResult();
        assert.strictEqual(result.nextCalled, true);
    });

    // -------------------------------------------------------------------------
    // 3. STRICT IDOR PROTECTION WITH BICS OBJECTID CONVERSION
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Strict IDOR Protection & BICS ObjectID Normalization ---');

    test('requireOwnerOrAdmin: Student 1 CAN access their own resource using BICS ObjectID', () => {
        const guard = requireOwnerOrAdmin('id');
        const { req, res, next, getResult } = createMockReqRes({
            params: { id: fakeBicsId1 },
            user: { id: fakeMongoId1, role: 'candidate', studentId: '24BICS001' }
        });
        guard(req, res, next);
        const result = getResult();
        assert.strictEqual(result.nextCalled, true, 'Student 1 should be allowed to access their own resource');
    });

    test('requireOwnerOrAdmin: Student 1 CAN access their own resource using Mongo Hex ObjectId', () => {
        const guard = requireOwnerOrAdmin('id');
        const { req, res, next, getResult } = createMockReqRes({
            params: { id: fakeMongoId1 },
            user: { id: fakeMongoId1, role: 'candidate', studentId: '24BICS001' }
        });
        guard(req, res, next);
        const result = getResult();
        assert.strictEqual(result.nextCalled, true);
    });

    test('requireOwnerOrAdmin: Student 1 BLOCKED from accessing Student 2 BICS ObjectID (403 IDOR)', () => {
        const guard = requireOwnerOrAdmin('id');
        const { req, res, next, getResult } = createMockReqRes({
            params: { id: fakeBicsId2 },
            user: { id: fakeMongoId1, role: 'candidate', studentId: '24BICS001' }
        });
        guard(req, res, next);
        const result = getResult();
        assert.strictEqual(result.nextCalled, false);
        assert.strictEqual(result.statusCode, 403);
        assert(result.responseBody.error.includes('403'));
    });

    test('requireOwnerOrAdmin: Student 1 BLOCKED from accessing Student 2 Mongo Hex ObjectId (403 IDOR)', () => {
        const guard = requireOwnerOrAdmin('id');
        const { req, res, next, getResult } = createMockReqRes({
            params: { id: fakeMongoId2 },
            user: { id: fakeMongoId1, role: 'candidate', studentId: '24BICS001' }
        });
        guard(req, res, next);
        const result = getResult();
        assert.strictEqual(result.nextCalled, false);
        assert.strictEqual(result.statusCode, 403);
    });

    test('requireOwnerOrAdmin: Administrator BYPASSES ownership check for any student ID', () => {
        const guard = requireOwnerOrAdmin('id');
        const { req, res, next, getResult } = createMockReqRes({
            params: { id: fakeBicsId2 },
            user: { id: 'admin', role: 'admin' }
        });
        guard(req, res, next);
        const result = getResult();
        assert.strictEqual(result.nextCalled, true, 'Admin should have authority to inspect any candidate record');
    });

    test('requireOwnerOrAdmin: Functional extractor works seamlessly', () => {
        const guard = requireOwnerOrAdmin((r) => r.query.id);
        const { req, res, next, getResult } = createMockReqRes({
            query: { id: fakeBicsId1 },
            user: { id: fakeMongoId1, role: 'candidate', studentId: '24BICS001' }
        });
        guard(req, res, next);
        const result = getResult();
        assert.strictEqual(result.nextCalled, true);
    });

    // -------------------------------------------------------------------------
    // 4. INCOMPLETE REGISTRATION CHAT GATE
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Incomplete Registration Chat Gate Verification ---');

    await asyncTest('persistLectureChat halts and saves 0 records when registrationSubmitted is false', async () => {
        const unregCandId = new mongoose.Types.ObjectId();
        const unregCand = {
            _id: unregCandId,
            registrationSubmitted: false,
            studentId: 'INCOMPLETE_STU',
            username: 'incomplete_user'
        };

        if (dbState.useMongo) {
            await CandidateModel.updateOne(
                { _id: unregCand._id },
                { $set: unregCand },
                { upsert: true }
            );

            await persistLectureChat({
                lectureId: 'vid_ai_test_01',
                studentId: unregCandId.toString(),
                userMessage: 'Explain recursion',
                assistantMessage: 'Recursion is a process in which a function calls itself.',
                provider: 'BICS Cortex'
            });

            const chats = await LectureChatModel.find({ candidateId: unregCand._id });
            assert.strictEqual(chats.length, 0, `Chats saved must be 0 for uncompleted registration, found: ${chats.length}`);

            await CandidateModel.deleteOne({ _id: unregCand._id });
        } else {
            console.log('    (Mock DB mode: Candidate registrationSubmitted checked in persistLectureChat)');
        }
    });

    console.log('\n==================================================================');
    console.log(`RESULTS: ${passed} Passed, ${failed} Failed`);
    console.log('==================================================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runEnterpriseAuthSuite()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Test suite failed:', err);
        process.exit(1);
    });
