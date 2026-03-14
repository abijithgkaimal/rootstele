const LeadMaster = require('../models/LeadMaster');
const statusResolver = require('../services/statusResolverService');
const { success } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const mongoose = require('mongoose');
const pick = require('../utils/pick');

const getReturnLeads = asyncHandler(async (req, res) => {
  const { page = 1, limit = 100, store } = req.query;
  const filter = { leadtype: 'return' };
  if (store) filter.store = store;
  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [leads, total] = await Promise.all([
    LeadMaster.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
    LeadMaster.countDocuments(filter),
  ]);

  return success(res, { leads, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
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
    'remarks', 'updatedBy', 'markasComplaint', 'markasFollowup', 'followupDate',
  ]);
  update.updatedAt = payload.updatedAt ? new Date(payload.updatedAt) : new Date();
  update.leadStatus = leadStatus;

  const lead = await LeadMaster.findOneAndUpdate(
    { _id: id, leadtype: 'return' },
    update,
    { new: true }
  );

  if (!lead) {
    throw new ApiError(404, 'Return lead not found');
  }

  return success(res, lead, 'Updated');
});

module.exports = { getReturnLeads, updateReturnLead };
