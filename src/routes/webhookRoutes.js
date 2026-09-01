const express = require('express');
const leadWebhookController = require('../controllers/leadWebhookController');
const metaWebhookController = require('../controllers/metaWebhookController');

const router = express.Router();

// ── Multi-Channel Lead Ingestion Webhooks (Web forms, Ads, Landing pages) ──
router.post('/lead-ingest', leadWebhookController.ingestExternalLead);

// ── Meta Graph API Webhooks (WhatsApp Cloud API & Instagram Messaging) ────
router.get('/meta', metaWebhookController.verifyWebhook);
router.post('/meta', metaWebhookController.handleWebhook);

module.exports = router;
