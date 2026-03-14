const { syncStores } = require('../services/storeSyncService');
const { syncReturnLeads } = require('../services/syncReturnLeads');
const { syncBookingConfirmationLeads } = require('../services/syncBookingConfirmationLeads');
const { success } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

// Manual booking confirmation sync trigger (uses RMS placeholder API).
const syncBookingConfirmation = asyncHandler(async (req, res) => {
  const { initial } = req.body || {};
  const result = await syncBookingConfirmationLeads({ initial: !!initial });
  return success(res, result, 'Booking confirmation sync completed');
});

// Sync return leads from RMS system for all stores.
const syncReturns = asyncHandler(async (req, res) => {
  const { initial } = req.body || {};
  const result = await syncReturnLeads({ initial: !!initial });
  return success(res, result, 'Return sync completed');
});

const syncStoresManual = asyncHandler(async (req, res) => {
  const result = await syncStores();
  return success(res, result, 'Store sync completed');
});

module.exports = { syncStores: syncStoresManual, syncBookingConfirmation, syncReturns };
