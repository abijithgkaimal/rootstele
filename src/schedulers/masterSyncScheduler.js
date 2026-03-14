const cron = require('node-cron');
const { syncStores } = require('../services/storeSyncService');
const { syncReturnLeads } = require('../services/syncReturnLeads');
const { syncBookingConfirmationLeads } = require('../services/syncBookingConfirmationLeads');
const SyncLock = require('../models/SyncLock');
const dayjs = require('dayjs');

const LOCK_JOB_NAME = 'masterSync';
const LOCK_DURATION_MINUTES = 40;

const acquireLock = async () => {
  const now = new Date();
  const existing = await SyncLock.findOne({
    jobName: LOCK_JOB_NAME,
    expiresAt: { $gt: now },
  });
  if (existing) return false;
  const expiresAt = dayjs(now).add(LOCK_DURATION_MINUTES, 'minute').toDate();
  await SyncLock.findOneAndUpdate(
    { jobName: LOCK_JOB_NAME },
    { jobName: LOCK_JOB_NAME, startedAt: now, expiresAt },
    { upsert: true, new: true }
  );
  return true;
};

const releaseLock = async () => {
  await SyncLock.deleteOne({ jobName: LOCK_JOB_NAME }).catch(() => {});
};

/**
 * Executes a full sync sequence.
 * Order: Store Sync -> Return Sync -> Booking Sync
 */
async function executeSyncSequence(isInitial = false) {
  const mode = isInitial ? "[InitialSync]" : "[IncrementalSync]";
  console.log(`${mode} Starting sync sequence...`);

  try {
    // 1. Store Sync
    console.log(`${mode} Step 1/3: Syncing Stores...`);
    await syncStores();

    // 2. Return Sync (60 days if initial, 7 days if incremental)
    console.log(`${mode} Step 2/3: Syncing Return Leads...`);
    await syncReturnLeads({ initial: isInitial });

    // 3. Booking Confirmation Sync (60 days if initial, 7 days if incremental)
    console.log(`${mode} Step 3/3: Syncing Booking Confirmations...`);
    await syncBookingConfirmationLeads({ initial: isInitial });

    console.log(`${mode} Sync sequence completed successfully.`);
  } catch (err) {
    console.error(`${mode} Sync sequence encountered errors:`, err.message);
    // We don't re-throw here to allow the lock to be released properly in initializeMasterSyncScheduler
  }
}

async function initializeMasterSyncScheduler() {
  console.log("[MasterSyncScheduler] Initializing...");

  // 1. On Server Start: Run Initial Sync (60 days)
  const lockAcquired = await acquireLock();
  if (lockAcquired) {
    try {
      await executeSyncSequence(true);
    } finally {
      await releaseLock();
    }
  } else {
    console.log("[MasterSyncScheduler] Initial sync lock held, skipping.");
  }

  // 2. After That: Run incremental sync every 30 minutes (7 days)
  cron.schedule("*/30 * * * *", async () => {
    const lockActive = await acquireLock();
    if (!lockActive) {
      console.log("[MasterSyncScheduler] Incremental sync skipped: lock held.");
      return;
    }
    try {
      await executeSyncSequence(false);
    } finally {
      await releaseLock();
    }
  });

  console.log("[MasterSyncScheduler] Scheduler started. Next execution in 30 minutes.");
}

module.exports = {
  initializeMasterSyncScheduler,
  executeSyncSequence
};
