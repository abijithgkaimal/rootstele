const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema(
  {
    phone: { type: String, trim: true },
    normalizedPhone: { type: String, index: true },
    socialUserId: { type: String, index: true }, // IGSID or FB PSID
    igUserId: { type: String }, // Backward compatibility alias
    username: { type: String, trim: true },
    name: { type: String, trim: true },
    profilePic: { type: String },
  },
  { _id: false }
);

const lastMessageSchema = new mongoose.Schema(
  {
    text: { type: String },
    senderType: { type: String, enum: ['customer', 'telecaller', 'system'], default: 'customer' },
    messageType: {
      type: String,
      enum: ['text', 'image', 'video', 'audio', 'document', 'template', 'interactive'],
      default: 'text',
    },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    channel: {
      type: String,
      enum: ['whatsapp', 'instagram', 'facebook'],
      required: true,
      index: true,
    },
    brand: {
      type: String,
      enum: ['zorucci', 'suitor_guy', 'dapper_squad', 'general'],
      default: 'general',
      required: true,
      index: true,
    },
    brandName: { type: String, required: true, default: 'General' },
    channelId: { type: String, required: true, index: true }, // WhatsApp Phone ID, IG Account ID, or FB Page ID
    participant: { type: participantSchema, required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    assignedTo: { type: String, index: true }, // Telecaller employeeId
    lastMessage: { type: lastMessageSchema },
    unreadCount: { type: Number, default: 0 },
    status: { type: String, enum: ['open', 'pending', 'resolved'], default: 'open', index: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadMaster' },
    lastActivityAt: { type: Date, default: Date.now, index: true },
  },
  {
    collection: 'conversations',
    timestamps: true,
  }
);

// ── Compound Indexes for Fast Multi-Brand & Multi-Channel Queries ──
conversationSchema.index({ assignedTo: 1, channel: 1, brand: 1, lastActivityAt: -1 });
conversationSchema.index({ channel: 1, brand: 1, status: 1 });
conversationSchema.index({ channel: 1, 'participant.normalizedPhone': 1 });
conversationSchema.index({ channel: 1, 'participant.socialUserId': 1 });
conversationSchema.index({ lastActivityAt: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
