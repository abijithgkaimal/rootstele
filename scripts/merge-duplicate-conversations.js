require('dotenv').config();
const mongoose = require('mongoose');
const env = require('../src/config/env');
const Conversation = require('../src/models/Conversation');
const Message = require('../src/models/Message');

async function mergeDuplicates() {
  console.log('--- Starting Duplicate Conversation Merge Script ---');

  const mongoUri = env.mongoUri || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('MongoDB URI not found in environment');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB.');

  const allConversations = await Conversation.find({}).lean();
  console.log(`Total conversations found in database: ${allConversations.length}`);

  const groups = {};

  for (const conv of allConversations) {
    let key = '';
    const channel = conv.channel || 'whatsapp';
    const brand = conv.brand || 'general';

    if (channel === 'whatsapp') {
      const phone = conv.participant?.normalizedPhone || conv.participant?.phone || '';
      if (!phone) continue;
      key = `${channel}_${brand}_${phone}`;
    } else if (channel === 'instagram') {
      const socialId = conv.participant?.socialUserId || conv.participant?.igUserId || '';
      if (!socialId) continue;
      key = `${channel}_${brand}_${socialId}`;
    } else if (channel === 'facebook') {
      const psid = conv.participant?.socialUserId || conv.participant?.psid || '';
      if (!psid) continue;
      key = `${channel}_${brand}_${psid}`;
    }

    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(conv);
  }

  let mergedGroupsCount = 0;
  let deletedConversationsCount = 0;
  let migratedMessagesCount = 0;

  for (const [key, convList] of Object.entries(groups)) {
    if (convList.length <= 1) continue;

    mergedGroupsCount++;
    console.log(`\nProcessing duplicate group [${key}] with ${convList.length} conversations:`);

    // Fetch message counts for each conversation
    const convStats = [];
    for (const conv of convList) {
      const msgCount = await Message.countDocuments({ conversationId: conv._id });
      convStats.push({
        conv,
        msgCount,
        hasLead: !!conv.leadId,
        hasRealName: conv.participant?.name && !conv.participant.name.startsWith('Instagram User') && !conv.participant.name.startsWith('Facebook User'),
        assignedToReal: conv.assignedTo && conv.assignedTo !== 'system',
      });
      console.log(`  - Conv ID: ${conv._id} | Assigned: ${conv.assignedTo} | Name: ${conv.participant?.name} | Messages: ${msgCount} | LastActivity: ${conv.lastActivityAt}`);
    }

    // Sort to find the best primary conversation
    // Priority: most messages, has lead, has assigned telecaller, older creation
    convStats.sort((a, b) => {
      if (b.msgCount !== a.msgCount) return b.msgCount - a.msgCount;
      if (b.hasLead !== a.hasLead) return b.hasLead ? 1 : -1;
      if (b.assignedToReal !== a.assignedToReal) return b.assignedToReal ? 1 : -1;
      return new Date(a.conv.createdAt || 0) - new Date(b.conv.createdAt || 0);
    });

    const primaryStat = convStats[0];
    const primaryConvId = primaryStat.conv._id;
    const duplicateStats = convStats.slice(1);
    const duplicateIds = duplicateStats.map((s) => s.conv._id);

    console.log(`  => Selected Primary: ${primaryConvId}`);

    // Re-point all messages from duplicates to primary
    const updateResult = await Message.updateMany(
      { conversationId: { $in: duplicateIds } },
      { $set: { conversationId: primaryConvId } }
    );
    migratedMessagesCount += updateResult.modifiedCount;
    console.log(`  => Migrated ${updateResult.modifiedCount} messages to primary conversation ${primaryConvId}`);

    // Get complete details for primary conversation to update metadata
    const primaryDoc = await Conversation.findById(primaryConvId);
    if (primaryDoc) {
      // Inherit better participant details from duplicates if missing
      for (const dup of duplicateStats) {
        if (!primaryDoc.participant.name || primaryDoc.participant.name.startsWith('Instagram User') || primaryDoc.participant.name.startsWith('Facebook User')) {
          if (dup.conv.participant?.name && !dup.conv.participant.name.startsWith('Instagram User') && !dup.conv.participant.name.startsWith('Facebook User')) {
            primaryDoc.participant.name = dup.conv.participant.name;
          }
        }
        if (!primaryDoc.participant.username && dup.conv.participant?.username) {
          primaryDoc.participant.username = dup.conv.participant.username;
        }
        if (!primaryDoc.participant.profilePic && dup.conv.participant?.profilePic) {
          primaryDoc.participant.profilePic = dup.conv.participant.profilePic;
        }
        if ((!primaryDoc.assignedTo || primaryDoc.assignedTo === 'system') && dup.conv.assignedTo && dup.conv.assignedTo !== 'system') {
          primaryDoc.assignedTo = dup.conv.assignedTo;
        }
        if (!primaryDoc.leadId && dup.conv.leadId) {
          primaryDoc.leadId = dup.conv.leadId;
        }
      }

      // Recompute latest message from database
      const latestMsg = await Message.findOne({ conversationId: primaryConvId }).sort({ timestamp: -1 });
      if (latestMsg) {
        primaryDoc.lastMessage = {
          text: latestMsg.text,
          senderType: latestMsg.senderType,
          messageType: latestMsg.messageType,
          timestamp: latestMsg.timestamp,
        };
        primaryDoc.lastActivityAt = latestMsg.timestamp;
      }

      await primaryDoc.save();
    }

    // Delete the duplicate conversation documents
    const deleteResult = await Conversation.deleteMany({ _id: { $in: duplicateIds } });
    deletedConversationsCount += deleteResult.deletedCount;
    console.log(`  => Deleted ${deleteResult.deletedCount} duplicate conversation document(s)`);
  }

  console.log('\n================ MERGE SUMMARY ================');
  console.log(`Duplicate Groups Merged:    ${mergedGroupsCount}`);
  console.log(`Duplicate Documents Removed:${deletedConversationsCount}`);
  console.log(`Messages Re-pointed:        ${migratedMessagesCount}`);
  console.log('================================================\n');

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB.');
}

mergeDuplicates().catch((err) => {
  console.error('Merge error:', err);
  process.exit(1);
});
