/**
 * Master orchestrator for external sync: Store → Return → Booking Confirmation.
 * Called by masterSyncScheduler.
 */
const { syncStores } = require('./storeSyncService');
const { syncReturnLeads } = require('./syncReturnLeads');
const { syncBookingConfirmationLeads } = require('./syncBookingConfirmationLeads');
const { syncJustDialLeads } = require('./justDialSync');

const runFullSync = async (options = {}) => {
  const { initial = false } = options;
  console.log('[LeadSyncService] Starting sync (initial=%s)', initial);

  // 1. Store sync
  try {
    await syncStores();
  } catch (e) {
    console.error('[LeadSyncService] Store sync failed:', e.message);
  }

  // 2. Booking confirmation sync
  try {
    await syncBookingConfirmationLeads({ initial });
  } catch (e) {
    console.error('[LeadSyncService] Booking confirmation sync failed:', e.message);
  }

  // 3. Return sync
  try {
    await syncReturnLeads({ initial });
  } catch (e) {
    console.error('[LeadSyncService] Return sync failed:', e.message);
  }

  // 4. JustDial sync
  try {
    await syncJustDialLeads({ initial });
  } catch (e) {
    console.error('[LeadSyncService] JustDial sync failed:', e.message);
  }

  console.log('[LeadSyncService] Sync completed');
  return { ok: true };
};

module.exports = {
  runFullSync,
};
