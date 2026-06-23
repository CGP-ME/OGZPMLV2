#!/usr/bin/env node

/**
 * claudito-logger.js
 * Real-time console logging for Claudito system + Trading proof
 *
 * Per ogz-meta specs:
 * - 04_guardrails-and-rules.md: "All decisions must be logged"
 * - 04_guardrails-and-rules.md: "All errors must be logged"
 * - 04_guardrails-and-rules.md: "No silent exits EVER"
 * - telemetry.md: Track patterns, bugs, time metrics
 * - scribe.md: Document everything in real-time
 */

const fs = require('fs');
const path = require('path');

// Log file paths
const LOGS_DIR = path.join(__dirname, 'logs');
const CLAUDITO_LOG = path.join(LOGS_DIR, 'claudito-activity.jsonl');
const TRADING_PROOF_LOG = path.join(LOGS_DIR, 'trading-proof.jsonl');

// Live proof output for website (public folder)
const PUBLIC_PROOF_DIR = path.join(__dirname, '..', 'public', 'proof');
const LIVE_TRADES_FILE = path.join(PUBLIC_PROOF_DIR, 'live-trades.json');

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

/**
 * Format timestamp for console output
 */
function timestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * CLAUDITO LOGGER
 * Real-time console + file logging for Claudito system
 */
const ClauditoLogger = {
  /**
   * Log hook emission (per CLAUDITO-DOSSIERS.md hook system)
   */
  hook(command, state, details = {}) {
    const entry = {
      type: 'HOOK',
      timestamp: new Date().toISOString(),
      command,
      state,
      ...details
    };

    // Console output
    console.log(`[${timestamp()}] 🔗 HOOK: ${command} → state: ${state}`);
    if (details.result) console.log(`   └─ Result: ${details.result}`);
    if (details.next) console.log(`   └─ Next: ${details.next}`);

    // File output
    fs.appendFileSync(CLAUDITO_LOG, JSON.stringify(entry) + '\n');
  },

  /**
   * Log Claudito decision (per guardrails: "All decisions must be logged")
   */
  decision(claudito, action, reason, confidence = null) {
    const entry = {
      type: 'DECISION',
      timestamp: new Date().toISOString(),
      claudito,
      action,
      reason,
      confidence
    };

    // Console output
    const confStr = confidence !== null ? ` (${confidence}% conf)` : '';
    console.log(`[${timestamp()}] 🤖 ${claudito.toUpperCase()}: ${action}${confStr}`);
    console.log(`   └─ Reason: ${reason}`);

    // File output
    fs.appendFileSync(CLAUDITO_LOG, JSON.stringify(entry) + '\n');
  },

  /**
   * Log error (per guardrails: "All errors must be logged")
   */
  error(claudito, error, context = {}) {
    const entry = {
      type: 'ERROR',
      timestamp: new Date().toISOString(),
      claudito,
      error: error.message || error,
      stack: error.stack,
      context
    };

    // Console output (always visible)
    console.error(`[${timestamp()}] ❌ ERROR in ${claudito}: ${error.message || error}`);
    if (context.file) console.error(`   └─ File: ${context.file}`);

    // File output
    fs.appendFileSync(CLAUDITO_LOG, JSON.stringify(entry) + '\n');
  },

  /**
   * Log telemetry metrics (per telemetry.md)
   */
  metrics(data) {
    const entry = {
      type: 'METRICS',
      timestamp: new Date().toISOString(),
      ...data
    };

    // Console output
    console.log(`[${timestamp()}] 📊 METRICS:`);
    if (data.patterns_detected !== undefined) console.log(`   └─ Patterns: ${data.patterns_detected} detected, ${data.patterns_saved || 0} saved`);
    if (data.bugs_fixed !== undefined) console.log(`   └─ Bugs: ${data.bugs_fixed} fixed`);
    if (data.duration_ms !== undefined) console.log(`   └─ Duration: ${data.duration_ms}ms`);

    // File output
    fs.appendFileSync(CLAUDITO_LOG, JSON.stringify(entry) + '\n');
  },

  /**
   * Log mission status (per scribe.md format)
   */
  mission(missionId, status, details = {}) {
    const entry = {
      type: 'MISSION',
      timestamp: new Date().toISOString(),
      missionId,
      status,
      ...details
    };

    // Console output
    const statusEmoji = {
      'started': '🚀',
      'in_progress': '🔄',
      'blocked': '🛑',
      'complete': '✅',
      'failed': '❌'
    };
    console.log(`[${timestamp()}] ${statusEmoji[status] || '📋'} MISSION ${missionId}: ${status.toUpperCase()}`);
    if (details.clauditos) console.log(`   └─ Clauditos: ${details.clauditos.join(' → ')}`);
    if (details.fixes) console.log(`   └─ Fixes: ${details.fixes} applied`);

    // File output
    fs.appendFileSync(CLAUDITO_LOG, JSON.stringify(entry) + '\n');
  }
};

