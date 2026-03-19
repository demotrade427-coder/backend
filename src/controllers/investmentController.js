import { query } from '../config/database.js';

export const createInvestment = async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const userId = req.user.id;

    const plans = await query('SELECT * FROM plans WHERE id = ?', [planId]);
    if (!plans.length) {
      return res.status(404).json({ message: 'Plan not found' });
    }

    const plan = plans[0];
    if (amount < plan.min_amount || amount > plan.max_amount) {
      return res.status(400).json({ message: `Amount must be between $${plan.min_amount} and $${plan.max_amount}` });
    }

    const users = await query('SELECT balance FROM users WHERE id = ?', [userId]);
    const user = users[0];

    if (user.balance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    const expectedProfit = (amount * plan.roi_percentage) / 100;
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + plan.duration_days);

    await query(
      'UPDATE users SET balance = balance - ?, total_invested = total_invested + ? WHERE id = ?',
      [amount, amount, userId]
    );

    const investmentResult = await query(
      'INSERT INTO investments (user_id, plan_id, amount, roi_percentage, expected_profit, end_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [userId, planId, amount, plan.roi_percentage, expectedProfit, endDate, 'active']
    );

    res.status(201).json({ message: 'Investment created successfully', investmentId: investmentResult.insertId });
  } catch (error) {
    console.error('createInvestment error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
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
    res.json(investments || []);
  } catch (error) {
    console.error('getMyInvestments error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
};

export const getInvestmentStats = async (req, res) => {
  try {
    const stats = await query(
      `SELECT 
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) as active,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as completed,
        COALESCE(SUM(amount), 0) as total_invested,
        COALESCE(SUM(actual_profit), 0) as total_profit
      FROM investments 
      WHERE user_id = ?`,
      [req.user.id]
    );
    res.json(stats[0] || { total: 0, active: 0, completed: 0, total_invested: 0, total_profit: 0 });
  } catch (error) {
    console.error('getInvestmentStats error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
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
    res.json(investments || []);
  } catch (error) {
    console.error('getAllInvestmentsAdmin error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
};

export const completeInvestment = async (investmentId) => {
  try {
    const investments = await query('SELECT * FROM investments WHERE id = ?', [investmentId]);
    if (!investments.length || investments[0].status !== 'active') {
      return;
    }

    const investment = investments[0];

    await query(
      'UPDATE users SET balance = balance + ?, total_profit = total_profit + ? WHERE id = ?',
      [investment.expected_profit, investment.expected_profit, investment.user_id]
    );

    await query(
      'UPDATE investments SET status = ?, actual_profit = ?, completed_at = NOW() WHERE id = ?',
      ['completed', investment.expected_profit, investmentId]
    );

    await query(
      'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
      [investment.user_id, 'profit', investment.expected_profit, `Profit from investment #${investmentId}`]
    );
  } catch (error) {
    console.error('completeInvestment error:', error);
  }
};
