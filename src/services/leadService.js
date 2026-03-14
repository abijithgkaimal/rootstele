const LeadMaster = require('../models/LeadMaster');
const statusResolver = require('./statusResolverService');
const customerService = require('./customerService');
const { buildDateFilter } = require('../utils/dateFilters');
const pick = require('../utils/pick');
const { normalize } = require('../utils/phoneNormalizer');

const createLead = async (payload) => {
  const leadStatus = statusResolver.resolveManualLeadStatus(payload);
  const closingAction = payload.closingAction ?? payload.closingReason;
  const normalizedPhone = normalize(payload.phone || '');

  const lead = new LeadMaster({
    leadtype: payload.leadtype,
    leadStatus,
    phone: payload.phone,
    normalizedPhone: normalizedPhone || undefined,
    name: payload.name,
    callStatus: payload.callStatus,
    store: payload.store,
    functionDate: payload.functionDate ? new Date(payload.functionDate) : null,
    callDuration: payload.callDuration,
    subCategory: payload.subCategory,
    closingReason: payload.closingReason,
    closingAction,
    itemCategory: payload.itemCategory,
    remarks: payload.remarks,
    markasComplaint: !!payload.markasComplaint,
    markasFollowup: !!payload.markasFollowup,
    followupDate: payload.followupDate ? new Date(payload.followupDate) : null,
    createdBy: payload.createdBy,
    createdAt: payload.createdAt ? new Date(payload.createdAt) : new Date(),
    source: 'manual',
  });

  const saved = await lead.save();
  if (normalizedPhone) customerService.upsertCustomerFromLead(saved).catch(() => {});
  return saved;
};

const getCompletedLeads = async (filters = {}, options = {}) => {
  const { fromDate, toDate, store, leadtype, page = 1, limit = 100 } = filters;
  const filter = { leadStatus: 'completed' };

  // For completed leads, filter using updatedAt
  const dateFilter = buildDateFilter(fromDate, toDate, 'updatedAt');
  if (dateFilter) Object.assign(filter, dateFilter);
  if (store) filter.store = store;
  const allowedTypes = ['return', 'booked', 'enquiry', 'bookingConfirmation', 'justDial'];
  if (leadtype && allowedTypes.includes(leadtype)) filter.leadtype = leadtype;

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const projection = 'createdAt store name phone leadtype functionDate subCategory closingAction remarks followupDate followupremarks';

  const [leads, total] = await Promise.all([
    LeadMaster.find(filter).select(projection).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
    LeadMaster.countDocuments(filter),
  ]);

  return { leads, total, page: parseInt(page, 10), limit: parseInt(limit, 10) };
};

const getFollowups = async (options = {}) => {
  const { page = 1, limit = 100, store, dateFrom, dateTo } = options;
  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const projection = 'name phone store functionDate subCategory closingAction remarks followupDate updatedBy';

  const filter = { leadStatus: 'followup' };
  if (store) filter.store = store;

  // For followups, use followupDate; if not present, fall back to createdAt
  if (dateFrom || dateTo) {
    const startDate = dateFrom ? new Date(dateFrom) : null;
    const endDate = dateTo ? new Date(dateTo) : null;
    const range = {};
    if (startDate) range.$gte = startDate;
    if (endDate) range.$lte = endDate;

    filter.$or = [
      { followupDate: range },
      { createdAt: range },
    ];
  }

  const [leads, total] = await Promise.all([
    LeadMaster.find(filter).select(projection).sort({ followupDate: 1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
    LeadMaster.countDocuments(filter),
  ]);

  return { leads, total, page: parseInt(page, 10), limit: parseInt(limit, 10) };
};

const getComplaints = async (options = {}) => {
  const { page = 1, limit = 100, store, dateFrom, dateTo } = options;
  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const projection = 'name phone store leadtype functionDate subCategory remarks updatedBy updatedAt followupDate';

  const filter = { leadStatus: 'complaint' };
  if (store) filter.store = store;

  // For complaints, filter using createdAt
  if (dateFrom || dateTo) {
    const dateFilter = buildDateFilter(dateFrom, dateTo, 'createdAt');
    if (dateFilter) Object.assign(filter, dateFilter);
  }

  const [leads, total] = await Promise.all([
    LeadMaster.find(filter).select(projection).sort({ updatedAt: -1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
    LeadMaster.countDocuments(filter),
  ]);

  return { leads, total, page: parseInt(page, 10), limit: parseInt(limit, 10) };
};

const updateFollowupById = async (id, payload) => {
  const update = pick(payload, ['followupclosingAction', 'followupremarks', 'followupcallDuration', 'updatedBy']);
  update.updatedAt = payload.updatedAt ? new Date(payload.updatedAt) : new Date();
  update.leadStatus = 'completed';

  const lead = await LeadMaster.findOneAndUpdate(
    { _id: id, leadStatus: 'followup' },
    update,
    { new: true }
  );
  if (lead) customerService.upsertCustomerFromLead(lead).catch(() => {});
  return lead;
};

module.exports = {
  createLead,
  getCompletedLeads,
  getFollowups,
  getComplaints,
  updateFollowupById,
};
