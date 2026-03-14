require('dotenv').config();
const connectDB = require('../../src/config/database');
const { syncStores } = require('../../src/services/storeSyncService');

const run = async () => {
  try {
    await connectDB();
    console.log('[StoreSync] Connected to MongoDB');
    const result = await syncStores();
    console.log('[StoreSync] Sync completed:', result);
    process.exit(0);
  } catch (err) {
    console.error('[StoreSync] Sync failed:', err.message || err);
    process.exit(1);
  }
};

run();
