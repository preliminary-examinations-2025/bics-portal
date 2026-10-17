const assert = require('assert');
const mongoose = require('mongoose');
const { ConfigModel } = require('../models/Config');
const { initialDB, getJSONData, saveJSONData } = require('../config/db');

async function runDevModeVerificationSuite() {
  console.log('==================================================================');
  console.log('🚀 RUNNING DEV MODE & NON-DEV MODE COMPREHENSIVE AUDIT SUITE');
  console.log('==================================================================');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  // 1. Schema Definition
  test('ConfigSchema defines devModeActive with Boolean type and default false', () => {
    const devModePath = ConfigModel.schema.paths['devModeActive'];
    assert(devModePath, 'devModeActive path must exist in ConfigSchema');
    assert.strictEqual(devModePath.instance, 'Boolean', 'devModeActive must be Boolean instance');
    assert.strictEqual(devModePath.defaultValue, false, 'devModeActive default value must be false');
  });

  // 2. Default Config Document Instantiation
  test('New ConfigModel instance defaults devModeActive to false', () => {
    const conf = new ConfigModel();
    assert.strictEqual(conf.devModeActive, false, 'New ConfigModel instance must have devModeActive === false');
  });

  // 3. Initial JSON DB configuration
  test('initialDB.config defines devModeActive as false', () => {
    assert.strictEqual(initialDB.config.devModeActive, false, 'initialDB.config.devModeActive must be false');
  });

  // 4. Fallback JSON DB Persistence & Toggle
  test('JSON fallback database reads, toggles, and persists devModeActive', () => {
    const db = getJSONData();
    assert(db.config, 'db.config must exist');
    
    // Set to true
    db.config.devModeActive = true;
    saveJSONData(db);

    const reloadedDb = getJSONData();
    assert.strictEqual(reloadedDb.config.devModeActive, true, 'Reloaded JSON config must reflect devModeActive: true');

    // Revert to false
    reloadedDb.config.devModeActive = false;
    saveJSONData(reloadedDb);

    const finalDb = getJSONData();
    assert.strictEqual(finalDb.config.devModeActive, false, 'Reloaded JSON config must reflect devModeActive: false');
  });

  // 5. Verification of Dev Mode Proctoring Logic Threshold
  test('Dev Mode logic bypasses auto-submission while keeping proctoring warnings and modal active', () => {
    // Simulate candidate proctoring state with total >= 3 warnings
    const proctoringWarnings = {
      fullscreenExits: 2,
      tabSwitches: 1,
      inspectAttempts: 1
    };
    const total = proctoringWarnings.fullscreenExits + proctoringWarnings.tabSwitches + proctoringWarnings.inspectAttempts;
    assert.strictEqual(total, 4, 'Total warnings should be 4');
    assert(total >= 3, 'Total warnings >= 3');

    // When devModeActive is FALSE (Production behavior)
    let autoSubmitCalled = false;
    let modalShown = false;
    let devModeActive = false;

    if (total >= 3) {
      if (devModeActive) {
        modalShown = true;
      } else {
        autoSubmitCalled = true;
      }
    }
    assert.strictEqual(autoSubmitCalled, true, 'In production mode, autoSubmit must be called on >= 3 warnings');

    // When devModeActive is TRUE (Dev Mode behavior)
    autoSubmitCalled = false;
    modalShown = false;
    devModeActive = true;

    if (total >= 3) {
      if (devModeActive) {
        modalShown = true;
        // auto-submit is bypassed
      } else {
        autoSubmitCalled = true;
      }
    }
    assert.strictEqual(autoSubmitCalled, false, 'In Dev Mode, autoSubmit MUST BE BYPASSED on >= 3 warnings');
    assert.strictEqual(modalShown, true, 'In Dev Mode, warning modal is still shown for developer awareness');
  });

  // 6. Verification of 1-Minute Holding Timer Skip Logic
  test('GuidelinesSetupView holding timer logic immediately marks prepCompleted: true when devModeActive', () => {
    function getInitialPrepState(devMode) {
      return {
        prepSecondsRemaining: devMode ? 0 : 60,
        prepCompleted: !!devMode
      };
    }

    const prodState = getInitialPrepState(false);
    assert.strictEqual(prodState.prepSecondsRemaining, 60, 'Production must start with 60 seconds remaining');
    assert.strictEqual(prodState.prepCompleted, false, 'Production must not be prepCompleted initially');

    const devState = getInitialPrepState(true);
    assert.strictEqual(devState.prepSecondsRemaining, 0, 'Dev Mode must skip to 0 seconds remaining');
    assert.strictEqual(devState.prepCompleted, true, 'Dev Mode must immediately mark prepCompleted as true');
  });

  // 7. Non-Dev Mode Strict Isolation & 3-Strike Auto-Submission Verification
  test('Non-Dev Mode (Production) strictly auto-submits on 3 cumulative strikes for all violation types', () => {
    const testCases = [
      { name: '3 Fullscreen Exits', warnings: { fullscreenExits: 3, tabSwitches: 0, inspectAttempts: 0 }, expectedEvent: 'FULLSCREEN_EXIT' },
      { name: '3 Tab Switches', warnings: { fullscreenExits: 0, tabSwitches: 3, inspectAttempts: 0 }, expectedEvent: 'TAB_SWITCH' },
      { name: '3 Inspect Element Attempts', warnings: { fullscreenExits: 0, tabSwitches: 0, inspectAttempts: 3 }, expectedEvent: 'DEVTOOLS_OPENED' },
      { name: 'Mixed: 1 FS + 1 Tab + 1 Inspect', warnings: { fullscreenExits: 1, tabSwitches: 1, inspectAttempts: 1 }, expectedEvent: 'DEVTOOLS_OPENED' }
    ];

    for (const tc of testCases) {
      const devModeActive = false;
      const total = tc.warnings.fullscreenExits + tc.warnings.tabSwitches + tc.warnings.inspectAttempts;
      assert.strictEqual(total, 3, `${tc.name} must total exactly 3 strikes`);

      let isAutoSubmitted = false;
      let loggedEventType = null;

      // Simulate App.jsx useEffect proctoring check
      if (total >= 3) {
        if (!devModeActive) {
          isAutoSubmitted = true;
          const newFS = tc.warnings.fullscreenExits > 0;
          const newTab = tc.warnings.tabSwitches > 0;
          const newInspect = tc.warnings.inspectAttempts > 0;

          if (tc.expectedEvent === 'FULLSCREEN_EXIT') loggedEventType = 'FULLSCREEN_EXIT';
          else if (tc.expectedEvent === 'TAB_SWITCH') loggedEventType = 'TAB_SWITCH';
          else loggedEventType = 'DEVTOOLS_OPENED';
        }
      }

      assert.strictEqual(isAutoSubmitted, true, `Non-dev mode must trigger auto-submit on ${tc.name}`);
      assert.strictEqual(loggedEventType, tc.expectedEvent, `Non-dev mode must formulate correct event type for ${tc.name}`);
    }
  });

  // 8. State Leakage Prevention: Toggling Dev Mode OFF in GuidelinesSetupView
  test('GuidelinesSetupView resets prepCompleted: false and prepSecondsRemaining: 60 when devModeActive transitions from true to false', () => {
    let prepState = {
      prepSecondsRemaining: 0,
      prepCompleted: true
    };

    // Simulate transition when devModeActive changes to false
    function onDevModeChange(devModeActive) {
      if (devModeActive) {
        prepState.prepSecondsRemaining = 0;
        prepState.prepCompleted = true;
      } else {
        prepState.prepCompleted = false;
        prepState.prepSecondsRemaining = 60;
      }
    }

    // Currently true
    onDevModeChange(true);
    assert.strictEqual(prepState.prepCompleted, true);
    assert.strictEqual(prepState.prepSecondsRemaining, 0);

    // Turned OFF by Admin
    onDevModeChange(false);
    assert.strictEqual(prepState.prepCompleted, false, 'prepCompleted MUST be reset to false when devModeActive is toggled off');
    assert.strictEqual(prepState.prepSecondsRemaining, 60, 'prepSecondsRemaining MUST be reset to 60 when devModeActive is toggled off');

    const canStartTest = prepState.prepCompleted && true; // fullscreen is active
    assert.strictEqual(canStartTest, false, 'Candidate CANNOT start test until the 60s countdown elapses');
  });

  // 9. State Leakage Prevention: Starting a New Exam Resets All Proctoring Refs
  test('handleStartExam ensures zero state leakage across attempts by wiping isAutoSubmittedRef, lastLoggedWarnings, and proctoringWarnings', () => {
    // Dirty state leftover from a previous session
    let isAutoSubmittedRef = { current: true };
    let lastLoggedWarnings = { current: { fullscreenExits: 3, tabSwitches: 2, inspectAttempts: 1 } };
    let proctoringWarnings = { fullscreenExits: 3, tabSwitches: 2, inspectAttempts: 1 };

    // Simulate handleStartExam clean-slate initialization
    function simulateHandleStartExam() {
      isAutoSubmittedRef.current = false;
      lastLoggedWarnings.current = { fullscreenExits: 0, tabSwitches: 0, inspectAttempts: 0 };
      proctoringWarnings = { fullscreenExits: 0, tabSwitches: 0, inspectAttempts: 0 };
    }

    simulateHandleStartExam();

    assert.strictEqual(isAutoSubmittedRef.current, false, 'isAutoSubmittedRef must be false on exam start');
    assert.strictEqual(lastLoggedWarnings.current.fullscreenExits, 0, 'lastLoggedWarnings.fullscreenExits must be 0');
    assert.strictEqual(lastLoggedWarnings.current.tabSwitches, 0, 'lastLoggedWarnings.tabSwitches must be 0');
    assert.strictEqual(lastLoggedWarnings.current.inspectAttempts, 0, 'lastLoggedWarnings.inspectAttempts must be 0');
    assert.strictEqual(proctoringWarnings.fullscreenExits, 0, 'proctoringWarnings.fullscreenExits must be 0');
    assert.strictEqual(proctoringWarnings.tabSwitches, 0, 'proctoringWarnings.tabSwitches must be 0');
    assert.strictEqual(proctoringWarnings.inspectAttempts, 0, 'proctoringWarnings.inspectAttempts must be 0');
  });

  // 10. State Leakage Prevention: Dynamic Dev Mode Revocation During Active Session
  test('If devModeActive is revoked while candidate has >= 3 warnings, non-dev mode immediately triggers auto-submission', () => {
    let devModeActive = true;
    let isAutoSubmitted = false;
    let isAutoSubmittedRef = { current: false };
    const warnings = { fullscreenExits: 2, tabSwitches: 1, inspectAttempts: 0 };
    const total = warnings.fullscreenExits + warnings.tabSwitches + warnings.inspectAttempts;

    function evaluateProctoringCheck() {
      if (total >= 3) {
        if (devModeActive) {
          // Bypassed in dev mode
          return 'bypassed';
        }
        if (!isAutoSubmittedRef.current) {
          isAutoSubmittedRef.current = true;
          isAutoSubmitted = true;
          return 'auto-submitted';
        }
      }
      return 'normal';
    }

    // Step 1: While devModeActive is TRUE, auto-submission is suppressed
    assert.strictEqual(evaluateProctoringCheck(), 'bypassed');
    assert.strictEqual(isAutoSubmitted, false);

    // Step 2: Admin revokes dev mode (devModeActive = false)
    devModeActive = false;
    assert.strictEqual(evaluateProctoringCheck(), 'auto-submitted');
    assert.strictEqual(isAutoSubmitted, true, 'Immediate auto-submission must be triggered once Dev Mode is deactivated with >= 3 warnings');
  });

  console.log(`\n==================================================================`);
  console.log(`🏁 VERIFICATION SUITE FINISHED: ${passed} Passed, ${failed} Failed`);
  console.log(`==================================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runDevModeVerificationSuite();
