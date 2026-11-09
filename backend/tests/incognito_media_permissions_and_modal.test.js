/**
 * Regression Test Suite: Incognito Media Permissions, Prompt Dismissal & Stale Modal Prevention
 *
 * Verifies:
 * 1. Behavioral VM tests for systemProbes.probeDisplays():
 *    - Never calls window.getScreenDetails() without user permission ('prompt'/'denied'/'unsupported')
 *    - Calls window.getScreenDetails() cleanly when window-management permission is 'granted'
 *    - Still catches secondary displays via window.screen.isExtended fallback
 * 2. App.jsx Root Modal & Permission Lifecycle:
 *    - CustomAlertModal rendered at AppContent root across ALL flows (never deferred to active_exam)
 *    - ExamProctorOverlay deduplication via suppressCustomModal={true}
 *    - Stale MEDIA_PERMISSION modal cleared on media authorization AND before entering active_exam
 *    - Concurrent double-click lock (isAuthorizingMediaRef), stream track reuse, track 'ended' listener
 *    - Exit fullscreen safely before prompting getUserMedia when camera/mic permission isn't 'granted'
 *    - OverconstrainedError relaxed { video: true, audio: true } retry + 'granted' catch recovery
 *    - handleStartExam live-track verification & safe bounce back instead of entering exam dead
 * 3. SystemChecksView & BiometricCheckView:
 *    - Inline mediaPermissionError banner + disabled spinner button while isAuthorizingMedia
 *    - BiometricCheckView Web Speech API onerror Incognito fallback without hanging or faking 100%
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const OT_SRC = path.join(ROOT, 'frontend_ot', 'src');

function runProbeDisplaysInVm({ permState, permThrows = false, isExtended = false, screenLeft = 0, screenTop = 0, mockScreens = [{}] }) {
  const src = fs.readFileSync(path.join(OT_SRC, 'utils', 'systemProbes.js'), 'utf8');
  const transformed = src
    .replace(/^export\s+async\s+function\s+/gm, 'async function ')
    .replace(/^export\s+function\s+/gm, 'function ')
    + '\nglobalThis.__exports = { probeDisplays };\n';

  let getScreenDetailsCalls = 0;
  let queriedNames = [];

  const context = {
    globalThis: null,
    window: {
      screen: { isExtended, width: 1920, height: 1080 },
      screenLeft,
      screenTop,
      getScreenDetails: async () => {
        getScreenDetailsCalls += 1;
        return { screens: mockScreens };
      }
    },
    navigator: {
      permissions: {
        query: async ({ name }) => {
          queriedNames.push(name);
          if (permThrows) throw new TypeError('Unsupported permission descriptor');
          return { state: permState };
        }
      }
    },
    Promise,
    Error
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(transformed, context, { filename: 'systemProbes.js' });

  return context.__exports.probeDisplays().then(result => ({
    result,
    getScreenDetailsCalls,
    queriedNames
  }));
}

async function runSuite() {
  console.log('==================================================================');
  console.log('🧪 INCOGNITO MEDIA PERMISSIONS & MODAL LIFECYCLE TEST SUITE');
  console.log('==================================================================\n');

  // ------------------------------------------------------------------
  // SECTION 1: Behavioral VM verification of probeDisplays()
  // ------------------------------------------------------------------
  console.log('[SECTION 1] Behavioral VM Tests for probeDisplays() in Incognito:');

  const promptRun = await runProbeDisplaysInVm({ permState: 'prompt', isExtended: false });
  assert.strictEqual(promptRun.getScreenDetailsCalls, 0, 'Must NOT call getScreenDetails() when window-management is prompt');
  assert.strictEqual(promptRun.queriedNames[0], 'window-management');
  assert.strictEqual(promptRun.result.passed, true);
  assert.strictEqual(promptRun.result.screenCount, 1);

  const extendedPromptRun = await runProbeDisplaysInVm({ permState: 'prompt', isExtended: true });
  assert.strictEqual(extendedPromptRun.getScreenDetailsCalls, 0, 'Must NOT call getScreenDetails() on prompt even with extended screen');
  assert.strictEqual(extendedPromptRun.result.passed, false, 'Fallback screen.isExtended must still block external monitor');
  assert.strictEqual(extendedPromptRun.result.screenCount, 2);

  const unsupportedPermRun = await runProbeDisplaysInVm({ permThrows: true, isExtended: false });
  assert.strictEqual(unsupportedPermRun.getScreenDetailsCalls, 0, 'Must NOT call getScreenDetails() if permissions.query throws');
  assert.strictEqual(unsupportedPermRun.result.passed, true);

  const grantedMultiRun = await runProbeDisplaysInVm({ permState: 'granted', mockScreens: [{}, {}] });
  assert.strictEqual(grantedMultiRun.getScreenDetailsCalls, 1, 'Should call getScreenDetails() ONLY when permission is granted');
  assert.strictEqual(grantedMultiRun.result.passed, false);
  assert.strictEqual(grantedMultiRun.result.screenCount, 2);

  console.log('  ✅ probeDisplays() avoids unsolicited Incognito permission prompts while preserving multi-monitor enforcement.');

  // ------------------------------------------------------------------
  // SECTION 2: CustomAlertModal Root Mounting & Active Exam Isolation
  // ------------------------------------------------------------------
  console.log('\n[SECTION 2] Root CustomAlertModal Mounting & No Stale Exam Alerts:');

  const modalPath = path.join(OT_SRC, 'components', 'common', 'CustomAlertModal.jsx');
  assert.ok(fs.existsSync(modalPath), 'CustomAlertModal.jsx must exist');
  const modalSrc = fs.readFileSync(modalPath, 'utf8');
  assert.ok(modalSrc.includes('zIndex: 600000'), 'CustomAlertModal must render at high zIndex above view transitions');
  assert.ok(modalSrc.includes("whiteSpace: 'pre-line'"), 'CustomAlertModal must format multi-line remediation guidance');

  const overlaySrc = fs.readFileSync(path.join(OT_SRC, 'components', 'exam', 'ExamProctorOverlay.jsx'), 'utf8');
  assert.ok(overlaySrc.includes('suppressCustomModal = false'), 'ExamProctorOverlay must accept suppressCustomModal');
  assert.ok(overlaySrc.includes('{!suppressCustomModal && ('), 'ExamProctorOverlay must avoid duplicate modal render when suppressed');

  const activeViewSrc = fs.readFileSync(path.join(OT_SRC, 'views', 'ActiveExamView.jsx'), 'utf8');
  assert.ok(activeViewSrc.includes('suppressCustomModal = false'), 'ActiveExamView must accept suppressCustomModal');
  assert.ok(activeViewSrc.includes('suppressCustomModal={suppressCustomModal}'), 'ActiveExamView must forward suppressCustomModal');

  const appSrc = fs.readFileSync(path.join(OT_SRC, 'App.jsx'), 'utf8');
  assert.ok(appSrc.includes("import { CustomAlertModal } from './components/common/CustomAlertModal';"), 'App.jsx must import CustomAlertModal');
  assert.ok(appSrc.includes('{renderFlowView()}\n      <CustomAlertModal customModal={customModal} setCustomModal={setCustomModal} />'), 'App.jsx must mount CustomAlertModal outside flow branches across all views');
  assert.ok(appSrc.includes('suppressCustomModal={true}'), 'App.jsx must pass suppressCustomModal={true} to ActiveExamView');
  assert.ok(appSrc.includes('clearMediaPermissionModal'), 'App.jsx must provide clearMediaPermissionModal helper');

  // Verify clearMediaPermissionModal is called in both applyAuthorizedStream and handleStartExam prior to setFlow('active_exam')
  const applyIdx = appSrc.indexOf('const applyAuthorizedStream =');
  const lockFsIdx = appSrc.indexOf('const handleLockFullscreen =', applyIdx);
  assert.ok(appSrc.slice(applyIdx, lockFsIdx).includes('clearMediaPermissionModal();'), 'applyAuthorizedStream must clear stale media modal');

  const startIdx = appSrc.indexOf('const handleStartExam =');
  const activeFlowIdx = appSrc.indexOf("setFlow('active_exam');", startIdx);
  assert.ok(startIdx !== -1 && activeFlowIdx !== -1 && appSrc.slice(startIdx, activeFlowIdx).includes('clearMediaPermissionModal();'), 'handleStartExam must clear stale media modals prior to setFlow("active_exam")');
  console.log('  ✅ CustomAlertModal renders across all views and stale media modals are strictly purged.');

  // ------------------------------------------------------------------
  // SECTION 3: Fullscreen-During-Prompt Guard & Stream Resilience
  // ------------------------------------------------------------------
  console.log('\n[SECTION 3] Incognito Fullscreen Guard, Concurrency Lock & Track Recovery:');

  assert.ok(appSrc.includes('isAuthorizingMediaRef.current'), 'handleAuthorizeCamera must lock concurrent permission clicks');
  assert.ok(appSrc.includes('hasLiveMediaTracks(webcamStream)'), 'handleAuthorizeCamera must reuse live tracks without unnecessary Incognito re-prompts');
  assert.ok(appSrc.includes('await exitFullscreenSafely();'), 'handleAuthorizeCamera must exit DOM fullscreen when permission state needs prompt/unblock');
  assert.ok(appSrc.includes("err?.name === 'OverconstrainedError'"), 'acquireCameraAndMicStream must fall back to { video: true, audio: true } on OverconstrainedError');
  assert.ok(appSrc.includes("postCamState === 'granted' && postMicState === 'granted'"), 'handleAuthorizeCamera must recover cleanly if user allowed access during dismiss race');
  assert.ok(appSrc.includes('"Permission Prompt Dismissed"'), 'Must explicitly explain Chrome Permission Prompt Dismissed case');
  assert.ok(appSrc.includes('"Camera & Microphone Blocked"'), 'Must explicitly explain omnibox Allow recovery when blocked');
  assert.ok(appSrc.includes("track.addEventListener('ended'"), 'Must monitor live track revocation via ended event');
  assert.ok(appSrc.includes('stopActiveMediaStreams();'), 'Exam finalization must stop streams cleanly via stopActiveMediaStreams');
  assert.ok(appSrc.slice(startIdx, activeFlowIdx).includes('hasLiveMediaTracks(verifiedStream)'), 'handleStartExam must verify live tracks prior to starting test');
  console.log('  ✅ Concurrency lock, fullscreen exit guard, track lifecycle listeners, and pre-start verification verified.');

  // ------------------------------------------------------------------
  // SECTION 4: SystemChecksView & BiometricCheckView Incognito Resilience
  // ------------------------------------------------------------------
  console.log('\n[SECTION 4] SystemChecksView & BiometricCheckView UI + Voice Fallback:');

  const sysChecksSrc = fs.readFileSync(path.join(OT_SRC, 'views', 'SystemChecksView.jsx'), 'utf8');
  assert.ok(sysChecksSrc.includes('isAuthorizingMedia = false'), 'SystemChecksView must accept isAuthorizingMedia');
  assert.ok(sysChecksSrc.includes('mediaPermissionError = \'\''), 'SystemChecksView must accept mediaPermissionError');
  assert.ok(sysChecksSrc.includes('disabled={isAuthorizingMedia}'), 'SystemChecksView Card 6 button must disable while awaiting prompt');
  assert.ok(sysChecksSrc.includes('Waiting for Permission...'), 'SystemChecksView must show loading state during prompt');
  assert.ok(sysChecksSrc.includes('{mediaPermissionError && (!webcamGranted || !micGranted)'), 'SystemChecksView must render inline mediaPermissionError alert');
  assert.ok(sysChecksSrc.includes('if (!webcamGranted || !micGranted) return;'), 'SystemChecksView must re-probe virtual camera labels after permissions granted');

  const bioSrc = fs.readFileSync(path.join(OT_SRC, 'views', 'BiometricCheckView.jsx'), 'utf8');
  assert.ok(bioSrc.includes('isAuthorizingMedia = false'), 'BiometricCheckView must accept isAuthorizingMedia');
  assert.ok(bioSrc.includes('mediaPermissionError = \'\''), 'BiometricCheckView must accept mediaPermissionError');
  assert.ok(bioSrc.includes('Waiting for Permission...'), 'BiometricCheckView must show waiting indicator while authorizing');
  assert.ok(bioSrc.includes('triggerVoiceFallback('), 'BiometricCheckView must trigger mic volume fallback on SpeechRecognition errors');
  assert.ok(bioSrc.includes("'service-not-allowed'") && bioSrc.includes("'not-allowed'"), 'BiometricCheckView SpeechRecognition.onerror must catch Incognito blocked codes');
  assert.ok(bioSrc.includes("voiceVerificationStatus: 'needs_review'"), 'Voice fallback must honestly mark voiceVerificationStatus as needs_review');
  assert.ok(bioSrc.includes('clearTimeout(voiceFallbackTimerRef.current)'), 'BiometricCheckView must clean up fallback timers on unmount');
  console.log('  ✅ SystemChecksView and BiometricCheckView Incognito UI & voice fallback verified.');

  console.log('\n==================================================================');
  console.log('🎉 ALL INCOGNITO PERMISSION & MODAL REGRESSION TESTS PASSED!');
  console.log('==================================================================');
}

runSuite().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
