const axios = require('axios');
const dayjs = require('dayjs');
const LeadMaster = require('../models/LeadMaster');
const Store = require('../models/Store');
const customerService = require('./customerService');
const { normalize } = require('../utils/phoneNormalizer');
const { normalizeStore } = require('../utils/storeNormalizer');

const env = require('../config/env');
const BOOKING_CONFIRMATION_API_URL =
  env.bookingSummaryUrl ||
  process.env.BOOKING_SUMMARY_URL ||
  'https://rentalapi.rootments.live/api/GetBooking/GetBookingSummary';

const JOB_NAME = 'bookingConfirmationSync';

const syncBookingConfirmationLeads = async ({ initial = false } = {}) => {
  const today = dayjs();
  const dateTo = today.format('YYYY-MM-DD');
  const lookbackDays = initial ? 60 : 7;
  const dateFrom = today.subtract(lookbackDays, 'day').format('YYYY-MM-DD');

  console.log(`[BookingSync] Starting ${initial ? '60-day' : '7-day'} sync: ${dateFrom} → ${dateTo}`);

  try {
    const stores = await Store.find({ locCode: { $exists: true } });
    if (!stores.length) {
      console.log('[BookingSync] No stores found in database.');
      return { totalLeads: 0 };
    }

    let allLeadsFetched = 0;
    const operations = [];
    const phonesToSync = new Set();

    for (const store of stores) {
      const locCode = store.locCode;
      console.log(`[BookingSync] Fetching for location: ${locCode} (${store.normalizedName})`);

      try {
        const fullUrl = BOOKING_CONFIRMATION_API_URL;
        console.log(`[BookingSync] Calling GET ${fullUrl} with params:`, { locCode, dateFrom, dateTo });
        
        const response = await axios.get(fullUrl, {
          params: { locCode, dateFrom, dateTo },
          timeout: 60000 // 60s per store
        });

        // The API returns an array directly or inside data property
        const leadsData = response?.data?.dataSet?.data || response?.data || [];
        if (!Array.isArray(leadsData) || !leadsData.length) {
          console.log(`[BookingSync] No data for locCode: ${locCode}`);
          continue;
        }

        allLeadsFetched += leadsData.length;

        for (const rec of leadsData) {
          // Identify primary keys
          const bookingNo = rec.bookingNo || rec.BookingNo || rec.booking_no;
          if (!bookingNo) continue;

          // Normalize phone as per requirements (like return leads)
          const rawPhone = rec.phoneNo || rec.PhoneNo || rec.mobile || rec.phone || '';
          const normPhone = normalize(rawPhone);
          
          // System identification
          const customerName = rec.customerName || rec.CustomerName || rec.name || '';
          const rawLocation = rec.location || rec.Location || store.normalizedName || 'Other';
          const bookingDateRaw = rec.bookingDate || rec.BookingDate || rec.functionDate || rec.FunctionDate;
          const bookingDate = bookingDateRaw ? new Date(bookingDateRaw) : null;

          if (normPhone) phonesToSync.add(normPhone);

          // Build system fields - these are added at the root
          const systemFields = {
            leadtype: 'bookingConfirmation',
            normalizedPhone: normPhone || undefined,
            phone: rawPhone, // Standard field for our DB
            customerName: customerName,
            store: normalizeStore(rawLocation),
            bookingDate: bookingDate,
            source: 'bookingSync',
          };

          // Protect audit fields from being overwritten by external API
          const { createdBy: _cb, updatedBy: _ub, updatedAt: _ua, createdAt: _ca, ...apiData } = rec;

          // Merge: Original API data + System fields
          // Note: systemFields will take priority if there's a key conflict
          const flatDoc = { ...apiData, ...systemFields };

          operations.push({
            updateOne: {
              filter: { bookingNo, leadtype: 'bookingConfirmation' },
              update: {
                $set: flatDoc,
                $setOnInsert: {
                  leadStatus: 'new',
                  markasComplaint: false,
                  markasFollowup: false,
                  createdAt: bookingDate || new Date(),
                },
              },
              upsert: true,
            },
          });
        }
      } catch (err) {
        console.error(`[BookingSync] Error fetching for locCode ${locCode}:`, err.message);
        // Continue with other stores
      }
    }

    if (operations.length === 0) {
      return { totalLeads: 0 };
    }

    console.log(`[BookingSync] Processing ${operations.length} records...`);

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
    console.error('[BookingSync] Sync process failed:', err.message);
    throw err;
  }
};

module.exports = { syncBookingConfirmationLeads };
