const cron = require('node-cron');
const { syncReturnLeads } = require('../services/syncReturnLeads');
const { syncBookingConfirmationLeads } = require('../services/syncBookingConfirmationLeads');

let apiSchedulerInitialized = false;

const initializeApiSyncScheduler = async () => {
  if (apiSchedulerInitialized) {
    return;
  }
  apiSchedulerInitialized = true;

  console.log('[ApiSyncScheduler] Initializing RMS sync scheduler');

  // Initial full sync (large date range) on startup
  try {
    console.log('[ApiSyncScheduler] Running initial booking confirmation sync');
    await syncBookingConfirmationLeads({ initial: true });
  } catch (err) {
    console.error(
      '[ApiSyncScheduler] Initial booking confirmation sync failed:',
      err.message || err
    );
  }

  try {
    console.log('[ApiSyncScheduler] Running initial return sync');
    await syncReturnLeads({ initial: true });
  } catch (err) {
    console.error(
      '[ApiSyncScheduler] Initial return sync failed:',
      err.message || err
    );
  }

  // Incremental sync every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    console.log('[ApiSyncScheduler] Running incremental booking confirmation sync');
    try {
      await syncBookingConfirmationLeads({ initial: false });
    } catch (err) {
      console.error(
        '[ApiSyncScheduler] Incremental booking confirmation sync failed:',
        err.message || err
      );
    }

    console.log('[ApiSyncScheduler] Running incremental return sync');
    try {
      await syncReturnLeads({ initial: false });
    } catch (err) {
      console.error(
        '[ApiSyncScheduler] Incremental return sync failed:',
        err.message || err
      );
    }
  });

  console.log('[ApiSyncScheduler] RMS sync scheduler started (every 30 minutes)');
};

module.exports = {
  initializeApiSyncScheduler,
};

