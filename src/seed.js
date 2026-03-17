import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

async function seedDatabase() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'root',
      database: process.env.DB_NAME || 'investment_platform'
    });

    console.log('Connected to database, checking tables...');

    // Check existing tables
    const [tables] = await connection.query('SHOW TABLES');
    const tableNames = tables.map(t => Object.values(t)[0]);
    console.log('Existing tables:', tableNames);

    // Create trades table if not exists
    if (!tableNames.includes('trades')) {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS trades (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          coin_name VARCHAR(50) NOT NULL,
          coin_symbol VARCHAR(10) NOT NULL,
          trade_type ENUM('buy', 'sell') NOT NULL,
          amount DECIMAL(15,2) NOT NULL,
          leverage INT DEFAULT 1,
          result ENUM('win', 'loss', 'pending') DEFAULT 'pending',
          profit_loss DECIMAL(15,2),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `);
      console.log('✓ Created trades table');
    }

    // Create coins table if not exists
    if (!tableNames.includes('coins')) {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS coins (
          id INT AUTO_INCREMENT PRIMARY KEY,
          coin_name VARCHAR(50) NOT NULL,
          coin_symbol VARCHAR(10) NOT NULL,
          coin_type ENUM('crypto', 'stock', 'gold', 'forex') NOT NULL,
          current_price DECIMAL(15,2) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✓ Created coins table');
    }

    // Create support_tickets table if not exists
    if (!tableNames.includes('support_tickets')) {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS support_tickets (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          subject VARCHAR(200) NOT NULL,
          message TEXT NOT NULL,
          status ENUM('open', 'closed') DEFAULT 'open',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `);
      console.log('✓ Created support_tickets table');
    }

    // Create plans table if not exists
    if (!tableNames.includes('plans')) {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS plans (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(50) NOT NULL,
          min_amount DECIMAL(15,2) NOT NULL,
          max_amount DECIMAL(15,2) NOT NULL,
          duration_days INT NOT NULL,
          profit_percentage DECIMAL(5,2) NOT NULL,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✓ Created plans table');
    }

    // Create investments table if not exists
    if (!tableNames.includes('investments')) {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS investments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          plan_id INT,
          amount DECIMAL(15,2) NOT NULL,
          profit DECIMAL(15,2) DEFAULT 0,
          status ENUM('active', 'completed') DEFAULT 'active',
          start_date DATE,
          end_date DATE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (plan_id) REFERENCES plans(id)
        )
      `);
      console.log('✓ Created investments table');
    }

    console.log('');
    console.log('Seeding test data...');

    const hashedPassword = await bcrypt.hash('password123', 10);

    // Insert test users if none exist
    const [existingUsers] = await connection.query('SELECT COUNT(*) as count FROM users');
    if (existingUsers[0].count === 0) {
      await connection.query(`INSERT INTO users (first_name, last_name, email, password, phone, country, balance, total_invested, total_profit, is_agent, is_active, kyc_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`, 
        ['John', 'Doe', 'john@example.com', hashedPassword, '+1234567890', 'USA', 5000, 2000, 500, false, true, 'verified']);
      await connection.query(`INSERT INTO users (first_name, last_name, email, password, phone, country, balance, total_invested, total_profit, is_agent, is_active, kyc_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`, 
        ['Jane', 'Smith', 'jane@example.com', hashedPassword, '+1234567891', 'UK', 7500, 3000, 750, false, true, 'verified']);
      await connection.query(`INSERT INTO users (first_name, last_name, email, password, phone, country, balance, total_invested, total_profit, is_agent, is_active, kyc_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`, 
        ['Bob', 'Wilson', 'bob@example.com', hashedPassword, '+1234567892', 'Canada', 10000, 5000, 1000, false, true, 'pending']);
      await connection.query(`INSERT INTO users (first_name, last_name, email, password, phone, country, balance, total_invested, total_profit, is_agent, is_active, kyc_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`, 
        ['Alice', 'Brown', 'alice@example.com', hashedPassword, '+1234567893', 'Australia', 2500, 1000, 250, true, true, 'verified']);
      await connection.query(`INSERT INTO users (first_name, last_name, email, password, phone, country, balance, total_invested, total_profit, is_agent, is_active, kyc_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`, 
        ['Charlie', 'Davis', 'charlie@example.com', hashedPassword, '+1234567894', 'Germany', 15000, 8000, 1500, false, true, 'verified']);
      console.log('✓ Users seeded (5 users)');
    } else {
      console.log('✓ Users already exist');
    }

    // Insert test deposits
    const [existingDeposits] = await connection.query('SELECT COUNT(*) as count FROM deposits');
    if (existingDeposits[0].count === 0) {
      await connection.query(`INSERT INTO deposits (user_id, amount, payment_method, status, transaction_hash, created_at) VALUES (1, 1000, 'bank_transfer', 'approved', 'txn_001', NOW() - INTERVAL 5 DAY)`);
      await connection.query(`INSERT INTO deposits (user_id, amount, payment_method, status, transaction_hash, created_at) VALUES (2, 2000, 'crypto', 'approved', 'txn_002', NOW() - INTERVAL 4 DAY)`);
      await connection.query(`INSERT INTO deposits (user_id, amount, payment_method, status, transaction_hash, created_at) VALUES (3, 1500, 'bank_transfer', 'pending', 'txn_003', NOW() - INTERVAL 1 DAY)`);
      await connection.query(`INSERT INTO deposits (user_id, amount, payment_method, status, transaction_hash, created_at) VALUES (5, 5000, 'crypto', 'approved', 'txn_004', NOW() - INTERVAL 3 DAY)`);
      await connection.query(`INSERT INTO deposits (user_id, amount, payment_method, status, transaction_hash, created_at) VALUES (1, 500, 'crypto', 'rejected', 'txn_005', NOW() - INTERVAL 2 DAY)`);
      console.log('✓ Deposits seeded (5 deposits)');
    }

    // Insert test withdrawals
    const [existingWithdrawals] = await connection.query('SELECT COUNT(*) as count FROM withdrawals');
    if (existingWithdrawals[0].count === 0) {
      await connection.query(`INSERT INTO withdrawals (user_id, amount, wallet_address, status, transaction_hash, created_at) VALUES (1, 500, '0x1234567890abcdef', 'approved', 'wtxn_001', NOW() - INTERVAL 4 DAY)`);
      await connection.query(`INSERT INTO withdrawals (user_id, amount, wallet_address, status, transaction_hash, created_at) VALUES (2, 1000, '0xabcdef1234567890', 'pending', NULL, NOW() - INTERVAL 1 DAY)`);
      await connection.query(`INSERT INTO withdrawals (user_id, amount, wallet_address, status, transaction_hash, created_at) VALUES (3, 750, 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', 'approved', 'wtxn_003', NOW() - INTERVAL 3 DAY)`);
      await connection.query(`INSERT INTO withdrawals (user_id, amount, wallet_address, status, transaction_hash, created_at) VALUES (5, 2000, '0x9876543210fedcba', 'rejected', NULL, NOW() - INTERVAL 2 DAY)`);
      console.log('✓ Withdrawals seeded (4 withdrawals)');
    }

    // Insert test plans
    const [existingPlans] = await connection.query('SELECT COUNT(*) as count FROM plans');
    if (existingPlans[0].count === 0) {
      await connection.query(`INSERT INTO plans (name, min_amount, max_amount, duration_days, profit_percentage, is_active, created_at) VALUES ('Starter', 100, 5000, 90, 15, true, NOW())`);
      await connection.query(`INSERT INTO plans (name, min_amount, max_amount, duration_days, profit_percentage, is_active, created_at) VALUES ('Professional', 5000, 20000, 180, 25, true, NOW())`);
      await connection.query(`INSERT INTO plans (name, min_amount, max_amount, duration_days, profit_percentage, is_active, created_at) VALUES ('Enterprise', 20000, 100000, 365, 50, true, NOW())`);
      await connection.query(`INSERT INTO plans (name, min_amount, max_amount, duration_days, profit_percentage, is_active, created_at) VALUES ('Quick Win', 100, 5000, 30, 5, true, NOW())`);
      console.log('✓ Plans seeded (4 plans)');
    }

    // Insert test coins
    const [existingCoins] = await connection.query('SELECT COUNT(*) as count FROM coins');
    if (existingCoins[0].count === 0) {
      await connection.query(`INSERT INTO coins (coin_name, coin_symbol, coin_type, current_price, created_at) VALUES ('Bitcoin', 'BTC', 'crypto', 45000, NOW())`);
      await connection.query(`INSERT INTO coins (coin_name, coin_symbol, coin_type, current_price, created_at) VALUES ('Ethereum', 'ETH', 'crypto', 2500, NOW())`);
      await connection.query(`INSERT INTO coins (coin_name, coin_symbol, coin_type, current_price, created_at) VALUES ('Solana', 'SOL', 'crypto', 120, NOW())`);
      await connection.query(`INSERT INTO coins (coin_name, coin_symbol, coin_type, current_price, created_at) VALUES ('Apple Inc', 'AAPL', 'stock', 175.50, NOW())`);
      await connection.query(`INSERT INTO coins (coin_name, coin_symbol, coin_type, current_price, created_at) VALUES ('Gold', 'XAU', 'gold', 1950, NOW())`);
      console.log('✓ Coins seeded (5 coins)');
    }

    // Insert test support tickets
    const [existingTickets] = await connection.query('SELECT COUNT(*) as count FROM support_tickets');
    if (existingTickets[0].count === 0) {
      await connection.query(`INSERT INTO support_tickets (user_id, subject, message, status, created_at) VALUES (1, 'Withdrawal not received', 'I requested a withdrawal 3 days ago but have not received it yet.', 'open', NOW() - INTERVAL 2 DAY)`);
      await connection.query(`INSERT INTO support_tickets (user_id, subject, message, status, created_at) VALUES (2, 'Investment query', 'Can I upgrade my investment plan mid-term?', 'closed', NOW() - INTERVAL 5 DAY)`);
      await connection.query(`INSERT INTO support_tickets (user_id, subject, message, status, created_at) VALUES (3, 'Account verification', 'How long does KYC verification take?', 'open', NOW() - INTERVAL 1 DAY)`);
      await connection.query(`INSERT INTO support_tickets (user_id, subject, message, status, created_at) VALUES (5, 'Bonus credit', 'I was promised a bonus but it was not credited', 'open', NOW() - INTERVAL 3 DAY)`);
      console.log('✓ Support tickets seeded (4 tickets)');
    }

    console.log('');
    console.log('========================================');
    console.log('✓ Test data seeded successfully!');
    console.log('========================================');
    console.log('');
    console.log('=== Admin Login ===');
    console.log('Email: admin@trading.com');
    console.log('Password: admin123');
    console.log('');
    console.log('=== User Logins ===');
    console.log('Email: john@example.com / Password: password123');
    console.log('Email: jane@example.com / Password: password123');
    console.log('Email: bob@example.com / Password: password123');
    console.log('Email: alice@example.com (Agent) / Password: password123');
    console.log('Email: charlie@example.com / Password: password123');
    console.log('');
    console.log('=== Test Data ===');
    console.log('5 users (1 agent), 5 deposits, 4 withdrawals');
    console.log('4 plans, 5 coins, 4 support tickets');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    if (connection) await connection.end();
  }
}

seedDatabase();