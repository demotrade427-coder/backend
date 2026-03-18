import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await query('SELECT id, first_name, last_name, email, is_admin, is_active FROM users WHERE id = ?', [decoded.userId]);
    
    if (!user.length || !user[0].is_active) {
      return res.status(401).json({ message: 'Invalid or inactive user' });
    }

    req.user = user[0];
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

export const authenticateAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const adminId = decoded.adminId || decoded.id;
    
    if (adminId === 1 && decoded.role === 'super_admin') {
      req.admin = { id: 1, username: 'admin', role: 'super_admin', is_active: true };
      return next();
    }
    
    try {
      const admin = await query('SELECT * FROM admin_users WHERE id = ? AND is_active = true', [adminId]);
      
      if (!admin.length) {
        return res.status(401).json({ message: 'Invalid admin' });
      }

      req.admin = admin[0];
    } catch (dbError) {
      if (dbError.code === '42P01') {
        return res.status(401).json({ message: 'Admin not configured' });
      }
      throw dbError;
    }
    
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await query('SELECT id, first_name, last_name, email, is_admin FROM users WHERE id = ?', [decoded.userId]);
    
    if (user.length) {
      req.user = user[0];
    }
    next();
  } catch (error) {
    next();
  }
};

export const verifyUser = authenticate;