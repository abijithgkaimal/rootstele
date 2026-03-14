const cron = require('node-cron');
const { syncStores } = require('../services/storeSyncService');
const { syncReturnLeads } = require('../services/syncReturnLeads');
const { syncBookingConfirmationLeads } = require('../services/syncBookingConfirmationLeads');
const SyncLock = require('../models/SyncLock');
const SyncMeta = require('../models/SyncMeta');

const LOCK_JOB_NAME = 'masterSync';

/**
 * Acquire lock — returns false if a lock is already active.
 * Lock has NO expiry time. It is only removed when the sync completes.
 */
const acquireLock = async (type = 'incremental') => {
  const existing = await SyncLock.findOne({ jobName: LOCK_JOB_NAME });
  if (existing) return false;

  await SyncLock.create({
    jobName: LOCK_JOB_NAME,
    startedAt: new Date(),
    type,
  });
  return true;
};

/**
 * Release lock — only called after the sync fully completes.
 */
const releaseLock = async () => {
  await SyncLock.deleteOne({ jobName: LOCK_JOB_NAME }).catch(() => {});
};

/**
 * Check if a sync lock is currently active.
 */
const isLocked = async () => {
  const lock = await SyncLock.findOne({ jobName: LOCK_JOB_NAME });
  return !!lock;
};

/**
 * Full sync sequence: Stores → Returns → Bookings.
 * Runs to completion — does not stop midway.
 */
async function executeSyncSequence(isInitial = false) {
  const mode = isInitial ? '[InitialSync]' : '[IncrementalSync]';
  console.log(`${mode} Starting sync sequence (${isInitial ? '60 days' : '7 days'})...`);

  // Step 1: Stores
  console.log(`${mode} Step 1/3: Syncing Stores...`);
  await syncStores();

  // Step 2: Return Leads
  console.log(`${mode} Step 2/3: Syncing Return Leads...`);
  await syncReturnLeads({ initial: isInitial });

  // Step 3: Booking Confirmations
  console.log(`${mode} Step 3/3: Syncing Booking Confirmations...`);
  await syncBookingConfirmationLeads({ initial: isInitial });

  console.log(`${mode} Sync sequence completed successfully.`);
}

async function initializeMasterSyncScheduler() {
  console.log('[MasterSyncScheduler] Initializing...');

  // --- INITIAL SYNC ---
  // Runs once on server start for the last 60 days.
  // Lock is held the entire time and only released after ALL data is stored.
  const lockAcquired = await acquireLock('initial');
  if (lockAcquired) {
    console.log('[MasterSyncScheduler] Initial sync lock acquired. Starting 60-day sync...');
    try {
      await executeSyncSequence(true); // runs to complete — no internal timeout
    } catch (err) {
      console.error('[MasterSyncScheduler] Initial sync failed:', err.message);
    } finally {
      // Lock is ONLY removed here — after the full sync completes or fails
      await releaseLock();
      console.log('[MasterSyncScheduler] Initial sync lock released.');
    }
  } else {
    console.log('[MasterSyncScheduler] A sync lock is already active. Skipping initial sync on this startup.');
  }

  // --- INCREMENTAL SYNC SCHEDULE ---
  // Runs every 30 minutes. Each run acquires its own lock and releases
  // it only after the sync fully completes. If a previous incremental run
  // is still running when the next 30-min tick fires, it will be skipped.
  cron.schedule('*/30 * * * *', async () => {
    console.log('[MasterSyncScheduler] Cron tick: checking if incremental sync can run...');

    // Block incremental sync until initial 60-day sync is confirmed complete
    const returnMeta = await SyncMeta.findOne({ jobName: 'returnSync' });
    const bookingMeta = await SyncMeta.findOne({ jobName: 'bookingConfirmationSync' });

    if (!returnMeta?.firstSyncCompleted || !bookingMeta?.firstSyncCompleted) {
      console.log('[MasterSyncScheduler] Incremental sync blocked: Initial 60-day sync not yet complete.');
      return;
    }

    const locked = await isLocked();
    if (locked) {
      console.log('[MasterSyncScheduler] Incremental sync skipped: A previous sync is still running.');
      return;
    }

    const lockAcquired = await acquireLock('incremental');
    if (!lockAcquired) {
      console.log('[MasterSyncScheduler] Incremental sync skipped: Could not acquire lock.');
      return;
    }

    try {
      await executeSyncSequence(false);
    } catch (err) {
      console.error('[MasterSyncScheduler] Incremental sync failed:', err.message);
    } finally {
      // Lock is ONLY removed after the full incremental sync completes
      await releaseLock();
      console.log('[MasterSyncScheduler] Incremental sync lock released.');
    }
  });

  console.log('[MasterSyncScheduler] Scheduler ready. Incremental sync fires every 30 minutes.');
}

module.exports = {
  initializeMasterSyncScheduler,
  executeSyncSequence,
};
