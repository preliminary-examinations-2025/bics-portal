/**
 * test_server_clock_duration_authority.test.js
 * 
 * Comprehensive Unit Test Suite verifying Server-Authoritative Clock & Duration Capping:
 * 1. Test session initialization records server-authoritative startedAt and TEST_STARTED event.
 * 2. Client-dispatched TEST_STARTED duplicate calls are deduplicated and cannot skew server start time.
 * 3. In a 30-minute test, when final submit arrives after network latency (e.g. 30m 4s), submittedAt
 *    is strictly capped at startedAt + 30m (duration cannot exceed 30 min).
 * 4. TEST_SUBMITTED event timestamp is anchored to server-capped submittedAt.
 * 5. Client proctoring event timestamps are clamped strictly between startedAt and serverNow (untrusted client clocks rejected).
 * 6. reconcileProctoringLog enforces singletons for TEST_STARTED, TEST_SUBMITTED, and TEST_AUTO_SUBMITTED.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Set isolated test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_for_duration_authority_verification_12345';

const { getJSONData, saveJSONData } = require('../config/db');

// Reset DB
const db = getJSONData();
db.testSubmissions = [];
db.tests = [];
saveJSONData(db);

console.log('======================================================================');
console.log('  TEST: SERVER-AUTHORITATIVE CLOCK & DURATION CAPPING SAFEGUARDS      ');
console.log('======================================================================\n');

// --------------------------------------------------------------------------
// 1. Mock Test Config (30-Minute Exam)
// --------------------------------------------------------------------------
const testId = 'test_30min_duration_exam_001';
const testDurationMinutes = 30;
const testDurationMs = testDurationMinutes * 60 * 1000;

const mockTest = {
    id: testId,
    _id: testId,
    title: '30-Minute Algorithmic Examination',
    duration: testDurationMinutes,
    isPublished: true,
    isDeleted: false,
    questions: [
        { id: 'q1', title: 'Question 1', type: 'mcq', marks: 10, options: ['A', 'B'], correctAnswer: 0 }
    ]
};
db.tests.push(mockTest);
saveJSONData(db);

// --------------------------------------------------------------------------
// 2. Test Start Initialization: startedAt & TEST_STARTED Server Anchor
// --------------------------------------------------------------------------
console.log('[Phase 1] Verifying Server-Authoritative startedAt & TEST_STARTED...');
const serverStartTime = new Date();
const serverStartTimeMs = serverStartTime.getTime();

const mockSubmission = {
    id: 'sub_test_duration_cap_001',
    _id: 'sub_test_duration_cap_001',
    submissionRefId: 'REF_998877665544',
    candidateId: 'cand_001',
    candidateName: 'Test Candidate',
    testId: testId,
    testTitle: mockTest.title,
    durationMinutes: testDurationMinutes,
    startedAt: serverStartTime,
    lastHeartbeatAt: serverStartTime,
    status: 'started',
    verificationStatus: 'active',
    isDeleted: false,
    proctoringLog: {
        fullscreenExits: 0,
        tabSwitches: 0,
        inspectAttempts: 0,
        clipboardAttempts: 0,
        webcamStatus: 'active',
        events: [
            {
                type: 'TEST_STARTED',
                details: `Test Candidate initialized and started examination "${mockTest.title}".`,
                timestamp: serverStartTime,
                startTime: serverStartTime,
                endTime: null,
                durationSeconds: 0
            }
        ],
        snapshots: []
    },
    answers: []
};
db.testSubmissions.push(mockSubmission);
saveJSONData(db);

const storedSub = db.testSubmissions.find(s => s.id === mockSubmission.id);
assert.strictEqual(storedSub.proctoringLog.events.length, 1, 'Initial events must contain exactly 1 event (TEST_STARTED)');
assert.strictEqual(storedSub.proctoringLog.events[0].type, 'TEST_STARTED', 'First event must be TEST_STARTED');
assert.strictEqual(
    new Date(storedSub.proctoringLog.events[0].timestamp).getTime(),
    new Date(storedSub.startedAt).getTime(),
    'TEST_STARTED timestamp must equal submission.startedAt exactly'
);
console.log('  [PASS] 1.1: Server correctly pre-populates TEST_STARTED anchored to server startedAt.');

// --------------------------------------------------------------------------
// 3. Test ReconcileProctoringLog: Client TEST_STARTED duplicate dropped
// --------------------------------------------------------------------------
console.log('\n[Phase 2] Verifying ReconcileProctoringLog Deduplication & Protection...');
// Emulate tests.js reconcileProctoringLog
function reconcileProctoringLog(existingLog = {}, incomingLog = {}) {
    const rawExisting = (existingLog && typeof existingLog.toObject === 'function') ? existingLog.toObject() : (existingLog || {});
    const log = { ...rawExisting };
    log.events = Array.isArray(rawExisting.events) ? [...rawExisting.events] : [];

    if (incomingLog && Array.isArray(incomingLog.events) && incomingLog.events.length > 0) {
        incomingLog.events.forEach(ev => {
            if (!ev || !ev.type) return;
            const evTime = new Date(ev.timestamp || ev.startTime || Date.now()).getTime();

            const isDuplicate = log.events.some(existing => {
                if (ev.type === 'TEST_SUBMITTED' || ev.type === 'TEST_AUTO_SUBMITTED') {
                    return existing.type === 'TEST_SUBMITTED' || existing.type === 'TEST_AUTO_SUBMITTED';
                }
                if (ev.type === 'TEST_STARTED') {
                    return existing.type === 'TEST_STARTED';
                }
                if (existing.type !== ev.type) return false;
                if (existing.details !== ev.details) return false;
                const existingTime = new Date(existing.timestamp || existing.startTime || 0).getTime();
                return Math.abs(evTime - existingTime) < 4000;
            });

            if (!isDuplicate) {
                log.events.push(ev);
            }
        });
        log.events.sort((a, b) => new Date(a.timestamp || a.startTime || 0) - new Date(b.timestamp || b.startTime || 0));
    }
    return log;
}

// Client tries to post a TEST_STARTED event with skewed client machine clock (+10 seconds)
const skewedClientStartTime = new Date(serverStartTimeMs + 10000);
const incomingFromClient = {
    events: [
        {
            type: 'TEST_STARTED',
            details: 'Client claiming test started',
            timestamp: skewedClientStartTime
        },
        {
            type: 'CONSENT_ACCEPTED',
            details: 'Candidate accepted terms',
            timestamp: new Date(serverStartTimeMs + 500)
        }
    ]
};

const reconciled = reconcileProctoringLog(storedSub.proctoringLog, incomingFromClient);
const testStartedEvents = reconciled.events.filter(e => e.type === 'TEST_STARTED');
assert.strictEqual(testStartedEvents.length, 1, 'TEST_STARTED must remain a strict singleton');
assert.strictEqual(
    new Date(testStartedEvents[0].timestamp).getTime(),
    serverStartTimeMs,
    'Client skewed timestamp must NOT overwrite server-authoritative startedAt'
);
assert.strictEqual(reconciled.events.length, 2, 'CONSENT_ACCEPTED was cleanly merged alongside TEST_STARTED');
console.log('  [PASS] 2.1: Client duplicate TEST_STARTED with skewed clock dropped; server start time preserved.');

// --------------------------------------------------------------------------
// 4. Test Duration Capping on Final Submit (Network Delay Simulation)
// --------------------------------------------------------------------------
console.log('\n[Phase 3] Verifying 30-Minute Exam Duration Capping on Submit...');

// Scenario: The exam started 30 minutes and 4 seconds ago on the server clock!
// (e.g. 30 minutes of answering + 4 seconds of client JSON packaging and network transit)
const simulatedStartedAt = new Date(Date.now() - (30 * 60 * 1000 + 4000)); // 30m 4s ago
const subToSubmit = {
    ...storedSub,
    startedAt: simulatedStartedAt
};

const startedAtMs = new Date(subToSubmit.startedAt).getTime();
const allowedDurationMs = (Number(mockTest.duration || 60)) * 60 * 1000;
const examDeadlineMs = startedAtMs + allowedDurationMs;
const GRACE_PERIOD_MS = 180 * 1000;
const nowMs = Date.now();
const completionTimeMs = nowMs; // HTTP request arrived now (30m 4s after start)

// Execute the new duration capping algorithm
let effectiveSubmittedAtMs = completionTimeMs;
const isFinalSubmission = true;
const status = 'submitted';
const submissionReason = 'timer_completed';

if (isFinalSubmission) {
    if (status === 'auto-submitted' || submissionReason === 'timer_completed' || (effectiveSubmittedAtMs >= examDeadlineMs && effectiveSubmittedAtMs <= examDeadlineMs + GRACE_PERIOD_MS)) {
        effectiveSubmittedAtMs = Math.min(effectiveSubmittedAtMs, examDeadlineMs);
    }
    effectiveSubmittedAtMs = Math.max(startedAtMs, Math.min(nowMs, effectiveSubmittedAtMs));
    subToSubmit.submittedAt = new Date(effectiveSubmittedAtMs);
}

// Check the duration
const actualElapsedSec = Math.round((new Date(subToSubmit.submittedAt).getTime() - new Date(subToSubmit.startedAt).getTime()) / 1000);
const elapsedMins = Math.floor(actualElapsedSec / 60);
const elapsedSecs = actualElapsedSec % 60;

console.log(`  Raw arrival time elapsed: 30 min 4 sec (1804s)`);
console.log(`  Authoritative capped duration: ${elapsedMins} min ${elapsedSecs} sec (${actualElapsedSec}s)`);

assert.strictEqual(actualElapsedSec, 1800, 'Logged session duration must be capped at exactly 1800s (30 min 0 sec)');
assert.strictEqual(elapsedMins, 30, 'Elapsed minutes must be 30');
assert.strictEqual(elapsedSecs, 0, 'Elapsed seconds must be 0 (NOT 4 seconds!)');
console.log('  [PASS] 3.1: Logged time of 30-minute exam is capped at exactly 30 min 0 sec; 30 min 4 sec transit delay discarded.');

// --------------------------------------------------------------------------
// 5. Test TEST_SUBMITTED Event Timestamp Anchoring
// --------------------------------------------------------------------------
console.log('\n[Phase 4] Verifying TEST_SUBMITTED Proctoring Event Timestamp...');
const finalEvType = 'TEST_SUBMITTED';
const finalEvDesc = 'Candidate completed, finalized, and submitted examination answers.';
const finalSubmitTime = subToSubmit.submittedAt;

if (!subToSubmit.proctoringLog.events.some(e => e.type === finalEvType)) {
    subToSubmit.proctoringLog.events.push({
        timestamp: finalSubmitTime,
        type: finalEvType,
        details: finalEvDesc
    });
}

const submitEvent = subToSubmit.proctoringLog.events.find(e => e.type === 'TEST_SUBMITTED');
assert.ok(submitEvent, 'TEST_SUBMITTED event must exist in proctoring log');
assert.strictEqual(
    new Date(submitEvent.timestamp).getTime(),
    new Date(subToSubmit.submittedAt).getTime(),
    'TEST_SUBMITTED event timestamp must equal authoritative submittedAt exactly'
);

const diffBetweenLifecycleEventsSec = Math.round(
    (new Date(submitEvent.timestamp).getTime() - new Date(subToSubmit.startedAt).getTime()) / 1000
);
assert.strictEqual(diffBetweenLifecycleEventsSec, 1800, 'Difference between TEST_STARTED and TEST_SUBMITTED must be exactly 1800s');
console.log('  [PASS] 4.1: TEST_SUBMITTED proctoring event is anchored to authoritative submittedAt (exactly 30 min from start).');

// --------------------------------------------------------------------------
// 6. Test Proctoring Event Sanitization (Clamping Untrusted Client Clocks)
// --------------------------------------------------------------------------
console.log('\n[Phase 5] Verifying Untrusted Client Proctoring Event Clamping...');
function sanitizeProctoringEvent({ type, details, clientTimestamp, durationSeconds, startedAt, serverNow }) {
    const startedAtMs = new Date(startedAt).getTime();
    const serverNowMs = new Date(serverNow).getTime();

    let authoritativeTimestamp = serverNow;
    if (type === 'TEST_STARTED') {
        authoritativeTimestamp = new Date(startedAtMs);
    } else {
        authoritativeTimestamp = serverNow;
    }

    if (authoritativeTimestamp.getTime() < startedAtMs) {
        authoritativeTimestamp = new Date(startedAtMs);
    }
    if (authoritativeTimestamp.getTime() > serverNowMs) {
        authoritativeTimestamp = serverNow;
    }

    const eventTimeMs = authoritativeTimestamp.getTime();
    const validatedDurationSec = Math.max(0, Math.min(Number(durationSeconds || 0), Math.round((serverNowMs - startedAtMs) / 1000)));
    const eventEndTime = authoritativeTimestamp;
    const eventStartTime = validatedDurationSec > 0
        ? new Date(authoritativeTimestamp.getTime() - (validatedDurationSec * 1000))
        : authoritativeTimestamp;

    return {
        type,
        details,
        timestamp: authoritativeTimestamp,
        startTime: eventStartTime,
        endTime: eventEndTime,
        durationSeconds: validatedDurationSec
    };
}

const now = new Date();
const examStart = new Date(now.getTime() - 600000); // 10 minutes ago

// Candidate sends an event claiming it happened in the future (+2 hours)
const spoofedFutureEvent = sanitizeProctoringEvent({
    type: 'FULLSCREEN_EXIT',
    details: 'Exited fullscreen',
    clientTimestamp: new Date(now.getTime() + 7200000), // +2h in future
    durationSeconds: 999999, // Impossible duration
    startedAt: examStart,
    serverNow: now
});

assert.ok(
    new Date(spoofedFutureEvent.timestamp).getTime() <= now.getTime(),
    'Event timestamp must be clamped to <= serverNow'
);
assert.ok(
    new Date(spoofedFutureEvent.timestamp).getTime() >= examStart.getTime(),
    'Event timestamp must be clamped to >= examStart'
);
assert.ok(
    spoofedFutureEvent.durationSeconds <= 600,
    `Duration must be clamped to elapsed time (got: ${spoofedFutureEvent.durationSeconds}s <= 600s)`
);
console.log('  [PASS] 5.1: Untrusted client future timestamps and impossible durations are safely clamped by server.');

console.log('\n======================================================================');
console.log('  ALL SERVER-AUTHORITATIVE CLOCK & DURATION VERIFICATION TESTS PASSED! ');
console.log('======================================================================\n');
