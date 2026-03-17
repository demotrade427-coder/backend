import express from 'express';
import { body } from 'express-validator';
import { createDeposit, getMyDeposits, approveDeposit, getAllDepositsAdmin, getDepositStats } from '../controllers/depositController.js';
import { authenticate, authenticateAdmin } from '../middleware/auth.js';
import { query } from '../config/database.js';

const router = express.Router();

router.post('/', authenticate, [
  body('amount').isNumeric(),
  body('paymentMethod').notEmpty()
], createDeposit);

router.get('/my', authenticate, getMyDeposits);
router.get('/admin/all', authenticateAdmin, getAllDepositsAdmin);
router.get('/admin/stats', authenticateAdmin, getDepositStats);
router.patch('/admin/:id', authenticateAdmin, approveDeposit);

router.get('/bank-accounts', async (req, res) => {
  try {
    const accounts = await query(`
      SELECT id, bank_name, account_name, account_number, routing_number, country, currency, is_crypto, wallet_type, wallet_address, network 
      FROM bank_accounts 
      WHERE is_active = true AND (rotation_enabled = true OR (valid_from IS NULL AND valid_until IS NULL) OR (valid_from <= NOW() AND valid_until >= NOW()))
      ORDER BY priority DESC
    `);
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;