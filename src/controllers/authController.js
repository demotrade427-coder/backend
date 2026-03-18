import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';

export const register = async (req, res) => {
  try {
    const { firstName, lastName, email, password, phone, country } = req.body;

    const existing = await query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await query(
      'INSERT INTO users (first_name, last_name, email, password, phone, country) VALUES (?, ?, ?, ?, ?, ?)',
      [firstName, lastName, email, hashedPassword, phone, country]
    );

    const token = jwt.sign({ userId: result.insertId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

    res.status(201).json({
      message: 'Registration successful',
      token,
      user: { id: result.insertId, firstName, lastName, email }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
      const token = jwt.sign({ id: 1, role: 'super_admin' }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
      return res.json({
        token,
        user: {
          id: 1,
          firstName: 'Admin',
          lastName: '',
          email: process.env.ADMIN_EMAIL,
          isAdmin: true
        }
      });
    }

    const users = await query('SELECT * FROM users WHERE email = ?', [email]);
    if (!users.length) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = users[0];
    if (user.is_active === false) {
      return res.status(401).json({ message: 'Account is disabled' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

    res.json({
      token,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        isAdmin: user.is_admin,
        balance: user.balance,
        totalInvested: user.total_invested,
        totalProfit: user.total_profit
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (email !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ adminId: 1, role: 'super_admin' }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

    res.json({
      token,
      admin: {
        id: 1,
        username: 'admin',
        email: process.env.ADMIN_EMAIL,
        role: 'super_admin'
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getMe = async (req, res) => {
  try {
    const userId = req.user?.id || req.user.id;
    const users = await query(
      'SELECT id, first_name, last_name, email, phone, country, balance, total_deposited, total_withdrawn, total_traded, total_profit, kyc_status, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (!users.length) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = users[0];
    res.json({
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      phone: user.phone,
      country: user.country,
      balance: user.balance,
      totalDeposited: user.total_deposited,
      totalWithdrawn: user.total_withdrawn,
      totalTraded: user.total_traded,
      totalProfit: user.total_profit,
      kycStatus: user.kyc_status,
      createdAt: user.created_at
    });
  } catch (error) {
    console.error('getMe error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};