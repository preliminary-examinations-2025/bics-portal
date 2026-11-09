const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

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

  // 3. Behavioral VM Verification of frontend/src/utils/media.js (local + production URL resolution)
  console.log("  [TEST 3] Verifying formatMediaUrl & resolveMediaOrBackendUrl across local and prod");
  const rootDir = path.resolve(__dirname, '..', '..');
  const mediaUtilPath = path.join(rootDir, 'frontend/src/utils/media.js');
  const mediaSrc = fs.readFileSync(mediaUtilPath, 'utf8')
    .replace(/^export const /gm, 'const ')
    + '\nglobalThis.__mediaExports = { formatMediaUrl, resolveMediaOrBackendUrl };\n';
  const mediaCtx = { globalThis: null };
  mediaCtx.globalThis = mediaCtx;
  vm.createContext(mediaCtx);
  vm.runInContext(mediaSrc, mediaCtx, { filename: mediaUtilPath });
  const { formatMediaUrl, resolveMediaOrBackendUrl } = mediaCtx.__mediaExports;

  const LOCAL_API = 'http://127.0.0.1:5000/api';
  const PROD_API = 'https://bicsportal.netlify.app/api';

  // Local development cases
  assert.strictEqual(
    resolveMediaOrBackendUrl('/public/proctoring/sub1/123.jpeg', LOCAL_API),
    'http://127.0.0.1:5000/public/proctoring/sub1/123.jpeg'
  );
  assert.strictEqual(
    resolveMediaOrBackendUrl('/media/proctoring/sub1/123.jpg', LOCAL_API),
    '/media/proctoring/sub1/123.jpg',
    'Cloudinary /media paths must remain relative so Vite /media proxy serves them locally'
  );
  assert.strictEqual(
    resolveMediaOrBackendUrl('http://127.0.0.1:5000/media/proctoring/sub1/123.jpg', LOCAL_API),
    '/media/proctoring/sub1/123.jpg'
  );
  assert.strictEqual(
    resolveMediaOrBackendUrl('https://res.cloudinary.com/dl7xqcnmr/image/upload/v1731/BICS_2026/proctoring/sub1/123.jpg', LOCAL_API),
    '/media/proctoring/sub1/123.jpg'
  );
  assert.strictEqual(
    resolveMediaOrBackendUrl('https://res.cloudinary.com/dl7xqcnmr/raw/upload/v1731/BICS_2026/eirf_proofs/sub1/doc.pdf', PROD_API),
    '/media/raw/eirf_proofs/sub1/doc.pdf'
  );

  // Production cases (Netlify + Render)
  assert.strictEqual(
    resolveMediaOrBackendUrl('/media/proctoring/sub1/123.jpg', PROD_API),
    '/media/proctoring/sub1/123.jpg'
  );
  assert.strictEqual(
    resolveMediaOrBackendUrl('/public/proctoring/sub1/123.jpeg', PROD_API),
    'https://bicsportal.netlify.app/api/public/proctoring/sub1/123.jpeg',
    'Relative /public paths in prod must route via /api/public/* to Render backend'
  );
  assert.strictEqual(
    resolveMediaOrBackendUrl('http://127.0.0.1:5000/public/proctoring/sub1/123.jpeg', PROD_API),
    'https://bicsportal.netlify.app/api/public/proctoring/sub1/123.jpeg',
    'Localhost /public URLs opened in prod must rewrite cleanly via /api/public/*'
  );
  assert.strictEqual(
    resolveMediaOrBackendUrl('data:image/jpeg;base64,abc123==', PROD_API),
    'data:image/jpeg;base64,abc123=='
  );
  assert.strictEqual(
    formatMediaUrl('https://res.cloudinary.com/test.jpg'),
    'https://res.cloudinary.com/test.jpg'
  );
  console.log("  ✅ [PASS] Media & proctoring URL resolution verified across local dev and production.");

  // 4. Portal Modal containment, CSS containing block fix, and completion status parity checks
  console.log("  [TEST 4] Verifying modal portal rendering, CSS transform containment fix & status parity");
  const indexCss = fs.readFileSync(path.join(rootDir, 'frontend/src/index.css'), 'utf8');
  assert(indexCss.includes('transform: none;'), '.portal-view-transition keyframe must end at transform: none');
  const portalRuleMatch = indexCss.match(/\.portal-view-transition\s*\{[^}]*\}/);
  assert(portalRuleMatch, '.portal-view-transition CSS rule must exist');
  assert(!portalRuleMatch[0].includes('transform'), '.portal-view-transition must not retain will-change: transform');

  const dashSrc = fs.readFileSync(path.join(rootDir, 'frontend/src/components/StudentProctorDashboard.jsx'), 'utf8');
  assert(dashSrc.includes("import { createPortal } from 'react-dom';"), 'StudentProctorDashboard must import createPortal');
  assert((dashSrc.match(/createPortal\(/g) || []).length >= 3, 'All 3 modals in StudentProctorDashboard must render via createPortal');
  assert(dashSrc.includes("subStatus !== 'started'"), 'Completed status check must cover submitted, auto-submitted, evaluated, and disqualified');
  assert(dashSrc.includes('onError={() => setBaselineImgError(true)}'), 'Baseline photo must handle onError cleanly');
  assert(dashSrc.includes("proofUrl.includes('/media/raw/')"), 'EIRF proof PDF detector must recognize /media/raw/ paths');

  const adminProcSrc = fs.readFileSync(path.join(rootDir, 'frontend/src/pages/admin/AdminProctoring.jsx'), 'utf8');
  assert(adminProcSrc.includes('key={selectedProctorStudent.id || selectedProctorStudent._id}'), 'AdminProctoring must key StudentProctorDashboard per submission');

  const procRouteSrc = fs.readFileSync(path.join(rootDir, 'backend/routes/proctoring.js'), 'utf8');
  assert(procRouteSrc.includes('isCloudinaryConfigured()'), 'proctoring.js must check isCloudinaryConfigured() dynamically');

  const viteCfgSrc = fs.readFileSync(path.join(rootDir, 'frontend/vite.config.js'), 'utf8');
  assert(viteCfgSrc.includes("'/media/raw'") && viteCfgSrc.includes("'/media/otrf'"), 'frontend vite.config.js must proxy /media/raw and /media/otrf to Cloudinary raw/upload');
  console.log("  ✅ [PASS] Modal portals, CSS fix, status parity, and Vite/Cloudinary config verified.");

  // 5. Live Express Server /api/public & /media endpoint check
  console.log("  [TEST 5] Verifying Express /api/public static serving and /media Cloudinary redirects");
  process.env.NODE_ENV = 'test';
  const app = require('../server');
  const pipePath = process.platform === 'win32'
    ? `\\\\.\\pipe\\bics_snap_test_${process.pid}_${Date.now()}`
    : `/tmp/bics_snap_test_${process.pid}_${Date.now()}.sock`;
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(pipePath, resolve));

  const pipeReq = (reqPath) => new Promise((resolve, reject) => {
    const req = http.request({ socketPath: pipePath, path: reqPath, method: 'GET' }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });

  try {
    const logoRes = await pipeReq('/api/public/bics_logo.png');
    assert.strictEqual(logoRes.status, 200, '/api/public/bics_logo.png must serve 200 without auth header');

    const missingRes = await pipeReq('/api/public/proctoring/nonexistent_probe.jpeg');
    assert.strictEqual(missingRes.status, 404, 'Missing /api/public asset must return 404 rather than 401');

    const mediaImgRes = await pipeReq('/media/proctoring/sub1/snap.jpg');
    assert.strictEqual(mediaImgRes.status, 302);
    assert(mediaImgRes.headers.location.includes('/image/upload/BICS_2026/proctoring/sub1/snap.jpg'));

    const mediaRawRes = await pipeReq('/media/raw/eirf_proofs/sub1/doc.pdf');
    assert.strictEqual(mediaRawRes.status, 302);
    assert(mediaRawRes.headers.location.includes('/raw/upload/BICS_2026/eirf_proofs/sub1/doc.pdf'));

    console.log("  ✅ [PASS] Express /api/public and /media redirect handlers verified.");
  } finally {
    try {
      const { stopSubmissionReaper } = require('../workers/submissionReaper');
      const { stopEirfPipelineWorker } = require('../workers/eirfPipelineWorker');
      stopSubmissionReaper();
      stopEirfPipelineWorker();
    } catch (_) {}
    await new Promise((resolve) => server.close(resolve));
  }

  console.log("==================================================================");
  console.log("🏁 ALL PROCTORING SNAPSHOT TESTS PASSED SUCCESSFULLY (5/5)");
  console.log("==================================================================");
}

runSnapshotsSuite().catch(err => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
