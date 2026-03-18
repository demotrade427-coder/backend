import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

let pool;

const dbUrl = process.env.DATABASE_URL || process.env.DB_URL;

if (dbUrl) {
  pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });
} else {
  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'investment_platform'
  });
}

const formatPg = (sql, params) => {
  let paramIndex = 1;
  const formatted = sql.replace(/\?/g, () => `$${paramIndex++}`);
  return { text: formatted, values: params };
};

export const query = async (sql, params = []) => {
  try {
    let finalSql = sql;
    let finalParams = params;
    
    const sqlUpper = sql.trim().toUpperCase();
    
    if (sql.includes('?')) {
      let paramIndex = 1;
      finalSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
      finalParams = params;
    }
    
    if (sqlUpper.startsWith('INSERT') && !sqlUpper.includes('RETURNING')) {
      finalSql = finalSql + ' RETURNING id';
    }
    
    const res = await pool.query(finalSql, finalParams);
    
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      return res.rows;
    } else {
      return { 
        rows: res.rows,
        insertId: res.rows[0]?.id,
        affectedRows: res.rowCount
      };
    }
  } catch (error) {
    console.error('Database query error:', error.message);
    console.error('SQL:', sql);
    console.error('Params:', params);
    throw error;
  }
};

export const getConnection = async () => {
  return await pool.connect();
};

