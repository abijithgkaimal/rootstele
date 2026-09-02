const express = require('express');
const { body } = require('express-validator');
const leadController = require('../controllers/leadController');
const authMiddleware = require('../middlewares/authMiddleware');
const validateRequest = require('../middlewares/validateRequest');
const router = express.Router();

router.use(authMiddleware);

router.post(
  '/leads',
  [
    body('leadtype').isIn(['booked', 'enquiry', 'lossofsale', 'justdial', 'return', 'bookingConfirmation']).withMessage('leadtype must be booked or enquiry or lossofsale or justdial'),
    body('phone').notEmpty().withMessage('phone is required'),
    body('callStatus').custom((value, { req }) => {
      const callStatus = req.body.callStatus || req.body.call_status;
      if (!callStatus) {
        throw new Error('callStatus is required');
      }
      return true;
    }),
    body('followupDate').custom((value, { req }) => {
      const callStatus = req.body.callStatus || req.body.call_status;
      const followupDate = req.body.followupDate || req.body.follow_up_date;
      if (['not connected', 'interested'].includes((callStatus || '').toLowerCase().trim())) {
        if (!followupDate) {
          throw new Error('followupDate is required when callStatus is interested or not connected');
        }
      }
      return true;
    }),
  ],
  validateRequest,
  leadController.addLead
);

router.get('/leads/completed', leadController.getCompletedLeads);
router.get('/leads/performance', leadController.getMyPerformance);

// ── Enquiry Leads ──────────────────────────────────────────────────────
router.get('/leads/enquiries', leadController.getEnquiryLeads);
router.get('/leads/enquiry', leadController.getEnquiryLeads);
router.get('/leads/enquiries/:id([0-9a-fA-F]{24})', leadController.getEnquiryLeadById);
router.get('/leads/enquiry/:id([0-9a-fA-F]{24})', leadController.getEnquiryLeadById);
router.post('/leads/enquiries/:id([0-9a-fA-F]{24})', leadController.updateEnquiryLead);
router.post('/leads/enquiry/:id([0-9a-fA-F]{24})', leadController.updateEnquiryLead);

// ── Loss of Sale Leads ────────────────────────────────────────────────
router.get('/leads/lossofsale', leadController.getLossOfSaleLeads);
router.get('/leads/loss-of-sale', leadController.getLossOfSaleLeads);
router.get('/leads/lossofsale/:id([0-9a-fA-F]{24})', leadController.getLossOfSaleLeadById);
router.get('/leads/loss-of-sale/:id([0-9a-fA-F]{24})', leadController.getLossOfSaleLeadById);
router.post('/leads/lossofsale/:id([0-9a-fA-F]{24})', leadController.updateLossOfSaleLead);
router.post('/leads/loss-of-sale/:id([0-9a-fA-F]{24})', leadController.updateLossOfSaleLead);

// ── Booked Leads ──────────────────────────────────────────────────────
router.get('/leads/booked', leadController.getBookedLeads);
router.get('/leads/booked/:id([0-9a-fA-F]{24})', leadController.getBookedLeadById);
router.post('/leads/booked/:id([0-9a-fA-F]{24})', leadController.updateBookedLead);

// ── Generic Lead Detail & Update by ID ─────────────────────────────────
router.get('/leads/:id([0-9a-fA-F]{24})', leadController.getLeadById);
router.post('/leads/:id([0-9a-fA-F]{24})', leadController.updateLeadById);

module.exports = router;
