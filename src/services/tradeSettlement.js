import { query } from '../config/database.js';
import { getPrice } from './priceService.js';

let autoSettlementEnabled = true;

export async function checkAutoSettlementSetting() {
  try {
    const settings = await query('SELECT setting_value FROM admin_settings WHERE setting_key = ?', ['auto_settlement']);
    autoSettlementEnabled = settings.length === 0 || settings[0].setting_value === 'true';
    console.log(`Auto-settlement: ${autoSettlementEnabled ? 'ENABLED' : 'DISABLED'}`);
  } catch (error) {
    autoSettlementEnabled = true;
  }
}

export async function settleExpiredTrades() {
  if (!autoSettlementEnabled) {
    return;
  }

  try {
    const now = new Date();
    
    const expiredTrades = await query(`
      SELECT t.*, m.payout_rate, m.trade_duration_seconds
      FROM trades t
      LEFT JOIN market_prices m ON t.coin_symbol = m.symbol
      WHERE t.result = 'pending' AND t.expires_at IS NOT NULL AND t.expires_at <= ?
    `, [now]);

    if (expiredTrades.length === 0) {
      return;
    }

    console.log(`Settling ${expiredTrades.length} expired trades...`);

    for (const trade of expiredTrades) {
      const priceData = await getPrice(trade.coin_symbol);
      if (!priceData) {
        console.error(`Could not get price for ${trade.coin_symbol}`);
        continue;
      }

      const exitPrice = priceData.price;
      const entryPrice = Number(trade.price);
      const payoutRate = trade.payout_rate ? Number(trade.payout_rate) / 100 : 0.85;
      
      let result = 'loss';
      let profitLoss = -Number(trade.amount);

      if (trade.trade_type === 'buy') {
        if (exitPrice > entryPrice) {
          result = 'win';
          profitLoss = Number(trade.amount) * payoutRate;
        }
      } else if (trade.trade_type === 'sell') {
        if (exitPrice < entryPrice) {
          result = 'win';
          profitLoss = Number(trade.amount) * payoutRate;
        }
      }

      await query(
        'UPDATE trades SET result = ?, profit_loss = ?, exit_price = ?, settled_at = NOW() WHERE id = ?',
        [result, profitLoss, exitPrice, trade.id]
      );

      if (profitLoss !== 0) {
        await query(
          'UPDATE users SET trading_balance = trading_balance + ?, total_profit = total_profit + ? WHERE id = ?',
          [profitLoss, profitLoss > 0 ? profitLoss : 0, trade.user_id]
        );

        const user = await query('SELECT trading_balance FROM users WHERE id = ?', [trade.user_id]);
        const newBalance = user.length > 0 ? Number(user[0].trading_balance) : 0;

        await query(
          'INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, status, description, reference_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [trade.user_id, result === 'win' ? 'profit' : 'loss', Math.abs(profitLoss), newBalance - profitLoss, newBalance, 'completed', `Trade ${result}: ${trade.coin_symbol} ${trade.trade_type}`, trade.id]
        );
      }
    }

    console.log(`Settled ${expiredTrades.length} trades`);
  } catch (error) {
    console.error('Error settling trades:', error);
  }
}

export function startTradeSettlement(intervalMs = 5000) {
  console.log('Starting automated trade settlement...');
  checkAutoSettlementSetting();
  setInterval(settleExpiredTrades, intervalMs);
  setInterval(checkAutoSettlementSetting, 30000);
}

export default {
  settleExpiredTrades,
  startTradeSettlement
};
