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

async function runInitialSync() {
  console.log("[MasterSync] Running initial sync");
  
  // 1. Sync Stores first (essential for location codes)
  await syncStores();
  
  // 2. Sync Return Leads
  await syncReturnLeads({ initial: true });
  
  // 3. Sync Booking Confirmations
  await syncBookingConfirmationLeads({ initial: true });
  
  console.log("[MasterSync] Initial sync completed");
}

async function runIncrementalSync() {
  console.log("[MasterSync] Running incremental sync");
  
  // Stores are not synced incrementally to save resources as they rarely change
  await syncReturnLeads({ initial: false });
  await syncBookingConfirmationLeads({ initial: false });
  
  console.log("[MasterSync] Incremental sync completed");
}

async function initializeMasterSyncScheduler() {
  console.log("[MasterSyncScheduler] Initializing...");

  // Run initial sync once on server start
  const lockAcquired = await acquireLock();
  if (lockAcquired) {
    try {
      await runInitialSync();
    } catch (err) {
      console.error("[MasterSyncScheduler] Initial sync failed:", err.message);
    } finally {
      await releaseLock();
    }
  } else {
    console.log("[MasterSyncScheduler] Initial sync skipped: lock held");
  }

  // Schedule incremental sync every 10 minutes
  cron.schedule("*/10 * * * *", async () => {
    const lockActive = await acquireLock();
    if (!lockActive) {
      console.log("[MasterSyncScheduler] Incremental sync skipped: lock held");
      return;
    }
    try {
      await runIncrementalSync();
    } catch (err) {
      console.error("[MasterSyncScheduler] Incremental sync failed:", err.message);
    } finally {
      await releaseLock();
    }
  });

  console.log("[MasterSyncScheduler] Scheduler started (Incremental every 10m)");
}

module.exports = {
  initializeMasterSyncScheduler,
  runInitialSync,
  runIncrementalSync
};
