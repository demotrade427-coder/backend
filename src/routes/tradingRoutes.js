import express from 'express';
import { query, getConnection } from '../config/database.js';
import { verifyUser } from '../middleware/auth.js';
import { getPrice, getAllPrices } from '../services/priceService.js';

const router = express.Router();

router.get('/coins', verifyUser, async (req, res) => {
  try {
    const prices = await getAllPrices();
    const markets = Object.values(prices);
    res.json(markets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/coins/:symbol', verifyUser, async (req, res) => {
  try {
    const { symbol } = req.params;
    const priceData = await getPrice(symbol.toUpperCase());
    
    if (!priceData) {
      return res.status(404).json({ error: 'Market not found' });
    }
    
    res.json(priceData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/prices', async (req, res) => {
  try {
    const prices = await getAllPrices();
    res.json(prices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/trade', verifyUser, async (req, res) => {
  try {
    const { symbol, trade_type, amount, duration = 60 } = req.body;
    const userId = req.user.id;

    const priceData = await getPrice(symbol.toUpperCase());
    if (!priceData) {
      return res.status(404).json({ error: 'Market not found' });
    }

    if (!req.user.trading_balance) {
      const user = await query('SELECT balance, trading_balance FROM users WHERE id = ?', [userId]);
      if (user.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      req.user.trading_balance = user[0].trading_balance || user[0].balance || 0;
    }

    const tradeAmount = Number(amount);
    if (isNaN(tradeAmount) || tradeAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    if (tradeAmount > Number(req.user.trading_balance)) {
      return res.status(400).json({ error: 'Insufficient trading balance' });
    }

    const market = await query('SELECT * FROM market_prices WHERE symbol = ?', [symbol.toUpperCase()]);
    const payoutRate = market.length > 0 ? Number(market[0].payout_rate || 85) : 85;
    const tradeDuration = market.length > 0 ? Number(market[0].trade_duration_seconds || 60) : duration;

    const entryPrice = priceData.price;
    const expiresAt = new Date(Date.now() + tradeDuration * 1000);

    const result = await query(
      `INSERT INTO trades (user_id, coin_name, coin_symbol, trade_type, trade_mode, amount, price, total_value, leverage, result, expires_at) VALUES (?, ?, ?, ?, 'auto', ?, ?, ?, 1, 'pending', ?)`,
      [userId, priceData.name, symbol.toUpperCase(), trade_type, amount, entryPrice, amount, expiresAt]
    );

    await query(
      'UPDATE users SET trading_balance = trading_balance - ?, total_traded = total_traded + ? WHERE id = ?',
      [amount, amount, userId]
    );

    res.json({ 
      success: true,
      message: 'Trade placed successfully', 
      trade_id: result.insertId,
      expires_at: expiresAt,
      details: {
        market: priceData.name,
        symbol: symbol.toUpperCase(),
        type: trade_type,
        amount: tradeAmount,
        entry_price: entryPrice,
        payout_rate: payoutRate,
        duration_seconds: tradeDuration
      }
    });
  } catch (error) {
    console.error('Trade error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Coin by ID
router.get('/coins/:id', verifyUser, async (req, res) => {
  try {
    const coin = await query('SELECT * FROM coin_inventory WHERE id = ?', [req.params.id]);
    if (coin.length === 0) {
      return res.status(404).json({ error: 'Coin not found' });
    }
    res.json({
      ...coin[0],
      current_price: Number(coin[0].current_price),
      previous_price: Number(coin[0].previous_price),
      price_change_24h: Number(coin[0].price_change_24h)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Place Trade
router.post('/trade', verifyUser, async (req, res) => {
  try {
    const { coin_id, trade_type, amount, leverage = 1 } = req.body;

    const coin = await query('SELECT * FROM coin_inventory WHERE id = ? AND is_tradable = true', [coin_id]);
    if (coin.length === 0) {
      return res.status(404).json({ error: 'Coin not found or not tradable' });
    }

    if (amount < Number(coin[0].min_trade_amount) || amount > Number(coin[0].max_trade_amount)) {
      return res.status(400).json({ error: `Amount must be between ${coin[0].min_trade_amount} and ${coin[0].max_trade_amount}` });
    }

    const totalValue = Number(amount) * leverage;
    if (totalValue > Number(req.user.trading_balance)) {
      return res.status(400).json({ error: 'Insufficient trading balance' });
    }

    const result = await query(
      'INSERT INTO trades (user_id, coin_id, trade_type, trade_mode, amount, price, total_value, leverage, result) VALUES (?, ?, ?, "manual", ?, ?, ?, ?, "pending")',
      [req.user.id, coin_id, trade_type, amount, coin[0].current_price, totalValue, leverage]
    );

    await query(
      'UPDATE users SET trading_balance = trading_balance - ?, total_traded = total_traded + ? WHERE id = ?',
      [totalValue, totalValue, req.user.id]
    );

    await query(
      'INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, status, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, 'trade', totalValue, req.user.trading_balance, Number(req.user.trading_balance) - totalValue, 'completed', `Trade placed: ${trade_type} ${coin[0].coin_symbol}`]
    );

    res.json({ 
      message: 'Trade placed successfully', 
      trade_id: result.insertId,
      details: {
        coin: coin[0].coin_name,
        type: trade_type,
        amount: Number(amount),
        price: Number(coin[0].current_price),
        total_value: totalValue
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get My Trades
router.get('/my-trades', verifyUser, async (req, res) => {
  try {
    const trades = await query(`
      SELECT t.*, t.coin_name as coin_name, t.coin_symbol
      FROM trades t
      WHERE t.user_id = ?
      ORDER BY t.created_at DESC
      LIMIT 50
    `, [req.user.id]);
    
    res.json(trades.map(t => ({
      ...t,
      amount: Number(t.amount),
      price: Number(t.price || 0),
      total_value: Number(t.total_value || 0),
      profit_loss: Number(t.profit_loss || 0)
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get My Open Trades
router.get('/my-trades/open', verifyUser, async (req, res) => {
  try {
    const trades = await query(`
      SELECT t.*, t.coin_name as coin_name, t.coin_symbol
      FROM trades t
      WHERE t.user_id = ? AND t.result = "pending"
      ORDER BY t.created_at DESC
    `, [req.user.id]);
    
    res.json(trades.map(t => ({
      ...t,
      amount: Number(t.amount),
      price: Number(t.price || 0),
      total_value: Number(t.total_value || 0)
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Trade History
router.get('/my-trades/history', verifyUser, async (req, res) => {
  try {
    const trades = await query(`
      SELECT t.*, t.coin_name as coin_name, t.coin_symbol
      FROM trades t
      WHERE t.user_id = ? AND t.result != "pending"
      ORDER BY t.created_at DESC
    `, [req.user.id]);
    
    res.json(trades.map(t => ({
      ...t,
      amount: Number(t.amount),
      price: Number(t.price || 0),
      total_value: Number(t.total_value || 0),
      profit_loss: Number(t.profit_loss || 0)
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get My Profile
router.get('/profile', verifyUser, async (req, res) => {
  try {
    const user = await query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    
    res.json({
      ...user[0],
      balance: Number(user[0].balance || 0),
      trading_balance: Number(user[0].trading_balance || user[0].balance || 0),
      total_deposited: Number(user[0].total_deposited || 0),
      total_withdrawn: Number(user[0].total_withdrawn || 0),
      total_invested: Number(user[0].total_invested || 0),
      total_profit: Number(user[0].total_profit || 0),
      bankAccounts: [],
      cryptoWallets: []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Profile
router.patch('/profile', verifyUser, async (req, res) => {
  try {
    const { first_name, last_name, phone, country } = req.body;
    await query(
      'UPDATE users SET first_name = ?, last_name = ?, phone = ?, country = ? WHERE id = ?',
      [first_name, last_name, phone, country, req.user.id]
    );
    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add Bank Account
router.post('/bank-account', verifyUser, async (req, res) => {
  try {
    const { bank_name, account_number, account_name, routing_number, swift_code } = req.body;

    await query(
      'UPDATE bank_accounts SET is_default = false WHERE user_id = ?',
      [req.user.id]
    );

    await query(
      'INSERT INTO bank_accounts (user_id, bank_name, account_number, account_name, routing_number, swift_code, is_default) VALUES (?, ?, ?, ?, ?, ?, true)',
      [req.user.id, bank_name, account_number, account_name, routing_number, swift_code]
    );

    res.json({ message: 'Bank account added successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add Crypto Wallet
router.post('/crypto-wallet', verifyUser, async (req, res) => {
  try {
    const { coin_type, wallet_address, network } = req.body;

    await query(
      'UPDATE crypto_wallets SET is_default = false WHERE user_id = ? AND coin_type = ?',
      [req.user.id, coin_type]
    );

    await query(
      'INSERT INTO crypto_wallets (user_id, coin_type, wallet_address, network, is_default) VALUES (?, ?, ?, ?, true)',
      [req.user.id, coin_type, wallet_address, network]
    );

    res.json({ message: 'Crypto wallet added successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Transactions
router.get('/transactions', verifyUser, async (req, res) => {
  try {
    const transactions = await query(`
      SELECT * FROM transactions 
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `, [req.user.id]);
    
    res.json(transactions.map(t => ({
      ...t,
      amount: Number(t.amount),
      balance_before: Number(t.balance_before),
      balance_after: Number(t.balance_after)
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Request Deposit
router.post('/deposit', verifyUser, async (req, res) => {
  try {
    const { amount, payment_method, transaction_hash, payment_proof, bank_reference } = req.body;

    const result = await query(
      'INSERT INTO deposits (user_id, amount, payment_method, transaction_hash, payment_proof, bank_reference, status) VALUES (?, ?, ?, ?, ?, ?, "pending")',
      [req.user.id, amount, payment_method, transaction_hash, payment_proof, bank_reference]
    );

    res.json({ message: 'Deposit request submitted', deposit_id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get My Deposits
router.get('/deposits', verifyUser, async (req, res) => {
  try {
    const deposits = await query(`
      SELECT * FROM deposits 
      WHERE user_id = ?
      ORDER BY created_at DESC
    `, [req.user.id]);
    
    res.json(deposits.map(d => ({
      ...d,
      amount: Number(d.amount)
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Request Withdrawal
router.post('/withdraw', verifyUser, async (req, res) => {
  try {
    const { amount, withdrawal_method, bank_account_id, crypto_wallet_id, wallet_address } = req.body;

    if (Number(amount) > Number(req.user.balance)) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const result = await query(
      'INSERT INTO withdrawals (user_id, amount, withdrawal_method, bank_account_id, crypto_wallet_id, wallet_address, status) VALUES (?, ?, ?, ?, ?, ?, "pending")',
      [req.user.id, amount, withdrawal_method, bank_account_id || null, crypto_wallet_id || null, wallet_address]
    );

    res.json({ message: 'Withdrawal request submitted', withdrawal_id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get My Withdrawals
router.get('/withdrawals', verifyUser, async (req, res) => {
  try {
    const withdrawals = await query(`
      SELECT * FROM withdrawals 
      WHERE user_id = ?
      ORDER BY created_at DESC
    `, [req.user.id]);
    
    res.json(withdrawals.map(w => ({
      ...w,
      amount: Number(w.amount)
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create Support Ticket
router.post('/support-ticket', verifyUser, async (req, res) => {
  try {
    const { subject, category, priority, message } = req.body;
    const ticketNumber = 'TKT' + Date.now().toString(36).toUpperCase();

    const result = await query(
      'INSERT INTO support_tickets (user_id, ticket_number, subject, category, priority) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, ticketNumber, subject, category, priority || 'medium']
    );

    await query(
      'INSERT INTO support_messages (ticket_id, sender_id, sender_type, message) VALUES (?, ?, ?, ?)',
      [result.insertId, req.user.id, 'user', message]
    );

    res.json({ message: 'Ticket created successfully', ticket_number: ticketNumber });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get My Tickets
router.get('/support-tickets', verifyUser, async (req, res) => {
  try {
    const tickets = await query(`
      SELECT * FROM support_tickets 
      WHERE user_id = ?
      ORDER BY created_at DESC
    `, [req.user.id]);
    
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Ticket Messages
router.get('/support-tickets/:id/messages', verifyUser, async (req, res) => {
  try {
    const messages = await query(`
      SELECT * FROM support_messages 
      WHERE ticket_id = ?
      ORDER BY created_at ASC
    `, [req.params.id]);
    
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reply to Ticket
router.post('/support-tickets/:id/reply', verifyUser, async (req, res) => {
  try {
    const { message } = req.body;
    
    await query(
      'INSERT INTO support_messages (ticket_id, sender_id, sender_type, message) VALUES (?, ?, ?, ?)',
      [req.params.id, req.user.id, 'user', message]
    );

    await query('UPDATE support_tickets SET updated_at = NOW() WHERE id = ?', [req.params.id]);

    res.json({ message: 'Reply sent successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Notifications
router.get('/notifications', verifyUser, async (req, res) => {
  try {
    const notifications = await query(`
      SELECT * FROM notifications 
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `, [req.user.id]);
    
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark Notification as Read
router.patch('/notifications/:id/read', verifyUser, async (req, res) => {
  try {
    await query('UPDATE notifications SET is_read = true WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
