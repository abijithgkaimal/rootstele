const LeadMaster = require('../models/LeadMaster');
const { success, error } = require('../utils/apiResponse');
const mongoose = require('mongoose');
const returnSyncService = require('../services/returnSyncService');

const syncReturnLeads = async (req, res) => {
  try {
    const result = await returnSyncService.syncReturnLeads();
    return success(res, result);
  } catch (err) {
    return error(res, err.message || 'Sync failed', 500);
  }
};

const getReturnLeads = async (req, res) => {
  try {
    const leads = await LeadMaster.find({ leadtype: 'return' })
      .sort({ createdAt: -1 })
      .lean();

    return success(res, leads);
  } catch (err) {
    return error(res, err.message || 'Failed to fetch return leads', 500);
  }
};

const updateReturnLead = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      service,
      callDuration,
      noofFunctions,
      noofAttires,
      competitor,
      rating,
      remarks,
      updatedBy,
      updatedAt,
      markasComplaint,
      markasFollowup,
      followupDate,
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return error(res, 'Invalid lead ID', 400);
    }

    let leadStatus = 'completed';
    if (markasFollowup === true) leadStatus = 'followup';
    if (markasComplaint === true) leadStatus = 'complaint';

    const updateData = {
      service,
      callDuration,
      noofFunctions,
      noofAttires,
      competitor,
      rating,
      remarks,
      updatedBy,
      updatedAt: updatedAt ? new Date(updatedAt) : new Date(),
      markasComplaint,
      markasFollowup,
      followupDate: followupDate ? new Date(followupDate) : undefined,
      leadStatus,
    };

    Object.keys(updateData).forEach((k) => {
      if (updateData[k] === undefined) delete updateData[k];
    });

    const lead = await LeadMaster.findOneAndUpdate(
      { _id: id, leadtype: 'return' },
      updateData,
      { new: true }
    );

    if (!lead) {
      return error(res, 'Return lead not found', 404);
    }

    return success(res, lead);
  } catch (err) {
    return error(res, err.message || 'Failed to update return lead', 500);
  }
};

module.exports = {
  syncReturnLeads,
  getReturnLeads,
  updateReturnLead,
};
