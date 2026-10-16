const http = require('http');
const mongoose = require('mongoose');
const { toBicsId, toMongoId, isBicsId, isMongoId, obfuscateObjectIds, deobfuscateBicsIds } = require('../utils/bicsId');

process.env.PORT = '5003';
process.env.JWT_SECRET = 'audit_test_secret_key_2026';
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASS = 'admin123';
process.env.API_ACCESS_SECRET = 'audit_test_api_access_secret';

const app = require('../server');

function makeRequest({ method = 'GET', path, headers = {}, body = null, port = 5003 }) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const options = {
            hostname: '127.0.0.1',
            port,
            path,
            method,
            headers: {
                ...headers,
                ...(payload ? {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                } : {})
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = data;
                try {
                    parsed = JSON.parse(data);
                } catch (e) {}
                resolve({ status: res.statusCode, headers: res.headers, body: parsed });
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function runCrudAudit() {
    console.log('\n====================================================');
    console.log('   STARTING BICS OBJID CRUD & LIFECYCLE AUDIT       ');
    console.log('====================================================\n');

    let server;
    let passed = 0;
    let total = 0;

    const assert = (condition, msg) => {
        total++;
        if (condition) {
            console.log(`[PASS] ${msg}`);
            passed++;
        } else {
            console.error(`[FAIL] ${msg}`);
            throw new Error(`Assertion failed: ${msg}`);
        }
    };

    try {
        server = await new Promise((resolve) => {
            const s = app.listen(5003, '127.0.0.1', () => {
                console.log('[TEST HARNESS] CRUD Audit server listening on port 5003\n');
                resolve(s);
            });
        });

        await new Promise(r => setTimeout(r, 1500));

        // 1. Admin login to obtain JWT
        const adminLogin = await makeRequest({
            method: 'POST',
            path: '/api/login',
            body: { username: 'admin', password: 'admin123' }
        });
        assert(adminLogin.status === 200 && adminLogin.body.token, 'Test 1: Admin login returns JWT');
        const adminToken = adminLogin.body.token;

        // 2. Fetch candidates list
        const candidatesRes = await makeRequest({
            method: 'GET',
            path: '/api/admin/candidates',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        assert(candidatesRes.status === 200 && Array.isArray(candidatesRes.body), 'Test 2: GET /api/admin/candidates returns array');
        
        let sampleCandidate = candidatesRes.body[0];
        if (!sampleCandidate) {
            // Register a candidate for testing
            const regRes = await makeRequest({
                method: 'POST',
                path: '/api/admin/register-candidate',
                headers: { 'Authorization': `Bearer ${adminToken}` },
                body: {
                    studentId: `STU_${Date.now()}`,
                    name: 'BicsId Test Candidate',
                    username: `bics_${Date.now()}`,
                    password: 'password123',
                    eligible: true
                }
            });
            sampleCandidate = regRes.body.candidate;
        }

        const candidateBicsId = sampleCandidate._id || sampleCandidate.id;
        assert(isBicsId(candidateBicsId), `Test 3: Candidate _id is BICS ObjId (${candidateBicsId})`);

        // 3. GET /api/candidate/profile/:bicsId using BICS ObjId in URL
        const candDetailRes = await makeRequest({
            method: 'GET',
            path: `/api/candidate/profile/${candidateBicsId}`,
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        assert(candDetailRes.status === 200 && candDetailRes.body.studentId, 'Test 4: GET /api/candidate/profile/:bicsId succeeds using BICS ObjId in URL');

        // 4. POST /api/candidate/tickets/:bicsId - Create Helpdesk Ticket using BICS ObjId in URL
        const ticketRes = await makeRequest({
            method: 'POST',
            path: `/api/candidate/tickets/${candidateBicsId}`,
            headers: { 'Authorization': `Bearer ${adminToken}` },
            body: {
                category: 'Examination',
                subject: 'BICS ObjId Verification Ticket',
                message: 'Testing BICS ObjId lifecycle and parameter deobfuscation.'
            }
        });
        assert(ticketRes.status === 200 && ticketRes.body.ticket, 'Test 5: POST /api/candidate/tickets/:bicsId creates ticket successfully');
        const createdTicket = ticketRes.body.ticket;
        const ticketBicsId = createdTicket._id;
        assert(isBicsId(ticketBicsId), `Test 6: Created ticket _id is BICS ObjId (${ticketBicsId})`);
        assert(isBicsId(createdTicket.candidateId), `Test 7: Created ticket candidateId is BICS ObjId (${createdTicket.candidateId})`);

        // 5. GET /api/candidate/tickets/list/:bicsId - List student tickets using BICS ObjId in URL
        const listTicketsRes = await makeRequest({
            method: 'GET',
            path: `/api/candidate/tickets/list/${candidateBicsId}`,
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        assert(listTicketsRes.status === 200 && Array.isArray(listTicketsRes.body.tickets), 'Test 8: GET /api/candidate/tickets/list/:bicsId succeeds');
        const foundTicket = listTicketsRes.body.tickets.find(t => t._id === ticketBicsId);
        assert(!!foundTicket, 'Test 9: Found created ticket in candidate ticket list');

        // 6. POST /api/admin/tickets/resolve/:ticketBicsId - Admin resolves ticket using BICS ObjId in URL
        const resolveRes = await makeRequest({
            method: 'POST',
            path: `/api/admin/tickets/resolve/${ticketBicsId}`,
            headers: { 'Authorization': `Bearer ${adminToken}` },
            body: {
                status: 'resolved',
                resolutionFeedback: 'Ticket verified and resolved with BICS ObjId.'
            }
        });
        assert(resolveRes.status === 200 && resolveRes.body.ticket?.status === 'resolved', 'Test 10: Admin resolves ticket using BICS ObjId in URL');

        console.log('\n====================================================');
        console.log(`CRUD AUDIT COMPLETE: ${passed}/${total} TESTS PASSED (100%)`);
        console.log('====================================================\n');

    } catch (err) {
        console.error('Audit failed with error:', err);
        process.exitCode = 1;
    } finally {
        if (server) {
            server.close();
        }
        process.exit(process.exitCode || 0);
    }
}

runCrudAudit();
