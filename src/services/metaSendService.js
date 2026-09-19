const axios = require('axios');
const env = require('../config/env');

const GRAPH_API_BASE = 'https://graph.facebook.com/v20.0';

/**
 * Send an outbound message to a WhatsApp user via Meta Cloud API.
 * @param {object} params
 * @param {string} params.to - Customer's phone number with country code (e.g. "919876543210")
 * @param {string} params.text - Text message body
 * @param {string} [params.type='text'] - 'text' | 'image' | 'video' | 'audio' | 'document' | 'template'
 * @param {object} [params.media] - { url, caption, fileName }
 * @param {object} [params.template] - { name, language, components }
 * @param {string} [params.phoneNumberId] - WhatsApp phone number ID (brand-specific)
 */
const sendWhatsAppMessage = async ({ to, text, type = 'text', media, template, phoneNumberId }) => {
  const phoneId = phoneNumberId || env.whatsappPhoneNumberId;
  const token = env.metaAccessToken;

  if (!phoneId || !token) {
    console.warn('[MetaSendService] WhatsApp credentials not configured. Simulating outbound send.');
    return {
      messageId: `wamid.SIMULATED_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      simulated: true,
    };
  }

  const cleanTo = String(to).replace(/\D/g, '');
  const url = `${GRAPH_API_BASE}/${phoneId}/messages`;

  let payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanTo,
  };

  if (type === 'text') {
    payload.type = 'text';
    payload.text = { preview_url: true, body: text };
  } else if (['image', 'video', 'audio', 'document'].includes(type) && media?.url) {
    payload.type = type;
    payload[type] = {
      link: media.url,
      caption: text || media.caption || undefined,
      filename: media.fileName || undefined,
    };
  } else if (type === 'template' && template) {
    payload.type = 'template';
    payload.template = {
      name: template.name,
      language: { code: template.language || 'en' },
      components: template.components || undefined,
    };
  } else {
    payload.type = 'text';
    payload.text = { body: text || '' };
  }

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    const msgId = response.data?.messages?.[0]?.id || `wamid.${Date.now()}`;
    return { messageId: msgId, data: response.data };
  } catch (err) {
    const errData = err.response?.data || err.message;
    console.error('[MetaSendService] WhatsApp API send error:', JSON.stringify(errData));
    throw new Error(`WhatsApp send failed: ${err.response?.data?.error?.message || err.message}`);
  }
};

/**
 * Helper to retrieve Page ID and Page Access Token for a given brand.
 * @param {string} brand - 'suitor_guy' | 'zorucci' | 'dapper_squad' | 'general'
 * @returns {{ pageId: string, accessToken: string, igAccountId?: string }}
 */
const getBrandCredentials = (brand) => {
  const normalized = (brand || '').toLowerCase().replace(/[\s_-]+/g, '_');

  if (normalized === 'zorucci') {
    return {
      pageId: env.fbPageIdZorucci || process.env.FB_PAGE_ID_ZORUCCI || '100490815752591',
      accessToken: env.fbPageAccessTokenZorucci || process.env.FB_PAGE_ACCESS_TOKEN_ZORUCCI || env.metaAccessToken,
      igAccountId: env.igAccountIdZorucci || process.env.IG_ACCOUNT_ID_ZORUCCI || '17841450188321270',
    };
  }

  if (normalized === 'dapper_squad' || normalized === 'dappersquad') {
    return {
      pageId: env.fbPageIdDapperSquad || process.env.FB_PAGE_ID_DAPPER_SQUAD,
      accessToken: env.fbPageAccessTokenDapperSquad || process.env.FB_PAGE_ACCESS_TOKEN_DAPPER_SQUAD || env.metaAccessToken,
      igAccountId: env.igAccountIdDapperSquad || process.env.IG_ACCOUNT_ID_DAPPER_SQUAD,
    };
  }

  // Default / Suitor Guy
  return {
    pageId: env.fbPageIdSuitorGuy || process.env.FB_PAGE_ID_SUITOR_GUY || '319976018496565',
    accessToken: env.fbPageAccessTokenSuitorGuy || process.env.FB_PAGE_ACCESS_TOKEN_SUITOR_GUY || env.metaAccessToken,
    igAccountId: env.igAccountIdSuitorGuy || process.env.IG_ACCOUNT_ID_SUITOR_GUY || '17841406791487873',
  };
};

/**
 * Send an outbound message to an Instagram user via Meta Graph API.
 * @param {object} params
 * @param {string} params.recipientId - Instagram Scoped User ID (IGSID)
 * @param {string} params.text - Message content
 * @param {object} [params.media] - { url, type }
 * @param {string} [params.brand] - Brand identifier (e.g. 'suitor_guy', 'zorucci', 'dapper_squad')
 * @param {string} [params.accountId] - Brand-specific Instagram account ID or Page ID
 * @param {string} [params.pageAccessToken] - Explicit token override
 */
const sendInstagramMessage = async ({ recipientId, text, media, brand, accountId, pageAccessToken }) => {
  const igUserId = recipientId ? String(recipientId).trim() : '';

  if (!igUserId) {
    throw new Error('[MetaSendService] Recipient ID (IGSID) is required for Instagram outbound message.');
  }

  if (/^EMP/i.test(igUserId) || igUserId.toLowerCase().includes('agent') || igUserId.toLowerCase().includes('telecaller')) {
    throw new Error(`[MetaSendService] Invalid recipient ID "${igUserId}". Cannot send Instagram message to an employee/agent ID.`);
  }

  const creds = getBrandCredentials(brand);
  const token = pageAccessToken || creds.accessToken || env.metaAccessToken;
  const targetPageId = creds.pageId || accountId || 'me';

  if (!token) {
    console.warn(`[MetaSendService] Instagram Page Access Token not configured for brand "${brand || 'default'}". Simulating Instagram send.`);
    return {
      messageId: `mid.SIMULATED_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      simulated: true,
      pageId: targetPageId,
    };
  }

  // Gracefully simulate if recipient or target is simulated
  if (igUserId.startsWith('sim_') || String(targetPageId).startsWith('SIM_')) {
    console.info(`[MetaSendService] Simulating Instagram send for test recipient ${igUserId}`);
    return {
      messageId: `mid.SIMULATED_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      simulated: true,
      pageId: targetPageId,
    };
  }

  let messagePayload = {};
  if (media?.url) {
    messagePayload = {
      attachment: {
        type: media.type || 'image',
        payload: { url: media.url },
      },
    };
  } else {
    messagePayload = { text: text || '' };
  }

  const payload = {
    recipient: { id: igUserId },
    message: messagePayload,
  };

  const url = `${GRAPH_API_BASE}/${targetPageId}/messages`;

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    const msgId = response.data?.message_id || response.data?.messages?.[0]?.id || `mid.${Date.now()}`;
    return { messageId: msgId, data: response.data, pageId: targetPageId };
  } catch (err) {
    const errData = err.response?.data || err.message;
    console.error('[MetaSendService] Instagram API send error:', JSON.stringify(errData));
    throw new Error(`Instagram send failed: ${err.response?.data?.error?.message || err.message}`);
  }
};

/**
 * Helper to dynamically resolve Facebook Page Access Token and Page ID.
 * @param {object} params
 * @param {string} [params.brand] - 'suitor_guy' | 'zorucci' | 'dapper_squad' | 'general'
 * @param {string} [params.pageId] - Facebook Page ID
 * @param {string} [params.pageAccessToken] - Explicit token override
 * @returns {{ token: string, pageId: string }}
 */
const resolveFacebookCredentials = ({ brand, pageId, pageAccessToken } = {}) => {
  if (pageAccessToken) {
    return { token: pageAccessToken, pageId: pageId || 'me' };
  }

  const creds = getBrandCredentials(brand);

  return {
    token: creds.accessToken || env.fbPageAccessToken || env.metaAccessToken,
    pageId: pageId || creds.pageId || 'me',
  };
};

/**
 * Send an outbound message to a Facebook Messenger user via Meta Graph API.
 * @param {object} params
 * @param {string} params.recipientId - Customer's Facebook Page-Scoped User ID (PSID)
 * @param {string} params.text - Message content
 * @param {object} [params.media] - { url, type }
 * @param {string} [params.pageId] - Brand-specific Facebook Page ID
 * @param {string} [params.brand] - Brand identifier (e.g. 'suitor_guy', 'zorucci', 'dapper_squad')
 * @param {string} [params.pageAccessToken] - Optional explicit Page Access Token
 */
const sendFacebookMessage = async ({ recipientId, text, media, pageId, brand, pageAccessToken }) => {
  const psid = recipientId ? String(recipientId).trim() : '';

  // 1. Recipient ID Validation: ensure it's a customer PSID and not a telecaller/agent ID (e.g. EMP538)
  if (!psid) {
    throw new Error('[MetaSendService] Recipient PSID is required for Facebook Messenger outbound message.');
  }

  if (/^EMP/i.test(psid) || psid.toLowerCase().includes('agent') || psid.toLowerCase().includes('telecaller')) {
    throw new Error(`[MetaSendService] Invalid recipient PSID "${psid}". Cannot send Facebook Messenger message to an employee/agent ID.`);
  }

  // 2. Brand & Access Token Resolution: dynamically select brand Page Access Token
  const { token, pageId: resolvedPageId } = resolveFacebookCredentials({ brand, pageId, pageAccessToken });
  const targetId = resolvedPageId || 'me';
  const url = `${GRAPH_API_BASE}/${targetId}/messages`;

  if (!token) {
    console.warn(`[MetaSendService] Facebook Page access token not configured for brand "${brand || 'default'}". Simulating Facebook send.`);
    return {
      messageId: `m_mid.SIMULATED_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      simulated: true,
      pageId: targetId,
    };
  }

  // Gracefully simulate if recipient or target is simulated
  if (psid.startsWith('sim_') || targetId.startsWith('SIM_')) {
    console.info(`[MetaSendService] Simulating Facebook send for test recipient ${psid}`);
    return {
      messageId: `m_mid.SIMULATED_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      simulated: true,
      pageId: targetId,
    };
  }

  let messagePayload = {};
  if (media?.url) {
    messagePayload = {
      attachment: {
        type: media.type || 'image',
        payload: { url: media.url },
      },
    };
  } else {
    messagePayload = { text: text || '' };
  }

  const payload = {
    recipient: { id: psid },
    message: messagePayload,
    messaging_type: 'RESPONSE',
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    const msgId = response.data?.message_id || `m_mid.${Date.now()}`;
    return { messageId: msgId, data: response.data, pageId: targetId };
  } catch (err) {
    const errData = err.response?.data || err.message;
    console.error('[MetaSendService] Facebook Messenger API send error:', JSON.stringify(errData));
    throw new Error(`Facebook Messenger send failed: ${err.response?.data?.error?.message || err.message}`);
  }
};

/**
 * Mark a WhatsApp message as read.
 */
const markWhatsAppAsRead = async ({ messageId, phoneNumberId }) => {
  const phoneId = phoneNumberId || env.whatsappPhoneNumberId;
  const token = env.metaAccessToken;
  if (!phoneId || !token || !messageId) return false;

  try {
    const url = `${GRAPH_API_BASE}/${phoneId}/messages`;
    await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
    return true;
  } catch (err) {
    console.warn('[MetaSendService] Failed to mark WhatsApp message as read:', err.message);
    return false;
  }
};

/**
 * Resolve direct CDN download URL for a WhatsApp Media ID via Meta Graph API.
 * @param {string} mediaId - WhatsApp media ID (e.g. "123456789")
 * @param {string} [customToken] - Explicit token override
 * @returns {Promise<{ url: string, mimeType?: string, fileSize?: number }>}
 */
const getWhatsAppMediaUrl = async (mediaId, customToken) => {
  const idStr = mediaId ? String(mediaId).trim() : '';
  if (!idStr) return { url: '' };

  // If already a full URL or simulated ID, return directly
  if (idStr.startsWith('http://') || idStr.startsWith('https://')) {
    return { url: idStr };
  }
  if (idStr.startsWith('sim_') || idStr.startsWith('test_')) {
    return { url: idStr };
  }

  const token = customToken || env.metaAccessToken || process.env.META_ACCESS_TOKEN || '';
  if (!token) {
    return { url: idStr };
  }

  try {
    const url = `https://graph.facebook.com/v26.0/${idStr}`;
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      timeout: 6000,
    });

    const data = response.data || {};
    return {
      url: data.url || idStr,
      mimeType: data.mime_type || undefined,
      fileSize: data.file_size || undefined,
    };
  } catch (err) {
    console.warn(`[MetaSendService] Failed to resolve WhatsApp media URL for ${idStr}: ${err.message}`);
    return { url: idStr };
  }
};

module.exports = {
  getBrandCredentials,
  resolveFacebookCredentials,
  sendWhatsAppMessage,
  sendInstagramMessage,
  sendFacebookMessage,
  markWhatsAppAsRead,
  getWhatsAppMediaUrl,
};
