const LeadMaster = require('../models/LeadMaster');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { success } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const mongoose = require('mongoose');

const getDashboardSummary = asyncHandler(async (req, res) => {
  const { fromDate, toDate, store } = req.query;
  const matchObj = {};
  const totalLeadsMatchObj = {};
  const chatMatchObj = {};
  
  if (fromDate || toDate) {
    matchObj.updatedAt = {};
    totalLeadsMatchObj.createdAt = {};
    chatMatchObj.createdAt = {};
    if (fromDate) {
      const start = new Date(new Date(fromDate).setHours(0, 0, 0, 0));
      matchObj.updatedAt.$gte = start;
      totalLeadsMatchObj.createdAt.$gte = start;
      chatMatchObj.createdAt.$gte = start;
    }
    if (toDate) {
      const end = new Date(new Date(toDate).setHours(23, 59, 59, 999));
      matchObj.updatedAt.$lte = end;
      totalLeadsMatchObj.createdAt.$lte = end;
      chatMatchObj.createdAt.$lte = end;
    }
  }
  if (store && store !== 'All Stores') {
    const storeRegex = new RegExp(store, 'i');
    matchObj.store = storeRegex;
    totalLeadsMatchObj.store = storeRegex;
  }

  const [
    totalLeads,
    completedLeads,
    totalLossOfSaleLeads,
    followupLeadsToBeCalled,
    totalComplaints,
    totalChats,
    openChats,
    resolvedChats,
    whatsappChats,
    instagramChats,
    facebookChats,
    convertedLeadsFromChat,
    suitorGuyChats,
    zorucciChats,
    dapperSquadChats,
    recentConversations
  ] = await Promise.all([
    LeadMaster.countDocuments(totalLeadsMatchObj),
    LeadMaster.countDocuments({ ...matchObj, leadStatus: /^completed$/i }),
    LeadMaster.countDocuments({ ...matchObj, leadtype: /lossofsale|loss of sale/i }),
    LeadMaster.countDocuments({ ...matchObj, leadStatus: /^followup$/i }),
    LeadMaster.countDocuments({ ...matchObj, leadStatus: /^complaint$/i }),
    Conversation.countDocuments(chatMatchObj),
    Conversation.countDocuments({ ...chatMatchObj, status: 'open' }),
    Conversation.countDocuments({ ...chatMatchObj, status: 'resolved' }),
    Conversation.countDocuments({ ...chatMatchObj, channel: 'whatsapp' }),
    Conversation.countDocuments({ ...chatMatchObj, channel: 'instagram' }),
    Conversation.countDocuments({ ...chatMatchObj, channel: 'facebook' }),
    Conversation.countDocuments({ ...chatMatchObj, leadId: { $exists: true, $ne: null } }),
    Conversation.countDocuments({ ...chatMatchObj, brand: 'suitor_guy' }),
    Conversation.countDocuments({ ...chatMatchObj, brand: 'zorucci' }),
    Conversation.countDocuments({ ...chatMatchObj, brand: 'dapper_squad' }),
    Conversation.find(chatMatchObj)
      .sort({ lastActivityAt: -1 })
      .limit(6)
      .populate('leadId', 'leadtype store')
      .lean()
  ]);

  return success(res, {
    totalLeads,
    completedLeads,
    totalLossOfSaleLeads,
    followupLeadsToBeCalled,
    totalComplaints,
    chats: {
      totalChats,
      openChats,
      resolvedChats,
      whatsappChats,
      instagramChats,
      facebookChats,
      convertedLeadsFromChat,
      brands: {
        suitor_guy: suitorGuyChats,
        zorucci: zorucciChats,
        dapper_squad: dapperSquadChats
      },
      recentConversations
    }
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
        _id: { $toUpper: "$updatedBy" },
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

  const allUsers = await User.find({ role: { $ne: 'admin' } }).sort({ name: 1 });
  const resultMap = {};
  results.forEach(r => {
    if (r._id) {
      resultMap[String(r._id).toUpperCase()] = r;
    }
  });

  const processedIds = new Set();
  let telecallers = [];

  // 1. Include all registered telecallers from User collection so they ALWAYS show their name
  allUsers.forEach(u => {
    const empId = (u.employeeId || '').toUpperCase();
    processedIds.add(empId);

    const r = resultMap[empId] || {
      totalCalls: 0,
      connectedCalls: 0,
      feedbackCalls: 0,
      bookingConfirmationCalls: 0,
      enquiryCalls: 0,
      followupsDone: 0,
      followup: 0,
      lossOfSale: 0,
      justDial: 0,
      booked: 0,
      complaints: 0
    };

    const performance = r.totalCalls > 0 ? ((r.connectedCalls / r.totalCalls) * 100).toFixed(1) : 0;

    if (search) {
      const term = search.toLowerCase();
      const matchName = u.name && u.name.toLowerCase().includes(term);
      const matchId = u.employeeId && u.employeeId.toLowerCase().includes(term);
      if (!matchName && !matchId) return;
    }

    telecallers.push({
      employeeId: u.employeeId,
      name: u.name,
      store: u.store || '',
      role: u.role || 'Telecaller',
      phone: u.phone || '',
      email: u.email || '',
      active: u.active !== false,
      lastLoginAt: u.lastLoginAt || null,
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
    });
  });

  // 2. Also include any leads assigned/updated by an ID not yet in User collection
  results.forEach(r => {
    const rawId = r._id;
    if (!rawId) return;
    const empId = String(rawId).toUpperCase();
    if (!processedIds.has(empId)) {
      processedIds.add(empId);
      const performance = r.totalCalls > 0 ? ((r.connectedCalls / r.totalCalls) * 100).toFixed(1) : 0;

      if (search) {
        const term = search.toLowerCase();
        if (!rawId.toLowerCase().includes(term)) return;
      }

      telecallers.push({
        employeeId: rawId,
        name: rawId,
        store: '',
        role: 'Telecaller',
        phone: '',
        email: '',
        active: true,
        lastLoginAt: null,
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
      });
    }
  });

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
    store: user?.store || '',
    phone: user?.phone || '',
    email: user?.email || '',
    active: user?.active !== false,
    lastLoginAt: user?.lastLoginAt || null,
    totalCalls,
    connectedCalls,
    totalLossOfSale,
    overallConversionPercentage: parseFloat(overallConversionPercentage)
  });
});

