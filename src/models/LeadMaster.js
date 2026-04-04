const mongoose = require('mongoose');

const leadTypeEnum   = ['booked', 'enquiry', 'bookingConfirmation', 'return', 'justdial', 'lossofsale'];
const leadStatusEnum = ['new', 'followup', 'complaint', 'completed'];
const callStatusEnum = ['connected', 'not connected', 'interested', 'not interested', 'forwarded', 'missed'];

/**
 * LeadMaster — single collection for all lead types.
 *
 * Structure:
 *   - System fields (always present, defined below)
 *   - Flattened API fields (from external RMS — stored at root level, no nesting)
 *   - strict: false allows unstructured API fields to be saved without schema errors
 */
const leadMasterSchema = new mongoose.Schema(
  {
    // ── Core / shared ──────────────────────────────────────────────────────────
    leadtype:        { type: String, enum: leadTypeEnum },
    leadStatus:      { type: String, enum: leadStatusEnum },
    phone:           { type: String },           // normalised source phone
    normalizedPhone: { type: String },           // last 10 digits
    name:            { type: String },           // for manual leads
    customerName:    { type: String },           // from API / manual
    store:           { type: String },
    source:          { type: String, enum: ['manual', 'bookingSync', 'returnSync', 'justDialSync'] },

    // ── Manual-lead fields ─────────────────────────────────────────────────────
    callStatus:      { type: String, enum: callStatusEnum },
    callDuration:    { type: String },
    subCategory:     { type: String },
    closingReason:   { type: String },
    closingAction:   { type: String },
    itemCategory:    { type: String },
    remarks:         { type: String },
    functionDate:    { type: Date },

    // ── Status flags ───────────────────────────────────────────────────────────
    markasComplaint: { type: Boolean, default: false },
    markasFollowup:  { type: Boolean, default: false },

    // ── Followup tracking ──────────────────────────────────────────────────────
    followupDate:           { type: Date },
    followupclosingAction:  { type: String },
    followupremarks:        { type: String },
    followupcallDuration:   { type: String },

    // ── Booking-confirmation specific ──────────────────────────────────────────
    service:         { type: String },
    billReceived:    { type: String },           // 'yes' | 'no'
    amountMismatch:  { type: Boolean },

    // ── Return-lead specific ───────────────────────────────────────────────────
    noofFunctions:   { type: Number },
    noofAttires:     { type: Number },
    competitor:      { type: String },
    rating:          { type: Number },

    // ── External API shared fields (flattened, no rawData nesting) ─────────────
    bookingNo:       { type: String },
    bookingDate:     { type: Date },
    returnDate:      { type: Date },
    deliveryDate:    { type: Date },
    category:        { type: String },
    location:        { type: String },           // kept for reference from API
    address:         { type: String },
    advanceAmount:   { type: Number },
    totalAmount:     { type: Number },
    attendedBy:      { type: String },

    // ── Timestamps (manual override for synced leads) ──────────────────────────
    createdBy:  { type: String },
    createdAt:  { type: Date, default: Date.now },
    updatedBy:  { type: String },
    updatedAt:  { type: Date },
  },
  {
    collection: 'leadmaster',
    timestamps: true,   // auto-manages createdAt / updatedAt
    strict: false,      // allows extra flattened API fields not in schema
  }
);

// ── Indexes ─────────────────────────────────────────────────────────────────

// 1. Deduplication: same bookingNo + same leadtype = same document
leadMasterSchema.index(
  { bookingNo: 1, leadtype: 1 },
  {
    unique: true,
    partialFilterExpression: {
      bookingNo: { $exists: true },
      leadtype:  { $in: ['bookingConfirmation', 'return'] },
    },
  }
);

// 2. Fast incoming-call lookup (phone popup) — critical for sub-10ms response
leadMasterSchema.index({ normalizedPhone: 1, leadStatus: 1 });

// 3. Fast phone-only lookup
leadMasterSchema.index({ normalizedPhone: 1 });

// 4. Report queries sorted by updatedAt
leadMasterSchema.index({ leadStatus: 1, updatedAt: -1 });

// 5. Store + status filtering (dashboard, report filters)
leadMasterSchema.index({ store: 1, leadStatus: 1 });

module.exports = mongoose.model('LeadMaster', leadMasterSchema);
