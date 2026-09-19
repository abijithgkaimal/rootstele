const mongoose = require('mongoose');

const mediaMetadataSchema = new mongoose.Schema(
  {
    title: { type: String },
    reelVideoId: { type: String },
    mimeType: { type: String },
    fileName: { type: String },
    fileSize: { type: Number },
  },
  { _id: false }
);

const mediaSchema = new mongoose.Schema(
  {
    url: { type: String },
    mimeType: { type: String },
    fileName: { type: String },
    fileSize: { type: Number },
    title: { type: String },
    reelVideoId: { type: String },
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
    senderName: { type: String }, // Customer name or agent name
    senderExternalId: { type: String }, // Meta Page ID / Business Account ID / Phone ID
    messageType: {
      type: String,
      enum: [
        'text',
        'image',
        'audio',
        'video',
        'file',
        'document',
        'ig_reel',
        'share',
        'story_mention',
        'fallback',
        'template',
        'interactive',
      ],
      default: 'text',
    },
    text: { type: String, trim: true },
    attachmentUrl: { type: String }, // Direct media CDN URL or Instagram reel URL
    mediaMetadata: { type: mediaMetadataSchema },
    media: { type: mediaSchema },
    responseTimeSeconds: { type: Number }, // Time taken (in seconds) to reply to the latest customer message
    status: { type: String, enum: ['sending', 'sent', 'delivered', 'read', 'failed'], default: 'sent' },
    tempId: { type: String }, // Optional client temporary ID for optimistic UI matching
    errorMessage: { type: String },
    rawPayload: { type: mongoose.Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  {
    collection: 'messages',
    timestamps: true,
  }
);

messageSchema.index({ conversationId: 1, timestamp: 1 });
messageSchema.index({ conversationId: 1, senderType: 1, timestamp: -1 });
messageSchema.index({ messageId: 1 }, { unique: true, sparse: true });
messageSchema.index({ timestamp: -1 });

module.exports = mongoose.model('Message', messageSchema);
