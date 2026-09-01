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
    'https://rentalapi.rootments.live/api/GetBooking/GetBookingSummary' ||
    getEnv('BOOKING_SUMMARY_URL') ||
    getEnv('BOOKING_CONFIRMATION_RMS_API_URL') ||
    getEnv('RENTAL_BOOKING_SUMMARY_API'),
  returnReportUrl:
    getEnv('RETURN_REPORT_URL') ||
    getEnv('RETURN_RMS_API_URL') ||
    getEnv('RENTAL_RETURN_REPORT_API') ||
    'https://rentalapi.rootments.live/api/Reports/GetReturnReport',
  storeListUrl:
    getEnv('STORE_LIST_API') ||
    'https://rentalapi.rootments.live/api/Location/LocationList',
  justDialApiUrl:
    getEnv('JUSTDIAL_API_URL') ||
    'https://api.justdial.com/v1/leads', // Placeholder as per requirement
  // Admin
  adminUsername: getEnv('ADMIN_USERNAME', 'admin'),
  adminPassword: getEnv('ADMIN_PASSWORD', 'admin123'),
  adminSessionToken: getEnv('ADMIN_SESSION_TOKEN', 'admin-session-token'),
  // Webhooks & Multi-Chat
  customWebhookApiKey: getEnv('CUSTOM_WEBHOOK_API_KEY', 'default-webhook-key'),
  metaWebhookVerifyToken: getEnv('META_WEBHOOK_VERIFY_TOKEN', 'default-verify-token'),
  metaAppSecret: getEnv('META_APP_SECRET', ''),
  metaAccessToken: getEnv('META_ACCESS_TOKEN', ''),
  whatsappPhoneNumberId: getEnv('WHATSAPP_PHONE_NUMBER_ID', ''),
  instagramAccountId: getEnv('INSTAGRAM_ACCOUNT_ID', ''),

  // Multi-Brand WhatsApp Phone IDs
  waPhoneIdZorucci: getEnv('WA_PHONE_ID_ZORUCCI', ''),
  waPhoneIdSuitorGuy: getEnv('WA_PHONE_ID_SUITOR_GUY', ''),
  waPhoneIdDapperSquad: getEnv('WA_PHONE_ID_DAPPER_SQUAD', ''),

  // Multi-Brand Instagram Account IDs
  igAccountIdZorucci: getEnv('IG_ACCOUNT_ID_ZORUCCI', ''),
  igAccountIdSuitorGuy: getEnv('IG_ACCOUNT_ID_SUITOR_GUY', ''),
  igAccountIdDapperSquad: getEnv('IG_ACCOUNT_ID_DAPPER_SQUAD', ''),

  // Multi-Brand Facebook Page IDs
  fbPageIdZorucci: getEnv('FB_PAGE_ID_ZORUCCI', ''),
  fbPageIdSuitorGuy: getEnv('FB_PAGE_ID_SUITOR_GUY', ''),
  fbPageIdDapperSquad: getEnv('FB_PAGE_ID_DAPPER_SQUAD', ''),
};

// Backward compatibility
module.exports.rootmentsVerifyApi = module.exports.verifyEmployeeUrl;
module.exports.rentalBookingSummaryApi = module.exports.bookingSummaryUrl;
module.exports.rentalReturnReportApi = module.exports.returnReportUrl;
