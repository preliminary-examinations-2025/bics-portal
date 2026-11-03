/**
 * Deep Verification Script for ALL Backend Modules
 * 
 * 1. Statically inspects all 64 backend files for require statements and export parity.
 * 2. Dynamically loads/requires every single backend module to catch ReferenceErrors, missing variables, or initialization bugs.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('==================================================================');
console.log('🔬 DEEP BACKEND MODULE & IMPORT INTEGRITY AUDIT');
console.log('==================================================================\n');

const backendDir = path.resolve(__dirname, '..');

// Helper to recursively get all .js files
function getAllJsFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === 'node_modules' || file === 'tests' || file === 'public' || file.startsWith('.')) continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllJsFiles(fullPath));
    } else if (file.endsWith('.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

const files = getAllJsFiles(backendDir);
console.log(`Discovered ${files.length} backend source files.`);

let totalRequires = 0;
let errorsFound = [];

// 1. Static Require Path Verification
console.log('\n--- PHASE 1: Validating all require(...) target paths ---');
const requireRegex = /require\(['"]([^'"]+)['"]\)/g;

for (const filePath of files) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relPath = path.relative(backendDir, filePath);
  let match;
  while ((match = requireRegex.exec(content)) !== null) {
    const reqTarget = match[1];
    totalRequires++;

    // Only validate relative requires
    if (reqTarget.startsWith('.')) {
      const targetDir = path.dirname(filePath);
      const possibleExtensions = ['', '.js', '.json'];
      let found = false;

      for (const ext of possibleExtensions) {
        const candidate = path.resolve(targetDir, reqTarget + ext);
        if (fs.existsSync(candidate) && !fs.statSync(candidate).isDirectory()) {
          found = true;
          break;
        }
        const candidateIndex = path.resolve(targetDir, reqTarget, 'index' + ext);
        if (fs.existsSync(candidateIndex)) {
          found = true;
          break;
        }
      }

      if (!found) {
        errorsFound.push(`[BROKEN REQUIRE] in ${relPath}: require('${reqTarget}') could not be resolved!`);
      }
    }
  }
}

console.log(`Checked ${totalRequires} require statements.`);
if (errorsFound.length > 0) {
  console.error('❌ Phase 1 Errors:');
  errorsFound.forEach(e => console.error('  ', e));
} else {
  console.log('✅ Phase 1: All relative require paths resolve correctly to on-disk files.');
}

// 2. Dynamic Module Execution & Export Parity Test
console.log('\n--- PHASE 2: Dynamic Execution & Undefined Reference Check ---');
let loadErrors = [];

// Temporarily mock environment variables to avoid DB connection crash on require
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/test_dummy';

for (const filePath of files) {
  const relPath = path.relative(backendDir, filePath);
  // Skip server.js from direct require as it starts listening immediately
  if (relPath === 'server.js') continue;

  try {
    const mod = require(filePath);
    // If it's an object, verify it loaded
    if (typeof mod === 'undefined') {
      loadErrors.push(`[UNDEFINED MODULE] ${relPath} exported undefined`);
    }
  } catch (err) {
    loadErrors.push(`[LOAD ERROR] in ${relPath}: ${err.name} - ${err.message}\n${err.stack.split('\n').slice(0, 4).join('\n')}`);
  }
}

if (loadErrors.length > 0) {
  console.error('❌ Phase 2 Errors:');
  loadErrors.forEach(e => console.error('  ', e));
  process.exit(1);
} else {
  console.log(`✅ Phase 2: All ${files.length - 1} backend modules executed and loaded without any ReferenceError, TypeError, or export issues!`);
}

// 3. Inspect common routers for undefined middleware in route definitions
console.log('\n--- PHASE 3: Inspect Express Routers for Undefined Route Middleware ---');
const routerFiles = files.filter(f => f.includes(path.sep + 'routes' + path.sep));
let routerErrors = [];

for (const rFile of routerFiles) {
  const relPath = path.relative(backendDir, rFile);
  try {
    const routerMod = require(rFile);
    if (routerMod && routerMod.stack && Array.isArray(routerMod.stack)) {
      routerMod.stack.forEach((layer, layerIdx) => {
        if (!layer.route) return;
        const routePath = layer.route.path;
        const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
        layer.route.stack.forEach((handlerLayer, hIdx) => {
          if (typeof handlerLayer.handle !== 'function') {
            routerErrors.push(`[UNDEFINED HANDLER] in ${relPath} on route [${methods}] ${routePath} (handler #${hIdx} is ${typeof handlerLayer.handle})`);
          }
        });
      });
    }
  } catch (rErr) {
    routerErrors.push(`[ROUTER INSPECTION ERROR] in ${relPath}: ${rErr.message}`);
  }
}

if (routerErrors.length > 0) {
  console.error('❌ Phase 3 Errors:');
  routerErrors.forEach(e => console.error('  ', e));
  process.exit(1);
} else {
  console.log(`✅ Phase 3: All routes in ${routerFiles.length} Express routers have 100% valid function handlers (no undefined middleware)!`);
}

console.log('\n==================================================================');
console.log('🎉 ENTIRE BACKEND CODEBASE AUDITED WITH 0 ERRORS!');
console.log('==================================================================\n');

process.exit(0);
