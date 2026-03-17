import express from 'express';
import { body } from 'express-validator';
import { createInvestment, getMyInvestments, getInvestmentStats, getAllInvestmentsAdmin } from '../controllers/investmentController.js';
import { authenticate, authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

router.post('/', authenticate, [
  body('planId').isInt(),
  body('amount').isNumeric()
], createInvestment);

router.get('/my', authenticate, getMyInvestments);
router.get('/stats', authenticate, getInvestmentStats);
router.get('/admin/all', authenticateAdmin, getAllInvestmentsAdmin);

export default router;