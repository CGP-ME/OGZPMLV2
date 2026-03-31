/**
 * @fileoverview OGZ Prime Dashboard Server - Web Interface & API
 *
 * Serves the trading dashboard and provides API endpoints for
 * real-time data, TRAI chat, and system control.
 *
 * @description
 * ARCHITECTURE ROLE:
 * This server provides the web interface for monitoring and controlling
 * OGZ Prime. It runs separately from the trading bot (run-empire-v2.js)
 * and communicates via WebSocket.
 *
 * ENDPOINTS:
 * - GET /               → Dashboard HTML (unified-dashboard.html)
 * - POST /api/ollama/chat → Proxy to TRAI/Ollama for AI chat
 * - WS /                → Real-time trading data stream
 *
 * ARCHITECTURE:
 * ```
 * Browser (Dashboard)
 *        ↓ WebSocket
 * ogzprime-ssl-server.js (this file)
 *        ↓ HTTP proxy
 * Ollama (TRAI inference)
 *
 * run-empire-v2.js ──WebSocket──→ Dashboard (real-time updates)
 * ```
 *
 * SSL:
 * SSL termination is handled by nginx reverse proxy, not this server.
 * This server listens on HTTP (port 3010 by default).
 *
 * @module ogzprime-ssl-server
 * @requires express
 * @requires ws
 * @requires dotenv
 *
 * @example
 * // Start the dashboard server
 * node ogzprime-ssl-server.js
 *
 * // Or via PM2
 * pm2 start ogzprime-ssl-server.js --name ogz-dashboard
 */

require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');

const apiPort = process.env.API_PORT || 3010;
const app = express();
const httpServer = http.createServer(app);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CHANGE 2026-02-10: Trade Journal and Replay page routes
app.get('/journal', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'trade-journal.html'));
});
app.get('/replay', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'trade-replay.html'));
});
// CHANGE 2026-03-30: Market snapshot page (full-size chart + TRAI analysis)
app.get('/snapshot', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'snapshot.html'));
});

// CHANGE 2026-01-23: Ollama proxy for TRAI widget
app.post('/api/ollama/chat', async (req, res) => {
  try {
    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('[Ollama Proxy] Error:', error.message);
    res.status(500).json({ error: 'Failed to reach TRAI inference server' });
  }
});

// CHANGE 2026-03-30: TRAI analyze endpoint with Mercury-2 support
const PersistentLLMClient = require('./core/persistent_llm_client');
let traiClient = null;

async function getTraiClient() {
  if (!traiClient) {
    traiClient = new PersistentLLMClient();
    await traiClient.initialize();
  }
  return traiClient;
}

// CHANGE 2026-03-30: Tavily web search for TRAI (must be before analyze endpoint)
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';

