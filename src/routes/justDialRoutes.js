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
  justDialController.updateJustDialLead
);

module.exports = router;
