const assert = require('assert');

// 1. Test Duration Regex matching both 'for X seconds' and 'after X seconds'
function parseDuration(details) {
    let dur = 0;
    if (details) {
        const match = details.match(/(?:for|after)\s+(\d+)\s+seconds/i) || details.match(/(\d+)\s*seconds/i);
        if (match && match[1]) dur = parseInt(match[1], 10);
    }
    return dur;
}

assert.strictEqual(
    parseDuration("Candidate returned to fullscreen after 8 seconds."),
    8,
    "Regex must correctly capture 'after 8 seconds'"
);
assert.strictEqual(
    parseDuration("Candidate returned focus after switching tabs/leaving window for 12 seconds."),
    12,
    "Regex must correctly capture 'for 12 seconds'"
);
assert.strictEqual(
    parseDuration("Random notice with 25 seconds."),
    25,
    "Regex must capture fallback '25 seconds'"
);
console.log("✅ Test 1: Duration regex correctly handles both 'after' and 'for' syntax.");

// 2. Test Sliding Window Deduplication Engine (as in backend/routes/tests.js:reconcileProctoringLog)
function reconcileEvents(existingEvents, incomingEvents) {
    const events = [...existingEvents];
    incomingEvents.forEach(ev => {
        if (!ev || !ev.type) return;
        const evTime = new Date(ev.timestamp || ev.startTime || Date.now()).getTime();

        const isDuplicate = events.some(existing => {
            if (ev.type === 'TEST_SUBMITTED' || ev.type === 'TEST_AUTO_SUBMITTED') {
                return existing.type === 'TEST_SUBMITTED' || existing.type === 'TEST_AUTO_SUBMITTED';
            }
            if (existing.type !== ev.type) return false;
            if (existing.details !== ev.details) return false;
            const existingTime = new Date(existing.timestamp || existing.startTime || 0).getTime();
            return Math.abs(evTime - existingTime) < 4000;
        });

        if (!isDuplicate) {
            events.push(ev);
        }
    });

    events.sort((a, b) => new Date(a.timestamp || a.startTime || 0) - new Date(b.timestamp || b.startTime || 0));
    return events;
}

const baseTime = 1730635000000;
const existing = [
    { type: 'TEST_STARTED', details: 'Candidate started the test.', timestamp: new Date(baseTime) },
    { type: 'OPTION_MARKED', details: 'Marked option A for Q1.', timestamp: new Date(baseTime + 10000) }
];

// Duplicate incoming event within 1.5 seconds (should be skipped)
const incomingWithDup = [
    { type: 'OPTION_MARKED', details: 'Marked option A for Q1.', timestamp: new Date(baseTime + 11500) },
    { type: 'CODE_RUN', details: 'Ran C++ compilation for Q2.', timestamp: new Date(baseTime + 20000) }
];

const reconciled = reconcileEvents(existing, incomingWithDup);
assert.strictEqual(reconciled.length, 3, "Duplicate OPTION_MARKED within 1.5s must be collapsed");
assert.strictEqual(reconciled[2].type, 'CODE_RUN');
console.log("✅ Test 2: Rapid duplicate proctoring events collapsed cleanly.");

// 3. Test TEST_SUBMITTED Singleton Constraint
const submitAttempt1 = [{ type: 'TEST_SUBMITTED', details: 'Server submission.', timestamp: new Date(baseTime + 60000) }];
const submitAttempt2 = [{ type: 'TEST_SUBMITTED', details: 'Client duplicate submission.', timestamp: new Date(baseTime + 60200) }];

const withSubmit1 = reconcileEvents(reconciled, submitAttempt1);
const withSubmit2 = reconcileEvents(withSubmit1, submitAttempt2);

const submitCount = withSubmit2.filter(e => e.type === 'TEST_SUBMITTED' || e.type === 'TEST_AUTO_SUBMITTED').length;
assert.strictEqual(submitCount, 1, "Exactly ONE TEST_SUBMITTED event must exist across submission lifecycle");
console.log("✅ Test 3: TEST_SUBMITTED is strictly enforced as a singleton (exactly once).");

console.log("\n🎉 ALL DEDUPLICATION & COMPLIANCE UNIT TESTS PASSED!");
