import { query, getConnection } from '../config/database.js';

export const createWithdrawal = async (req, res) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();

    const { amount, walletAddress } = req.body;
    const userId = req.user.id;

    const [users] = await connection.execute('SELECT balance FROM users WHERE id = ?', [userId]);
    const user = users[0];

    if (user.balance < amount) {
      await connection.rollback();
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    if (amount < 50) {
      await connection.rollback();
      return res.status(400).json({ message: 'Minimum withdrawal is $50' });
    }

    await connection.execute(
      'UPDATE users SET balance = balance - ? WHERE id = ?',
      [amount, userId]
    );

    const [result] = await connection.execute(
      'INSERT INTO withdrawals (user_id, amount, wallet_address) VALUES (?, ?, ?)',
      [userId, amount, walletAddress]
    );

    await connection.execute(
      'INSERT INTO transactions (user_id, type, amount, description, reference_id) VALUES (?, ?, ?, ?, ?)',
      [userId, 'withdrawal', amount, `Withdrawal request #${result.insertId}`, result.insertId]
    );

    await connection.commit();

    res.status(201).json({ message: 'Withdrawal request submitted', withdrawalId: result.insertId });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
};

export const getMyWithdrawals = async (req, res) => {
  try {
    const withdrawals = await query(
      'SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(withdrawals);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const approveWithdrawal = async (req, res) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { status, transactionHash } = req.body;

    const [withdrawals] = await connection.execute('SELECT * FROM withdrawals WHERE id = ?', [id]);
    if (!withdrawals[0].length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Withdrawal not found' });
    }

    const withdrawal = withdrawals[0][0];

    if (status === 'rejected') {
      await connection.execute(
        'UPDATE users SET balance = balance + ? WHERE id = ?',
        [withdrawal.amount, withdrawal.user_id]
      );
    }

    await connection.execute(
      'UPDATE withdrawals SET status = ?, transaction_hash = ? WHERE id = ?',
      [status, transactionHash || null, id]
    );

    await connection.execute(
      'UPDATE transactions SET status = ? WHERE reference_id = ? AND type = ?',
      [status === 'approved' ? 'completed' : 'failed', id, 'withdrawal']
    );

    await connection.commit();
    res.json({ message: `Withdrawal ${status}` });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
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
    res.json(withdrawals);
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
        SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END) as total_approved,
        SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as total_pending
      FROM withdrawals`
    );
    res.json(stats[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};