async function tavilySearch(query, maxResults = 5) {
  if (!TAVILY_API_KEY) {
    return null;  // Silently skip if no API key
  }

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query,
        search_depth: 'basic',
        max_results: maxResults,
        include_answer: true,
        include_raw_content: false
      })
    });

    if (!response.ok) {
      throw new Error(`Tavily API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      answer: data.answer || null,
      results: (data.results || []).map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.content?.substring(0, 300)
      }))
    };
  } catch (error) {
    console.error('[TRAI Search] Error:', error.message);
    return null;
  }
}

// Detect if query needs web search (news, current events, etc.)
function needsWebSearch(prompt) {
  const lower = prompt.toLowerCase();
  const searchTriggers = [
    'news', 'latest', 'today', 'recent', 'current',
    'what is happening', 'what happened', 'why is',
    'earnings', 'announced', 'report', 'sec filing',
    'lawsuit', 'merger', 'acquisition', 'ipo',
    'fed', 'fomc', 'inflation', 'interest rate'
  ];
  return searchTriggers.some(trigger => lower.includes(trigger));
}

// CHANGE 2026-03-30: Fetch real market data (Yahoo Finance - no API key needed)
async function fetchMarketData(symbol) {
  try {
    // Yahoo Finance quote endpoint (free, no key)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (!response.ok) {
      console.warn(`[Market Data] Yahoo Finance returned ${response.status} for ${symbol}`);
      return null;
    }

    const data = await response.json();
    const result = data.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta || {};
    const quote = result.indicators?.quote?.[0] || {};
    const closes = quote.close || [];
    const volumes = quote.volume || [];
    const highs = quote.high || [];
    const lows = quote.low || [];

    // Get latest values
    const currentPrice = meta.regularMarketPrice || closes[closes.length - 1];
    const prevClose = meta.chartPreviousClose || closes[closes.length - 2];
    const change = currentPrice - prevClose;
    const changePct = ((change / prevClose) * 100).toFixed(2);

    // Calculate simple indicators
    const avgVolume = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const latestVolume = volumes[volumes.length - 1] || 0;
    const volumeRatio = (latestVolume / avgVolume).toFixed(2);

    // Simple RSI approximation (14-period would need more data)
    const recentCloses = closes.slice(-5);
    let gains = 0, losses = 0;
    for (let i = 1; i < recentCloses.length; i++) {
      const diff = recentCloses[i] - recentCloses[i - 1];
      if (diff > 0) gains += diff;
      else losses += Math.abs(diff);
    }
    const rs = losses === 0 ? 100 : gains / losses;
    const rsi = Math.round(100 - (100 / (1 + rs)));

    // Support/resistance from recent highs/lows
    const recentHigh = Math.max(...highs.slice(-5).filter(Boolean));
    const recentLow = Math.min(...lows.slice(-5).filter(Boolean));

    return {
      symbol: meta.symbol || symbol.toUpperCase(),
      price: currentPrice?.toFixed(2),
      change: change?.toFixed(2),
      changePct: changePct,
      prevClose: prevClose?.toFixed(2),
      dayHigh: meta.regularMarketDayHigh?.toFixed(2) || recentHigh?.toFixed(2),
      dayLow: meta.regularMarketDayLow?.toFixed(2) || recentLow?.toFixed(2),
      volume: latestVolume,
      avgVolume: Math.round(avgVolume),
      volumeRatio: volumeRatio,
      rsi: rsi,
      resistance: recentHigh?.toFixed(2),
      support: recentLow?.toFixed(2),
      marketState: meta.marketState || 'UNKNOWN',
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[Market Data] Error fetching:', error.message);
    return null;
  }
}

// Extract stock symbols from prompt
function extractSymbol(prompt) {
  // Known stock tickers to look for first (high priority)
  const knownTickers = ['AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'NVDA', 'TSLA', 'AMD', 'INTC', 'NFLX', 'DIS', 'PYPL', 'COIN', 'SQ', 'SHOP', 'ROKU', 'PLTR', 'SNOW', 'CRM', 'ORCL', 'IBM', 'CSCO', 'QCOM', 'AVGO', 'TXN', 'MU', 'AMAT', 'LRCX', 'KLAC', 'ASML', 'TSM', 'BABA', 'JD', 'PDD', 'NIO', 'XPEV', 'LI', 'RIVN', 'LCID', 'F', 'GM', 'TM', 'BA', 'LMT', 'RTX', 'GE', 'CAT', 'DE', 'UNH', 'JNJ', 'PFE', 'MRK', 'ABBV', 'LLY', 'BMY', 'AMGN', 'GILD', 'BIIB', 'MRNA', 'BNTX', 'JPM', 'BAC', 'WFC', 'C', 'GS', 'MS', 'BLK', 'SCHW', 'V', 'MA', 'AXP', 'WMT', 'TGT', 'COST', 'HD', 'LOW', 'NKE', 'SBUX', 'MCD', 'CMG', 'DPZ', 'YUM', 'KO', 'PEP', 'MNST', 'BTC', 'ETH', 'SOL', 'SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO'];

  const upperPrompt = prompt.toUpperCase();

  // Check for known tickers first
  for (const ticker of knownTickers) {
    if (upperPrompt.includes(ticker)) {
      return ticker;
    }
  }

  // Fallback: Look for uppercase words that look like tickers
  const match = upperPrompt.match(/\b([A-Z]{2,5})\b/g);
  if (!match) return null;

  // Filter out ALL common English words
  const stopWords = new Set([
    // 2-letter
    'IF', 'IS', 'IT', 'IN', 'ON', 'AT', 'TO', 'BY', 'OF', 'OR', 'AS', 'AN', 'SO', 'DO', 'GO', 'NO', 'UP', 'WE', 'BE', 'HE', 'ME', 'MY', 'US',
    // 3-letter
    'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HAD', 'HER', 'WAS', 'ONE', 'OUR', 'OUT', 'HAS', 'HIS', 'HOW', 'ITS', 'LET', 'MAY', 'OLD', 'SEE', 'TWO', 'WAY', 'WHO', 'DID', 'GET', 'SAY', 'SHE', 'TOO', 'USE', 'HIM', 'NOW', 'NEW', 'ANY', 'DAY', 'GOT', 'WHY', 'OWN', 'SAW', 'PUT', 'YET', 'ASK', 'TRY', 'RUN', 'BIG', 'FEW', 'END', 'BAD', 'OFF', 'TOP', 'SET', 'KEY',
    // 4-letter
    'JUST', 'KNOW', 'TAKE', 'COME', 'MAKE', 'LIKE', 'BACK', 'ONLY', 'OVER', 'SUCH', 'YEAR', 'INTO', 'MOST', 'ALSO', 'MADE', 'WELL', 'BEEN', 'MANY', 'SOME', 'TIME', 'VERY', 'WHEN', 'WILL', 'MORE', 'WANT', 'WHAT', 'WITH', 'YOUR', 'THAT', 'THIS', 'FROM', 'THEY', 'HAVE', 'SAID', 'EACH', 'THAN', 'THEM', 'THEN', 'BEEN', 'CALL', 'FIND', 'GIVE', 'GOOD', 'HELP', 'HERE', 'KEEP', 'LAST', 'LONG', 'LOOK', 'MUCH', 'NEED', 'NEXT', 'PART', 'SAME', 'TELL', 'TURN', 'WORK', 'HIGH', 'REAL', 'SHOW', 'EVEN', 'DOES', 'GOES',
    // 5-letter
    'WOULD', 'THEIR', 'COULD', 'OTHER', 'ABOUT', 'WHICH', 'THESE', 'AFTER', 'THERE', 'FIRST', 'BEING', 'WHERE', 'THOSE', 'STILL', 'EVERY', 'GOING', 'NEVER', 'THINK', 'AGAIN', 'MIGHT', 'UNDER', 'THING', 'SINCE', 'RIGHT', 'POINT', 'WORLD', 'PLACE', 'WHILE', 'GREAT', 'SMALL', 'THREE', 'FOUND', 'BEING', 'NIGHT', 'DOING', 'TODAY', 'PRICE', 'TRADE', 'STOCK', 'SHARE', 'SHORT',
    // Trading terms that aren't tickers
    'RSI', 'EMA', 'ATR', 'SMA', 'MACD', 'VOL', 'BUY', 'SELL', 'USD', 'ETF', 'IPO', 'CEO', 'CFO', 'SEC', 'FDA', 'GDP', 'CPI', 'FED', 'API', 'STOP', 'LIMIT', 'ALERT'
  ]);

  // Find the first non-stopword symbol (prefer 3-4 letter words as more likely tickers)
  const candidates = match.filter(w => !stopWords.has(w));
  // Prefer 3-4 letter symbols
  const preferred = candidates.find(w => w.length >= 3 && w.length <= 4);
  return preferred || candidates[0] || null;
}

app.post('/api/trai/analyze', async (req, res) => {
  try {
    const { prompt, context, maxTokens, enableSearch } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const client = await getTraiClient();
    let dataContext = '';
    let searchUsed = false;
    let marketDataUsed = false;

    // CHANGE 2026-03-30: Fetch REAL market data for stock symbols
    const symbol = extractSymbol(prompt.toUpperCase());
    if (symbol) {
      console.log(`[TRAI Analyze] Fetching real market data for: ${symbol}`);
      const marketData = await fetchMarketData(symbol);
      if (marketData) {
        marketDataUsed = true;
        dataContext = `
**REAL MARKET DATA FOR ${marketData.symbol} (fetched ${marketData.fetchedAt}):**
- Current Price: $${marketData.price} (${marketData.change >= 0 ? '+' : ''}${marketData.change}, ${marketData.changePct}%)
- Previous Close: $${marketData.prevClose}
- Day Range: $${marketData.dayLow} - $${marketData.dayHigh}
- Volume: ${marketData.volume?.toLocaleString()} (${marketData.volumeRatio}x avg)
- RSI (5-period approx): ${marketData.rsi}
- Recent Support: $${marketData.support}
- Recent Resistance: $${marketData.resistance}
- Market State: ${marketData.marketState}

IMPORTANT: Use ONLY the data above. Do NOT invent or hallucinate any numbers, prices, or percentages.
`;
      }
    }

    // Auto-search for news/current events if enabled or detected
    if (enableSearch !== false && TAVILY_API_KEY && needsWebSearch(prompt)) {
      console.log('[TRAI Analyze] Query needs web search, fetching...');
      const searchResults = await tavilySearch(prompt, 3);
      if (searchResults) {
        searchUsed = true;
        dataContext += `\n**Recent News:**\n`;
        if (searchResults.answer) {
          dataContext += `Summary: ${searchResults.answer}\n`;
        }
        searchResults.results.forEach((r, i) => {
          dataContext += `${i + 1}. ${r.title}: ${r.snippet}\n`;
        });
      }
    }

    // CRITICAL: Enforce NO TRADING ADVICE - liability protection
    const noAdvicePrefix = `CRITICAL RULES - YOU MUST FOLLOW THESE:
1. NEVER say "buy", "sell", "enter", "exit", or any trading recommendation
2. NEVER say "this is a good setup" or "this looks bullish/bearish for entry"
3. ONLY present FACTS from the data provided
4. Start every response with: "I can't give trading advice, but here are the facts:"
5. Use ONLY the numbers provided - do NOT invent any data points

`;

    let analysisPrompt;
    if (prompt.toLowerCase().includes('should i')) {
      analysisPrompt = `${noAdvicePrefix}
The user asked: "${prompt}"

Respond with ONLY factual data analysis. Do NOT tell them what to do.
Present the data, explain what it means technically, but explicitly state you cannot recommend any action.`;
    } else if (marketDataUsed) {
      analysisPrompt = `${noAdvicePrefix}
Question: ${prompt}

Analyze using ONLY the real market data provided above. Reference the actual prices, RSI, and volume.
Do NOT make up any numbers. If data isn't provided, say "data not available".
Do NOT suggest any trading action.`;
    } else {
      analysisPrompt = `${noAdvicePrefix}
Question: ${prompt}

Provide educational information only. Do NOT suggest any trading action.`;
    }

    const fullPrompt = context
      ? `Market Context: ${JSON.stringify(context)}${dataContext}\n\nQuestion: ${analysisPrompt}`
      : `${dataContext}\n\nQuestion: ${analysisPrompt}`;

    const startTime = Date.now();
    const response = await client.generateResponse(fullPrompt, maxTokens || 200);
    const latency = Date.now() - startTime;

    res.json({
      response,
      provider: client.providerName,
      model: client.model,
      latency,
      searchUsed,
      marketDataUsed,
      symbol: symbol || null,
      status: client.getStatus()
    });
  } catch (error) {
    console.error('[TRAI Analyze] Error:', error.message);
    res.status(500).json({ error: 'TRAI analysis failed', details: error.message });
  }
});

app.get('/api/trai/status', async (req, res) => {
  try {
    const client = await getTraiClient();
    const status = client.getStatus();
    status.searchEnabled = !!TAVILY_API_KEY;
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/trai/search', async (req, res) => {
  try {
    const { query, maxResults } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    if (!TAVILY_API_KEY) {
      return res.status(503).json({
        error: 'Web search not configured',
        hint: 'Set TAVILY_API_KEY in .env (free at tavily.com)'
      });
    }

    const results = await tavilySearch(query, maxResults || 5);
    res.json(results || { answer: null, results: [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CHANGE 2026-03-06: Restore /api/health endpoint for proof page
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    websockets: {
      connections: wss.clients.size
    },
    timestamp: Date.now()
  });
});

// HTTPS server removed - nginx handles SSL termination
// All connections come through nginx proxy on port 3010

// Single WebSocket server on unified port
const wss = new WebSocket.Server({ 
  server: httpServer,
  path: '/ws'  // Optional: use path-based routing
});

wss.on('connection', (ws, req) => {
  // Simple connection tracking - NO OVERCOMPLICATED BROADCASTER
  const connectionId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  ws.connectionId = connectionId;
  ws.isAlive = true;
  ws.authenticated = false; // 🔒 SECURITY: Require authentication

  console.log(`✅ New WebSocket connection: ${connectionId}`);

  // 🔒 SECURITY: 10-second authentication timeout
  const authTimeout = setTimeout(() => {
    if (!ws.authenticated) {
      console.log(`❌ Client ${connectionId} failed to authenticate - disconnecting`);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Authentication timeout - connection closed'
      }));
      ws.close(1008, 'Authentication timeout');
    }
  }, 10000);

  // Handle incoming messages
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());

      // 🔒 SECURITY: First message MUST be authentication
      if (!ws.authenticated && data.type !== 'auth') {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Authentication required'
        }));
        ws.close(1008, 'Authentication required');
        return;
      }

      // 🔒 SECURITY: Handle authentication
      if (data.type === 'auth') {
        const validToken = process.env.WEBSOCKET_AUTH_TOKEN || 'CHANGE_ME_IN_PRODUCTION';

        if (data.token === validToken) {
          ws.authenticated = true;
          clearTimeout(authTimeout);
          console.log(`🔓 Client ${connectionId} authenticated successfully`);
          ws.send(JSON.stringify({
            type: 'auth_success',
            connectionId: connectionId,
            message: 'Authentication successful'
          }));
        } else {
          console.log(`❌ Client ${connectionId} failed authentication - invalid token`);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid authentication token'
          }));
          ws.close(1008, 'Invalid token');
        }
        return;
      }

      // CRITICAL: Handle ping/pong for connection health
      if (data.type === 'ping') {
        ws.send(JSON.stringify({
          type: 'pong',
          id: data.id,
          timestamp: data.timestamp || Date.now()
        }));
        return;
      }

      if (data.type === 'pong') {
        ws.isAlive = true;
        return;
      }

      // Handle bot 
            if (data.type === 'identify' && data.source === 'trading_bot') {
        console.log('🤖 TRADING BOT IDENTIFIED!');
        ws.clientType = 'bot';

        ws.send(JSON.stringify({
          type: 'identification_confirmed',
          connectionId: connectionId,
          message: 'Bot registered successfully'
        }));
      }

      // Handle dashboard identification
      if (data.type === 'identify' && data.source === 'dashboard') {
        console.log('📊 DASHBOARD IDENTIFIED!');
        ws.clientType = 'dashboard';
      }

      // 🚀 RELAY: Dashboard → Bot (for TRAI queries)
      if (ws.clientType === 'dashboard' && data.type === 'trai_query') {
        const messageStr = JSON.stringify(data);

        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN &&
              client.authenticated &&
              client.clientType === 'bot') {
            try {
              client.send(messageStr);
              console.log('🧠 [TRAI] Relayed query to bot');
            } catch (err) {
              console.error('Error relaying TRAI query to bot:', err.message);
            }
          }
        });
      }

      // CHANGE 2026-01-29: RELAY Dashboard → Bot (for timeframe changes)
      if (ws.clientType === 'dashboard' && (data.type === 'timeframe_change' || data.type === 'request_historical')) {
        const messageStr = JSON.stringify(data);

        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN &&
              client.authenticated &&
              client.clientType === 'bot') {
            try {
              client.send(messageStr);
              console.log(`📊 Relayed ${data.type} (${data.timeframe}) to bot`);
            } catch (err) {
              console.error('Error relaying timeframe message to bot:', err.message);
            }
          }
        });
      }

      // CHANGE 2026-02-10: RELAY Dashboard → Bot (for journal/replay/asset requests)
      if (ws.clientType === 'dashboard' && (
          data.type === 'asset_change' ||
          data.type.startsWith('request_journal') ||
          data.type.startsWith('request_replay'))) {
        const messageStr = JSON.stringify(data);

        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN &&
              client.authenticated &&
              client.clientType === 'bot') {
            try {
              client.send(messageStr);
              console.log(`📒 Relayed ${data.type} to bot`);
            } catch (err) {
              console.error('Error relaying journal/replay message to bot:', err.message);
            }
          }
        });
      }

      // 🚀 RELAY: Bot messages → Dashboard clients
      if (ws.clientType === 'bot' && data.type !== 'identify') {
        const messageStr = JSON.stringify(data);

        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN &&
              client.authenticated &&
              client.clientType === 'dashboard') {
            try {
              client.send(messageStr);
            } catch (err) {
              console.error('Error relaying to dashboard:', err.message);
            }
          }
        });

        // Log relay activity
        if (data.type === 'price') {
          console.log(`📡 Relayed price to dashboards: $${data.data?.price?.toFixed(2) || 'N/A'}`);
        }
      }

    } catch (err) {
      console.error(`Error parsing message from ${connectionId}:`, err.message);
    }
  });
  
  // Handle disconnection
  ws.on('close', () => {
    console.log(`❌ Client disconnected: ${connectionId}`);
  });
  
  ws.on('error', (err) => {
    console.error(`WebSocket error for ${connectionId}:`, err.message);
  });
});

// Market data variables
let lastKnownPrice = null;
let tickCount = 0;
let assetPrices = {};
let currentAsset = 'BTC-USD';

// � Kraken WebSocket connection (PUBLIC - no API key needed for market data!)
const KRAKEN_PUBLIC_WS = 'wss://ws.kraken.com';

console.log('🔧 [EMPIRE V2] Kraken direct connection DISABLED - Bot provides all market data');
console.log('📡 WebSocket server acting as relay only - no direct Kraken connection');

// TEMPORARILY DISABLED to fix data conflicts - bot sends all data
// const krakenSocket = new WebSocket(KRAKEN_PUBLIC_WS);
const krakenSocket = {
  on: () => {},
  send: () => {},
  readyState: 0,
  close: () => {}
};

krakenSocket.on('open', () => {
  console.log('� Connected to Kraken public WebSocket feed');
  
  // Subscribe to multiple crypto pairs on Kraken
  const pairs = [
    'XBT/USD',  // Bitcoin (Kraken uses XBT)
    'ETH/USD',  // Ethereum
    'SOL/USD',  // Solana
    'ADA/USD',  // Cardano
    'DOGE/USD', // Dogecoin
    'XRP/USD',  // Ripple
    'LTC/USD',  // Litecoin
    'MATIC/USD',// Polygon/Matic
    'AVAX/USD', // Avalanche
    'LINK/USD', // Chainlink
    'DOT/USD',  // Polkadot
    'ATOM/USD', // Cosmos
    'UNI/USD',  // Uniswap
    'AAVE/USD', // Aave
    'ALGO/USD', // Algorand
  ];
  
  // Kraken subscription format
  krakenSocket.send(JSON.stringify({
    event: 'subscribe',
    pair: pairs,
    subscription: {
      name: 'ticker'
    }
  }));
  
  console.log(`📡 Subscribed to ${pairs.length} trading pairs on Kraken`);
});

krakenSocket.on('message', (data) => {
  try {
    const msg = JSON.parse(data);
    
    // Kraken sends different message types
    // Array messages are ticker updates: [channelID, tickerData, channelName, pair]
    if (Array.isArray(msg) && msg.length >= 4 && msg[2] === 'ticker') {
      tickCount++;
      
      const tickerData = msg[1];
      const pair = msg[3];
      
      // Extract price from Kraken ticker data
      // tickerData.c = [price, lot volume]
      const price = parseFloat(tickerData.c[0]);
      
      // Convert Kraken pair format to our format
      // XBT/USD -> BTC-USD, ETH/USD -> ETH-USD, etc.
      let asset = pair.replace('XBT/', 'BTC-').replace('/', '-');
      
      // Store price
      assetPrices[asset] = price;
      if (asset === currentAsset || asset === 'BTC-USD') {
        lastKnownPrice = price;
      }

      // Log periodically
      if (tickCount % 10 === 0 || tickCount <= 5) {
        console.log(`🎯 KRAKEN TICK #${tickCount}: ${asset} $${price.toFixed(2)} @ ${new Date().toLocaleTimeString()}`);
      }

      // 🚀 SIMPLE DIRECT BROADCAST - NO OVERCOMPLICATED BROADCASTER
      const priceMessage = {
        type: 'price',
        data: {
          asset: asset,
          price: price,
          timestamp: Date.now(),
          source: 'kraken',
          allPrices: assetPrices,
          tickCount: tickCount,
          volume: parseFloat(tickerData.v[0]) || 0
        }
      };
      
      // Broadcast ONLY to authenticated WebSocket clients
      const messageStr = JSON.stringify(priceMessage);
      let sentCount = 0;

      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && client.authenticated) {
          try {
            client.send(messageStr);
            sentCount++;
          } catch (err) {
            console.error('Error sending to authenticated client:', err.message);
          }
        }
      });
      
      // Log broadcast results periodically
      if (sentCount > 0 && tickCount % 20 === 0) {
        console.log(`📡 Kraken price broadcast: ${asset} $${price.toFixed(2)} → ${sentCount} clients`);
      }
    }
    
    // Handle subscription status messages
    if (msg.event === 'subscriptionStatus') {
      console.log(`📊 Kraken subscription: ${msg.status} - ${msg.pair || 'multiple pairs'}`);
    }
    
    // Handle system status
    if (msg.event === 'systemStatus') {
      console.log(`🐙 Kraken system status: ${msg.status}`);
    }
    
  } catch (err) {
    // Ignore heartbeat messages and other non-JSON data
    if (!data.toString().includes('heartbeat')) {
      console.error('❌ Failed to process Kraken data:', err.message);
    }
  }
});

