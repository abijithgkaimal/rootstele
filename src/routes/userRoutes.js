const express = require('express');
const { body } = require('express-validator');
const userController = require('../controllers/userController');
const authMiddleware = require('../middlewares/authMiddleware');
const validateRequest = require('../middlewares/validateRequest');

const router = express.Router();

// Register/update FCM device token
router.post(
  ['/users/fcm-token', '/user/fcm-token', '/auth/fcm-token'],
  authMiddleware,
  [
    body('fcmToken')
      .optional()
      .isString()
      .trim()
      .withMessage('fcmToken must be a string'),
    body('token')
      .optional()
      .isString()
      .trim()
      .withMessage('token must be a string'),
  ],
  validateRequest,
  userController.saveFcmToken
);

// Delete/unregister FCM device token
router.delete(
  ['/users/fcm-token', '/user/fcm-token', '/auth/fcm-token'],
  authMiddleware,
  userController.deleteFcmToken
);

// Check FCM status
router.get(
  ['/users/fcm-token/status', '/user/fcm-token/status'],
  authMiddleware,
  userController.getFcmTokenStatus
);

// Test FCM push notification
router.post(
  ['/users/test-notification', '/user/test-notification'],
  authMiddleware,
  userController.sendTestNotification
);

module.exports = router;
