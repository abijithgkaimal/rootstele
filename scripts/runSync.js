/**
 * Manual Sync Script
 *
 * Usage:
 *   node scripts/runSync.js all        → stores + returns + bookings (60 days)
 *   node scripts/runSync.js returns    → returns only (60 days)
 *   node scripts/runSync.js bookings   → bookings only (60 days)
 *   node scripts/runSync.js stores     → stores only
 *
 * Add --incremental flag for 7-day sync instead of 60:
 *   node scripts/runSync.js all --incremental
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) { console.error('ERROR: MONGODB_URI not set'); process.exit(1); }

const args = process.argv.slice(2);
const command = args[0] || 'all';
const incremental = args.includes('--incremental');

console.log(`\n🔄 Manual Sync — mode: ${command}, ${incremental ? 'incremental' : 'initial'}\n`);

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const { executeMasterSync } = require('../src/schedulers/masterSyncScheduler');

  try {
    if (command !== 'all') {
      console.warn('⚠️ Manual sync of individual sub-syncs (stores/returns/bookings) is deprecated. Running full Master Sync.');
    }

    const isInitial = args.includes('--initial');
    const isIncremental = args.includes('--incremental');
    const forceType = isInitial ? 'initial' : (isIncremental ? 'incremental' : null);
    
    console.log(`▶ Starting Master Sync (mode: ${forceType || 'auto-detect'})...`);
    
    // executeMasterSync handles locking and SyncMeta logging internally
    const result = await executeMasterSync('manual', forceType); 
    
    if (result) {
      console.log('\n✅ Sync complete result:', JSON.stringify(result, null, 2));
    } else {
      console.log('\n⚠️ Sync skipped (likely locked).');
    }

  } catch (err) {
    console.error('\n❌ Sync failed:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('🏁 Disconnected from MongoDB.');
    process.exit(0);
  }
}

run();
