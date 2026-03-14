const express = require('express');
const adminController = require('../controllers/adminController');
const { ensureAdminAuthenticated } = require('../middlewares/adminSession');
const router = express.Router();

router.use(ensureAdminAuthenticated);

router.get('/admin/dashboard', adminController.getDashboardStats);
router.get('/admin/telecaller-summary', adminController.getTelecallerSummary);
router.get('/admin/reports', adminController.getReports);
router.get('/admin/complaints/pivot', adminController.getComplaintsPivot);
router.get('/admin/filter-options', adminController.getFilterOptions);


module.exports = router;