/**
 * CC-SPEC-EVAL-CAPTURE (3/3): build the `side` enum label for the website row.
 * Maps the bot's exit-reason taxonomy to fixed strings the frontend can filter on.
 */
function _buildSideLabel(action, isPartialClose, exitReason) {
  if (action === 'BUY') return 'BUY';
  if (action === 'SELL_SHORT') return 'SHORT';
  const prefix = (action === 'COVER') ? 'COVER' : 'SELL';
  const reason = (typeof exitReason === 'string' ? exitReason : '').toLowerCase();
  if (!isPartialClose) {
    if (reason.includes('stop_loss') || reason.includes('stoploss')) return `${prefix}_STOP_LOSS`;
    if (reason.includes('take_profit') && !reason.includes('tier')) return `${prefix}_TAKE_PROFIT`;
    if (reason.includes('trailing')) return `${prefix}_TRAILING_STOP`;
    if (reason.includes('max_hold')) return `${prefix}_MAX_HOLD`;
    if (reason.includes('signal') || reason === '') return `${prefix}_SIGNAL`;
    return `${prefix}_FULL`;
  }
  if (reason.includes('break_even')) return `${prefix}_BREAKEVEN_SCALE`;
  if (reason.includes('tier_1') || reason.includes('tier1')) return `${prefix}_PARTIAL_TIER_1`;
  if (reason.includes('tier_2') || reason.includes('tier2')) return `${prefix}_PARTIAL_TIER_2`;
  if (reason.includes('tier_3') || reason.includes('tier3')) return `${prefix}_PARTIAL_TIER_3`;
  if (reason.includes('trailing')) return `${prefix}_TRAILING_STOP`;
  return `${prefix}_PARTIAL_OTHER`;
}

/**
 * TRADING PROOF LOGGER
 * Records every trade for website proof of profitability
 * Per transparency rules: "All signals must be understandable"
 */
// CC-SPEC-EVAL-CAPTURE (3/3): in-memory ring buffer + debounce state for publishTrackRecord
const _trackRecordBuffer = [];
const _TRACK_RECORD_BUFFER_LIMIT = 500;
let _trackRecordWriteTimer = null;
const _TRACK_RECORD_DEBOUNCE_MS = 5000;
const PUBLIC_TRACK_RECORD_DATA_DIR = path.join(__dirname, '..', 'public', 'proof', 'track-record', 'data');
const PUBLIC_TRACK_RECORD_ACCOUNTS_DIR = path.join(PUBLIC_TRACK_RECORD_DATA_DIR, 'accounts');
const PUBLIC_PROOF_FILE_MODE = 0o644;
const { writeJsonAtomic } = require('../core/AtomicWrite');

function _readTradingProofLogEntries() {
  if (!fs.existsSync(TRADING_PROOF_LOG)) return [];
  const raw = fs.readFileSync(TRADING_PROOF_LOG, 'utf8').trim();
  if (!raw) return [];

  return raw.split('\n').map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (err) {
      throw new Error(`Malformed trading proof log JSON at ${TRADING_PROOF_LOG}:${index + 1}: ${err.message}`);
    }
  });
}

function _trackRecordEntryKey(entry) {
  return [
    entry.type,
    entry.timestamp,
    entry.action,
    entry.symbol,
    entry.tradeId,
    entry.orderId,
    entry.price,
    entry.pnl,
    entry.exitReason,
    entry.isPartialClose
  ].map(value => value === undefined ? '' : String(value)).join('|');
}

