const LeadMaster = require('../models/LeadMaster');
const statusResolver = require('../services/statusResolverService');
const { success } = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const mongoose = require('mongoose');
const pick = require('../utils/pick');

const getBookingConfirmation = asyncHandler(async (req, res) => {
  const { page = 1, limit = 100, store, fromDate, toDate } = req.query;
  const filter = { leadtype: 'bookingConfirmation' };

  if (store) filter.store = store;
  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) filter.createdAt.$gte = new Date(fromDate);
    if (toDate) filter.createdAt.$lte = new Date(toDate);
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const [leads, total] = await Promise.all([
    LeadMaster.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
    LeadMaster.countDocuments(filter),
  ]);

  return success(res, { leads, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
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

  return success(res, lead, 'Updated');
});

module.exports = { getBookingConfirmation, updateBookingConfirmation };
