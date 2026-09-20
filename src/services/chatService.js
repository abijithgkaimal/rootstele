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
const metaProfileService = require('./metaProfileService');
const socketService = require('./socketService');
const notificationService = require('./notificationService');
const gridfsService = require('./gridfsService');
const mimeHelper = require('../utils/mimeHelper');
const mongoose = require('mongoose');

// Concurrency mutex per participant key to prevent simultaneous conversation creation race conditions
const participantLocks = new Map();

/**
 * Helper to stream an incoming media buffer/stream into GridFS and return file details.
 * @param {import('stream').Readable|Buffer} streamOrBuffer
 * @param {string} filename
 * @param {string} mimeType
 * @param {object} metadata
 * @returns {Promise<{ fileId: string, mediaUrl: string, mimeType: string, fileName: string, fileSize?: number }>}
 */
const pipeMediaToGridFS = async (streamOrBuffer, filename, mimeType, metadata = {}) => {
  const normalizedMime = mimeHelper.normalizeContentType(mimeType, filename, metadata.isVoiceNote ? 'audio' : metadata.messageType);
  if (Buffer.isBuffer(streamOrBuffer)) {
    const res = await gridfsService.uploadBuffer(streamOrBuffer, filename, normalizedMime, metadata);
    return {
      fileId: res.fileId,
      mediaUrl: `/api/chat/media/${res.fileId}`,
      mimeType: res.contentType,
      fileName: res.filename,
      fileSize: res.length,
    };
  }

  return new Promise((resolve, reject) => {
    const uploadStream = gridfsService.createUploadStream(filename, {
      contentType: normalizedMime,
      metadata,
    });

    uploadStream.on('finish', () => {
      resolve({
        fileId: uploadStream.id.toString(),
        mediaUrl: `/api/chat/media/${uploadStream.id}`,
        mimeType: normalizedMime,
        fileName: filename,
        fileSize: uploadStream.length || undefined,
      });
    });

    uploadStream.on('error', (err) => {
      reject(err);
    });

    streamOrBuffer.pipe(uploadStream);
  });
};

/**
 * Executes an async function with a per-participant lock/queue to prevent race condition duplicates.
 * @param {string} lockKey
 * @param {Function} asyncFn
 */
