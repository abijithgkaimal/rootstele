const mongoose = require('mongoose');

const syncMetaSchema = new mongoose.Schema(
  {
    jobName: { type: String, required: true, unique: true },
    firstSyncCompleted: { type: Boolean, default: false },
    lastRunAt: { type: Date },
    lastSuccessAt: { type: Date },
    lastInitialSyncAt: { type: Date },
    lastAutoSyncAt: { type: Date },
  },
  {
    collection: 'syncmeta',
    timestamps: false,
  }
);

module.exports = mongoose.model('SyncMeta', syncMetaSchema);