function _readTrackRecordSourceEntries() {
  const seen = new Set();
  const entries = [];

  for (const entry of [..._readTradingProofLogEntries(), ..._trackRecordBuffer]) {
    if (!entry || typeof entry !== 'object') continue;
    const key = _trackRecordEntryKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }

  return entries;
}

function _readRequiredString(env, key) {
  const value = env[key];
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(`Track record proof requires ${key}`);
  }
  return String(value).trim();
}

function _readPositiveNumber(env, key) {
  const raw = _readRequiredString(env, key);
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Track record proof requires positive numeric ${key}, got ${raw}`);
  }
  return value;
}

function _readPositiveInteger(env, key) {
  const raw = _readRequiredString(env, key);
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Track record proof requires positive integer ${key}, got ${raw}`);
  }
  return value;
}

function _readRequiredIsoTimestamp(env, key) {
  const raw = _readRequiredString(env, key);
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) {
    throw new Error(`Track record proof requires ISO timestamp ${key}, got ${raw}`);
  }
  return raw;
}

function _readFirstPositiveNumber(env, keys) {
  for (const key of keys) {
    const raw = env[key];
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Track record proof requires positive numeric ${key}, got ${raw}`);
    }
    return value;
  }
  throw new Error(`Track record proof requires one of ${keys.join(', ')}`);
}

function _resolveTrackRecordMaxDrawdown(env, startingBalance) {
  const explicit = env.OGZ_MAX_DRAWDOWN ?? env.TTP_MAX_LOSS_DOLLARS;
  if (explicit !== undefined && explicit !== null && String(explicit).trim() !== '') {
    const value = Number(explicit);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Track record proof requires positive numeric max drawdown, got ${explicit}`);
    }
    return value;
  }

  const thresholdRaw = env.TTP_MAX_LOSS_THRESHOLD_EQUITY;
  if (thresholdRaw === undefined || thresholdRaw === null || String(thresholdRaw).trim() === '') {
    throw new Error('Track record proof requires OGZ_MAX_DRAWDOWN, TTP_MAX_LOSS_DOLLARS, or TTP_MAX_LOSS_THRESHOLD_EQUITY');
  }

  const threshold = Number(thresholdRaw);
  if (!Number.isFinite(threshold) || threshold <= 0) {
    throw new Error(`Track record proof requires positive numeric TTP_MAX_LOSS_THRESHOLD_EQUITY, got ${thresholdRaw}`);
  }

  const derived = startingBalance - threshold;
  if (!Number.isFinite(derived) || derived <= 0) {
    throw new Error(`Track record proof cannot derive positive max drawdown from STARTING_BALANCE=${startingBalance} and TTP_MAX_LOSS_THRESHOLD_EQUITY=${threshold}`);
  }
  return derived;
}

function _resolveTrackRecordAccountConfig(env = process.env) {
  const startingBalance = _readPositiveNumber(env, 'STARTING_BALANCE');
  return {
    accountId: _readRequiredString(env, 'OGZ_ACCOUNT_ID'),
    accountLabel: _readRequiredString(env, 'OGZ_ACCOUNT_LABEL'),
    accountStage: _readRequiredString(env, 'OGZ_ACCOUNT_STAGE'),
    accountStatus: _readRequiredString(env, 'OGZ_ACCOUNT_STATUS'),
    broker: _readRequiredString(env, 'BROKER'),
    startingBalance,
    profitTarget: _readFirstPositiveNumber(env, ['OGZ_PROFIT_TARGET', 'TTP_PROFIT_TARGET_DOLLARS']),
    maxDrawdown: _resolveTrackRecordMaxDrawdown(env, startingBalance),
    minTradesRequired: _readPositiveInteger(env, 'OGZ_MIN_TRADES_REQUIRED'),
    trackRecordStartAt: _readRequiredIsoTimestamp(env, 'OGZ_TRACK_RECORD_START_AT'),
  };
}

