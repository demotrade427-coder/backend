import express from 'express';
import { query } from '../config/database.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

// Middleware to verify admin
const verifyAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const adminId = decoded.id || decoded.adminId;
    const role = decoded.role;
    
    if (adminId === 1 && role === 'super_admin') {
      req.admin = { id: 1, username: 'admin', role: 'super_admin', is_active: true };
      return next();
    }
    
    try {
      const admin = await query('SELECT * FROM admin_users WHERE id = ? AND is_active = true', [adminId]);
      
      if (admin.length === 0) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      req.admin = admin[0];
    } catch (dbError) {
      if (dbError.code === '42P01') {
        return res.status(401).json({ error: 'Admin not configured' });
      }
      throw dbError;
    }
    
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
};

// Admin Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const loginInput = username || req.body.email;

    if (loginInput === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
      const token = jwt.sign({ id: 1, role: 'super_admin' }, process.env.JWT_SECRET, { expiresIn: '24h' });
      return res.json({
        token,
        admin: {
          id: 1,
          username: 'admin',
          email: process.env.ADMIN_EMAIL,
          role: 'super_admin'
        }
      });
    }
    
    try {
      const admin = await query('SELECT * FROM admin_users WHERE username = ? OR email = ?', [loginInput, loginInput]);
      
      if (admin.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const validPassword = await bcrypt.compare(password, admin[0].password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign({ id: admin[0].id, role: admin[0].role }, process.env.JWT_SECRET, { expiresIn: '24h' });
      
      res.json({
        token,
        admin: {
          id: admin[0].id,
          username: admin[0].username,
          email: admin[0].email,
          role: admin[0].role
        }
      });
    } catch (dbError) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Dashboard Stats
router.get('/dashboard-stats', verifyAdmin, async (req, res) => {
  try {
    const totalUsers = await query('SELECT COUNT(*) as count FROM users');
    const totalDeposits = await query("SELECT COALESCE(SUM(amount), 0) as total FROM deposits WHERE status = 'approved'");
    const totalWithdrawals = await query("SELECT COALESCE(SUM(amount), 0) as total FROM withdrawals WHERE status = 'approved'");
    const totalTrades = await query('SELECT COUNT(*) as count FROM trades');
    const pendingDeposits = await query("SELECT COUNT(*) as count FROM deposits WHERE status = 'pending'");
    const pendingWithdrawals = await query("SELECT COUNT(*) as count FROM withdrawals WHERE status = 'pending'");
    const totalVolume = await query('SELECT COALESCE(SUM(amount), 0) as total FROM trades');

    res.json({
      totalUsers: totalUsers[0]?.count || 0,
      totalDeposits: Number(totalDeposits[0]?.total || 0),
      totalWithdrawals: Number(totalWithdrawals[0]?.total || 0),
      totalTrades: totalTrades[0]?.count || 0,
      pendingDeposits: pendingDeposits[0]?.count || 0,
      pendingWithdrawals: pendingWithdrawals[0]?.count || 0,
      totalVolume: Number(totalVolume[0]?.total || 0)
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get All Users
router.get('/users', verifyAdmin, async (req, res) => {
  try {
    const users = await query('SELECT * FROM users ORDER BY id DESC');
    res.json(users.map(u => ({
      id: u.id,
      first_name: u.first_name,
      last_name: u.last_name,
      email: u.email,
      phone: u.phone || '',
      country: u.country || '',
      balance: Number(u.balance || 0),
      total_invested: Number(u.total_invested || 0),
      total_profit: Number(u.total_profit || 0),
      is_active: true
    })));
  } catch (error) {
    console.error('Users error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get All Agents
router.get('/agents', verifyAdmin, async (req, res) => {
  try {
    res.json([]);
  } catch (error) {
    console.error('Agents error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create Agent
router.post('/agents', verifyAdmin, async (req, res) => {
  try {
    const { first_name, last_name, email, phone, commission_rate } = req.body;
    
    const existingUser = await query('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash('Agent@123', 10);
    const agentCode = 'AGT' + Date.now().toString(36).toUpperCase();

    const result = await query(
      'INSERT INTO users (first_name, last_name, email, password, phone, is_agent, is_active) VALUES (?, ?, ?, ?, ?, true, true)',
      [first_name, last_name, email, hashedPassword, phone]
    );

    await query(
      'INSERT INTO agents (user_id, agent_code, commission_rate) VALUES (?, ?, ?)',
      [result.insertId, agentCode, commission_rate || 5.00]
    );

    res.json({ message: 'Agent created successfully', agent_code: agentCode });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Agent Status
router.patch('/agents/:id/status', verifyAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    await query('UPDATE agents SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ message: 'Agent status updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manage Deposits
router.get('/deposits', verifyAdmin, async (req, res) => {
  try {
    const deposits = await query(`
      SELECT d.*, u.first_name, u.last_name, u.email
      FROM deposits d
      INNER JOIN users u ON d.user_id = u.id
      ORDER BY d.created_at DESC
    `);
    res.json(deposits.map(d => ({
      ...d,
      amount: Number(d.amount)
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Approve/Reject Deposit
router.patch('/deposits/:id', verifyAdmin, async (req, res) => {
  try {
    const { status, note } = req.body;
    const deposit = await query('SELECT * FROM deposits WHERE id = ?', [req.params.id]);
    
    if (deposit.length === 0) {
      return res.status(404).json({ error: 'Deposit not found' });
    }

    if (deposit[0].status !== 'pending') {
      return res.status(400).json({ error: 'Deposit already processed' });
    }

    await query('UPDATE deposits SET status = ?, approved_by = ?, updated_at = NOW() WHERE id = ?', 
      [status, req.admin.id, req.params.id]);

    if (status === 'approved') {
      const user = await query('SELECT * FROM users WHERE id = ?', [deposit[0].user_id]);
      const newBalance = Number(user[0].balance) + Number(deposit[0].amount);
      const newTradingBalance = Number(user[0].trading_balance || user[0].balance || 0) + Number(deposit[0].amount);
      
      await query('UPDATE users SET balance = ?, trading_balance = ?, total_deposited = total_deposited + ? WHERE id = ?', 
        [newBalance, newTradingBalance, deposit[0].amount, deposit[0].user_id]);

      await query(
        'INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, status, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [deposit[0].user_id, 'deposit', deposit[0].amount, user[0].balance, newBalance, 'completed', `Deposit approved via ${deposit[0].payment_method}`]
      );
    }

    res.json({ message: `Deposit ${status}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manage Withdrawals
router.get('/withdrawals', verifyAdmin, async (req, res) => {
  try {
    const withdrawals = await query(`
      SELECT w.*, u.first_name, u.last_name, u.email
      FROM withdrawals w
      INNER JOIN users u ON w.user_id = u.id
      ORDER BY w.created_at DESC
    `);
    res.json(withdrawals.map(w => ({
      ...w,
      amount: Number(w.amount)
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Approve/Reject Withdrawal
router.patch('/withdrawals/:id', verifyAdmin, async (req, res) => {
  try {
    const { status, transaction_hash } = req.body;
    const withdrawal = await query('SELECT * FROM withdrawals WHERE id = ?', [req.params.id]);
    
    if (withdrawal.length === 0) {
      return res.status(404).json({ error: 'Withdrawal not found' });
    }

    await query('UPDATE withdrawals SET status = ?, approved_by = ?, transaction_hash = ?, updated_at = NOW() WHERE id = ?', 
      [status, req.admin.id, transaction_hash || null, req.params.id]);

    if (status === 'approved') {
      const user = await query('SELECT * FROM users WHERE id = ?', [withdrawal[0].user_id]);
      const newBalance = Number(user[0].balance) - Number(withdrawal[0].amount);
      
      await query('UPDATE users SET balance = ?, total_withdrawn = total_withdrawn + ? WHERE id = ?', 
        [newBalance, withdrawal[0].amount, withdrawal[0].user_id]);

      await query(
        'INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, status, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [withdrawal[0].user_id, 'withdrawal', withdrawal[0].amount, user[0].balance, newBalance, 'completed', 'Withdrawal approved']
      );
    }

    res.json({ message: `Withdrawal ${status}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Coin Inventory
router.get('/coins', verifyAdmin, async (req, res) => {
  try {
    const coins = await query('SELECT * FROM coins ORDER BY coin_type, coin_name');
    res.json(coins.map(c => ({
      ...c,
      current_price: Number(c.current_price || 0)
    })));
  } catch (error) {
    console.error('Coins error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update Coin Price
router.patch('/coins/:id', verifyAdmin, async (req, res) => {
  try {
    const { current_price } = req.body;
    const coin = await query('SELECT * FROM coins WHERE id = ?', [req.params.id]);
    
    if (coin.length === 0) {
      return res.status(404).json({ error: 'Coin not found' });
    }

    await query('UPDATE coins SET current_price = ? WHERE id = ?', [current_price, req.params.id]);

    res.json({ message: 'Coin updated successfully' });
  } catch (error) {
    console.error('Update coin error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add New Coin
router.post('/coins', verifyAdmin, async (req, res) => {
  try {
    const { coin_name, coin_symbol, coin_type, current_price } = req.body;
    
    await query(
      'INSERT INTO coins (coin_name, coin_symbol, coin_type, current_price) VALUES (?, ?, ?, ?)',
      [coin_name, coin_symbol, coin_type, current_price]
    );

    res.json({ message: 'Coin added successfully' });
  } catch (error) {
    console.error('Add coin error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get All Trades
router.get('/trades', verifyAdmin, async (req, res) => {
  try {
    const trades = await query(`
      SELECT t.*, u.first_name, u.last_name
      FROM trades t
      LEFT JOIN users u ON t.user_id = u.id
      ORDER BY t.created_at DESC
      LIMIT 100
    `);
    res.json(trades.map(t => ({
      ...t,
      amount: Number(t.amount || 0),
      profit_loss: Number(t.profit_loss || 0)
    })));
  } catch (error) {
    console.error('Trades error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create Trade (Admin)
router.post('/trades', verifyAdmin, async (req, res) => {
  try {
    const { user_id, amount, trade_type, coin_name = 'Bitcoin', coin_symbol = 'BTC' } = req.body;

    const user = await query('SELECT * FROM users WHERE id = ?', [user_id]);
    if (user.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const price = 50000;
    const total_value = Number(amount) * price;

    const result = await query(
      'INSERT INTO trades (user_id, coin_name, coin_symbol, trade_type, trade_mode, amount, price, total_value, leverage, result) VALUES (?, ?, ?, ?, "manual", ?, ?, ?, 1, "pending")',
      [user_id, coin_name, coin_symbol, trade_type, amount, price, total_value]
    );

    res.json({ 
      message: 'Trade created successfully', 
      trade_id: result.insertId 
    });
  } catch (error) {
    console.error('Create trade error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Set Manual Trade Result (Win/Loss)
router.post('/trades/:id/result', verifyAdmin, async (req, res) => {
  try {
    const { result, note } = req.body;
    const trade = await query('SELECT * FROM trades WHERE id = ?', [req.params.id]);
    
    if (trade.length === 0) {
      return res.status(404).json({ error: 'Trade not found' });
    }

    const oldResult = trade[0].result;
    const oldProfitLoss = Number(trade[0].profit_loss || 0);
    
    let newProfitLoss = 0;
    if (result === 'win') {
      newProfitLoss = Number(trade[0].amount) * 0.80;
    } else if (result === 'loss') {
      newProfitLoss = -Number(trade[0].amount);
    }

    await query('UPDATE trades SET result = ?, profit_loss = ? WHERE id = ?', [result, newProfitLoss, req.params.id]);
    await query('INSERT INTO manual_results (trade_id, admin_id, result, note) VALUES (?, ?, ?, ?)', 
      [req.params.id, req.admin.id, result, note]);

    const user = await query('SELECT * FROM users WHERE id = ?', [trade[0].user_id]);
    const balanceChange = newProfitLoss - oldProfitLoss;
    const newBalance = Number(user[0].trading_balance) + balanceChange;
    
    await query('UPDATE users SET trading_balance = ?, total_profit = total_profit + ? WHERE id = ?', 
      [newBalance, balanceChange > 0 ? balanceChange : 0, trade[0].user_id]);

    await query(
      'INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, status, description, reference_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [trade[0].user_id, result === 'win' ? 'profit' : 'loss', Math.abs(newProfitLoss), user[0].trading_balance, newBalance, 'completed', `Manual ${result} (changed from ${oldResult})`, trade[0].id]
    );

    res.json({ message: `Trade marked as ${result}`, profit_loss: newProfitLoss, balance_change: balanceChange });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Support Tickets
router.get('/tickets', verifyAdmin, async (req, res) => {
  try {
    const tickets = await query(`
      SELECT t.*, u.first_name, u.last_name, u.email
      FROM support_tickets t
      LEFT JOIN users u ON t.user_id = u.id
      ORDER BY t.created_at DESC
      LIMIT 50
    `);
    res.json(tickets);
  } catch (error) {
    console.error('Tickets error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reply to Ticket
router.post('/tickets/:id/reply', verifyAdmin, async (req, res) => {
  try {
    const { message } = req.body;
    
    await query(
      'INSERT INTO support_messages (ticket_id, sender_id, sender_type, message) VALUES (?, ?, ?, ?)',
      [req.params.id, req.admin.id, 'admin', message]
    );

    const ticket = await query('SELECT * FROM support_tickets WHERE id = ?', [req.params.id]);
    if (ticket[0].status === 'open') {
      await query('UPDATE support_tickets SET status = "in_progress" WHERE id = ?', [req.params.id]);
    }

    res.json({ message: 'Reply sent successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Close Ticket
router.patch('/tickets/:id/close', verifyAdmin, async (req, res) => {
  try {
    await query('UPDATE support_tickets SET status = "closed" WHERE id = ?', [req.params.id]);
    res.json({ message: 'Ticket closed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get User Details
router.get('/users/:id', verifyAdmin, async (req, res) => {
  try {
    const user = await query('SELECT * FROM users WHERE id = ?', [req.params.id]);
    const deposits = await query('SELECT * FROM deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT 10', [req.params.id]);
    const withdrawals = await query('SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC LIMIT 10', [req.params.id]);

    if (user.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        ...user[0],
        balance: Number(user[0].balance || 0),
        total_invested: Number(user[0].total_invested || 0),
        total_profit: Number(user[0].total_profit || 0)
      },
      deposits: deposits.map(d => ({ ...d, amount: Number(d.amount || 0) })),
      withdrawals: withdrawals.map(w => ({ ...w, amount: Number(w.amount || 0) }))
    });
  } catch (error) {
    console.error('User details error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add Balance to User (Manual)
router.post('/users/:id/balance', verifyAdmin, async (req, res) => {
  try {
    const { amount, type, note } = req.body;
    const user = await query('SELECT * FROM users WHERE id = ?', [req.params.id]);

    if (user.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const newBalance = Number(user[0].balance) + amount;
    await query('UPDATE users SET balance = ? WHERE id = ?', [newBalance, req.params.id]);

    await query(
      'INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, status, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.params.id, type || 'bonus', amount, user[0].balance, newBalance, 'completed', note || 'Manual balance adjustment']
    );

    res.json({ message: 'Balance added successfully', new_balance: newBalance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bank Accounts Management
router.get('/bank-accounts', verifyAdmin, async (req, res) => {
  try {
    const accounts = await query('SELECT * FROM bank_accounts ORDER BY priority DESC, created_at DESC');
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/bank-accounts', verifyAdmin, async (req, res) => {
  try {
    const { bank_name, account_name, account_number, routing_number, country, currency, is_crypto, wallet_type, wallet_address, network, rotation_enabled, valid_from, valid_until } = req.body;
    
    const result = await query(
      `INSERT INTO bank_accounts (bank_name, account_name, account_number, routing_number, country, currency, is_crypto, wallet_type, wallet_address, network, rotation_enabled, valid_from, valid_until) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [bank_name, account_name, account_number, routing_number, country || 'USA', currency || 'USD', is_crypto || false, wallet_type, wallet_address, network, rotation_enabled !== false, valid_from, valid_until]
    );
    
    res.json({ message: 'Bank account created', id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/bank-accounts/:id', verifyAdmin, async (req, res) => {
  try {
    const { bank_name, account_name, account_number, is_active, priority, rotation_enabled } = req.body;
    
    await query(
      'UPDATE bank_accounts SET bank_name = ?, account_name = ?, account_number = ?, is_active = ?, priority = ?, rotation_enabled = ? WHERE id = ?',
      [bank_name, account_name, account_number, is_active, priority, rotation_enabled, req.params.id]
    );
    
    res.json({ message: 'Bank account updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/bank-accounts/:id', verifyAdmin, async (req, res) => {
  try {
    await query('DELETE FROM bank_accounts WHERE id = ?', [req.params.id]);
    res.json({ message: 'Bank account deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get active bank accounts for deposit (public)
router.get('/active-bank-accounts', async (req, res) => {
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

// Market Prices Management
router.get('/markets', verifyAdmin, async (req, res) => {
  try {
    const markets = await query('SELECT * FROM market_prices ORDER BY id');
    res.json(markets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/markets', verifyAdmin, async (req, res) => {
  try {
    const { symbol, name, current_price, trade_duration_seconds, payout_rate, is_tradable } = req.body;
    
    const result = await query(
      `INSERT INTO market_prices (symbol, name, current_price, trade_duration_seconds, payout_rate, is_tradable) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (symbol) DO UPDATE SET name = EXCLUDED.name, current_price = EXCLUDED.current_price, trade_duration_seconds = EXCLUDED.trade_duration_seconds, payout_rate = EXCLUDED.payout_rate, is_tradable = EXCLUDED.is_tradable`,
      [symbol, name, current_price, trade_duration_seconds || 60, payout_rate || 85, is_tradable !== false]
    );
    
    res.json({ message: 'Market updated', id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/markets/:symbol', verifyAdmin, async (req, res) => {
  try {
    const { trade_duration_seconds, payout_rate, is_tradable } = req.body;
    
    await query(
      'UPDATE market_prices SET trade_duration_seconds = ?, payout_rate = ?, is_tradable = ? WHERE symbol = ?',
      [trade_duration_seconds, payout_rate, is_tradable, req.params.symbol]
    );
    
    res.json({ message: 'Market updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get auto-settlement settings
router.get('/settings/auto-settlement', verifyAdmin, async (req, res) => {
  try {
    const settings = await query('SELECT * FROM admin_settings WHERE setting_key = ?', ['auto_settlement']);
    res.json({ 
      enabled: settings.length > 0 ? settings[0].setting_value === 'true' : true 
    });
  } catch (error) {
    res.json({ enabled: true });
  }
});

// Toggle auto-settlement
router.patch('/settings/auto-settlement', verifyAdmin, async (req, res) => {
  try {
    const { enabled } = req.body;
    await query(
      `INSERT INTO admin_settings (setting_key, setting_value) VALUES ('auto_settlement', ?)
       ON CONFLICT (setting_key) DO UPDATE SET setting_value = ?`,
      [enabled.toString(), enabled.toString()]
    );
    res.json({ message: 'Auto-settlement updated', enabled });
  } catch (error) {
    res.json({ enabled: true });
  }
});

// Auto-settle single trade
router.get('/trades/:id/auto-settle', verifyAdmin, async (req, res) => {
  try {
    const trade = await query('SELECT * FROM trades WHERE id = ?', [req.params.id]);
    if (trade.length === 0) {
      return res.status(404).json({ error: 'Trade not found' });
    }
    if (trade[0].result !== 'pending') {
      return res.status(400).json({ error: 'Trade already settled' });
    }

    const { getPrice } = await import('../services/priceService.js');
    const priceData = await getPrice(trade[0].coin_symbol);
    const exitPrice = priceData?.price || trade[0].price;
    const entryPrice = Number(trade[0].price);
    const payoutRate = 0.85;

    let result = 'loss';
    let profitLoss = -Number(trade[0].amount);

    if (trade[0].trade_type === 'buy') {
      if (exitPrice > entryPrice) {
        result = 'win';
        profitLoss = Number(trade[0].amount) * payoutRate;
      }
    } else if (trade[0].trade_type === 'sell') {
      if (exitPrice < entryPrice) {
        result = 'win';
        profitLoss = Number(trade[0].amount) * payoutRate;
      }
    }

    await query(
      'UPDATE trades SET result = ?, profit_loss = ?, exit_price = ?, settled_at = NOW() WHERE id = ?',
      [result, profitLoss, exitPrice, req.params.id]
    );

    const user = await query('SELECT * FROM users WHERE id = ?', [trade[0].user_id]);
    const newBalance = Number(user[0].trading_balance) + profitLoss;

    await query(
      'UPDATE users SET trading_balance = ?, total_profit = total_profit + ? WHERE id = ?',
      [newBalance, profitLoss > 0 ? profitLoss : 0, trade[0].user_id]
    );

    await query(
      'INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, status, description, reference_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [trade[0].user_id, result === 'win' ? 'profit' : 'loss', Math.abs(profitLoss), user[0].trading_balance, newBalance, 'completed', `Auto-trade ${result}: ${trade[0].coin_symbol}`, trade[0].id]
    );

    res.json({ 
      message: `Trade auto-settled as ${result}`, 
      result,
      profit_loss: profitLoss,
      exit_price: exitPrice
    });
  } catch (error) {
    console.error('Auto-settle error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
