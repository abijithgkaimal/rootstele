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

module.exports = router;
