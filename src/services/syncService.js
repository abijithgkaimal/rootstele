// Placeholder sync service used by the existing syncController.
// The actual automated sync pipeline is handled by leadSyncService
// and the scheduler. These functions can later be extended to
// delegate to the same implementation if manual triggers are needed.

const syncBookingConfirmation = async () => {
  console.log('[SyncService] Manual booking confirmation sync endpoint called.');
  return {
    fetched: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
  };
};

const syncReturnLeads = async () => {
  console.log('[SyncService] Manual return sync endpoint called.');
  return {
    fetched: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
  };
};

module.exports = {
  syncBookingConfirmation,
  syncReturnLeads,
};

