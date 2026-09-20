const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const chatService = require('../services/chatService');
const gridfsService = require('../services/gridfsService');
const { success } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const mimeHelper = require('../utils/mimeHelper');
const mongoose = require('mongoose');

/**
 * GET /api/chat/media/:fileId
 * Public endpoint to stream media from MongoDB GridFS.
 * Supports HTTP Range requests (206 Partial Content) for audio seeking and video scrubbing.
 */
const streamMedia = asyncHandler(async (req, res) => {
  const { fileId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(fileId)) {
    throw new ApiError(400, 'Invalid media file ID');
  }

  const file = await gridfsService.getFileMetadata(fileId);
  if (!file) {
    throw new ApiError(404, 'Media file not found');
  }

  const fileSize = file.length;
  const filename = file.filename || file.metadata?.fileName || `media_${fileId}`;
  const typeHint = file.metadata?.isVoiceNote ? 'audio' : file.metadata?.messageType;
  const rawContentType = file.contentType || file.metadata?.mimeType;
  const contentType = mimeHelper.normalizeContentType(rawContentType, filename, typeHint);

  // Common response headers
  res.setHeader('Content-Type', contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);

  const rangeHeader = req.headers.range;
  if (rangeHeader) {
    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (isNaN(start) || start >= fileSize || (parts[1] && (isNaN(end) || end < start))) {
      res.setHeader('Content-Range', `bytes */${fileSize}`);
      return res.status(416).send('Requested range not satisfiable');
    }

    const chunkLength = end - start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', chunkLength);

    const downloadStream = gridfsService.downloadStream(fileId, { start, end });
    downloadStream.on('error', (err) => {
      console.warn(`[ChatController] Range stream error for file ${fileId}:`, err.message);
      if (!res.headersSent) {
        res.status(500).send('Streaming error');
      }
    });

    return downloadStream.pipe(res);
  }

  // Full content (200 OK)
  res.status(200);
  res.setHeader('Content-Length', fileSize);

  const downloadStream = gridfsService.downloadStream(fileId);
  downloadStream.on('error', (err) => {
    console.warn(`[ChatController] Download stream error for file ${fileId}:`, err.message);
    if (!res.headersSent) {
      res.status(500).send('Download error');
    }
  });

  return downloadStream.pipe(res);
});

/**
 * POST /api/chat/conversations/:id/media
 * Multipart upload endpoint for telecaller outbound media (audio, voice notes, images, videos, documents).
 */
const uploadMedia = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { text, caption, messageType, tempId, isVoiceNote } = req.body;
  const senderId = req.user?.employeeId || req.user?.userId || 'unknown';

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid conversation ID');
  }

  if (!req.file) {
    throw new ApiError(400, 'No file uploaded');
  }

  const originalName = req.file.originalname || `upload_${Date.now()}`;
  const isVoice = isVoiceNote === 'true' || isVoiceNote === true || messageType === 'voice';
  const typeHint = isVoice
    ? 'audio'
    : (messageType || (req.file.mimetype?.startsWith('audio/') ? 'audio' : (req.file.mimetype?.startsWith('image/') ? 'image' : (req.file.mimetype?.startsWith('video/') ? 'video' : 'document'))));

  // Determine accurate MIME type via extension, magic bytes, and type hint
  const mimeType = mimeHelper.detectMimeType(req.file.buffer, originalName, req.file.mimetype, typeHint);

  // Infer messageType from MIME type or isVoice
  let inferredType = messageType;
  if (!inferredType || inferredType === 'text') {
    if (mimeType.startsWith('audio/') || isVoice) {
      inferredType = 'audio';
    } else if (mimeType.startsWith('image/')) {
      inferredType = 'image';
    } else if (mimeType.startsWith('video/')) {
      inferredType = 'video';
    } else {
      inferredType = 'document';
    }
  }

  // Store file in MongoDB GridFS with accurate MIME type
  const stored = await gridfsService.uploadBuffer(req.file.buffer, originalName, mimeType, {
    uploadedBy: senderId,
    conversationId: id,
    isVoiceNote: isVoice,
    messageType: inferredType,
    fileName: originalName,
    mimeType,
  });

  const mediaObj = {
    fileId: stored.fileId,
    url: `/api/chat/media/${stored.fileId}`,
    fileName: originalName,
    mimeType,
    fileSize: req.file.size,
    caption: caption || text || undefined,
    isVoiceNote: isVoice,
  };

  const message = await chatService.sendOutboundMessage({
    conversationId: id,
    senderId,
    text: caption || text || '',
    media: mediaObj,
    messageType: inferredType,
    tempId,
  });

  return success(res, message, 'Media uploaded and sent successfully', 201);
});

/**
 * GET /api/chat/conversations
 * List conversations assigned to current telecaller or filtered by channel.
 */
