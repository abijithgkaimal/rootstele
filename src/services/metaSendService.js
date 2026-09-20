const https = require('https');
const axios = require('axios');
const env = require('../config/env');

const GRAPH_API_VERSION = 'v20.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// Persistent HTTPS Agent with TCP connection pooling & keep-alive
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  keepAliveMsecs: 30000,
});

const axiosClient = axios.create({
  httpsAgent,
  timeout: 10000,
});

/**
 * Resolves relative media URLs (e.g. /api/chat/media/:fileId) to a fully qualified public URL.
 * @param {string} url
 * @returns {string}
 */
const getPublicMediaUrl = (url) => {
  if (!url) return '';
  const urlStr = String(url).trim();
  if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
    return urlStr;
  }
  const baseUrl = process.env.APP_BASE_URL || env.appBaseUrl || 'https://rootstele-imrn.onrender.com';
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const cleanPath = urlStr.startsWith('/') ? urlStr : `/${urlStr}`;
  return `${cleanBase}${cleanPath}`;
};

/**
 * Dynamically resolves WhatsApp Cloud API token based on Phone Number ID or Brand.
 * Supports multiple Meta Business Portfolios (e.g. Zorucci vs Suitor Guy).
 * @param {object} params
 * @param {string} [params.phoneNumberId] - Meta WhatsApp Phone Number ID
 * @param {string} [params.brand] - Brand identifier ('zorucci', 'suitor_guy', 'dapper_squad')
 * @param {string} [params.customToken] - Explicit token override
 * @returns {string} Access token to use for authorization
 */
const resolveWhatsAppToken = ({ phoneNumberId, brand, customToken } = {}) => {
  if (customToken) return customToken;

  const phoneIdStr = phoneNumberId ? String(phoneNumberId).trim() : '';
  const normalizedBrand = (brand || '').toLowerCase().replace(/[\s_-]+/g, '_');

  // 1. Suitor Guy Portfolio (External Business Portfolio)
  if (
    phoneIdStr === String(env.waPhoneIdSuitorGuy || '1343323682194803') ||
    phoneIdStr === '1343323682194803' ||
    normalizedBrand === 'suitor_guy' ||
    normalizedBrand === 'suitorguy'
  ) {
    return (
      env.waAccessTokenSuitorGuy ||
      process.env.WA_ACCESS_TOKEN_SUITOR_GUY ||
      process.env.WHATSAPP_ACCESS_TOKEN_SUITOR_GUY ||
      process.env.WHATSAPP_TOKEN_SUITOR_GUY ||
      env.metaAccessToken ||
      ''
    );
  }

  // 2. Dapper Squad Portfolio
  if (
    (env.waPhoneIdDapperSquad && phoneIdStr === String(env.waPhoneIdDapperSquad)) ||
    normalizedBrand === 'dapper_squad' ||
    normalizedBrand === 'dappersquad'
  ) {
    return (
      env.waAccessTokenDapperSquad ||
      process.env.WA_ACCESS_TOKEN_DAPPER_SQUAD ||
      process.env.WHATSAPP_ACCESS_TOKEN_DAPPER_SQUAD ||
      process.env.WHATSAPP_TOKEN_DAPPER_SQUAD ||
      env.metaAccessToken ||
      ''
    );
  }

  // 3. Zorucci / Primary Portfolio (Default)
  return (
    env.waAccessTokenZorucci ||
    process.env.WA_ACCESS_TOKEN_ZORUCCI ||
    process.env.WHATSAPP_ACCESS_TOKEN_ZORUCCI ||
    process.env.WHATSAPP_TOKEN_ZORUCCI ||
    env.metaAccessToken ||
    process.env.META_ACCESS_TOKEN ||
    ''
  );
};

/**
 * Send an outbound message to a WhatsApp user via Meta Cloud API.
 * @param {object} params
 * @param {string} params.to - Customer's phone number with country code (e.g. "919876543210")
 * @param {string} params.text - Text message body
 * @param {string} [params.type='text'] - 'text' | 'image' | 'video' | 'audio' | 'document' | 'template'
 * @param {object} [params.media] - { url, caption, fileName }
 * @param {object} [params.template] - { name, language, components }
 * @param {string} [params.phoneNumberId] - WhatsApp phone number ID (brand-specific)
 * @param {string} [params.brand] - Brand identifier (e.g. 'zorucci', 'suitor_guy', 'dapper_squad')
 * @param {string} [params.customToken] - Explicit token override
 */
