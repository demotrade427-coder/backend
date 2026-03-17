import express from 'express';
import { getUserDashboard, getTransactions, getAdminDashboard, getAllUsers, updateUser, getAllTransactions } from '../controllers/dashboardController.js';
import { authenticate, authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

router.get('/user', authenticate, getUserDashboard);
router.get('/transactions', authenticate, getTransactions);
router.get('/admin', authenticateAdmin, getAdminDashboard);
router.get('/admin/users', authenticateAdmin, getAllUsers);
router.patch('/admin/users/:id', authenticateAdmin, updateUser);
router.get('/admin/transactions', authenticateAdmin, getAllTransactions);

export default router;