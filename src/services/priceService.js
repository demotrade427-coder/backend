import { query } from '../config/database.js';

const BINANCE_API = 'https://api.binance.com/api/v3';

const CRYPTO_SYMBOLS = [
  { symbol: 'BTCUSDT', name: 'Bitcoin', shortName: 'BTC' },
  { symbol: 'ETHUSDT', name: 'Ethereum', shortName: 'ETH' },
  { symbol: 'BNBUSDT', name: 'BNB', shortName: 'BNB' },
  { symbol: 'SOLUSDT', name: 'Solana', shortName: 'SOL' },
  { symbol: 'XRPUSDT', name: 'XRP', shortName: 'XRP' },
  { symbol: 'ADAUSDT', name: 'Cardano', shortName: 'ADA' },
  { symbol: 'DOGEUSDT', name: 'Dogecoin', shortName: 'DOGE' },
  { symbol: 'AVAXUSDT', name: 'Avalanche', shortName: 'AVAX' },
  { symbol: 'DOTUSDT', name: 'Polkadot', shortName: 'DOT' },
  { symbol: 'MATICUSDT', name: 'Polygon', shortName: 'MATIC' },
  { symbol: 'LINKUSDT', name: 'Chainlink', shortName: 'LINK' },
  { symbol: 'LTCUSDT', name: 'Litecoin', shortName: 'LTC' },
  { symbol: 'UNIUSDT', name: 'Uniswap', shortName: 'UNI' },
  { symbol: 'ATOMUSDT', name: 'Cosmos', shortName: 'ATOM' },
  { symbol: 'XLMUSDT', name: 'Stellar', shortName: 'XLM' }
];

let cachedPrices = {};
let priceHistory = {};
let lastFetch = 0;
const CACHE_DURATION = 3000;

export async function fetchRealTimePrices() {
  try {
    const now = Date.now();
    if (now - lastFetch < CACHE_DURATION && Object.keys(cachedPrices).length > 0) {
      return cachedPrices;
    }

    const response = await fetch(`${BINANCE_API}/ticker/24hr`);
    const data = await response.json();

    if (Array.isArray(data)) {
      CRYPTO_SYMBOLS.forEach(crypto => {
        const ticker = data.find(t => t.symbol === crypto.symbol);
        
        if (ticker) {
          const currentPrice = parseFloat(ticker.lastPrice);
          const prevPrice = parseFloat(ticker.prevClosePrice);
          const change = currentPrice - prevPrice;
          const changePercent = ((change / prevPrice) * 100);

          cachedPrices[crypto.symbol] = {
            symbol: crypto.symbol,
            name: crypto.name,
            shortName: crypto.shortName,
            price: currentPrice,
            change: change,
            changePercent: changePercent,
            high: parseFloat(ticker.highPrice),
            low: parseFloat(ticker.lowPrice),
            volume: parseFloat(ticker.quoteVolume),
            bid: parseFloat(ticker.bidPrice),
            ask: parseFloat(ticker.askPrice),
            open: parseFloat(ticker.openPrice),
            prevClose: prevPrice
          };

          if (!priceHistory[crypto.symbol]) {
            priceHistory[crypto.symbol] = [];
          }
          priceHistory[crypto.symbol].push(currentPrice);
          if (priceHistory[crypto.symbol].length > 100) {
            priceHistory[crypto.symbol].shift();
          }
        }
      });

      await updatePricesInDB(cachedPrices);
      lastFetch = now;
      console.log(`✅ Updated ${Object.keys(cachedPrices).length} crypto prices from Binance`);
    }
  } catch (error) {
    console.error('❌ Error fetching Binance prices:', error.message);
    await loadPricesFromDB();
  }

  return cachedPrices;
}

async function updatePricesInDB(prices) {
  try {
    for (const [symbol, data] of Object.entries(prices)) {
      await query(`
        INSERT INTO market_prices (symbol, name, current_price, change_24h, change_percent_24h, is_tradable, last_updated)
        VALUES (?, ?, ?, ?, ?, true, NOW())
        ON DUPLICATE KEY UPDATE 
          previous_price = current_price,
          current_price = ?,
          change_24h = ?,
          change_percent_24h = ?,
          last_updated = NOW()
      `, [symbol, data.name, data.price, data.change, data.changePercent, data.price, data.change, data.changePercent]);
    }
  } catch (error) {
    console.error('Error updating prices in DB:', error.message);
  }
}

async function loadPricesFromDB() {
  try {
    const rows = await query('SELECT * FROM market_prices WHERE is_tradable = true');
    rows.forEach(row => {
      cachedPrices[row.symbol] = {
        symbol: row.symbol,
        name: row.name,
        price: Number(row.current_price),
        change: Number(row.change_24h),
        changePercent: Number(row.change_percent_24h),
        high: Number(row.current_price) * 1.01,
        low: Number(row.current_price) * 0.99,
        volume: 0
      };
    });
  } catch (error) {
    console.error('Error loading prices from DB:', error.message);
  }
}

export async function getPrice(symbol) {
  if (!cachedPrices[symbol]) {
    await fetchRealTimePrices();
  }
  return cachedPrices[symbol] || null;
}

export async function getAllPrices() {
  if (Object.keys(cachedPrices).length === 0) {
    await fetchRealTimePrices();
  }
  return cachedPrices;
}

export async function getPriceHistory(symbol, points = 30) {
  return priceHistory[symbol]?.slice(-points) || [];
}

export async function startPriceUpdates(intervalMs = 5000) {
  console.log('🚀 Starting real-time price updates from Binance...');
  await fetchRealTimePrices();
  
  setInterval(async () => {
    await fetchRealTimePrices();
  }, intervalMs);
}

export { CRYPTO_SYMBOLS };

export default {
  fetchRealTimePrices,
  getPrice,
  getAllPrices,
  getPriceHistory,
  startPriceUpdates,
  CRYPTO_SYMBOLS
};
