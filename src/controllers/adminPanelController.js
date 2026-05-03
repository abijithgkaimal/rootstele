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
    LeadMaster.countDocuments({ ...matchObj, leadStatus: /^completed$/i }),
    LeadMaster.countDocuments({ ...matchObj, leadtype: /lossofsale|loss of sale/i }),
    LeadMaster.countDocuments({ ...matchObj, leadStatus: /^followup$/i }),
    LeadMaster.countDocuments({ ...matchObj, leadStatus: /^complaint$/i })
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
  
  const matchObj = { 
    leadStatus: { $in: ['completed', 'Completed', 'COMPLETED', 'followup', 'Followup', 'FOLLOWUP', 'complaint', 'Complaint', 'COMPLAINT'] }, 
    updatedBy: { $exists: true, $ne: null } 
  };
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
        totalCalls: { $sum: { $cond: [{ $in: [{ $toLower: "$leadStatus" }, ["completed"]] }, 1, 0] } },
        connectedCalls: { $sum: { $cond: [{ $eq: ["$callStatus", "connected"] }, 1, 0] } },
        feedbackCalls: { $sum: { $cond: [{ $and: [{ $regexMatch: { input: { $ifNull: ["$leadtype", ""] }, regex: "return|feedback", options: "i" } }, { $eq: [{ $toLower: "$leadStatus" }, "completed"] }] }, 1, 0] } },
        bookingConfirmationCalls: { $sum: { $cond: [{ $and: [{ $regexMatch: { input: { $ifNull: ["$leadtype", ""] }, regex: "bookingconfirmation|booking confirmation", options: "i" } }, { $eq: [{ $toLower: "$leadStatus" }, "completed"] }] }, 1, 0] } },
        enquiryCalls: { $sum: { $cond: [{ $and: [{ $regexMatch: { input: { $ifNull: ["$leadtype", ""] }, regex: "enquiry", options: "i" } }, { $eq: [{ $toLower: "$leadStatus" }, "completed"] }] }, 1, 0] } },
        followupsDone: { $sum: { $cond: [{ $eq: [{ $toLower: "$leadStatus" }, "followup"] }, 1, 0] } },
        followup: { $sum: { $cond: [{ $eq: [{ $toLower: "$leadStatus" }, "followup"] }, 1, 0] } },
        lossOfSale: { $sum: { $cond: [{ $and: [{ $regexMatch: { input: { $ifNull: ["$leadtype", ""] }, regex: "lossofsale|loss of sale", options: "i" } }, { $eq: [{ $toLower: "$leadStatus" }, "completed"] }] }, 1, 0] } },
        justDial: { $sum: { $cond: [{ $and: [{ $regexMatch: { input: { $ifNull: ["$leadtype", ""] }, regex: "justdial", options: "i" } }, { $eq: [{ $toLower: "$leadStatus" }, "completed"] }] }, 1, 0] } },
        booked: { $sum: { $cond: [{ $and: [{ $regexMatch: { input: { $ifNull: ["$leadtype", ""] }, regex: "booked", options: "i" } }, { $eq: [{ $toLower: "$leadStatus" }, "completed"] }] }, 1, 0] } },
        complaints: { $sum: { $cond: [{ $eq: [{ $toLower: "$leadStatus" }, "complaint"] }, 1, 0] } }
      }
    }
  ];

  const results = await LeadMaster.aggregate(aggregationPipeline);

  const activeUsers = await User.find({ role: { $ne: 'admin' } });
  const userMap = {};
  activeUsers.forEach(u => {
    userMap[u.employeeId] = u.name;
  });

  let telecallers = results.map(r => {
    const employeeId = r._id;
    const name = userMap[employeeId] || employeeId;
    
    if (search && !name.toLowerCase().includes(search.toLowerCase()) && !employeeId.toLowerCase().includes(search.toLowerCase())) {
      return null;
    }

    const performance = r.totalCalls > 0 ? ((r.connectedCalls / r.totalCalls) * 100).toFixed(1) : 0;

    return {
      employeeId,
      name,
      totalCalls: r.totalCalls,
      feedbackCalls: r.feedbackCalls,
      bookingConfirmationCalls: r.bookingConfirmationCalls,
      enquiryCalls: r.enquiryCalls,
      followupsDone: r.followupsDone,
      followup: r.followup,
      lossOfSale: r.lossOfSale,
      justDial: r.justDial,
      booked: r.booked,
      complaints: r.complaints,
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
    LeadMaster.countDocuments({ ...matchObj, leadStatus: /^completed$/i }),
    LeadMaster.countDocuments({ ...matchObj, callStatus: /^connected$/i }),
    LeadMaster.countDocuments({ ...matchObj, leadtype: /lossofsale|loss of sale/i, leadStatus: /^completed$/i })
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
    LeadMaster.countDocuments({ ...matchObj, leadStatus: /^completed$/i, leadtype: /bookingconfirmation|booking confirmation/i }),
    LeadMaster.countDocuments({ ...matchObj, leadStatus: /^completed$/i, leadtype: /^(lossofsale|loss of sale)/i }),
    LeadMaster.countDocuments({ ...matchObj, leadStatus: /^completed$/i, leadtype: /return|feedback/i }),
    LeadMaster.countDocuments({ ...matchObj, leadStatus: /^followup$/i }),
    LeadMaster.countDocuments({ ...matchObj, leadStatus: /^completed$/i, leadtype: /enquiry/i })
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
  const { fromDate, toDate, type = 'assigned' } = req.query;

  const matchObj = { updatedBy: employeeId };

  if (fromDate || toDate) {
    matchObj.updatedAt = {};
    if (fromDate) matchObj.updatedAt.$gte = new Date(new Date(fromDate).setHours(0, 0, 0, 0));
    if (toDate) matchObj.updatedAt.$lte = new Date(new Date(toDate).setHours(23, 59, 59, 999));
  }

  if (type === 'completed') {
    matchObj.leadStatus = /^completed$/i;
  }

  const calls = await LeadMaster.find(matchObj)
    .sort({ updatedAt: -1 })
    .select('customerName name phone leadtype callStatus callDuration remarks updatedAt store subCategory closingAction');

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
    subCategory: c.subCategory,
    closingAction: c.closingAction
  }));

  return success(res, { calls: formattedCalls });
});

const getCompletedReports = asyncHandler(async (req, res) => {
  const { fromDate, toDate, telecallerId, leadtype, store, search } = req.query;
  const matchObj = { leadStatus: /^completed$/i };

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
  const matchObj = { leadStatus: /^completed$/i };

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
