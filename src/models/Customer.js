const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    phone: { type: String },
    normalizedPhone: { type: String, required: true },
    name: { type: String },
    latestLeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadMaster' },
    latestLeadType: { type: String },
    latestLeadStatus: { type: String },
    latestStore: { type: String },
    lastInteractionAt: { type: Date },
    leadCount: { type: Number, default: 0 },
    activeLeadIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LeadMaster' }],
    completedLeadIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LeadMaster' }],
    complaintLeadIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LeadMaster' }],
  },
  {
    collection: 'customers',
    timestamps: true,
  }
);

customerSchema.index({ normalizedPhone: 1 }, { unique: true });
customerSchema.index({ latestLeadStatus: 1 });
customerSchema.index({ lastInteractionAt: -1 });

module.exports = mongoose.model('Customer', customerSchema);
