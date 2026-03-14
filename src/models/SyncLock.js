const mongoose = require('mongoose');

const syncLockSchema = new mongoose.Schema(
  {
    jobName: { type: String, required: true, unique: true },
    startedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  {
    collection: 'synclock',
    timestamps: false,
  }
);

syncLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('SyncLock', syncLockSchema);
