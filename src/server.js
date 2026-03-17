import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/authRoutes.js';
import planRoutes from './routes/planRoutes.js';
import investmentRoutes from './routes/investmentRoutes.js';
import depositRoutes from './routes/depositRoutes.js';
import withdrawalRoutes from './routes/withdrawalRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import tradingRoutes from './routes/tradingRoutes.js';
import { initializeDatabase } from './config/database.js';
import { startPriceUpdates, getAllPrices } from './services/priceService.js';
import { startTradeSettlement } from './services/tradeSettlement.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/investments', investmentRoutes);
app.use('/api/deposits', depositRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/trading', tradingRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Trading Platform API is running' });
});

app.get('/api/prices', async (req, res) => {
  try {
    const prices = await getAllPrices();
    res.json(prices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ message: 'Something went wrong!', error: err.message });
});

const startServer = async () => {
  await initializeDatabase();
  startPriceUpdates(5000);
  startTradeSettlement(5000);
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();

export default app;
