const LeadMaster = require('../models/LeadMaster');
const { buildDateFilter } = require('../utils/dateFilters');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/apiResponse');

const getDashboardStats = asyncHandler(async (req, res) => {
  const { dateFrom, dateTo, store } = req.query;
  const filter = {};
  
  const dateFilter = buildDateFilter(dateFrom, dateTo, 'createdAt');
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

  const dateFilter = buildDateFilter(dateFrom, dateTo, 'createdAt');
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

  const dateFilter = buildDateFilter(dateFrom, dateTo, 'createdAt');
  if (dateFilter) Object.assign(filter, dateFilter);
  if (store) filter.store = store;
  if (leadType) filter.leadtype = leadType;
  if (telecallerId) filter.createdBy = telecallerId;

  const leads = await LeadMaster.find(filter)
    .sort({ createdAt: -1 })
    .limit(1000)
    .lean();

  return success(res, leads);
});

const getComplaintsPivot = asyncHandler(async (req, res) => {
  const { dateFrom, dateTo, store } = req.query;
  const filter = { leadStatus: 'complaint' };

  const dateFilter = buildDateFilter(dateFrom, dateTo, 'createdAt');
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

  // Transform to { storeName: { categoryName: count } }
  const result = {};
  pivotData.forEach(item => {
    const s = item._id.store || 'Unknown';
    const c = item._id.category || 'General';
    if (!result[s]) result[s] = {};
    result[s][c] = item.count;
  });

  return res.json(result); // Return raw object as expected by admin.js
});

module.exports = {
  getDashboardStats,
  getTelecallerSummary,
  getReports,
  getComplaintsPivot
};
