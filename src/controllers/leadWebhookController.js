const LeadMaster = require('../models/LeadMaster');
const customerService = require('../services/customerService');
const { assignNewlySyncedLeads } = require('../utils/leadAssigner');
const { normalize } = require('../utils/phoneNormalizer');
const { normalizeStore } = require('../utils/storeNormalizer');
const socketService = require('../services/socketService');
const env = require('../config/env');

/**
 * Public Webhook for external lead ingestion (Web forms, Meta Lead Ads, Ads Integrations).
 * Protected by X-API-KEY header or query token.
 */
const ingestExternalLead = async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey || req.query.token;
    if (env.customWebhookApiKey && apiKey !== env.customWebhookApiKey) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or missing API key',
      });
    }

    const payload = req.body || {};
    const rawPhone = payload.phone || payload.mobile || payload.phoneNo || payload.phoneNumber || '';
    const normalizedPhone = normalize(rawPhone);

    if (!normalizedPhone) {
      return res.status(400).json({
        success: false,
        message: 'A valid phone number is required',
      });
    }

    const customerName = (payload.name || payload.customerName || payload.fullName || '').trim();
    const rawStore = payload.store || payload.location || payload.branch || '';
    const store = rawStore ? normalizeStore(rawStore) : undefined;
    const source = payload.source || 'webhook';
    const subCategory = payload.subCategory || payload.requirement || payload.category || undefined;
    const remarks = payload.remarks || payload.message || payload.comments || undefined;
    const rawFunctionDate = payload.functionDate || payload.eventDate;
    const functionDate = rawFunctionDate ? new Date(rawFunctionDate) : undefined;

    const newLead = await LeadMaster.create({
      leadtype: payload.leadtype || 'enquiry',
      leadStatus: 'new',
      phone: rawPhone,
      normalizedPhone,
      customerName: customerName || undefined,
      name: customerName || undefined,
      store,
      source: 'webhook',
      subCategory,
      remarks,
      functionDate,
      createdBy: 'system',
      updatedBy: 'system',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Assign to active logged-in telecaller
    await assignNewlySyncedLeads([newLead._id]);

    // Reload updated lead to retrieve assigned telecaller
    const updatedLead = await LeadMaster.findById(newLead._id).lean();
    const assignedEmpId = updatedLead?.updatedBy !== 'system' ? updatedLead?.updatedBy : null;

    // Trigger customer aggregate state recomputation
    customerService.recomputeCustomerState(normalizedPhone).catch((err) => {
      console.error('[LeadWebhook] Customer recomputation error:', err.message);
    });

    // Emit real-time WebSocket event to assigned telecaller
    if (assignedEmpId) {
      socketService.emitToTelecaller(assignedEmpId, 'lead:new', {
        id: updatedLead._id,
        phone: updatedLead.phone,
        customerName: updatedLead.customerName,
        store: updatedLead.store,
        leadtype: updatedLead.leadtype,
        source: updatedLead.source,
        createdAt: updatedLead.createdAt,
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Lead ingested and assigned successfully',
      data: {
        leadId: updatedLead._id,
        phone: updatedLead.phone,
        customerName: updatedLead.customerName,
        assignedTo: assignedEmpId || 'unassigned',
      },
    });
  } catch (err) {
    console.error('[LeadWebhook] Ingestion error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Internal server error during lead ingestion',
    });
  }
};

module.exports = {
  ingestExternalLead,
};
