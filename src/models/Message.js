const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema(
  {
    url: { type: String },
    mimeType: { type: String },
    fileName: { type: String },
    fileSize: { type: Number },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    messageId: { type: String }, // Meta unique ID (for deduplication and read receipts)
    channel: { type: String, enum: ['whatsapp', 'instagram', 'facebook'], required: true },
    brand: {
      type: String,
      enum: ['zorucci', 'suitor_guy', 'dapper_squad', 'general'],
      default: 'general',
      required: true,
      index: true,
    },
    senderType: { type: String, enum: ['customer', 'telecaller', 'system'], required: true },
    senderId: { type: String, required: true }, // Telecaller employeeId or customer identifier
    messageType: {
      type: String,
      enum: ['text', 'image', 'video', 'audio', 'document', 'template', 'interactive'],
      default: 'text',
    },
    text: { type: String, trim: true },
    media: { type: mediaSchema },
    status: { type: String, enum: ['sent', 'delivered', 'read', 'failed'], default: 'sent' },
    rawPayload: { type: mongoose.Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  {
    collection: 'messages',
    timestamps: true,
  }
);

messageSchema.index({ conversationId: 1, timestamp: 1 });
messageSchema.index({ messageId: 1 }, { unique: true, sparse: true });
messageSchema.index({ timestamp: -1 });

module.exports = mongoose.model('Message', messageSchema);
