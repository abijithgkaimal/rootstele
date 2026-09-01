const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const chatService = require('../services/chatService');
const { success } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const mongoose = require('mongoose');

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
  const { text, media, messageType } = req.body;
  const senderId = req.user?.employeeId || req.user?.userId || 'unknown';

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

module.exports = {
  getConversations,
  getMessages,
  sendMessage,
  markAsRead,
  convertToLead,
  transferConversation,
};