const withParticipantLock = async (lockKey, asyncFn) => {
  if (!lockKey) return asyncFn();

  const prevPromise = participantLocks.get(lockKey) || Promise.resolve();

  let resolveNext;
  const nextPromise = new Promise((res) => {
    resolveNext = res;
  });

  participantLocks.set(lockKey, nextPromise);

  try {
    await prevPromise.catch(() => {});
    return await asyncFn();
  } finally {
    resolveNext();
    if (participantLocks.get(lockKey) === nextPromise) {
      participantLocks.delete(lockKey);
    }
  }
};

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
          const lockKey = `wa_${brandInfo.brand}_${normalizedPhone || rawPhone}`;

          await withParticipantLock(lockKey, async () => {
            // Find or link Customer
            let customer = null;
            if (normalizedPhone) {
              customer = await Customer.findOne({ normalizedPhone });
              if (!customer) {
                customerService.recomputeCustomerState(normalizedPhone).catch(() => {});
              }
            }

            // Find or create Conversation - search by brand and phone
            let conversation = await Conversation.findOne({
              channel: 'whatsapp',
              brand: brandInfo.brand,
              $or: [
                { 'participant.normalizedPhone': normalizedPhone },
                { 'participant.phone': rawPhone },
                { 'participant.phone': normalizedPhone },
              ],
            });

            // Fallback lookup if brand was unassigned in older records
            if (!conversation && normalizedPhone) {
              conversation = await Conversation.findOne({
                channel: 'whatsapp',
                $or: [
                  { 'participant.normalizedPhone': normalizedPhone },
                  { 'participant.phone': rawPhone },
                ],
              });
            }

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
            } else {
              let updated = false;
              if (conversation.channelId !== phoneNumberId && phoneNumberId !== 'WA_DEFAULT') {
                conversation.channelId = phoneNumberId;
                updated = true;
              }
              if (conversation.brand !== brandInfo.brand) {
                conversation.brand = brandInfo.brand;
                conversation.brandName = brandInfo.brandName;
                updated = true;
              }
              if (contactName && (!conversation.participant?.name || conversation.participant.name === rawPhone)) {
                conversation.participant = conversation.participant || {};
                conversation.participant.name = contactName;
                updated = true;
              }
              if (!conversation.assignedTo || conversation.assignedTo === 'system') {
                const newAssignee = await findOrAssignTelecaller(rawPhone, customer?._id, brandInfo.storePrefix);
                if (newAssignee && newAssignee !== 'system') {
                  conversation.assignedTo = newAssignee;
                  updated = true;
                  socketService.emitToTelecaller(newAssignee, 'chat:assigned', {
                    conversationId: conversation._id,
                    channel: 'whatsapp',
                    brand: conversation.brand,
                    brandName: conversation.brandName,
                    participant: conversation.participant,
                  });
                }
              }

              if (updated) {
                await conversation.save();
              }
            }

            // Extract message text / media
            let messageType = 'text';
            let text = '';
            let caption = '';
            let media = null;
            let mediaFileId = undefined;
            let mediaUrl = undefined;
            let attachmentUrl = undefined;
            let mediaMetadata = undefined;
            let isVoiceNote = false;
            let fileName = undefined;
            let mimeType = undefined;

            if (msg.type === 'text') {
              messageType = 'text';
              text = msg.text?.body || '';
            } else if (['image', 'video', 'audio', 'document'].includes(msg.type)) {
              messageType = msg.type;
              const mediaObj = msg[msg.type] || {};
              caption = mediaObj.caption || '';
              text = caption || '';
              isVoiceNote =
                msg.type === 'audio' &&
                (Boolean(mediaObj.voice) ||
                  (mediaObj.mime_type &&
                    (mediaObj.mime_type.includes('ogg') || mediaObj.mime_type.includes('opus'))));

              fileName = mediaObj.filename || `${msg.type}_${Date.now()}`;
              mimeType =
                mediaObj.mime_type ||
                (msg.type === 'audio'
                  ? 'audio/ogg'
                  : msg.type === 'image'
                  ? 'image/jpeg'
                  : msg.type === 'video'
                  ? 'video/mp4'
                  : 'application/pdf');

              try {
                const downloaded = await metaSendService.downloadWhatsAppMediaStream(mediaObj.id, {
                  phoneNumberId,
                  brand: brandInfo.brand,
                });

                if (downloaded.mimeType) mimeType = downloaded.mimeType;

                const stored = await pipeMediaToGridFS(downloaded.stream, fileName, mimeType, {
                  channel: 'whatsapp',
                  brand: brandInfo.brand,
                  messageType: msg.type,
                  metaMediaId: mediaObj.id,
                  isVoiceNote,
                });

                mediaFileId = stored.fileId;
                mediaUrl = stored.mediaUrl;
                attachmentUrl = stored.mediaUrl;
                mediaMetadata = {
                  mimeType,
                  fileName,
                  fileSize: downloaded.fileSize || stored.fileSize || mediaObj.file_size,
                  title: caption || undefined,
                };
                media = {
                  url: stored.mediaUrl,
                  mimeType,
                  fileName,
                  fileSize: mediaMetadata.fileSize,
                  title: caption || undefined,
                };
              } catch (downloadErr) {
                console.warn(
                  `[ChatService] Failed to stream WhatsApp media ${mediaObj.id} to GridFS:`,
                  downloadErr.message
                );
                // Fallback to resolving CDN URL
                const resolved = await metaSendService.getWhatsAppMediaUrl(mediaObj.id, null, {
                  phoneNumberId,
                  brand: brandInfo.brand,
                });
                attachmentUrl = resolved.url || mediaObj.link || mediaObj.id || '';
                mediaUrl = attachmentUrl;
                mediaMetadata = {
                  mimeType: resolved.mimeType || mediaObj.mime_type || '',
                  fileName,
                  fileSize: resolved.fileSize || mediaObj.file_size || 0,
                  title: caption || undefined,
                };
                media = {
                  url: attachmentUrl,
                  mimeType: mediaMetadata.mimeType,
                  fileName,
                  fileSize: mediaMetadata.fileSize,
                  title: caption || undefined,
                };
              }
            } else if (msg.type === 'interactive') {
              messageType = 'interactive';
              text = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || 'Interactive response';
            } else if (msg.type === 'button') {
              messageType = 'interactive';
              text = msg.button?.text || 'Button response';
            } else {
              text = `[${msg.type} message]`;
            }

            const customerSenderName = contactName || conversation.participant?.name || (customer ? customer.name : rawPhone);

            const savedMessage = await Message.create({
              conversationId: conversation._id,
              messageId,
              channel: 'whatsapp',
              brand: conversation.brand,
              senderType: 'customer',
              senderId: rawPhone,
              senderName: customerSenderName,
              messageType,
              text,
              caption: caption || undefined,
              mediaFileId: mediaFileId ? new mongoose.Types.ObjectId(mediaFileId) : undefined,
              mediaUrl,
              mimeType,
              fileName,
              isVoiceNote,
              attachmentUrl,
              mediaMetadata,
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

            if (conversation.assignedTo && conversation.assignedTo !== 'system') {
              socketService.emitToTelecaller(conversation.assignedTo, 'chat:new_message', {
                conversationId: conversation._id,
                channel: 'whatsapp',
                brand: conversation.brand,
                brandName: conversation.brandName,
                message: savedMessage,
                participant: conversation.participant,
              });

              notificationService.sendNotificationToUser({
                employeeId: conversation.assignedTo,
                title: conversation.brandName ? `New Message - ${conversation.brandName}` : 'New WhatsApp Message',
                body: text || (media ? `[${messageType} attachment]` : 'You have a new message'),
                data: {
                  type: 'chat',
                  chatId: String(conversation._id),
                  channel: 'whatsapp',
                  brand: conversation.brand || '',
                },
              }).catch((err) => console.error('[ChatService] Push notification error:', err.message));
            }
          });
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

        const lockKey = `ig_${brandInfo.brand}_${igUserId}`;

        await withParticipantLock(lockKey, async () => {
          let conversation = await Conversation.findOne({
            channel: 'instagram',
            brand: brandInfo.brand,
            $or: [
              { 'participant.socialUserId': igUserId },
              { 'participant.igUserId': igUserId },
            ],
          });

          // Fallback if brand was not set previously
          if (!conversation) {
            conversation = await Conversation.findOne({
              channel: 'instagram',
              $or: [
                { 'participant.socialUserId': igUserId },
                { 'participant.igUserId': igUserId },
              ],
            });
          }

          const profile = await metaProfileService.resolveInstagramProfile(igUserId, {
            brand: brandInfo.brand,
            pageId: recipientId,
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
                name: profile.name,
                username: profile.username || undefined,
                profilePic: profile.profilePic || undefined,
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
          } else {
            let updated = false;
            if (conversation.channelId !== recipientId) {
              conversation.channelId = recipientId;
              updated = true;
            }
            if (conversation.brand !== brandInfo.brand) {
              conversation.brand = brandInfo.brand;
              conversation.brandName = brandInfo.brandName;
              updated = true;
            }
            if (profile.name && (!conversation.participant?.name || conversation.participant.name.startsWith('Instagram User'))) {
              conversation.participant = conversation.participant || {};
              conversation.participant.name = profile.name;
              updated = true;
            }
            if (profile.username && conversation.participant?.username !== profile.username) {
              conversation.participant = conversation.participant || {};
              conversation.participant.username = profile.username;
              updated = true;
            }
            if (profile.profilePic && conversation.participant?.profilePic !== profile.profilePic) {
              conversation.participant = conversation.participant || {};
              conversation.participant.profilePic = profile.profilePic;
              updated = true;
            }

            if (!conversation.assignedTo || conversation.assignedTo === 'system') {
              const newAssignee = await findOrAssignTelecaller(null, null, brandInfo.storePrefix);
              if (newAssignee && newAssignee !== 'system') {
                conversation.assignedTo = newAssignee;
                updated = true;
                socketService.emitToTelecaller(newAssignee, 'chat:assigned', {
                  conversationId: conversation._id,
                  channel: 'instagram',
                  brand: conversation.brand,
                  brandName: conversation.brandName,
                  participant: conversation.participant,
                });
              }
            }

            if (updated) {
              await conversation.save();
            }
          }

          let messageType = 'text';
          let text = event.message.text || '';
          let caption = '';
          let media = null;
          let mediaFileId = undefined;
          let mediaUrl = undefined;
          let attachmentUrl = undefined;
          let mediaMetadata = undefined;
          let isVoiceNote = false;
          let sharedPostUrl = undefined;
          let fileName = undefined;
          let mimeType = undefined;

          if (event.message.attachments && event.message.attachments.length > 0) {
            const att = event.message.attachments[0];
            const rawType = (att.type || 'image').toLowerCase();
            const validTypes = [
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
            ];
            messageType = validTypes.includes(rawType)
              ? rawType
              : (rawType.includes('reel') ? 'ig_reel' : 'image');

            isVoiceNote = rawType === 'audio';

            const payload = att.payload || {};
            const directUrl = payload.url || '';
            const reelOrShareUrl =
              payload.reel_url ||
              (payload.reel_video_id ? `https://www.instagram.com/reel/${payload.reel_video_id}/` : '') ||
              (messageType === 'ig_reel' || messageType === 'share' ? directUrl : '');

            if (reelOrShareUrl) {
              sharedPostUrl = reelOrShareUrl;
            }

            fileName = `ig_${messageType}_${Date.now()}`;
            mimeType = payload.mime_type || (rawType === 'audio' ? 'audio/aac' : rawType === 'video' ? 'video/mp4' : 'image/jpeg');

            // Download direct media files (audio, image, video, file) to GridFS
            if (directUrl && ['audio', 'image', 'video', 'file', 'document'].includes(rawType)) {
              try {
                const downloaded = await metaSendService.downloadExternalMediaStream(directUrl, { mimeType });
                if (downloaded.mimeType) mimeType = downloaded.mimeType;

                const stored = await pipeMediaToGridFS(downloaded.stream, fileName, mimeType, {
                  channel: 'instagram',
                  brand: brandInfo.brand,
                  messageType,
                  isVoiceNote,
                });

                mediaFileId = stored.fileId;
                mediaUrl = stored.mediaUrl;
                attachmentUrl = stored.mediaUrl;
                mediaMetadata = {
                  title: payload.title || undefined,
                  reelVideoId: payload.reel_video_id || undefined,
                  mimeType,
                  fileName,
                  fileSize: downloaded.fileSize || stored.fileSize || payload.file_size,
                };
                media = {
                  url: stored.mediaUrl,
                  mimeType,
                  fileName,
                  fileSize: mediaMetadata.fileSize,
                  title: payload.title || undefined,
                  reelVideoId: payload.reel_video_id || undefined,
                };
              } catch (downloadErr) {
                console.warn('[ChatService] Failed to stream Instagram media to GridFS:', downloadErr.message);
                attachmentUrl = directUrl;
                mediaUrl = directUrl;
                mediaMetadata = {
                  title: payload.title || undefined,
                  reelVideoId: payload.reel_video_id || undefined,
                  mimeType,
                  fileName,
                  fileSize: payload.file_size || undefined,
                };
                media = {
                  url: directUrl,
                  mimeType,
                  fileName,
                  fileSize: payload.file_size || undefined,
                  title: payload.title || undefined,
                  reelVideoId: payload.reel_video_id || undefined,
                };
              }
            } else {
              attachmentUrl = directUrl || reelOrShareUrl || '';
              mediaUrl = attachmentUrl;
              mediaMetadata = {
                title: payload.title || undefined,
                reelVideoId: payload.reel_video_id || undefined,
                mimeType,
                fileName,
                fileSize: payload.file_size || undefined,
              };
              media = {
                url: attachmentUrl,
                mimeType,
                fileName,
                fileSize: payload.file_size || undefined,
                title: payload.title || undefined,
                reelVideoId: payload.reel_video_id || undefined,
              };
            }

            if (!text) {
              if (messageType === 'ig_reel') {
                text = payload.title ? `[Instagram Reel: ${payload.title}]` : '[Instagram Reel]';
              } else if (messageType === 'share') {
                text = payload.title ? `[Shared Post: ${payload.title}]` : '[Instagram Shared Post]';
              } else if (messageType === 'story_mention') {
                text = '[Mentioned in Instagram Story]';
              } else {
                text = `[Instagram ${messageType}]`;
              }
            }
          }

          const rawTs = Number(event.timestamp);
          const msgDate = !isNaN(rawTs) && rawTs > 0
            ? new Date(rawTs < 1e11 ? rawTs * 1000 : rawTs)
            : new Date();

          const customerSenderName = profile.name || conversation.participant?.name || 'Instagram User';

          const savedMessage = await Message.create({
            conversationId: conversation._id,
            messageId,
            channel: 'instagram',
            brand: conversation.brand,
            senderType: 'customer',
            senderId: igUserId,
            senderName: customerSenderName,
            messageType,
            text,
            caption: caption || undefined,
            mediaFileId: mediaFileId ? new mongoose.Types.ObjectId(mediaFileId) : undefined,
            mediaUrl,
            mimeType,
            fileName,
            isVoiceNote,
            sharedPostUrl,
            attachmentUrl,
            mediaMetadata,
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

          if (conversation.assignedTo && conversation.assignedTo !== 'system') {
            socketService.emitToTelecaller(conversation.assignedTo, 'chat:new_message', {
              conversationId: conversation._id,
              channel: 'instagram',
              brand: conversation.brand,
              brandName: conversation.brandName,
              message: savedMessage,
              participant: conversation.participant,
            });

            notificationService.sendNotificationToUser({
              employeeId: conversation.assignedTo,
              title: conversation.brandName ? `New Message - ${conversation.brandName}` : 'New Instagram Message',
              body: text || (media ? `[${messageType} attachment]` : 'You have a new message'),
              data: {
                type: 'chat',
                chatId: String(conversation._id),
                channel: 'instagram',
                brand: conversation.brand || '',
              },
            }).catch((err) => console.error('[ChatService] Push notification error:', err.message));
          }
        });
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

        const lockKey = `fb_${brandInfo.brand}_${psid}`;

        await withParticipantLock(lockKey, async () => {
          let conversation = await Conversation.findOne({
            channel: 'facebook',
            brand: brandInfo.brand,
            $or: [
              { 'participant.socialUserId': psid },
              { 'participant.psid': psid },
            ],
          });

          if (!conversation) {
            conversation = await Conversation.findOne({
              channel: 'facebook',
              $or: [
                { 'participant.socialUserId': psid },
                { 'participant.psid': psid },
              ],
            });
          }

          const profile = await metaProfileService.resolveFacebookProfile(psid, {
            brand: brandInfo.brand,
            pageId: recipientId,
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
                name: profile.name,
                profilePic: profile.profilePic || undefined,
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
          } else {
            let updated = false;
            if (conversation.channelId !== recipientId) {
              conversation.channelId = recipientId;
              updated = true;
            }
            if (conversation.brand !== brandInfo.brand) {
              conversation.brand = brandInfo.brand;
              conversation.brandName = brandInfo.brandName;
              updated = true;
            }
            if (profile.name && (!conversation.participant?.name || conversation.participant.name.startsWith('Facebook User'))) {
              conversation.participant = conversation.participant || {};
              conversation.participant.name = profile.name;
              updated = true;
            }
            if (profile.profilePic && conversation.participant?.profilePic !== profile.profilePic) {
              conversation.participant = conversation.participant || {};
              conversation.participant.profilePic = profile.profilePic;
              updated = true;
            }

            if (!conversation.assignedTo || conversation.assignedTo === 'system') {
              const newAssignee = await findOrAssignTelecaller(null, null, brandInfo.storePrefix);
              if (newAssignee && newAssignee !== 'system') {
                conversation.assignedTo = newAssignee;
                updated = true;
                socketService.emitToTelecaller(newAssignee, 'chat:assigned', {
                  conversationId: conversation._id,
                  channel: 'facebook',
                  brand: conversation.brand,
                  brandName: conversation.brandName,
                  participant: conversation.participant,
                });
              }
            }

            if (updated) {
              await conversation.save();
            }
          }

          let messageType = 'text';
          let text = event.message.text || '';
          let caption = '';
          let media = null;
          let mediaFileId = undefined;
          let mediaUrl = undefined;
          let attachmentUrl = undefined;
          let mediaMetadata = undefined;
          let isVoiceNote = false;
          let fileName = undefined;
          let mimeType = undefined;

          if (event.message.attachments && event.message.attachments.length > 0) {
            const att = event.message.attachments[0];
            const rawType = (att.type || 'image').toLowerCase();
            const validTypes = ['text', 'image', 'audio', 'video', 'file', 'fallback'];
            messageType = validTypes.includes(rawType) ? rawType : 'image';
            isVoiceNote = rawType === 'audio';

            const payload = att.payload || {};
            const directUrl = payload.url || '';

            fileName = `fb_${messageType}_${Date.now()}`;
            mimeType = payload.mime_type || (rawType === 'audio' ? 'audio/aac' : rawType === 'video' ? 'video/mp4' : 'image/jpeg');

            if (directUrl && ['audio', 'image', 'video', 'file'].includes(rawType)) {
              try {
                const downloaded = await metaSendService.downloadExternalMediaStream(directUrl, { mimeType });
                if (downloaded.mimeType) mimeType = downloaded.mimeType;

                const stored = await pipeMediaToGridFS(downloaded.stream, fileName, mimeType, {
                  channel: 'facebook',
                  brand: brandInfo.brand,
                  messageType,
                  isVoiceNote,
                });

                mediaFileId = stored.fileId;
                mediaUrl = stored.mediaUrl;
                attachmentUrl = stored.mediaUrl;
                mediaMetadata = {
                  title: payload.title || undefined,
                  mimeType,
                  fileName,
                  fileSize: downloaded.fileSize || stored.fileSize || payload.file_size,
                };
                media = {
                  url: stored.mediaUrl,
                  mimeType,
                  fileName,
                  fileSize: mediaMetadata.fileSize,
                  title: payload.title || undefined,
                };
              } catch (downloadErr) {
                console.warn('[ChatService] Failed to stream Facebook media to GridFS:', downloadErr.message);
                attachmentUrl = directUrl;
                mediaUrl = directUrl;
                mediaMetadata = {
                  title: payload.title || undefined,
                  mimeType,
                  fileName,
                  fileSize: payload.file_size || undefined,
                };
                media = {
                  url: directUrl,
                  mimeType,
                  fileName,
                  fileSize: payload.file_size || undefined,
                  title: payload.title || undefined,
                };
              }
            } else {
              attachmentUrl = directUrl || '';
              mediaUrl = attachmentUrl;
              mediaMetadata = {
                title: payload.title || undefined,
                mimeType,
                fileName,
                fileSize: payload.file_size || undefined,
              };
              media = {
                url: attachmentUrl,
                mimeType,
                fileName,
                fileSize: payload.file_size || undefined,
                title: payload.title || undefined,
              };
            }

            if (!text) {
              text = `[Facebook ${messageType}]`;
            }
          }

          const rawTs = Number(event.timestamp);
          const msgDate = !isNaN(rawTs) && rawTs > 0
            ? new Date(rawTs < 1e11 ? rawTs * 1000 : rawTs)
            : new Date();

          const customerSenderName = profile.name || conversation.participant?.name || 'Facebook User';

          const savedMessage = await Message.create({
            conversationId: conversation._id,
            messageId,
            channel: 'facebook',
            brand: conversation.brand,
            senderType: 'customer',
            senderId: psid,
            senderName: customerSenderName,
            messageType,
            text,
            caption: caption || undefined,
            mediaFileId: mediaFileId ? new mongoose.Types.ObjectId(mediaFileId) : undefined,
            mediaUrl,
            mimeType,
            fileName,
            isVoiceNote,
            attachmentUrl,
            mediaMetadata,
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

          if (conversation.assignedTo && conversation.assignedTo !== 'system') {
            socketService.emitToTelecaller(conversation.assignedTo, 'chat:new_message', {
              conversationId: conversation._id,
              channel: 'facebook',
              brand: conversation.brand,
              brandName: conversation.brandName,
              message: savedMessage,
              participant: conversation.participant,
            });

            notificationService.sendNotificationToUser({
              employeeId: conversation.assignedTo,
              title: conversation.brandName ? `New Message - ${conversation.brandName}` : 'New Messenger Message',
              body: text || (media ? `[${messageType} attachment]` : 'You have a new message'),
              data: {
                type: 'chat',
                chatId: String(conversation._id),
                channel: 'facebook',
                brand: conversation.brand || '',
              },
            }).catch((err) => console.error('[ChatService] Push notification error:', err.message));
          }
        });
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

  const outboundSenderName = senderId || conversation.assignedTo || 'Agent';
  const attachmentUrl = media?.url || undefined;
  const mediaMetadata = media?.url
    ? {
        title: media.title,
        reelVideoId: media.reelVideoId,
        mimeType: media.mimeType,
        fileName: media.fileName,
        fileSize: media.fileSize,
      }
    : undefined;

  const isVoiceNote = Boolean(
    media?.isVoiceNote ||
    messageType === 'voice' ||
    (media?.mimeType && media.mimeType.startsWith('audio') && media.isVoiceNote)
  );

  const mediaFileId = media?.fileId && mongoose.Types.ObjectId.isValid(media.fileId)
    ? new mongoose.Types.ObjectId(media.fileId)
    : undefined;

  const caption = media?.caption || (text && media?.url ? text : undefined);

  // 1. Immediately create message in MongoDB
  const savedMessage = await Message.create({
    conversationId: conversation._id,
    messageId: initialMessageId,
    tempId: tempId || undefined,
    channel: conversation.channel,
    brand: conversation.brand,
    senderType: 'telecaller',
    senderId: senderId || conversation.assignedTo || 'system',
    senderName: outboundSenderName,
    messageType,
    text,
    caption,
    mediaFileId,
    mediaUrl: media?.url || undefined,
    mimeType: media?.mimeType || undefined,
    fileName: media?.fileName || undefined,
    isVoiceNote,
    attachmentUrl,
    mediaMetadata,
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
          brand: conversation.brand,
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

  if (assignedTo && assignedTo !== 'system') {
    notificationService.sendNotificationToUser({
      employeeId: assignedTo,
      title: 'Chat Assigned',
      body: `Chat with ${conversation.participant?.name || conversation.participant?.phone || 'Customer'} has been assigned to you`,
      data: {
        type: 'chat',
        chatId: String(conversation._id),
        channel: conversation.channel || '',
        brand: conversation.brand || '',
      },
    }).catch(() => {});
  }

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
  socialUserId,
  messageType = 'text',
  media,
  attachmentUrl,
  mediaMetadata,
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

  const resolvedAttachmentUrl = attachmentUrl || media?.url || undefined;
  const resolvedMediaMetadata = mediaMetadata || (media?.url ? {
    title: media.title,
    reelVideoId: media.reelVideoId,
    mimeType: media.mimeType,
    fileName: media.fileName,
    fileSize: media.fileSize,
  } : undefined);

  const isVoiceNote = Boolean(
    media?.isVoiceNote ||
    messageType === 'voice' ||
    (resolvedMediaMetadata?.mimeType && resolvedMediaMetadata.mimeType.startsWith('audio') && media?.isVoiceNote)
  );

  const mediaFileId = media?.fileId && mongoose.Types.ObjectId.isValid(media.fileId)
    ? new mongoose.Types.ObjectId(media.fileId)
    : undefined;

  const caption = media?.caption || (text && resolvedAttachmentUrl ? text : undefined);

  const messageId = `sim_msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const savedMessage = await Message.create({
    conversationId: conversation._id,
    messageId,
    channel,
    brand: brandKey,
    senderType: 'customer',
    senderId: channel === 'whatsapp' ? normalizedPhone : userId,
    senderName: customerName,
    messageType,
    text,
    caption,
    mediaFileId,
    mediaUrl: resolvedAttachmentUrl,
    mimeType: resolvedMediaMetadata?.mimeType,
    fileName: resolvedMediaMetadata?.fileName,
    isVoiceNote,
    attachmentUrl: resolvedAttachmentUrl,
    mediaMetadata: resolvedMediaMetadata,
    media: media || (resolvedAttachmentUrl ? {
      url: resolvedAttachmentUrl,
      title: resolvedMediaMetadata?.title,
      reelVideoId: resolvedMediaMetadata?.reelVideoId,
      mimeType: resolvedMediaMetadata?.mimeType,
      fileName: resolvedMediaMetadata?.fileName,
      fileSize: resolvedMediaMetadata?.fileSize,
    } : undefined),
    status: 'delivered',
    timestamp: new Date(),
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

  if (conversation.assignedTo && conversation.assignedTo !== 'system') {
    socketService.emitToTelecaller(conversation.assignedTo, 'chat:new_message', {
      conversationId: conversation._id,
      channel,
      brand: brandKey,
      brandName,
      message: savedMessage,
      participant: conversation.participant,
    });

    notificationService.sendNotificationToUser({
      employeeId: conversation.assignedTo,
      title: brandName ? `New Message - ${brandName}` : 'New Message',
      body: text || (resolvedAttachmentUrl ? `[${messageType} attachment]` : 'You have a new message'),
      data: {
        type: 'chat',
        chatId: String(conversation._id),
        channel,
        brand: brandKey,
      },
    }).catch((err) => console.error('[ChatService] Simulation push notification error:', err.message));
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

          notificationService.sendNotificationToUser({
            employeeId: assignedTo,
            title: conversation.brandName ? `New Message - ${conversation.brandName}` : 'New Message',
            body: conversation.lastMessage.text || 'You have an unread message',
            data: {
              type: 'chat',
              chatId: String(conversation._id),
              channel: conversation.channel || '',
              brand: conversation.brand || '',
            },
          }).catch(() => {});
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
