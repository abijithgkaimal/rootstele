const express = require('express');
const syncController = require('../controllers/syncController');
const authMiddleware = require('../middlewares/authMiddleware');
const router = express.Router();

// Master sync trigger for external cron jobs (like cron-job.org)
// We add it before the authMiddleware so external services don't need a JWT.
// In a real app, you might want to protect this with a simple API_KEY check.
router.post('/sync/master', syncController.syncMaster);
router.get('/sync/master', syncController.syncMaster); // Also support GET for easy pinging

router.use(authMiddleware);

router.post('/sync/stores', syncController.syncStores);
router.post('/sync/returns', syncController.syncReturns);
router.post('/sync/booking-confirmation', syncController.syncBookingConfirmation);
router.post('/sync/booking-confirmations', syncController.syncBookingConfirmation);

module.exports = router;
