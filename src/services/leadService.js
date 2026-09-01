const LeadMaster = require('../models/LeadMaster');
const statusResolver = require('./statusResolverService');
const customerService = require('./customerService');
const { buildDateFilter } = require('../utils/dateFilters');
const pick = require('../utils/pick');
const { normalize } = require('../utils/phoneNormalizer');
const { normalizeStore, buildStoreRegex } = require('../utils/storeNormalizer');

const createLead = async (payload) => {
  if (payload.leadtype === "justdial" && !payload.source) {
    payload.source = "manual";
  }

  let rawCallDuration = payload.callDuration !== undefined 
    ? payload.callDuration 
    : (payload.call_duration !== undefined 
      ? payload.call_duration 
      : (payload.followupcallDuration !== undefined 
        ? payload.followupcallDuration 
        : (payload.followupcall_duration !== undefined 
          ? payload.followupcall_duration 
          : undefined)));

  let durationStr = undefined;
  if (rawCallDuration !== undefined) {
    durationStr = (rawCallDuration === 0 || rawCallDuration === '0') ? '0' : String(rawCallDuration);
  }

  // Normalize case-insensitivity and snake_case fields from mobile app/frontend
  const markasComplaint = payload.markasComplaint === true || payload.markasComplaint === 'true' || payload.mark_as_complaint === true || payload.mark_as_complaint === 'true';
  const markasFollowup = payload.markasFollowup === true || payload.markasFollowup === 'true' || payload.mark_as_followup === true || payload.mark_as_followup === 'true';
  const callStatus = payload.callStatus || payload.call_status;
  let customerName = payload.customerName || payload.name || payload.customer_name;
  let name = payload.name || payload.customerName || payload.customer_name;
  const normalizedPhone = normalize(payload.phone || '');

  // Auto-inherit customer name from existing Customer profile if payload lacks a name
  if ((!customerName || !String(customerName).trim()) && normalizedPhone) {
    const existingCust = await customerService.getCustomerByPhone(normalizedPhone);
    if (existingCust && existingCust.name && existingCust.name.trim()) {
      customerName = existingCust.name.trim();
      name = existingCust.name.trim();
    }
  }

  const leadStatus = statusResolver.resolveManualLeadStatus({
    callStatus,
    markasComplaint,
    markasFollowup
  });

  const closingReason = payload.closingReason || payload.closing_reason || payload.close_reason;
  const closingAction = payload.closingAction || payload.closing_action || closingReason;
  const subCategory = payload.subCategory || payload.sub_category;
  const itemCategory = payload.itemCategory || payload.item_category;

  const rawFunctionDate = payload.functionDate || payload.function_date;
  const functionDate = rawFunctionDate ? new Date(rawFunctionDate) : null;

  const rawFollowupDate = payload.followupDate || payload.follow_up_date;
  const followupDate = rawFollowupDate ? new Date(rawFollowupDate) : null;

  const lead = new LeadMaster({
    leadtype: payload.leadtype,
    leadStatus,
    phone: payload.phone,
    normalizedPhone: normalizedPhone || undefined,
    customerName,
    name,
    callStatus,
    store: normalizeStore(payload.store),
    functionDate,
    callDuration: durationStr,
    followupcallDuration: durationStr,
    subCategory,
    closingReason,
    closingAction,
    itemCategory,
    remarks: payload.remarks,
    markasComplaint,
    markasFollowup,
    followupDate,
    brand: payload.brand,
    channel: payload.channel,
    createdBy: payload.createdBy,
    updatedBy: payload.createdBy,
    createdAt: payload.createdAt ? new Date(payload.createdAt) : new Date(),
    source: payload.source || 'manual',
  });

  const saved = await lead.save();
  if (normalizedPhone) customerService.upsertCustomerFromLead(saved).catch(() => {});
  return saved;
};

const getCompletedLeads = async (filters = {}, options = {}) => {
  const { fromDate, toDate, store, leadtype, page = 1, limit = 100, employeeId } = filters;
  
  const filter = { 
    leadStatus: 'completed',
    updatedBy: { $regex: `^${employeeId}$`, $options: "i" }
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
    updatedBy: { $regex: `^${employeeId}$`, $options: "i" }
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
    updatedBy: { $regex: `^${employeeId}$`, $options: "i" }
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
  const followupclosingAction = payload.followupclosingAction !== undefined ? payload.followupclosingAction : (payload.followup_closing_action !== undefined ? payload.followup_closing_action : payload.followupclosing_action);
  const followupremarks = payload.followupremarks !== undefined ? payload.followupremarks : payload.followup_remarks;
  const followupcallDuration = payload.followupcallDuration !== undefined ? payload.followupcallDuration : (payload.followup_call_duration !== undefined ? payload.followup_call_duration : payload.followupcall_duration);

  const update = {
    followupclosingAction,
    followupremarks,
  };

  if (followupcallDuration !== undefined) {
    const durationStr = (followupcallDuration === 0 || followupcallDuration === '0') ? '0' : String(followupcallDuration);
    update.followupcallDuration = durationStr;
    update.callDuration = durationStr;
  }

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
  if (employeeId) filter.updatedBy = { $regex: `^${employeeId}$`, $options: 'i' };

  const dateFilter = buildDateFilter(fromDate, toDate, 'updatedAt');
  if (dateFilter) Object.assign(filter, dateFilter);

  filter.leadStatus = { $in: ['followup', 'complaint', 'completed'] };

  const performance = await LeadMaster.aggregate([
    { $match: filter },
    {
      $group: {
        _id: employeeId ? { $toLower: employeeId } : { $toLower: "$updatedBy" },
        totalCalls: { $sum: { $cond: [{ $eq: ["$leadStatus", "completed"] }, 1, 0] } },
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
        telecallerId: { $ifNull: [{ $arrayElemAt: ["$userInfo.employeeId", 0] }, "$_id"] },
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
