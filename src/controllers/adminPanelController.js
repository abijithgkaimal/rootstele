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
  
  const activeUsers = await User.find({ role: { $ne: 'admin' } });
  
  const matchObj = { leadStatus: 'completed' };
  if (fromDate || toDate) {
    matchObj.updatedAt = {};
    if (fromDate) matchObj.updatedAt.$gte = new Date(new Date(fromDate).setHours(0, 0, 0, 0));
    if (toDate) matchObj.updatedAt.$lte = new Date(new Date(toDate).setHours(23, 59, 59, 999));
  }
  if (store && store !== 'All Stores') matchObj.store = new RegExp(store, 'i');

  const telecallersData = await Promise.all(activeUsers.map(async (user) => {
    if (search && !user.name.toLowerCase().includes(search.toLowerCase()) && !user.employeeId.toLowerCase().includes(search.toLowerCase())) {
      return null;
    }

    const baseMatch = { ...matchObj, updatedBy: user.employeeId };
    
    const [totalCalls, connectedCalls, notConnectedCalls, followupsDone, lossOfSale] = await Promise.all([
      LeadMaster.countDocuments(baseMatch),
      LeadMaster.countDocuments({ ...baseMatch, callStatus: 'connected' }),
      LeadMaster.countDocuments({ ...baseMatch, callStatus: 'not connected' }),
      LeadMaster.countDocuments({ ...baseMatch, followupDate: { $exists: true, $ne: null } }),
      LeadMaster.countDocuments({ ...baseMatch, leadtype: 'lossofsale' })
    ]);

    const performance = totalCalls > 0 ? ((connectedCalls / totalCalls) * 100).toFixed(1) : 0;

    return {
      employeeId: user.employeeId,
      name: user.name,
      totalCalls,
      connectedCalls,
      notConnectedCalls,
      followupsDone,
      lossOfSale,
      performance: parseFloat(performance)
    };
  }));

  const telecallers = telecallersData.filter(Boolean);

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
