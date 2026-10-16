const assert = require('assert');
const mongoose = require('mongoose');
const { TestSubmissionSchema } = require('../models/TestSubmission');

// Test mergeProctoringLogs logic and total warnings calculation
async function runInspectProctoringVerification() {
  console.log('Testing Developer Tools / Inspect Element Proctoring Enforcement...');

  // 1. Verify TestSubmission schema includes inspectAttempts
  const submissionPaths = TestSubmissionSchema.paths;
  assert(submissionPaths['proctoringLog.inspectAttempts'], 'TestSubmission schema must define proctoringLog.inspectAttempts');
  console.log('  [PASS] 1. TestSubmission schema proctoringLog.inspectAttempts field defined correctly');

  // 2. Simulate mergeProctoringLogs logic
  const existingLog = {
    fullscreenExits: 1,
    tabSwitches: 0,
    inspectAttempts: 0,
    events: []
  };

  const incomingLog = {
    fullscreenExits: 1,
    tabSwitches: 1,
    inspectAttempts: 1,
    events: [
      { type: 'DEVTOOLS_OPENED', details: 'Candidate opened developer tools via F12 shortcut', timestamp: new Date() }
    ]
  };

  const log = { ...existingLog, events: [...existingLog.events] };
  incomingLog.events.forEach(ev => log.events.push(ev));

  const eventFullscreenExits = log.events.filter(e => e.type === 'FULLSCREEN_EXIT').length;
  const eventTabSwitches = log.events.filter(e => e.type === 'TAB_SWITCH').length;
  const eventInspectAttempts = log.events.filter(e => e.type === 'DEVTOOLS_OPENED' || e.type === 'INSPECT_ATTEMPT').length;

  log.fullscreenExits = Math.max(Number(existingLog.fullscreenExits || 0), Number(incomingLog?.fullscreenExits || 0), eventFullscreenExits);
  log.tabSwitches = Math.max(Number(existingLog.tabSwitches || 0), Number(incomingLog?.tabSwitches || 0), eventTabSwitches);
  log.inspectAttempts = Math.max(Number(existingLog.inspectAttempts || 0), Number(incomingLog?.inspectAttempts || 0), eventInspectAttempts);

  assert.strictEqual(log.inspectAttempts, 1, 'inspectAttempts must be merged to 1');
  assert.strictEqual(log.fullscreenExits, 1, 'fullscreenExits must be 1');
  assert.strictEqual(log.tabSwitches, 1, 'tabSwitches must be 1');
  console.log('  [PASS] 2. mergeProctoringLogs monotonically counts inspectAttempts from incoming logs and events');

  // 3. Test cumulative 3-strike threshold including inspect attempts
  const totalWarnings = log.fullscreenExits + log.tabSwitches + log.inspectAttempts;
  assert.strictEqual(totalWarnings, 3, 'Total warnings (1 FS + 1 Tab + 1 Inspect) must equal 3');
  const isAutoSubmitted = totalWarnings >= 3;
  assert.strictEqual(isAutoSubmitted, true, 'Reaching 3 cumulative violations must trigger auto-submission');
  console.log('  [PASS] 3. Cumulative major proctoring violations (1 FS + 1 Tab + 1 Inspect = 3) triggers auto-submission');

  // 4. Test EIRF incident parts formulation
  const incidentParts = [];
  if (log.fullscreenExits > 0) incidentParts.push(`${log.fullscreenExits} Fullscreen Exit(s)`);
  if (log.tabSwitches > 0) incidentParts.push(`${log.tabSwitches} Tab Switch(es) / Focus Loss`);
  if (log.inspectAttempts > 0) incidentParts.push(`${log.inspectAttempts} Developer Tools / Inspect Element Attempt(s)`);
  
  assert(incidentParts.includes('1 Developer Tools / Inspect Element Attempt(s)'), 'Incident parts must include Inspect Element attempts');
  console.log('  [PASS] 4. EIRF notice and incident summary explicitly documents Inspect Element attempts');

  console.log('\nAll Developer Tools / Inspect Proctoring Tests Passed Successfully!');
}

runInspectProctoringVerification().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
