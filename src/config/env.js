require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/telebackend',
  jwtSecret: process.env.JWT_SECRET || 'default-secret-change-me',
  rootmentsVerifyApi: process.env.ROOTMENTS_VERIFY_API || 'https://rootments.in/api/verify_employee',
  rentalBookingSummaryApi: process.env.RENTAL_BOOKING_SUMMARY_API || 'https://rentalapi.rootments.live/api/Repo/GetBookingSummary',
  rentalReturnReportApi: process.env.RENTAL_RETURN_REPORT_API || 'https://rentalapi.rootments.live/api/Reports/GetReturnReport',
};
