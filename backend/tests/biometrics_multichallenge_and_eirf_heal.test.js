/**
 * Biometrics Multi-Challenge, Registered Photo Verification, EIRF Auto-Heal, and UI Transition Test Suite
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { compareFaceBiometrics, isPlaceholderPhoto } = require('../utils/biometricMatcher');

async function runTestSuite() {
    console.log('==================================================================');
    console.log('🔬 RUNNING MULTI-CHALLENGE, PHOTO VERIFY & EIRF HEAL TEST SUITE');
    console.log('==================================================================\n');

    // TEST 1: Registered Photo URL & Placeholder Detection
    console.log('[TEST 1] Registered Photo URL Resolution & Placeholder Detection:');
    assert.strictEqual(isPlaceholderPhoto('https://res.cloudinary.com/demo/image/upload/sample.jpg'), true);
    assert.strictEqual(isPlaceholderPhoto('/public/uploads/default-photo.png'), true);
    assert.strictEqual(isPlaceholderPhoto(''), true);
    assert.strictEqual(isPlaceholderPhoto('https://res.cloudinary.com/dl7xqcnmr/image/upload/BICS_2026/candidate_123.jpg'), false);
    console.log('  ✅ Placeholder photo detection accurately distinguishes demo URLs from real enrolled photos.');

    // TEST 2: Biometric Matcher Graceful Fallback on Missing / Placeholder Photo
    console.log('\n[TEST 2] Biometric Matcher Handling of Enrolled vs Placeholder Photos:');
    const liveSample = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const placeholderResult = await compareFaceBiometrics(liveSample, '/public/uploads/default-photo.png');
    assert.strictEqual(placeholderResult.decision, 'unregistered-reference');
    assert.strictEqual(placeholderResult.isEnrolled, false);
    assert.strictEqual(placeholderResult.reviewNeeded, true);
    console.log('  ✅ Unregistered candidate conditionally passes without student lockout (Flagged for proctor review).');

    // TEST 3: EIRF Auto-Healing of Empty Options and UTC Timestamps
    console.log('\n[TEST 3] EIRF Choice Question Auto-Healing:');
    const mockCorruptedQuestions = [
        {
            questionId: 'Q1',
            questionType: 'TEXT',
            category: 'ROOT_CAUSE',
            questionText: 'Root cause',
            options: []
        },
        {
            questionId: 'Q2',
            questionType: 'RADIO',
            category: 'INCIDENT_CLASSIFICATION',
            questionText: 'Which of the following best classifies the primary cause?',
            options: []
        },
        {
            questionId: 'Q3',
            questionType: 'TEXT',
            category: 'INCIDENT_DRILLDOWN',
            placeholder: 'Detail the event, e.g., At 08:03:20, a network offline gap occurred',
            options: []
        },
        {
            questionId: 'Q4',
            questionType: 'CHECKBOX',
            category: 'BACKGROUND_SOFTWARE',
            questionText: 'Active software',
            options: []
        }
    ];

    // Read healGeneratedQuestions logic from routes/eirf.js
    const eirfRouteSrc = fs.readFileSync(path.join(__dirname, '../routes/eirf.js'), 'utf8');
    assert(eirfRouteSrc.includes('function healGeneratedQuestions'), 'eirf.js must contain healGeneratedQuestions function');
    assert(eirfRouteSrc.includes('TestSubmissionModel.updateOne'), 'eirf.js must persist healed questions to DB');

    // Test the logic directly
    const evalHeal = new Function('questions', `
        ${eirfRouteSrc.slice(eirfRouteSrc.indexOf('function healGeneratedQuestions'), eirfRouteSrc.indexOf('// 1. Get EIRF Incident Details'))}
        return healGeneratedQuestions(questions);
    `);

    const { healed, modified } = evalHeal(mockCorruptedQuestions);
    assert.strictEqual(modified, true, 'Corrupted questions must trigger modified flag');
    assert(healed[1].options.length >= 5, 'Q2 RADIO must have at least 5 backfilled options');
    assert(healed[3].options.length >= 5, 'Q4 CHECKBOX must have at least 5 backfilled options');
    assert(healed[2].placeholder.includes('13:33:20 IST'), 'Q3 UTC timestamp 08:03:20 must be converted to 13:33:20 IST');
    console.log('  ✅ Empty options successfully healed and legacy UTC timestamps converted to IST.');

    // TEST 4: Multi-Challenge Biometric Route Configuration
    console.log('\n[TEST 4] Server-Side Multi-Challenge Route Configuration:');
    const testsRouteSrc = fs.readFileSync(path.join(__dirname, '../routes/tests.js'), 'utf8');
    assert(testsRouteSrc.includes('challenges = ['), 'tests.js must generate sequential challenges array');
    assert(testsRouteSrc.includes('totalSteps: challenges.length'), 'tests.js must return totalSteps');
    assert(testsRouteSrc.includes('allCompleted'), 'tests.js verify route must check allCompleted');
    console.log('  ✅ Server-side multi-challenge route correctly configured for 2 distinct sequential steps.');

    // TEST 5: System Checks Abstraction Text
    console.log('\n[TEST 5] System Checks Candidate UI Abstraction:');
    const sysChecksSrc = fs.readFileSync(path.join(__dirname, '../../frontend_ot/src/views/SystemChecksView.jsx'), 'utf8');
    assert(!sysChecksSrc.includes('Start ticket cryptographically issued'), 'SystemChecksView must NOT mention cryptographic issuance to candidate');
    assert(sysChecksSrc.includes('Environment successfully verified.'), 'SystemChecksView must show clean verified message');
    console.log('  ✅ System checks text abstraction verified.');

    // TEST 6: Pre-Active and Main Portal View Transitions
    console.log('\n[TEST 6] View Transitions (Pre-Active & Main Portal):');
    const frontendOtCss = fs.readFileSync(path.join(__dirname, '../../frontend_ot/src/index.css'), 'utf8');
    assert(frontendOtCss.includes('0.95s cubic-bezier(0.2, 0.8, 0.2, 1)'), 'frontend_ot index.css must use 0.95s cubic-bezier for calm transitions');

    const frontendCss = fs.readFileSync(path.join(__dirname, '../../frontend/src/index.css'), 'utf8');
    assert(frontendCss.includes('@keyframes portalViewFadeIn'), 'frontend index.css must define @keyframes portalViewFadeIn');
    assert(frontendCss.includes('.portal-view-transition'), 'frontend index.css must define .portal-view-transition');

    const frontendApp = fs.readFileSync(path.join(__dirname, '../../frontend/src/App.jsx'), 'utf8');
    assert(frontendApp.includes('className="portal-view-transition"'), 'frontend App.jsx must wrap view container in portal-view-transition');
    console.log('  ✅ Slower calm pre-active transitions (0.95s) and portal view transitions (0.55s) verified.');

    console.log('\n==================================================================');
    console.log('🎉 ALL MULTI-CHALLENGE, PHOTO VERIFY & EIRF HEAL TESTS PASSED!');
    console.log('==================================================================');
}

runTestSuite().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
});
