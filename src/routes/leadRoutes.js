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
    body('leadtype').isIn(['booked', 'enquiry']).withMessage('leadtype must be booked or enquiry'),
    body('phone').notEmpty().withMessage('phone is required'),
    body('callStatus').notEmpty().withMessage('callStatus is required'),
  ],
  validateRequest,
  leadController.addLead
);

router.get('/leads/completed', leadController.getCompletedLeads);
router.get('/leads/performance', leadController.getMyPerformance);

module.exports = router;
