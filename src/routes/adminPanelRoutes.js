const express = require('express');
const adminPanelController = require('../controllers/adminPanelController');
const { ensureAdminAuthenticated } = require('../middlewares/adminSession');
const router = express.Router();

// Apply auth middleware to all routes in this router
router.use(ensureAdminAuthenticated);

router.get('/dashboard-summary', adminPanelController.getDashboardSummary);
router.get('/telecaller-leaderboard', adminPanelController.getTelecallerLeaderboard);
router.get('/telecallers/:employeeId/summary', adminPanelController.getTelecallerSummary);
router.put('/telecallers/:employeeId', adminPanelController.updateTelecallerProfile);
router.put('/telecallers/:employeeId/profile', adminPanelController.updateTelecallerProfile);
router.get('/telecallers/:employeeId/category-performance', adminPanelController.getTelecallerCategoryPerformance);
router.get('/telecallers/:employeeId/recent-calls', adminPanelController.getTelecallerRecentCalls);
router.get('/reports/completed-leads', adminPanelController.getCompletedReports);
router.get('/reports/completed-leads/export', adminPanelController.exportCompletedReports);

// Chat Analytics & Reporting
router.get('/chat-reports/summary', adminPanelController.getChatReportsSummary);
router.get('/chat-reports/telecaller-performance', adminPanelController.getTelecallerChatPerformance);
router.get('/chat-reports/conversations', adminPanelController.getChatConversationsReport);
router.get('/chat-reports/export', adminPanelController.exportChatReports);

module.exports = router;

