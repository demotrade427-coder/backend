import express from 'express';
import { body } from 'express-validator';
import { getAllPlans, getPlan, createPlan, updatePlan, deletePlan, getAllPlansAdmin } from '../controllers/planController.js';
import { authenticate, authenticateAdmin, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/', optionalAuth, getAllPlans);
router.get('/:id', optionalAuth, getPlan);

router.post('/', authenticateAdmin, [
  body('name').notEmpty(),
  body('minAmount').isNumeric(),
  body('maxAmount').isNumeric(),
  body('roiPercentage').isNumeric(),
  body('durationDays').isInt({ min: 1 })
], createPlan);

router.put('/:id', authenticateAdmin, updatePlan);
router.delete('/:id', authenticateAdmin, deletePlan);

router.get('/admin/all', authenticateAdmin, getAllPlansAdmin);

export default router;