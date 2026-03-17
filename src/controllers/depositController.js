import { query, getConnection } from '../config/database.js';

export const createDeposit = async (req, res) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();

    const { amount, paymentMethod, transactionHash } = req.body;
    const userId = req.user.id;

    const [result] = await connection.execute(
      'INSERT INTO deposits (user_id, amount, payment_method, transaction_hash) VALUES (?, ?, ?, ?)',
      [userId, amount, paymentMethod, transactionHash || null]
    );

    await connection.execute(
      'INSERT INTO transactions (user_id, type, amount, description, reference_id) VALUES (?, ?, ?, ?, ?)',
      [userId, 'deposit', amount, `Deposit request #${result.insertId}`, result.insertId]
    );

    await connection.commit();

    res.status(201).json({ message: 'Deposit request submitted', depositId: result.insertId });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
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
  const connection = await getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { status } = req.body;

    const [deposits] = await connection.execute('SELECT * FROM deposits WHERE id = ?', [id]);
    if (!deposits[0].length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Deposit not found' });
    }

    const deposit = deposits[0][0];

    await connection.execute('UPDATE deposits SET status = ? WHERE id = ?', [status, id]);

    if (status === 'approved') {
      await connection.execute(
        'UPDATE users SET balance = balance + ? WHERE id = ?',
        [deposit.amount, deposit.user_id]
      );

      await connection.execute(
        'UPDATE transactions SET status = ? WHERE reference_id = ? AND type = ?',
        ['completed', id, 'deposit']
      );
    } else {
      await connection.execute(
        'UPDATE transactions SET status = ? WHERE reference_id = ? AND type = ?',
        ['failed', id, 'deposit']
      );
    }

    await connection.commit();
    res.json({ message: `Deposit ${status}` });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
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