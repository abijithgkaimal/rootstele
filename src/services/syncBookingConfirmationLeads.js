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
 * Sync Booking Confirmation Leads from external API.
 * Refactored to call the API once for all stores.
 */
const syncBookingConfirmationLeads = async ({ initial = false } = {}) => {
  const today = dayjs();
  const dateTo = today.format('YYYY-MM-DD');
  
  // Initial sync: 60 days. Incremental: 7 days.
  const lookbackDays = initial ? 60 : 7;
  const dateFrom = today.subtract(lookbackDays, 'day').format('YYYY-MM-DD');

  const telecaller = await User.findOne({ role: 'Telecaller' }).lean();
  const userID = telecaller?.employeeId || 'SYSTEM';

  console.log(`[BookingSync] Starting ${initial ? '60-day initial' : '7-day incremental'} sync: ${dateFrom} to ${dateTo}`);

  const body = {
    bookingNo: '',
    dateFrom,
    dateTo,
    userName: '',
    months: '',
    fromLocation: '',
    userID,
    locationID: '', // Send empty to get all stores
    operationType: '',
  };

  try {
    const response = await axios.post(BOOKING_CONFIRMATION_API_URL, body, {
      timeout: 60000,
      headers: { 'Content-Type': 'application/json' },
    });

    // Extraction as per requirements: response.data.dataSet.data
    const leadsData = response?.data?.dataSet?.data || [];
    console.log(`[BookingSync] Raw leads fetched: ${leadsData.length}`);

    if (!Array.isArray(leadsData) || !leadsData.length) {
      return { totalLeads: 0 };
    }

    let count = 0;
    for (const rec of leadsData) {
      const bookingNo = rec.bookingNo || rec.BookingNo || rec.booking_no;
      if (!bookingNo) continue;

      const phone = rec.mobile || rec.Mobile || rec.phone || rec.phoneNo || rec.PhoneNo || '';
      const normPhone = normalize(phone);
      const customerName = rec.customerName || rec.CustomerName || rec.name || rec.customer || '';
      const location = rec.location || rec.Location || 'Other';
      const bookingDateSource = rec.bookingDate || rec.BookingDate || rec.functionDate || rec.FunctionDate;
      const bookingDate = bookingDateSource ? new Date(bookingDateSource) : null;

      // Upsert into LeadMaster by bookingNo + leadtype
      await LeadMaster.updateOne(
        { bookingNo, leadtype: 'bookingConfirmation' },
        {
          $set: {
            customerName,
            phone,
            normalizedPhone: normPhone || undefined,
            store: location,
            bookingDate,
            source: 'bookingSync',
            rawData: rec,
          },
          $setOnInsert: {
            leadtype: 'bookingConfirmation',
            leadStatus: 'new',
            createdAt: bookingDate || new Date(),
          }
        },
        { upsert: true }
      );

      // Best-effort customer sync (match by phone)
      if (normPhone) {
        const lead = { bookingNo, leadtype: 'bookingConfirmation', phone, customerName, store: location };
        customerService.upsertCustomerFromLead(lead).catch(err => {
          console.error(`[BookingSync] Customer upsert failed for ${phone}:`, err.message);
        });
      }

      count++;
    }

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

    console.log(`[BookingSync] Leads successfully sync'd: ${count}`);
    return { totalLeads: count };
  } catch (err) {
    console.error("[BookingSync] Sync failed:", err.message);
    throw err;
  }
};

module.exports = {
  syncBookingConfirmationLeads,
};
