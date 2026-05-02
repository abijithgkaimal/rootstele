const LeadMaster = require('../models/LeadMaster');
const User = require('../models/User');
const { success } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const mongoose = require('mongoose');

const getDashboardSummary = asyncHandler(async (req, res) => {
  const { fromDate, toDate, store } = req.query;
  const matchObj = {};
  
  if (fromDate || toDate) {
    matchObj.updatedAt = {};
    if (fromDate) matchObj.updatedAt.$gte = new Date(new Date(fromDate).setHours(0, 0, 0, 0));
    if (toDate) matchObj.updatedAt.$lte = new Date(new Date(toDate).setHours(23, 59, 59, 999));
  }
  if (store && store !== 'All Stores') matchObj.store = new RegExp(store, 'i');

  const [totalLeads, completedLeads, totalLossOfSaleLeads, followupLeadsToBeCalled, totalComplaints] = await Promise.all([
    LeadMaster.countDocuments(matchObj),
    LeadMaster.countDocuments({ ...matchObj, leadStatus: 'completed' }),
    LeadMaster.countDocuments({ ...matchObj, leadtype: 'lossofsale' }),
    LeadMaster.countDocuments({ ...matchObj, leadStatus: 'followup' }),
    LeadMaster.countDocuments({ ...matchObj, leadStatus: 'complaint' })
  ]);

  return success(res, {
    totalLeads,
    completedLeads,
    totalLossOfSaleLeads,
    followupLeadsToBeCalled,
    totalComplaints
  });
});

const getTelecallerLeaderboard = asyncHandler(async (req, res) => {
  const { fromDate, toDate, store, search } = req.query;
  
  const matchObj = { leadStatus: 'completed', updatedBy: { $exists: true, $ne: null } };
  if (fromDate || toDate) {
    matchObj.updatedAt = {};
    if (fromDate) matchObj.updatedAt.$gte = new Date(new Date(fromDate).setHours(0, 0, 0, 0));
    if (toDate) matchObj.updatedAt.$lte = new Date(new Date(toDate).setHours(23, 59, 59, 999));
  }
  if (store && store !== 'All Stores') matchObj.store = new RegExp(store, 'i');

  const aggregationPipeline = [
    { $match: matchObj },
    {
      $group: {
        _id: "$updatedBy",
        totalCalls: { $sum: 1 },
        connectedCalls: { $sum: { $cond: [{ $eq: ["$callStatus", "connected"] }, 1, 0] } },
        notConnectedCalls: { $sum: { $cond: [{ $eq: ["$callStatus", "not connected"] }, 1, 0] } },
        followupsDone: { $sum: { $cond: [{ $ifNull: ["$followupDate", false] }, 1, 0] } },
        lossOfSale: { $sum: { $cond: [{ $eq: ["$leadtype", "lossofsale"] }, 1, 0] } }
      }
    }
  ];

  const results = await LeadMaster.aggregate(aggregationPipeline);

  // Fetch names for the employeeIds from active users or try to find them if possible.
  // Since users get deleted after 12hrs, we might not find them in the 'users' collection.
  // But we can at least map the ones that exist.
  const activeUsers = await User.find({ role: { $ne: 'admin' } });
  const userMap = {};
  activeUsers.forEach(u => {
    userMap[u.employeeId] = u.name;
  });

  let telecallers = results.map(r => {
    const employeeId = r._id;
    const name = userMap[employeeId] || employeeId; // Fallback to employeeId if name not found
    
    // Apply search filter here if needed
    if (search && !name.toLowerCase().includes(search.toLowerCase()) && !employeeId.toLowerCase().includes(search.toLowerCase())) {
      return null;
    }

    const performance = r.totalCalls > 0 ? ((r.connectedCalls / r.totalCalls) * 100).toFixed(1) : 0;

    return {
      employeeId,
      name,
      totalCalls: r.totalCalls,
      connectedCalls: r.connectedCalls,
      notConnectedCalls: r.notConnectedCalls,
      followupsDone: r.followupsDone,
      lossOfSale: r.lossOfSale,
      performance: parseFloat(performance)
    };
  }).filter(Boolean);

  return success(res, { telecallers });
});

const getTelecallerSummary = asyncHandler(async (req, res) => {
  const { employeeId } = req.params;
  const { fromDate, toDate, store } = req.query;

  const matchObj = { updatedBy: employeeId };
  if (fromDate || toDate) {
    matchObj.updatedAt = {};
    if (fromDate) matchObj.updatedAt.$gte = new Date(new Date(fromDate).setHours(0, 0, 0, 0));
    if (toDate) matchObj.updatedAt.$lte = new Date(new Date(toDate).setHours(23, 59, 59, 999));
  }
  if (store && store !== 'All Stores') matchObj.store = new RegExp(store, 'i');

  const user = await User.findOne({ employeeId });
  
  const [totalCalls, connectedCalls, totalLossOfSale] = await Promise.all([
    LeadMaster.countDocuments({ ...matchObj, leadStatus: 'completed' }),
    LeadMaster.countDocuments({ ...matchObj, callStatus: 'connected' }),
    LeadMaster.countDocuments({ ...matchObj, leadtype: 'lossofsale', leadStatus: 'completed' })
  ]);

  const overallConversionPercentage = totalCalls > 0 ? ((connectedCalls / totalCalls) * 100).toFixed(1) : 0;

  return success(res, {
    employeeId,
    name: user ? user.name : employeeId,
    role: user ? user.role : 'Telecaller',
    totalCalls,
    connectedCalls,
    totalLossOfSale,
    overallConversionPercentage: parseFloat(overallConversionPercentage)
  });
});

