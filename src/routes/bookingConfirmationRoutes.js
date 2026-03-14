const express = require('express');
const bookingConfirmationController = require('../controllers/bookingConfirmationController');
const authMiddleware = require('../middlewares/authMiddleware');
const router = express.Router();

router.use(authMiddleware);

router.get('/leads/booking-confirmation', bookingConfirmationController.getBookingConfirmation);
router.post('/leads/booking-confirmation/:id', bookingConfirmationController.updateBookingConfirmation);

module.exports = router;