function _filterTrackRecordEntriesForAccount(entries, startAt) {
  const startMs = Date.parse(startAt);
  return entries.filter(entry => {
    if (entry.type !== 'TRADE') return true;
    const timestampMs = Date.parse(entry.timestamp);
    if (!Number.isFinite(timestampMs)) {
      throw new Error(`Track record proof requires TRADE timestamp before publishing ${entry.tradeId || entry.orderId || '(unknown trade)'}`);
    }
    return timestampMs >= startMs;
  });
}

function _writeTrackRecordNow() {
  if (!fs.existsSync(PUBLIC_TRACK_RECORD_ACCOUNTS_DIR)) {
    fs.mkdirSync(PUBLIC_TRACK_RECORD_ACCOUNTS_DIR, { recursive: true });
  }

  const {
    accountId,
    accountLabel,
    accountStage,
    accountStatus,
    broker,
    startingBalance,
    profitTarget,
    maxDrawdown,
    minTradesRequired,
    trackRecordStartAt,
  } = _resolveTrackRecordAccountConfig(process.env);

  const entries = _filterTrackRecordEntriesForAccount(
    _readTrackRecordSourceEntries(),
    trackRecordStartAt
  ).filter(e => e.type === 'TRADE');
  const byTradeId = new Map();
  for (const e of entries) {
    if (!e.tradeId) continue;
    if (!byTradeId.has(e.tradeId)) byTradeId.set(e.tradeId, []);
    byTradeId.get(e.tradeId).push(e);
  }

  const recent_trades = [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    const isExit = (e.action === 'SELL' || e.action === 'COVER');
    if (!isExit) continue;

    const legs = byTradeId.get(e.tradeId) || [];
    const entryLeg = legs.find(x => x.action === 'BUY' || x.action === 'SELL_SHORT');

    recent_trades.push({
      t: e.timestamp,
      symbol: e.symbol,
      side: _buildSideLabel(e.action, e.isPartialClose, e.exitReason),
      entry: e.entryPrice ?? entryLeg?.price ?? null,
      exit: e.price,
      pnl: e.pnl ?? null,
      pct: e.pnlPercent ?? null,
      trade_id: e.tradeId,
      order_id: e.orderId,
      leg_type: e.isPartialClose ? 'partial_close' : 'full_close',
      partial_fraction: e.partialFraction,
      exit_reason: e.exitReason,
      confidence: e.confidence
    });

    if (recent_trades.length >= 50) break;
  }

  const exits = entries.filter(e => e.action === 'SELL' || e.action === 'COVER');
  const dailyMap = new Map();
  for (const e of exits) {
    const date = new Date(e.timestamp).toISOString().split('T')[0];
    const bucket = dailyMap.get(date) || { date, pnl: 0, trades: 0 };
    bucket.pnl += (e.pnl ?? 0);
    bucket.trades += 1;
    dailyMap.set(date, bucket);
  }
  const daily_pnl = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  const days_traded = dailyMap.size;
  const trades_recorded = exits.length;
  const winningTrades = exits.filter(e => (e.pnl ?? 0) > 0).length;
  const losingTrades = exits.filter(e => (e.pnl ?? 0) < 0).length;
  const grossProfit = exits.reduce((sum, e) => sum + Math.max(e.pnl ?? 0, 0), 0);
  const grossLoss = exits.reduce((sum, e) => sum + Math.min(e.pnl ?? 0, 0), 0);
  const exitReasons = {};
  for (const e of exits) {
    const reason = e.exitReason || 'unknown';
    exitReasons[reason] = (exitReasons[reason] || 0) + 1;
  }
  const symbolsTraded = Array.from(new Set(exits.map(e => e.symbol).filter(Boolean))).sort();
  const proof_summary = {
    trades_recorded,
    min_trades_required: minTradesRequired,
    winning_trades: winningTrades,
    losing_trades: losingTrades,
    win_rate: trades_recorded > 0 ? (winningTrades / trades_recorded) * 100 : 0,
    gross_profit: grossProfit,
    gross_loss: grossLoss,
    avg_pnl: trades_recorded > 0 ? (grossProfit + grossLoss) / trades_recorded : 0,
    symbols_traded: symbolsTraded,
    exit_reasons: exitReasons,
    partial_exits: exits.filter(e => e.isPartialClose).length,
    full_exits: exits.filter(e => !e.isPartialClose).length,
    track_record_start_at: trackRecordStartAt,
  };

  const equity_series = [];
  let runningBalance = startingBalance;
  const exitsByTime = [...exits].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  for (const e of exitsByTime) {
    runningBalance += (e.pnl ?? 0);
    equity_series.push({ t: e.timestamp, balance: runningBalance });
  }
  if (equity_series.length === 0) {
    equity_series.push({ t: new Date().toISOString(), balance: startingBalance });
  }

  const accountJson = {
    id: accountId,
    label: accountLabel,
    stage: accountStage,
    status: accountStatus,
    broker: broker,
    starting_balance: startingBalance,
    current_balance: runningBalance,
    profit_target: profitTarget,
    max_drawdown: maxDrawdown,
    days_traded: days_traded,
    trades_recorded: trades_recorded,
    min_trades_required: minTradesRequired,
    proof_summary,
    equity_series: equity_series,
    daily_pnl: daily_pnl,
    recent_trades: recent_trades,
    _meta: {
      last_updated: new Date().toISOString(),
      total_recorded_exits: exits.length,
      track_record_start_at: trackRecordStartAt,
      execution_mode: process.env.PAPER_TRADING === 'true' ? 'paper'
                    : process.env.EXECUTION_MODE === 'live' ? 'live'
                    : 'backtest',
      spec: 'CC-SPEC-EVAL-CAPTURE'
    }
  };
  writeJsonAtomic(
    path.join(PUBLIC_TRACK_RECORD_ACCOUNTS_DIR, `${accountId}.json`),
    accountJson,
    { mode: PUBLIC_PROOF_FILE_MODE }
  );

  const indexPath = path.join(PUBLIC_TRACK_RECORD_DATA_DIR, 'index.json');
  const accounts = [{
    id: accountId,
    label: accountLabel,
    stage: accountStage,
    status: accountStatus
  }];
  const mode = (accountJson._meta.execution_mode === 'live' || accountJson._meta.execution_mode === 'paper')
    ? 'live'
    : 'preview';
  writeJsonAtomic(indexPath, {
    updated: new Date().toISOString(),
    mode: mode,
    accounts: accounts
  }, { mode: PUBLIC_PROOF_FILE_MODE });
}

