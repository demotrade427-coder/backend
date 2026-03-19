import { query } from '../config/database.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const LOAN_TERMS = [
  { duration: 7, interestRate: 5, label: '7 Days - 5%' },
  { duration: 14, interestRate: 8, label: '14 Days - 8%' },
  { duration: 30, interestRate: 12, label: '30 Days - 12%' },
  { duration: 60, interestRate: 18, label: '60 Days - 18%' },
  { duration: 90, interestRate: 24, label: '90 Days - 24%' },
];

export const getLoanTerms = async (req, res) => {
  try {
    res.json({ terms: LOAN_TERMS });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const applyForLoan = async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, duration_days, collateral_amount, collateral_type } = req.body;

    if (!amount || amount < 100) {
      return res.status(400).json({ error: 'Minimum loan amount is $100' });
    }

    if (!duration_days || duration_days < 7) {
      return res.status(400).json({ error: 'Minimum loan duration is 7 days' });
    }

    const term = LOAN_TERMS.find(t => t.duration === parseInt(duration_days));
    if (!term) {
      return res.status(400).json({ error: 'Invalid loan duration' });
    }

    const interestRate = term.interestRate;
    const repaymentAmount = parseFloat(amount) * (1 + interestRate / 100);

    const result = await query(
      `INSERT INTO loans (user_id, amount, interest_rate, duration_days, collateral_amount, collateral_type, repayment_amount, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING id`,
      [userId, amount, interestRate, duration_days, collateral_amount || null, collateral_type || null, repaymentAmount]
    );

    res.status(201).json({
      message: 'Loan application submitted successfully',
      loanId: result.insertId || result.rows[0]?.id,
      details: {
        amount,
        interestRate,
        duration: duration_days,
        repaymentAmount
      }
    });
  } catch (error) {
    console.error('Loan application error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getMyLoans = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;

    let sql = `SELECT * FROM loans WHERE user_id = $1`;
    const params = [userId];

    if (status) {
      sql += ` AND status = $2`;
      params.push(status);
    }

    sql += ` ORDER BY created_at DESC`;

    const loans = await query(sql, params);

    res.json(loans);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getLoanDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const loans = await query(
      `SELECT * FROM loans WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (loans.length === 0) {
      return res.status(404).json({ error: 'Loan not found' });
    }

    res.json(loans[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const repayLoan = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const loans = await query(
      `SELECT * FROM loans WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (loans.length === 0) {
      return res.status(404).json({ error: 'Loan not found' });
    }

    const loan = loans[0];

    if (loan.status !== 'approved') {
      return res.status(400).json({ error: 'Only approved loans can be repaid' });
    }

    if (loan.status === 'completed') {
      return res.status(400).json({ error: 'Loan has already been repaid' });
    }

    const userBalance = await query(
      `SELECT balance FROM users WHERE id = $1`,
      [userId]
    );

    if (userBalance[0].balance < loan.repayment_amount) {
      return res.status(400).json({ error: 'Insufficient balance for repayment' });
    }

    const newBalance = parseFloat(userBalance[0].balance) - parseFloat(loan.repayment_amount);

    await query(
      `UPDATE users SET balance = $1, updated_at = NOW() WHERE id = $2`,
      [newBalance, userId]
    );

    await query(
      `UPDATE loans SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id]
    );

    await query(
      `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, status, description)
       VALUES ($1, 'loan_repayment', $2, $3, $4, 'completed', $5)`,
      [userId, loan.repayment_amount, userBalance[0].balance, newBalance, `Loan repayment for Loan #${id}`]
    );

    res.json({
      message: 'Loan repaid successfully',
      repaymentAmount: loan.repayment_amount,
      newBalance
    });
  } catch (error) {
    console.error('Loan repayment error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getActiveLoanStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const stats = await query(
      `SELECT 
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'approved') as active_count,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
        COALESCE(SUM(amount) FILTER (WHERE status = 'approved'), 0) as active_amount,
        COALESCE(SUM(repayment_amount) FILTER (WHERE status = 'approved'), 0) as pending_repayment
       FROM loans WHERE user_id = $1`,
      [userId]
    );

    res.json({
      pendingLoans: parseInt(stats[0].pending_count),
      activeLoans: parseInt(stats[0].active_count),
      completedLoans: parseInt(stats[0].completed_count),
      activeAmount: parseFloat(stats[0].active_amount),
      pendingRepayment: parseFloat(stats[0].pending_repayment)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
