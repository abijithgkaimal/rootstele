const LeadMaster = require('../models/LeadMaster');
const User = require('../models/User');
const { buildDateFilter } = require('../utils/dateFilters');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/apiResponse');

const getDashboardStats = asyncHandler(async (req, res) => {
  const { dateFrom, dateTo, store } = req.query;
  const filter = {};
  
  // Use updatedAt for filtering as it tracks when the lead was finalized to 'completed'
  const dateFilter = buildDateFilter(dateFrom, dateTo, 'updatedAt');
  if (dateFilter) Object.assign(filter, dateFilter);
  if (store) filter.store = store;

  const stats = await LeadMaster.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalCalls: { $sum: 1 },
        totalDuration: { 
          $sum: { 
            $convert: { 
              input: "$callDuration", 
              to: "double", 
              onError: 0, 
              onNull: 0 
            } 
          } 
        },
        totalComplaints: {
          $sum: { $cond: [{ $eq: ["$leadStatus", "complaint"] }, 1, 0] }
        }
      }
    }
  ]);

  const result = stats[0] || {
    totalCalls: 0,
    totalDuration: 0,
    totalComplaints: 0
  };

  result.avgCallDuration = result.totalCalls > 0 ? result.totalDuration / result.totalCalls : 0;

  return success(res, result);
});

const getTelecallerSummary = asyncHandler(async (req, res) => {
  const { dateFrom, dateTo, store } = req.query;
  const filter = {};

  const dateFilter = buildDateFilter(dateFrom, dateTo, 'updatedAt');
  if (dateFilter) Object.assign(filter, dateFilter);
  if (store) filter.store = store;

  const summary = await LeadMaster.aggregate([
    { $match: filter },
    {
      $group: {
        _id: "$createdBy",
        totalCalls: { $sum: 1 },
        totalCallDuration: { 
          $sum: { 
            $convert: { 
              input: "$callDuration", 
              to: "double", 
              onError: 0, 
              onNull: 0 
            } 
          } 
        },
        totalComplaints: {
          $sum: { $cond: [{ $eq: ["$leadStatus", "complaint"] }, 1, 0] }
        },
        name: { $first: "$createdBy" } 
      }
    },
    { $sort: { totalCalls: -1 } },
    {
      $project: {
        _id: 0,
        telecaller: {
          name: "$_id",
          employeeId: "$_id"
        },
        totalCalls: 1,
        totalCallDuration: 1,
        totalComplaints: 1
      }
    }
  ]);

  return success(res, summary);
});

const getReports = asyncHandler(async (req, res) => {
  const { dateFrom, dateTo, store, leadType, telecallerId } = req.query;
  const filter = {};

  const dateFilter = buildDateFilter(dateFrom, dateTo, 'updatedAt');
  if (dateFilter) Object.assign(filter, dateFilter);
  if (store) filter.store = store;
  if (leadType) filter.leadtype = leadType;
  if (telecallerId) filter.createdBy = telecallerId;

  const leads = await LeadMaster.find(filter)
    .sort({ updatedAt: -1 }) // Sort by updatedAt as requested
    .limit(1000)
    .lean();

  return success(res, leads);
});

const getComplaintsPivot = asyncHandler(async (req, res) => {
  const { dateFrom, dateTo, store } = req.query;
  const filter = { leadStatus: 'complaint' };

  const dateFilter = buildDateFilter(dateFrom, dateTo, 'updatedAt');
  if (dateFilter) Object.assign(filter, dateFilter);
  if (store) filter.store = store;

  const pivotData = await LeadMaster.aggregate([
    { $match: filter },
    {
      $group: {
        _id: { store: "$store", category: "$subCategory" },
        count: { $sum: 1 }
      }
    }
  ]);

  const result = {};
  pivotData.forEach(item => {
    const s = item._id.store || 'Unknown';
    const c = item._id.category || 'General';
    if (!result[s]) result[s] = {};
    result[s][c] = item.count;
  });

  return res.json(result);
});

const getFilterOptions = asyncHandler(async (req, res) => {
  // Get unique stores from completed leads
  const stores = await LeadMaster.distinct('store', { leadStatus: 'completed' });
  
  // Get unique lead types from completed leads
  const leadTypes = await LeadMaster.distinct('leadtype', { leadStatus: 'completed' });
  
  // Get all telecallers from Users collection
  const telecallers = await User.find({ role: { $in: ['Telecaller', 'telecaller'] } })
    .select('employeeId name')
    .lean();
    
  return success(res, {
    stores: stores.filter(Boolean).sort(),
    leadTypes: leadTypes.filter(Boolean).sort(),
    telecallers: telecallers.map(t => ({
      id: t.employeeId,
      name: t.name || t.employeeId
    })).sort((a,b) => a.name.localeCompare(b.name))
  });
});

module.exports = {
  getDashboardStats,
  getTelecallerSummary,
  getReports,
  getComplaintsPivot,
  getFilterOptions
};
