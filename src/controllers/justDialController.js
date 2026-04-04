const LeadMaster = require('../models/LeadMaster');
const customerService = require('../services/customerService');
const { success } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const mongoose = require('mongoose');
const pick = require('../utils/pick');
const leadService = require('../services/leadService');

/**
 * GET /api/leads/justdial
 * List all new JustDial leads
 */
const getJustDialLeads = asyncHandler(async (req, res) => {
  const { page, limit, store, fromDate, toDate } = req.query;
  const result = await leadService.getNewLeads({
    leadtype: 'justdial',
    store,
    fromDate,
    toDate,
    page,
    limit,
  });

  return success(res, result);
});

/**
 * GET /api/leads/justdial/:id
 * Get detailed info of a single JustDial lead
 */
const getJustDialLeadById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid lead ID');
  }

  const lead = await LeadMaster.findOne({ _id: id, leadtype: 'justdial', leadStatus: 'new' }).lean();

  if (!lead) {
    throw new ApiError(404, 'JustDial lead not found or already actioned');
  }

  // Consistent format with bookingConfirmationController
  return success(res, {
    id: lead._id,
    customerName: lead.customerName || lead.name || '',
    phone: lead.phone || '',
    createdAt: lead.createdAt, // Original JustDial API timestamp
    updatedAt: lead.updatedAt,
    leadStatus: lead.leadStatus,
    leadtype: lead.leadtype,
    callStatus: lead.callStatus || '',
    remarks: lead.remarks || '',
    source: lead.source || ''
  });
});

/**
 * POST /api/leads/justdial/:id
 * Update JustDial lead after telecaller interaction
 */
const updateJustDialLead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid lead ID');
  }

  const payload = { ...req.body };

  // Determine new status based on telecaller flags
  // Matches logic in resolveManualLeadStatus/resolveReturnLeadStatus
  let leadStatus = 'completed';
  if (payload.markasComplaint === true || payload.markasComplaint === 'true') {
    leadStatus = 'complaint';
  } else if (payload.markasFollowup === true || payload.markasFollowup === 'true') {
    leadStatus = 'followup';
  }

  const update = pick(payload, [
    'remarks', 
    'markasComplaint', 
    'markasFollowup', 
    'followupDate', 
    'callDuration', 
    'service'
  ]);
  
  update.updatedAt = new Date();
  update.leadStatus = leadStatus;
  update.updatedBy = req.user?.employeeId || req.user?.userId || 'unknown';

  const lead = await LeadMaster.findOneAndUpdate(
    { _id: id, leadtype: 'justdial' },
    update,
    { new: true }
  );

  if (!lead) {
    throw new ApiError(404, 'JustDial lead not found');
  }

  // Optional: Recompute customer state
  customerService.recomputeCustomerState(lead.phone).catch(() => {});
  
  return success(res, lead, 'JustDial lead updated');
});

module.exports = {
  getJustDialLeads,
  getJustDialLeadById,
  updateJustDialLead
};
