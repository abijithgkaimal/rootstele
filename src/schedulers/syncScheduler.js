const cron = require('node-cron');
const { runLeadSync } = require('../services/leadSyncService');
const SyncMeta = require('../models/SyncMeta');

let schedulerInitialized = false;

const initializeScheduler = async () => {
  if (schedulerInitialized) {
    return;
  }
  schedulerInitialized = true;

  console.log('Sync scheduler initialized');
  console.log('Checking initial sync status...');

  let meta = await SyncMeta.findOne({ jobName: 'leadSync' });
  if (!meta) {
    meta = await SyncMeta.create({ jobName: 'leadSync', firstSyncCompleted: false });
  }

  // Run initial 60-day sync if not completed yet
  if (!meta.firstSyncCompleted) {
    console.log('Running initial 60 day sync...');
    try {
      await runLeadSync({ syncType: 'initial', days: 60 });
      console.log('Initial sync completed');
    } catch (err) {
      console.error('Initial sync failed:', err.message || err);
    }
  }

  // Start recurring auto sync every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    console.log('[SyncScheduler] Auto sync tick - running lead sync (last 7 days).');
    try {
      await runLeadSync({ syncType: 'auto', days: 7 });
    } catch (err) {
      console.error('[SyncScheduler] Auto sync failed:', err.message || err);
    }
  });

  console.log('Auto sync scheduler started (every 30 minutes)');
};

module.exports = {
  initializeScheduler,
};

