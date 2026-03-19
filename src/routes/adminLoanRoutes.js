import express from 'express';
import { getAllLoans, getLoanDetails, approveLoan, rejectLoan, getLoanStats } from '../controllers/adminLoanController.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticateAdmin, getAllLoans);
router.get('/stats', authenticateAdmin, getLoanStats);
router.get('/:id', authenticateAdmin, getLoanDetails);
router.post('/:id/approve', authenticateAdmin, approveLoan);
router.post('/:id/reject', authenticateAdmin, rejectLoan);

export default router;
