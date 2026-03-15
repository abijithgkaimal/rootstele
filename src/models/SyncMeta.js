const mongoose = require('mongoose');

const syncMetaSchema = new mongoose.Schema(
  {
    jobName: { type: String, required: true, unique: true },
    firstSyncCompleted: { type: Boolean, default: false },
    initialSequenceCompleted: { type: Boolean, default: false }, // marks that the server-start sync has finished
    lastRunAt: { type: Date },
    lastSuccessAt: { type: Date },
    lastInitialSyncAt: { type: Date },
    lastAutoSyncAt: { type: Date },
    lastError: { type: String, default: null },
  },
  {
    collection: 'syncmeta',
    timestamps: false,
  }
);

module.exports = mongoose.model('SyncMeta', syncMetaSchema);