export const initializeDatabase = async () => {
  const fs = await import('fs');
  const path = await import('path');
  
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(50) NOT NULL,
        last_name VARCHAR(50) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        country VARCHAR(50),
        avatar VARCHAR(255),
        wallet_address VARCHAR(200),
        balance DECIMAL(15, 2) DEFAULT 0.00,
        trading_balance DECIMAL(15, 2) DEFAULT 0.00,
        total_deposited DECIMAL(15, 2) DEFAULT 0.00,
        total_withdrawn DECIMAL(15, 2) DEFAULT 0.00,
        total_traded DECIMAL(15, 2) DEFAULT 0.00,
        total_profit DECIMAL(15, 2) DEFAULT 0.00,
        agent_id INT NULL,
        kyc_status VARCHAR(20) DEFAULT 'pending',
        kyc_document VARCHAR(255),
        is_active BOOLEAN DEFAULT TRUE,
        is_agent BOOLEAN DEFAULT FALSE,
        is_admin BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS trades (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id),
        coin_name VARCHAR(50),
        coin_symbol VARCHAR(20),
        trade_type VARCHAR(10),
        trade_mode VARCHAR(20) DEFAULT 'auto',
        amount DECIMAL(15, 2),
        price DECIMAL(15, 2),
        total_value DECIMAL(15, 2),
        leverage INT DEFAULT 1,
        result VARCHAR(20) DEFAULT 'pending',
        profit_loss DECIMAL(15, 2) DEFAULT 0,
        exit_price DECIMAL(15, 2),
        expires_at TIMESTAMP,
        settled_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS market_prices (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(50),
        current_price DECIMAL(15, 2),
        previous_price DECIMAL(15, 2),
        change_24h DECIMAL(15, 2) DEFAULT 0,
        change_percent_24h DECIMAL(10, 2) DEFAULT 0,
        payout_rate DECIMAL(5, 2) DEFAULT 85,
        trade_duration_seconds INT DEFAULT 60,
        min_trade_amount DECIMAL(15, 2) DEFAULT 1,
        max_trade_amount DECIMAL(15, 2) DEFAULT 10000,
        is_tradable BOOLEAN DEFAULT TRUE,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS deposits (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id),
        amount DECIMAL(15, 2) NOT NULL,
        payment_method VARCHAR(50),
        status VARCHAR(20) DEFAULT 'pending',
        transaction_id VARCHAR(100),
        approved_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id),
        amount DECIMAL(15, 2) NOT NULL,
        wallet_address VARCHAR(200),
        status VARCHAR(20) DEFAULT 'pending',
        transaction_id VARCHAR(100),
        approved_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id),
        type VARCHAR(50),
        amount DECIMAL(15, 2),
        balance_before DECIMAL(15, 2),
        balance_after DECIMAL(15, 2),
        status VARCHAR(20) DEFAULT 'completed',
        description TEXT,
        reference_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'admin',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS plans (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        min_amount DECIMAL(15, 2) NOT NULL,
        max_amount DECIMAL(15, 2) NOT NULL,
        roi_percentage DECIMAL(10, 2) NOT NULL,
        duration_days INT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS investments (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id),
        plan_id INT NOT NULL REFERENCES plans(id),
        amount DECIMAL(15, 2) NOT NULL,
        roi_percentage DECIMAL(10, 2) NOT NULL,
        expected_profit DECIMAL(15, 2),
        actual_profit DECIMAL(15, 2),
        start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        end_date TIMESTAMP,
        completed_at TIMESTAMP,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id),
        ticket_number VARCHAR(50) UNIQUE NOT NULL,
        subject VARCHAR(200) NOT NULL,
        category VARCHAR(50),
        priority VARCHAR(20) DEFAULT 'medium',
        status VARCHAR(20) DEFAULT 'open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS support_messages (
        id SERIAL PRIMARY KEY,
        ticket_id INT NOT NULL REFERENCES support_tickets(id),
        sender_id INT,
        sender_type VARCHAR(20) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id),
        title VARCHAR(200) NOT NULL,
        message TEXT,
        type VARCHAR(50) DEFAULT 'info',
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS bank_accounts (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id),
        bank_name VARCHAR(100) NOT NULL,
        account_name VARCHAR(100) NOT NULL,
        account_number VARCHAR(50),
        routing_number VARCHAR(50),
        country VARCHAR(50) DEFAULT 'USA',
        currency VARCHAR(10) DEFAULT 'USD',
        is_crypto BOOLEAN DEFAULT FALSE,
        wallet_type VARCHAR(50),
        wallet_address VARCHAR(200),
        network VARCHAR(50),
        is_active BOOLEAN DEFAULT TRUE,
        is_default BOOLEAN DEFAULT FALSE,
        priority INT DEFAULT 0,
        rotation_enabled BOOLEAN DEFAULT TRUE,
        valid_from TIMESTAMP,
        valid_until TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS crypto_wallets (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id),
        coin_type VARCHAR(50) NOT NULL,
        wallet_address VARCHAR(200) NOT NULL,
        network VARCHAR(50),
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS coins (
        id SERIAL PRIMARY KEY,
        coin_name VARCHAR(100) NOT NULL,
        coin_symbol VARCHAR(20) NOT NULL,
        coin_type VARCHAR(50),
        current_price DECIMAL(15, 2),
        previous_price DECIMAL(15, 2),
        price_change_24h DECIMAL(15, 2) DEFAULT 0,
        is_tradable BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS manual_results (
        id SERIAL PRIMARY KEY,
        trade_id INT NOT NULL REFERENCES trades(id),
        admin_id INT REFERENCES admin_users(id),
        result VARCHAR(20) NOT NULL,
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    const adminExists = await pool.query("SELECT id FROM admin_users WHERE username = 'admin'");
    if (adminExists.rows.length === 0) {
      await pool.query(`
        INSERT INTO admin_users (username, email, password, role) 
        VALUES ('admin', 'admin@trading.com', '$2a$10$5Zp5ZpDRDwMX2AYSY.ZL1eXHVrsSaP0z2GRL3GH72bMMd1XsCschu', 'admin')
      `);
    } else {
      await pool.query(`UPDATE admin_users SET password = '$2a$10$5Zp5ZpDRDwMX2AYSY.ZL1eXHVrsSaP0z2GRL3GH72bMMd1XsCschu' WHERE username = 'admin'`);
    }

    const cryptoMarkets = [
      { symbol: 'BTCUSDT', name: 'Bitcoin', payout_rate: 85, trade_duration_seconds: 60 },
      { symbol: 'ETHUSDT', name: 'Ethereum', payout_rate: 85, trade_duration_seconds: 60 },
      { symbol: 'BNBUSDT', name: 'BNB', payout_rate: 85, trade_duration_seconds: 60 },
      { symbol: 'SOLUSDT', name: 'Solana', payout_rate: 85, trade_duration_seconds: 60 },
      { symbol: 'XRPUSDT', name: 'XRP', payout_rate: 85, trade_duration_seconds: 60 },
      { symbol: 'ADAUSDT', name: 'Cardano', payout_rate: 85, trade_duration_seconds: 60 },
      { symbol: 'DOGEUSDT', name: 'Dogecoin', payout_rate: 85, trade_duration_seconds: 60 },
      { symbol: 'AVAXUSDT', name: 'Avalanche', payout_rate: 85, trade_duration_seconds: 60 },
      { symbol: 'DOTUSDT', name: 'Polkadot', payout_rate: 85, trade_duration_seconds: 60 },
      { symbol: 'MATICUSDT', name: 'Polygon', payout_rate: 85, trade_duration_seconds: 60 },
      { symbol: 'LINKUSDT', name: 'Chainlink', payout_rate: 85, trade_duration_seconds: 60 },
      { symbol: 'LTCUSDT', name: 'Litecoin', payout_rate: 85, trade_duration_seconds: 60 },
      { symbol: 'UNIUSDT', name: 'Uniswap', payout_rate: 85, trade_duration_seconds: 60 },
      { symbol: 'ATOMUSDT', name: 'Cosmos', payout_rate: 85, trade_duration_seconds: 60 },
      { symbol: 'XLMUSDT', name: 'Stellar', payout_rate: 85, trade_duration_seconds: 60 }
    ];

    for (const market of cryptoMarkets) {
      await pool.query(`
        INSERT INTO market_prices (symbol, name, payout_rate, trade_duration_seconds, is_tradable, last_updated)
        VALUES ($1, $2, $3, $4, true, NOW())
        ON CONFLICT (symbol) DO UPDATE SET
          name = EXCLUDED.name,
          payout_rate = EXCLUDED.payout_rate,
          trade_duration_seconds = EXCLUDED.trade_duration_seconds,
          is_tradable = EXCLUDED.is_tradable
      `, [market.symbol, market.name, market.payout_rate, market.trade_duration_seconds]);
    }

    const defaultPlans = [
      { name: 'Starter', description: 'Perfect for beginners', min_amount: 50, max_amount: 499, roi_percentage: 5, duration_days: 7 },
      { name: 'Basic', description: 'Great for growing your investment', min_amount: 500, max_amount: 4999, roi_percentage: 10, duration_days: 14 },
      { name: 'Premium', description: 'Maximum returns for serious investors', min_amount: 5000, max_amount: 50000, roi_percentage: 20, duration_days: 30 }
    ];

    for (const plan of defaultPlans) {
      await pool.query(`
        INSERT INTO plans (name, description, min_amount, max_amount, roi_percentage, duration_days, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, true)
        ON CONFLICT DO NOTHING
      `, [plan.name, plan.description, plan.min_amount, plan.max_amount, plan.roi_percentage, plan.duration_days]).catch(() => {});
    }

    console.log('✅ Database initialized successfully with PostgreSQL');
  } catch (error) {
    console.error('Database initialization error:', error.message);
  }
};

export default pool;
