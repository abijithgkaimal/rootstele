const LeadMaster = require('../models/LeadMaster');
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

const getFollowupLeadById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid lead ID');
  }

  const lead = await LeadMaster.findOne({ _id: id, leadStatus: 'followup' }).lean();

  if (!lead) {
    throw new ApiError(404, 'Followup lead not found');
  }

  return success(res, {
    id: lead._id,
    customerName: lead.customerName || lead.name || null,
    phone: lead.phone || lead.phoneNo || null,
    store: lead.store || null,
    remarks: lead.remarks || null,
    subCategory: lead.subCategory || null,
    functionDate: lead.functionDate ? new Date(lead.functionDate).toISOString()
      : lead.bookingDate ? new Date(lead.bookingDate).toISOString()
      : null,
    closeAction: lead.closeAction || null,
    followupDate: lead.followupDate ? new Date(lead.followupDate).toISOString() : null,
    leadtype: lead.leadtype || null,
    leadStatus: lead.leadStatus,
    callDuration: lead.callDuration || null,
    updatedAt: lead.updatedAt ? new Date(lead.updatedAt).toISOString() : null,
  });
});

const getComplaintLeadById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid lead ID');
  }

  const lead = await LeadMaster.findOne({ _id: id, leadStatus: 'complaint' }).lean();

  if (!lead) {
    throw new ApiError(404, 'Complaint lead not found');
  }

  return success(res, {
    id: lead._id,
    customerName: lead.customerName || lead.name || null,
    leadType: lead.leadtype || null,
    phone: lead.phone || lead.phoneNo || null,
    store: lead.store || null,
    functionDate: lead.functionDate ? new Date(lead.functionDate).toISOString()
      : lead.bookingDate ? new Date(lead.bookingDate).toISOString()
      : null,
    subCategory: lead.subCategory || null,
    remarks: lead.remarks || null,
    leadStatus: lead.leadStatus,
    updatedAt: lead.updatedAt ? new Date(lead.updatedAt).toISOString() : null,
  });
});

module.exports = { getFollowups, updateFollowup, getComplaints, getFollowupLeadById, getComplaintLeadById };
