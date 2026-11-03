const assert = require('assert');

// Test policy formula
function getMinorWarningThreshold(durationMinutes) {
  return Math.max(10, Math.round((Number(durationMinutes || 60) * 60) * 0.05));
}

function evaluateEirfQualification({ testDurationMin, events = [], totalWarnings = 0, isAutoSubmitted = false, hasNetworkOffline = false }) {
  const minorThresholdSec = getMinorWarningThreshold(testDurationMin);
  let maxFsSec = 0;
  let maxTabSec = 0;
  let hasMinorThreshold = false;

  events.forEach(ev => {
    let dur = Number(ev.durationSeconds || 0);
    if (!dur && ev.details) {
      const match = ev.details.match(/(\d+)\s+seconds/i);
      if (match && match[1]) dur = parseInt(match[1], 10);
    }
    const isFs = ev.type === 'FULLSCREEN_EXIT' || ev.type === 'FULLSCREEN_RETURNED' || (ev.type && ev.type.includes('FULLSCREEN'));
    const isTab = ev.type === 'TAB_SWITCH' || ev.type === 'TAB_RETURNED' || (ev.type && ev.type.includes('TAB'));
    if (isFs && dur > maxFsSec) maxFsSec = dur;
    if (isTab && dur > maxTabSec) maxTabSec = dur;
    if (ev.type === 'MINOR_WARNINGS_EXCEEDED') hasMinorThreshold = true;
  });

  const hasLongExit = maxFsSec > 5 || maxTabSec > 5;
  const isDisqualified = isAutoSubmitted || totalWarnings >= 3;
  const isFlagged = isDisqualified || hasLongExit || hasNetworkOffline || hasMinorThreshold;

  return {
    isFlagged,
    maxFsSec,
    maxTabSec,
    minorThresholdSec,
    hasLongExit
  };
}

// 1. Minor warning threshold calculations
assert.strictEqual(getMinorWarningThreshold(60), 180, '60-min exam 5% threshold must be 180s');
assert.strictEqual(getMinorWarningThreshold(30), 90, '30-min exam 5% threshold must be 90s');
assert.strictEqual(getMinorWarningThreshold(10), 30, '10-min exam 5% threshold must be 30s');
assert.strictEqual(getMinorWarningThreshold(2), 10, 'Minimum floor clamped to 10s');
console.log('✅ Test 1: Minor warning threshold (5% of duration) calculated correctly across durations.');

// 2. Tab switch under 5s must NOT trigger EIRF
const cleanSession = evaluateEirfQualification({
  testDurationMin: 60,
  events: [
    { type: 'TAB_SWITCH', details: 'Switched tab' },
    { type: 'TAB_RETURNED', durationSeconds: 3, details: 'returned after 3 seconds' }
  ],
  totalWarnings: 1
});
assert.strictEqual(cleanSession.isFlagged, false, '3s tab switch must NOT qualify for EIRF');
assert.strictEqual(cleanSession.hasLongExit, false, 'hasLongExit must be false for 3s');
console.log('✅ Test 2: Individual tab switch <= 5s does NOT flag EIRF (Clean session).');

// 3. Tab switch > 5s MUST trigger EIRF
const majorTabSession = evaluateEirfQualification({
  testDurationMin: 60,
  events: [
    { type: 'TAB_SWITCH', details: 'Switched tab' },
    { type: 'TAB_RETURNED', durationSeconds: 6, details: 'returned after 6 seconds' }
  ],
  totalWarnings: 1
});
assert.strictEqual(majorTabSession.isFlagged, true, '6s tab switch MUST qualify for EIRF');
assert.strictEqual(majorTabSession.hasLongExit, true, 'hasLongExit must be true for 6s');
console.log('✅ Test 3: Individual tab switch > 5s (6s) triggers EIRF.');

// 4. Fullscreen exit > 5s MUST trigger EIRF
const majorFsSession = evaluateEirfQualification({
  testDurationMin: 60,
  events: [
    { type: 'FULLSCREEN_EXIT', details: 'Exited fullscreen' },
    { type: 'FULLSCREEN_RETURNED', durationSeconds: 7, details: 'returned to fullscreen after 7 seconds' }
  ],
  totalWarnings: 1
});
assert.strictEqual(majorFsSession.isFlagged, true, '7s fullscreen exit MUST qualify for EIRF');
assert.strictEqual(majorFsSession.hasLongExit, true, 'hasLongExit must be true for 7s');
console.log('✅ Test 4: Individual fullscreen exit > 5s (7s) triggers EIRF.');

// 5. Minor warnings exceeding 5% duration MUST trigger EIRF
const minorExceededSession = evaluateEirfQualification({
  testDurationMin: 60,
  events: [
    { type: 'MINOR_WARNINGS_EXCEEDED', details: 'Cumulative minor proctoring violations reached threshold: 180 seconds' }
  ],
  totalWarnings: 0
});
assert.strictEqual(minorExceededSession.isFlagged, true, 'Minor warnings exceeded MUST qualify for EIRF');
console.log('✅ Test 5: Minor warnings exceeding 5% threshold (180s) triggers EIRF.');

console.log('\n🎉 ALL EIRF THRESHOLD POLICY TESTS PASSED!');
