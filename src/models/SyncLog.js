const mongoose = require('mongoose');

const summarySchema = new mongoose.Schema(
  {
    fetched: { type: Number, default: 0 },
    inserted: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
  },
  { _id: false }
);

const syncLogSchema = new mongoose.Schema(
  {
    syncType: { type: String, enum: ['initial', 'auto', 'manual'], required: true },
    status: { type: String, enum: ['running', 'success', 'failed', 'skipped'], required: true },
    jobName: { type: String, default: 'leadSync' },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date },
    error: { type: String },
    bookingSummary: { type: summarySchema, default: () => ({}) },
    returnSummary: { type: summarySchema, default: () => ({}) },
  },
  {
    collection: 'synclog',
    timestamps: false,
  }
);

syncLogSchema.index({ startedAt: -1 });

module.exports = mongoose.model('SyncLog', syncLogSchema);
