const mongoose = require('mongoose');
const LeadMaster = require('../models/LeadMaster');
const leadService = require('../services/leadService');
const statusResolver = require('../services/statusResolverService');
const customerService = require('../services/customerService');
const { normalizeStore } = require('../utils/storeNormalizer');
const { success } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

const formatLeadDetail = (lead) => ({
  id: lead._id,
  customerName: lead.customerName || lead.name || '',
  name: lead.name || lead.customerName || '',
  phone: lead.phone || lead.normalizedPhone || '',
  store: lead.store || '',
  leadtype: lead.leadtype || '',
  leadStatus: lead.leadStatus || '',
  callStatus: lead.callStatus || '',
  callDuration: lead.callDuration || '',
  subCategory: lead.subCategory || '',
  itemCategory: lead.itemCategory || '',
  functionDate: lead.functionDate ? new Date(lead.functionDate).toISOString() : null,
  closingReason: lead.closingReason || '',
  closingAction: lead.closingAction || '',
  advanceAmount: lead.advanceAmount,
  totalAmount: lead.totalAmount,
  remarks: lead.remarks || '',
  brand: lead.brand || '',
  channel: lead.channel || '',
  source: lead.source || '',
  followupDate: lead.followupDate ? new Date(lead.followupDate).toISOString() : null,
  createdAt: lead.createdAt ? new Date(lead.createdAt).toISOString() : null,
  updatedAt: lead.updatedAt ? new Date(lead.updatedAt).toISOString() : null,
});

const updateLeadHelper = async (lead, payload, reqUser) => {
  const markasComplaint = payload.markasComplaint === true || payload.markasComplaint === 'true' || payload.mark_as_complaint === true || payload.mark_as_complaint === 'true';
  const markasFollowup = payload.markasFollowup === true || payload.markasFollowup === 'true' || payload.mark_as_followup === true || payload.mark_as_followup === 'true';
  const callStatus = payload.callStatus || payload.call_status;
  
  const leadStatus = statusResolver.resolveManualLeadStatus({
    callStatus,
    markasComplaint,
    markasFollowup
  });

  const rawCallDuration = payload.callDuration !== undefined ? payload.callDuration : (payload.call_duration !== undefined ? payload.call_duration : undefined);
  const durationStr = rawCallDuration !== undefined ? ((rawCallDuration === 0 || rawCallDuration === '0') ? '0' : String(rawCallDuration)) : undefined;

  const rawFollowupDate = payload.followupDate || payload.follow_up_date;
  const followupDate = rawFollowupDate ? new Date(rawFollowupDate) : null;

  const rawFunctionDate = payload.functionDate || payload.function_date;
  const functionDate = rawFunctionDate ? new Date(rawFunctionDate) : undefined;

  if (payload.customerName || payload.name) {
    lead.customerName = payload.customerName || payload.name;
    lead.name = payload.name || payload.customerName;
  }
  if (payload.phone) lead.phone = payload.phone;
  if (payload.store) lead.store = normalizeStore(payload.store);
  if (callStatus) lead.callStatus = callStatus;
  if (durationStr !== undefined) {
    lead.callDuration = durationStr;
    lead.followupcallDuration = durationStr;
  }
  if (payload.subCategory || payload.sub_category) lead.subCategory = payload.subCategory || payload.sub_category;
  if (payload.itemCategory || payload.item_category) lead.itemCategory = payload.itemCategory || payload.item_category;
  if (functionDate !== undefined) lead.functionDate = functionDate;
  if (payload.closingReason || payload.closing_reason || payload.close_reason) {
    lead.closingReason = payload.closingReason || payload.closing_reason || payload.close_reason;
  }
  if (payload.closingAction || payload.closing_action) {
    lead.closingAction = payload.closingAction || payload.closing_action;
  }
  if (payload.advanceAmount !== undefined) lead.advanceAmount = payload.advanceAmount;
  if (payload.totalAmount !== undefined) lead.totalAmount = payload.totalAmount;
  if (payload.remarks !== undefined) lead.remarks = payload.remarks;
  if (payload.leadtype) lead.leadtype = payload.leadtype;

  lead.markasComplaint = markasComplaint;
  lead.markasFollowup = markasFollowup;
  lead.followupDate = followupDate;
  lead.leadStatus = leadStatus;
  lead.updatedAt = new Date();
  lead.updatedBy = reqUser?.employeeId || reqUser?.userId || reqUser?.name || 'unknown';

  await lead.save();
  customerService.upsertCustomerFromLead(lead).catch(() => {});
  return lead;
};

// ── 1. Create New Manual Lead ──────────────────────────────────────────
const addLead = asyncHandler(async (req, res) => {
  const payload = {
    ...req.body,
    createdBy: req.user?.employeeId || req.user?.userId || req.user?.name || 'unknown',
  };
  const lead = await leadService.createLead(payload);
  return success(res, lead, 'Lead created', 201);
});

