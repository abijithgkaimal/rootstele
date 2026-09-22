const express = require('express');
const multer = require('multer');
const chatController = require('../controllers/chatController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

// Configure multer memory storage for media uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max limit
  },
});

// ─── PUBLIC ROUTES (Meta servers & Mobile media players) ───
// Streaming media from GridFS (supports 206 Partial Content / range requests)
router.get('/media/:fileId', chatController.streamMedia);

// ─── AUTHENTICATED ROUTES (Telecaller / Admin only) ───
router.use(authMiddleware);

router.post('/send-brochure-template', chatController.sendBrochureTemplate);

router.get('/conversations', chatController.getConversations);
router.get('/conversations/:id', chatController.getConversationById);
router.get('/conversations/:id/messages', chatController.getMessages);
router.post('/conversations/:id/messages', chatController.sendMessage);
router.post('/conversations/:id/media', upload.single('file'), chatController.uploadMedia);
router.post('/conversations/:id/read', chatController.markAsRead);
router.post('/conversations/:id/convert-lead', chatController.convertToLead);
router.post('/conversations/:id/transfer', chatController.transferConversation);
router.post('/simulate-inbound', chatController.simulateInbound);

module.exports = router;
