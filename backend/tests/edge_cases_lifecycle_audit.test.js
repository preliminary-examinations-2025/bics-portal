/**
 * edge_cases_lifecycle_audit.test.js
 * Comprehensive Forensic Audit Suite for BICS Examination Platform Lifecycle
 * 
 * Verifies fixes for:
 * 1. Checkpoint Token Replay Vulnerability (Overdue submission forged as on-time is BLOCKED)
 * 2. Duration Capping Accuracy (Real manual lateness preserved; transit buffer only applied to timer_completed <= 15s)
 * 3. Consent Timestamp Preservation (Authentic pre-exam consent time preserved, not overwritten/clamped)
 * 4. Single-Session Lockout on Refresh (Confirmed working as designed: reload/restart locks re-attempts with 400)
 * 5. Reaped Submission Resurrection Guard (Abandoned session finalized by reaper rejects resurrection with 409)
 * 6. EIRF Rule 3 Outage Exoneration (Verified server outages excused; candidate disconnects flagged)
 * 7. Annulled Submission Score Lock Against Objection Resolution (Zero points firmly locked)
 */

const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');

// Target routes & utilities
const testsRouter = require('../routes/tests');
const proctoringRouter = require('../routes/proctoring');
const objectionsRouter = require('../routes/objections');
const { getJSONData, saveJSONData } = require('../config/db');
const { generateToken } = require('../utils/jwt');
const { evaluateEirfIncident } = require('../services/eirfEvaluator');

// Build an isolated test app
const app = express();
app.use(bodyParser.json({ limit: '10mb' }));

// Attach mock user
let mockCurrentUser = null;
app.use((req, res, next) => {
    if (mockCurrentUser) {
        req.user = mockCurrentUser;
    }
    next();
});

app.use('/api/tests', testsRouter);
app.use('/api/tests/proctoring', proctoringRouter);
app.use('/api', objectionsRouter);

let server;
const pipePath = `\\\\.\\pipe\\bics_audit_${process.pid}_${Date.now()}`;

function request(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const opts = {
            socketPath: pipePath,
            path: path,
            method,
            headers: {
                'Host': '127.0.0.1:5000',
                'Content-Type': 'application/json',
                ...headers
            }
        };

        const req = http.request(opts, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = JSON.parse(data);
                } catch {
                    parsed = data;
                }
                resolve({ status: res.statusCode, headers: res.headers, body: parsed });
            });
        });

        req.on('error', reject);
        if (body) {
            req.write(typeof body === 'string' ? body : JSON.stringify(body));
        }
        req.end();
    });
}

