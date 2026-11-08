/**
 * UI Transitions, Biometric Single Loader & Start Test Idempotency Verification Test
 * 
 * Verifies:
 * 1. CSS keyframe animations & classes for smooth, slow view transitions.
 * 2. App.jsx view wrapping with bics-view-transition and key={flow}.
 * 3. App.jsx synchronous isStartingExamRef guarding against double submissions.
 * 4. GuidelinesSetupView button idempotency, disabled state, and "Starting..." spinner.
 * 5. BiometricCheckView single simple loader consolidation (no redundant banner spinner).
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Starting UI Transitions, Single Loader & Idempotency Test Suite...');

const frontendDir = path.join(__dirname, '../../frontend_ot/src');

// 1. Verify index.css transitions
console.log('  1. Verifying CSS transition rules in index.css...');
const indexCssPath = path.join(frontendDir, 'index.css');
const indexCss = fs.readFileSync(indexCssPath, 'utf8');

assert(indexCss.includes('@keyframes bicsViewFadeIn'), 'index.css must define @keyframes bicsViewFadeIn');
assert(indexCss.includes('.bics-view-transition'), 'index.css must define .bics-view-transition class');
assert(indexCss.includes('animation: bicsViewFadeIn 0.95s cubic-bezier(0.2, 0.8, 0.2, 1)'), 'index.css must use smooth 0.95s easing for bics-view-transition');
console.log('     ✅ CSS transitions correctly configured with 0.95s calm easing.');

// 2. Verify App.jsx view transitions and state wiring
console.log('  2. Verifying App.jsx view transitions and idempotency guards...');
const appJsxPath = path.join(frontendDir, 'App.jsx');
const appJsx = fs.readFileSync(appJsxPath, 'utf8');

// View transitions wrapping
assert(appJsx.includes('<div key={flow} className="bics-view-transition">'), 'App.jsx must wrap flow steps with bics-view-transition');
assert(appJsx.includes('isStartingExam={isStartingExam}'), 'App.jsx must pass isStartingExam to GuidelinesSetupView');

// Idempotency guard and ref
assert(appJsx.includes('const isStartingExamRef = useRef(false);'), 'App.jsx must have isStartingExamRef');
assert(appJsx.includes('const [isStartingExam, setIsStartingExam] = useState(false);'), 'App.jsx must have isStartingExam state');
assert(appJsx.includes('if (isStartingExamRef.current)'), 'handleStartExam must check isStartingExamRef.current immediately');
assert(appJsx.includes('isStartingExamRef.current = true;'), 'handleStartExam must set isStartingExamRef.current = true synchronously');

// Error reset
assert(appJsx.includes('isStartingExamRef.current = false;\n      setIsStartingExam(false);'), 'handleStartExam catch block must reset idempotency ref and state on network error');
console.log('     ✅ App.jsx idempotency guard & view transitions verified.');

// 3. Verify GuidelinesSetupView button idempotency & loader
console.log('  3. Verifying GuidelinesSetupView button state and "Starting..." UI...');
const guidelinesViewPath = path.join(frontendDir, 'views/GuidelinesSetupView.jsx');
const guidelinesView = fs.readFileSync(guidelinesViewPath, 'utf8');

assert(guidelinesView.includes('isStartingExam = false'), 'GuidelinesSetupView must accept isStartingExam prop');
assert(guidelinesView.includes('disabled={!prepCompleted || isStartingExam}'), 'Start button must be disabled when isStartingExam is true');
assert(guidelinesView.includes('Starting...'), 'Start button must display "Starting..." label while initializing');
assert(guidelinesView.includes('<Loader2 size={13} className="spinner" />'), 'Start button must render spinner during isStartingExam');
assert(guidelinesView.includes('not-allowed'), 'Start button must have disabled cursor styling');
console.log('     ✅ GuidelinesSetupView idempotent start button verified.');

// 4. Verify BiometricCheckView single loader consolidation
console.log('  4. Verifying BiometricCheckView single loader consolidation...');
const biometricViewPath = path.join(frontendDir, 'views/BiometricCheckView.jsx');
const biometricView = fs.readFileSync(biometricViewPath, 'utf8');

// Check that banner doesn't have a spinner
assert(!biometricView.includes('Verifying Facial Identity against Enrolled Profile...'), 'Banner should not contain redundant spinner text block');
// Check that the primary capture button does have the loader
assert(biometricView.includes('{isVerifyingBiometrics ? ('), 'Capture button must handle isVerifyingBiometrics state');
assert(biometricView.includes('Verifying with Server...'), 'Capture button must render "Verifying with Server..." label');

console.log('     ✅ BiometricCheckView single loader verified (no double spinner).');

console.log('\n🎉 ALL UI TRANSITION, SINGLE LOADER & IDEMPOTENCY CHECKS PASSED!\n');
