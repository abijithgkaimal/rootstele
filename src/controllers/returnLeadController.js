const LeadMaster = require('../models/LeadMaster');
const statusResolver = require('../services/statusResolverService');
const customerService = require('../services/customerService');
const { success } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const mongoose = require('mongoose');
const pick = require('../utils/pick');
const leadService = require('../services/leadService');

const getReturnLeads = asyncHandler(async (req, res) => {
  const { page, limit, store, fromDate, toDate } = req.query;
  const result = await leadService.getNewLeads({
    leadtype: 'return',
    store,
    fromDate,
    toDate,
    page,
    limit,
  });

  return success(res, result);
});

const updateReturnLead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid lead ID');
  }

  const payload = { ...req.body };
  if (payload.noofFuctions !== undefined) {
    payload.noofFunctions = payload.noofFuctions;
    delete payload.noofFuctions;
  }

  const leadStatus = statusResolver.resolveReturnLeadStatus(payload);
  const update = pick(payload, [
    'service', 'callDuration', 'noofFunctions', 'noofAttires', 'competitor', 'rating',
    'remarks', 'markasComplaint', 'markasFollowup', 'followupDate',
  ]);
  update.updatedAt = new Date();
  update.leadStatus = leadStatus;
  update.updatedBy = req.user?.employeeId || req.user?.userId || req.user?.name || 'unknown';

  const lead = await LeadMaster.findOneAndUpdate(
    { _id: id, leadtype: 'return' },
    update,
    { new: true }
  );

  if (!lead) {
    throw new ApiError(404, 'Return lead not found');
  }

  customerService.upsertCustomerFromLead(lead).catch(() => {});
  return success(res, lead, 'Updated');
});

module.exports = { getReturnLeads, updateReturnLead };
