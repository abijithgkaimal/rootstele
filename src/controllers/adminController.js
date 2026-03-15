const LeadMaster = require('../models/LeadMaster');
const User = require('../models/User');
const { buildDateFilter } = require('../utils/dateFilters');
const { buildStoreRegex } = require('../utils/storeNormalizer');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/apiResponse');

const getDashboardStats = asyncHandler(async (req, res) => {
  const { fromDate, toDate, store } = req.query;
  const filter = {};
  
  if (store && store !== 'All Stores') {
    filter.store = buildStoreRegex(store);
  }

  const dateFilter = buildDateFilter(fromDate, toDate, 'updatedAt');
  if (dateFilter) Object.assign(filter, dateFilter);

  // Consider only leads that have been handled (status changed from new)
  const stats = await LeadMaster.aggregate([
    { $match: { ...filter, leadStatus: { $in: ['completed', 'complaint'] } } },
    {
      $facet: {
        overall: [
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
        ],
        telecallerStats: [
          {
            $group: {
              _id: "$createdBy",
              calls: { $sum: 1 },
              duration: {
                $sum: { 
                  $convert: { 
                    input: "$callDuration", 
                    to: "double", 
                    onError: 0, 
                    onNull: 0 
                  } 
                } 
              },
              complaints: {
                $sum: { $cond: [{ $eq: ["$leadStatus", "complaint"] }, 1, 0] }
              }
            }
          },
          { $sort: { calls: -1 } },
          {
            $project: {
              _id: 0,
              name: "$_id",
              empId: "$_id",
              calls: 1,
              duration: 1,
              complaints: 1
            }
          }
        ]
      }
    }
  ]);

  const overall = stats[0]?.overall[0] || {
    totalCalls: 0,
    totalDuration: 0,
    totalComplaints: 0
  };

  const result = {
    totalCalls: overall.totalCalls,
    totalDuration: overall.totalDuration,
    avgDuration: overall.totalCalls > 0 ? overall.totalDuration / overall.totalCalls : 0,
    totalComplaints: overall.totalComplaints,
    telecallerStats: stats[0]?.telecallerStats || []
  };

  return success(res, result);
});

const getTelecallerSummary = asyncHandler(async (req, res) => {
  const { fromDate, toDate, store } = req.query;
  const filter = {};
  
  if (store && store !== 'All Stores') {
    filter.store = buildStoreRegex(store);
  }

  const dateFilter = buildDateFilter(fromDate, toDate, 'updatedAt');
  if (dateFilter) Object.assign(filter, dateFilter);

  // Consider only leads that have been handled (status changed from new)
  filter.leadStatus = { $in: ['completed', 'complaint'] };

  const summary = await LeadMaster.aggregate([
    { $match: filter },
    {
      $group: {
        _id: "$createdBy",
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
        complaints: {
          $sum: { $cond: [{ $eq: ["$leadStatus", "complaint"] }, 1, 0] }
        }
      }
    },
    {
      $project: {
        _id: 0,
        telecaller: "$_id",
        totalCalls: 1,
        totalDuration: 1,
        avgDuration: { $cond: [{ $gt: ["$totalCalls", 0] }, { $divide: ["$totalDuration", "$totalCalls"] }, 0] },
        complaints: 1
      }
    },
    { $sort: { totalCalls: -1 } }
  ]);

  return success(res, summary);
});

const getReports = asyncHandler(async (req, res) => {
  const { fromDate, toDate, store, leadType, telecaller, page = 1, limit = 1000 } = req.query;
  const filter = { leadStatus: 'completed' };

  if (store && store !== 'All Stores') {
    filter.store = buildStoreRegex(store);
  }
  if (leadType) filter.leadtype = leadType;
  if (telecaller) filter.createdBy = telecaller;

  const dateFilter = buildDateFilter(fromDate, toDate, 'updatedAt');
  if (dateFilter) Object.assign(filter, dateFilter);

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const projection = 'createdAt store name customerName phone leadtype createdBy callDuration refundStatus followupDate updatedAt';

  const [leads, total] = await Promise.all([
    LeadMaster.find(filter)
      .select(projection)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .lean(),
    LeadMaster.countDocuments(filter),
  ]);

  const mappedLeads = leads.map(l => ({
    ...l,
    customerName: l.customerName || l.name,
    name: l.name || l.customerName
  }));

  return success(res, { leads: mappedLeads, total });
});

const getComplaintsPivot = asyncHandler(async (req, res) => {
  const { fromDate, toDate, store } = req.query;
  const filter = { leadStatus: 'complaint' };

  if (store && store !== 'All Stores') {
    filter.store = buildStoreRegex(store);
  }

  const dateFilter = buildDateFilter(fromDate, toDate, 'updatedAt');
  if (dateFilter) Object.assign(filter, dateFilter);

  const pivotData = await LeadMaster.aggregate([
    { $match: filter },
    {
      $group: {
        _id: { store: "$store", category: "$subCategory" },
        total: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        store: "$_id.store",
        category: "$_id.category",
        total: 1
      }
    },
    { $sort: { total: -1 } }
  ]);

  return success(res, pivotData);
});
const getFilterOptions = asyncHandler(async (req, res) => {
  const Store = require('../models/Store');
  
  // 1. Get official stores from Store collection (master list)
  const masterStores = await Store.distinct('normalizedName');
  
  // 2. Get unique stores that have active data in LeadMaster (fallback for historical data)
  const leadStores = await LeadMaster.distinct('store');
  
  // Combine, normalize, and deduplicate
  const { normalizeStore } = require('../utils/storeNormalizer');
  const allStores = [...new Set([
    ...masterStores.map(normalizeStore),
    ...leadStores.map(normalizeStore)
  ])].filter(Boolean).sort();

  // Get unique lead types from completed leads
  const leadTypes = await LeadMaster.distinct('leadtype', { leadStatus: 'completed' });
  
  // Get all telecallers from Users collection
  const telecallers = await User.find({ role: { $in: ['Telecaller', 'telecaller'] } })
    .select('employeeId name')
    .lean();
  return success(res, {
    stores: allStores,
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
