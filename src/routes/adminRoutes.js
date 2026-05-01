const express = require('express');
const adminController = require('../controllers/adminController');
const { ensureAdminAuthenticated } = require('../middlewares/adminSession');
const router = express.Router();

// router.use(ensureAdminAuthenticated); // Removed to prevent catching 404s

router.get('/admin/dashboard', ensureAdminAuthenticated, adminController.getDashboardStats);
router.get('/admin/telecaller-summary', ensureAdminAuthenticated, adminController.getTelecallerSummary);
router.get('/admin/reports', ensureAdminAuthenticated, adminController.getReports);
router.get('/admin/complaints/pivot', ensureAdminAuthenticated, adminController.getComplaintsPivot);
router.get('/admin/filter-options', ensureAdminAuthenticated, adminController.getFilterOptions);

module.exports = router;
