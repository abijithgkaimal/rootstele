const axios = require('axios');
const dayjs = require('dayjs');
const LeadMaster = require('../models/LeadMaster');
const customerService = require('./customerService');
const { normalize } = require('../utils/phoneNormalizer');
const User = require('../models/User');
const SyncMeta = require('../models/SyncMeta');

const env = require('../config/env');
const RETURN_API_URL = env.returnReportUrl || process.env.RETURN_REPORT_URL || 'https://rentalapi.rootments.live/api/Reports/GetReturnReport';

const JOB_NAME = 'returnSync';

/**
 * High-performance sync using BulkWrite.
 */
const syncReturnLeads = async ({ initial = false } = {}) => {
  const today = dayjs();
  const dateTo = today.format('YYYY-MM-DD');
  const lookbackDays = initial ? 60 : 7;
  const dateFrom = today.subtract(lookbackDays, 'day').format('YYYY-MM-DD');

  console.log(`[ReturnSync] Starting ${initial ? '60-day' : '7-day'} sync: ${dateFrom} to ${dateTo}`);

  // Slim body to match Postman exactly
  const body = { dateFrom, dateTo };

  try {
    const response = await axios.post(RETURN_API_URL, body, {
      timeout: 900000, // 15 minutes for massive 60-day datasets
      headers: { 'Content-Type': 'application/json' },
    });

    const leadsData = response?.data?.dataSet?.data || response?.data || [];
    if (!Array.isArray(leadsData) || !leadsData.length) {
      console.log("[ReturnSync] No data returned from API.");
      return { totalLeads: 0 };
    }

    console.log(`[ReturnSync] Raw leads fetched: ${leadsData.length}. Processing...`);

    const operations = [];
    const phonesToSync = new Set();

    for (const rec of leadsData) {
      const bookingNo = rec.bookingNo || rec.BookingNo || rec.booking_no;
      if (!bookingNo) continue;

      const phone = rec.mobile || rec.Mobile || rec.phone || rec.phoneNo || rec.PhoneNo || '';
      const normPhone = normalize(phone);
      const customerName = rec.customerName || rec.CustomerName || rec.name || rec.customer || '';
      const location = rec.location || rec.Location || 'Other';
      const returnDateSource = rec.returnDate || rec.ReturnDate || rec.date || rec.Date;
      const returnDate = returnDateSource ? new Date(returnDateSource) : null;

      if (normPhone) phonesToSync.add(normPhone);

      operations.push({
        updateOne: {
          filter: { bookingNo, leadtype: 'return' },
          update: {
            $set: {
              ...rec, // Flatten
              customerName,
              phone,
              normalizedPhone: normPhone || undefined,
              store: location,
              returnDate,
              source: 'returnSync',
            },
            $setOnInsert: {
              leadtype: 'return',
              leadStatus: 'new',
              createdAt: returnDate || new Date(),
            }
          },
          upsert: true
        }
      });
    }

    // Execute in chunks of 500 to prevent BSON limits
    let processedCount = 0;
    const chunkSize = 500;
    for (let i = 0; i < operations.length; i += chunkSize) {
      const chunk = operations.slice(i, i + chunkSize);
      const result = await LeadMaster.bulkWrite(chunk, { ordered: false });
      processedCount += (result.upsertedCount + result.modifiedCount);
    }

    // Bulk Customer Recomputation
    console.log(`[ReturnSync] Syncing ${phonesToSync.size} unique customers...`);
    for (const phone of phonesToSync) {
      customerService.recomputeCustomerState(phone).catch(() => {});
    }

    const now = new Date();
    await SyncMeta.updateOne(
      { jobName: JOB_NAME },
      { $set: { lastRunAt: now, lastSuccessAt: now, firstSyncCompleted: true } },
      { upsert: true }
    );

    console.log(`[ReturnSync] Completed. Total processed/upserted: ${processedCount}`);
    return { totalLeads: processedCount };
  } catch (err) {
    console.error("[ReturnSync] Sync failed:", err.message);
    throw err;
  }
};

module.exports = { syncReturnLeads };
