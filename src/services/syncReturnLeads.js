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
 * Sync Return Leads from external API.
 * Refactored to call the API once for all stores.
 */
const syncReturnLeads = async ({ initial = false } = {}) => {
  const today = dayjs();
  const dateTo = today.format('YYYY-MM-DD');
  
  // Initial sync: 60 days. Incremental: 7 days.
  const lookbackDays = initial ? 60 : 7;
  const dateFrom = today.subtract(lookbackDays, 'day').format('YYYY-MM-DD');

  const telecaller = await User.findOne({ role: 'Telecaller' }).lean();
  const userID = telecaller?.employeeId || 'SYSTEM';

  console.log(`[ReturnSync] Starting ${initial ? '60-day initial' : '7-day incremental'} sync: ${dateFrom} to ${dateTo}`);

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
    const response = await axios.post(RETURN_API_URL, body, {
      timeout: 60000,
      headers: { 'Content-Type': 'application/json' },
    });

    // Extraction as per requirements
    const leadsData = response?.data?.dataSet?.data || [];
    console.log(`[ReturnSync] Raw leads fetched: ${leadsData.length}`);

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
      const returnDateSource = rec.returnDate || rec.ReturnDate || rec.date || rec.Date;
      const returnDate = returnDateSource ? new Date(returnDateSource) : null;

      // Upsert into LeadMaster by bookingNo + leadtype
      await LeadMaster.updateOne(
        { bookingNo, leadtype: 'return' },
        {
          $set: {
            customerName,
            phone,
            normalizedPhone: normPhone || undefined,
            store: location,
            returnDate,
            source: 'returnSync',
            rawData: rec,
          },
          $setOnInsert: {
            leadtype: 'return',
            leadStatus: 'new',
            createdAt: returnDate || new Date(),
          }
        },
        { upsert: true }
      );

      // Best-effort customer sync (match by phone as per requirement 8)
      if (normPhone) {
        // We use the existing customerService to maintain consistency
        const lead = { bookingNo, leadtype: 'return', phone, customerName, store: location };
        customerService.upsertCustomerFromLead(lead).catch(err => {
          console.error(`[ReturnSync] Customer upsert failed for ${phone}:`, err.message);
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

    console.log(`[ReturnSync] Leads successfully sync'd: ${count}`);
    return { totalLeads: count };
  } catch (err) {
    console.error("[ReturnSync] Sync failed:", err.message);
    throw err; // Re-throw to be caught by master scheduler
  }
};

module.exports = {
  syncReturnLeads,
};
