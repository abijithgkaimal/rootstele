const mongoose = require('mongoose');
require('dotenv').config();
const connectDB = require('../src/config/database');
const gridfsService = require('../src/services/gridfsService');
const metaSendService = require('../src/services/metaSendService');
const chatService = require('../src/services/chatService');
const Message = require('../src/models/Message');
const Conversation = require('../src/models/Conversation');

async function runTests() {
  console.log('=== Starting Omni-Channel GridFS Media Verification ===\n');

  try {
    await connectDB();
    console.log('✔ Connected to MongoDB');

    // ─── TEST 1: GridFS Buffer Upload ───
    const sampleVoiceBuffer = Buffer.from('OggS\x00\x02\x00\x00\x00\x00\x00\x00\x00\x00SAMPLE_OPUS_VOICE_NOTE_BINARY_STREAM_TEST_DATA');
    const uploadRes = await gridfsService.uploadBuffer(
      sampleVoiceBuffer,
      'voice_note_test.ogg',
      'audio/ogg',
      {
        channel: 'whatsapp',
        brand: 'suitor_guy',
        isVoiceNote: true,
      }
    );

    console.log('✔ Test 1 - GridFS Upload Success:', uploadRes);
    if (!uploadRes.fileId || uploadRes.length !== sampleVoiceBuffer.length) {
      throw new Error('Upload output verification failed');
    }

    // ─── TEST 2: GridFS Metadata Retrieval ───
    const metadata = await gridfsService.getFileMetadata(uploadRes.fileId);
    console.log('✔ Test 2 - GridFS Metadata Found:', {
      _id: metadata._id.toString(),
      filename: metadata.filename,
      contentType: metadata.contentType,
      length: metadata.length,
      isVoiceNote: metadata.metadata?.isVoiceNote,
    });
    if (!metadata || metadata.metadata?.isVoiceNote !== true) {
      throw new Error('Metadata verification failed');
    }

    // ─── TEST 3: Range Slicing / Partial Download Stream ───
    const rangeStream = gridfsService.downloadStream(uploadRes.fileId, { start: 0, end: 10 });
    const chunks = [];
    for await (const chunk of rangeStream) {
      chunks.push(chunk);
    }
    const sliced = Buffer.concat(chunks);
    console.log(`✔ Test 3 - Range Download Slicing (bytes 0-10): length=${sliced.length}, content="${sliced.toString('utf-8')}"`);
    if (sliced.length !== 11) {
      throw new Error(`Range chunk length mismatch: expected 11, got ${sliced.length}`);
    }

    // ─── TEST 4: Public Media URL Resolution ───
    const relUrl = `/api/chat/media/${uploadRes.fileId}`;
    const pubUrl = metaSendService.getPublicMediaUrl(relUrl);
    console.log(`✔ Test 4 - Public Media URL: "${relUrl}" -> "${pubUrl}"`);
    if (!pubUrl.startsWith('http://') && !pubUrl.startsWith('https://')) {
      throw new Error('Public URL resolution failed');
    }

    // ─── TEST 5: Message Schema Persistence with GridFS Fields ───
    const testConv = await Conversation.create({
      channel: 'whatsapp',
      brand: 'suitor_guy',
      brandName: 'Suitor Guy',
      channelId: '1343323682194803',
      participant: {
        phone: '919999988888',
        normalizedPhone: '9999988888',
        name: 'GridFS Test User',
      },
      assignedTo: 'EMP_TEST',
      status: 'open',
    });

    const testMsg = await Message.create({
      conversationId: testConv._id,
      messageId: `wamid.TEST_${Date.now()}`,
      channel: 'whatsapp',
      brand: 'suitor_guy',
      senderType: 'customer',
      senderId: '9999988888',
      senderName: 'GridFS Test User',
      messageType: 'audio',
      text: 'Here is my voice note query',
      caption: 'Voice message audio',
      mediaFileId: new mongoose.Types.ObjectId(uploadRes.fileId),
      mediaUrl: `/api/chat/media/${uploadRes.fileId}`,
      mimeType: 'audio/ogg',
      fileName: 'voice_note_test.ogg',
      isVoiceNote: true,
      status: 'delivered',
      timestamp: new Date(),
    });

    console.log('✔ Test 5 - Message Created with GridFS and Voice Note attributes:', {
      _id: testMsg._id.toString(),
      mediaFileId: testMsg.mediaFileId?.toString(),
      mediaUrl: testMsg.mediaUrl,
      isVoiceNote: testMsg.isVoiceNote,
      mimeType: testMsg.mimeType,
    });

    // ─── TEST 6: Simulated Inbound Voice Note / Media ───
    const simRes = await chatService.simulateInboundMessage({
      channel: 'whatsapp',
      brand: 'suitor_guy',
      phone: '9888877777',
      customerName: 'Voice Tester',
      messageType: 'audio',
      text: 'Simulated Voice Note',
      media: {
        fileId: uploadRes.fileId,
        url: `/api/chat/media/${uploadRes.fileId}`,
        mimeType: 'audio/ogg',
        fileName: 'voice_note.ogg',
        isVoiceNote: true,
      },
    });

    console.log('✔ Test 6 - Simulate Inbound Media Success:', {
      messageId: simRes.messageId,
      mediaUrl: simRes.mediaUrl,
      isVoiceNote: simRes.isVoiceNote,
    });

    // Clean up test records
    await Message.deleteMany({ conversationId: { $in: [testConv._id, simRes.conversationId] } });
    await Conversation.deleteMany({ _id: { $in: [testConv._id, simRes.conversationId] } });
    await gridfsService.deleteFile(uploadRes.fileId);
    console.log('✔ Cleaned up test database records');

    console.log('\n========================================');
    console.log('🎉 ALL GRIDFS OMNI-MEDIA TESTS PASSED! 🎉');
    console.log('========================================\n');
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

runTests();
