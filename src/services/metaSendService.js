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
 * Send an outbound message to an Instagram user via Meta Graph API.
 * @param {object} params
 * @param {string} params.recipientId - Instagram Scoped User ID (IGSID)
 * @param {string} params.text - Message content
 * @param {object} [params.media] - { url, type }
 * @param {string} [params.accountId] - Brand-specific Instagram account ID
 */
const sendInstagramMessage = async ({ recipientId, text, media, accountId }) => {
  const token = env.metaAccessToken;
  const url = `${GRAPH_API_BASE}/me/messages`;

  if (!token) {
    console.warn('[MetaSendService] Meta access token not configured. Simulating Instagram send.');
    return {
      messageId: `mid.SIMULATED_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      simulated: true,
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
    recipient: { id: recipientId },
    message: messagePayload,
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    const msgId = response.data?.message_id || `mid.${Date.now()}`;
    return { messageId: msgId, data: response.data };
  } catch (err) {
    const errData = err.response?.data || err.message;
    console.error('[MetaSendService] Instagram API send error:', JSON.stringify(errData));
    throw new Error(`Instagram send failed: ${err.response?.data?.error?.message || err.message}`);
  }
};

/**
 * Send an outbound message to a Facebook Messenger user via Meta Graph API.
 * @param {object} params
 * @param {string} params.recipientId - Facebook Page-Scoped User ID (PSID)
 * @param {string} params.text - Message content
 * @param {object} [params.media] - { url, type }
 * @param {string} [params.pageId] - Brand-specific Facebook Page ID
 */
const sendFacebookMessage = async ({ recipientId, text, media, pageId }) => {
  const token = env.metaAccessToken;
  const targetId = pageId || 'me';
  const url = `${GRAPH_API_BASE}/${targetId}/messages`;

  if (!token) {
    console.warn('[MetaSendService] Meta access token not configured. Simulating Facebook send.');
    return {
      messageId: `m_mid.SIMULATED_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      simulated: true,
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
    recipient: { id: recipientId },
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
    return { messageId: msgId, data: response.data };
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

module.exports = {
  sendWhatsAppMessage,
  sendInstagramMessage,
  sendFacebookMessage,
  markWhatsAppAsRead,
};
