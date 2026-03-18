import { query } from '../config/database.js';

export const createInvestment = async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const userId = req.user.id;

    const plans = await query('SELECT * FROM plans WHERE id = $1', [planId]);
    if (!plans.length) {
      return res.status(404).json({ message: 'Plan not found' });
    }

    const plan = plans[0];
    if (amount < plan.min_amount || amount > plan.max_amount) {
      return res.status(400).json({ message: `Amount must be between $${plan.min_amount} and $${plan.max_amount}` });
    }

    const users = await query('SELECT balance FROM users WHERE id = $1', [userId]);
    const user = users[0];

    if (user.balance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    const expectedProfit = (amount * plan.roi_percentage) / 100;
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + plan.duration_days);

    await query(
      'UPDATE users SET balance = balance - $1, total_invested = total_invested + $1 WHERE id = $2',
      [amount, userId]
    );

    const investmentResult = await query(
      'INSERT INTO investments (user_id, plan_id, amount, roi_percentage, expected_profit, end_date, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [userId, planId, amount, plan.roi_percentage, expectedProfit, endDate, 'active']
    );

    res.status(201).json({ message: 'Investment created successfully', investmentId: investmentResult.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getMyInvestments = async (req, res) => {
  try {
    const investments = await query(
      `SELECT i.*, p.name as plan_name, p.description as plan_description 
       FROM investments i 
       JOIN plans p ON i.plan_id = p.id 
       WHERE i.user_id = $1 
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
      WHERE user_id = $1`,
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
  try {
    const investments = await query('SELECT * FROM investments WHERE id = $1', [investmentId]);
    if (!investments.length || investments[0].status !== 'active') {
      return;
    }

    const investment = investments[0];

    await query(
      'UPDATE users SET balance = balance + $1, total_profit = total_profit + $1 WHERE id = $2',
      [investment.expected_profit, investment.user_id]
    );

    await query(
      'UPDATE investments SET status = $1, actual_profit = $2, completed_at = NOW() WHERE id = $3',
      ['completed', investment.expected_profit, investmentId]
    );

    await query(
      'INSERT INTO transactions (user_id, type, amount, description) VALUES ($1, $2, $3, $4)',
      [investment.user_id, 'profit', investment.expected_profit, `Profit from investment #${investmentId}`]
    );
  } catch (error) {
    console.error(error);
  }
};
