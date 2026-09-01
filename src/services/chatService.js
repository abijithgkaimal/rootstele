const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Customer = require('../models/Customer');
const User = require('../models/User');
const LeadMaster = require('../models/LeadMaster');
const { normalize } = require('../utils/phoneNormalizer');
const { resolveBrandByChannelId } = require('../config/brandRegistry');
const customerService = require('./customerService');
const leadService = require('./leadService');
const metaSendService = require('./metaSendService');
const socketService = require('./socketService');

/**
 * Assigns a conversation to an active telecaller, prioritizing brand/store match.
 * @param {string} participantPhone
 * @param {string} customerId
 * @param {string} [storePrefix='']
 */
const findOrAssignTelecaller = async (participantPhone, customerId) => {
  // 1. If customer has an active lead, assign to that lead's telecaller for continuity
  if (customerId) {
    const customer = await Customer.findById(customerId).lean();
    if (customer?.latestLeadId) {
      const activeLead = await LeadMaster.findById(customer.latestLeadId).lean();
      if (activeLead && activeLead.updatedBy && activeLead.updatedBy !== 'system') {
        return activeLead.updatedBy;
      }
    }
  }

  // 2. Find active telecallers (logged in within 12h) across the central office
  const activeUsers = await User.find({
    lastLoginAt: { $gte: new Date(Date.now() - 12 * 60 * 60 * 1000) },
    role: { $ne: 'admin' },
  }).sort({ lastLoginAt: -1 });

  if (!activeUsers.length) {
    return 'system';
  }

  // 3. Uniform round-robin / least busy routing across all office telecallers
  const telecallerCounts = await Conversation.aggregate([
    { $match: { assignedTo: { $in: activeUsers.map((u) => u.employeeId) }, status: 'open' } },
    { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
  ]);

  const countMap = {};
  telecallerCounts.forEach((tc) => {
    countMap[tc._id] = tc.count;
  });

  let bestUser = activeUsers[0];
  let minCount = countMap[bestUser.employeeId] || 0;

  for (let i = 1; i < activeUsers.length; i++) {
    const user = activeUsers[i];
    const count = countMap[user.employeeId] || 0;
    if (count < minCount) {
      bestUser = user;
      minCount = count;
    }
  }

  return bestUser.employeeId;
};

/**
 * Process inbound WhatsApp Webhook events from Meta.
 */
const processInboundWhatsApp = async (body) => {
  const entries = body?.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const value = change.value || {};
      const phoneNumberId = value.metadata?.phone_number_id || 'WA_DEFAULT';
      const brandInfo = resolveBrandByChannelId(phoneNumberId, 'whatsapp');

      // 1. Process Status Updates (sent, delivered, read, failed)
      if (value.statuses && Array.isArray(value.statuses)) {
        for (const statusObj of value.statuses) {
          const messageId = statusObj.id;
          const newStatus = statusObj.status; // 'delivered', 'read', 'failed', 'sent'

          const updatedMsg = await Message.findOneAndUpdate(
            { messageId },
            { $set: { status: newStatus } },
            { new: true }
          );

          if (updatedMsg) {
            const conversation = await Conversation.findById(updatedMsg.conversationId).lean();
            if (conversation?.assignedTo) {
              socketService.emitToTelecaller(conversation.assignedTo, 'chat:status_update', {
                messageId,
                conversationId: updatedMsg.conversationId,
                status: newStatus,
                brand: conversation.brand,
                channel: 'whatsapp',
              });
            }
          }
        }
      }

      // 2. Process Inbound Messages
      if (value.messages && Array.isArray(value.messages)) {
        const contacts = value.contacts || [];
        const contactMap = {};
        contacts.forEach((c) => {
          contactMap[c.wa_id] = c.profile?.name || '';
        });

        for (const msg of value.messages) {
          const messageId = msg.id;

          // Deduplication
          const existing = await Message.findOne({ messageId });
          if (existing) continue;

          const rawPhone = msg.from;
          const normalizedPhone = normalize(rawPhone);
          const contactName = contactMap[rawPhone] || '';

          // Find or link Customer
          let customer = null;
          if (normalizedPhone) {
            customer = await Customer.findOne({ normalizedPhone });
            if (!customer) {
              customerService.recomputeCustomerState(normalizedPhone).catch(() => {});
            }
          }

          // Find or create Conversation
          let conversation = await Conversation.findOne({
            channel: 'whatsapp',
            channelId: phoneNumberId,
            'participant.normalizedPhone': normalizedPhone,
          });

          if (!conversation) {
            const assignedTo = await findOrAssignTelecaller(rawPhone, customer?._id, brandInfo.storePrefix);
            conversation = await Conversation.create({
              channel: 'whatsapp',
              brand: brandInfo.brand,
              brandName: brandInfo.brandName,
              channelId: phoneNumberId,
              participant: {
                phone: rawPhone,
                normalizedPhone,
                name: contactName || (customer ? customer.name : rawPhone),
              },
              customerId: customer?._id || undefined,
              assignedTo,
              status: 'open',
              unreadCount: 0,
            });
          }

          // Extract message text / media
          let messageType = 'text';
          let text = '';
          let media = null;

          if (msg.type === 'text') {
            messageType = 'text';
            text = msg.text?.body || '';
          } else if (['image', 'video', 'audio', 'document'].includes(msg.type)) {
            messageType = msg.type;
            const mediaObj = msg[msg.type] || {};
            text = mediaObj.caption || '';
            media = {
              url: mediaObj.id || mediaObj.link || '',
              mimeType: mediaObj.mime_type || '',
              fileName: mediaObj.filename || `${msg.type}_${Date.now()}`,
              fileSize: mediaObj.file_size || 0,
            };
          } else if (msg.type === 'interactive') {
            messageType = 'interactive';
            text = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || 'Interactive response';
          } else if (msg.type === 'button') {
            messageType = 'interactive';
            text = msg.button?.text || 'Button response';
          } else {
            text = `[${msg.type} message]`;
          }

          const savedMessage = await Message.create({
            conversationId: conversation._id,
            messageId,
            channel: 'whatsapp',
            brand: conversation.brand,
            senderType: 'customer',
            senderId: rawPhone,
            messageType,
            text,
            media: media || undefined,
            status: 'delivered',
            rawPayload: msg,
            timestamp: new Date(Number(msg.timestamp) * 1000 || Date.now()),
          });

          await Conversation.findByIdAndUpdate(conversation._id, {
            $set: {
              lastMessage: {
                text,
                senderType: 'customer',
                messageType,
                timestamp: savedMessage.timestamp,
              },
              lastActivityAt: savedMessage.timestamp,
              status: 'open',
            },
            $inc: { unreadCount: 1 },
          });

          if (conversation.assignedTo) {
            socketService.emitToTelecaller(conversation.assignedTo, 'chat:new_message', {
              conversationId: conversation._id,
              channel: 'whatsapp',
              brand: conversation.brand,
              brandName: conversation.brandName,
              message: savedMessage,
              participant: conversation.participant,
            });
          }
        }
      }
    }
  }
};

