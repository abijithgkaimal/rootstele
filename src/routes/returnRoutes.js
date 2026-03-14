const express = require('express');
const returnLeadController = require('../controllers/returnLeadController');
const authMiddleware = require('../middlewares/authMiddleware');
const router = express.Router();

router.use(authMiddleware);

router.get('/leads/returns', returnLeadController.getReturnLeads);
router.post('/leads/returns/:id', returnLeadController.updateReturnLead);

module.exports = router;
