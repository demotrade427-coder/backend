import express from 'express';
import { body } from 'express-validator';
import { register, login, adminLogin, getMe } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', [
  body('firstName').notEmpty().trim(),
  body('lastName').notEmpty().trim(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 })
], register);

router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], login);

router.post('/admin/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], adminLogin);

router.get('/me', authenticate, getMe);

export default router;