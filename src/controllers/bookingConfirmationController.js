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
  if (payload.billrecieved !== undefined) {
    payload.billReceived = payload.billrecieved;
    delete payload.billrecieved;
  }

  const leadStatus = statusResolver.resolveBookingConfirmationStatus(payload);
  const update = pick(payload, ['service', 'callDuration', 'billReceived', 'amountMismatch', 'remarks', 'updatedBy']);
  update.updatedAt = payload.updatedAt ? new Date(payload.updatedAt) : new Date();
  update.leadStatus = leadStatus;

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

module.exports = { getBookingConfirmation, updateBookingConfirmation };
