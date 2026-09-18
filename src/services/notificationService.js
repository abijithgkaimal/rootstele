const { admin, isInitialized, getMessaging } = require('../config/firebase');
const User = require('../models/User');

/**
 * Clean up string values for FCM data payload (FCM requires string-only data map).
 * @param {Object} dataObj
 * @returns {Record<string, string>}
 */
const sanitizeDataPayload = (dataObj = {}) => {
  const result = {};
  if (!dataObj || typeof dataObj !== 'object') return result;

  for (const [key, value] of Object.entries(dataObj)) {
    if (value !== undefined && value !== null) {
      if (typeof value === 'object') {
        try {
          result[key] = JSON.stringify(value);
        } catch {
          result[key] = String(value);
        }
      } else {
        result[key] = String(value);
      }
    }
  }
  return result;
};

/**
 * Sends a push notification directly to a given FCM device token.
 * @param {Object} params
 * @param {string} params.token - FCM device token
 * @param {string} params.title - Notification title
 * @param {string} params.body - Notification body
 * @param {Object} [params.data] - Custom key-value data payload
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
const sendDirectNotification = async ({ token, title, body, data = {} }) => {
  if (!token) {
    return { success: false, error: 'No FCM token provided' };
  }

  if (!isInitialized()) {
    console.warn('[NotificationService] Firebase Admin not initialized. Skipping push notification.');
    return { success: false, error: 'Firebase Admin not initialized' };
  }

  const messaging = getMessaging();
  if (!messaging) {
    return { success: false, error: 'Firebase Messaging instance unavailable' };
  }

  const cleanTitle = String(title || 'Notification');
  const cleanBody = String(body || '');

  // Ensure data payload includes title and body as well for background isolate compatibility
  const cleanData = sanitizeDataPayload({
    ...data,
    title: cleanTitle,
    body: cleanBody,
  });

  const message = {
    token,
    notification: {
      title: cleanTitle,
      body: cleanBody,
    },
    data: cleanData,
    android: {
      priority: 'high',
      notification: {
        title: cleanTitle,
        body: cleanBody,
        channelId: data?.channelId || 'high_importance_channel',
        priority: 'high',
        sound: 'default',
        defaultSound: true,
        defaultVibrateTimings: true,
        clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        visibility: 'public',
      },
    },
    apns: {
      headers: {
        'apns-priority': '10',
        'apns-push-type': 'alert',
      },
      payload: {
        aps: {
          alert: {
            title: cleanTitle,
            body: cleanBody,
          },
          sound: 'default',
          badge: 1,
          contentAvailable: true,
        },
      },
    },
  };

  try {
    const response = await messaging.send(message);
    console.log(`[NotificationService] Push notification sent successfully to token (...${token.slice(-8)}). MessageId: ${response}`);
    return { success: true, messageId: response };
  } catch (err) {
    console.error(`[NotificationService] Failed to send push notification to token (...${token.slice(-8)}):`, err.message);

    // If token is invalid or expired, remove it from the User record
    if (
      err.code === 'messaging/registration-token-not-registered' ||
      err.code === 'messaging/invalid-registration-token' ||
      err.code === 'messaging/invalid-argument'
    ) {
      console.log(`[NotificationService] Removing stale/invalid FCM token (...${token.slice(-8)}) from database.`);
      User.updateMany({ fcmToken: token }, { $set: { fcmToken: null } }).catch(() => {});
    }

    return { success: false, error: err.message, code: err.code };
  }
};

/**
 * Sends a push notification to a specific user by their employeeId.
 * @param {Object} params
 * @param {string} params.employeeId - Telecaller / User employeeId
 * @param {string} params.title - Notification title
 * @param {string} params.body - Notification body
 * @param {Object} [params.data] - Custom data payload
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
const sendNotificationToUser = async ({ employeeId, title, body, data = {} }) => {
  if (!employeeId || employeeId === 'system') {
    return { success: false, error: 'Invalid or system employeeId' };
  }

  try {
    const formattedEmpId = String(employeeId).replace(/\s+/g, '').toUpperCase();
    const user = await User.findOne({
      employeeId: { $regex: new RegExp('^' + formattedEmpId + '$', 'i') },
    }).select('employeeId name fcmToken active');

    if (!user) {
      console.log(`[NotificationService] User not found for employeeId=${employeeId}`);
      return { success: false, error: `User not found for employeeId=${employeeId}` };
    }

    if (!user.fcmToken) {
      console.log(`[NotificationService] No FCM token registered for employeeId=${user.employeeId}`);
      return { success: false, error: `No FCM token registered for ${user.employeeId}` };
    }

    return await sendDirectNotification({
      token: user.fcmToken,
      title,
      body,
      data,
    });
  } catch (err) {
    console.error(`[NotificationService] Error sending notification to user ${employeeId}:`, err.message);
    return { success: false, error: err.message };
  }
};

/**
 * Sends push notifications to multiple users.
 * @param {Object} params
 * @param {string[]} params.employeeIds - Array of employee IDs
 * @param {string} params.title
 * @param {string} params.body
 * @param {Object} [params.data]
 */
const sendNotificationToUsers = async ({ employeeIds = [], title, body, data = {} }) => {
  const results = await Promise.allSettled(
    employeeIds.map((empId) => sendNotificationToUser({ employeeId: empId, title, body, data }))
  );
  return results;
};

module.exports = {
  sendDirectNotification,
  sendNotificationToUser,
  sendNotificationToUsers,
  sanitizeDataPayload,
};