/**
 * Process inbound Instagram Webhook events from Meta.
 */
const processInboundInstagram = async (body) => {
  const entries = body?.entry || [];
  for (const entry of entries) {
    const entryId = entry.id; // IG Account ID or Page ID
    const messagingEvents = entry.messaging || [];

    for (const event of messagingEvents) {
      const igUserId = event.sender?.id;
      const recipientId = event.recipient?.id || entryId;
      const brandInfo = resolveBrandByChannelId(recipientId || entryId, 'instagram');

      if (event.message) {
        const messageId = event.message.mid;
        if (event.message.is_echo) continue;

        const existing = await Message.findOne({ messageId });
        if (existing) continue;

        let conversation = await Conversation.findOne({
          channel: 'instagram',
          channelId: recipientId,
          'participant.socialUserId': igUserId,
        });

        if (!conversation) {
          const assignedTo = await findOrAssignTelecaller(null, null, brandInfo.storePrefix);
          conversation = await Conversation.create({
            channel: 'instagram',
            brand: brandInfo.brand,
            brandName: brandInfo.brandName,
            channelId: recipientId,
            participant: {
              socialUserId: igUserId,
              igUserId,
              name: `Instagram User (${igUserId.slice(-4)})`,
            },
            assignedTo,
            status: 'open',
            unreadCount: 0,
          });
        }

        let messageType = 'text';
        let text = event.message.text || '';
        let media = null;

        if (event.message.attachments && event.message.attachments.length > 0) {
          const att = event.message.attachments[0];
          messageType = att.type || 'image';
          media = {
            url: att.payload?.url || '',
            mimeType: att.type || '',
            fileName: `ig_${messageType}_${Date.now()}`,
          };
          if (!text) text = `[Instagram ${messageType}]`;
        }

        const savedMessage = await Message.create({
          conversationId: conversation._id,
          messageId,
          channel: 'instagram',
          brand: conversation.brand,
          senderType: 'customer',
          senderId: igUserId,
          messageType,
          text,
          media: media || undefined,
          status: 'delivered',
          rawPayload: event,
          timestamp: new Date(event.timestamp || Date.now()),
        });

        await Conversation.findByIdAndUpdate(conversation._id, {
          $set: {
            lastMessage: {
              text,
              senderType: 'customer',
              messageType,
              timestamp: savedMessage.timestamp,
            },
            lastActivityAt: savedMessage.timestamp,
            status: 'open',
          },
          $inc: { unreadCount: 1 },
        });

        if (conversation.assignedTo) {
          socketService.emitToTelecaller(conversation.assignedTo, 'chat:new_message', {
            conversationId: conversation._id,
            channel: 'instagram',
            brand: conversation.brand,
            brandName: conversation.brandName,
            message: savedMessage,
            participant: conversation.participant,
          });
        }
      }

      if (event.read) {
        const watermark = new Date(event.read.watermark || Date.now());
        await Message.updateMany(
          {
            senderId: recipientId,
            createdAt: { $lte: watermark },
            status: { $ne: 'read' },
          },
          { $set: { status: 'read' } }
        );
      }
    }
  }
};

