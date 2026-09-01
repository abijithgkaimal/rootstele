const express = require('express');
const chatController = require('../controllers/chatController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

// All chat routes are protected by telecaller JWT auth
router.use(authMiddleware);

router.get('/conversations', chatController.getConversations);
router.get('/conversations/:id/messages', chatController.getMessages);
router.post('/conversations/:id/messages', chatController.sendMessage);
router.post('/conversations/:id/read', chatController.markAsRead);
router.post('/conversations/:id/convert-lead', chatController.convertToLead);
router.post('/conversations/:id/transfer', chatController.transferConversation);
router.post('/simulate-inbound', chatController.simulateInbound);

module.exports = router;
