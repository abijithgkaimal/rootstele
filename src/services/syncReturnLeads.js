const axios = require('axios');
const dayjs = require('dayjs');
const LeadMaster = require('../models/LeadMaster');
const customerService = require('./customerService');
const { normalize } = require('../utils/phoneNormalizer');
const { normalizeStore } = require('../utils/storeNormalizer');

const env = require('../config/env');
const RETURN_API_URL =
  env.returnReportUrl ||
  process.env.RETURN_REPORT_URL ||
  'https://rentalapi.rootments.live/api/Reports/GetReturnReport';

const JOB_NAME = 'returnSync';

const syncReturnLeads = async ({ initial = false } = {}) => {
  const today = dayjs();
  const dateTo = today.format('YYYY-MM-DD');
  const lookbackDays = initial ? 60 : 7;
  const dateFrom = today.subtract(lookbackDays, 'day').format('YYYY-MM-DD');

  console.log(`[ReturnSync] Starting ${initial ? '60-day' : '7-day'} sync: ${dateFrom} → ${dateTo}`);

  try {
    const response = await axios.post(
      RETURN_API_URL,
      { dateFrom, dateTo },
      { timeout: 900000, headers: { 'Content-Type': 'application/json' } }
    );

    const leadsData = response?.data?.dataSet?.data || response?.data || [];
    if (!Array.isArray(leadsData) || !leadsData.length) {
      console.log('[ReturnSync] No data returned from API.');
      return { totalLeads: 0 };
    }

    console.log(`[ReturnSync] Fetched ${leadsData.length} records. Processing...`);

    const operations = [];
    const phonesToSync = new Set();

    for (const rec of leadsData) {
      // Extract system-level fields with clear aliases
      const bookingNo = rec.bookingNo || rec.BookingNo || rec.booking_no;
      if (!bookingNo) continue;

      const phone = rec.phoneNo || rec.PhoneNo || rec.mobile || rec.phone || '';
      const normPhone = normalize(phone);
      const customerName = rec.customerName || rec.CustomerName || rec.name || '';
      const location = rec.location || rec.Location || 'Other';
      const returnDateRaw = rec.returnDate || rec.ReturnDate || rec.date || rec.Date;
      const returnDate = returnDateRaw ? new Date(returnDateRaw) : null;

      if (normPhone) phonesToSync.add(normPhone);

      // Build a clean copy without fields we'll override in systemFields
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
        leadtype: 'return',
        phone: phone,
        normalizedPhone: normPhone || undefined,
        customerName,
        store: normalizeStore(location),
        returnDate,
        source: 'returnSync',
      };

      // Flat merged document: API extras + system fields (system wins on conflicts)
      // Strip audit fields — these must NEVER be set by external sync.
      // createdBy / updatedBy / updatedAt belong to telecaller actions only.
      const { createdBy: _cb, updatedBy: _ub, updatedAt: _ua, createdAt: _ca, ...safeApiRest } = apiRest;
      const flatDoc = { ...safeApiRest, ...systemFields };

      operations.push({
        updateOne: {
          filter: { bookingNo, leadtype: 'return' },
          update: {
            $set: flatDoc,
            $setOnInsert: {
              leadStatus: 'new',
              markasComplaint: false,
              markasFollowup: false,
              createdAt: returnDate || new Date(), // set only on first insert
              updatedAt: returnDate || new Date(),
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
        { ordered: false, timestamps: false }
      );
      upserted += result.upsertedCount;
      modified += result.modifiedCount;
    }

    console.log(`[ReturnSync] Done. New: ${upserted}, Updated: ${modified}`);

    // Background customer recompute
    for (const phone of phonesToSync) {
      customerService.recomputeCustomerState(phone).catch(() => { });
    }

    return { totalLeads: upserted + modified };
  } catch (err) {
    console.error('[ReturnSync] Sync failed:', err.message);
    throw err;
  }
};

module.exports = { syncReturnLeads };
