import express from 'express';
import { getLoanTerms, applyForLoan, getMyLoans, getLoanDetails, repayLoan, getActiveLoanStats } from '../controllers/loanController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/terms', authenticate, getLoanTerms);
router.post('/apply', authenticate, applyForLoan);
router.get('/my-loans', authenticate, getMyLoans);
router.get('/my-loans/:id', authenticate, getLoanDetails);
router.post('/repay/:id', authenticate, repayLoan);
router.get('/stats', authenticate, getActiveLoanStats);

export default router;
