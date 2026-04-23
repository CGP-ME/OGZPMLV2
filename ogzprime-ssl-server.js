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
const PineTALib = require('./pine-transpiler/core/PineTALib');

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
    'news', 'latest', 'today', 'recent', 'current', 'now',
    'what is happening', 'what happened', 'why is', 'why did', 'why are',
    'earnings', 'announced', 'report', 'sec filing', 'guidance', 'beat', 'miss',
    'lawsuit', 'merger', 'acquisition', 'ipo', 'spinoff', 'buyback', 'dividend',
    'fed', 'fomc', 'powell', 'inflation', 'interest rate', 'cpi', 'jobs',
    'moving', 'rally', 'dropping', 'selling off', 'popping', 'tanking',
    'upgrade', 'downgrade', 'analyst', 'price target',
    'market', 'stock', 'shares', 'trading'
  ];
  return searchTriggers.some(trigger => lower.includes(trigger));
}

// CHANGE 2026-03-30: Fetch real market data from Polygon.io
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';

async function fetchMarketData(symbol) {
  if (!POLYGON_API_KEY) {
    console.warn('[Market Data] No POLYGON_API_KEY set');
    return null;
  }

  try {
    // Calculate date range for 60 days of candles (need 50+ for indicators)
    const toDate = new Date().toISOString().split('T')[0];
    const fromDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Fetch previous day data, current snapshot, and candles for indicators in parallel
    const [prevDayRes, snapshotRes, candlesRes] = await Promise.all([
      fetch(`https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?apiKey=${POLYGON_API_KEY}`),
      fetch(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`),
      fetch(`https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fromDate}/${toDate}?limit=60&apiKey=${POLYGON_API_KEY}`)
    ]);

    if (!prevDayRes.ok || !snapshotRes.ok) {
      console.warn(`[Market Data] Polygon returned error for ${symbol}`);
      return null;
    }

    const prevDay = await prevDayRes.json();
    const snapshot = await snapshotRes.json();
    const candlesData = await candlesRes.json();

    const prev = prevDay.results?.[0] || {};
    const ticker = snapshot.ticker || {};
    const day = ticker.day || {};
    const lastTrade = ticker.lastTrade || {};
    const prevDayData = ticker.prevDay || {};
    const candles = candlesData.results || [];

    // Use snapshot data (more current) with prevDay fallback
    const currentPrice = lastTrade.p || day.c || prev.c;
    const prevClose = prevDayData.c || prev.c;
    const change = currentPrice - prevClose;
    const changePct = prevClose ? ((change / prevClose) * 100).toFixed(2) : '0.00';

    // Volume
    const todayVolume = day.v || 0;
    const avgVolume = prevDayData.v || prev.v || todayVolume;
    const volumeRatio = avgVolume > 0 ? (todayVolume / avgVolume).toFixed(2) : '1.00';

    // Compute real indicators from candle data using PineTALib
    let rsi = null, ema9 = null, ema21 = null, atr = null;
    if (candles.length >= 21) {
      const closes = candles.map(c => c.c);
      const highs = candles.map(c => c.h);
      const lows = candles.map(c => c.l);

      rsi = PineTALib.rsi(closes, 14);
      ema9 = PineTALib.ema(closes, 9);
      ema21 = PineTALib.ema(closes, 21);
      atr = PineTALib.atr(highs, lows, closes, 14);

      console.log(`[Market Data] ${symbol} indicators: RSI=${rsi?.toFixed(1)}, EMA9=${ema9?.toFixed(2)}, EMA21=${ema21?.toFixed(2)}, ATR=${atr?.toFixed(2)}`);
    } else {
      console.warn(`[Market Data] Not enough candles for ${symbol} (${candles.length}), using fallback`);
      // Fallback: simple momentum indicator
      rsi = changePct > 2 ? 65 : changePct > 0 ? 55 : changePct > -2 ? 45 : 35;
    }

    return {
      symbol: symbol.toUpperCase(),
      price: currentPrice?.toFixed(2),
      change: change?.toFixed(2),
      changePct: changePct,
      prevClose: prevClose?.toFixed(2),
      open: (day.o || prev.o)?.toFixed(2),
      dayHigh: (day.h || prev.h)?.toFixed(2),
      dayLow: (day.l || prev.l)?.toFixed(2),
      volume: todayVolume,
      avgVolume: Math.round(avgVolume),
      volumeRatio: volumeRatio,
      vwap: day.vw?.toFixed(2) || 'N/A',
      rsi: rsi?.toFixed(1) || 'N/A',
      ema9: ema9?.toFixed(2) || 'N/A',
      ema21: ema21?.toFixed(2) || 'N/A',
      atr: atr?.toFixed(2) || 'N/A',
      resistance: (day.h || prev.h)?.toFixed(2),
      support: (day.l || prev.l)?.toFixed(2),
      marketState: ticker.market === 'extended_hours' ? 'EXTENDED' : 'REGULAR',
      fetchedAt: new Date().toISOString(),
      source: 'polygon.io'
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
**REAL MARKET DATA FOR ${marketData.symbol} (source: ${marketData.source}, fetched ${marketData.fetchedAt}):**
- Current Price: $${marketData.price} (${marketData.change >= 0 ? '+' : ''}${marketData.change}, ${marketData.changePct}%)
- Previous Close: $${marketData.prevClose}
- Open: $${marketData.open}
- Day Range: $${marketData.dayLow} - $${marketData.dayHigh}
- VWAP: $${marketData.vwap}
- Volume: ${marketData.volume?.toLocaleString()} (${marketData.volumeRatio}x avg volume)
- RSI(14): ${marketData.rsi}
- EMA(9): $${marketData.ema9}
- EMA(21): $${marketData.ema21}
- ATR(14): $${marketData.atr}
- Day Support: $${marketData.support}
- Day Resistance: $${marketData.resistance}
- Market State: ${marketData.marketState}

IMPORTANT: Use ONLY the data above. Do NOT invent or hallucinate any numbers, prices, or percentages.
`;
      }
    }

    // Auto-search for news/current events. CHANGE 2026-04-22: broadened — we
    // also fetch news any time a stock symbol is present OR the question is
    // about a company/market, so TRAI is actually aware of what's happening
    // instead of falling back to generic output.
    const shouldSearch = enableSearch !== false && TAVILY_API_KEY && (needsWebSearch(prompt) || symbol);
    if (shouldSearch) {
      console.log('[TRAI Analyze] Fetching news context via Tavily...');
      const newsQuery = symbol
        ? `${symbol} stock news today ${new Date().toISOString().slice(0, 10)}`
        : prompt;
      const searchResults = await tavilySearch(newsQuery, 4);
      if (searchResults && (searchResults.answer || searchResults.results?.length)) {
        searchUsed = true;
        dataContext += `\n**Recent news (last 24-48h):**\n`;
        if (searchResults.answer) {
          dataContext += `Summary: ${searchResults.answer}\n`;
        }
        searchResults.results.forEach((r, i) => {
          dataContext += `${i + 1}. ${r.title}: ${r.snippet}\n`;
        });
      }
    }

    // CHANGE 2026-04-22: Rewrote system prompt. Removed the canned
    // "I can't give trading advice, but here are the facts:" prefix that made
    // every answer feel like a fallback. Still enforces no-advice via rules
    // rather than a forced opener.
    const systemRules = `You are TRAI, an analyst inside the OGZ Prime trading system.

Answer the user's question directly and conversationally. Be specific. Reference the exact numbers and news provided below.

Rules you MUST follow (but do NOT narrate them):
- Never recommend buying, selling, entering, exiting, sizing, holding, or any action. No "this is a good setup", no "looks bullish for entry".
- If asked "should I..." — explain what the data shows and what traders commonly watch for in that condition, WITHOUT prescribing an action.
- Use ONLY the numbers and news provided. Never invent data. If something isn't provided, say so briefly.
- Do NOT open with a disclaimer. Do NOT say "I can't give trading advice". Just answer.
- Keep it tight: 2-4 short paragraphs unless the question clearly demands more.
`;

    let analysisPrompt;
    if (marketDataUsed && searchUsed) {
      analysisPrompt = `${systemRules}
Question: ${prompt}

Answer using the live market data and recent news above. Explain what's happening with this name today — price action, volume, any news catalyst — and what the indicators are showing. Be conversational, not a bulleted list.`;
    } else if (marketDataUsed) {
      analysisPrompt = `${systemRules}
Question: ${prompt}

Answer using only the live market data above. Reference actual price, RSI, volume, VWAP as relevant. Explain what the numbers mean right now.`;
    } else if (searchUsed) {
      analysisPrompt = `${systemRules}
Question: ${prompt}

Answer using the news/context above. Summarize what's actually happening. Be specific about names, events, numbers from the sources.`;
    } else {
      analysisPrompt = `${systemRules}
Question: ${prompt}

Give an educational, specific answer. If the question is about current events or a specific ticker and you don't have data, say "I don't have live data on that right now" — do not guess.`;
    }

    const fullPrompt = context
      ? `Market Context: ${JSON.stringify(context)}${dataContext}\n\n${analysisPrompt}`
      : `${dataContext}\n\n${analysisPrompt}`;

    const startTime = Date.now();
    // CHANGE 2026-04-22: raised default token budget so answers don't get
    // cut off mid-sentence when explaining market context + news.
    const response = await client.generateResponse(fullPrompt, maxTokens || 600);
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
      // CHANGE 2026-04-11: Stock tickers go to Alpaca, crypto goes to bot/Kraken
      if (ws.clientType === 'dashboard' && (data.type === 'timeframe_change' || data.type === 'request_historical')) {
        const asset = data.asset || '';
        let handled = false;

        // Check if this is a stock ticker — route to Alpaca
        if (data.type === 'request_historical') {
          try {
            const { isStock, fetchStockCandles } = require('./server/stock-data-adapter');
            if (isStock(asset)) {
              handled = true;
              const tf = data.timeframe || '15m';
              const limit = data.limit || 500;
              console.log(`📊 [StockAdapter] Fetching ${asset} @ ${tf} from Alpaca...`);
              fetchStockCandles(asset, tf, limit).then(candles => {
                if (candles && candles.length > 0 && ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'historical_candles',
                    timeframe: tf,
                    candles: candles
                  }));
                  console.log(`📊 [StockAdapter] Sent ${candles.length} ${asset} candles to dashboard`);
                } else {
                  console.warn(`📊 [StockAdapter] No data for ${asset} @ ${tf}`);
                }
              }).catch(err => {
                console.error(`📊 [StockAdapter] Error: ${err.message}`);
              });
            }
          } catch (err) {
            console.error('[StockAdapter] Module error:', err.message);
          }
        }

        // Crypto or timeframe_change — relay to bot as before
        if (!handled) {
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