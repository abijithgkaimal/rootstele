require('dotenv').config();
const mongoose = require('mongoose');
const env = require('./src/config/env');
const { syncBookingConfirmationLeads } = require('./src/services/syncBookingConfirmationLeads');

async function runManualSync() {
  try {
    await mongoose.connect(env.mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Database connected. Starting sync...');
    
    // Call the sync function (without 'initial' so it fetches the last 7 days)
    const result = await syncBookingConfirmationLeads();
    
    console.log(`Sync completed successfully! Processed leads: ${result.totalLeads}`);
  } catch (err) {
    console.error('Error during manual sync:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Database disconnected.');
  }
}

runManualSync();
