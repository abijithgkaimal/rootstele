// Environment variables - use process.env directly (Render does not use .env files)
const getEnv = (key, fallback) => process.env[key] || fallback;

module.exports = {
  port: Number(getEnv('PORT', '3000')),
  nodeEnv: getEnv('NODE_ENV', 'development'),
  mongoUri: getEnv('MONGODB_URI', 'mongodb://localhost:27017/telecaller'),
  jwtSecret: getEnv('JWT_SECRET', 'default-secret-change-me'),
  // External APIs
  verifyEmployeeUrl:
    getEnv('EXTERNAL_VERIFY_EMPLOYEE_URL') ||
    getEnv('ROOTMENTS_VERIFY_API') ||
    'https://rootments.in/api/verify_employee',
  bookingSummaryUrl:
    getEnv('BOOKING_SUMMARY_URL') ||
    getEnv('BOOKING_CONFIRMATION_RMS_API_URL') ||
    getEnv('RENTAL_BOOKING_SUMMARY_API') ||
    'https://rentalapi.rootments.live/api/Repo/GetBookingSummary',
  returnReportUrl:
    getEnv('RETURN_REPORT_URL') ||
    getEnv('RETURN_RMS_API_URL') ||
    getEnv('RENTAL_RETURN_REPORT_API') ||
    'https://rentalapi.rootments.live/api/Reports/GetReturnReport',
  storeListUrl:
    getEnv('STORE_LIST_API') ||
    'https://rentalapi.rootments.live/api/Location/LocationList',
  // Admin
  adminUsername: getEnv('ADMIN_USERNAME', 'admin'),
  adminPassword: getEnv('ADMIN_PASSWORD', 'admin123'),
  adminSessionToken: getEnv('ADMIN_SESSION_TOKEN', 'admin-session-token'),
};

// Backward compatibility
module.exports.rootmentsVerifyApi = module.exports.verifyEmployeeUrl;
module.exports.rentalBookingSummaryApi = module.exports.bookingSummaryUrl;
module.exports.rentalReturnReportApi = module.exports.returnReportUrl;
