const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const msg = errors.array().map((e) => e.msg).join(', ');
    return next(new ApiError(400, msg));
  }
  next();
};

module.exports = validateRequest;