/**
 * Process inbound Facebook Messenger Webhook events from Meta.
 */
const processInboundFacebook = async (body) => {
  const entries = body?.entry || [];
  for (const entry of entries) {
    const pageId = entry.id; // Facebook Page ID
    const messagingEvents = entry.messaging || [];

    for (const event of messagingEvents) {
      const psid = event.sender?.id; // Page-Scoped ID
      const recipientId = event.recipient?.id || pageId;
      const brandInfo = resolveBrandByChannelId(recipientId || pageId, 'facebook');

      if (event.message) {
        const messageId = event.message.mid;
        if (event.message.is_echo) continue;

        const existing = await Message.findOne({ messageId });
        if (existing) continue;

        let conversation = await Conversation.findOne({
          channel: 'facebook',
          channelId: recipientId,
          'participant.socialUserId': psid,
        });

        if (!conversation) {
          const assignedTo = await findOrAssignTelecaller(null, null, brandInfo.storePrefix);
          conversation = await Conversation.create({
            channel: 'facebook',
            brand: brandInfo.brand,
            brandName: brandInfo.brandName,
            channelId: recipientId,
            participant: {
              socialUserId: psid,
              name: `Facebook User (${psid.slice(-4)})`,
            },
            assignedTo,
            status: 'open',
            unreadCount: 0,
          });
        }

        let messageType = 'text';
        let text = event.message.text || '';
        let media = null;

        if (event.message.attachments && event.message.attachments.length > 0) {
          const att = event.message.attachments[0];
          messageType = att.type || 'image';
          media = {
            url: att.payload?.url || '',
            mimeType: att.type || '',
            fileName: `fb_${messageType}_${Date.now()}`,
          };
          if (!text) text = `[Facebook ${messageType}]`;
        }

        const savedMessage = await Message.create({
          conversationId: conversation._id,
          messageId,
          channel: 'facebook',
          brand: conversation.brand,
          senderType: 'customer',
          senderId: psid,
          messageType,
          text,
          media: media || undefined,
          status: 'delivered',
          rawPayload: event,
          timestamp: new Date(event.timestamp || Date.now()),
        });

        await Conversation.findByIdAndUpdate(conversation._id, {
          $set: {
            lastMessage: {
              text,
              senderType: 'customer',
              messageType,
              timestamp: savedMessage.timestamp,
            },
            lastActivityAt: savedMessage.timestamp,
            status: 'open',
          },
          $inc: { unreadCount: 1 },
        });

        if (conversation.assignedTo) {
          socketService.emitToTelecaller(conversation.assignedTo, 'chat:new_message', {
            conversationId: conversation._id,
            channel: 'facebook',
            brand: conversation.brand,
            brandName: conversation.brandName,
            message: savedMessage,
            participant: conversation.participant,
          });
        }
      }
    }
  }
};

