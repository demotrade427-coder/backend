import { query } from '../config/database.js';

export const getAllPlans = async (req, res) => {
  try {
    const plans = await query('SELECT * FROM plans WHERE is_active = true ORDER BY min_amount ASC');
    res.json(plans);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getPlan = async (req, res) => {
  try {
    const plans = await query('SELECT * FROM plans WHERE id = ?', [req.params.id]);
    if (!plans.length) {
      return res.status(404).json({ message: 'Plan not found' });
    }
    res.json(plans[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const createPlan = async (req, res) => {
  try {
    const { name, description, minAmount, maxAmount, roiPercentage, durationDays } = req.body;

    const result = await query(
      'INSERT INTO plans (name, description, min_amount, max_amount, roi_percentage, duration_days) VALUES (?, ?, ?, ?, ?, ?)',
      [name, description, minAmount, maxAmount, roiPercentage, durationDays]
    );

    res.status(201).json({ message: 'Plan created', id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updatePlan = async (req, res) => {
  try {
    const { name, description, minAmount, maxAmount, roiPercentage, durationDays, isActive } = req.body;

    await query(
      'UPDATE plans SET name = ?, description = ?, min_amount = ?, max_amount = ?, roi_percentage = ?, duration_days = ?, is_active = ? WHERE id = ?',
      [name, description, minAmount, maxAmount, roiPercentage, durationDays, isActive, req.params.id]
    );

    res.json({ message: 'Plan updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const deletePlan = async (req, res) => {
  try {
    await query('DELETE FROM plans WHERE id = ?', [req.params.id]);
    res.json({ message: 'Plan deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getAllPlansAdmin = async (req, res) => {
  try {
    const plans = await query('SELECT * FROM plans ORDER BY created_at DESC');
    res.json(plans);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};