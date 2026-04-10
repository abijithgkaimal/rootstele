const jwt = require('jsonwebtoken');
const ApiError = require('../utils/ApiError');
const authService = require('../services/authService');
const env = require('../config/env');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const userId = req.headers['x-user-id'];
    const password = req.headers['x-password'];

    if (token) {
      try {
        const decoded = jwt.verify(token, env.jwtSecret);

        let user = await User.findOne({ employeeId: decoded.employeeId || decoded.userId });


        if (!user) {
          console.warn("User not found in DB, but token is valid");
          
          // fallback user object from token
          user = {
            employeeId: decoded.employeeId || decoded.userId,
            userId: decoded.userId || decoded.employeeId,
            name: decoded.name,
            role: decoded.role
          };
        } else {
          user = { ...user.toObject(), userId: user.employeeId, employeeId: user.employeeId };
        }

        req.user = user;
        return next();
      } catch (e) {
        throw new ApiError(401, 'Invalid or expired token');
      }
    }

    if (userId && password) {
      const result = await authService.verifyEmployee(userId, password);
      if (!result.valid) {
        throw new ApiError(401, 'Invalid credentials');
      }
      req.user = { userId, ...result.data };
      return next();
    }

    if (authHeader?.startsWith('Basic ')) {
      const base64 = authHeader.split(' ')[1];
      const credentials = Buffer.from(base64, 'base64').toString('utf-8');
      const [uid, pwd] = credentials.split(':');
      const result = await authService.verifyEmployee(uid, pwd);
      if (!result.valid) {
        throw new ApiError(401, 'Invalid credentials');
      }
      req.user = { userId: uid, ...result.data };
      return next();
    }

    throw new ApiError(401, 'Missing credentials. Provide JWT, Basic auth, or x-user-id and x-password headers.');
  } catch (err) {
    next(err);
  }
};

module.exports = authMiddleware;
