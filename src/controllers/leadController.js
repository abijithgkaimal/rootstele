const leadService = require('../services/leadService');
const { success } = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

const addLead = asyncHandler(async (req, res) => {
  const lead = await leadService.createLead(req.body);
  return success(res, lead, 'Lead created', 201);
});

const getCompletedLeads = asyncHandler(async (req, res) => {
  const filters = {
    // Accept both legacy fromDate/toDate and new dateFrom/dateTo
    fromDate: req.query.dateFrom || req.query.fromDate,
    toDate: req.query.dateTo || req.query.toDate,
    store: req.query.store,
    leadtype: req.query.leadtype,
    page: req.query.page,
    limit: req.query.limit,
  };
  const result = await leadService.getCompletedLeads(filters);
  return success(res, result);
});

module.exports = { addLead, getCompletedLeads };
