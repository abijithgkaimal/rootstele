const cron = require('node-cron');
const { syncStores } = require('../services/storeSyncService');
const { syncReturnLeads } = require('../services/syncReturnLeads');
const { syncBookingConfirmationLeads } = require('../services/syncBookingConfirmationLeads');
const SyncLock = require('../models/SyncLock');
const SyncMeta = require('../models/SyncMeta');

const LOCK_JOB_NAME = 'masterSync';
const MASTER_JOB_NAME = 'masterSync'; // tracks overall startup sequence completion

/**
 * Acquire lock — returns false if a lock is already active.
 * Lock has NO expiry time. Released only when sync completes (success or fail).
 */
const acquireLock = async (type = 'incremental') => {
  const existing = await SyncLock.findOne({ jobName: LOCK_JOB_NAME });
  if (existing) return false;
  await SyncLock.create({ jobName: LOCK_JOB_NAME, startedAt: new Date(), type });
  return true;
};

/**
 * Release lock — always called in finally block.
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
 * Run a single sync step safely.
 * Records the result (success or failure) in SyncMeta regardless of outcome.
 */
async function runStep(jobName, fn) {
  const now = new Date();
  try {
    await fn();
    await SyncMeta.updateOne(
      { jobName },
      {
        $set: {
          lastRunAt: now,
          lastSuccessAt: now,
          firstSyncCompleted: true,
          lastError: null,
        },
      },
      { upsert: true }
    );
    console.log(`[Sync] ✅ ${jobName} completed.`);
  } catch (err) {
    console.error(`[Sync] ❌ ${jobName} failed: ${err.message}`);
    await SyncMeta.updateOne(
      { jobName },
      {
        $set: {
          lastRunAt: now,
          lastError: err.message,
        },
        // firstSyncCompleted stays false if it never succeeded
      },
      { upsert: true }
    );
  }
}

/**
 * Full sync sequence: Stores → Returns → Bookings.
 * Each step is isolated — one failure does NOT stop the others.
 * Lock is held until ALL steps complete (success or fail).
 */
async function executeSyncSequence(isInitial = false) {
  const mode = isInitial ? '[InitialSync]' : '[IncrementalSync]';
  console.log(`${mode} Starting sync sequence (${isInitial ? '60 days' : '7 days'})...`);

  // All three steps run independently. Failure of one does not affect others.
  await runStep('storeSync',               () => syncStores());
  await runStep('returnSync',              () => syncReturnLeads({ initial: isInitial }));
  await runStep('bookingConfirmationSync', () => syncBookingConfirmationLeads({ initial: isInitial }));

  console.log(`${mode} Sync sequence finished (lock will now be released).`);
}

async function initializeMasterSyncScheduler() {
  console.log('[MasterSyncScheduler] Initializing...');

  // --- INITIAL SYNC (on server start) ---
  // Lock is acquired before starting and released ONLY after all 3 steps finish.
  const lockAcquired = await acquireLock('initial');
  if (lockAcquired) {
    console.log('[MasterSyncScheduler] Initial 60-day sync starting...');
    try {
      await executeSyncSequence(true);
    } finally {
      // Always release lock — even if everything failed
      await releaseLock();
      // Mark the startup sequence as done (regardless of individual step success/fail)
      await SyncMeta.updateOne(
        { jobName: MASTER_JOB_NAME },
        { $set: { lastRunAt: new Date(), initialSequenceCompleted: true } },
        { upsert: true }
      );
      console.log('[MasterSyncScheduler] Initial sync lock released. Ready for incremental syncs.');
    }
  } else {
    console.log('[MasterSyncScheduler] Lock already active on startup — skipping initial sync.');
  }

  // --- INCREMENTAL SYNC (every 30 minutes) ---
  // Gate: only check that the startup sequence has been attempted at least once.
  // Individual step failures do NOT block future incremental syncs.
  cron.schedule('*/30 * * * *', async () => {
    console.log('[MasterSyncScheduler] Cron tick...');

    // Check if the startup sequence has ever been attempted
    const masterMeta = await SyncMeta.findOne({ jobName: MASTER_JOB_NAME });
    if (!masterMeta?.initialSequenceCompleted) {
      console.log('[MasterSyncScheduler] Incremental sync waiting: Initial startup sync not yet finished.');
      return;
    }

    // Prevent overlapping syncs
    if (await isLocked()) {
      console.log('[MasterSyncScheduler] Incremental sync skipped: previous sync still running.');
      return;
    }

    const acquired = await acquireLock('incremental');
    if (!acquired) {
      console.log('[MasterSyncScheduler] Incremental sync skipped: could not acquire lock.');
      return;
    }

    try {
      await executeSyncSequence(false);
    } finally {
      // Always release lock after all steps complete (success or fail)
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