const TradingProofLogger = {
  /**
   * Log trade execution
   */
  trade(data) {
    // Skip file logging in backtest mode to prevent EMFILE
    if (process.env.TEST_MODE === 'true' || process.env.BACKTEST_NO_PATTERN_SAVE === 'true') {
      return;
    }
    const entry = {
      type: 'TRADE',
      timestamp: new Date().toISOString(),
      action: data.action,           // BUY | SELL | SELL_SHORT | COVER
      symbol: data.symbol,
      price: data.price,             // Execution price (entry price on entry; exit price on exit)
      size: data.size,
      value_usd: data.value_usd,
      fees: data.fees,
      reason: data.reason,
      confidence: data.confidence,
      indicators: data.indicators,
      pattern: data.pattern,
      // CC-SPEC-EVAL-CAPTURE (1/3): pairing + forensic fields
      tradeId: data.tradeId || null,             // pairs entries to exits
      orderId: data.orderId || null,             // broker-side identifier
      entryPrice: data.entryPrice ?? null,       // explicit entry price on exit records (so website can render the pair)
      pnl: data.pnl ?? null,                     // realized P&L in USD on exit records
      pnlPercent: data.pnlPercent ?? null,       // realized P&L percent on exit records
      isPartialClose: data.isPartialClose === true,
      partialFraction: data.partialFraction ?? null,
      exitReason: data.exitReason ?? null
    };

    // Console output
    const emoji = data.action === 'BUY' ? '🟢' : '🔴';
    console.log(`[${timestamp()}] ${emoji} TRADE: ${data.action} ${data.size} ${data.symbol} @ $${data.price}`);
    console.log(`   └─ Value: $${data.value_usd?.toFixed(2)} | Fees: $${data.fees?.toFixed(4)}`);
    console.log(`   └─ Reason: ${data.reason}`);
    console.log(`   └─ Confidence: ${data.confidence}%`);

    // File output
    fs.appendFileSync(TRADING_PROOF_LOG, JSON.stringify(entry) + '\n');

    // CC-SPEC-EVAL-CAPTURE (3/3): push to in-memory buffer for publishTrackRecord
    _trackRecordBuffer.push(entry);
    if (_trackRecordBuffer.length > _TRACK_RECORD_BUFFER_LIMIT) {
      _trackRecordBuffer.shift();
    }

    // CHANGE 2026-01-29: Auto-publish to website for real-time proof
    this.publishLiveProof();

    // CC-SPEC-EVAL-CAPTURE (3/3): also publish track-record format for /proof/track-record/
    this.publishTrackRecord();
  },

  /**
   * Publish live proof to public folder for website transparency
   * CHANGE 2026-01-29: Real-time proof publishing
   */
  publishLiveProof() {
    try {
      // Ensure public proof directory exists
      if (!fs.existsSync(PUBLIC_PROOF_DIR)) {
        fs.mkdirSync(PUBLIC_PROOF_DIR, { recursive: true });
      }

      // Read recent entries from trading proof log
      if (!fs.existsSync(TRADING_PROOF_LOG)) {
        return; // No trades yet
      }

      const lines = fs.readFileSync(TRADING_PROOF_LOG, 'utf8').trim().split('\n');
      const entries = lines.slice(-100).map(line => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean);

      // Extract trades only
      const trades = entries.filter(e => e.type === 'TRADE');
      const recentTrades = trades.slice(-20); // Last 20 trades

      // Calculate stats
      const sells = trades.filter(t => t.action === 'SELL');
      const totalTrades = sells.length;

      // Build live proof summary
      const liveProof = {
        updated: new Date().toISOString(),
        instance: 'ogz-prime-v2',
        env: process.env.PAPER_TRADING === 'true' ? 'PAPER' : 'LIVE',
        stats: {
          total_trades: totalTrades,
          last_24h_trades: trades.filter(t =>
            new Date(t.timestamp) > new Date(Date.now() - 24*60*60*1000)
          ).length,
          symbols_traded: [...new Set(trades.map(t => t.symbol))],
        },
        recent_trades: recentTrades.map(t => ({
          time: t.timestamp,
          action: t.action,
          symbol: t.symbol,
          price: t.price,
          value_usd: t.value_usd,
          reason: t.reason,
          confidence: t.confidence
        })),
        explanations: entries.filter(e => e.type === 'EXPLANATION').slice(-5).map(e => ({
          time: e.timestamp,
          decision: e.decision,
          summary: e.plain_english
        }))
      };

      // Write to public folder
      fs.writeFileSync(LIVE_TRADES_FILE, JSON.stringify(liveProof, null, 2), {
        mode: PUBLIC_PROOF_FILE_MODE
      });
      fs.chmodSync(LIVE_TRADES_FILE, PUBLIC_PROOF_FILE_MODE);

    } catch (err) {
      // Fail silently - don't crash bot for proof publishing
      console.error(`[ProofLogger] Failed to publish live proof: ${err.message}`);
    }
  },

  /**
   * CC-SPEC-EVAL-CAPTURE (3/3): publish website-consumable track record JSON
   *
   * Writes two files:
   *   public/proof/track-record/data/index.json
   *   public/proof/track-record/data/accounts/{OGZ_ACCOUNT_ID}.json
   *
   * Reads from the durable trading proof log plus in-memory _trackRecordBuffer.
   * Debounced 5s — burst of trades = one disk write.
   * Atomic via writeJsonAtomic. Single-writer per process.
   *
   * Account-specific values come from env vars (OGZ_ACCOUNT_ID, OGZ_ACCOUNT_LABEL,
   * OGZ_ACCOUNT_STAGE, OGZ_ACCOUNT_STATUS, BROKER, STARTING_BALANCE,
   * OGZ_PROFIT_TARGET, OGZ_MAX_DRAWDOWN, OGZ_MIN_TRADES_REQUIRED,
   * OGZ_TRACK_RECORD_START_AT). Missing proof-critical values fail loud.
   */
  publishTrackRecord() {
    // Debounce: schedule one write 5s out; coalesce bursts
    if (_trackRecordWriteTimer) return;
    _trackRecordWriteTimer = setTimeout(() => {
      _trackRecordWriteTimer = null;
      try {
        _writeTrackRecordNow();
      } catch (err) {
        console.error(`[ProofLogger] Failed to publish track record: ${err.message}`);
      }
    }, _TRACK_RECORD_DEBOUNCE_MS);
  },

  /**
   * Log position update
   */
  position(data) {
    const entry = {
      type: 'POSITION',
      timestamp: new Date().toISOString(),
      symbol: data.symbol,
      size: data.size,
      entry_price: data.entry_price,
      current_price: data.current_price,
      pnl_percent: data.pnl_percent,
      pnl_usd: data.pnl_usd,
      hold_time_min: data.hold_time_min
    };

    // Console output
    const pnlEmoji = data.pnl_percent >= 0 ? '📈' : '📉';
    const pnlColor = data.pnl_percent >= 0 ? '+' : '';
    console.log(`[${timestamp()}] ${pnlEmoji} POSITION: ${data.symbol}`);
    console.log(`   └─ Entry: $${data.entry_price} → Current: $${data.current_price}`);
    console.log(`   └─ P&L: ${pnlColor}${data.pnl_percent?.toFixed(2)}% ($${pnlColor}${data.pnl_usd?.toFixed(2)})`);
    console.log(`   └─ Hold time: ${data.hold_time_min?.toFixed(1)} min`);

    // File output
    fs.appendFileSync(TRADING_PROOF_LOG, JSON.stringify(entry) + '\n');
  },

  /**
   * Log daily summary (for website proof)
   */
  dailySummary(data) {
    const entry = {
      type: 'DAILY_SUMMARY',
      timestamp: new Date().toISOString(),
      date: data.date,
      starting_balance: data.starting_balance,
      ending_balance: data.ending_balance,
      total_pnl_usd: data.total_pnl_usd,
      total_pnl_percent: data.total_pnl_percent,
      total_trades: data.total_trades,
      winning_trades: data.winning_trades,
      losing_trades: data.losing_trades,
      win_rate: data.win_rate,
      largest_win: data.largest_win,
      largest_loss: data.largest_loss,
      avg_hold_time: data.avg_hold_time
    };

    // Console output
    const pnlEmoji = data.total_pnl_usd >= 0 ? '✅' : '❌';
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${timestamp()}] 📊 DAILY SUMMARY - ${data.date}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`   Balance: $${data.starting_balance?.toFixed(2)} → $${data.ending_balance?.toFixed(2)}`);
    console.log(`   ${pnlEmoji} P&L: $${data.total_pnl_usd >= 0 ? '+' : ''}${data.total_pnl_usd?.toFixed(2)} (${data.total_pnl_percent >= 0 ? '+' : ''}${data.total_pnl_percent?.toFixed(2)}%)`);
    console.log(`   Trades: ${data.total_trades} (${data.winning_trades}W / ${data.losing_trades}L)`);
    console.log(`   Win Rate: ${data.win_rate?.toFixed(1)}%`);
    console.log(`   Best: +$${data.largest_win?.toFixed(2)} | Worst: -$${Math.abs(data.largest_loss || 0)?.toFixed(2)}`);
    console.log(`${'='.repeat(60)}\n`);

    // File output
    fs.appendFileSync(TRADING_PROOF_LOG, JSON.stringify(entry) + '\n');
  },

  /**
   * Log decision explanation (per transparency: "TRAI must explain in plain English")
   */
  explanation(data) {
    const entry = {
      type: 'EXPLANATION',
      timestamp: new Date().toISOString(),
      decision: data.decision,
      plain_english: data.plain_english,
      factors: data.factors,
      confidence_breakdown: data.confidence_breakdown
    };

    // Console output
    console.log(`[${timestamp()}] 💭 DECISION EXPLANATION:`);
    console.log(`   └─ Decision: ${data.decision}`);
    console.log(`   └─ Why: ${data.plain_english}`);
    if (data.factors) {
      console.log(`   └─ Factors:`);
      data.factors.forEach(f => console.log(`      • ${f}`));
    }

    // File output
    fs.appendFileSync(TRADING_PROOF_LOG, JSON.stringify(entry) + '\n');
  }
};

