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
 * Gracefully logs warnings and falls back to allow webhook processing if signature is missing or mismatched.
 */
const verifySignature = (req) => {
  const appSecret = env.metaAppSecret || process.env.META_APP_SECRET;
  if (!appSecret) {
    return true; // Secret not configured, skip verification
  }

  const signatureHeader = req.headers['x-hub-signature-256'] || req.headers['x-hub-signature'];
  if (!signatureHeader) {
    console.warn('[MetaWebhook] Warning: X-Hub-Signature-256 header missing from incoming webhook. Allowing graceful bypass.');
    return true;
  }

  try {
    const rawBody = req.rawBody ? req.rawBody : Buffer.from(JSON.stringify(req.body || {}));
    const expectedSignature = `sha256=${crypto
      .createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex')}`;

    const sigBuffer = Buffer.from(signatureHeader);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (sigBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      return true;
    }

    console.warn('[MetaWebhook] Warning: Signature mismatch for incoming Meta webhook payload. Allowing graceful bypass for webhook delivery.');
    return true;
  } catch (err) {
    console.error('[MetaWebhook] Error verifying signature:', err.message);
    return true;
  }
};

/**
 * Handle incoming Meta webhook events (POST /api/webhooks/meta).
 */
const handleWebhook = async (req, res) => {
  // 1. Log full incoming Meta webhook event immediately on line 1 before any processing
  console.log('--- INCOMING META WEBHOOK RAW BODY ---', JSON.stringify(req.body, null, 2));

  try {
    const body = req.body || {};

    // Validate signature with graceful fallback/bypass
    verifySignature(req);

    // Immediately respond with 200 OK to acknowledge Meta event
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
    if (!res.headersSent) {
      res.status(200).send('EVENT_RECEIVED');
    }
  }
};

module.exports = {
  verifyWebhook,
  handleWebhook,
};
