const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const { TestSubmissionModel, TestSignalModel, TestTokenModel } = require('../models');
const { getJSONData, saveJSONData } = require('../config/db');

async function clearTestSubmissions() {
  console.log('=== Clearing Test Submissions from Local/Database ===');

  // 1. Clear from db.json if any
  try {
    const db = getJSONData();
    const countInJson = (db.testSubmissions || []).length;
    db.testSubmissions = [];
    saveJSONData(db);
    console.log(`[db.json] Cleared ${countInJson} test submission(s).`);
  } catch (err) {
    console.warn('[db.json] Warning:', err.message);
  }

  // 2. Clear from MongoDB if configured
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.log('No MONGODB_URI found. Finished.');
    process.exit(0);
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log('Connected to MongoDB.');

    // Count before
    const subCount = await TestSubmissionModel.countDocuments();
    console.log(`Found ${subCount} TestSubmission document(s) in MongoDB.`);

    if (subCount > 0) {
      const result = await TestSubmissionModel.deleteMany({});
      console.log(`Successfully deleted ${result.deletedCount} TestSubmission document(s).`);
    }

    // Also clean up any orphan test tokens / test signals tied to those attempts if needed
    const tokenCount = await TestTokenModel.countDocuments();
    console.log(`Found ${tokenCount} TestToken document(s).`);
    if (tokenCount > 0) {
      const tokRes = await TestTokenModel.deleteMany({});
      console.log(`Deleted ${tokRes.deletedCount} TestToken document(s).`);
    }

    const signalCount = await TestSignalModel.countDocuments();
    console.log(`Found ${signalCount} TestSignal document(s).`);
    if (signalCount > 0) {
      const sigRes = await TestSignalModel.deleteMany({});
      console.log(`Deleted ${sigRes.deletedCount} TestSignal document(s).`);
    }

    console.log('✅ All test submissions cleared cleanly from MongoDB and local storage.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('MongoDB Error:', err.message);
    process.exit(1);
  }
}

clearTestSubmissions();
