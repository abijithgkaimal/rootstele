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
  const url = env.verifyEmployeeUrl;
  const token = process.env.ROOTMENTS_API_TOKEN;

  if (!token) {
    console.error('[AuthService] ROOTMENTS_API_TOKEN environment variable is not set.');
    throw new Error('Telecaller verification service is not configured');
  }

  try {
    const response = await axios.post(
      url,
      { employeeId, password },
      {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    const body = response.data || {};
    if (body.status !== 'success' || !body.data) {
      return { valid: false, data: null };
    }

    return { valid: true, data: body.data };
  } catch (err) {
    // Log actual external API error for debugging (token not exposed)
    const externalError = err.response?.data || err.message;
    console.error('[AuthService] External verify API error:', JSON.stringify(externalError));

    if (err.response?.status === 401 || err.response?.status === 400) {
      return { valid: false, data: null };
    }
    throw new Error('Telecaller verification service unavailable');
  }
};

const generateToken = (payload, options = {}) => {
  const jwt = require('jsonwebtoken');
  const { expiresIn = '7d' } = options;
  return jwt.sign(payload, env.jwtSecret, { expiresIn });
};

module.exports = { verifyEmployee, verifyTelecaller, generateToken };
