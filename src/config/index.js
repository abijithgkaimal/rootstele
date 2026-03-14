const env = require('./env');
module.exports = {
  ...env,
  verifyEmployeeUrl: env.rootmentsVerifyApi,
  bookingSummaryUrl: env.rentalBookingSummaryApi,
  returnReportUrl: env.rentalReturnReportApi,
};