/**
 * Send an outbound message in a conversation.
 */
const sendOutboundMessage = async ({ conversationId, senderId, text, media, messageType = 'text' }) => {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw new Error('Conversation not found');
  }

  let result = null;
  if (conversation.channel === 'whatsapp') {
    const toPhone = conversation.participant.phone || conversation.participant.normalizedPhone;
    result = await metaSendService.sendWhatsAppMessage({
      to: toPhone,
      text,
      type: messageType,
      media,
      phoneNumberId: conversation.channelId,
    });
  } else if (conversation.channel === 'instagram') {
    result = await metaSendService.sendInstagramMessage({
      recipientId: conversation.participant.socialUserId || conversation.participant.igUserId,
      text,
      media,
      accountId: conversation.channelId,
    });
  } else if (conversation.channel === 'facebook') {
    result = await metaSendService.sendFacebookMessage({
      recipientId: conversation.participant.socialUserId,
      text,
      media,
      pageId: conversation.channelId,
    });
  }

  const savedMessage = await Message.create({
    conversationId: conversation._id,
    messageId: result?.messageId || `msg_${Date.now()}`,
    channel: conversation.channel,
    brand: conversation.brand,
    senderType: 'telecaller',
    senderId: senderId || conversation.assignedTo || 'system',
    messageType,
    text,
    media: media || undefined,
    status: 'sent',
    timestamp: new Date(),
  });

  await Conversation.findByIdAndUpdate(conversation._id, {
    $set: {
      lastMessage: {
        text,
        senderType: 'telecaller',
        messageType,
        timestamp: savedMessage.timestamp,
      },
      lastActivityAt: savedMessage.timestamp,
    },
  });

  // Emit event to telecaller's sockets
  if (conversation.assignedTo) {
    socketService.emitToTelecaller(conversation.assignedTo, 'chat:new_message', {
      conversationId: conversation._id,
      channel: conversation.channel,
      brand: conversation.brand,
      brandName: conversation.brandName,
      message: savedMessage,
      participant: conversation.participant,
    });
  }

  return savedMessage;
};

/**
 * Mark conversation messages as read.
 */
const markConversationAsRead = async (conversationId) => {
  const conversation = await Conversation.findByIdAndUpdate(
    conversationId,
    { $set: { unreadCount: 0 } },
    { new: true }
  );

  if (conversation && conversation.channel === 'whatsapp') {
    const lastCustomerMsg = await Message.findOne({
      conversationId,
      senderType: 'customer',
    }).sort({ timestamp: -1 });

    if (lastCustomerMsg?.messageId) {
      metaSendService.markWhatsAppAsRead({
        messageId: lastCustomerMsg.messageId,
        phoneNumberId: conversation.channelId,
      }).catch(() => {});
    }
  }

  return conversation;
};

/**
 * Convert an active chat conversation into a LeadMaster CRM entry.
 */
const convertChatToLead = async ({ conversationId, leadData = {}, createdBy }) => {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw new Error('Conversation not found');
  }

  const brandInfo = resolveBrandByChannelId(conversation.channelId, conversation.channel);
  const rawPhone = leadData.phone || conversation.participant.phone || conversation.participant.normalizedPhone || '';
  const customerName = leadData.customerName || leadData.name || conversation.participant.name || '';
  const telecallerId = createdBy || conversation.assignedTo || 'system';

  // Apply default store prefix if not explicitly provided
  let store = leadData.store;
  if (!store && brandInfo.storePrefix) {
    store = `${brandInfo.storePrefix}General`;
  }

  const leadPayload = {
    ...leadData,
    phone: rawPhone,
    customerName,
    name: customerName,
    store,
    brand: conversation.brand || brandInfo.key || 'general',
    channel: conversation.channel || 'whatsapp',
    leadtype: leadData.leadtype || 'enquiry',
    source: 'chat',
    remarks: leadData.remarks || `Converted from ${conversation.brandName} (${conversation.channel}) chat`,
    createdBy: telecallerId,
  };

  const createdLead = await leadService.createLead(leadPayload);

  // Link lead to conversation
  conversation.leadId = createdLead._id;
  await conversation.save();

  return createdLead;
};

