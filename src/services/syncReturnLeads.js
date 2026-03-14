const axios = require('axios');
const dayjs = require('dayjs');
const LeadMaster = require('../models/LeadMaster');
const Store = require('../models/Store');
const customerService = require('./customerService');
const { normalize } = require('../utils/phoneNormalizer');
const User = require('../models/User');
const SyncMeta = require('../models/SyncMeta');

const env = require('../config/env');
const RETURN_API_URL = env.returnReportUrl || process.env.RETURN_REPORT_URL || 'https://rentalapi.rootments.live/api/Reports/GetReturnReport';

const JOB_NAME = 'returnSync';

const getOrCreateMeta = async () => {
  let meta = await SyncMeta.findOne({ jobName: JOB_NAME });
  if (!meta) {
    meta = await SyncMeta.create({
      jobName: JOB_NAME,
      firstSyncCompleted: false,
    });
  }
  return meta;
};

const mapReturnRecordToLead = (rec, store) => {
  const bookingNo = rec.bookingNo || rec.BookingNo || rec.booking_no;
  if (!bookingNo) return null;

  const phone = rec.mobile || rec.Mobile || rec.phone || rec.phoneNo || rec.PhoneNo || null;
  const createdAtSource = rec.returnDate || rec.ReturnDate || rec.date || rec.Date || null;
  const createdAt = createdAtSource ? new Date(createdAtSource) : new Date();

  return {
    bookingNo,
    customerName: rec.customerName || rec.CustomerName || rec.name || rec.customer || null,
    phone,
    store: store.normalizedName || store.name,
    storeCode: store.locCode,
    leadtype: 'return',
    leadStatus: 'new',
    source: 'rms_return_sync',
    createdAt,
    rawData: rec,
  };
};

async function fetchReturnForStore(store, from, to, userID) {
  const body = {
    bookingNo: '',
    dateFrom: from,
    dateTo: to,
    userName: '',
    months: '',
    fromLocation: '',
    userID,
    locationID: store.locCode,
    operationType: '',
  };

  try {
    console.log(`[ReturnSync] Fetching for store: ${store.name} (${store.locCode})`);
    const response = await axios.post(RETURN_API_URL, body, {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });

    const data = response.data || {};
    const records = data.dataSet?.data || data.data || data || [];

    if (!Array.isArray(records) || !records.length) return 0;

    let count = 0;
    for (const rec of records) {
      const leadData = mapReturnRecordToLead(rec, store);
      if (!leadData) continue;

      const normPhone = normalize(leadData.phone || '');
      await LeadMaster.updateOne(
        { bookingNo: leadData.bookingNo, leadtype: 'return' },
        {
          $set: {
            customerName: leadData.customerName,
            phone: leadData.phone,
            normalizedPhone: normPhone || undefined,
            store: leadData.store,
            storeCode: leadData.storeCode,
            source: leadData.source,
            rawData: leadData.rawData,
          },
          $setOnInsert: {
            leadtype: leadData.leadtype,
            leadStatus: leadData.leadStatus,
            createdAt: leadData.createdAt,
          },
        },
        { upsert: true }
      );
      
      // Best-effort customer sync
      const lead = await LeadMaster.findOne({ bookingNo: leadData.bookingNo, leadtype: 'return' }).lean();
      if (lead) customerService.upsertCustomerFromLead(lead).catch(() => {});
      
      count++;
    }
    console.log(`[ReturnSync] Store ${store.locCode} completed. Leads: ${count}`);
    return count;
  } catch (err) {
    console.error(`[ReturnSync] Failed for store ${store.locCode}:`, err.message);
    return 0;
  }
}

const syncReturnLeads = async ({ initial = false } = {}) => {
  const meta = await getOrCreateMeta();
  const today = dayjs().format('YYYY-MM-DD');
  
  // Define range: initial goes back to 2023, incremental uses lastRunAt
  let from = '2023-01-01';
  if (!initial && meta.lastRunAt) {
    from = dayjs(meta.lastRunAt).format('YYYY-MM-DD');
  }

  const stores = await Store.find({ status: 1 }).lean();
  if (!stores.length) {
    console.log('[ReturnSync] No active stores found');
    return;
  }

  const telecaller = await User.findOne({ role: 'Telecaller' }).lean();
  const userID = telecaller?.employeeId || 'SYSTEM';

  console.log(`[ReturnSync] Starting sync: ${from} to ${today} for ${stores.length} stores (Parallel)`);

  // Parallel Execution for all stores
  const tasks = stores.map(store => fetchReturnForStore(store, from, today, userID));
  const results = await Promise.all(tasks);
  
  const totalLeads = results.reduce((a, b) => a + b, 0);

  const now = new Date();
  await SyncMeta.updateOne(
    { jobName: JOB_NAME },
    {
      $set: {
        lastRunAt: now,
        lastSuccessAt: now,
        firstSyncCompleted: true
      }
    },
    { upsert: true }
  );

  console.log(`[ReturnSync] Completed. Total leads sync'd: ${totalLeads}`);
  return { totalLeads };
};

module.exports = {
  syncReturnLeads,
};