// CC-SPEC-EVAL-CAPTURE (3/3) Mercury-attack follow-up: flush pending debounce on shutdown.
// _writeTrackRecordNow was designed callable from shutdown handlers per its docstring,
// but the spec didn't wire them up. Without this, the last 0-5s of trades pre-shutdown
// are silently dropped from the website JSON (Mercury attack 2026-05-12, vectors 1+8).
// writeJsonAtomic is synchronous (core/AtomicWrite.js:25) so _writeTrackRecordNow works
// inside an 'exit' handler.
const _flushTrackRecordOnShutdown = () => {
  if (_trackRecordWriteTimer) {
    clearTimeout(_trackRecordWriteTimer);
    _trackRecordWriteTimer = null;
    try {
      _writeTrackRecordNow();
    } catch (err) {
      console.error(`[ProofLogger] Failed to flush track record on shutdown: ${err.message}`);
    }
  }
};
process.on('SIGTERM', _flushTrackRecordOnShutdown);
process.on('SIGINT', _flushTrackRecordOnShutdown);
process.on('exit', _flushTrackRecordOnShutdown);

// Export for use in other modules
module.exports = {
  ClauditoLogger,
  TradingProofLogger,
  // Convenience exports
  logHook: ClauditoLogger.hook,
  logDecision: ClauditoLogger.decision,
  logError: ClauditoLogger.error,
  logMetrics: ClauditoLogger.metrics,
  logMission: ClauditoLogger.mission,
  logTrade: TradingProofLogger.trade,
  logPosition: TradingProofLogger.position,
  logDailySummary: TradingProofLogger.dailySummary,
  logExplanation: TradingProofLogger.explanation
};

