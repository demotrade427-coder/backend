import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function migrateDatabase() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'root',
      database: process.env.DB_NAME || 'investment_platform'
    });

    // Create admin_settings table
    try {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS admin_settings (
          id INT PRIMARY KEY AUTO_INCREMENT,
          setting_key VARCHAR(100) NOT NULL UNIQUE,
          setting_value TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      console.log('✓ Created admin_settings table');
    } catch (e) {
      console.log('admin_settings table:', e.message);
    }

    // Insert default settings
    try {
      await connection.query(`
        INSERT IGNORE INTO admin_settings (setting_key, setting_value) VALUES ('auto_settlement', 'true')
      `);
      console.log('✓ Inserted default settings');
    } catch (e) {
      console.log('Default settings:', e.message);
    }

    console.log('Checking and adding missing columns to users table...');

    // Add is_agent column if not exists
    try {
      await connection.query('ALTER TABLE users ADD COLUMN is_agent TINYINT(1) DEFAULT 0');
      console.log('✓ Added is_agent column');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELD_NAME') {
        console.log('✓ is_agent column already exists');
      } else {
        console.log('Error adding is_agent:', e.message);
      }
    }

    // Add is_admin column if not exists
    try {
      await connection.query('ALTER TABLE users ADD COLUMN is_admin TINYINT(1) DEFAULT 0');
      console.log('✓ Added is_admin column');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELD_NAME') {
        console.log('✓ is_admin column already exists');
      } else {
        console.log('Error adding is_admin:', e.message);
      }
    }

    // Add is_active column if not exists
    try {
      await connection.query('ALTER TABLE users ADD COLUMN is_active TINYINT(1) DEFAULT 1');
      console.log('✓ Added is_active column');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELD_NAME') {
        console.log('✓ is_active column already exists');
      } else {
        console.log('Error adding is_active:', e.message);
      }
    }

    // Add kyc_status column if not exists
    try {
      await connection.query('ALTER TABLE users ADD COLUMN kyc_status VARCHAR(50) DEFAULT "pending"');
      console.log('✓ Added kyc_status column');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELD_NAME') {
        console.log('✓ kyc_status column already exists');
      } else {
        console.log('Error adding kyc_status:', e.message);
      }
    }

    console.log('');
    console.log('✓ Database migration complete!');

  } catch (error) {
    console.error('Migration error:', error.message);
  } finally {
    if (connection) await connection.end();
  }
}

migrateDatabase();