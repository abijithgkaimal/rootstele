const axios = require('axios');
const mongoose = require('mongoose');
const Store = require('./src/models/Store');
require('dotenv').config();

const env = require('./src/config/env');
const BOOKING_CONFIRMATION_API_URL = 'https://rentalapi.rootments.live/api/GetBooking/GetBookingSummary';

async function checkYesterdayLeads() {
  try {
    // Connect to database
    await mongoose.connect(env.mongoUri || process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    const stores = await Store.find({ locCode: { $exists: true } });
    console.log(`Found ${stores.length} stores.`);

    const dateFrom = '2026-10-05';
    const dateTo = '2026-10-05';
    
    let totalLeads = 0;
    
    for (const store of stores) {
      const locCode = store.locCode;
      
      try {
        const response = await axios.get(BOOKING_CONFIRMATION_API_URL, {
          params: { locCode, dateFrom, dateTo },
          timeout: 60000
        });
        
        const leadsData = response?.data?.data || response?.data?.dataSet?.data || [];
        console.log(`Store ${locCode} (${store.normalizedName}): ${leadsData.length} leads`);
        totalLeads += leadsData.length;
      } catch (err) {
        console.error(`Error for store ${locCode}: ${err.message}`);
      }
    }
    
    console.log(`\nTotal leads for ${dateFrom}: ${totalLeads}`);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

checkYesterdayLeads();
