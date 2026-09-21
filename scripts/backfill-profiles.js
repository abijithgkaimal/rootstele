require('dotenv').config();
const mongoose = require('mongoose');
const env = require('../src/config/env');
const Conversation = require('../src/models/Conversation');
const Message = require('../src/models/Message');
const metaProfileService = require('../src/services/metaProfileService');

async function backfill() {
  console.log('--- Starting Meta Profile Backfill for Existing Conversations ---');

  const mongoUri = env.mongoUri || process.env.MONGODB_URI || 'mongodb://localhost:27017/telecaller';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  // Find conversations that have placeholder names
  const placeholderConversations = await Conversation.find({
    channel: { $in: ['instagram', 'facebook'] },
    $or: [
      { 'participant.name': { $regex: /^Instagram User/i } },
      { 'participant.name': { $regex: /^Facebook User/i } },
      { 'participant.name': null },
      { 'participant.name': '' },
      { 'participant.name': { $exists: false } },
    ],
  });

  console.log(`Found ${placeholderConversations.length} conversations with placeholder/missing names.`);

  let updatedCount = 0;
  let failedCount = 0;

  for (const conv of placeholderConversations) {
    const socialId = conv.participant?.socialUserId || conv.participant?.igUserId;
    if (!socialId) continue;

    try {
      if (conv.channel === 'instagram') {
        const profile = await metaProfileService.resolveInstagramProfile(socialId, {
          brand: conv.brand,
          pageId: conv.channelId,
        });

        if (profile.name && !profile.name.startsWith('Instagram User')) {
          conv.participant = conv.participant || {};
          conv.participant.name = profile.name;
          if (profile.username) conv.participant.username = profile.username;
          if (profile.profilePic) conv.participant.profilePic = profile.profilePic;
          await conv.save();

          await Message.updateMany(
            { conversationId: conv._id, senderId: socialId, senderType: 'customer' },
            { $set: { senderName: profile.name } }
          );

          console.log(`✓ Updated Instagram conversation ${conv._id} [${socialId}] -> ${profile.name}`);
          updatedCount++;
        } else {
          console.log(`- Instagram user ${socialId} could not be resolved (using fallback)`);
          failedCount++;
        }
      } else if (conv.channel === 'facebook') {
        const profile = await metaProfileService.resolveFacebookProfile(socialId, {
          brand: conv.brand,
          pageId: conv.channelId,
        });

        if (profile.name && !profile.name.startsWith('Facebook User')) {
          conv.participant = conv.participant || {};
          conv.participant.name = profile.name;
          if (profile.profilePic) conv.participant.profilePic = profile.profilePic;
          await conv.save();

          await Message.updateMany(
            { conversationId: conv._id, senderId: socialId, senderType: 'customer' },
            { $set: { senderName: profile.name } }
          );

          console.log(`✓ Updated Facebook conversation ${conv._id} [${socialId}] -> ${profile.name}`);
          updatedCount++;
        } else {
          console.log(`- Facebook user ${socialId} could not be resolved (using fallback)`);
          failedCount++;
        }
      }
    } catch (err) {
      console.error(`Error updating conversation ${conv._id}:`, err.message);
      failedCount++;
    }
  }

  console.log(`\nBackfill complete! Updated: ${updatedCount}, Unresolved: ${failedCount}`);
  await mongoose.disconnect();
}

backfill().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