krakenSocket.on('close', () => {
  console.warn('⚠️ Kraken WebSocket disconnected - attempting reconnect...');
  
  // Broadcast disconnection to all clients
  const disconnectMessage = JSON.stringify({
    type: 'data_feed_status',
    status: 'disconnected',
    message: 'Kraken data feed disconnected',
    timestamp: Date.now()
  });
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.authenticated) {
      try {
        client.send(disconnectMessage);
      } catch (err) {
        console.error('Error broadcasting disconnect:', err.message);
      }
    }
  });
  
  // Auto-reconnect after 5 seconds
  setTimeout(() => {
    console.log('🔄 Reconnecting to Kraken...');
    // In production, you'd reinitialize the connection here
  }, 5000);
});

krakenSocket.on('error', (err) => {
  console.error('🚨 Kraken WebSocket error:', err.message);
});

// 📊 Enhanced status monitoring
setInterval(() => {
  const connectedClients = Array.from(wss.clients).filter(c => c.readyState === WebSocket.OPEN);
  const botClients = connectedClients.filter(c => c.clientType === 'bot');
  
  console.log(`📊 SYSTEM STATUS:`);
  console.log(`   � Kraken: ${krakenSocket.readyState === WebSocket.OPEN ? 'Connected ✅' : 'Disconnected ❌'}`);
  console.log(`   📊 Ticks: ${tickCount}`);
  console.log(`   💰 Last Price: $${lastKnownPrice ? lastKnownPrice.toFixed(2) : 'N/A'}`);
  console.log(`   👥 Total Connections: ${connectedClients.length}`);
  console.log(`   🤖 Bot Connections: ${botClients.length}`);
  console.log(`   📡 Assets tracked: ${Object.keys(assetPrices).length}`);
  
  // Alert if no bot connections
  if (botClients.length === 0) {
    console.warn('⚠️ WARNING: No trading bot connections detected!');
  }
  
}, 30000);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down SSL server...');

  // Close all WebSocket connections
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.close();
    }
  });

  if (krakenSocket.readyState === WebSocket.OPEN) {
    krakenSocket.close();
  }

  httpServer.close(() => {
    console.log('✅ Server shutdown complete');
    process.exit(0);
  });
});

// CRITICAL FIX: Actually start listening on the port!
const wsPort = process.env.WS_PORT || 3010;
httpServer.listen(wsPort, '0.0.0.0', () => {
  console.log(`🚀 WebSocket server ACTUALLY LISTENING on port ${wsPort}`);
  console.log(`📡 Dashboard can now connect to ws://localhost:${wsPort}/ws`);
});

// Network interfaces display
const os = require('os');
const networkInterfaces = os.networkInterfaces();
const localIPs = [];

Object.keys(networkInterfaces).forEach(interfaceName => {
  networkInterfaces[interfaceName].forEach(interface => {
    if (interface.family === 'IPv4' && !interface.internal) {
      localIPs.push(interface.address);
    }
  });
});