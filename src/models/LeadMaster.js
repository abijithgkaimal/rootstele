const mongoose = require('mongoose');

const leadTypeEnum = ['booked', 'enquiry', 'bookingConfirmation', 'return', 'justDial'];
const leadStatusEnum = ['new', 'followup', 'complaint', 'completed'];
const callStatusEnum = ['connected', 'not connected', 'interested', 'not interested', 'forwarded'];

const leadMasterSchema = new mongoose.Schema(
  {
    leadtype: { type: String, enum: leadTypeEnum },
    leadStatus: { type: String, enum: leadStatusEnum },
    phone: { type: String },
    normalizedPhone: { type: String },
    name: { type: String },
    store: { type: String },
    functionDate: { type: Date },
    callStatus: { type: String, enum: callStatusEnum },
    callDuration: { type: String },
    subCategory: { type: String },
    closingReason: { type: String },
    closingAction: { type: String },
    itemCategory: { type: String },
    remarks: { type: String },
    markasComplaint: { type: Boolean, default: false },
    markasFollowup: { type: Boolean, default: false },
    followupDate: { type: Date },
    createdBy: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedBy: { type: String },
    updatedAt: { type: Date },
    followupclosingAction: { type: String },
    followupremarks: { type: String },
    followupcallDuration: { type: String },
    service: { type: String },
    billReceived: { type: String },
    amountMismatch: { type: Boolean },
    noofFunctions: { type: Number },
    noofAttires: { type: Number },
    competitor: { type: String },
    rating: { type: Number },
    // Booking confirmation fields from external API
    bookingNo: { type: String },
    customerName: { type: String },
    location: { type: String },
    address: { type: String },
    phoneNo: { type: String },
    bookingDate: { type: Date },
    deliveryDate: { type: Date },
    category: { type: String },
    items: { type: String },
    advanceAmount: { type: Number },
    attendedBy: { type: String },
    totalAmount: { type: Number },
    returnDate: { type: Date },
    // Return sync specific identifier (best-effort unique key from external API)
    returnId: { type: String },
    source: { type: String, enum: ['manual', 'bookingSync', 'returnSync'] },
    // Simplified structure: All data fields are now at the root level (flattened)
  },
  {
    collection: 'leadmaster',
    timestamps: true,
    strict: false,
  }
);

// Ensure records are unique per bookingNo + leadtype
leadMasterSchema.index(
  { bookingNo: 1, leadtype: 1 },
  {
    unique: true,
    partialFilterExpression: {
      bookingNo: { $exists: true },
      leadtype: { $in: ['bookingConfirmation', 'return'] },
    },
  }
);

// Secondary unique key for return leads using returnId if present
leadMasterSchema.index(
  { returnId: 1, leadtype: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: {
      leadtype: 'return',
      returnId: { $exists: true },
    },
  }
);

module.exports = mongoose.model('LeadMaster', leadMasterSchema);