const getConversations = asyncHandler(async (req, res) => {
  const { channel, brand, status, page = 1, limit = 50, search } = req.query;
  const employeeId = (req.user?.employeeId || req.user?.userId || '').toString().toUpperCase();

  const filter = {};

  // If role is telecaller, filter by assigned telecaller
  if (req.user?.role?.toLowerCase() === 'telecaller' && employeeId) {
    filter.assignedTo = { $regex: new RegExp(`^${employeeId}$`, 'i') };
  }

  if (channel && channel !== 'all' && ['whatsapp', 'instagram', 'facebook'].includes(channel.toLowerCase())) {
    filter.channel = channel.toLowerCase();
  }

  if (brand && brand !== 'all' && ['zorucci', 'suitor_guy', 'dapper_squad', 'general'].includes(brand.toLowerCase())) {
    filter.brand = brand.toLowerCase();
  }

  if (status && ['open', 'pending', 'resolved'].includes(status)) {
    filter.status = status;
  }

  if (search) {
    const searchRegex = new RegExp(search, 'i');
    filter.$or = [
      { 'participant.name': searchRegex },
      { 'participant.phone': searchRegex },
      { 'participant.normalizedPhone': searchRegex },
      { 'participant.username': searchRegex },
    ];
  }

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const [conversations, total] = await Promise.all([
    Conversation.find(filter)
      .populate('customerId', 'name phone normalizedPhone latestLeadStatus leadCount')
      .populate('leadId', 'leadtype leadStatus store bookingNo')
      .sort({ lastActivityAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Conversation.countDocuments(filter),
  ]);

  return success(res, {
    conversations,
    total,
    page: pageNum,
    limit: limitNum,
  });
});

/**
 * GET /api/chat/conversations/:id
 * Retrieve a single conversation by ID.
 */
const getConversationById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid conversation ID');
  }

  const conversation = await Conversation.findById(id)
    .populate('customerId', 'name phone normalizedPhone latestLeadStatus leadCount')
    .populate('leadId', 'leadtype leadStatus store bookingNo')
    .lean();

  if (!conversation) {
    throw new ApiError(404, 'Conversation not found');
  }

  return success(res, conversation);
});

/**
 * GET /api/chat/conversations/:id/messages
 * Retrieve paginated chat history for a conversation.
 */
const getMessages = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 50, before } = req.query;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid conversation ID');
  }

  const filter = { conversationId: id };
  if (before) {
    filter.timestamp = { $lt: new Date(before) };
  }

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const [messages, total] = await Promise.all([
    Message.find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Message.countDocuments(filter),
  ]);

  // Return in chronological order for UI ease
  const chronological = messages.reverse();

  return success(res, {
    messages: chronological,
    total,
    page: pageNum,
    limit: limitNum,
  });
});

/**
 * POST /api/chat/conversations/:id/messages
 * Send an outbound message in a conversation.
 */
const sendMessage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { text, media, messageType, tempId } = req.body;
  const senderId = req.user?.employeeId || req.user?.userId || 'unknown';

  console.log('[SendMessage] Request received:', {
    conversationId: id,
    senderId,
    messageType: messageType || 'text',
    textSnippet: text ? String(text).slice(0, 50) : '',
    hasMedia: Boolean(media?.url),
    tempId,
  });

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid conversation ID');
  }

  if (!text && !media?.url) {
    throw new ApiError(400, 'Message text or media is required');
  }

  const message = await chatService.sendOutboundMessage({
    conversationId: id,
    senderId,
    text,
    media,
    messageType,
    tempId,
  });

  return success(res, message, 'Message sent successfully', 201);
});

/**
 * POST /api/chat/conversations/:id/read
 * Mark conversation as read.
 */
const markAsRead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid conversation ID');
  }

  const conversation = await chatService.markConversationAsRead(id);
  return success(res, conversation, 'Marked as read');
});

/**
 * POST /api/chat/conversations/:id/convert-lead
 * One-tap CRM lead creation from chat.
 */
const convertToLead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid conversation ID');
  }

  const createdBy = req.user?.employeeId || req.user?.userId || 'system';
  const lead = await chatService.convertChatToLead({
    conversationId: id,
    leadData: req.body,
    createdBy,
  });

  return success(res, lead, 'Chat converted to CRM lead successfully', 201);
});

/**
 * POST /api/chat/conversations/:id/transfer
 * Reassign conversation to another telecaller.
 */
const transferConversation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { assignedTo } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid conversation ID');
  }

  if (!assignedTo) {
    throw new ApiError(400, 'Target telecaller assignedTo (employeeId) is required');
  }

  const updatedConversation = await chatService.transferConversation(id, assignedTo);
  return success(res, updatedConversation, `Conversation transferred to ${assignedTo} successfully`);
});

/**
 * POST /api/chat/simulate-inbound
 * Test endpoint to inject an incoming WhatsApp, Instagram, or Facebook message for testing before Meta credentials arrive.
 */
const simulateInbound = asyncHandler(async (req, res) => {
  const result = await chatService.simulateInboundMessage(req.body || {});
  return success(res, result, 'Inbound message simulated and delivered to telecaller socket successfully', 201);
});

module.exports = {
  streamMedia,
  uploadMedia,
  getConversations,
  getConversationById,
  getMessages,
  sendMessage,
  markAsRead,
  convertToLead,
  transferConversation,
  simulateInbound,
};