const sendWhatsAppMessage = async ({ to, text, type = 'text', media, template, phoneNumberId, brand, customToken }) => {
  const phoneId = phoneNumberId || env.whatsappPhoneNumberId || env.waPhoneIdZorucci || '1342362268957786';
  const token = resolveWhatsAppToken({ phoneNumberId: phoneId, brand, customToken });

  if (!phoneId || !token) {
    console.warn(`[MetaSendService] WhatsApp credentials not configured for Phone ID "${phoneId}" / Brand "${brand || 'default'}". Simulating outbound send.`);
    return {
      messageId: `wamid.SIMULATED_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      simulated: true,
      phoneNumberId: phoneId,
    };
  }

  const cleanTo = String(to).replace(/\D/g, '');
  const url = `${GRAPH_API_BASE}/${phoneId}/messages`;

  let payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanTo,
  };

  if (type === 'text' && !media?.url) {
    payload.type = 'text';
    payload.text = { preview_url: true, body: text };
  } else if (media?.url) {
    const publicMediaUrl = getPublicMediaUrl(media.url);
    const mediaType = (type === 'voice' ? 'audio' : (type === 'file' ? 'document' : type)) || 'image';
    if (['image', 'video', 'audio', 'document'].includes(mediaType)) {
      payload.type = mediaType;
      if (mediaType === 'audio') {
        // Meta WhatsApp Cloud API audio objects only accept link (no caption allowed)
        payload.audio = { link: publicMediaUrl };
      } else if (mediaType === 'document') {
        payload.document = {
          link: publicMediaUrl,
          filename: media.fileName || 'document.pdf',
          caption: text || media.caption || undefined,
        };
      } else if (mediaType === 'image') {
        payload.image = {
          link: publicMediaUrl,
          caption: text || media.caption || undefined,
        };
      } else if (mediaType === 'video') {
        payload.video = {
          link: publicMediaUrl,
          caption: text || media.caption || undefined,
        };
      }
    } else {
      payload.type = 'text';
      payload.text = { body: text || publicMediaUrl };
    }
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

  const tokenVar =
    phoneId === '1343323682194803' || String(brand).toLowerCase().includes('suitor')
      ? 'WA_ACCESS_TOKEN_SUITOR_GUY'
      : 'WA_ACCESS_TOKEN_ZORUCCI / META_ACCESS_TOKEN';

  console.log('[MetaSendService] Dispatching WhatsApp outbound:', {
    recipient: cleanTo,
    phoneNumberId: phoneId,
    brand: brand || 'default',
    tokenVariable: tokenVar,
    tokenPrefix: token ? token.slice(0, 15) + '...' : 'NONE',
    type,
    hasMedia: Boolean(media?.url),
  });

  try {
    const response = await axiosClient.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    const msgId = response.data?.messages?.[0]?.id || `wamid.${Date.now()}`;
    console.log(`[MetaSendService] WhatsApp message dispatched successfully! Message ID: ${msgId}`);
    return { messageId: msgId, data: response.data, phoneNumberId: phoneId };
  } catch (err) {
    const errData = err.response?.data || err.message;
    console.error(`[MetaSendService] WhatsApp API send error (Phone ID ${phoneId}):`, JSON.stringify(errData));
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
  let token = pageAccessToken;
  if (!token) {
    try {
      const metaProfileService = require('./metaProfileService');
      token = await metaProfileService.getPageAccessToken({
        brand,
        pageId: creds.pageId || accountId,
        igAccountId: creds.igAccountId,
      });
    } catch (_) {}
  }
  if (!token) {
    token = creds.accessToken || env.metaAccessToken;
  }
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
    const publicMediaUrl = getPublicMediaUrl(media.url);
    const rawType = (media.type || (media.mimeType && media.mimeType.startsWith('video') ? 'video' : (media.mimeType && media.mimeType.startsWith('audio') ? 'audio' : 'image'))).toLowerCase();
    const attType = ['image', 'video', 'audio', 'file'].includes(rawType) ? rawType : (rawType.includes('voice') ? 'audio' : 'image');
    messagePayload = {
      attachment: {
        type: attType,
        payload: { url: publicMediaUrl, is_reusable: true },
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
    const response = await axiosClient.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
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
 * @returns {Promise<{ token: string, pageId: string }>}
 */
const resolveFacebookCredentials = async ({ brand, pageId, pageAccessToken } = {}) => {
  if (pageAccessToken) {
    return { token: pageAccessToken, pageId: pageId || 'me' };
  }

  const creds = getBrandCredentials(brand);
  let discoveredToken = null;
  try {
    const metaProfileService = require('./metaProfileService');
    discoveredToken = await metaProfileService.getPageAccessToken({
      brand,
      pageId: pageId || creds.pageId,
    });
  } catch (_) {}

  return {
    token: discoveredToken || creds.accessToken || env.fbPageAccessToken || env.metaAccessToken,
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
  const { token, pageId: resolvedPageId } = await resolveFacebookCredentials({ brand, pageId, pageAccessToken });
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
    const publicMediaUrl = getPublicMediaUrl(media.url);
    const rawType = (media.type || (media.mimeType && media.mimeType.startsWith('video') ? 'video' : (media.mimeType && media.mimeType.startsWith('audio') ? 'audio' : 'image'))).toLowerCase();
    const attType = ['image', 'video', 'audio', 'file'].includes(rawType) ? rawType : (rawType.includes('voice') ? 'audio' : 'image');
    messagePayload = {
      attachment: {
        type: attType,
        payload: { url: publicMediaUrl, is_reusable: true },
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
    const response = await axiosClient.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
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
const markWhatsAppAsRead = async ({ messageId, phoneNumberId, brand }) => {
  const phoneId = phoneNumberId || env.whatsappPhoneNumberId;
  const token = resolveWhatsAppToken({ phoneNumberId: phoneId, brand });
  if (!phoneId || !token || !messageId) return false;

  try {
    const url = `${GRAPH_API_BASE}/${phoneId}/messages`;
    await axiosClient.post(
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
        timeout: 8000,
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
 * @param {object} [options] - { phoneNumberId, brand }
 * @returns {Promise<{ url: string, mimeType?: string, fileSize?: number }>}
 */
const getWhatsAppMediaUrl = async (mediaId, customToken, options = {}) => {
  const idStr = mediaId ? String(mediaId).trim() : '';
  if (!idStr) return { url: '' };

  // If already a full URL or simulated ID, return directly
  if (idStr.startsWith('http://') || idStr.startsWith('https://')) {
    return { url: idStr };
  }
  if (idStr.startsWith('sim_') || idStr.startsWith('test_')) {
    return { url: idStr };
  }

  const token = customToken || resolveWhatsAppToken(options) || env.metaAccessToken || process.env.META_ACCESS_TOKEN || '';
  if (!token) {
    return { url: idStr };
  }

  try {
    const url = `${GRAPH_API_BASE}/${idStr}`;
    const response = await axiosClient.get(url, {
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

/**
 * Download a binary stream for a WhatsApp media ID from Meta Graph API.
 * @param {string} mediaId
 * @param {object} [options] - { phoneNumberId, brand, customToken }
 * @returns {Promise<{ stream: import('stream').Readable, mimeType: string, fileSize?: number }>}
 */
const downloadWhatsAppMediaStream = async (mediaId, options = {}) => {
  const idStr = mediaId ? String(mediaId).trim() : '';
  if (!idStr) throw new Error('[MetaSendService] Media ID is required');

  const token = options.customToken || resolveWhatsAppToken(options) || env.metaAccessToken || process.env.META_ACCESS_TOKEN || '';
  if (!token) throw new Error('[MetaSendService] WhatsApp access token not available for media download');

  // 1. Fetch direct CDN url from Meta Graph
  const metaUrl = `${GRAPH_API_BASE}/${idStr}`;
  const metaRes = await axiosClient.get(metaUrl, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000,
  });

  const cdnUrl = metaRes.data?.url;
  if (!cdnUrl) throw new Error(`[MetaSendService] Failed to retrieve CDN media URL from Meta Graph for ${idStr}`);

  // 2. Download binary stream using Meta Bearer token
  const streamRes = await axios.get(cdnUrl, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'stream',
    timeout: 30000,
  });

  return {
    stream: streamRes.data,
    mimeType: metaRes.data?.mime_type || streamRes.headers['content-type'] || 'application/octet-stream',
    fileSize: metaRes.data?.file_size || Number(streamRes.headers['content-length']) || undefined,
  };
};

/**
 * Download a binary stream from an external CDN (e.g. Instagram / Facebook Messenger attachments).
 * @param {string} url
 * @param {object} [options]
 * @returns {Promise<{ stream: import('stream').Readable, mimeType: string, fileSize?: number }>}
 */
const downloadExternalMediaStream = async (url, options = {}) => {
  if (!url) throw new Error('[MetaSendService] Media URL is required');

  const streamRes = await axios.get(url, {
    responseType: 'stream',
    timeout: 30000,
    headers: options.headers || {},
  });

  return {
    stream: streamRes.data,
    mimeType: streamRes.headers['content-type'] || options.mimeType || 'application/octet-stream',
    fileSize: Number(streamRes.headers['content-length']) || undefined,
  };
};

module.exports = {
  getBrandCredentials,
  resolveFacebookCredentials,
  resolveWhatsAppToken,
  getPublicMediaUrl,
  sendWhatsAppMessage,
  sendInstagramMessage,
  sendFacebookMessage,
  markWhatsAppAsRead,
  getWhatsAppMediaUrl,
  downloadWhatsAppMediaStream,
  downloadExternalMediaStream,
};
