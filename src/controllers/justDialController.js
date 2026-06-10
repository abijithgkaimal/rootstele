const LeadMaster = require('../models/LeadMaster');
const customerService = require('../services/customerService');
const { success } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const mongoose = require('mongoose');
const pick = require('../utils/pick');
const leadService = require('../services/leadService');
const { normalizeStore } = require('../utils/storeNormalizer');
const statusResolver = require('../services/statusResolverService');

/**
 * GET /api/leads/justdial
 * List all new JustDial leads
 */
const getJustDialLeads = asyncHandler(async (req, res) => {
  const { page, limit, store, fromDate, toDate } = req.query;
  const result = await leadService.getNewLeads({
    leadtype: 'justdial',
    store,
    fromDate,
    toDate,
    page,
    limit,
  });

  return success(res, result);
});

/**
 * GET /api/leads/justdial/:id
 * Get detailed info of a single JustDial lead
 */
const getJustDialLeadById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid lead ID');
  }

  const lead = await LeadMaster.findOne({ _id: id, leadtype: 'justdial', leadStatus: 'new' }).lean();

  if (!lead) {
    throw new ApiError(404, 'JustDial lead not found or already actioned');
  }

  let brand = null;
  let location = null;
  if (lead.store) {
    const parts = lead.store.split('-');
    brand = parts[0] || null;
    location = parts.slice(1).join('-') || null;
  }

  // Consistent format with bookingConfirmationController
  return success(res, {
    id: lead._id,
    customerName: lead.customerName || lead.name || '',
    phone: lead.phone || '',
    city: lead.city || '',
    store: lead.store || null,
    brand,
    location,
    itemCategory: lead.itemCategory || null,
    itemcategory: lead.itemCategory || null,
    item_category: lead.itemCategory || null,
    subCategory: lead.subCategory || null,
    subcategory: lead.subCategory || null,
    sub_category: lead.subCategory || null,
    createdAt: lead.createdAt, // Original JustDial API timestamp
    updatedAt: lead.updatedAt,
    leadStatus: lead.leadStatus,
    leadtype: lead.leadtype,
    callStatus: lead.callStatus || '',
    remarks: lead.remarks || '',
    source: lead.source || ''
  });
});

/**
 * POST /api/leads/justdial/:id
 * Update JustDial lead after telecaller interaction
 */
const updateJustDialLead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid lead ID');
  }

  const payload = { ...req.body };

  // Normalize case-insensitivity and snake_case fields from mobile app/frontend
  const callStatus = (payload.callStatus || payload.call_status || '').toLowerCase().trim() || undefined;
  const remarks = payload.remarks;
  const markasComplaint = payload.markasComplaint === true || payload.markasComplaint === 'true' || payload.mark_as_complaint === true || payload.mark_as_complaint === 'true';
  const markasFollowup = payload.markasFollowup === true || payload.markasFollowup === 'true' || payload.mark_as_followup === true || payload.mark_as_followup === 'true';
  
  let followupDate = null;
  const rawFollowupDate = payload.followupDate || payload.follow_up_date;
  if (rawFollowupDate) {
    followupDate = new Date(rawFollowupDate);
  }

  const service = payload.service;

  // Determine new status using statusResolver (align with enquiry and booked leadtypes)
  const leadStatus = statusResolver.resolveManualLeadStatus({
    callStatus,
    markasComplaint,
    markasFollowup
  });

  const update = {
    markasComplaint,
    markasFollowup,
    callStatus,
    updatedAt: new Date(),
    leadStatus,
    updatedBy: req.user?.employeeId || req.user?.userId || 'unknown'
  };

  let rawCallDuration = payload.callDuration !== undefined 
    ? payload.callDuration 
    : (payload.call_duration !== undefined 
      ? payload.call_duration 
      : (payload.followupcallDuration !== undefined 
        ? payload.followupcallDuration 
        : (payload.followupcall_duration !== undefined 
          ? payload.followupcall_duration 
          : undefined)));

  if (rawCallDuration !== undefined) {
    const durationStr = (rawCallDuration === 0 || rawCallDuration === '0') ? '0' : String(rawCallDuration);
    update.callDuration = durationStr;
    update.followupcallDuration = durationStr;
  }

  let rawStore = undefined;
  if (payload.store !== undefined) {
    rawStore = payload.store;
  } else if (payload.brand !== undefined || payload.location !== undefined) {
    const parts = [];
    if (payload.brand) parts.push(payload.brand);
    if (payload.location) parts.push(payload.location);
    rawStore = parts.join(' ');
  }

  const rawItemCategory = payload.itemCategory !== undefined 
    ? payload.itemCategory 
    : (payload.itemcategory !== undefined 
      ? payload.itemcategory 
      : (payload.item_category !== undefined 
        ? payload.item_category 
        : undefined));

  const rawSubCategory = payload.subCategory !== undefined 
    ? payload.subCategory 
    : (payload.subcategory !== undefined 
      ? payload.subcategory 
      : (payload.sub_category !== undefined 
        ? payload.sub_category 
        : undefined));

  // If callStatus is "not connected", only require/save followupDate and preserve existing fields if they are not provided or are falsy.
  if (callStatus === 'not connected') {
    if (remarks !== undefined) update.remarks = remarks;
    if (followupDate !== null) update.followupDate = followupDate;
    if (service !== undefined && service !== '' && service !== null) update.service = service;

    if (rawStore) {
      update.store = normalizeStore(rawStore);
    }
    if (rawItemCategory) {
      update.itemCategory = rawItemCategory;
    }
    if (rawSubCategory) {
      update.subCategory = rawSubCategory;
    }
  } else {
    // Default behavior for other statuses
    update.remarks = remarks;
    update.followupDate = followupDate;
    update.service = service || null;
    update.store = rawStore ? normalizeStore(rawStore) : null;
    update.itemCategory = rawItemCategory || null;
    update.subCategory = rawSubCategory || null;
  }

  const lead = await LeadMaster.findOneAndUpdate(
    { _id: id, leadtype: 'justdial' },
    update,
    { new: true }
  );

  if (!lead) {
    throw new ApiError(404, 'JustDial lead not found');
  }

  // Optional: Recompute customer state
  customerService.recomputeCustomerState(lead.phone).catch(() => {});
  
  return success(res, lead, 'JustDial lead updated');
});