const getTelecallerCategoryPerformance = asyncHandler(async (req, res) => {
  const { employeeId } = req.params;
  const { fromDate, toDate, store } = req.query;

  const matchObj = { updatedBy: employeeId };
  if (fromDate || toDate) {
    matchObj.updatedAt = {};
    if (fromDate) matchObj.updatedAt.$gte = new Date(new Date(fromDate).setHours(0, 0, 0, 0));
    if (toDate) matchObj.updatedAt.$lte = new Date(new Date(toDate).setHours(23, 59, 59, 999));
  }
  if (store && store !== 'All Stores') matchObj.store = new RegExp(store, 'i');

  const [bookingCalls, lossOfSaleCalls, customerFeedbackCalls, followupCalls, enquiryCalls] = await Promise.all([
    LeadMaster.countDocuments({ ...matchObj, leadStatus: 'completed', leadtype: 'bookingConfirmation' }),
    LeadMaster.countDocuments({ ...matchObj, leadStatus: 'completed', leadtype: 'lossofsale' }),
    LeadMaster.countDocuments({ ...matchObj, leadStatus: 'completed', leadtype: 'return' }),
    LeadMaster.countDocuments({ ...matchObj, leadStatus: 'followup' }),
    LeadMaster.countDocuments({ ...matchObj, leadStatus: 'completed', leadtype: 'enquiry' })
  ]);

  return success(res, {
    bookingCalls,
    lossOfSaleCalls,
    customerFeedbackCalls,
    followupCalls,
    enquiryCalls
  });
});

const getTelecallerRecentCalls = asyncHandler(async (req, res) => {
  const { employeeId } = req.params;
  const { limit = 10 } = req.query;

  const calls = await LeadMaster.find({ updatedBy: employeeId, leadStatus: 'completed' })
    .sort({ updatedAt: -1 })
    .limit(parseInt(limit))
    .select('customerName name phone leadtype callStatus callDuration remarks updatedAt store subCategory');

  const formattedCalls = calls.map(c => ({
    id: c._id,
    customerName: c.customerName || c.name || 'Unknown',
    phone: c.phone,
    leadtype: c.leadtype,
    callStatus: c.callStatus,
    callDuration: c.callDuration,
    remarks: c.remarks,
    updatedAt: c.updatedAt,
    store: c.store,
    subCategory: c.subCategory
  }));

  return success(res, { calls: formattedCalls });
});

const getCompletedReports = asyncHandler(async (req, res) => {
  const { fromDate, toDate, telecallerId, leadtype, store, search } = req.query;
  const matchObj = { leadStatus: 'completed' };

  if (fromDate || toDate) {
    matchObj.updatedAt = {};
    if (fromDate) matchObj.updatedAt.$gte = new Date(new Date(fromDate).setHours(0, 0, 0, 0));
    if (toDate) matchObj.updatedAt.$lte = new Date(new Date(toDate).setHours(23, 59, 59, 999));
  }
  if (telecallerId) matchObj.updatedBy = telecallerId;
  if (leadtype) matchObj.leadtype = leadtype;
  if (store && store !== 'All Stores') matchObj.store = new RegExp(store, 'i');
  if (search) {
    matchObj.$or = [
      { customerName: new RegExp(search, 'i') },
      { name: new RegExp(search, 'i') },
      { phone: new RegExp(search, 'i') }
    ];
  }

  const leads = await LeadMaster.find(matchObj).sort({ updatedAt: -1 });
  
  return success(res, {
    leads,
    total: leads.length
  });
});

const exportCompletedReports = asyncHandler(async (req, res) => {
  const { fromDate, toDate, telecallerId, leadtype, store, search } = req.query;
  const matchObj = { leadStatus: 'completed' };

  if (fromDate || toDate) {
    matchObj.updatedAt = {};
    if (fromDate) matchObj.updatedAt.$gte = new Date(new Date(fromDate).setHours(0, 0, 0, 0));
    if (toDate) matchObj.updatedAt.$lte = new Date(new Date(toDate).setHours(23, 59, 59, 999));
  }
  if (telecallerId) matchObj.updatedBy = telecallerId;
  if (leadtype) matchObj.leadtype = leadtype;
  if (store && store !== 'All Stores') matchObj.store = new RegExp(store, 'i');
  if (search) {
    matchObj.$or = [
      { customerName: new RegExp(search, 'i') },
      { name: new RegExp(search, 'i') },
      { phone: new RegExp(search, 'i') }
    ];
  }

  const leads = await LeadMaster.find(matchObj).sort({ updatedAt: -1 });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=\"reports.csv\"');

  const headers = ['ID', 'Customer Name', 'Phone', 'Store', 'Lead Type', 'Lead Status', 'Call Status', 'Call Duration', 'Telecaller', 'Updated At', 'Created At', 'Remarks', 'Sub Category'];
  let csv = headers.join(',') + '\\n';

  leads.forEach(lead => {
    const row = [
      lead._id,
      `"${lead.customerName || lead.name || ''}"`,
      lead.phone,
      `"${lead.store || ''}"`,
      lead.leadtype,
      lead.leadStatus,
      lead.callStatus,
      lead.callDuration,
      lead.updatedBy,
      lead.updatedAt ? lead.updatedAt.toISOString() : '',
      lead.createdAt ? lead.createdAt.toISOString() : '',
      `"${(lead.remarks || '').replace(/"/g, '""')}"`,
      `"${lead.subCategory || ''}"`
    ];
    csv += row.join(',') + '\\n';
  });

  res.send(csv);
});

module.exports = {
  getDashboardSummary,
  getTelecallerLeaderboard,
  getTelecallerSummary,
  getTelecallerCategoryPerformance,
  getTelecallerRecentCalls,
  getCompletedReports,
  exportCompletedReports
};
