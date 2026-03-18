import { query } from '../config/database.js';

export const getUserDashboard = async (req, res) => {
  try {
    const userId = req.user.id;

    const users = await query('SELECT * FROM users WHERE id = ?', [userId]);
    const user = users[0];

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const trades = await query(
      `SELECT COUNT(*) as total_trades, SUM(CASE WHEN result = 'win' THEN profit_loss ELSE 0 END) as total_wins,
       SUM(CASE WHEN result = 'loss' THEN ABS(profit_loss) ELSE 0 END) as total_losses,
       COUNT(CASE WHEN result = 'pending' THEN 1 END) as pending_trades
       FROM trades WHERE user_id = ?`,
      [userId]
    );

    const recentTransactions = await query(
      'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
      [userId]
    );

    console.log('User data for dashboard:', userId, user.balance, user.trading_balance);
    
    let tradingBalance = Number(user.trading_balance);
    if (!user.trading_balance || tradingBalance === 0) {
      tradingBalance = Number(user.balance);
    }
    
    if (!user.trading_balance || Number(user.trading_balance) === 0) {
      await query('UPDATE users SET trading_balance = ? WHERE id = ?', [user.balance, userId]);
      tradingBalance = Number(user.balance);
    }
    const totalProfit = Number(trades[0].total_wins || 0) - Number(trades[0].total_losses || 0);

    res.json({
      balance: tradingBalance,
      trading_balance: tradingBalance,
      totalInvested: Number(user.total_invested || 0),
      totalProfit: totalProfit,
      totalWins: Number(trades[0].total_wins || 0),
      totalLosses: Number(trades[0].total_losses || 0),
      activeInvestments: trades[0].pending_trades || 0,
      totalTrades: trades[0].total_trades || 0,
      recentTransactions
    });
  } catch (error) {
    console.error('getUserDashboard error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getTransactions = async (req, res) => {
  try {
    const transactions = await query(
      'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(transactions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getAdminDashboard = async (req, res) => {
  try {
    const users = await query('SELECT COUNT(*) as total_users FROM users');
    const deposits = await query("SELECT SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END) as total_deposits FROM deposits");
    const withdrawals = await query("SELECT SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END) as total_withdrawals FROM withdrawals");
    const investments = await query('SELECT SUM(amount) as total_invested, COUNT(*) as total_investments FROM investments');
    const recentUsers = await query('SELECT * FROM users ORDER BY created_at DESC LIMIT 5');
    const recentDeposits = await query(
      `SELECT d.*, u.email as user_email FROM deposits d JOIN users u ON d.user_id = u.id ORDER BY d.created_at DESC LIMIT 5`
    );

    res.json({
      totalUsers: users[0].total_users,
      totalDeposits: deposits[0].total_deposits || 0,
      totalWithdrawals: withdrawals[0].total_withdrawals || 0,
      totalInvested: investments[0].total_invested || 0,
      totalInvestments: investments[0].total_investments || 0,
      recentUsers,
      recentDeposits
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const users = await query(
      'SELECT id, first_name, last_name, email, phone, country, balance, total_invested, total_profit, kyc_status, is_active, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { balance, isActive, kycStatus } = req.body;

    if (balance !== undefined) {
      await query('UPDATE users SET balance = ? WHERE id = ?', [balance, id]);
    }
    if (isActive !== undefined) {
      await query('UPDATE users SET is_active = ? WHERE id = ?', [isActive, id]);
    }
    if (kycStatus !== undefined) {
      await query('UPDATE users SET kyc_status = ? WHERE id = ?', [kycStatus, id]);
    }

    res.json({ message: 'User updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getAllTransactions = async (req, res) => {
  try {
    const transactions = await query(
      `SELECT t.*, u.email as user_email FROM transactions t JOIN users u ON t.user_id = u.id ORDER BY t.created_at DESC`
    );
    res.json(transactions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};