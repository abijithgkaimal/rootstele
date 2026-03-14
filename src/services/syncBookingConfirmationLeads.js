const axios = require('axios');
const dayjs = require('dayjs');
const LeadMaster = require('../models/LeadMaster');
const customerService = require('./customerService');
const { normalize } = require('../utils/phoneNormalizer');
const User = require('../models/User');
const SyncMeta = require('../models/SyncMeta');

const env = require('../config/env');
const BOOKING_CONFIRMATION_API_URL = env.bookingSummaryUrl || process.env.BOOKING_SUMMARY_URL || 'https://rentalapi.rootments.live/api/Repo/GetBookingSummary';

const JOB_NAME = 'bookingConfirmationSync';

/**
 * High-performance sync using BulkWrite.
 */
const syncBookingConfirmationLeads = async ({ initial = false } = {}) => {
  const today = dayjs();
  const dateTo = today.format('YYYY-MM-DD');
  const lookbackDays = initial ? 60 : 7;
  const dateFrom = today.subtract(lookbackDays, 'day').format('YYYY-MM-DD');

  console.log(`[BookingSync] Starting ${initial ? '60-day' : '7-day'} sync: ${dateFrom} to ${dateTo}`);

  // Slim body to match Postman logic
  const body = { dateFrom, dateTo };

  try {
    const response = await axios.post(BOOKING_CONFIRMATION_API_URL, body, {
      timeout: 900000, // 15 minutes
      headers: { 'Content-Type': 'application/json' },
    });

    const leadsData = response?.data?.dataSet?.data || response?.data || [];
    if (!Array.isArray(leadsData) || !leadsData.length) {
      console.log("[BookingSync] No data returned from API.");
      return { totalLeads: 0 };
    }

    console.log(`[BookingSync] Raw leads fetched: ${leadsData.length}. Processing...`);

    const operations = [];
    const phonesToSync = new Set();

    for (const rec of leadsData) {
      const bookingNo = rec.bookingNo || rec.BookingNo || rec.booking_no;
      if (!bookingNo) continue;

      const phone = rec.mobile || rec.Mobile || rec.phone || rec.phoneNo || rec.PhoneNo || '';
      const normPhone = normalize(phone);
      const customerName = rec.customerName || rec.CustomerName || rec.name || rec.customer || '';
      const location = rec.location || rec.Location || 'Other';
      const bookingDateSource = rec.bookingDate || rec.BookingDate || rec.functionDate || rec.FunctionDate;
      const bookingDate = bookingDateSource ? new Date(bookingDateSource) : null;

      if (normPhone) phonesToSync.add(normPhone);

      operations.push({
        updateOne: {
          filter: { bookingNo, leadtype: 'bookingConfirmation' },
          update: {
            $set: {
              ...rec, // Flatten
              customerName,
              phone,
              normalizedPhone: normPhone || undefined,
              store: location,
              bookingDate,
              source: 'bookingSync',
            },
            $setOnInsert: {
              leadtype: 'bookingConfirmation',
              leadStatus: 'new',
              createdAt: bookingDate || new Date(),
            }
          },
          upsert: true
        }
      });
    }

    let processedCount = 0;
    const chunkSize = 500;
    for (let i = 0; i < operations.length; i += chunkSize) {
      const chunk = operations.slice(i, i + chunkSize);
      const result = await LeadMaster.bulkWrite(chunk, { ordered: false });
      processedCount += (result.upsertedCount + result.modifiedCount);
    }

    // Bulk Customer Recomputation
    console.log(`[BookingSync] Syncing ${phonesToSync.size} unique customers...`);
    for (const phone of phonesToSync) {
      customerService.recomputeCustomerState(phone).catch(() => {});
    }

    const now = new Date();
    await SyncMeta.updateOne(
      { jobName: JOB_NAME },
      { $set: { lastRunAt: now, lastSuccessAt: now, firstSyncCompleted: true } },
      { upsert: true }
    );

    console.log(`[BookingSync] Completed. Total processed/upserted: ${processedCount}`);
    return { totalLeads: processedCount };
  } catch (err) {
    console.error("[BookingSync] Sync failed:", err.message);
    throw err;
  }
};

module.exports = { syncBookingConfirmationLeads };
