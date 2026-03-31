const cron = require('node-cron');
const { syncStores } = require('../services/storeSyncService');
const { syncReturnLeads } = require('../services/syncReturnLeads');
const { syncBookingConfirmationLeads } = require('../services/syncBookingConfirmationLeads');
const { syncJustDialLeads } = require('../services/justDialSync');
const SyncLock = require('../models/SyncLock');
const SyncMeta = require('../models/SyncMeta');

const MASTER_JOB_NAME = 'masterSync';

/**
 * Acquire sync lock. Returns the lock document or null if failed.
 */
async function acquireSyncLock(type = 'incremental') {
  // Check for existing lock
  const existing = await SyncLock.findOne({ jobName: MASTER_JOB_NAME });
  if (existing) {
    // Stale lock cleanup: if older than 30 minutes, remove it
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
    if (existing.startedAt < thirtyMinsAgo) {
      console.log(`[MasterSync] Found stale lock (${existing.startedAt}). Cleaning up...`);
      await releaseSyncLock();
    } else {
      return null;
    }
  }

  try {
    return await SyncLock.create({
      jobName: MASTER_JOB_NAME,
      startedAt: new Date(),
      type
    });
  } catch (err) {
    return null; // Concurrent acquisition failure
  }
}

/**
 * Release sync lock.
 */
async function releaseSyncLock() {
  await SyncLock.deleteOne({ jobName: MASTER_JOB_NAME }).catch(() => { });
}

/**
 * Check if sync is locked.
 */
async function isSyncLocked() {
  return !!(await SyncLock.findOne({ jobName: MASTER_JOB_NAME }));
}

/**
 * Create a new log entry in SyncMeta.
 */
async function createSyncLog(type, trigger = 'auto') {
  return await SyncMeta.create({
    jobName: MASTER_JOB_NAME,
    type,
    trigger,
    startedAt: new Date(),
    status: 'running',
    results: {}
  });
}

/**
 * Update sync log entry with final status and results.
 */
async function updateSyncLog(logId, status, results, error = null) {
  await SyncMeta.findByIdAndUpdate(logId, {
    $set: {
      status,
      results,
      finishedAt: new Date(),
      error
    }
  });
}

/**
 * Execute a Master Sync job containing all sub-syncs.
 * @param {string} trigger - 'manual' | 'auto' | 'startup'
 * @param {string} forcedType - optional 'initial' | 'incremental'
 */
async function executeMasterSync(trigger = 'auto', forcedType = null) {
  // Determine if this should be an initial (60-day) or incremental (7-day) sync
  let type = forcedType;

  if (!type) {
    // If not forcing, check if we've ever had a successful initial sync. 
    // If not, we auto-default to initial.
    const lastInitialSync = await SyncMeta.findOne({
      jobName: MASTER_JOB_NAME,
      type: 'initial',
      status: { $in: ['completed', 'partial'] }
    });
    type = lastInitialSync ? 'incremental' : 'initial';
    console.log(`[MasterSync] No past successful initial sync found. Auto-detected type: ${type}`);
  }

  const isInitial = type === 'initial';
  const lock = await acquireSyncLock(trigger);

  if (!lock) {
    console.log(`[MasterSync] Skipping ${trigger} sync — lock active.`);
    return null;
  }

  let log;
  const results = {
    store: 'pending',
    bookingConfirmation: 'pending',
    return: 'pending',
    justDial: 'pending'
  };

  try {
    log = await createSyncLog(type, trigger);
    console.log(`[MasterSync] Starting ${trigger} sync (Type: ${type}, Lookback: ${isInitial ? '60 days' : '7 days'})...`);

    // 1. Store Sync
    try {
      console.log('[MasterSync] Store sync starting...');
      await syncStores();
      results.store = 'success';
      console.log('[MasterSync] Store sync SUCCESS');
    } catch (e) {
      results.store = 'failed';
      console.error('[MasterSync] Store sync FAILED:', e.message);
    }

    // 2. Booking Confirmation Sync
    try {
      console.log('[MasterSync] Booking confirmation sync starting...');
      await syncBookingConfirmationLeads({ initial: isInitial });
      results.bookingConfirmation = 'success';
      console.log('[MasterSync] Booking confirmation sync SUCCESS');
    } catch (e) {
      results.bookingConfirmation = 'failed';
      console.error('[MasterSync] Booking confirmation sync FAILED:', e.message);
    }

    // 3. Return Sync
    try {
      console.log('[MasterSync] Return sync starting...');
      await syncReturnLeads({ initial: isInitial });
      results.return = 'success';
      console.log('[MasterSync] Return sync SUCCESS');
    } catch (e) {
      results.return = 'failed';
      console.error('[MasterSync] Return sync FAILED:', e.message);
    }

    // 4. JustDial Sync
    try {
      console.log('[MasterSync] JustDial sync starting...');
      await syncJustDialLeads({ initial: isInitial });
      results.justDial = 'success';
      console.log('[MasterSync] JustDial sync SUCCESS');
    } catch (e) {
      results.justDial = 'failed';
      console.error('[MasterSync] JustDial sync FAILED:', e.message);
    }

    // Determine overall status
    const values = Object.values(results);
    let finalStatus = 'completed';
    if (values.every(v => v === 'failed')) {
      finalStatus = 'failed';
    } else if (values.some(v => v === 'failed')) {
      finalStatus = 'partial';
    }

    await updateSyncLog(log._id, finalStatus, results);
    console.log(`[MasterSync] Master sync completed with ${finalStatus.toUpperCase()} success.`);
    return { status: finalStatus, results };

  } catch (err) {
    console.error('[MasterSync] Fatal error in master sync:', err.message);
    if (log) {
      await updateSyncLog(log._id, 'failed', results, err.message);
    }
    throw err;
  } finally {
    await releaseSyncLock();
    console.log('[MasterSync] Master sync lock released.');
  }
}

/**
 * Initialize the scheduler logic.
 */
async function initializeMasterSyncScheduler() {
  console.log('[MasterSyncScheduler] Initializing...');

  // 1. Startup Logic: Check if initial sync has ever completed
  const lastInitialSync = await SyncMeta.findOne({
    jobName: MASTER_JOB_NAME,
    type: 'initial',
    status: { $in: ['completed', 'partial'] }
  }).sort({ startedAt: -1 });

  if (!lastInitialSync) {
    console.log('[MasterSyncScheduler] No completed initial sync found. Triggering initial sync on startup...');
    // We don't await this to avoid blocking server boot, but we start it
    executeMasterSync('startup', 'initial').catch(err => {
      console.error('[MasterSyncScheduler] Startup initial sync failed:', err.message);
    });
  } else {
    console.log(`[MasterSyncScheduler] Initial sync already completed at ${lastInitialSync.finishedAt}. Skipping.`);
  }

  // 2. Incremental Sync Cron: Every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    console.log('[MasterSyncScheduler] Cron tick: Checking for incremental sync...');

    if (await isSyncLocked()) {
      console.log('[MasterSyncScheduler] Skipping incremental sync — lock active.');
      return;
    }

    try {
      await executeMasterSync('auto', 'incremental');
    } catch (err) {
      console.error('[MasterSyncScheduler] Incremental sync error:', err.message);
    }
  });

  console.log('[MasterSyncScheduler] Incremental sync scheduled (every 30 minutes).');
}

module.exports = {
  initializeMasterSyncScheduler,
  executeMasterSync,
  acquireSyncLock,
  releaseSyncLock,
  isSyncLocked
};

