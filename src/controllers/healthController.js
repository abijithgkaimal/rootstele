const mongoose = require('mongoose');
const { success } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const getHealth = asyncHandler(async (req, res) => {
  const healthData = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    memory: process.memoryUsage(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    node_version: process.version,
    process_id: process.pid
  };

  return success(res, healthData, 'Health status retrieved');
});

module.exports = { getHealth };
