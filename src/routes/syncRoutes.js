const express = require('express');
const syncController = require('../controllers/syncController');
const authMiddleware = require('../middlewares/authMiddleware');
const router = express.Router();

router.use(authMiddleware);

router.post('/sync/stores', syncController.syncStores);
router.post('/sync/returns', syncController.syncReturns);
router.post('/sync/booking-confirmation', syncController.syncBookingConfirmation);
router.post('/sync/booking-confirmations', syncController.syncBookingConfirmation);

module.exports = router;
