const dayjs = require('dayjs');
const SyncLock = require('../models/SyncLock');
const SyncMeta = require('../models/SyncMeta');
const SyncLog = require('../models/SyncLog');
const { syncStores } = require('./storeSyncService');

const JOB_NAME = 'leadSync';

// Acquire a distributed lock using SyncLock collection.
// Returns true if lock acquired, false if another sync is already running.
const acquireLock = async () => {
  const now = new Date();

  const existing = await SyncLock.findOne({
    jobName: JOB_NAME,
    expiresAt: { $gt: now },
  });

  if (existing) {
    return false;
  }

  const expiresAt = dayjs(now).add(40, 'minute').toDate();

  await SyncLock.findOneAndUpdate(
    { jobName: JOB_NAME },
    {
      jobName: JOB_NAME,
      startedAt: now,
      expiresAt,
    },
    { upsert: true, new: true }
  );

  return true;
};

const releaseLock = async () => {
  await SyncLock.deleteOne({ jobName: JOB_NAME }).catch(() => {});
};

const getOrCreateMeta = async () => {
  let meta = await SyncMeta.findOne({ jobName: JOB_NAME });
  if (!meta) {
    meta = await SyncMeta.create({ jobName: JOB_NAME, firstSyncCompleted: false });
  }
  return meta;
};

// Orchestrates a full lead sync cycle:
// 1) bookingConfirmation
// 2) return
// This implementation focuses on orchestration and logging; actual data
// sync implementation can be plugged in later.
const runLeadSync = async ({ syncType = 'auto', days } = {}) => {
  const lockAcquired = await acquireLock();
  const startedAt = new Date();

  const log = await SyncLog.create({
    syncType,
    status: lockAcquired ? 'running' : 'skipped',
    jobName: JOB_NAME,
    startedAt,
    bookingSummary: {},
    returnSummary: {},
    error: lockAcquired ? undefined : 'Another sync is already running (lock present).',
  });

  if (!lockAcquired) {
    console.log('[LeadSync] Sync skipped because lock already exists.');
    return { skipped: true, reason: 'lock-exists' };
  }

  let meta = await getOrCreateMeta();
  let effectiveType = syncType;

  try {
    // Decide date window (rough; real implementation can refine using days/meta)
    const windowDays = days || (syncType === 'initial' ? 60 : 7);
    const to = dayjs().endOf('day').toDate();
    const from = dayjs().subtract(windowDays, 'day').startOf('day').toDate();

    // Always sync stores first so any new or updated locations are available
    // before booking/return syncs run.
    try {
      console.log('[LeadSync] Store sync started');
      await syncStores();
      console.log('[LeadSync] Store sync completed');
    } catch (e) {
      console.error('[LeadSync] Store sync failed:', e.message || e);
      // Do not abort the whole lead sync; continue with leads
    }

    console.log('Booking confirmation sync started');
    // TODO: hook real bookingConfirmation sync implementation here.

    console.log('Return sync started');
    // TODO: hook real return sync implementation here.

    // For now, just return empty summaries
    const bookingSummary = {
      fetched: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
    };

    const returnSummary = {
      fetched: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
    };

    log.status = 'success';
    log.finishedAt = new Date();
    log.bookingSummary = bookingSummary;
    log.returnSummary = returnSummary;
    await log.save();

    const now = new Date();
    meta.lastRunAt = now;
    meta.lastSuccessAt = now;
    if (syncType === 'initial') {
      meta.firstSyncCompleted = true;
      meta.lastInitialSyncAt = now;
    } else if (syncType === 'auto') {
      meta.lastAutoSyncAt = now;
    }
    await meta.save();

    return {
      syncType: effectiveType,
      from,
      to,
      bookingSummary,
      returnSummary,
    };
  } catch (err) {
    log.status = 'failed';
    log.finishedAt = new Date();
    log.error = err.message || 'Unknown error during sync';
    await log.save();
    throw err;
  } finally {
    await releaseLock();
  }
};

module.exports = {
  runLeadSync,
};

