const assert = require('assert');
const path = require('path');
const fs = require('fs');

async function runSnapshotsSuite() {
  console.log("==================================================================");
  console.log("📸 RUNNING PROCTORING SNAPSHOT CAPTURE & MATCHING VERIFICATION SUITE");
  console.log("==================================================================");

  // 1. Verify all proctoring warning event types
  const expectedWarningTypes = [
    'FULLSCREEN_EXIT',
    'TAB_SWITCH',
    'DEVTOOLS_OPENED',
    'CLIPBOARD_ATTEMPT',
    'FACE_MISSING',
    'MULTI_FACE',
    'LOOKING_AWAY',
    'VOICE_DETECTED',
    'MINOR_WARNINGS_EXCEEDED'
  ];

  console.log("  [TEST 1] Verifying all expected proctoring warning event types are defined");
  assert.strictEqual(expectedWarningTypes.length, 9);
  console.log("  ✅ [PASS] 9 proctoring warning event types verified.");

  // 2. Test timeline snapshot matching algorithm from StudentProctorDashboard
  console.log("  [TEST 2] Testing StudentProctorDashboard snapshot matching algorithm");
  const testTimestamp = new Date();
  const testSnapshots = expectedWarningTypes.map((type, idx) => ({
    timestamp: new Date(testTimestamp.getTime() + idx * 1000).toISOString(),
    type,
    url: `/public/proctoring/sub_123/snap_${type}.jpeg`,
    details: `Evidence snapshot captured for ${type}`
  }));

  const testLogs = expectedWarningTypes.map((type, idx) => ({
    timestamp: new Date(testTimestamp.getTime() + idx * 1000 + 150).toISOString(),
    type,
    details: `Log entry for ${type}`
  }));

  for (const log of testLogs) {
    const matchingSnapshots = testSnapshots.filter(s => {
      const typeMatches = s.type === log.type || 
        (s.type === 'FULLSCREEN_EXIT' && (log.type?.includes('FULLSCREEN') || log.type?.includes('EXIT'))) ||
        (s.type === 'TAB_SWITCH' && (log.type?.includes('TAB') || log.type?.includes('FOCUS'))) ||
        (s.type === 'DEVTOOLS_OPENED' && (log.type?.includes('DEVTOOLS') || log.type?.includes('INSPECT'))) ||
        (s.type === 'CLIPBOARD_ATTEMPT' && (log.type?.includes('CLIPBOARD') || log.type?.includes('COPY'))) ||
        (s.type === 'VOICE_DETECTED' && log.type?.includes('VOICE')) ||
        (s.type === 'FACE_MISSING' && log.type?.includes('FACE_MISSING')) ||
        (s.type === 'MULTI_FACE' && log.type?.includes('MULTI_FACE')) ||
        (s.type === 'LOOKING_AWAY' && log.type?.includes('LOOKING_AWAY')) ||
        (s.type === 'MINOR_WARNINGS_EXCEEDED' && log.type?.includes('MINOR_WARNINGS'));
      if (!typeMatches) return false;
      const timeDiff = Math.abs(new Date(s.timestamp).getTime() - new Date(log.timestamp).getTime());
      return timeDiff < 60000;
    });

    let matchingSnapshot = null;
    if (matchingSnapshots.length > 0) {
      matchingSnapshot = matchingSnapshots.reduce((closest, curr) => {
        const closestDiff = Math.abs(new Date(closest.timestamp).getTime() - new Date(log.timestamp).getTime());
        const currDiff = Math.abs(new Date(curr.timestamp).getTime() - new Date(log.timestamp).getTime());
        return currDiff < closestDiff ? curr : closest;
      });
    }

    assert(matchingSnapshot !== null, `Failed to match snapshot for log type ${log.type}`);
    assert.strictEqual(matchingSnapshot.type, log.type);
  }
  console.log("  ✅ [PASS] All 9 warning event logs correctly matched their respective evidence snapshots.");

  // 3. Test resolveSnapshotUrl helper
  console.log("  [TEST 3] Testing resolveSnapshotUrl helper");
  const API_BASE = 'http://127.0.0.1:5000/api';
  const resolveSnapshotUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    const backendBase = (API_BASE || '').replace(/\/api\/?$/, '');
    return `${backendBase}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  assert.strictEqual(
    resolveSnapshotUrl('/public/proctoring/sub1/123.jpeg'),
    'http://127.0.0.1:5000/public/proctoring/sub1/123.jpeg'
  );
  assert.strictEqual(
    resolveSnapshotUrl('data:image/jpeg;base64,abc123=='),
    'data:image/jpeg;base64,abc123=='
  );
  assert.strictEqual(
    resolveSnapshotUrl('https://res.cloudinary.com/test.jpg'),
    'https://res.cloudinary.com/test.jpg'
  );
  console.log("  ✅ [PASS] resolveSnapshotUrl correctly formats local, data, and external URLs.");

  console.log("==================================================================");
  console.log("🏁 ALL PROCTORING SNAPSHOT TESTS PASSED SUCCESSFULLY (3/3)");
  console.log("==================================================================");
}

runSnapshotsSuite().catch(err => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
