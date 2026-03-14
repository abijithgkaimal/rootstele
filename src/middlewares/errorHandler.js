const ApiError = require('../utils/ApiError');
const { error } = require('../utils/apiResponse');

const errorHandler = (err, req, res, next) => {
  if (err instanceof ApiError) {
    return error(res, err.message, err.statusCode);
  }
  if (err.name === 'ValidationError') {
    return error(res, err.message, 400);
  }
  if (err.name === 'CastError') {
    return error(res, 'Invalid ID format', 400);
  }
  console.error(err.stack);
  return error(res, err.message || 'Internal server error', 500);
};

module.exports = errorHandler;
