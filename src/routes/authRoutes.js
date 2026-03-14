const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const validateRequest = require('../middlewares/validateRequest');
const router = express.Router();

router.post(
  '/auth/login',
  [
    body('userId').notEmpty().withMessage('userId is required'),
    body('password').notEmpty().withMessage('password is required'),
  ],
  validateRequest,
  authController.login
);

router.post(
  '/auth/telecaller-login',
  [
    // Accept either 'employeeId' (correct) or 'userId' (Flutter app compat)
    body('employeeId').optional(),
    body('userId').optional(),
    body('password').notEmpty().withMessage('password is required'),
  ],
  validateRequest,
  authController.telecallerLogin
);


module.exports = router;
