const LeadMaster = require('../models/LeadMaster');
const statusResolver = require('./statusResolverService');
const customerService = require('./customerService');
const { buildDateFilter } = require('../utils/dateFilters');
const pick = require('../utils/pick');
const { normalize } = require('../utils/phoneNormalizer');
const { normalizeStore, buildStoreRegex } = require('../utils/storeNormalizer');

const createLead = async (payload) => {
  if (payload.leadtype === "lossofsale" && !payload.closingReason) {
    throw new Error("closingReason is required for lossofsale");
  }

  if (payload.leadtype === "justdial" && !payload.source) {
    payload.source = "manual";
  }

  const leadStatus = statusResolver.resolveManualLeadStatus(payload);
  const closingAction = payload.closingAction ?? payload.closingReason;
  const normalizedPhone = normalize(payload.phone || '');

  const lead = new LeadMaster({
    leadtype: payload.leadtype,
    leadStatus,
    phone: payload.phone,
    normalizedPhone: normalizedPhone || undefined,
    customerName: payload.customerName || payload.name,   // Keep in sync: prefer customerName, fallback to name
    name: payload.name || payload.customerName,           // Keep in sync: prefer name, fallback to customerName
    callStatus: payload.callStatus,
    store: normalizeStore(payload.store),
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
    updatedBy: payload.createdBy,
    createdAt: payload.createdAt ? new Date(payload.createdAt) : new Date(),
    source: 'manual',
  });

  const saved = await lead.save();
  if (normalizedPhone) customerService.upsertCustomerFromLead(saved).catch(() => {});
  return saved;
};

