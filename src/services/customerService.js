const Customer = require('../models/Customer');
const LeadMaster = require('../models/LeadMaster');
const { normalize } = require('../utils/phoneNormalizer');

const STATUS_PRIORITY = { complaint: 1, followup: 2, new: 3, completed: 4 };

const pickLatestLead = (leads) => {
  if (!leads || !leads.length) return null;
  let best = leads[0];
  for (let i = 1; i < leads.length; i++) {
    const a = best;
    const b = leads[i];
    const pa = STATUS_PRIORITY[a.leadStatus] ?? 5;
    const pb = STATUS_PRIORITY[b.leadStatus] ?? 5;
    if (pa !== pb) {
      if (pa < pb) best = a;
      else best = b;
    } else {
      const at = a.updatedAt ? new Date(a.updatedAt).getTime() : new Date(a.createdAt || 0).getTime();
      const bt = b.updatedAt ? new Date(b.updatedAt).getTime() : new Date(b.createdAt || 0).getTime();
      best = bt > at ? b : a;
    }
  }
  return best;
};

const categorizeLeadIds = (leads) => {
  const activeLeadIds = [];
  const completedLeadIds = [];
  const complaintLeadIds = [];
  for (const l of leads) {
    if (!l._id) continue;
    if (l.leadStatus === 'complaint') complaintLeadIds.push(l._id);
    else if (l.leadStatus === 'followup' || l.leadStatus === 'new') activeLeadIds.push(l._id);
    else completedLeadIds.push(l._id);
  }
  return { activeLeadIds, completedLeadIds, complaintLeadIds };
};

const upsertCustomerFromLead = async (lead) => {
  const phone = lead.phone || lead.phoneNo || null;
  if (!phone) return null;

  const normalizedPhone = normalize(phone);
  if (!normalizedPhone) return null;

  return recomputeCustomerState(normalizedPhone);
};

const recomputeCustomerState = async (normalizedPhone) => {
  if (!normalizedPhone) return null;

  const escaped = normalizedPhone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const leads = await LeadMaster.find({
    $or: [
      { normalizedPhone },
      { phone: normalizedPhone },
      { phoneNo: normalizedPhone },
      { phone: { $regex: new RegExp(escaped + '$') } },
      { phoneNo: { $regex: new RegExp(escaped + '$') } },
    ],
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();

  const seen = new Set();
  const uniqueLeads = leads.filter((l) => {
    const p = l.phone || l.phoneNo || l.normalizedPhone || '';
    if (normalize(p) !== normalizedPhone) return false;
    const pid = String(l._id);
    if (seen.has(pid)) return false;
    seen.add(pid);
    return true;
  });

  if (!uniqueLeads.length) {
    await Customer.deleteOne({ normalizedPhone }).catch(() => {});
    return null;
  }

  const latest = pickLatestLead(uniqueLeads);
  const { activeLeadIds, completedLeadIds, complaintLeadIds } = categorizeLeadIds(uniqueLeads);
  const name = latest.customerName || latest.name || uniqueLeads[0].customerName || uniqueLeads[0].name;
  const rawPhone = latest.phone || latest.phoneNo || normalizedPhone;

  const update = {
    phone: rawPhone,
    normalizedPhone,
    name,
    latestLeadId: latest._id,
    latestLeadType: latest.leadtype,
    latestLeadStatus: latest.leadStatus,
    latestStore: latest.store,
    lastInteractionAt: latest.updatedAt || latest.createdAt || new Date(),
    leadCount: uniqueLeads.length,
    activeLeadIds,
    completedLeadIds,
    complaintLeadIds,
  };

  const customer = await Customer.findOneAndUpdate(
    { normalizedPhone },
    { $set: update },
    { upsert: true, new: true }
  );
  return customer;
};

const getCustomerByPhone = async (normalizedPhone) => {
  if (!normalizedPhone) return null;
  return Customer.findOne({ normalizedPhone }).lean();
};

const getCustomerHistory = async (customerId) => {
  const customer = await Customer.findById(customerId).lean();
  if (!customer) return null;

  const norm = customer.normalizedPhone;
  const escaped = norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const leads = await LeadMaster.find({
    $or: [
      { normalizedPhone: norm },
      { phone: norm },
      { phoneNo: norm },
      { phone: { $regex: new RegExp(escaped + '$') } },
      { phoneNo: { $regex: new RegExp(escaped + '$') } },
    ],
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();

  const seen = new Set();
  const filtered = leads.filter((l) => {
    const p = l.phone || l.phoneNo || l.normalizedPhone || '';
    if (normalize(p) !== norm) return false;
    const pid = String(l._id);
    if (seen.has(pid)) return false;
    seen.add(pid);
    return true;
  });

  return { customer, leads: filtered };
};

const computePopupType = (leadStatus, leadType) => {
  if (leadStatus === 'followup') return 'followupPopup';
  if (leadStatus === 'completed') return 'reportPopup';
  if (leadStatus === 'complaint') return 'complaintPopup';
  if (leadStatus === 'new') {
    const lt = (leadType || '').toLowerCase();
    if (lt === 'return') return 'returnPopup';
    if (lt === 'bookingconfirmation') return 'bookingConfirmationPopup';
  }
  return 'newLeadPopup';
};

module.exports = {
  upsertCustomerFromLead,
  recomputeCustomerState,
  getCustomerByPhone,
  getCustomerHistory,
  computePopupType,
  normalize: (p) => normalize(p),
};
