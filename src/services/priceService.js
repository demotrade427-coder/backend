import { query } from '../config/database.js';

const BINANCE_API = 'https://api.binance.com/api/v3';
const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const CRYPTO_COMPARE_API = 'https://min-api.cryptocompare.com/data/pricemultifull';

const DEFAULT_PRICES = {
  BTCUSDT: { symbol: 'BTCUSDT', name: 'Bitcoin', shortName: 'BTC', price: 74000, change: 0, changePercent: 0, high: 75000, low: 73000, volume: 1000000000 },
  ETHUSDT: { symbol: 'ETHUSDT', name: 'Ethereum', shortName: 'ETH', price: 2300, change: 0, changePercent: 0, high: 2400, low: 2200, volume: 800000000 },
  BNBUSDT: { symbol: 'BNBUSDT', name: 'BNB', shortName: 'BNB', price: 670, change: 0, changePercent: 0, high: 700, low: 650, volume: 70000000 },
  SOLUSDT: { symbol: 'SOLUSDT', name: 'Solana', shortName: 'SOL', price: 94, change: 0, changePercent: 0, high: 100, low: 90, volume: 200000000 },
  XRPUSDT: { symbol: 'XRPUSDT', name: 'XRP', shortName: 'XRP', price: 1.5, change: 0, changePercent: 0, high: 1.6, low: 1.4, volume: 200000000 },
  ADAUSDT: { symbol: 'ADAUSDT', name: 'Cardano', shortName: 'ADA', price: 0.29, change: 0, changePercent: 0, high: 0.30, low: 0.28, volume: 30000000 },
  DOGEUSDT: { symbol: 'DOGEUSDT', name: 'Dogecoin', shortName: 'DOGE', price: 0.10, change: 0, changePercent: 0, high: 0.11, low: 0.09, volume: 80000000 },
  AVAXUSDT: { symbol: 'AVAXUSDT', name: 'Avalanche', shortName: 'AVAX', price: 10, change: 0, changePercent: 0, high: 11, low: 9, volume: 20000000 },
  DOTUSDT: { symbol: 'DOTUSDT', name: 'Polkadot', shortName: 'DOT', price: 1.6, change: 0, changePercent: 0, high: 1.7, low: 1.5, volume: 10000000 },
  MATICUSDT: { symbol: 'MATICUSDT', name: 'Polygon', shortName: 'MATIC', price: 0.38, change: 0, changePercent: 0, high: 0.40, low: 0.36, volume: 1000000 },
  LINKUSDT: { symbol: 'LINKUSDT', name: 'Chainlink', shortName: 'LINK', price: 9.8, change: 0, changePercent: 0, high: 10.5, low: 9.0, volume: 25000000 },
  LTCUSDT: { symbol: 'LTCUSDT', name: 'Litecoin', shortName: 'LTC', price: 58, change: 0, changePercent: 0, high: 62, low: 55, volume: 17000000 },
  UNIUSDT: { symbol: 'UNIUSDT', name: 'Uniswap', shortName: 'UNI', price: 4, change: 0, changePercent: 0, high: 4.5, low: 3.5, volume: 10000000 },
  ATOMUSDT: { symbol: 'ATOMUSDT', name: 'Cosmos', shortName: 'ATOM', price: 2, change: 0, changePercent: 0, high: 2.2, low: 1.8, volume: 5000000 },
  XLMUSDT: { symbol: 'XLMUSDT', name: 'Stellar', shortName: 'XLM', price: 0.18, change: 0, changePercent: 0, high: 0.20, low: 0.16, volume: 6000000 }
};

let cachedPrices = { ...DEFAULT_PRICES };
let priceHistory = {};
let lastFullRefresh = 0;

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

let lastFetch = 0;
const CACHE_DURATION = 3000;

export async function fetchRealTimePrices() {
  try {
    const now = Date.now();
    
    // Always fetch fresh data from Binance (most reliable)
    const response = await fetch(`${BINANCE_API}/ticker/24hr`);
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data)) {
        let updateCount = 0;
        CRYPTO_SYMBOLS.forEach(crypto => {
          const ticker = data.find(t => t.symbol === crypto.symbol);
          if (ticker) {
            const currentPrice = parseFloat(ticker.lastPrice);
            const openPrice = parseFloat(ticker.openPrice);
            const change = currentPrice - openPrice;
            const changePercent = openPrice !== 0 ? ((change / openPrice) * 100) : 0;

            cachedPrices[crypto.symbol] = {
              symbol: crypto.symbol,
              name: crypto.name,
              shortName: crypto.shortName,
              price: currentPrice,
              change: change,
              changePercent: isFinite(changePercent) ? changePercent : 0,
              high: parseFloat(ticker.highPrice),
              low: parseFloat(ticker.lowPrice),
              volume: parseFloat(ticker.quoteVolume),
              bid: parseFloat(ticker.bidPrice),
              ask: parseFloat(ticker.askPrice),
              open: openPrice,
              prevClose: parseFloat(ticker.prevClosePrice)
            };
            updateCount++;
            
            if (!priceHistory[crypto.symbol]) {
              priceHistory[crypto.symbol] = [];
            }
            priceHistory[crypto.symbol].push(currentPrice);
            if (priceHistory[crypto.symbol].length > 100) {
              priceHistory[crypto.symbol].shift();
            }
          }
        });

        if (updateCount > 0) {
          await updatePricesInDB(cachedPrices);
          lastFetch = now;
          console.log(`✅ Updated ${updateCount} crypto prices from Binance`);
        }
      }
    } else {
      throw new Error('Binance API error');
    }
  } catch (error) {
    console.error('❌ Error fetching prices:', error.message);
    await loadPricesFromDB();
  }

  return cachedPrices;
}

async function updatePricesInDB(prices) {
  try {
    for (const [symbol, data] of Object.entries(prices)) {
      await query(`
        INSERT INTO market_prices (symbol, name, current_price, change_24h, change_percent_24h, is_tradable, last_updated)
        VALUES ($1, $2, $3, $4, $5, true, NOW())
        ON CONFLICT (symbol) DO UPDATE SET
          previous_price = market_prices.current_price,
          current_price = $3,
          change_24h = $4,
          change_percent_24h = $5,
          last_updated = NOW()
      `, [symbol, data.name, data.price, data.change, data.changePercent]);
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
        change: Number(row.change_24h || 0),
        changePercent: Number(row.change_percent_24h || 0),
        high: Number(row.current_price) * 1.01,
        low: Number(row.current_price) * 0.99,
        volume: 0
      };
    });
    if (Object.keys(cachedPrices).length > 0) {
      console.log(`✅ Loaded ${Object.keys(cachedPrices).length} prices from database`);
    }
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
  if (Object.keys(cachedPrices).length === 0) {
    await loadPricesFromDB();
  }
  if (Object.keys(cachedPrices).length === 0) {
    console.log('⚠️ Using default fallback prices');
    Object.assign(cachedPrices, DEFAULT_PRICES);
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
