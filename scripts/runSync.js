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
const initial = !args.includes('--incremental');

console.log(`\n🔄 Manual Sync — mode: ${command}, ${initial ? '60-day initial' : '7-day incremental'}\n`);

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const { syncStores } = require('../src/services/storeSyncService');
  const { syncReturnLeads } = require('../src/services/syncReturnLeads');
  const { syncBookingConfirmationLeads } = require('../src/services/syncBookingConfirmationLeads');

  if (command === 'stores' || command === 'all') {
    console.log('▶ Syncing Stores...');
    const r = await syncStores();
    console.log('✅ Stores done:', r, '\n');
  }

  if (command === 'returns' || command === 'all') {
    console.log('▶ Syncing Return Leads...');
    const r = await syncReturnLeads({ initial });
    console.log('✅ Returns done:', r, '\n');
  }

  if (command === 'bookings' || command === 'all') {
    console.log('▶ Syncing Booking Confirmation Leads...');
    const r = await syncBookingConfirmationLeads({ initial });
    console.log('✅ Bookings done:', r, '\n');
  }

  await mongoose.disconnect();
  console.log('🏁 Sync complete. Disconnected.');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Sync failed:', err.message);
  process.exit(1);
});
