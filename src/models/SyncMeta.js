const mongoose = require('mongoose');

const syncMetaSchema = new mongoose.Schema(
  {
    jobName: { type: String, required: true }, // Removed unique constraint to allow history
    type: { type: String, enum: ['initial', 'incremental'], required: true },
    trigger: { type: String, enum: ['manual', 'auto', 'startup'], default: 'auto' },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date },
    status: { type: String, enum: ['completed', 'partial', 'failed', 'running'], default: 'running' },
    results: {
      store: { type: String },
      return: { type: String },
      bookingConfirmation: { type: String },
    },
    error: { type: String },
  },
  {
    collection: 'syncmeta',
    timestamps: false,
  }
);

syncMetaSchema.index({ startedAt: -1 });
syncMetaSchema.index({ jobName: 1, type: 1, status: 1 });

module.exports = mongoose.model('SyncMeta', syncMetaSchema);
