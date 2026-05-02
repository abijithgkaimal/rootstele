const express = require('express');
const justDialController = require('../controllers/justDialController');
const authMiddleware = require('../middlewares/authMiddleware');
const router = express.Router();

// JustDial Push (Webhook API) - UNPROTECTED
router.get('/justdial/lead', justDialController.handleJustDialLead);
router.post('/justdial/lead', justDialController.handleJustDialLead);

router.use(authMiddleware);

router.get('/leads/justdial', justDialController.getJustDialLeads);
router.get('/leads/justdial/:id', justDialController.getJustDialLeadById);
router.post('/leads/justdial/:id', justDialController.updateJustDialLead);

module.exports = router;
