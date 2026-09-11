const User = require('../models/User');
const { success, error } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const notificationService = require('../services/notificationService');

/**
 * Saves or updates the FCM token for the currently authenticated user.
 * POST /api/users/fcm-token
 */
const saveFcmToken = asyncHandler(async (req, res) => {
  const fcmToken = req.body.fcmToken || req.body.token;

  if (!fcmToken || typeof fcmToken !== 'string' || !fcmToken.trim()) {
    return error(res, 'A valid fcmToken is required', 400);
  }

  const cleanToken = fcmToken.trim();
  const rawEmpId = req.user?.employeeId || req.user?.userId;

  if (!rawEmpId) {
    return error(res, 'User identification not found in request context', 401);
  }

  const formattedEmpId = String(rawEmpId).replace(/\s+/g, '').toUpperCase();

  // 1. Remove this token from any other user who previously used this device
  await User.updateMany(
    {
      employeeId: { $ne: formattedEmpId },
      fcmToken: cleanToken,
    },
    {
      $set: { fcmToken: null },
    }
  );

  // 2. Update or upsert current user's record
  const updatedUser = await User.findOneAndUpdate(
    { employeeId: { $regex: new RegExp('^' + formattedEmpId + '$', 'i') } },
    {
      $set: {
        employeeId: formattedEmpId,
        name: req.user?.name || formattedEmpId,
        role: req.user?.role || 'Telecaller',
        store: req.user?.store || req.user?.Store || null,
        fcmToken: cleanToken,
        fcmTokenUpdatedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log(`[UserController] Updated FCM token for user ${formattedEmpId} (...${cleanToken.slice(-8)})`);

  return success(
    res,
    {
      employeeId: updatedUser.employeeId,
      hasFcmToken: !!updatedUser.fcmToken,
      updatedAt: updatedUser.fcmTokenUpdatedAt,
    },
    'FCM token registered successfully'
  );
});

/**
 * Deletes/unregisters the FCM token for the currently authenticated user (e.g. on logout).
 * DELETE /api/users/fcm-token
 */
const deleteFcmToken = asyncHandler(async (req, res) => {
  const rawEmpId = req.user?.employeeId || req.user?.userId;

  if (!rawEmpId) {
    return error(res, 'User identification not found in request context', 401);
  }

  const formattedEmpId = String(rawEmpId).replace(/\s+/g, '').toUpperCase();

  await User.findOneAndUpdate(
    { employeeId: { $regex: new RegExp('^' + formattedEmpId + '$', 'i') } },
    { $set: { fcmToken: null } }
  );

  console.log(`[UserController] Removed FCM token for user ${formattedEmpId}`);

  return success(res, { employeeId: formattedEmpId }, 'FCM token unregistered successfully');
});

/**
 * Gets FCM token status for the logged-in user.
 * GET /api/users/fcm-token/status
 */
const getFcmTokenStatus = asyncHandler(async (req, res) => {
  const rawEmpId = req.user?.employeeId || req.user?.userId;

  if (!rawEmpId) {
    return error(res, 'User identification not found in request context', 401);
  }

  const formattedEmpId = String(rawEmpId).replace(/\s+/g, '').toUpperCase();
  const user = await User.findOne({
    employeeId: { $regex: new RegExp('^' + formattedEmpId + '$', 'i') },
  }).select('employeeId name fcmToken fcmTokenUpdatedAt');

  return success(res, {
    employeeId: formattedEmpId,
    hasFcmToken: !!user?.fcmToken,
    fcmTokenUpdatedAt: user?.fcmTokenUpdatedAt || null,
  });
});

/**
 * Test endpoint to trigger a test push notification to the logged-in user or a test token.
 * POST /api/users/test-notification
 */
const sendTestNotification = asyncHandler(async (req, res) => {
  const rawEmpId = req.user?.employeeId || req.user?.userId;
  const targetToken = req.body.token || req.body.fcmToken;
  const title = req.body.title || 'Test Push Notification';
  const body = req.body.body || 'This is a test notification from the Telecaller backend!';
  const data = req.body.data || { type: 'test', timestamp: String(Date.now()) };

  let result;
  if (targetToken) {
    result = await notificationService.sendDirectNotification({
      token: targetToken,
      title,
      body,
      data,
    });
  } else if (rawEmpId) {
    result = await notificationService.sendNotificationToUser({
      employeeId: rawEmpId,
      title,
      body,
      data,
    });
  } else {
    return error(res, 'Provide a target token or log in with employee credentials', 400);
  }

  if (!result.success) {
    return res.status(result.error?.includes('not initialized') ? 503 : 400).json({
      success: false,
      message: result.error || 'Failed to send notification',
      code: result.code,
    });
  }

  return success(res, result, 'Test push notification sent successfully');
});

module.exports = {
  saveFcmToken,
  deleteFcmToken,
  getFcmTokenStatus,
  sendTestNotification,
};
