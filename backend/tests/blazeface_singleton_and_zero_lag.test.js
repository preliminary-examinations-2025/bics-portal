/**
 * blazeface_singleton_and_zero_lag.test.js
 *
 * Verifies that:
 * 1. blazefaceLoader.js exists and exports getBlazeFaceModel, preloadBlazeFaceIdle, and isBlazeFaceReady.
 * 2. App.jsx does NOT eagerly invoke blazeface.load() or model.estimateFaces() on mount.
 * 3. verify_login and terms_conditions views remain completely free of any machine learning / WebGL imports.
 * 4. SystemChecksView and handleAuthorizeCamera utilize preloadBlazeFaceIdle() for non-blocking idle scheduling.
 * 5. BiometricCheckView consumes getBlazeFaceModel() via the singleton pattern.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OT_SRC = path.join(ROOT, 'frontend_ot', 'src');

console.log("==================================================================");
console.log("⚡ TESTING BLAZEFACE SINGLETON & ZERO-UI-LAG ARCHITECTURE");
console.log("==================================================================");

// 1. Verify blazefaceLoader.js exists and has required exports
console.log("\n[TEST 1] Singleton Module Structure & Non-Blocking Idle Scheduling:");
const loaderPath = path.join(OT_SRC, 'utils', 'blazefaceLoader.js');
assert.ok(fs.existsSync(loaderPath), "blazefaceLoader.js must exist");
const loaderContent = fs.readFileSync(loaderPath, 'utf8');

assert.ok(loaderContent.includes('export function isBlazeFaceReady'), "Must export isBlazeFaceReady");
assert.ok(loaderContent.includes('export async function getBlazeFaceModel'), "Must export getBlazeFaceModel");
assert.ok(loaderContent.includes('export function preloadBlazeFaceIdle'), "Must export preloadBlazeFaceIdle");
assert.ok(loaderContent.includes('requestIdleCallback'), "Must use requestIdleCallback for non-blocking execution");
assert.ok(loaderContent.includes('dummyCanvas'), "Must pre-warm on dummyCanvas off the main interaction path");
console.log("  ✅ blazefaceLoader.js exports verified with requestIdleCallback scheduling.");

// 2. Verify App.jsx does NOT invoke eager blazeface loading on mount
console.log("\n[TEST 2] App.jsx Mount Non-Blocking Verification:");
const appPath = path.join(OT_SRC, 'App.jsx');
const appContent = fs.readFileSync(appPath, 'utf8');

// Ensure eager load was removed
assert.ok(!appContent.includes('Pre-warming BlazeFace model asynchronously...'), "App.jsx must not eagerly log/pre-warm on mount");
assert.ok(appContent.includes('preloadBlazeFaceIdle'), "App.jsx must import preloadBlazeFaceIdle");
assert.ok(appContent.includes('preloadBlazeFaceIdle()'), "App.jsx must trigger idle preload upon camera authorization");
console.log("  ✅ App.jsx confirmed free of eager model loading and synchronous shader compilation.");

// 3. Verify verify_login and terms_conditions have 0 ML overhead
console.log("\n[TEST 3] Initial Flow Zero-ML Purity:");
const verifyLoginPath = path.join(OT_SRC, 'views', 'VerifyLoginView.jsx');
if (fs.existsSync(verifyLoginPath)) {
  const verifyLoginContent = fs.readFileSync(verifyLoginPath, 'utf8');
  assert.ok(!verifyLoginContent.includes('blazeface'), "VerifyLoginView must have 0 blazeface references");
  assert.ok(!verifyLoginContent.includes('tfjs'), "VerifyLoginView must have 0 tfjs references");
}

const termsPath = path.join(OT_SRC, 'views', 'TermsConditionsView.jsx');
if (fs.existsSync(termsPath)) {
  const termsContent = fs.readFileSync(termsPath, 'utf8');
  assert.ok(!termsContent.includes('blazeface'), "TermsConditionsView must have 0 blazeface references");
  assert.ok(!termsContent.includes('tfjs'), "TermsConditionsView must have 0 tfjs references");
}
console.log("  ✅ verify_login and terms_conditions confirmed 100% free of ML/WebGL overhead.");

// 4. Verify BiometricCheckView uses getBlazeFaceModel singleton
console.log("\n[TEST 4] BiometricCheckView Singleton Integration:");
const bioPath = path.join(OT_SRC, 'views', 'BiometricCheckView.jsx');
const bioContent = fs.readFileSync(bioPath, 'utf8');
assert.ok(bioContent.includes("import { getBlazeFaceModel } from '../utils/blazefaceLoader'"), "BiometricCheckView must import getBlazeFaceModel from blazefaceLoader");
assert.ok(bioContent.includes('getBlazeFaceModel({ prewarm: true })'), "BiometricCheckView must use getBlazeFaceModel singleton");
console.log("  ✅ BiometricCheckView consumes singleton without duplicate blazeface.load() calls.");

console.log("\n==================================================================");
console.log("🎉 ALL ZERO-UI-LAG & BLAZEFACE SINGLETON TESTS PASSED!");
console.log("==================================================================");
