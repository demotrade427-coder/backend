import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import authRoutes from './routes/authRoutes.js';
import planRoutes from './routes/planRoutes.js';
import investmentRoutes from './routes/investmentRoutes.js';
import depositRoutes from './routes/depositRoutes.js';
import withdrawalRoutes from './routes/withdrawalRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import adminLoanRoutes from './routes/adminLoanRoutes.js';
import tradingRoutes from './routes/tradingRoutes.js';
import loanRoutes from './routes/loanRoutes.js';
import { initializeDatabase } from './config/database.js';
import { startPriceUpdates, getAllPrices } from './services/priceService.js';
import { startTradeSettlement } from './services/tradeSettlement.js';
import { initSocket } from './services/socketService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const httpServer = createServer(app);

initSocket(httpServer);

app.use(cors({
  origin: [FRONTEND_URL, 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/investments', investmentRoutes);
app.use('/api/deposits', depositRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/loans', adminLoanRoutes);
app.use('/api/trading', tradingRoutes);
app.use('/api/loans', loanRoutes);

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
  
  const selfPing = () => {
    const url = process.env.SELF_URL || `http://localhost:${PORT}`;
    fetch(`${url}/api/health`)
      .then(() => console.log('Self-ping successful'))
      .catch(() => {});
  };
  
  setInterval(selfPing, 10 * 60 * 1000);
  
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket server ready`);
  });
};

startServer();

export default app;