// CLI test
if (require.main === module) {
  console.log('🧪 Testing Claudito Logger...\n');

  // Test Claudito logging
  ClauditoLogger.hook('/fixer', 'FIX_APPLIED', { result: 'success', next: '/debugger' });
  ClauditoLogger.decision('forensics', 'AUDIT_COMPLETE', 'Found 3 issues in pattern memory', 95);
  ClauditoLogger.metrics({ patterns_detected: 47, patterns_saved: 45, bugs_fixed: 2, duration_ms: 1500 });
  ClauditoLogger.mission('MISSION-123456', 'in_progress', { clauditos: ['forensics', 'fixer', 'debugger'], fixes: 2 });

  console.log('\n🧪 Testing Trading Proof Logger...\n');

  // Test Trading logging
  TradingProofLogger.trade({
    action: 'BUY',
    symbol: 'BTC/USD',
    price: 88500.50,
    size: 0.001,
    value_usd: 88.50,
    fees: 0.28,
    reason: 'RSI oversold + bullish divergence + support bounce',
    confidence: 72,
    indicators: { rsi: 28, macd: 'bullish_cross' },
    pattern: 'double_bottom'
  });

  TradingProofLogger.position({
    symbol: 'BTC/USD',
    size: 0.001,
    entry_price: 88500.50,
    current_price: 88750.00,
    pnl_percent: 0.28,
    pnl_usd: 0.25,
    hold_time_min: 5.5
  });

  TradingProofLogger.explanation({
    decision: 'BUY',
    plain_english: 'Price hit strong support at $88,500 with oversold RSI. Historical pattern shows 73% bounce probability.',
    factors: ['RSI at 28 (oversold)', 'Price at daily support', 'Volume spike on bounce', 'MACD bullish crossover'],
    confidence_breakdown: { technical: 75, pattern: 70, volume: 65 }
  });

  TradingProofLogger.dailySummary({
    date: new Date().toISOString().split('T')[0],
    starting_balance: 10000,
    ending_balance: 10150,
    total_pnl_usd: 150,
    total_pnl_percent: 1.5,
    total_trades: 8,
    winning_trades: 5,
    losing_trades: 3,
    win_rate: 62.5,
    largest_win: 85,
    largest_loss: 35,
    avg_hold_time: 12.5
  });

  console.log('\n✅ Logger test complete. Check ogz-meta/logs/ for output files.');
}
