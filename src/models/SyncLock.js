const mongoose = require('mongoose');

/**
 * SyncLock — prevents overlapping syncs.
 * Lock is created when sync starts and DELETED when sync finishes.
 * There is NO time-based expiry — the job runs until it completes.
 */
const syncLockSchema = new mongoose.Schema(
  {
    jobName: { type: String, required: true, unique: true },
    startedAt: { type: Date, required: true },
    type: { type: String, enum: ['initial', 'incremental', 'manual', 'startup', 'auto'], default: 'incremental' },
  },
  {
    collection: 'synclock',
    timestamps: false,
  }
);

module.exports = mongoose.model('SyncLock', syncLockSchema);
