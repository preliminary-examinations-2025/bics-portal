const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function pushPayload(scriptName) {
  console.log(`\n==================================================`);
  console.log(`Deploying ${scriptName} to LOCAL server ONLY...`);
  console.log(`==================================================`);

  try {
    const output = execSync(`node ${scriptName}`, {
      cwd: __dirname,
      encoding: 'utf8',
      env: { ...process.env, API_ACCESS_SECRET: 'qwertty' }
    });
    console.log(output);
  } catch (err) {
    console.error(`Error executing ${scriptName}:`, err.message);
    if (err.stdout) console.log(`Stdout:`, err.stdout);
    if (err.stderr) console.error(`Stderr:`, err.stderr);
  }
}

async function main() {
  console.log('[LOCAL_ONLY_DEPLOY_MASTER]: Deploying R526CS01T, R526CS02T, R526CS03T, R526CS04T to LOCAL SERVER ONLY...');

  const scripts = [
    'create_quiz_payload.js',
    'create_quiz2_payload.js',
    'create_quiz3_payload.js',
    'create_quiz4_payload.js'
  ];

  for (const script of scripts) {
    await pushPayload(script);
  }

  console.log('\n[LOCAL_ONLY_DEPLOY_MASTER]: Completed local deployments.');
}

main();
