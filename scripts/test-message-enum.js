const assert = require('assert');
const mongoose = require('mongoose');
const Message = require('../src/models/Message');
const Conversation = require('../src/models/Conversation');

async function runEnumTests() {
  console.log('--- Starting Message Enum & Schema Validation Tests ---');

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
    'template',
    'interactive',
  ];

  console.log('Test 1: Testing all valid messageType values against Message model');
  for (const type of validTypes) {
    const dummyMsg = new Message({
      conversationId: new mongoose.Types.ObjectId(),
      channel: 'instagram',
      brand: 'suitor_guy',
      senderType: 'customer',
      senderId: '12345678',
      messageType: type,
      text: `Test message with ${type}`,
      media: {
        url: 'https://instagram.com/reel/xyz123/',
        title: 'Cool reel',
        reelVideoId: 'xyz123',
      },
    });

    const err = dummyMsg.validateSync();
    assert.strictEqual(err, undefined, `Validation failed unexpectedly for valid messageType "${type}": ${err?.message}`);
  }
  console.log('✓ All 12 valid messageType enum values passed Message schema validation');

  console.log('Test 2: Testing Conversation lastMessage.messageType validation for ig_reel & attachments');
  for (const type of validTypes) {
    const dummyConv = new Conversation({
      channel: 'instagram',
      brand: 'suitor_guy',
      brandName: 'Suitor Guy',
      channelId: 'IG_ACCOUNT_123',
      participant: {
        socialUserId: '12345678',
        name: 'John Doe',
      },
      lastMessage: {
        text: 'Shared a reel',
        senderType: 'customer',
        messageType: type,
        timestamp: new Date(),
      },
    });

    const err = dummyConv.validateSync();
    assert.strictEqual(err, undefined, `Validation failed unexpectedly for Conversation lastMessage with messageType "${type}": ${err?.message}`);
  }
  console.log('✓ All 12 valid messageType enum values passed Conversation schema validation');

  console.log('Test 3: Testing invalid messageType triggers validation error');
  const invalidMsg = new Message({
    conversationId: new mongoose.Types.ObjectId(),
    channel: 'instagram',
    brand: 'suitor_guy',
    senderType: 'customer',
    senderId: '12345678',
    messageType: 'unsupported_type_xyz',
  });
  const invalidErr = invalidMsg.validateSync();
  assert(invalidErr !== undefined, 'Expected validation error for invalid messageType');
  assert(invalidErr.errors['messageType'], 'Expected messageType path error');
  console.log('✓ Invalid messageType correctly triggers validation failure');

  console.log('\n--- All Message Enum Tests Passed Successfully! ---');
}

runEnumTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
