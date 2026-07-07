const LeadMaster = require('../models/LeadMaster');
const User = require('../models/User');
const { success } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const mongoose = require('mongoose');

const getDashboardSummary = asyncHandler(async (req, res) => {
  const { fromDate, toDate, store } = req.query;
  const matchObj = {};
  const totalLeadsMatchObj = {};
  
  if (fromDate || toDate) {
    matchObj.updatedAt = {};
    totalLeadsMatchObj.createdAt = {};
    if (fromDate) {
      const start = new Date(new Date(fromDate).setHours(0, 0, 0, 0));
      matchObj.updatedAt.$gte = start;
      totalLeadsMatchObj.createdAt.$gte = start;
    }
    if (toDate) {
      const end = new Date(new Date(toDate).setHours(23, 59, 59, 999));
      matchObj.updatedAt.$lte = end;
      totalLeadsMatchObj.createdAt.$lte = end;
    }
  }
  if (store && store !== 'All Stores') {
    const storeRegex = new RegExp(store, 'i');
    matchObj.store = storeRegex;
    totalLeadsMatchObj.store = storeRegex;
  }

  const [totalLeads, completedLeads, totalLossOfSaleLeads, followupLeadsToBeCalled, totalComplaints] = await Promise.all([
    LeadMaster.countDocuments(totalLeadsMatchObj),
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
    if (u.employeeId) {
      userMap[u.employeeId.toUpperCase()] = u.name;
    }
  });

  let telecallers = results.map(r => {
    const employeeId = r._id;
    const name = employeeId ? (userMap[employeeId.toUpperCase()] || employeeId) : 'Unknown';
    
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

  const matchObj = { updatedBy: { $regex: new RegExp('^' + employeeId + '$', 'i') } };
  if (fromDate || toDate) {
    matchObj.updatedAt = {};
    if (fromDate) matchObj.updatedAt.$gte = new Date(new Date(fromDate).setHours(0, 0, 0, 0));
    if (toDate) matchObj.updatedAt.$lte = new Date(new Date(toDate).setHours(23, 59, 59, 999));
  }
  if (store && store !== 'All Stores') matchObj.store = new RegExp(store, 'i');

  const user = await User.findOne({ employeeId: { $regex: new RegExp('^' + employeeId + '$', 'i') } });
  
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

  const matchObj = { updatedBy: { $regex: new RegExp('^' + employeeId + '$', 'i') } };
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

  const matchObj = { updatedBy: { $regex: new RegExp('^' + employeeId + '$', 'i') } };

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
  if (telecallerId) matchObj.updatedBy = { $regex: new RegExp('^' + telecallerId + '$', 'i') };
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
  if (telecallerId) matchObj.updatedBy = { $regex: new RegExp('^' + telecallerId + '$', 'i') };
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

  // Custom sort to group by leadtype as requested
  const getLeadTypeOrder = (type) => {
    if (!type) return 99;
    const t = type.toLowerCase();
    if (t.includes('return') || t.includes('feedback')) return 1;
    if (t.includes('booking confirmation') || t.includes('bookingconfirmation')) return 2;
    if (t.includes('booked')) return 3;
    if (t.includes('enquiry')) return 4;
    if (t.includes('justdial')) return 5;
    return 99;
  };

  leads.sort((a, b) => {
    const orderA = getLeadTypeOrder(a.leadtype);
    const orderB = getLeadTypeOrder(b.leadtype);
    if (orderA !== orderB) return orderA - orderB;
    
    // Secondary sort by updatedAt descending
    const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return dateB - dateA;
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="reports.csv"');

  const headers = [
    'ID', 'Customer Name', 'Phone', 'Store', 'Lead Type', 'Lead Status',
    'Call Status', 'Call Duration', 'Telecaller', 'Updated At', 'Created At',
    'Remarks', 'Sub Category', 'Booking Number', 'Booking Date', 'Return Date',
    'Delivery Date', 'Category', 'Address', 'Advance Amount', 'Total Amount', 'Attended By'
  ];

  const escapeCSV = (val) => {
    if (val === undefined || val === null) return '';
    let str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  let csv = headers.map(escapeCSV).join(',') + '\r\n';

  leads.forEach(lead => {
    const row = [
      lead._id,
      lead.customerName || lead.name || '',
      lead.phone || '',
      lead.store || '',
      lead.leadtype || '',
      lead.leadStatus || '',
      lead.callStatus || '',
      lead.callDuration || '',
      lead.updatedBy || '',
      lead.updatedAt ? lead.updatedAt.toISOString() : '',
      lead.createdAt ? lead.createdAt.toISOString() : '',
      lead.remarks || '',
      lead.subCategory || '',
      lead.bookingNo || '',
      lead.bookingDate ? new Date(lead.bookingDate).toISOString() : '',
      lead.returnDate ? new Date(lead.returnDate).toISOString() : '',
      lead.deliveryDate ? new Date(lead.deliveryDate).toISOString() : '',
      lead.category || '',
      lead.address || '',
      lead.advanceAmount !== undefined ? lead.advanceAmount : '',
      lead.totalAmount !== undefined ? lead.totalAmount : '',
      lead.attendedBy || ''
    ];
    csv += row.map(escapeCSV).join(',') + '\r\n';
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
