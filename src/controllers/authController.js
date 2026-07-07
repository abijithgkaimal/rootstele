const authService = require('../services/authService');
const { success, error } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const User = require('../models/User');

const login = asyncHandler(async (req, res) => {
  const { userId, password } = req.body;

  const result = await authService.verifyEmployee(userId, password);
  if (!result.valid) {
    return error(res, 'Invalid credentials', 401);
  }

  const token = authService.generateToken({ userId, ...result.data });
  const data = {
    message: 'Login successful',
    token,
    user: result.data,
  };

  // Upsert user into local users collection (to reflect in the admin panel)
  const empId = result.data?.employeeId || result.data?.userId || userId;
  if (empId) {
    const formattedEmpId = String(empId).replace(/\s+/g, '').toUpperCase();
    await User.findOneAndUpdate(
      { employeeId: { $regex: new RegExp('^' + formattedEmpId + '$', 'i') } },
      {
        employeeId: formattedEmpId,
        name: result.data?.name || formattedEmpId,
        role: result.data?.role || 'Telecaller',
        store: result.data?.Store || result.data?.store || null,
        lastLoginAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  return success(res, data, 'Login successful');
});

// Telecaller login using external VERIFY_EMPLOYEE_API_URL and Bearer token
const telecallerLogin = asyncHandler(async (req, res) => {
  // Accept 'employeeId' (standard) or 'userId' (Flutter app compatibility)
  const employeeId = req.body.employeeId || req.body.userId;
  const { password } = req.body;
  const ts = new Date().toISOString();

  if (!employeeId || !password) {
    console.log(`[TelecallerLogin] ${ts} missing credentials`);
    return res.status(400).json({
      status: 'error',
      message: 'employeeId (or userId) and password are required',
    });
  }

  try {
    const result = await authService.verifyTelecaller(employeeId, password);

    if (!result.valid) {
      console.log(`[TelecallerLogin] ${ts} employeeId=${employeeId} failed (invalid credentials)`);
      return res.status(401).json({
        status: 'error',
        message: 'Invalid credentials',
      });
    }

    const data = result.data;
    const user = {
      employeeId: data.employeeId,
      name: data.name,
      role: data.role,
      store: data.Store || data.store || null,
    };

    // Upsert telecaller into local users collection (no password stored)
    const formattedEmpId = String(user.employeeId).replace(/\s+/g, '').toUpperCase();
    await User.findOneAndUpdate(
      { employeeId: { $regex: new RegExp('^' + formattedEmpId + '$', 'i') } },
      {
        employeeId: formattedEmpId,
        name: user.name,
        role: user.role,
        store: user.store,
        lastLoginAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const token = authService.generateToken(user, { expiresIn: '12h' });

    console.log(`[TelecallerLogin] ${ts} employeeId=${employeeId} success`);

    return res.status(200).json({
      status: 'success',
      token,
      user,
    });
  } catch (err) {
    console.log(
      `[TelecallerLogin] ${ts} employeeId=${employeeId} error=${err.message || 'unknown error'}`
    );
    return res.status(503).json({
      status: 'error',
      message: 'Telecaller verification service unavailable',
    });
  }
});

module.exports = { login, telecallerLogin };
