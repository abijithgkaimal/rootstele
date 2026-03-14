const axios = require('axios');
const dayjs = require('dayjs');
const LeadMaster = require('../models/LeadMaster');
const Store = require('../models/Store');
const customerService = require('./customerService');
const { normalize } = require('../utils/phoneNormalizer');
const User = require('../models/User');
const SyncMeta = require('../models/SyncMeta');

const env = require('../config/env');
const BOOKING_CONFIRMATION_API_URL = env.bookingSummaryUrl || process.env.BOOKING_SUMMARY_URL || 'https://rentalapi.rootments.live/api/Reports/GetBookingConfirmationReport';

const JOB_NAME = 'bookingConfirmationSync';

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

const mapBookingRecordToLead = (rec, store) => {
  const bookingNo = rec.bookingNo || rec.BookingNo || rec.booking_no;
  if (!bookingNo) return null;

  const phone = rec.mobile || rec.Mobile || rec.phone || rec.phoneNo || rec.PhoneNo || null;
  const eventDateSource = rec.functionDate || rec.FunctionDate || rec.bookingDate || rec.BookingDate;
  const createdAt = eventDateSource ? new Date(eventDateSource) : new Date();

  return {
    bookingNo,
    customerName: rec.customerName || rec.CustomerName || rec.name || rec.customer || null,
    phone,
    store: store.normalizedName || store.name,
    storeCode: store.locCode,
    leadtype: 'bookingConfirmation',
    leadStatus: 'new',
    source: 'rms_booking_sync',
    createdAt,
    rawData: rec,
  };
};

async function fetchBookingForStore(store, from, to, userID) {
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
    console.log(`[BookingSync] Fetching for store: ${store.name} (${store.locCode})`);
    const response = await axios.post(BOOKING_CONFIRMATION_API_URL, body, {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });

    const data = response.data || {};
    const records = data.dataSet?.data || data.data || data || [];

    if (!Array.isArray(records) || !records.length) return 0;

    let count = 0;
    for (const rec of records) {
      const leadData = mapBookingRecordToLead(rec, store);
      if (!leadData) continue;

      const normPhone = normalize(leadData.phone || '');
      await LeadMaster.updateOne(
        { bookingNo: leadData.bookingNo, leadtype: 'bookingConfirmation' },
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
      
      const lead = await LeadMaster.findOne({ bookingNo: leadData.bookingNo, leadtype: 'bookingConfirmation' }).lean();
      if (lead) customerService.upsertCustomerFromLead(lead).catch(() => {});
      
      count++;
    }
    console.log(`[BookingSync] Store ${store.locCode} completed. Leads: ${count}`);
    return count;
  } catch (err) {
    console.error(`[BookingSync] Failed for store ${store.locCode}:`, err.message);
    return 0;
  }
}

const syncBookingConfirmationLeads = async ({ initial = false } = {}) => {
  const meta = await getOrCreateMeta();
  const today = dayjs().format('YYYY-MM-DD');
  
  let from = '2023-01-01';
  if (!initial && meta.lastRunAt) {
    from = dayjs(meta.lastRunAt).format('YYYY-MM-DD');
  }

  const stores = await Store.find({ status: 1 }).lean();
  if (!stores.length) return;

  const telecaller = await User.findOne({ role: 'Telecaller' }).lean();
  const userID = telecaller?.employeeId || 'SYSTEM';

  console.log(`[BookingSync] Starting sync: ${from} to ${today} for ${stores.length} stores (Parallel)`);

  const tasks = stores.map(store => fetchBookingForStore(store, from, today, userID));
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

  console.log(`[BookingSync] Completed. Total leads sync'd: ${totalLeads}`);
  return { totalLeads };
};

module.exports = {
  syncBookingConfirmationLeads,
};
