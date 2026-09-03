const crypto = require('crypto');
const env = require('../config/env');
const chatService = require('../services/chatService');

/**
 * Verify Meta Webhook subscription (GET /api/webhooks/meta).
 */
const verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'] || req.query.hub_mode;
  const token = req.query['hub.verify_token'] || req.query.hub_verify_token;
  const challenge = req.query['hub.challenge'] || req.query.hub_challenge;

  const expectedToken =
    env.metaWebhookVerifyToken ||
    process.env.META_VERIFY_TOKEN ||
    process.env.META_WEBHOOK_VERIFY_TOKEN ||
    'telecaller_meta_verify_token_2026';

  if (mode === 'subscribe' && token === expectedToken) {
    console.log('[MetaWebhook] Webhook subscription verified successfully.');
    // Send challenge back as a plain text string with HTTP 200
    return res.status(200).send(challenge !== undefined ? String(challenge) : '');
  }

  console.warn(`[MetaWebhook] Verification failed. Mode: ${mode}, Token provided: ${token ? 'present' : 'missing'}`);
  return res.status(403).send('Forbidden');
};

/**
 * Verify HMAC-SHA256 signature if app secret is provided.
 */
const verifySignature = (req) => {
  if (!env.metaAppSecret) return true; // Skip if secret not configured

  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return false;

  const rawBody = JSON.stringify(req.body);
  const expectedSignature = `sha256=${crypto
    .createHmac('sha256', env.metaAppSecret)
    .update(rawBody)
    .digest('hex')}`;

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
};

/**
 * Handle incoming Meta webhook events (POST /api/webhooks/meta).
 */
const handleWebhook = async (req, res) => {
  // Log full incoming Meta webhook event for inspection
  console.log('--- INCOMING META WEBHOOK ---', JSON.stringify(req.body, null, 2));

  try {
    const body = req.body || {};

    // Validate signature if configured
    if (!verifySignature(req)) {
      console.warn('[MetaWebhook] Signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Immediately respond with 200 OK to prevent Meta webhook timeouts/retries
    res.status(200).send('EVENT_RECEIVED');

    // Asynchronously process events
    if (body.object === 'whatsapp_business_account') {
      await chatService.processInboundWhatsApp(body);
    } else if (body.object === 'instagram') {
      await chatService.processInboundInstagram(body);
    } else if (body.object === 'page') {
      await chatService.processInboundFacebook(body);
    } else {
      console.log(`[MetaWebhook] Received unhandled object type: ${body.object}`);
    }
  } catch (err) {
    console.error('[MetaWebhook] Error processing event:', err.message);
  }
};

module.exports = {
  verifyWebhook,
  handleWebhook,
};
