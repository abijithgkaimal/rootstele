const http = require('http');
const mongoose = require('mongoose');
const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = require('../app');
const connectDB = require('../src/config/database');
const Conversation = require('../src/models/Conversation');
const Message = require('../src/models/Message');
const gridfsService = require('../src/services/gridfsService');
const env = require('../src/config/env');

async function testHttpEndpoints() {
  console.log('=== Testing HTTP Media Endpoints (GridFS Streaming & Upload) ===\n');
  await connectDB();

  const server = http.createServer(app);
  const testPort = 3199;

  await new Promise((resolve) => server.listen(testPort, resolve));
  console.log(`Test server running on port ${testPort}`);

  const baseUrl = `http://localhost:${testPort}`;

  try {
    // 1. Upload a file directly to GridFS to test public streaming endpoint
    const sampleAudio = Buffer.from('RIFF$....WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00D\xac\x00\x00\x88X\x01\x00\x02\x00\x10\x00data\x00\x00\x00\x00HELLO_VOICE_NOTE_AUDIO_STREAM_DATA_TEST_1234567890');
    const uploaded = await gridfsService.uploadBuffer(sampleAudio, 'test_audio.wav', 'audio/wav', {
      isVoiceNote: true,
    });

    console.log('✔ Seeded test audio file in GridFS:', uploaded.fileId);

    // 2. Test GET /api/chat/media/:fileId without Range header (200 OK)
    const res200 = await axios.get(`${baseUrl}/api/chat/media/${uploaded.fileId}`, {
      responseType: 'arraybuffer',
    });

    console.log(`✔ GET /api/chat/media/${uploaded.fileId} -> Status ${res200.status}, Length: ${res200.data.length}, Content-Type: ${res200.headers['content-type']}, Accept-Ranges: ${res200.headers['accept-ranges']}`);
    if (res200.status !== 200 || res200.data.length !== sampleAudio.length) {
      throw new Error('Full download test failed');
    }

    // 3. Test GET /api/chat/media/:fileId with Range header (206 Partial Content)
    const res206 = await axios.get(`${baseUrl}/api/chat/media/${uploaded.fileId}`, {
      headers: { Range: 'bytes=0-19' },
      responseType: 'arraybuffer',
    });

    console.log(`✔ Range GET /api/chat/media/${uploaded.fileId} (bytes=0-19) -> Status ${res206.status}, Content-Range: ${res206.headers['content-range']}, Chunk Length: ${res206.data.length}`);
    if (res206.status !== 206 || res206.data.length !== 20) {
      throw new Error(`Range request test failed: expected 20 bytes, got ${res206.data.length}`);
    }

    // 4. Test POST /api/chat/conversations/:id/media with telecaller JWT
    const testConv = await Conversation.create({
      channel: 'whatsapp',
      brand: 'suitor_guy',
      brandName: 'Suitor Guy',
      channelId: '1343323682194803',
      participant: {
        phone: '919999911111',
        normalizedPhone: '9999911111',
        name: 'HTTP Test User',
      },
      assignedTo: 'EMP_HTTP_TEST',
      status: 'open',
    });

    const jwtSecret = env.jwtSecret || 'default-secret-change-me';
    const token = jwt.sign(
      { userId: 'EMP_HTTP_TEST', employeeId: 'EMP_HTTP_TEST', role: 'telecaller' },
      jwtSecret,
      { expiresIn: '1h' }
    );

    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', sampleAudio, {
      filename: 'sample_voice.wav',
      contentType: 'audio/wav',
    });
    form.append('caption', 'Voice Note sent by agent');
    form.append('isVoiceNote', 'true');
    form.append('messageType', 'audio');

    const uploadRes = await axios.post(`${baseUrl}/api/chat/conversations/${testConv._id}/media`, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${token}`,
      },
    });

    console.log('✔ POST /api/chat/conversations/:id/media -> Status:', uploadRes.status, 'Message:', {
      messageId: uploadRes.data?.data?.messageId,
      mediaUrl: uploadRes.data?.data?.mediaUrl,
      mediaFileId: uploadRes.data?.data?.mediaFileId,
      isVoiceNote: uploadRes.data?.data?.isVoiceNote,
      mimeType: uploadRes.data?.data?.mimeType,
    });

    if (uploadRes.status !== 201 || !uploadRes.data?.data?.mediaFileId) {
      throw new Error('Multipart upload endpoint failed');
    }

    // Cleanup
    await Message.deleteMany({ conversationId: testConv._id });
    await Conversation.deleteOne({ _id: testConv._id });
    await gridfsService.deleteFile(uploaded.fileId);
    if (uploadRes.data?.data?.mediaFileId) {
      await gridfsService.deleteFile(uploadRes.data.data.mediaFileId);
    }
    console.log('✔ Cleanup complete.');

    console.log('\n=============================================');
    console.log('🎉 ALL HTTP STREAMING & UPLOAD TESTS PASSED! 🎉');
    console.log('=============================================\n');
  } catch (err) {
    console.error('❌ HTTP test error:', err.response?.data || err.message);
    process.exitCode = 1;
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  }
}

testHttpEndpoints();