const getCompletedLeads = async (filters = {}, options = {}) => {
  const { fromDate, toDate, store, leadtype, page = 1, limit = 100, employeeId } = filters;
  
  const filter = { 
    leadStatus: 'completed',
    $or: [
      { updatedBy: { $regex: `^${employeeId}$`, $options: "i" } },
      { updatedBy: { $exists: false } }
    ]
  };

  // For completed leads, filter using updatedAt
  const dateFilter = buildDateFilter(fromDate, toDate, 'updatedAt');
  if (dateFilter) Object.assign(filter, dateFilter);
  if (store) filter.store = buildStoreRegex(store);
  const allowedTypes = ['return', 'booked', 'enquiry', 'bookingConfirmation', 'justdial', 'lossofsale'];
  if (leadtype && allowedTypes.includes(leadtype)) filter.leadtype = leadtype;

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const projection = 'createdAt store name customerName phone leadtype leadStatus functionDate subCategory closingAction remarks followupDate followupremarks updatedAt updatedBy callDuration followupcallDuration';

  const [leads, total] = await Promise.all([
    LeadMaster.find(filter).select(projection).sort({ updatedAt: -1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
    LeadMaster.countDocuments(filter),
  ]);

  const mappedLeads = leads.map(l => ({
    ...l,
    customerName: l.customerName || l.name,
    name: l.name || l.customerName,
    callDuration: l.callDuration || l.followupcallDuration
  }));

  return { leads: mappedLeads, total, page: parseInt(page, 10), limit: parseInt(limit, 10) };
};

const getFollowups = async (options = {}) => {
  const { page = 1, limit = 100, store, fromDate, toDate, employeeId } = options;
  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const projection = 'name customerName phone store functionDate subCategory closingAction remarks followupDate updatedBy updatedAt';

  const filter = { 
    leadStatus: 'followup',
    $or: [
      { updatedBy: { $regex: `^${employeeId}$`, $options: "i" } },
      { updatedBy: { $exists: false } }
    ]
  };
  
  if (store) filter.store = buildStoreRegex(store);

  const dateFilter = buildDateFilter(fromDate, toDate, 'followupDate');
  if (dateFilter) Object.assign(filter, dateFilter);

  const [leads, total] = await Promise.all([
    LeadMaster.find(filter).select(projection).sort({ followupDate: 1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
    LeadMaster.countDocuments(filter),
  ]);

  const mappedLeads = leads.map(l => ({
    ...l,
    customerName: l.customerName || l.name,
    name: l.name || l.customerName
  }));

  return { leads: mappedLeads, total, page: parseInt(page, 10), limit: parseInt(limit, 10) };
};

const getComplaints = async (options = {}) => {
  const { page = 1, limit = 100, store, fromDate, toDate, employeeId } = options;
  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const projection = 'name customerName phone store leadtype functionDate subCategory remarks updatedBy updatedAt followupDate';

  const filter = { 
    leadStatus: 'complaint',
    $or: [
      { updatedBy: { $regex: `^${employeeId}$`, $options: "i" } },
      { updatedBy: { $exists: false } }
    ]
  };
  
  if (store) filter.store = buildStoreRegex(store);

  // Use updatedAt for active complaints (leadStatus: 'complaint') as per user request
  const dateFilter = buildDateFilter(fromDate, toDate, 'updatedAt');
  if (dateFilter) Object.assign(filter, dateFilter);

  const [leads, total] = await Promise.all([
    LeadMaster.find(filter).select(projection).sort({ updatedAt: -1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
    LeadMaster.countDocuments(filter),
  ]);

  const mappedLeads = leads.map(l => ({
    ...l,
    customerName: l.customerName || l.name,
    name: l.name || l.customerName
  }));

  return { leads: mappedLeads, total, page: parseInt(page, 10), limit: parseInt(limit, 10) };
};

const getNewLeads = async (filters = {}) => {
  const { leadtype, store, fromDate, toDate, page = 1, limit = 100 } = filters;
  const filter = { leadStatus: 'new' };
  if (leadtype) filter.leadtype = leadtype;
  if (store) filter.store = buildStoreRegex(store);

  let dateField = 'createdAt';
  if (leadtype === 'return') dateField = 'returnDate';
  if (leadtype === 'bookingConfirmation') dateField = 'bookingDate';

  const dateFilter = buildDateFilter(fromDate, toDate, dateField);
  if (dateFilter) Object.assign(filter, dateFilter);

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const [leads, total] = await Promise.all([
    LeadMaster.find(filter).sort({ [dateField]: -1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
    LeadMaster.countDocuments(filter),
  ]);

  const mappedLeads = leads.map(l => ({
    ...l,
    customerName: l.customerName || l.name,
    name: l.name || l.customerName
  }));

  return { leads: mappedLeads, total, page: parseInt(page, 10), limit: parseInt(limit, 10) };
};


const updateFollowupById = async (id, payload, updatedBy) => {
  const update = pick(payload, ['followupclosingAction', 'followupremarks', 'followupcallDuration']);
  update.updatedAt = new Date();
  update.updatedBy = updatedBy || 'unknown';
  update.leadStatus = 'completed';

  const lead = await LeadMaster.findOneAndUpdate(
    { _id: id, leadStatus: 'followup' },
    update,
    { new: true }
  );
  if (lead) customerService.upsertCustomerFromLead(lead).catch(() => {});
  return lead;
};

const getPerformanceStats = async (filters = {}) => {
  const { fromDate, toDate, store, employeeId } = filters;
  const filter = {};

  if (store) filter.store = buildStoreRegex(store);
  if (employeeId) filter.updatedBy = employeeId;

  const dateFilter = buildDateFilter(fromDate, toDate, 'updatedAt');
  if (dateFilter) Object.assign(filter, dateFilter);

  filter.leadStatus = { $in: ['followup', 'complaint', 'completed'] };

  const performance = await LeadMaster.aggregate([
    { $match: filter },
    {
      $group: {
        _id: "$updatedBy",
        totalCalls: { $sum: 1 },
        followup: { $sum: { $cond: [{ $eq: ["$leadStatus", "followup"] }, 1, 0] } },
        complaint: { $sum: { $cond: [{ $eq: ["$leadStatus", "complaint"] }, 1, 0] } },
        completed: { $sum: { $cond: [{ $eq: ["$leadStatus", "completed"] }, 1, 0] } }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: 'employeeId',
        as: 'userInfo'
      }
    },
    {
      $project: {
        _id: 0,
        telecallerId: "$_id",
        name: { $ifNull: [{ $arrayElemAt: ["$userInfo.name", 0] }, "$_id"] },
        totalCalls: 1,
        followup: 1,
        complaint: 1,
        completed: 1
      }
    },
    { $sort: { totalCalls: -1 } }
  ]);

  return performance;
};

module.exports = {
  createLead,
  getCompletedLeads,
  getFollowups,
  getComplaints,
  getNewLeads,
  updateFollowupById,
  getPerformanceStats
};
