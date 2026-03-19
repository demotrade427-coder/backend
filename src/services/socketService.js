import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

let io;

export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || '*',
      methods: ['GET', 'POST'],
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        socket.user = decoded;
      } catch (err) {
        socket.user = null;
      }
    }
    
    const adminToken = socket.handshake.auth.adminToken;
    if (adminToken) {
      try {
        const decoded = jwt.verify(adminToken, process.env.JWT_SECRET || 'your-secret-key');
        socket.admin = decoded;
        socket.isAdmin = true;
      } catch (err) {
        socket.admin = null;
      }
    }
    
    next();
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    if (socket.isAdmin) {
      socket.join('admin');
      console.log(`Admin connected: ${socket.id}`);
    }

    if (socket.user) {
      socket.join(`user:${socket.user.id}`);
      console.log(`User connected: ${socket.user.id}`);
    }

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

export const emitToAdmin = (event, data) => {
  if (io) {
    io.to('admin').emit(event, data);
  }
};

export const emitToUser = (userId, event, data) => {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
};

export const emitNewDeposit = (deposit) => {
  emitToAdmin('new_deposit', deposit);
};

export const emitNewWithdrawal = (withdrawal) => {
  emitToAdmin('new_withdrawal', withdrawal);
};

export const emitNewTrade = (trade) => {
  emitToAdmin('new_trade', trade);
};

export const emitNewUser = (user) => {
  emitToAdmin('new_user', user);
};

export const emitNewTicket = (ticket) => {
  emitToAdmin('new_ticket', ticket);
};

export const emitLoanUpdate = (loan) => {
  emitToAdmin('loan_update', loan);
  emitToUser(loan.user_id, 'loan_status_update', loan);
};

export const emitTradeResult = (userId, trade) => {
  emitToUser(userId, 'trade_result', trade);
};

export default {
  initSocket,
  getIO,
  emitToAdmin,
  emitToUser,
  emitNewDeposit,
  emitNewWithdrawal,
  emitNewTrade,
  emitNewUser,
  emitNewTicket,
  emitLoanUpdate,
  emitTradeResult,
};
