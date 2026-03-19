import { query } from '../config/database.js';

export const getAllLoans = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let sql = `
      SELECT l.*, u.first_name, u.last_name, u.email, a.username as approved_by_name
      FROM loans l
      LEFT JOIN users u ON l.user_id = u.id
      LEFT JOIN admin_users a ON l.approved_by = a.id
    `;
    const params = [];

    if (status) {
      sql += ` WHERE l.status = $1`;
      params.push(status);
    }

    sql += ` ORDER BY l.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const loans = await query(sql, params);

    let countSql = `SELECT COUNT(*) FROM loans`;
    const countParams = [];
    if (status) {
      countSql += ` WHERE status = $1`;
      countParams.push(status);
    }
    const countResult = await query(countSql, countParams);

    res.json({
      loans,
      total: parseInt(countResult[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(countResult[0].count / limit)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getLoanDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const loans = await query(`
      SELECT l.*, u.first_name, u.last_name, u.email, u.balance, u.trading_balance,
             a.username as approved_by_name
      FROM loans l
      LEFT JOIN users u ON l.user_id = u.id
      LEFT JOIN admin_users a ON l.approved_by = a.id
      WHERE l.id = $1
    `, [id]);

    if (loans.length === 0) {
      return res.status(404).json({ error: 'Loan not found' });
    }

    res.json(loans[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const approveLoan = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.admin.id;
    const { notes } = req.body;

    const loans = await query(`SELECT * FROM loans WHERE id = $1 AND status = 'pending'`, [id]);

    if (loans.length === 0) {
      return res.status(404).json({ error: 'Pending loan not found' });
    }

    const loan = loans[0];

    await query(`
      UPDATE loans 
      SET status = 'approved', approved_by = $1, approved_at = NOW(), notes = $2, updated_at = NOW()
      WHERE id = $3
    `, [adminId, notes || null, id]);

    await query(`
      UPDATE users SET balance = balance + $1, updated_at = NOW() WHERE id = $2
    `, [loan.amount, loan.user_id]);

    await query(`
      INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, status, description)
      SELECT $1, 'loan_disbursement', $2, u.balance - $2, u.balance, 'completed', $3
      FROM users u WHERE u.id = $1
    `, [loan.user_id, loan.amount, `Loan disbursement for Loan #${id}`]);

    await query(`
      INSERT INTO notifications (user_id, title, message, type)
      VALUES ($1, 'Loan Approved', $2, 'success')
    `, [loan.user_id, `Your loan of $${loan.amount} has been approved and added to your balance.`]);

    res.json({
      message: 'Loan approved successfully',
      loanId: id,
      disbursedAmount: loan.amount
    });
  } catch (error) {
    console.error('Loan approval error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const rejectLoan = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const loans = await query(`SELECT * FROM loans WHERE id = $1 AND status = 'pending'`, [id]);

    if (loans.length === 0) {
      return res.status(404).json({ error: 'Pending loan not found' });
    }

    const loan = loans[0];

    await query(`
      UPDATE loans 
      SET status = 'rejected', rejection_reason = $1, updated_at = NOW()
      WHERE id = $2
    `, [reason, id]);

    await query(`
      INSERT INTO notifications (user_id, title, message, type)
      VALUES ($1, 'Loan Rejected', $2, 'error')
    `, [loan.user_id, `Your loan application of $${loan.amount} has been rejected. Reason: ${reason}`]);

    res.json({
      message: 'Loan rejected successfully',
      loanId: id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getLoanStats = async (req, res) => {
  try {
    const stats = await query(`
      SELECT 
        COUNT(*) as total_loans,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_loans,
        COUNT(*) FILTER (WHERE status = 'approved') as active_loans,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_loans,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected_loans,
        COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) as pending_amount,
        COALESCE(SUM(amount) FILTER (WHERE status = 'approved'), 0) as disbursed_amount,
        COALESCE(SUM(repayment_amount) FILTER (WHERE status = 'completed'), 0) as total_repaid,
        COALESCE(AVG(interest_rate) FILTER (WHERE status = 'approved'), 0) as avg_interest_rate
      FROM loans
    `);

    res.json({
      totalLoans: parseInt(stats[0].total_loans),
      pendingLoans: parseInt(stats[0].pending_loans),
      activeLoans: parseInt(stats[0].active_loans),
      completedLoans: parseInt(stats[0].completed_loans),
      rejectedLoans: parseInt(stats[0].rejected_loans),
      pendingAmount: parseFloat(stats[0].pending_amount),
      disbursedAmount: parseFloat(stats[0].disbursed_amount),
      totalRepaid: parseFloat(stats[0].total_repaid),
      avgInterestRate: parseFloat(stats[0].avg_interest_rate)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
