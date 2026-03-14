const axios = require('axios');
const dayjs = require('dayjs');
const LeadMaster = require('../models/LeadMaster');
const Store = require('../models/Store');
const User = require('../models/User');
const SyncMeta = require('../models/SyncMeta');

const env = require('../config/env');
const BOOKING_CONFIRMATION_API_URL = env.bookingSummaryUrl || process.env.BOOKING_SUMMARY_URL || process.env.BOOKING_CONFIRMATION_RMS_API_URL || 'https://rentalapi.rootments.live/api/Reports/GetBookingConfirmationReport';

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

const computeDateRange = async (initial) => {
  const meta = await getOrCreateMeta();
  const today = dayjs().format('YYYY-MM-DD');

  // Initial full sync starts from a fixed historical date
  if (initial || !meta.lastRunAt) {
    return {
      from: '2023-01-01',
      to: today,
      meta,
      isInitial: true,
    };
  }

  return {
    from: dayjs(meta.lastRunAt).format('YYYY-MM-DD'),
    to: today,
    meta,
    isInitial: false,
  };
};

// Map external booking confirmation record into LeadMaster upsert payload
const mapBookingRecordToLead = (rec, store) => {
  const bookingNo = rec.bookingNo || rec.BookingNo || rec.booking_no;
  if (!bookingNo) return null;

  const customerName =
    rec.customerName || rec.CustomerName || rec.name || rec.customer || null;
  const phone =
    rec.mobile || rec.Mobile || rec.phone || rec.phoneNo || rec.PhoneNo || null;

  const eventDateSource =
    rec.functionDate || rec.FunctionDate || rec.bookingDate || rec.BookingDate;
  const createdAt = eventDateSource ? new Date(eventDateSource) : new Date();

  return {
    bookingNo,
    customerName,
    phone,
    store: store.normalizedName,
    storeCode: store.locCode,
    leadtype: 'bookingConfirmation',
    leadStatus: 'new',
    source: 'rms_booking_sync',
    createdAt,
    rawData: rec,
  };
};

const syncBookingConfirmationLeads = async ({ initial = false } = {}) => {
  const { from, to, meta } = await computeDateRange(initial);

  const stores = await Store.find({ status: 1 }).lean();
  if (!stores.length) {
    throw new Error('No stores found in Stores collection');
  }

  const telecaller = await User.findOne({ role: 'Telecaller' }).lean();
  if (!telecaller) {
    throw new Error('No Telecaller user found in Users collection');
  }

  const userID = telecaller.employeeId;

  let storesProcessed = 0;
  let leadsFetched = 0;
  let leadsInserted = 0;
  let leadsUpdated = 0;

  for (const store of stores) {
    storesProcessed += 1;

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

    let records = [];
    try {
      const response = await axios.post(BOOKING_CONFIRMATION_API_URL, body, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' },
      });

      const data = response.data || {};
      records = data.dataSet?.data || data.data || data || [];
    } catch (err) {
      console.error(
        `[BookingSync] Failed for store ${store.locCode}:`,
        err.message || err
      );
      continue;
    }

    if (!Array.isArray(records) || !records.length) {
      continue;
    }

    leadsFetched += records.length;

    for (const rec of records) {
      const leadData = mapBookingRecordToLead(rec, store);
      if (!leadData) continue;

      try {
        const result = await LeadMaster.updateOne(
          { bookingNo: leadData.bookingNo, leadtype: 'bookingConfirmation' },
          {
            $set: {
              customerName: leadData.customerName,
              phone: leadData.phone,
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

        const upserted =
          result.upsertedCount === 1 ||
          !!(
            result.upsertedId ||
            (result.upsertedIds && Object.keys(result.upsertedIds).length)
          );

        if (upserted) {
          leadsInserted += 1;
        } else if (result.modifiedCount && result.modifiedCount > 0) {
          leadsUpdated += 1;
        }
      } catch (err) {
        console.error(
          `[BookingSync] Upsert failed for bookingNo ${leadData.bookingNo}:`,
          err.message || err
        );
      }
    }
  }

  const now = new Date();
  meta.lastRunAt = now;
  meta.lastSuccessAt = now;
  await meta.save();

  console.log(
    `[BookingSync] Completed. stores=${storesProcessed}, fetched=${leadsFetched}, inserted=${leadsInserted}, updated=${leadsUpdated}`
  );

  return {
    storesProcessed,
    leadsFetched,
    leadsInserted,
    leadsUpdated,
    dateFrom: from,
    dateTo: to,
  };
};

module.exports = {
  syncBookingConfirmationLeads,
};

