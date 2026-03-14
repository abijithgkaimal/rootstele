const cron = require('node-cron');
const dayjs = require('dayjs');
const SyncLock = require('../models/SyncLock');
const { runFullSync } = require('../services/leadSyncService');

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

const runSync = async (options = {}) => {
  const lockAcquired = await acquireLock();
  if (!lockAcquired) {
    console.log('[MasterSyncScheduler] Skipped: lock already held');
    return { skipped: true, reason: 'lock-exists' };
  }
  try {
    await runFullSync(options);
    return { ok: true };
  } catch (err) {
    console.error('[MasterSyncScheduler] Sync failed:', err.message || err);
    throw err;
  } finally {
    await releaseLock();
  }
};

let initialized = false;

const initializeMasterSyncScheduler = async () => {
  if (initialized) return;
  initialized = true;

  console.log('[MasterSyncScheduler] Initializing');
  try {
    await runSync({ initial: true });
  } catch (err) {
    console.error('[MasterSyncScheduler] Initial sync failed:', err.message || err);
  }

  cron.schedule('*/30 * * * *', async () => {
    try {
      await runSync({ initial: false });
    } catch (err) {
      console.error('[MasterSyncScheduler] Cron run failed:', err.message || err);
    }
  });

  console.log('[MasterSyncScheduler] Cron started (every 30 minutes)');
};

module.exports = {
  initializeMasterSyncScheduler,
  runSync,
};
