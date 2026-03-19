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
      sql += ` WHERE l.status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY l.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const loans = await query(sql, params);

    let countSql = `SELECT COUNT(*) as count FROM loans`;
    const countParams = [];
    if (status) {
      countSql += ` WHERE status = ?`;
      countParams.push(status);
    }
    const countResult = await query(countSql, countParams);

    res.json({
      loans,
      total: parseInt(countResult[0]?.count || 0),
      page: parseInt(page),
      totalPages: Math.ceil((countResult[0]?.count || 0) / limit)
    });
  } catch (error) {
    console.error('getAllLoans error:', error);
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
      WHERE l.id = ?
    `, [id]);

    if (loans.length === 0) {
      return res.status(404).json({ error: 'Loan not found' });
    }

    res.json(loans[0]);
  } catch (error) {
    console.error('getLoanDetails error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const approveLoan = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.admin.id;
    const { notes } = req.body;

    const loans = await query(`SELECT * FROM loans WHERE id = ? AND status = 'pending'`, [id]);

    if (loans.length === 0) {
      return res.status(404).json({ error: 'Pending loan not found' });
    }

    const loan = loans[0];

    await query(`
      UPDATE loans 
      SET status = 'approved', approved_by = ?, approved_at = NOW(), notes = ?, updated_at = NOW()
      WHERE id = ?
    `, [adminId, notes || null, id]);

    await query(`
      UPDATE users SET balance = balance + ?, updated_at = NOW() WHERE id = ?
    `, [loan.amount, loan.user_id]);

    await query(`
      INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, status, description)
      SELECT ?, 'loan_disbursement', ?, u.balance - ?, u.balance, 'completed', ?
      FROM users u WHERE u.id = ?
    `, [loan.user_id, loan.amount, loan.amount, `Loan disbursement for Loan #${id}`, loan.user_id]);

    await query(`
      INSERT INTO notifications (user_id, title, message, type)
      VALUES (?, 'Loan Approved', ?, 'success')
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

    const loans = await query(`SELECT * FROM loans WHERE id = ? AND status = 'pending'`, [id]);

    if (loans.length === 0) {
      return res.status(404).json({ error: 'Pending loan not found' });
    }

    const loan = loans[0];

    await query(`
      UPDATE loans 
      SET status = 'rejected', rejection_reason = ?, updated_at = NOW()
      WHERE id = ?
    `, [reason, id]);

    await query(`
      INSERT INTO notifications (user_id, title, message, type)
      VALUES (?, 'Loan Rejected', ?, 'error')
    `, [loan.user_id, `Your loan application of $${loan.amount} has been rejected. Reason: ${reason}`]);

    res.json({
      message: 'Loan rejected successfully',
      loanId: id
    });
  } catch (error) {
    console.error('rejectLoan error:', error);
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
      totalLoans: parseInt(stats[0]?.total_loans || 0),
      pendingLoans: parseInt(stats[0]?.pending_loans || 0),
      activeLoans: parseInt(stats[0]?.active_loans || 0),
      completedLoans: parseInt(stats[0]?.completed_loans || 0),
      rejectedLoans: parseInt(stats[0]?.rejected_loans || 0),
      pendingAmount: parseFloat(stats[0]?.pending_amount || 0),
      disbursedAmount: parseFloat(stats[0]?.disbursed_amount || 0),
      totalRepaid: parseFloat(stats[0]?.total_repaid || 0),
      avgInterestRate: parseFloat(stats[0]?.avg_interest_rate || 0)
    });
  } catch (error) {
    console.error('getLoanStats error:', error);
    res.status(500).json({ error: error.message });
  }
};
