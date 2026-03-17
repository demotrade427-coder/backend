import express from 'express';
import { body } from 'express-validator';
import { createWithdrawal, getMyWithdrawals, approveWithdrawal, getAllWithdrawalsAdmin, getWithdrawalStats } from '../controllers/withdrawalController.js';
import { authenticate, authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

router.post('/', authenticate, [
  body('amount').isNumeric(),
  body('walletAddress').notEmpty()
], createWithdrawal);

router.get('/my', authenticate, getMyWithdrawals);
router.get('/admin/all', authenticateAdmin, getAllWithdrawalsAdmin);
router.get('/admin/stats', authenticateAdmin, getWithdrawalStats);
router.patch('/admin/:id', authenticateAdmin, approveWithdrawal);

export default router;