const updateTelecallerProfile = asyncHandler(async (req, res) => {
  const { employeeId } = req.params;
  const { name, store, role, phone, email, active } = req.body;

  if (!employeeId) {
    throw new ApiError(400, 'Employee ID is required');
  }

  const formattedEmpId = String(employeeId).replace(/\s+/g, '').toUpperCase();
  const updateData = {};
  if (name !== undefined && name !== null) updateData.name = name.trim();
  if (store !== undefined) updateData.store = store ? store.trim() : '';
  if (role !== undefined) updateData.role = role ? role.trim() : 'Telecaller';
  if (phone !== undefined) updateData.phone = phone ? phone.trim() : '';
  if (email !== undefined) updateData.email = email ? email.trim() : '';
  if (active !== undefined) updateData.active = Boolean(active);

  const updatedUser = await User.findOneAndUpdate(
    { employeeId: { $regex: new RegExp('^' + formattedEmpId + '$', 'i') } },
    { $set: updateData },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return success(res, updatedUser, 'Telecaller profile updated successfully');
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

/**
 * GET /api/admin/chat-reports/summary
 */
const getChatReportsSummary = asyncHandler(async (req, res) => {
  const { fromDate, toDate, brand, channel, employeeId } = req.query;

  const matchObj = {};
  if (fromDate || toDate) {
    matchObj.createdAt = {};
    if (fromDate) matchObj.createdAt.$gte = new Date(new Date(fromDate).setHours(0, 0, 0, 0));
    if (toDate) matchObj.createdAt.$lte = new Date(new Date(toDate).setHours(23, 59, 59, 999));
  }
  if (brand && brand !== 'all') matchObj.brand = brand.toLowerCase();
  if (channel && channel !== 'all') matchObj.channel = channel.toLowerCase();
  if (employeeId && employeeId !== 'all') matchObj.assignedTo = { $regex: new RegExp('^' + employeeId + '$', 'i') };

  const [
    totalConversations,
    openConversations,
    resolvedConversations,
    pendingConversations,
    whatsappConversations,
    instagramConversations,
    facebookConversations,
    convertedLeadsCount,
    zorucciCount,
    suitorGuyCount,
    dapperSquadCount
  ] = await Promise.all([
    Conversation.countDocuments(matchObj),
    Conversation.countDocuments({ ...matchObj, status: 'open' }),
    Conversation.countDocuments({ ...matchObj, status: 'resolved' }),
    Conversation.countDocuments({ ...matchObj, status: 'pending' }),
    Conversation.countDocuments({ ...matchObj, channel: 'whatsapp' }),
    Conversation.countDocuments({ ...matchObj, channel: 'instagram' }),
    Conversation.countDocuments({ ...matchObj, channel: 'facebook' }),
    Conversation.countDocuments({ ...matchObj, leadId: { $exists: true, $ne: null } }),
    Conversation.countDocuments({ ...matchObj, brand: 'zorucci' }),
    Conversation.countDocuments({ ...matchObj, brand: 'suitor_guy' }),
    Conversation.countDocuments({ ...matchObj, brand: 'dapper_squad' }),
  ]);

  const msgMatch = {};
  if (fromDate || toDate) {
    msgMatch.createdAt = {};
    if (fromDate) msgMatch.createdAt.$gte = new Date(new Date(fromDate).setHours(0, 0, 0, 0));
    if (toDate) msgMatch.createdAt.$lte = new Date(new Date(toDate).setHours(23, 59, 59, 999));
  }
  if (brand && brand !== 'all') msgMatch.brand = brand.toLowerCase();
  if (channel && channel !== 'all') msgMatch.channel = channel.toLowerCase();

  const [totalOutbound, totalInbound] = await Promise.all([
    Message.countDocuments({ ...msgMatch, senderType: 'telecaller' }),
    Message.countDocuments({ ...msgMatch, senderType: 'customer' })
  ]);

  return success(res, {
    totalConversations,
    openConversations,
    resolvedConversations,
    pendingConversations,
    whatsappConversations,
    instagramConversations,
    facebookConversations,
    convertedLeadsCount,
    totalOutboundMessages: totalOutbound,
    totalInboundMessages: totalInbound,
    brandBreakdown: {
      zorucci: zorucciCount,
      suitor_guy: suitorGuyCount,
      dapper_squad: dapperSquadCount
    }
  });
});

/**
 * GET /api/admin/chat-reports/telecaller-performance
 */
const getTelecallerChatPerformance = asyncHandler(async (req, res) => {
  const { fromDate, toDate, store, brand, channel, search } = req.query;

  const matchObj = {};
  if (fromDate || toDate) {
    matchObj.createdAt = {};
    if (fromDate) matchObj.createdAt.$gte = new Date(new Date(fromDate).setHours(0, 0, 0, 0));
    if (toDate) matchObj.createdAt.$lte = new Date(new Date(toDate).setHours(23, 59, 59, 999));
  }
  if (brand && brand !== 'all') matchObj.brand = brand.toLowerCase();
  if (channel && channel !== 'all') matchObj.channel = channel.toLowerCase();

  const convPipeline = [
    { $match: matchObj },
    {
      $group: {
        _id: { $toUpper: "$assignedTo" },
        totalChats: { $sum: 1 },
        openChats: { $sum: { $cond: [{ $eq: ["$status", "open"] }, 1, 0] } },
        resolvedChats: { $sum: { $cond: [{ $eq: ["$status", "resolved"] }, 1, 0] } },
        pendingChats: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
        whatsappChats: { $sum: { $cond: [{ $eq: ["$channel", "whatsapp"] }, 1, 0] } },
        instagramChats: { $sum: { $cond: [{ $eq: ["$channel", "instagram"] }, 1, 0] } },
        facebookChats: { $sum: { $cond: [{ $eq: ["$channel", "facebook"] }, 1, 0] } },
        convertedLeads: { $sum: { $cond: [{ $and: [{ $ne: ["$leadId", null] }, { $ne: ["$leadId", undefined] }] }, 1, 0] } },
      }
    }
  ];

  const msgMatch = { senderType: 'telecaller' };
  if (fromDate || toDate) {
    msgMatch.createdAt = {};
    if (fromDate) msgMatch.createdAt.$gte = new Date(new Date(fromDate).setHours(0, 0, 0, 0));
    if (toDate) msgMatch.createdAt.$lte = new Date(new Date(toDate).setHours(23, 59, 59, 999));
  }
  if (brand && brand !== 'all') msgMatch.brand = brand.toLowerCase();
  if (channel && channel !== 'all') msgMatch.channel = channel.toLowerCase();

  const msgPipeline = [
    { $match: msgMatch },
    {
      $group: {
        _id: { $toUpper: "$senderId" },
        outboundMessages: { $sum: 1 }
      }
    }
  ];

  const [convResults, msgResults, allUsers] = await Promise.all([
    Conversation.aggregate(convPipeline),
    Message.aggregate(msgPipeline),
    User.find({ role: { $ne: 'admin' } }).sort({ name: 1 })
  ]);

  const convMap = {};
  convResults.forEach(c => {
    if (c._id) convMap[String(c._id).toUpperCase()] = c;
  });

  const msgMap = {};
  msgResults.forEach(m => {
    if (m._id) msgMap[String(m._id).toUpperCase()] = m.outboundMessages;
  });

  const processedIds = new Set();
  const telecallers = [];

  allUsers.forEach(u => {
    const empId = (u.employeeId || '').toUpperCase();
    processedIds.add(empId);

    const c = convMap[empId] || {
      totalChats: 0,
      openChats: 0,
      resolvedChats: 0,
      pendingChats: 0,
      whatsappChats: 0,
      instagramChats: 0,
      facebookChats: 0,
      convertedLeads: 0
    };

    const outboundCount = msgMap[empId] || 0;
    const resolutionRate = c.totalChats > 0 ? ((c.resolvedChats / c.totalChats) * 100).toFixed(1) : 0;
    const leadConversionRate = c.totalChats > 0 ? ((c.convertedLeads / c.totalChats) * 100).toFixed(1) : 0;

    if (search) {
      const term = search.toLowerCase();
      const matchName = u.name && u.name.toLowerCase().includes(term);
      const matchId = u.employeeId && u.employeeId.toLowerCase().includes(term);
      if (!matchName && !matchId) return;
    }

    if (store && store !== 'All Stores') {
      if (!u.store || !u.store.toLowerCase().includes(store.toLowerCase())) return;
    }

    telecallers.push({
      employeeId: u.employeeId,
      name: u.name,
      store: u.store || '',
      role: u.role || 'Telecaller',
      totalChats: c.totalChats,
      openChats: c.openChats,
      resolvedChats: c.resolvedChats,
      pendingChats: c.pendingChats,
      whatsappChats: c.whatsappChats,
      instagramChats: c.instagramChats,
      facebookChats: c.facebookChats,
      outboundMessages: outboundCount,
      convertedLeads: c.convertedLeads,
      resolutionRate: parseFloat(resolutionRate),
      leadConversionRate: parseFloat(leadConversionRate),
      lastLoginAt: u.lastLoginAt
    });
  });

  convResults.forEach(c => {
    const rawId = c._id;
    if (!rawId) return;
    const empId = String(rawId).toUpperCase();
    if (!processedIds.has(empId)) {
      processedIds.add(empId);
      const outboundCount = msgMap[empId] || 0;
      const resolutionRate = c.totalChats > 0 ? ((c.resolvedChats / c.totalChats) * 100).toFixed(1) : 0;
      const leadConversionRate = c.totalChats > 0 ? ((c.convertedLeads / c.totalChats) * 100).toFixed(1) : 0;

      if (search) {
        const term = search.toLowerCase();
        if (!rawId.toLowerCase().includes(term)) return;
      }

      telecallers.push({
        employeeId: rawId,
        name: rawId,
        store: '',
        role: 'Telecaller',
        totalChats: c.totalChats,
        openChats: c.openChats,
        resolvedChats: c.resolvedChats,
        pendingChats: c.pendingChats,
        whatsappChats: c.whatsappChats,
        instagramChats: c.instagramChats,
        facebookChats: c.facebookChats,
        outboundMessages: outboundCount,
        convertedLeads: c.convertedLeads,
        resolutionRate: parseFloat(resolutionRate),
        leadConversionRate: parseFloat(leadConversionRate),
        lastLoginAt: null
      });
    }
  });

  return success(res, { telecallers });
});

/**
 * GET /api/admin/chat-reports/conversations
 */
const getChatConversationsReport = asyncHandler(async (req, res) => {
  const { fromDate, toDate, brand, channel, status, employeeId, search, page = 1, limit = 50 } = req.query;

  const matchObj = {};
  if (fromDate || toDate) {
    matchObj.createdAt = {};
    if (fromDate) matchObj.createdAt.$gte = new Date(new Date(fromDate).setHours(0, 0, 0, 0));
    if (toDate) matchObj.createdAt.$lte = new Date(new Date(toDate).setHours(23, 59, 59, 999));
  }
  if (brand && brand !== 'all') matchObj.brand = brand.toLowerCase();
  if (channel && channel !== 'all') matchObj.channel = channel.toLowerCase();
  if (status && status !== 'all') matchObj.status = status.toLowerCase();
  if (employeeId && employeeId !== 'all') matchObj.assignedTo = { $regex: new RegExp('^' + employeeId + '$', 'i') };

  if (search) {
    const searchRegex = new RegExp(search, 'i');
    matchObj.$or = [
      { 'participant.name': searchRegex },
      { 'participant.phone': searchRegex },
      { 'participant.normalizedPhone': searchRegex },
      { 'participant.username': searchRegex },
      { assignedTo: searchRegex }
    ];
  }

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const [conversations, total] = await Promise.all([
    Conversation.find(matchObj)
      .populate('customerId', 'name phone normalizedPhone')
      .populate('leadId', 'leadtype leadStatus store')
      .sort({ lastActivityAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Conversation.countDocuments(matchObj)
  ]);

  return success(res, {
    conversations,
    total,
    page: pageNum,
    limit: limitNum
  });
});

/**
 * GET /api/admin/chat-reports/export
 */
const exportChatReports = asyncHandler(async (req, res) => {
  const { fromDate, toDate, brand, channel, status } = req.query;

  const matchObj = {};
  if (fromDate || toDate) {
    matchObj.createdAt = {};
    if (fromDate) matchObj.createdAt.$gte = new Date(new Date(fromDate).setHours(0, 0, 0, 0));
    if (toDate) matchObj.createdAt.$lte = new Date(new Date(toDate).setHours(23, 59, 59, 999));
  }
  if (brand && brand !== 'all') matchObj.brand = brand.toLowerCase();
  if (channel && channel !== 'all') matchObj.channel = channel.toLowerCase();
  if (status && status !== 'all') matchObj.status = status.toLowerCase();

  const conversations = await Conversation.find(matchObj)
    .populate('customerId', 'name phone')
    .populate('leadId', 'leadtype leadStatus store')
    .sort({ createdAt: -1 })
    .lean();

  const allUsers = await User.find({}).lean();
  const userMap = {};
  allUsers.forEach(u => {
    if (u.employeeId) userMap[u.employeeId.toUpperCase()] = u.name;
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=chat-report-${new Date().toISOString().split('T')[0]}.csv`);

  const headers = [
    'Conversation ID', 'Channel', 'Brand', 'Customer Name', 'Phone / Social ID',
    'Assigned Telecaller ID', 'Telecaller Name', 'Status', 'Unread Count',
    'Converted To Lead', 'Lead Type', 'Lead Store', 'Last Message', 'Last Activity', 'Created At'
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

  conversations.forEach(c => {
    const telecallerName = c.assignedTo ? (userMap[c.assignedTo.toUpperCase()] || c.assignedTo) : 'Unassigned';
    const row = [
      c._id,
      c.channel || '',
      c.brandName || c.brand || '',
      c.participant?.name || '',
      c.participant?.phone || c.participant?.socialUserId || '',
      c.assignedTo || '',
      telecallerName,
      c.status || '',
      c.unreadCount || 0,
      c.leadId ? 'YES' : 'NO',
      c.leadId?.leadtype || '',
      c.leadId?.store || '',
      c.lastMessage?.text || '',
      c.lastActivityAt ? new Date(c.lastActivityAt).toISOString() : '',
      c.createdAt ? new Date(c.createdAt).toISOString() : ''
    ];
    csv += row.map(escapeCSV).join(',') + '\r\n';
  });

  res.send(csv);
});

module.exports = {
  getDashboardSummary,
  getTelecallerLeaderboard,
  getTelecallerSummary,
  updateTelecallerProfile,
  getTelecallerCategoryPerformance,
  getTelecallerRecentCalls,
  getCompletedReports,
  exportCompletedReports,
  getChatReportsSummary,
  getTelecallerChatPerformance,
  getChatConversationsReport,
  exportChatReports
};