/**
 * Transfer conversation to another telecaller.
 */
const transferConversation = async (conversationId, newTelecallerId) => {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw new Error('Conversation not found');
  }

  const assignedTo = String(newTelecallerId).replace(/\s+/g, '').toUpperCase();
  conversation.assignedTo = assignedTo;
  await conversation.save();

  socketService.emitToTelecaller(assignedTo, 'chat:assigned', {
    conversationId: conversation._id,
    channel: conversation.channel,
    brand: conversation.brand,
    brandName: conversation.brandName,
    participant: conversation.participant,
  });

  return conversation;
};

/**
 * Simulate an incoming customer message across WhatsApp, Instagram, or Facebook for testing without Meta credentials.
 */
const simulateInboundMessage = async ({
  channel = 'whatsapp',
  brand = 'suitor_guy',
  phone = '9876543210',
  customerName = 'Test Customer',
  text = 'Hello! I need a suit rental for wedding next week',
  socialUserId
}) => {
  const brandKey = (brand || 'suitor_guy').toLowerCase();
  const brandName = brandKey === 'suitor_guy' ? 'Suitor Guy' : brandKey === 'zorucci' ? 'Zorucci' : 'Dapper Squad';
  const normalizedPhone = normalize(phone);
  const userId = socialUserId || `sim_${channel}_${Date.now().toString().slice(-6)}`;

  let query = { channel, brand: brandKey };
  if (channel === 'whatsapp') {
    query['participant.normalizedPhone'] = normalizedPhone;
  } else {
    query['participant.socialUserId'] = userId;
  }

  let conversation = await Conversation.findOne(query);
  if (!conversation) {
    let customer = null;
    if (normalizedPhone) {
      customer = await Customer.findOne({ normalizedPhone });
    }

    const assignedTo = await findOrAssignTelecaller(normalizedPhone, customer?._id);
    conversation = await Conversation.create({
      channel,
      brand: brandKey,
      brandName,
      channelId: `SIM_${channel.toUpperCase()}_ID`,
      participant: {
        phone: channel === 'whatsapp' ? `91${normalizedPhone}` : undefined,
        normalizedPhone: channel === 'whatsapp' ? normalizedPhone : undefined,
        socialUserId: channel !== 'whatsapp' ? userId : undefined,
        name: customerName,
      },
      customerId: customer?._id || undefined,
      assignedTo,
      status: 'open',
      unreadCount: 0,
    });

    socketService.emitToTelecaller(assignedTo, 'chat:assigned', {
      conversationId: conversation._id,
      channel,
      brand: brandKey,
      brandName,
      participant: conversation.participant,
    });
  }

  const messageId = `sim_msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const savedMessage = await Message.create({
    conversationId: conversation._id,
    messageId,
    channel,
    brand: brandKey,
    senderType: 'customer',
    senderId: channel === 'whatsapp' ? normalizedPhone : userId,
    messageType: 'text',
    text,
    status: 'delivered',
    timestamp: new Date(),
  });

  await Conversation.findByIdAndUpdate(conversation._id, {
    $set: {
      lastMessage: {
        text,
        senderType: 'customer',
        messageType: 'text',
        timestamp: savedMessage.timestamp,
      },
      lastActivityAt: savedMessage.timestamp,
      status: 'open',
    },
    $inc: { unreadCount: 1 },
  });

  if (conversation.assignedTo) {
    socketService.emitToTelecaller(conversation.assignedTo, 'chat:message', {
      conversationId: conversation._id,
      channel,
      brand: brandKey,
      brandName,
      message: savedMessage,
      participant: conversation.participant,
    });
  }

  return {
    conversation,
    message: savedMessage
  };
};

module.exports = {
  processInboundWhatsApp,
  processInboundInstagram,
  processInboundFacebook,
  sendOutboundMessage,
  markConversationAsRead,
  convertChatToLead,
  transferConversation,
  findOrAssignTelecaller,
  simulateInboundMessage,
};
