const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { 
  TestSubmissionModel, 
  EIRFReportModel, 
  AcademicMarksLedgerModel, 
  TestSignalModel, 
  TestTokenModel 
} = require('../models');

async function deleteAllSubmissions() {
  console.log("=== BICS TEST SUBMISSIONS PURGE ===");

  // 1. Purge Local Disk Snapshots
  const proctoringDir = path.join(__dirname, '..', 'public', 'proctoring');
  let diskFoldersRemoved = 0;
  if (fs.existsSync(proctoringDir)) {
    const entries = fs.readdirSync(proctoringDir);
    for (const entry of entries) {
      const fullPath = path.join(proctoringDir, entry);
      try {
        fs.rmSync(fullPath, { recursive: true, force: true });
        diskFoldersRemoved++;
      } catch (err) {
        console.warn(`Could not remove ${entry}:`, err.message);
      }
    }
  }
  console.log(`[Disk Cleanup] Removed ${diskFoldersRemoved} proctoring snapshot directories.`);

  // 2. Purge JSON DB Submissions
  const dbJsonPath = path.join(__dirname, '..', 'db.json');
  if (fs.existsSync(dbJsonPath)) {
    try {
      const db = JSON.parse(fs.readFileSync(dbJsonPath, 'utf8'));
      const subCount = (db.testSubmissions || []).length;
      const eirfCount = (db.eirfReports || []).length;
      db.testSubmissions = [];
      db.eirfReports = [];
      fs.writeFileSync(dbJsonPath, JSON.stringify(db, null, 2), 'utf8');
      console.log(`[db.json Cleanup] Cleared ${subCount} submissions and ${eirfCount} EIRF reports.`);
    } catch (err) {
      console.warn("Could not clean db.json:", err.message);
    }
  }

  // 3. Purge MongoDB Atlas Collections
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.log("[MongoDB] No MONGO_URI found in .env; finished local cleanup.");
    process.exit(0);
  }

  console.log("[MongoDB] Connecting to database...");
  await mongoose.connect(mongoUri);
  console.log("[MongoDB] Connected successfully.");

  const subRes = await TestSubmissionModel.deleteMany({});
  console.log(`[MongoDB Cleanup] Deleted ${subRes.deletedCount} TestSubmission records.`);

  const eirfRes = await EIRFReportModel.deleteMany({});
  console.log(`[MongoDB Cleanup] Deleted ${eirfRes.deletedCount} EIRFReport records.`);

  if (AcademicMarksLedgerModel) {
    const marksRes = await AcademicMarksLedgerModel.deleteMany({});
    console.log(`[MongoDB Cleanup] Deleted ${marksRes.deletedCount} AcademicMarksLedger records.`);
  }

  if (TestSignalModel) {
    const sigRes = await TestSignalModel.deleteMany({});
    console.log(`[MongoDB Cleanup] Deleted ${sigRes.deletedCount} TestSignal records.`);
  }

  if (TestTokenModel) {
    const tokRes = await TestTokenModel.deleteMany({});
    console.log(`[MongoDB Cleanup] Deleted ${tokRes.deletedCount} TestToken records.`);
  }

  await mongoose.disconnect();
  console.log("=== ALL TEST SUBMISSIONS SUCCESSFULLY PURGED ===");
  process.exit(0);
}

deleteAllSubmissions().catch(err => {
  console.error("Purge Error:", err);
  process.exit(1);
});