// ── 2. Completed Leads Report ──────────────────────────────────────────
const getCompletedLeads = asyncHandler(async (req, res) => {
  const filters = {
    fromDate: req.query.fromDate,
    toDate: req.query.toDate,
    store: req.query.store,
    leadtype: req.query.leadtype,
    page: req.query.page,
    limit: req.query.limit,
    employeeId: (req.user.employeeId || req.user.userId || '').toString(),
  };
  const result = await leadService.getCompletedLeads(filters);
  return success(res, result);
});

// ── 3. Performance Stats ──────────────────────────────────────────────
const getMyPerformance = asyncHandler(async (req, res) => {
  const employeeId = (req.user.employeeId || req.user.userId || '').toString();
  const filters = {
    fromDate: req.query.fromDate,
    toDate: req.query.toDate,
    employeeId: employeeId
  };

  const stats = await leadService.getPerformanceStats(filters);
  const result = stats[0] || {
    telecallerId: employeeId,
    name: req.user.name || employeeId,
    totalCalls: 0,
    followup: 0,
    complaint: 0,
    completed: 0
  };

  return success(res, result);
});

// ── 4. Enquiry Leads (New for recalling) ──────────────────────────────
const getEnquiryLeads = asyncHandler(async (req, res) => {
  const { page, limit, store, fromDate, toDate } = req.query;
  const result = await leadService.getNewLeads({
    leadtype: 'enquiry',
    store,
    fromDate,
    toDate,
    page,
    limit,
  });
  return success(res, result);
});

const getEnquiryLeadById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid lead ID');
  }

  const lead = await LeadMaster.findOne({ _id: id, leadtype: 'enquiry' }).lean();
  if (!lead) {
    throw new ApiError(404, 'Enquiry lead not found');
  }

  return success(res, formatLeadDetail(lead));
});

const updateEnquiryLead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid lead ID');
  }

  const lead = await LeadMaster.findOne({ _id: id, leadtype: 'enquiry' });
  if (!lead) {
    throw new ApiError(404, 'Enquiry lead not found');
  }

  const updated = await updateLeadHelper(lead, req.body, req.user);
  return success(res, updated, 'Enquiry lead updated successfully');
});

// ── 5. Loss of Sale Leads (New for recalling) ──────────────────────────
const getLossOfSaleLeads = asyncHandler(async (req, res) => {
  const { page, limit, store, fromDate, toDate } = req.query;
  const result = await leadService.getNewLeads({
    leadtype: 'lossofsale',
    store,
    fromDate,
    toDate,
    page,
    limit,
  });
  return success(res, result);
});

const getLossOfSaleLeadById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid lead ID');
  }

  const lead = await LeadMaster.findOne({ _id: id, leadtype: /lossofsale|loss of sale/i }).lean();
  if (!lead) {
    throw new ApiError(404, 'Loss of sale lead not found');
  }

  return success(res, formatLeadDetail(lead));
});

const updateLossOfSaleLead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid lead ID');
  }

  const lead = await LeadMaster.findOne({ _id: id, leadtype: /lossofsale|loss of sale/i });
  if (!lead) {
    throw new ApiError(404, 'Loss of sale lead not found');
  }

  const updated = await updateLeadHelper(lead, req.body, req.user);
  return success(res, updated, 'Loss of sale lead updated successfully');
});

// ── 6. Booked Leads (New for recalling) ────────────────────────────────
const getBookedLeads = asyncHandler(async (req, res) => {
  const { page, limit, store, fromDate, toDate } = req.query;
  const result = await leadService.getNewLeads({
    leadtype: 'booked',
    store,
    fromDate,
    toDate,
    page,
    limit,
  });
  return success(res, result);
});

const getBookedLeadById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid lead ID');
  }

  const lead = await LeadMaster.findOne({ _id: id, leadtype: 'booked' }).lean();
  if (!lead) {
    throw new ApiError(404, 'Booked lead not found');
  }

  return success(res, formatLeadDetail(lead));
});

const updateBookedLead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid lead ID');
  }

  const lead = await LeadMaster.findOne({ _id: id, leadtype: 'booked' });
  if (!lead) {
    throw new ApiError(404, 'Booked lead not found');
  }

  const updated = await updateLeadHelper(lead, req.body, req.user);
  return success(res, updated, 'Booked lead updated successfully');
});

// ── 7. Generic Single Lead Detail & Update by ID ───────────────────────
const getLeadById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid lead ID');
  }

  const lead = await LeadMaster.findById(id).lean();
  if (!lead) {
    throw new ApiError(404, 'Lead not found');
  }

  return success(res, formatLeadDetail(lead));
});

const updateLeadById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid lead ID');
  }

  const lead = await LeadMaster.findById(id);
  if (!lead) {
    throw new ApiError(404, 'Lead not found');
  }

  const updated = await updateLeadHelper(lead, req.body, req.user);
  return success(res, updated, 'Lead updated successfully');
});

module.exports = {
  addLead,
  getCompletedLeads,
  getMyPerformance,
  getEnquiryLeads,
  getEnquiryLeadById,
  updateEnquiryLead,
  getLossOfSaleLeads,
  getLossOfSaleLeadById,
  updateLossOfSaleLead,
  getBookedLeads,
  getBookedLeadById,
  updateBookedLead,
  getLeadById,
  updateLeadById
};
