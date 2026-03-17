import { query, getConnection } from '../config/database.js';

export const createInvestment = async (req, res) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();

    const { planId, amount } = req.body;
    const userId = req.user.id;

    const plans = await connection.execute('SELECT * FROM plans WHERE id = ?', [planId]);
    if (!plans[0].length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Plan not found' });
    }

    const plan = plans[0][0];
    if (amount < plan.min_amount || amount > plan.max_amount) {
      await connection.rollback();
      return res.status(400).json({ message: `Amount must be between $${plan.min_amount} and $${plan.max_amount}` });
    }

    const users = await connection.execute('SELECT balance FROM users WHERE id = ?', [userId]);
    const user = users[0][0];

    if (user.balance < amount) {
      await connection.rollback();
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    const expectedProfit = (amount * plan.roi_percentage) / 100;
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + plan.duration_days);

    await connection.execute(
      'UPDATE users SET balance = balance - ?, total_invested = total_invested + ? WHERE id = ?',
      [amount, amount, userId]
    );

    const [investmentResult] = await connection.execute(
      'INSERT INTO investments (user_id, plan_id, amount, roi_percentage, expected_profit, end_date) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, planId, amount, plan.roi_percentage, expectedProfit, endDate]
    );

    await connection.execute(
      'INSERT INTO transactions (user_id, type, amount, description, reference_id) VALUES (?, ?, ?, ?, ?)',
      [userId, 'investment', amount, `Investment in ${plan.name}`, investmentResult.insertId]
    );

    await connection.commit();

    res.status(201).json({ message: 'Investment created successfully', investmentId: investmentResult.insertId });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
};

export const getMyInvestments = async (req, res) => {
  try {
    const investments = await query(
      `SELECT i.*, p.name as plan_name, p.description as plan_description 
       FROM investments i 
       JOIN plans p ON i.plan_id = p.id 
       WHERE i.user_id = ? 
       ORDER BY i.start_date DESC`,
      [req.user.id]
    );
    res.json(investments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getInvestmentStats = async (req, res) => {
  try {
    const stats = await query(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(amount) as total_invested,
        SUM(actual_profit) as total_profit
      FROM investments 
      WHERE user_id = ?`,
      [req.user.id]
    );
    res.json(stats[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getAllInvestmentsAdmin = async (req, res) => {
  try {
    const investments = await query(
      `SELECT i.*, p.name as plan_name, u.email as user_email, u.first_name, u.last_name
       FROM investments i 
       JOIN plans p ON i.plan_id = p.id
       JOIN users u ON i.user_id = u.id
       ORDER BY i.start_date DESC`
    );
    res.json(investments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const completeInvestment = async (investmentId) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();

    const [investments] = await connection.execute('SELECT * FROM investments WHERE id = ?', [investmentId]);
    if (!investments[0].length || investments[0][0].status !== 'active') {
      return;
    }

    const investment = investments[0][0];

    await connection.execute(
      'UPDATE users SET balance = balance + ?, total_profit = total_profit + ? WHERE id = ?',
      [investment.expected_profit, investment.expected_profit, investment.user_id]
    );

    await connection.execute(
      'UPDATE investments SET status = ?, actual_profit = ?, completed_at = NOW() WHERE id = ?',
      ['completed', investment.expected_profit, investmentId]
    );

    await connection.execute(
      'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
      [investment.user_id, 'profit', investment.expected_profit, `Profit from investment #${investmentId}`]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    console.error(error);
  } finally {
    connection.release();
  }
};