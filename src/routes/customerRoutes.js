const express = require('express');
const customerController = require('../controllers/customerController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/customers/check-phone', customerController.checkPhone);
router.get('/customers/:id/history', customerController.getHistory);

module.exports = router;
