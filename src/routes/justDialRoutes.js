const express = require('express');
const { body } = require('express-validator');
const justDialController = require('../controllers/justDialController');
const authMiddleware = require('../middlewares/authMiddleware');
const validateRequest = require('../middlewares/validateRequest');
const router = express.Router();

// JustDial Push (Webhook API) - UNPROTECTED
router.get('/justdial/lead', justDialController.handleJustDialLead);
router.post('/justdial/lead', justDialController.handleJustDialLead);

router.use(authMiddleware);

router.get('/leads/justdial', justDialController.getJustDialLeads);
router.get('/leads/justdial/:id', justDialController.getJustDialLeadById);
router.post(
  '/leads/justdial/:id',
  [
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
  justDialController.updateJustDialLead
);

module.exports = router;
