const cron = require('node-cron');
const dayjs = require('dayjs');
const SyncLock = require('../models/SyncLock');
const { syncStores } = require('../services/storeSyncService');
const { syncBookingConfirmationLeads } = require('../services/syncBookingConfirmationLeads');
const { syncReturnLeads } = require('../services/syncReturnLeads');

const LOCK_JOB_NAME = 'externalSync';
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
 * Single unified external sync: Store → Booking Confirmation → Return.
 * Uses SyncLock to prevent duplicate runs. Caller should run this in a cron or on startup.
 */
const runExternalSync = async (options = {}) => {
  const { initial = false } = options;
  const lockAcquired = await acquireLock();
  if (!lockAcquired) {
    console.log('[ExternalSyncScheduler] Skipped: lock already held.');
    return { skipped: true, reason: 'lock-exists' };
  }

  try {
    console.log('[ExternalSyncScheduler] Starting external sync (initial=%s)', initial);

    console.log('[ExternalSyncScheduler] 1/3 Store sync');
    await syncStores();

    console.log('[ExternalSyncScheduler] 2/3 Booking confirmation sync');
    await syncBookingConfirmationLeads({ initial });

    console.log('[ExternalSyncScheduler] 3/3 Return sync');
    await syncReturnLeads({ initial });

    console.log('[ExternalSyncScheduler] Completed.');
    return { ok: true };
  } catch (err) {
    console.error('[ExternalSyncScheduler] Failed:', err.message || err);
    throw err;
  } finally {
    await releaseLock();
  }
};

let initialized = false;

const initializeExternalSyncScheduler = async () => {
  if (initialized) return;
  initialized = true;

  console.log('[ExternalSyncScheduler] Initializing');

  try {
    await runExternalSync({ initial: true });
  } catch (err) {
    console.error('[ExternalSyncScheduler] Initial sync failed:', err.message || err);
  }

  cron.schedule('*/10 * * * *', async () => {
    try {
      await runExternalSync({ initial: false });
    } catch (err) {
      console.error('[ExternalSyncScheduler] Cron run failed:', err.message || err);
    }
  });

  console.log('[ExternalSyncScheduler] Cron started (every 10 minutes)');
};

module.exports = {
  initializeExternalSyncScheduler,
  runExternalSync,
};
