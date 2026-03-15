const axios = require('axios');
const dayjs = require('dayjs');
const LeadMaster = require('../models/LeadMaster');
const customerService = require('./customerService');
const { normalize } = require('../utils/phoneNormalizer');
const { normalizeStore } = require('../utils/storeNormalizer');

const env = require('../config/env');
const BOOKING_CONFIRMATION_API_URL =
  env.bookingSummaryUrl ||
  process.env.BOOKING_SUMMARY_URL ||
  'https://rentalapi.rootments.live/api/Repo/GetBookingSummary';

const JOB_NAME = 'bookingConfirmationSync';

const syncBookingConfirmationLeads = async ({ initial = false } = {}) => {
  const today = dayjs();
  const dateTo = today.format('YYYY-MM-DD');
  const lookbackDays = initial ? 60 : 7;
  const dateFrom = today.subtract(lookbackDays, 'day').format('YYYY-MM-DD');

  console.log(`[BookingSync] Starting ${initial ? '60-day' : '7-day'} sync: ${dateFrom} → ${dateTo}`);

  try {
    const response = await axios.post(
      BOOKING_CONFIRMATION_API_URL,
      { dateFrom, dateTo },
      { timeout: 900000, headers: { 'Content-Type': 'application/json' } }
    );

    const leadsData = response?.data?.dataSet?.data || response?.data || [];
    if (!Array.isArray(leadsData) || !leadsData.length) {
      console.log('[BookingSync] No data returned from API.');
      return { totalLeads: 0 };
    }

    console.log(`[BookingSync] Fetched ${leadsData.length} records. Processing...`);

    const operations = [];
    const phonesToSync = new Set();

    for (const rec of leadsData) {
      // Extract system-level fields
      const bookingNo = rec.bookingNo || rec.BookingNo || rec.booking_no;
      if (!bookingNo) continue;

      const phone = rec.phoneNo || rec.PhoneNo || rec.mobile || rec.phone || '';
      const normPhone = normalize(phone);
      const customerName = rec.customerName || rec.CustomerName || rec.name || '';
      const location = rec.location || rec.Location || 'Other';
      const bookingDateRaw = rec.bookingDate || rec.BookingDate || rec.functionDate || rec.FunctionDate;
      const bookingDate = bookingDateRaw ? new Date(bookingDateRaw) : null;

      if (normPhone) phonesToSync.add(normPhone);

      // Remove fields that will be set via systemFields to avoid duplicates
      const {
        bookingNo: _bn,
        BookingNo: _bn2,
        booking_no: _bn3,
        customerName: _cn,
        CustomerName: _cn2,
        name: _n,
        phoneNo: _p1,
        PhoneNo: _p2,
        mobile: _p3,
        phone: _p4,
        location: _loc1,
        Location: _loc2,
        ...apiRest
      } = rec;

      // System fields — these take priority
      const systemFields = {
        bookingNo,
        leadtype: 'bookingConfirmation',
        phone: phone,
        normalizedPhone: normPhone || undefined,
        customerName,
        store: normalizeStore(location),
        bookingDate,
        source: 'bookingSync',
      };

      // Flat merged document: API extras + system fields (system wins on conflicts)
      // Strip audit fields — these must NEVER be set by external sync.
      // createdBy / updatedBy / updatedAt belong to telecaller actions only.
      const { createdBy: _cb, updatedBy: _ub, updatedAt: _ua, createdAt: _ca, ...safeApiRest } = apiRest;
      const flatDoc = { ...safeApiRest, ...systemFields };

      operations.push({
        updateOne: {
          filter: { bookingNo, leadtype: 'bookingConfirmation' },
          update: {
            $set: flatDoc,
            $setOnInsert: {
              leadStatus: 'new',
              markasComplaint: false,
              markasFollowup: false,
              createdAt: bookingDate || new Date(), // set only on first insert
            },
          },
          upsert: true,
        },
      });
    }

    let upserted = 0;
    let modified = 0;
    const chunkSize = 500;
    for (let i = 0; i < operations.length; i += chunkSize) {
      const result = await LeadMaster.bulkWrite(
        operations.slice(i, i + chunkSize),
        { ordered: false }
      );
      upserted += result.upsertedCount;
      modified += result.modifiedCount;
    }

    console.log(`[BookingSync] Done. New: ${upserted}, Updated: ${modified}`);

    for (const phone of phonesToSync) {
      customerService.recomputeCustomerState(phone).catch(() => { });
    }

    return { totalLeads: upserted + modified };
  } catch (err) {
    console.error('[BookingSync] Sync failed:', err.message);
    throw err;
  }
};

module.exports = { syncBookingConfirmationLeads };
