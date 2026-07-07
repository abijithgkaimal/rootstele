const axios = require('axios');
const env = require('../config/env');

// Helper to execute an API call with retries for transient errors (timeouts, network, or 5xx)
const callWithRetry = async (apiCallFn, retries = 2, delay = 1000) => {
  let lastError;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await apiCallFn();
    } catch (err) {
      lastError = err;
      const isTimeout = err.code === 'ECONNABORTED' || err.message?.includes('timeout');
      const isTransientStatus = err.response && (err.response.status === 429 || (err.response.status >= 500 && err.response.status <= 599));
      const isNetworkError = !err.response && err.request;

      // Only retry if it is a timeout, a network error, or a transient 429/5xx error
      if (attempt <= retries && (isTimeout || isNetworkError || isTransientStatus)) {
        console.warn(`[AuthService] External API call failed (Attempt ${attempt}/${retries + 1}). Retrying in ${delay}ms... Error: ${err.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
        continue;
      }
      throw err;
    }
  }
  throw lastError;
};

// Fallback user credentials for emergency access when external API is down/times out
const FALLBACK_USERS = [
  { employeeId: 'EMP550', name: 'Athulya', password: '123456', role: 'Telecaller', store: null },
  { employeeId: 'EMP436', name: 'Varsha', password: '123456', role: 'Telecaller', store: null },
  { employeeId: 'EMP538', name: 'Athira', password: '123456', role: 'Telecaller', store: null },
  { employeeId: 'EMP188', name: 'Shafna', password: '151298', role: 'Telecaller', store: null },
];

// Legacy user verification using ROOTMENTS_VERIFY_API (kept for compatibility)
const verifyEmployee = async (userId, password) => {
  try {
    const response = await callWithRetry(() =>
      axios.post(
        env.rootmentsVerifyApi,
        {
          userId,
          password,
        },
        {
          timeout: 30000,
          httpsAgent: new (require('https').Agent)({ family: 4 }),
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );
    return { valid: true, data: response.data };
  } catch (err) {
    // Attempt fallback login if external API failed (excluding explicit 401/400 validation failures)
    const isValidationFailure = err.response?.status === 401 || err.response?.status === 400;
    if (!isValidationFailure) {
      const inputEmpId = String(userId).replace(/\s+/g, '').toUpperCase();
      const fallbackUser = FALLBACK_USERS.find(u => u.employeeId === inputEmpId);
      if (fallbackUser) {
        if (fallbackUser.password === password) {
          console.log(`[AuthService] Fallback authenticated user ${inputEmpId} for verifyEmployee`);
          return {
            valid: true,
            data: {
              employeeId: fallbackUser.employeeId,
              name: fallbackUser.name,
              role: fallbackUser.role,
              Store: fallbackUser.store,
              store: fallbackUser.store,
            }
          };
        } else {
          console.log(`[AuthService] Fallback user match for ${inputEmpId} but incorrect password`);
          return { valid: false };
        }
      }
    }

    if (isValidationFailure) {
      return { valid: false };
    }
    throw new Error(err.message || 'Authentication service unavailable');
  }
};

// Telecaller verification against external Rootments API
const verifyTelecaller = async (employeeId, password) => {
  const url = env.verifyEmployeeUrl;
  const token = process.env.ROOTMENTS_API_TOKEN;

  try {
    if (!token) {
      console.error('[AuthService] ROOTMENTS_API_TOKEN environment variable is not set.');
      throw new Error('Telecaller verification service is not configured');
    }

    const response = await callWithRetry(() =>
      axios.post(
        url,
        { employeeId: String(employeeId).toUpperCase(), password },
        {
          timeout: 20000, // Increased from 10000 to 20000 to prevent premature timeout
          httpsAgent: new (require('https').Agent)({ family: 4 }),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'PostmanRuntime/7.32.3',
            'Accept': '*/*'
          },
        }
      )
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

    // Attempt fallback login if external API failed (excluding explicit 401/400 validation failures)
    const isValidationFailure = err.response?.status === 401 || err.response?.status === 400;
    if (!isValidationFailure) {
      const inputEmpId = String(employeeId).replace(/\s+/g, '').toUpperCase();
      const fallbackUser = FALLBACK_USERS.find(u => u.employeeId === inputEmpId);
      if (fallbackUser) {
        if (fallbackUser.password === password) {
          console.log(`[AuthService] Fallback authenticated user ${inputEmpId} for verifyTelecaller`);
          return {
            valid: true,
            data: {
              employeeId: fallbackUser.employeeId,
              name: fallbackUser.name,
              role: fallbackUser.role,
              Store: fallbackUser.store,
              store: fallbackUser.store,
            }
          };
        } else {
          console.log(`[AuthService] Fallback user match for ${inputEmpId} but incorrect password`);
          return { valid: false, data: null };
        }
      }
    }

    if (isValidationFailure) {
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
