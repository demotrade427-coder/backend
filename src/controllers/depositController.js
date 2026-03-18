import { query } from '../config/database.js';

export const createDeposit = async (req, res) => {
  try {
    const { amount, paymentMethod, transactionHash } = req.body;
    const userId = req.user.id;

    const result = await query(
      'INSERT INTO deposits (user_id, amount, payment_method, transaction_hash, status) VALUES ($1, $2, $3, $4, $5)',
      [userId, amount, paymentMethod, transactionHash || null, 'pending']
    );

    res.status(201).json({ message: 'Deposit request submitted', depositId: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getMyDeposits = async (req, res) => {
  try {
    const deposits = await query(
      'SELECT * FROM deposits WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(deposits);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const approveDeposit = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const deposits = await query('SELECT * FROM deposits WHERE id = $1', [id]);
    if (!deposits.length) {
      return res.status(404).json({ message: 'Deposit not found' });
    }

    const deposit = deposits[0];

    await query('UPDATE deposits SET status = $1 WHERE id = $2', [status, id]);

    if (status === 'approved') {
      await query(
        'UPDATE users SET balance = balance + $1, total_deposited = total_deposited + $1 WHERE id = $2',
        [deposit.amount, deposit.user_id]
      );
    }

    res.json({ message: `Deposit ${status}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getAllDepositsAdmin = async (req, res) => {
  try {
    const deposits = await query(
      `SELECT d.*, u.email as user_email, u.first_name, u.last_name
       FROM deposits d
       JOIN users u ON d.user_id = u.id
       ORDER BY d.created_at DESC`
    );
    res.json(deposits);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getDepositStats = async (req, res) => {
  try {
    const stats = await query(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END) as total_approved,
        SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as total_pending
      FROM deposits`
    );
    res.json(stats[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};