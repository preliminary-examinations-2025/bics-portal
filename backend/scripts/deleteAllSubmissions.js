/**
 * deleteAllSubmissions.js
 * One-shot admin utility — deletes all documents from the testSubmissions collection.
 * Run: node backend/scripts/deleteAllSubmissions.js
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/bics_db';

async function main() {
  console.log('Connecting to MongoDB:', MONGO_URI);
  await mongoose.connect(MONGO_URI);
  console.log('Connected.');

  const db = mongoose.connection.db;

  // List all collections so we target the right one
  const collections = await db.listCollections().toArray();
  const names = collections.map(c => c.name);
  console.log('Collections found:', names.join(', '));

  // Delete from testsubmissions (and any alias variants)
  const targets = names.filter(n =>
    n.toLowerCase().includes('submission') || n.toLowerCase().includes('testresult')
  );

  if (targets.length === 0) {
    console.log('No submission-related collections found. Exiting.');
  }

  for (const col of targets) {
    const result = await db.collection(col).deleteMany({});
    console.log(`  Deleted ${result.deletedCount} documents from "${col}"`);
  }

  await mongoose.disconnect();
  console.log('Done. Disconnected.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
