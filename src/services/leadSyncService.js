/**
 * Master orchestrator for external sync: Store → Return → Booking Confirmation.
 * Called by masterSyncScheduler.
 */
const { syncStores } = require('./storeSyncService');
const { syncReturnLeads } = require('./syncReturnLeads');
const { syncBookingConfirmationLeads } = require('./syncBookingConfirmationLeads');

const runFullSync = async (options = {}) => {
  const { initial = false } = options;
  console.log('[LeadSyncService] Starting sync (initial=%s)', initial);

  await syncStores();
  await syncReturnLeads({ initial }); // Return sync before booking
  await syncBookingConfirmationLeads({ initial });

  console.log('[LeadSyncService] Sync completed');
  return { ok: true };
};

module.exports = {
  runFullSync,
};
