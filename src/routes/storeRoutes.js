const express = require('express');
const storeController = require('../controllers/storeController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/stores', storeController.getStores);

module.exports = router;
