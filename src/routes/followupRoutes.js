const express = require('express');
const followupController = require('../controllers/followupController');
const authMiddleware = require('../middlewares/authMiddleware');
const router = express.Router();

router.use(authMiddleware);

router.get('/leads/followups', followupController.getFollowups);
router.post('/leads/followups/:id', followupController.updateFollowup);
router.get('/leads/complaints', followupController.getComplaints);

module.exports = router;
