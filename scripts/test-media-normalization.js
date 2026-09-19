const assert = require('assert');
const mongoose = require('mongoose');
const Message = require('../src/models/Message');
const metaSendService = require('../src/services/metaSendService');

async function runNormalizationTests() {
  console.log('--- Starting Media Normalization Unit Tests ---');

  // Test 1: Instagram Reel Normalization
  console.log('Test 1: Instagram Reel Message Schema validation');
  const igReelMsg = new Message({
    conversationId: new mongoose.Types.ObjectId(),
    messageId: 'mid.IG_REEL_123',
    channel: 'instagram',
    brand: 'suitor_guy',
    senderType: 'customer',
    senderId: '17841450188321270',
    senderName: 'John Doe',
    messageType: 'ig_reel',
    text: '[Instagram Reel: Tuxedo Collection 2026]',
    attachmentUrl: 'https://www.instagram.com/reel/C8xyz123/',
    mediaMetadata: {
      title: 'Tuxedo Collection 2026',
      reelVideoId: 'C8xyz123',
      mimeType: 'video/mp4',
      fileName: 'ig_ig_reel_171000000',
    },
    status: 'delivered',
  });

  const igErr = igReelMsg.validateSync();
  assert.strictEqual(igErr, undefined, `IG Reel validation failed: ${igErr?.message}`);
  assert.strictEqual(igReelMsg.attachmentUrl, 'https://www.instagram.com/reel/C8xyz123/');
  assert.strictEqual(igReelMsg.mediaMetadata.reelVideoId, 'C8xyz123');
  assert.strictEqual(igReelMsg.senderName, 'John Doe');
  console.log('✓ Instagram Reel properly validates with attachmentUrl and mediaMetadata');

  // Test 2: WhatsApp Media Normalization
  console.log('Test 2: WhatsApp Image/Doc Message Schema validation');
  const waDocMsg = new Message({
    conversationId: new mongoose.Types.ObjectId(),
    messageId: 'wamid.HBgLMzkx...',
    channel: 'whatsapp',
    brand: 'zorucci',
    senderType: 'customer',
    senderId: '919876543210',
    senderName: 'Alex Smith',
    messageType: 'document',
    text: 'Rental Agreement',
    attachmentUrl: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=123456',
    mediaMetadata: {
      mimeType: 'application/pdf',
      fileName: 'rental_agreement.pdf',
      fileSize: 450230,
      title: 'Rental Agreement',
    },
    status: 'delivered',
  });

  const waErr = waDocMsg.validateSync();
  assert.strictEqual(waErr, undefined, `WhatsApp Doc validation failed: ${waErr?.message}`);
  assert.strictEqual(waDocMsg.attachmentUrl, 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=123456');
  assert.strictEqual(waDocMsg.mediaMetadata.fileSize, 450230);
  console.log('✓ WhatsApp Document validates with attachmentUrl and mediaMetadata');

  // Test 3: Facebook Messenger Share / Fallback Normalization
  console.log('Test 3: Facebook Share Message Schema validation');
  const fbShareMsg = new Message({
    conversationId: new mongoose.Types.ObjectId(),
    messageId: 'm_mid.FB_SHARE_123',
    channel: 'facebook',
    brand: 'dapper_squad',
    senderType: 'customer',
    senderId: 'fb_psid_9999',
    senderName: 'Sarah Connor',
    messageType: 'share',
    text: '[Shared Post: Dapper Blazer]',
    attachmentUrl: 'https://facebook.com/posts/123456',
    mediaMetadata: {
      title: 'Dapper Blazer',
      mimeType: 'image/jpeg',
      fileName: 'fb_share_171000000',
    },
    status: 'delivered',
  });

  const fbErr = fbShareMsg.validateSync();
  assert.strictEqual(fbErr, undefined, `FB Share validation failed: ${fbErr?.message}`);
  console.log('✓ Facebook Share properly validates');

  // Test 4: WhatsApp Media URL resolution helper
  console.log('Test 4: WhatsApp Media URL helper');
  const directUrl = await metaSendService.getWhatsAppMediaUrl('https://cdn.example.com/image.jpg');
  assert.strictEqual(directUrl.url, 'https://cdn.example.com/image.jpg');

  const simMedia = await metaSendService.getWhatsAppMediaUrl('sim_media_12345');
  assert.strictEqual(simMedia.url, 'sim_media_12345');
  console.log('✓ WhatsApp Media URL resolution helper handles direct & simulated media correctly');

  console.log('\n--- All Media Normalization Tests Passed Successfully! ---');
}

runNormalizationTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
