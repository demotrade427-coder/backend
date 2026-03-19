import { query } from '../config/database.js';

export const createWithdrawal = async (req, res) => {
  try {
    const { amount, walletAddress } = req.body;
    const userId = req.user.id;

    const users = await query('SELECT balance FROM users WHERE id = ?', [userId]);
    const user = users[0];

    if (!user || user.balance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    if (amount < 50) {
      return res.status(400).json({ message: 'Minimum withdrawal is $50' });
    }

    await query(
      'UPDATE users SET balance = balance - ? WHERE id = ?',
      [amount, userId]
    );

    const result = await query(
      'INSERT INTO withdrawals (user_id, amount, wallet_address, status) VALUES (?, ?, ?, ?)',
      [userId, amount, walletAddress, 'pending']
    );

    res.status(201).json({ message: 'Withdrawal request submitted', withdrawalId: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getMyWithdrawals = async (req, res) => {
  try {
    const withdrawals = await query(
      'SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(withdrawals || []);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const approveWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, transactionHash } = req.body;

    const withdrawals = await query('SELECT * FROM withdrawals WHERE id = ?', [id]);
    if (!withdrawals.length) {
      return res.status(404).json({ message: 'Withdrawal not found' });
    }

    const withdrawal = withdrawals[0];

    if (status === 'rejected') {
      await query(
        'UPDATE users SET balance = balance + ? WHERE id = ?',
        [withdrawal.amount, withdrawal.user_id]
      );
    }

    await query(
      'UPDATE withdrawals SET status = ?, transaction_hash = ? WHERE id = ?',
      [status, transactionHash || null, id]
    );

    res.json({ message: `Withdrawal ${status}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getAllWithdrawalsAdmin = async (req, res) => {
  try {
    const withdrawals = await query(
      `SELECT w.*, u.email as user_email, u.first_name, u.last_name
       FROM withdrawals w
       JOIN users u ON w.user_id = u.id
       ORDER BY w.created_at DESC`
    );
    res.json(withdrawals || []);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getWithdrawalStats = async (req, res) => {
  try {
    const stats = await query(
      `SELECT 
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) as total_approved,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as total_pending
      FROM withdrawals`
    );
    res.json(stats[0] || { total: 0, total_approved: 0, total_pending: 0 });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
