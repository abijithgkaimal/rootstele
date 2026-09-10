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

            if (assignedTo && assignedTo !== 'system') {
              socketService.emitToTelecaller(assignedTo, 'chat:assigned', {
                conversationId: conversation._id,
                channel: 'whatsapp',
                brand: conversation.brand,
                brandName: conversation.brandName,
                participant: conversation.participant,
              });
            }
          } else if (!conversation.assignedTo || conversation.assignedTo === 'system') {
            const newAssignee = await findOrAssignTelecaller(rawPhone, customer?._id, brandInfo.storePrefix);
            if (newAssignee && newAssignee !== 'system') {
              conversation.assignedTo = newAssignee;
              await conversation.save();
              socketService.emitToTelecaller(newAssignee, 'chat:assigned', {
                conversationId: conversation._id,
                channel: 'whatsapp',
                brand: conversation.brand,
                brandName: conversation.brandName,
                participant: conversation.participant,
              });
            }
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
          const userIdStr = igUserId ? String(igUserId) : 'User';
          conversation = await Conversation.create({
            channel: 'instagram',
            brand: brandInfo.brand,
            brandName: brandInfo.brandName,
            channelId: recipientId,
            participant: {
              socialUserId: igUserId,
              igUserId,
              name: `Instagram User (${userIdStr.slice(-4)})`,
            },
            assignedTo,
            status: 'open',
            unreadCount: 0,
          });

          if (assignedTo && assignedTo !== 'system') {
            socketService.emitToTelecaller(assignedTo, 'chat:assigned', {
              conversationId: conversation._id,
              channel: 'instagram',
              brand: conversation.brand,
              brandName: conversation.brandName,
              participant: conversation.participant,
            });
          }
        } else if (!conversation.assignedTo || conversation.assignedTo === 'system') {
          const newAssignee = await findOrAssignTelecaller(null, null, brandInfo.storePrefix);
          if (newAssignee && newAssignee !== 'system') {
            conversation.assignedTo = newAssignee;
            await conversation.save();
            socketService.emitToTelecaller(newAssignee, 'chat:assigned', {
              conversationId: conversation._id,
              channel: 'instagram',
              brand: conversation.brand,
              brandName: conversation.brandName,
              participant: conversation.participant,
            });
          }
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

        const rawTs = Number(event.timestamp);
        const msgDate = !isNaN(rawTs) && rawTs > 0
          ? new Date(rawTs < 1e11 ? rawTs * 1000 : rawTs)
          : new Date();

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
          timestamp: msgDate,
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
        const watermarkTs = Number(event.read.watermark);
        const watermark = !isNaN(watermarkTs) && watermarkTs > 0
          ? new Date(watermarkTs < 1e11 ? watermarkTs * 1000 : watermarkTs)
          : new Date();
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
          const psidStr = psid ? String(psid) : 'User';
          conversation = await Conversation.create({
            channel: 'facebook',
            brand: brandInfo.brand,
            brandName: brandInfo.brandName,
            channelId: recipientId,
            participant: {
              socialUserId: psid,
              name: `Facebook User (${psidStr.slice(-4)})`,
            },
            assignedTo,
            status: 'open',
            unreadCount: 0,
          });

          if (assignedTo && assignedTo !== 'system') {
            socketService.emitToTelecaller(assignedTo, 'chat:assigned', {
              conversationId: conversation._id,
              channel: 'facebook',
              brand: conversation.brand,
              brandName: conversation.brandName,
              participant: conversation.participant,
            });
          }
        } else if (!conversation.assignedTo || conversation.assignedTo === 'system') {
          const newAssignee = await findOrAssignTelecaller(null, null, brandInfo.storePrefix);
          if (newAssignee && newAssignee !== 'system') {
            conversation.assignedTo = newAssignee;
            await conversation.save();
            socketService.emitToTelecaller(newAssignee, 'chat:assigned', {
              conversationId: conversation._id,
              channel: 'facebook',
              brand: conversation.brand,
              brandName: conversation.brandName,
              participant: conversation.participant,
            });
          }
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

        const rawTs = Number(event.timestamp);
        const msgDate = !isNaN(rawTs) && rawTs > 0
          ? new Date(rawTs < 1e11 ? rawTs * 1000 : rawTs)
          : new Date();

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
          timestamp: msgDate,
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
 * Saves immediately to DB and returns/emits in < 50ms, then dispatches Meta Graph API in the background.
 */
const sendOutboundMessage = async ({ conversationId, senderId, text, media, messageType = 'text', tempId }) => {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw new Error('Conversation not found');
  }

  const initialMessageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const now = new Date();

  // Calculate response time from the latest customer message in this conversation
  const lastCustomerMsg = await Message.findOne({
    conversationId: conversation._id,
    senderType: 'customer',
  }).sort({ timestamp: -1 });

  let responseTimeSeconds = undefined;
  if (lastCustomerMsg && lastCustomerMsg.timestamp) {
    const diffMs = now.getTime() - new Date(lastCustomerMsg.timestamp).getTime();
    if (diffMs >= 0) {
      responseTimeSeconds = Math.round(diffMs / 1000);
    }
  }

  // 1. Immediately create message in MongoDB
  const savedMessage = await Message.create({
    conversationId: conversation._id,
    messageId: initialMessageId,
    tempId: tempId || undefined,
    channel: conversation.channel,
    brand: conversation.brand,
    senderType: 'telecaller',
    senderId: senderId || conversation.assignedTo || 'system',
    messageType,
    text,
    media: media || undefined,
    responseTimeSeconds,
    status: 'sent',
    timestamp: now,
  });

  // 2. Update conversation activity immediately
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

  // 3. Emit event to telecaller's sockets immediately
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

  // 4. Asynchronously dispatch message to Meta in background without blocking response
  (async () => {
    try {
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
          brand: conversation.brand,
          accountId: conversation.channelId,
        });
      } else if (conversation.channel === 'facebook') {
        const customerPsid = conversation.participant?.socialUserId || conversation.participant?.psid;
        if (!customerPsid) {
          throw new Error(`Customer Facebook PSID not found in conversation participant for conversation ${conversation._id}`);
        }
        result = await metaSendService.sendFacebookMessage({
          recipientId: customerPsid,
          text,
          media,
          brand: conversation.brand,
          pageId: conversation.channelId,
        });
      }

      if (result?.messageId && result.messageId !== initialMessageId) {
        const updateFields = {
          messageId: result.messageId,
          status: 'sent',
        };
        if (result.pageId) {
          updateFields.senderExternalId = result.pageId;
        }

        await Message.findByIdAndUpdate(savedMessage._id, {
          $set: updateFields,
        });

        // Update conversation document
        await Conversation.findByIdAndUpdate(conversation._id, {
          $set: {
            lastMessageText: text,
            lastMessageAt: savedMessage.timestamp,
            lastActivityAt: savedMessage.timestamp,
          },
        });

        // Notify socket of the confirmed Meta messageId
        if (conversation.assignedTo) {
          socketService.emitToTelecaller(conversation.assignedTo, 'chat:status_update', {
            localId: savedMessage._id,
            tempId: tempId || undefined,
            messageId: result.messageId,
            conversationId: conversation._id,
            status: 'sent',
            channel: conversation.channel,
            brand: conversation.brand,
          });
        }
      }
    } catch (err) {
      console.error(`[ChatService] Background send error for msg ${savedMessage._id}:`, err.message);
      await Message.findByIdAndUpdate(savedMessage._id, {
        $set: { status: 'failed', errorMessage: err.message },
      });

      if (conversation.assignedTo) {
        socketService.emitToTelecaller(conversation.assignedTo, 'chat:status_update', {
          localId: savedMessage._id,
          tempId: tempId || undefined,
          messageId: savedMessage.messageId,
          conversationId: conversation._id,
          status: 'failed',
          errorMessage: err.message,
          channel: conversation.channel,
          brand: conversation.brand,
        });
      }
    }
  })().catch((bgErr) => {
    console.error('[ChatService] Unhandled error in background Meta dispatch:', bgErr);
  });

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
  const cleanPhone = normalize(rawPhone) || rawPhone;
  const customerName = leadData.customerName || leadData.name || conversation.participant.name || '';
  const telecallerId = createdBy || conversation.assignedTo || 'system';

  // Apply default store prefix if not explicitly provided
  let store = leadData.store;
  if (!store && brandInfo.storePrefix) {
    store = `${brandInfo.storePrefix}General`;
  }

  // Prevent duplicates: If conversation was already converted, update the existing LeadMaster entry
  if (conversation.leadId) {
    const existingLead = await LeadMaster.findById(conversation.leadId);
    if (existingLead) {
      if (cleanPhone) {
        existingLead.phone = cleanPhone;
        existingLead.normalizedPhone = cleanPhone;
      }
      if (leadData.leadtype) existingLead.leadtype = leadData.leadtype;
      if (customerName) {
        existingLead.customerName = customerName;
        existingLead.name = customerName;
      }
      if (store) existingLead.store = store;
      if (leadData.remarks) existingLead.remarks = leadData.remarks;
      if (leadData.functionDate) existingLead.functionDate = new Date(leadData.functionDate);
      existingLead.updatedBy = telecallerId;
      await existingLead.save();

      // Mark conversation as resolved / closed
      conversation.status = 'resolved';
      await conversation.save();

      if (conversation.assignedTo) {
        socketService.emitToTelecaller(conversation.assignedTo, 'chat:status_update', {
          conversationId: conversation._id,
          status: 'resolved',
          leadId: existingLead._id,
          channel: conversation.channel,
          brand: conversation.brand,
        });
      }

      return existingLead;
    }
  }

  const leadPayload = {
    ...leadData,
    phone: cleanPhone,
    normalizedPhone: cleanPhone,
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

  // Link lead to conversation and auto-close (mark as resolved)
  conversation.leadId = createdLead._id;
  conversation.status = 'resolved';
  await conversation.save();

  if (conversation.assignedTo) {
    socketService.emitToTelecaller(conversation.assignedTo, 'chat:status_update', {
      conversationId: conversation._id,
      status: 'resolved',
      leadId: createdLead._id,
      channel: conversation.channel,
      brand: conversation.brand,
    });
  }

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

    if (assignedTo && assignedTo !== 'system') {
      socketService.emitToTelecaller(assignedTo, 'chat:assigned', {
        conversationId: conversation._id,
        channel,
        brand: brandKey,
        brandName,
        participant: conversation.participant,
      });
    }
  } else if (!conversation.assignedTo || conversation.assignedTo === 'system') {
    const newAssignee = await findOrAssignTelecaller(normalizedPhone, conversation.customerId);
    if (newAssignee && newAssignee !== 'system') {
      conversation.assignedTo = newAssignee;
      await conversation.save();
      socketService.emitToTelecaller(newAssignee, 'chat:assigned', {
        conversationId: conversation._id,
        channel,
        brand: brandKey,
        brandName,
        participant: conversation.participant,
      });
    }
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

/**
 * Automatically reassigns any open conversations currently held under 'system' or unassigned
 * to active online telecallers using least-busy load balancing.
 */
const reassignPendingSystemChats = async () => {
  try {
    const unassignedConversations = await Conversation.find({
      status: 'open',
      $or: [
        { assignedTo: 'system' },
        { assignedTo: null },
        { assignedTo: { $exists: false } },
        { assignedTo: '' },
      ],
    }).sort({ lastActivityAt: 1 });

    if (!unassignedConversations.length) {
      return { reassignedCount: 0 };
    }

    // Check active telecallers (logged in within 12h)
    const activeUsers = await User.find({
      lastLoginAt: { $gte: new Date(Date.now() - 12 * 60 * 60 * 1000) },
      role: { $ne: 'admin' },
    }).sort({ lastLoginAt: -1 });

    if (!activeUsers.length) {
      return { reassignedCount: 0, reason: 'No active telecallers online' };
    }

    let reassignedCount = 0;

    for (const conversation of unassignedConversations) {
      const assignedTo = await findOrAssignTelecaller(
        conversation.participant?.phone || conversation.participant?.normalizedPhone,
        conversation.customerId
      );

      if (assignedTo && assignedTo !== 'system') {
        conversation.assignedTo = assignedTo;
        await conversation.save();
        reassignedCount++;

        socketService.emitToTelecaller(assignedTo, 'chat:assigned', {
          conversationId: conversation._id,
          channel: conversation.channel,
          brand: conversation.brand,
          brandName: conversation.brandName,
          participant: conversation.participant,
        });

        // Also fetch latest message to display in UI immediately if unread
        if (conversation.lastMessage) {
          socketService.emitToTelecaller(assignedTo, 'chat:new_message', {
            conversationId: conversation._id,
            channel: conversation.channel,
            brand: conversation.brand,
            brandName: conversation.brandName,
            message: conversation.lastMessage,
            participant: conversation.participant,
          });
        }
      }
    }

    console.log(`[ChatService] Reassigned ${reassignedCount} pending system chat(s) to active telecallers.`);
    return { reassignedCount };
  } catch (err) {
    console.error('[ChatService] Error reassigning pending system chats:', err.message);
    return { error: err.message };
  }
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
  reassignPendingSystemChats,
};
