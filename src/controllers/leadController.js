const leadService = require('../services/leadService');
const { success } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

const addLead = asyncHandler(async (req, res) => {
  const payload = {
    ...req.body,
    createdBy: req.user?.employeeId || req.user?.userId || req.user?.name || 'unknown',
  };
  const lead = await leadService.createLead(payload);
  return success(res, lead, 'Lead created', 201);
});

const getCompletedLeads = asyncHandler(async (req, res) => {
  const filters = {
    fromDate: req.query.fromDate,
    toDate: req.query.toDate,
    store: req.query.store,
    leadtype: req.query.leadtype,
    page: req.query.page,
    limit: req.query.limit,
    employeeId: req.user.employeeId,
  };
  const result = await leadService.getCompletedLeads(filters);
  return success(res, result);
});

module.exports = { addLead, getCompletedLeads };
