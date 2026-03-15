const leadService = require('../services/leadService');
const { success } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const mongoose = require('mongoose');

const getFollowups = asyncHandler(async (req, res) => {
  const { page, limit, store, fromDate, toDate } = req.query;
  const result = await leadService.getFollowups({ page, limit, store, fromDate, toDate });
  return success(res, result);
});

const updateFollowup = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid lead ID');
  }

  const updatedBy = req.user?.employeeId || req.user?.userId || req.user?.name || 'unknown';
  const lead = await leadService.updateFollowupById(id, req.body, updatedBy);
  if (!lead) {
    throw new ApiError(404, 'Followup lead not found');
  }

  return success(res, lead, 'Followup updated');
});

const getComplaints = asyncHandler(async (req, res) => {
  const { page, limit, store, fromDate, toDate } = req.query;
  const result = await leadService.getComplaints({ page, limit, store, fromDate, toDate });
  return success(res, result);
});

module.exports = { getFollowups, updateFollowup, getComplaints };
