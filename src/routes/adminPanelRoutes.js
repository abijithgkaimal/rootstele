const express = require('express');
const adminPanelController = require('../controllers/adminPanelController');
const { ensureAdminAuthenticated } = require('../middlewares/adminSession');
const router = express.Router();

// Apply auth middleware to all routes in this router
router.use(ensureAdminAuthenticated);

router.get('/dashboard-summary', adminPanelController.getDashboardSummary);
router.get('/telecaller-leaderboard', adminPanelController.getTelecallerLeaderboard);
router.get('/telecallers/:employeeId/summary', adminPanelController.getTelecallerSummary);
router.get('/telecallers/:employeeId/category-performance', adminPanelController.getTelecallerCategoryPerformance);
router.get('/telecallers/:employeeId/recent-calls', adminPanelController.getTelecallerRecentCalls);
router.get('/reports/completed-leads', adminPanelController.getCompletedReports);
router.get('/reports/completed-leads/export', adminPanelController.exportCompletedReports);

module.exports = router;
