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
    body('callStatus').notEmpty().withMessage('callStatus is required'),
    body('followupDate').custom((value, { req }) => {
      const { callStatus } = req.body;
      if (['not connected', 'interested'].includes(callStatus)) {
        if (!value) {
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
