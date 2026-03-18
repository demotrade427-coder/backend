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
    const isPg = !!pool.options.connectionString;
    
    let finalSql = sql;
    let finalParams = params;
    
    if (isPg && sql.includes('?')) {
      const formatted = formatPg(sql, params);
      finalSql = formatted.text;
      finalParams = formatted.values;
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

    console.log('✅ Database initialized successfully with PostgreSQL');
  } catch (error) {
    console.error('Database initialization error:', error.message);
  }
};

export default pool;
