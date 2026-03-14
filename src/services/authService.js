const axios = require('axios');
const env = require('../config/env');

// Legacy user verification using ROOTMENTS_VERIFY_API (kept for compatibility)
const verifyEmployee = async (userId, password) => {
  try {
    const response = await axios.post(
      env.rootmentsVerifyApi,
      {
        userId,
        password,
      },
      {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' },
      }
    );
    return { valid: true, data: response.data };
  } catch (err) {
    if (err.response?.status === 401 || err.response?.status === 400) {
      return { valid: false };
    }
    throw new Error(err.message || 'Authentication service unavailable');
  }
};

// Telecaller verification against external Rootments API
const verifyTelecaller = async (employeeId, password) => {
  // Use env.verifyEmployeeUrl which has a hardcoded fallback
  const url = env.verifyEmployeeUrl;

  // Bearer token from env.js (has hardcoded fallback)
  const token = env.verifyEmployeeToken;

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  try {
    const response = await axios.post(
      url,
      { employeeId, password },
      { timeout: 10000, headers }
    );

    const body = response.data || {};
    if (body.status !== 'success' || !body.data) {
      return { valid: false, data: null };
    }

    return { valid: true, data: body.data };
  } catch (err) {
    if (err.response?.status === 401 || err.response?.status === 400) {
      return { valid: false, data: null };
    }
    throw new Error(err.message || 'Telecaller verification service unavailable');
  }
};

const generateToken = (payload, options = {}) => {
  const jwt = require('jsonwebtoken');
  const { expiresIn = '7d' } = options;
  return jwt.sign(payload, env.jwtSecret, { expiresIn });
};

module.exports = { verifyEmployee, verifyTelecaller, generateToken };