const handleJustDialLead = async (req, res) => {
  try {
    if (process.env.JUSTDIAL_SECRET && req.query.token !== process.env.JUSTDIAL_SECRET) {
      return res.send("RECEIVED");
    }

    const apiData = req.method === "GET" ? req.query : req.body;
    console.log("JustDial Incoming:", apiData);

    // Normalize phone
    const { normalize: normalizePhone } = require("../utils/phoneNormalizer");
    const rawPhone = apiData.mobile || apiData.phone;
    const normalizedPhone = normalizePhone(rawPhone);
    console.log("Normalized Phone:", normalizedPhone);

    if (!normalizedPhone) {
      return res.send("RECEIVED"); // silently ignore invalid
    }

    // Prepare system fields and fallback name
    const { date, time } = apiData;
    const createdAt = date && time
      ? new Date(`${date} ${time}`)
      : new Date();
    const updatedAt = createdAt;

    // Check existing lead using robust matching criteria
    const escaped = normalizedPhone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existingLead = await LeadMaster.findOne({
      $or: [
        { normalizedPhone },
        { phone: normalizedPhone },
        { phoneNo: normalizedPhone },
        { phone: { $regex: new RegExp(escaped + '$') } },
        { phoneNo: { $regex: new RegExp(escaped + '$') } }
      ]
    });

    if (existingLead) {
      console.log(`[JustDialPush] Match found for incoming lead. Updating existing lead ID: ${existingLead._id}, Phone: ${normalizedPhone}, Old leadtype: "${existingLead.leadtype}" -> "justdial", Old source: "${existingLead.source}" -> "justdialPush"`);
      await LeadMaster.updateOne(
        { _id: existingLead._id },
        {
          $set: {
            leadtype: "justdial",
            source: "justdialPush"
          }
        }
      );
    } else {
      // Find active telecallers for round robin assignment
      const User = require("../models/User");
      const activeUsers = await User.find({
        role: { $ne: "admin" },
        $or: [
          { lastLoginAt: { $gte: new Date(Date.now() - 12 * 60 * 60 * 1000) } },
          { createdAt: { $gte: new Date(Date.now() - 12 * 60 * 60 * 1000) } }
        ]
      }).sort({ lastLoginAt: -1 });

      let createdBy = "system";
      if (activeUsers && activeUsers.length > 0) {
        const totalJustDialLeads = await LeadMaster.countDocuments({ leadtype: "justdial", source: "justdialPush" });
        const assignee = activeUsers[totalJustDialLeads % activeUsers.length];
        createdBy = assignee.employeeId;
      }

      const fallbackName = apiData.name || apiData.company || "";

      const flatDoc = {
        ...apiData,
        customerName: fallbackName,
        name: fallbackName,
        phone: rawPhone,
        normalizedPhone,
        leadtype: "justdial",
        leadStatus: "new",
        source: "justdialPush",
        createdAt,
        updatedAt,
        createdBy
      };
      await LeadMaster.create(flatDoc);
    }

    // Update customer state (for popup system)
    await customerService.recomputeCustomerState(normalizedPhone).catch(() => {});

    // MUST return exactly this
    return res.send("RECEIVED");
  } catch (error) {
    console.error("JustDial Push Error:", error);
    return res.send("RECEIVED"); // never fail response
  }
};

module.exports = {
  getJustDialLeads,
  getJustDialLeadById,
  updateJustDialLead,
  handleJustDialLead
};
