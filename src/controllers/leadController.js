const LeadMaster = require('../models/LeadMaster');
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
  console.log("JWT USER:", req.user);
  console.log("Employee ID:", req.user.employeeId);

  const sampleLead = await LeadMaster.findOne({ leadStatus: "completed" });
  console.log("Sample DB Lead updatedBy:", sampleLead?.updatedBy);

  const filters = {
    fromDate: req.query.fromDate,
    toDate: req.query.toDate,
    store: req.query.store,
    leadtype: req.query.leadtype,
    page: req.query.page,
    limit: req.query.limit,
    employeeId: (req.user.employeeId || req.user.userId || "").toString(),
  };
  const result = await leadService.getCompletedLeads(filters);
  return success(res, result);
});

const getMyPerformance = asyncHandler(async (req, res) => {
  const employeeId = (req.user.employeeId || req.user.userId || "").toString();
  const filters = {
    fromDate: req.query.fromDate,
    toDate: req.query.toDate,
    employeeId: employeeId
  };

  const stats = await leadService.getPerformanceStats(filters);
  
  // Return single telecaller performance object
  const result = stats[0] || {
    telecallerId: employeeId,
    name: req.user.name || employeeId,
    totalCalls: 0,
    followup: 0,
    complaint: 0,
    completed: 0
  };

  return success(res, result);
});

module.exports = { addLead, getCompletedLeads, getMyPerformance };