async function runAuditSuite() {
    console.log('======================================================================');
    console.log('   DEEP EXAM LIFECYCLE & SECURITY AUDIT: EDGE CASES VERIFICATION     ');
    console.log('======================================================================\n');

    server = http.createServer(app);
    await new Promise(r => server.listen(pipePath, r));

    const auditFindings = [];

    const db = getJSONData();
    db.tests = db.tests || [];
    db.testSubmissions = db.testSubmissions || [];
    db.candidates = db.candidates || [];
    db.tokens = db.tokens || [];

    // Test Config: 30 minutes duration
    const testId = 'test_edge_audit_30m';
    const testDoc = {
        _id: testId,
        id: testId,
        title: 'Audit Examination 30M',
        course: 'Computer Science',
        courseCode: 'CS101',
        duration: 30, // 30 minutes
        marks: 100,
        isPublished: true,
        verificationStatus: 'released',
        questions: [
            { id: 'q1', _id: 'q1', type: 'scc', text: 'Q1', points: 20, correctOptionIndex: 1, options: ['A', 'B', 'C', 'D'] },
            { id: 'q2', _id: 'q2', type: 'scc', text: 'Q2', points: 30, correctOptionIndex: 0, options: ['A', 'B', 'C', 'D'] }
        ]
    };

    // Candidate
    const candidateId = 'cand_edge_audit_001';
    const candidateDoc = {
        _id: candidateId,
        id: candidateId,
        name: 'Audit Candidate',
        studentId: 'STU99999',
        username: 'auditcand'
    };

    db.tests = db.tests.filter(t => (t.id || t._id) !== testId);
    db.tests.push(testDoc);
    db.candidates = db.candidates.filter(c => (c.id || c._id) !== candidateId);
    db.candidates.push(candidateDoc);
    saveJSONData(db);

    mockCurrentUser = {
        id: candidateId,
        _id: candidateId,
        role: 'candidate',
        studentId: 'STU99999',
        username: 'auditcand'
    };

    // -------------------------------------------------------------------------
    // EDGE CASE 1: Checkpoint Token Replay Deadline Bypass (MUST BE BLOCKED)
    // -------------------------------------------------------------------------
    console.log('[PROBE 1] Verifying Checkpoint Token Replay Deadline Bypass Protection...');
    {
        const subId = 'sub_checkpoint_replay_001';
        const startTimestamp = Date.now() - (90 * 60 * 1000); // 90 mins ago
        const checkpointTime = startTimestamp + (10 * 60 * 1000); // Checkpoint issued at minute 10
        
        const validCheckpointToken = crypto
            .createHmac('sha256', process.env.JWT_SECRET || 'bics_exam_audit_secret')
            .update(`${subId}:${checkpointTime}:started`)
            .digest('hex');

        db.testSubmissions = db.testSubmissions.filter(s => (s.id || s._id) !== subId);
        db.testSubmissions.push({
            id: subId,
            _id: subId,
            submissionRefId: '123456789001',
            testId,
            candidateId,
            studentId: 'STU99999',
            candidateName: 'Audit Candidate',
            startedAt: new Date(startTimestamp),
            lastHeartbeatAt: new Date(startTimestamp + (85 * 60 * 1000)), // Sent heartbeats up to 85m
            status: 'started',
            proctoringLog: { events: [], snapshots: [] }
        });
        saveJSONData(db);

        // Candidate submits 60 minutes AFTER DEADLINE!
        // Supplies minute-10 checkpoint token and elapsedSinceCheckpointMs = 0
        const submitPayload = {
            submissionId: subId,
            status: 'submitted',
            submissionReason: 'manual',
            answers: [
                { questionId: 'q1', type: 'scc', selectedOptionIndex: 1 }
            ],
            lastCheckpointToken: validCheckpointToken,
            lastCheckpointServerTime: checkpointTime,
            elapsedSinceCheckpointMs: 0
        };

        const res = await request('POST', '/api/tests/submit', submitPayload);
        const updatedDb = getJSONData();
        const savedSub = updatedDb.testSubmissions.find(s => (s.id || s._id) === subId);

        // Security requirement: Because this was not a verified offline sync, and checkpoint was stale,
        // server must reject rollback and mark submission as auto-submitted (overtime_exceeded)
        const bypassBlocked = savedSub && (savedSub.status === 'auto-submitted' || savedSub.submissionReason === 'overtime_exceeded');
        console.log(`  -> Server response status: ${res.status}`);
        console.log(`  -> Saved submission status: ${savedSub?.status}, reason: ${savedSub?.submissionReason}`);
        assert.strictEqual(bypassBlocked, true, 'Checkpoint replay must be rejected and flagged overtime_exceeded');

        auditFindings.push({
            name: 'Checkpoint Token Replay Deadline Bypass',
            status: 'PASSED (Protected)',
            detail: 'Stale checkpoint replay was rejected; 60m overdue submission marked auto-submitted (overtime_exceeded).'
        });
    }

    // -------------------------------------------------------------------------
    // EDGE CASE 2: Duration Capping Accuracy (Real Manual Lateness Preserved)
    // -------------------------------------------------------------------------
    console.log('\n[PROBE 2] Verifying Duration Capping Preserves Real Manual Lateness...');
    {
        // Candidate started 32 minutes and 40 seconds ago (160s past 30-min deadline)
        // Candidate manually clicked "Submit Exam" at minute 32:40 (submissionReason: 'manual')
        const subId = 'sub_capping_leak_002';
        const startTimestamp = Date.now() - ((32 * 60 + 40) * 1000);
        const actualDeadline = startTimestamp + (30 * 60 * 1000);

        db.testSubmissions = db.testSubmissions.filter(s => (s.id || s._id) !== subId);
        db.testSubmissions.push({
            id: subId,
            _id: subId,
            submissionRefId: '123456789002',
            testId,
            candidateId,
            studentId: 'STU99999',
            candidateName: 'Audit Candidate',
            startedAt: new Date(startTimestamp),
            lastHeartbeatAt: new Date(),
            status: 'started',
            proctoringLog: { events: [], snapshots: [] }
        });
        saveJSONData(db);

        const res = await request('POST', '/api/tests/submit', {
            submissionId: subId,
            status: 'submitted',
            submissionReason: 'manual', // Manual submit 2m40s late
            answers: [{ questionId: 'q1', type: 'scc', selectedOptionIndex: 1 }]
        });

        const updatedDb = getJSONData();
        const savedSub = updatedDb.testSubmissions.find(s => (s.id || s._id) === subId);
        const savedSubmittedAtMs = new Date(savedSub?.submittedAt).getTime();
        const diffFromDeadline = Math.abs(savedSubmittedAtMs - actualDeadline);

        // Security requirement: Manual lateness of 160s must NOT be capped back to deadline (diffFromDeadline > 100s)
        const latenessPreserved = diffFromDeadline > 100 * 1000;
        console.log(`  -> Recorded submittedAt: ${savedSub?.submittedAt}`);
        console.log(`  -> Elapsed duration recorded: ${Math.round((savedSubmittedAtMs - startTimestamp)/1000)}s (Actual arrival: ${32*60+40}s)`);
        assert.strictEqual(latenessPreserved, true, 'Manual lateness of 160s must be preserved and not capped back to 30:00');

        auditFindings.push({
            name: 'Duration Capping Accuracy',
            status: 'PASSED (Protected)',
            detail: `Manual lateness was preserved (${Math.round((savedSubmittedAtMs - startTimestamp)/1000)}s recorded); capping only applies to timer_completed within 15s.`
        });
    }

    // -------------------------------------------------------------------------
    // EDGE CASE 3: Pre-Exam Consent Timestamps Preserved
    // -------------------------------------------------------------------------
    console.log('\n[PROBE 3] Verifying Pre-Exam Consent Timestamps Preservation...');
    {
        const subId = 'sub_consent_audit_003';
        const serverStartTime = Date.now();
        // Candidate accepted consent 4 minutes BEFORE start
        const authenticConsentTime = new Date(serverStartTime - (4 * 60 * 1000)).toISOString();

        db.testSubmissions = db.testSubmissions.filter(s => (s.id || s._id) !== subId);
        db.testSubmissions.push({
            id: subId,
            _id: subId,
            submissionRefId: '123456789003',
            testId,
            candidateId,
            studentId: 'STU99999',
            candidateName: 'Audit Candidate',
            startedAt: new Date(serverStartTime),
            lastHeartbeatAt: new Date(serverStartTime),
            status: 'started',
            proctoringLog: {
                events: [
                    { type: 'TEST_STARTED', timestamp: new Date(serverStartTime), startTime: new Date(serverStartTime) }
                ],
                snapshots: []
            }
        });
        saveJSONData(db);

        // Client logs CONSENT_ACCEPTED with authentic pre-exam timestamp
        const resConsent = await request('POST', `/api/tests/proctoring/event/${subId}`, {
            type: 'CONSENT_ACCEPTED',
            details: 'Malpractice undertaking accepted.',
            timestamp: authenticConsentTime
        });

        const updatedDb = getJSONData();
        const savedSub = updatedDb.testSubmissions.find(s => (s.id || s._id) === subId);
        const consentEvent = savedSub?.proctoringLog?.events?.find(e => e.type === 'CONSENT_ACCEPTED');
        const savedConsentTime = consentEvent ? new Date(consentEvent.timestamp).getTime() : 0;

        // Security requirement: Consent timestamp must match authentic pre-exam time within 1000ms
        const timestampPreserved = Math.abs(savedConsentTime - new Date(authenticConsentTime).getTime()) < 1000;
        console.log(`  -> Authentic consent time sent: ${authenticConsentTime}`);
        console.log(`  -> Persisted consent event timestamp: ${consentEvent?.timestamp}`);
        assert.strictEqual(timestampPreserved, true, 'Pre-exam consent timestamp must be preserved');

        auditFindings.push({
            name: 'Consent Timestamp Preservation',
            status: 'PASSED (Protected)',
            detail: 'Pre-exam consent timestamp (4 min prior to start) was preserved intact in audit proctoring log.'
        });
    }

    // -------------------------------------------------------------------------
    // EDGE CASE 4: Single-Session Refresh Policy (Confirmed Feature)
    // -------------------------------------------------------------------------
    console.log('\n[PROBE 4] Verifying Single-Session Lockout on Refresh (Intended Feature)...');
    {
        const tokenStr = 'tok_edge_audit_reload_test';
        const subId = 'sub_reload_test_004';

        db.tokens = db.tokens.filter(t => t.token !== tokenStr);
        db.tokens.push({
            token: tokenStr,
            candidateId,
            testId,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 3600000)
        });

        db.testSubmissions = db.testSubmissions.filter(s => (s.id || s._id) !== subId);
        db.testSubmissions.push({
            id: subId,
            _id: subId,
            submissionRefId: '123456789004',
            testId,
            candidateId,
            studentId: 'STU99999',
            startedAt: new Date(Date.now() - 60000),
            status: 'started',
            answers: []
        });
        saveJSONData(db);

        const res = await request('POST', '/api/tests/verify-token', { token: tokenStr });
        // Confirmed user requirement: Reloading locks re-attempts with 400
        const isLockedOut = res.status === 400 && String(res.body?.error).includes('already attempted');
        console.log(`  -> verify-token HTTP status: ${res.status}`);
        assert.strictEqual(isLockedOut, true, 'Single session policy must reject re-attempt on reload');

        auditFindings.push({
            name: 'Single-Session Policy on Reload',
            status: 'PASSED (Feature Confirmed)',
            detail: 'POST /verify-token returns HTTP 400 for started session, enforcing strict single-attempt exam policy.'
        });
    }

    // -------------------------------------------------------------------------
    // EDGE CASE 5: Dead-Man Reaper Reversal Guard (Resurrection Blocked)
    // -------------------------------------------------------------------------
    console.log('\n[PROBE 5] Verifying Reaped Submission Resurrection Guard...');
    {
        const subId = 'sub_reaper_bypass_005';
        const startTimestamp = Date.now() - (120 * 60 * 1000); // 2 hours ago
        const checkpointTime = startTimestamp + (15 * 60 * 1000);

        const validCheckpointToken = crypto
            .createHmac('sha256', process.env.JWT_SECRET || 'bics_exam_audit_secret')
            .update(`${subId}:${checkpointTime}:started`)
            .digest('hex');

        // Session was auto-submitted by dead-man reaper 1 hour ago
        db.testSubmissions = db.testSubmissions.filter(s => (s.id || s._id) !== subId);
        db.testSubmissions.push({
            id: subId,
            _id: subId,
            submissionRefId: '123456789005',
            testId,
            candidateId,
            studentId: 'STU99999',
            startedAt: new Date(startTimestamp),
            submittedAt: new Date(startTimestamp + (45 * 60 * 1000)),
            status: 'auto-submitted',
            submissionReason: 'dead_man_reaper', // Reaped 1 hour ago
            answers: []
        });
        saveJSONData(db);

        // Candidate returns 1 hour later and attempts to resurrect via submit
        const res = await request('POST', '/api/tests/submit', {
            submissionId: subId,
            status: 'submitted',
            submissionReason: 'manual',
            answers: [{ questionId: 'q1', type: 'scc', selectedOptionIndex: 1 }],
            lastCheckpointToken: validCheckpointToken,
            lastCheckpointServerTime: checkpointTime,
            elapsedSinceCheckpointMs: 0
        });

        // Security requirement: Must return HTTP 409 Conflict because reversal window expired
        const resurrectionBlocked = res.status === 409;
        console.log(`  -> Server response status: ${res.status} (Expected 409)`);
        assert.strictEqual(resurrectionBlocked, true, 'Reaped submission resurrection after window expiration must return 409');

        auditFindings.push({
            name: 'Reaped Submission Resurrection Guard',
            status: 'PASSED (Protected)',
            detail: 'Reaped session returning 1 hour late was strictly blocked with HTTP 409 Conflict.'
        });
    }

    // -------------------------------------------------------------------------
    // EDGE CASE 6: EIRF Rule 3 Exoneration on Unexcused Disconnects
    // -------------------------------------------------------------------------
    console.log('\n[PROBE 6] Verifying EIRF Evaluation Matrix on Disconnect & Outage...');
    {
        const evalUnexcused = evaluateEirfIncident({
            status: 'submitted',
            proctoringLog: {
                events: [{ type: 'NETWORK_OFFLINE', durationSeconds: 25 }]
            }
        }, { duration: 30 });

        const evalExcused = evaluateEirfIncident({
            status: 'submitted',
            offlineSyncMetadata: { outageVerified: true },
            proctoringLog: {
                events: [{ type: 'NETWORK_OFFLINE', durationSeconds: 25 }]
            }
        }, { duration: 30 });

        assert.strictEqual(evalUnexcused.hasEirfFlag, true, 'Unexcused 25s offline must trigger EIRF flag');
        assert.strictEqual(evalExcused.hasEirfFlag, false, 'Verified server outage must excuse candidate from EIRF flag');

        auditFindings.push({
            name: 'EIRF Rule 3 Outage Exoneration',
            status: 'PASSED (Verified)',
            detail: 'Unexcused 25s offline triggers EIRF; verified server outage strictly exonerates.'
        });
    }

    // -------------------------------------------------------------------------
    // EDGE CASE 7: Annulled Submission Objection Resolution Score Lock
    // -------------------------------------------------------------------------
    console.log('\n[PROBE 7] Verifying Annulled Submission Score Lock Against Objection Resolution...');
    {
        const subId = 'sub_annulled_obj_007';
        mockCurrentUser = { id: 'admin_001', role: 'admin', username: 'admin' };

        db.testSubmissions = db.testSubmissions.filter(s => (s.id || s._id) !== subId);
        db.testSubmissions.push({
            id: subId,
            _id: subId,
            submissionRefId: '123456789007',
            testId,
            candidateId,
            studentId: 'STU99999',
            verificationStatus: 'annulled',
            eirfStatus: 'rejected',
            score: 0,
            totalScore: 0,
            evaluation: { totalScore: 0, score: 0 },
            answers: [
                { questionId: 'q1', type: 'scc', score: 0, maxPoints: 20 }
            ],
            objections: [
                { questionId: 'q1', questionIndex: 0, status: 'pending', marksBefore: 0 }
            ]
        });
        saveJSONData(db);

        const res = await request('POST', '/api/admin/tests/objection/resolve', {
            submissionId: subId,
            questionId: 'q1',
            questionIndex: 0,
            status: 'resolved_accepted',
            revisedMarks: 20,
            adminRemarks: 'Question typo verified'
        });

        const updatedDb = getJSONData();
        const savedSub = updatedDb.testSubmissions.find(s => (s.id || s._id) === subId);
        assert.strictEqual(savedSub?.totalScore, 0, 'Annulled totalScore must remain 0');

        auditFindings.push({
            name: 'Score Lock on Annulled Submission',
            status: 'PASSED (Verified)',
            detail: 'Resolving objection for annulled submission maintained zero-score lock.'
        });
    }

    server.close();

    console.log('\n======================================================================');
    console.log('                      AUDIT PROBE RESULTS');
    console.log('======================================================================\n');
    auditFindings.forEach((f, idx) => {
        console.log(`[${idx + 1}] ${f.name} -> ${f.status}`);
        console.log(`    Detail: ${f.detail}\n`);
    });

    console.log('🎉 ALL LIFECYCLE EDGE CASES & INTEGRITY PROBES PASSED 100%!\n');
    return auditFindings;
}

if (require.main === module) {
    runAuditSuite().then(() => {
        process.exit(0);
    }).catch(err => {
        console.error('Audit execution error:', err);
        process.exit(1);
    });
}

module.exports = { runAuditSuite };
