const LeadMaster = require('../models/LeadMaster');
const statusResolver = require('../services/statusResolverService');
const customerService = require('../services/customerService');
const { success } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const mongoose = require('mongoose');
const pick = require('../utils/pick');
const leadService = require('../services/leadService');

const getBookingConfirmation = asyncHandler(async (req, res) => {
  const { page, limit, store, fromDate, toDate } = req.query;
  const result = await leadService.getNewLeads({
    leadtype: 'bookingConfirmation',
    store,
    fromDate,
    toDate,
    page,
    limit,
  });

  return success(res, result);
});

const updateBookingConfirmation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid lead ID');
  }

  const payload = { ...req.body };

  // Normalize case-insensitivity and snake_case fields from mobile app/frontend
  const callDuration = payload.callDuration !== undefined ? payload.callDuration : payload.call_duration;
  const billReceived = payload.billReceived !== undefined ? payload.billReceived : (payload.billrecieved !== undefined ? payload.billrecieved : payload.bill_received);
  const amountMismatch = payload.amountMismatch === true || payload.amountMismatch === 'true' || payload.amount_mismatch === true || payload.amount_mismatch === 'true';
  const markasComplaint = payload.markasComplaint === true || payload.markasComplaint === 'true' || payload.mark_as_complaint === true || payload.mark_as_complaint === 'true';
  const markasFollowup = payload.markasFollowup === true || payload.markasFollowup === 'true' || payload.mark_as_followup === true || payload.mark_as_followup === 'true';

  let followupDate = null;
  const rawFollowupDate = payload.followupDate || payload.follow_up_date;
  if (rawFollowupDate) {
    followupDate = new Date(rawFollowupDate);
  }

  const leadStatus = statusResolver.resolveBookingConfirmationStatus({
    markasComplaint,
    markasFollowup,
    billReceived,
    amountMismatch
  });

  const update = {
    service: payload.service,
    billReceived,
    amountMismatch,
    remarks: payload.remarks,
    markasComplaint,
    markasFollowup,
    followupDate,
  };

  if (callDuration !== undefined) {
    const durationStr = (callDuration === 0 || callDuration === '0') ? '0' : String(callDuration);
    update.callDuration = durationStr;
    update.followupcallDuration = durationStr;
  }

  update.updatedAt = new Date();
  update.leadStatus = leadStatus;
  update.updatedBy = req.user?.employeeId || req.user?.userId || req.user?.name || 'unknown';

  const lead = await LeadMaster.findOneAndUpdate(
    { _id: id, leadtype: 'bookingConfirmation' },
    update,
    { new: true }
  );

  if (!lead) {
    throw new ApiError(404, 'Booking confirmation lead not found');
  }

  customerService.upsertCustomerFromLead(lead).catch(() => {});
  return success(res, lead, 'Updated');
});

const getBookingLeadById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid lead ID');
  }

  const lead = await LeadMaster.findOne({ _id: id, leadtype: 'bookingConfirmation', leadStatus: 'new' }).lean();

  if (!lead) {
    throw new ApiError(404, 'Booking confirmation lead not found or already actioned');
  }

  return success(res, {
    id: lead._id,
    customerName: lead.customerName || lead.name || '',
    store: lead.store || '',
    phone: lead.phone || lead.phoneNo || '',
    attendedBy: lead.attendedBy || '',
    bookingDate: lead.bookingDate ? new Date(lead.bookingDate).toISOString() : null,
    pickupDate: lead.deliveryDate ? new Date(lead.deliveryDate).toISOString() : null,
    advanceAmount: lead.advanceAmount ?? 0,
    totalAmount: lead.totalAmount ?? 0,
    subCategory: lead.subCategory || '',
    category: lead.category || '',
    bookingNo: lead.bookingNo || '',
    leadStatus: lead.leadStatus || '',
    items: lead.items || [],
    remarks: lead.remarks || '',
  });
});

module.exports = { getBookingConfirmation, updateBookingConfirmation, getBookingLeadById };
