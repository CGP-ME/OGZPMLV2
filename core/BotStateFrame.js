'use strict';

const EASTERN_TIME_ZONE = 'America/New_York';
const STOCK_OPEN_HOUR = 9;
const STOCK_OPEN_MINUTE = 30;
const STOCK_CLOSE_HOUR = 16;
const STOCK_CLOSE_MINUTE = 0;

function envFlag(env, key) {
  const value = env && env[key];
  return value === true || value === 1 || String(value || '').toLowerCase() === 'true' || String(value || '') === '1';
}

function cleanString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function easternParts(date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === '24' ? '0' : parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: parts.weekday,
  };
}

function easternOffsetMinutes(date) {
  const parts = easternParts(date);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0);
  return Math.round((asUtc - date.getTime()) / 60000);
}

function zonedEasternDateTimeToUtc(year, month, day, hour, minute) {
  const approximate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = easternOffsetMinutes(approximate);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0) - offset * 60000);
}

function isWeekend(parts) {
  return parts.weekday === 'Sat' || parts.weekday === 'Sun';
}

function compareTime(parts, hour, minute) {
  if (parts.hour !== hour) return parts.hour - hour;
  return parts.minute - minute;
}

function addEasternDays(parts, days) {
  const noonUtc = zonedEasternDateTimeToUtc(parts.year, parts.month, parts.day, 12, 0);
  const next = new Date(noonUtc.getTime() + days * 24 * 60 * 60 * 1000);
  return easternParts(next);
}

function nextStockMarketOpen(now = new Date()) {
  let parts = easternParts(now);
  const afterOpen = compareTime(parts, STOCK_OPEN_HOUR, STOCK_OPEN_MINUTE) >= 0;
  if (!isWeekend(parts) && !afterOpen) {
    return zonedEasternDateTimeToUtc(parts.year, parts.month, parts.day, STOCK_OPEN_HOUR, STOCK_OPEN_MINUTE).toISOString();
  }

  do {
    parts = addEasternDays(parts, 1);
  } while (isWeekend(parts));

  return zonedEasternDateTimeToUtc(parts.year, parts.month, parts.day, STOCK_OPEN_HOUR, STOCK_OPEN_MINUTE).toISOString();
}

function isStockMarketOpen(now = new Date()) {
  const parts = easternParts(now);
  if (isWeekend(parts)) return false;
  return compareTime(parts, STOCK_OPEN_HOUR, STOCK_OPEN_MINUTE) >= 0 &&
    compareTime(parts, STOCK_CLOSE_HOUR, STOCK_CLOSE_MINUTE) < 0;
}

function collectActiveStrategies(ctx) {
  const strategies = ctx && ctx.strategyOrchestrator && Array.isArray(ctx.strategyOrchestrator.strategies)
    ? ctx.strategyOrchestrator.strategies
    : [];
  return strategies
    .map(strategy => cleanString(strategy && (strategy.name || strategy.strategyName || strategy.id)))
    .filter(Boolean);
}

function collectActiveBrokers(ctx, env = process.env) {
  const brokers = new Set();
  const brokerId = cleanString(ctx && ctx.config && ctx.config.brokerId) ||
    cleanString(ctx && ctx.config && ctx.config.broker && ctx.config.broker.id) ||
    cleanString(ctx && ctx.broker && ctx.broker.id) ||
    cleanString(env.BROKER);
  if (brokerId) brokers.add(brokerId.toUpperCase());

  if (ctx && ctx.sessionRouter && ctx.sessionRouter.activeBroker && ctx.sessionRouter.activeBroker.id) {
    brokers.add(String(ctx.sessionRouter.activeBroker.id).toUpperCase());
  }
  const routerConfig = ctx && ctx.config && ctx.config.sessionRouter;
  const activeRouterSession = (cleanString(ctx && ctx.sessionRouter && ctx.sessionRouter.activeSession) ||
    (routerConfig && routerConfig.mode === 'static' ? cleanString(routerConfig.staticSession) : null) ||
    '').toLowerCase();
  if (activeRouterSession === 'crypto') {
    brokers.add('KRAKEN');
  } else if (activeRouterSession === 'stocks') {
    brokers.add('ALPACA');
  }
  if (!brokers.size && cleanString(env.KRAKEN_API_KEY)) brokers.add('KRAKEN');
  if (!brokers.size && cleanString(env.ALPACA_API_KEY)) brokers.add('ALPACA');

  return Array.from(brokers);
}

function hasStockRuntime(env = process.env) {
  return cleanString(env.ALPACA_SYMBOLS) ||
    cleanString(env.ALPACA_API_KEY) ||
    cleanString(env.ALPACA_MODE) ||
    String(env.ASSET_CLASS || '').toLowerCase() === 'stocks' ||
    String(env.BROKER || '').toLowerCase() === 'alpaca';
}

function buildBotStateFrame(ctx = {}, options = {}) {
  const env = options.env || process.env;
  const now = options.now instanceof Date ? options.now : new Date();
  const executionMode = cleanString(
    env.EXECUTION_MODE ||
    env.TRADING_MODE ||
    (ctx.config && ctx.config.executionMode) ||
    (ctx.config && ctx.config.mode && ctx.config.mode.execution)
  ) || 'paper';
  const liveTrading = envFlag(env, 'LIVE_TRADING') || envFlag(env, 'ENABLE_LIVE_TRADING') || executionMode === 'live';
  const paperTrading = envFlag(env, 'PAPER_TRADING') || executionMode === 'paper';
  const paused = Boolean(ctx && ctx.stateManager && typeof ctx.stateManager.isPaused === 'function' && ctx.stateManager.isPaused());
  const stockRuntime = hasStockRuntime(env);
  const stockOpen = isStockMarketOpen(now);

  let mode = liveTrading ? 'live' : paperTrading ? 'eval_active' : 'eval_dormant';
  let reason = liveTrading ? 'live_trading_enabled' : paperTrading ? 'paper_trading_enabled' : 'env_paper_disabled';
  let nextActiveAt = null;

  if (paused) {
    mode = 'paused';
    reason = 'manual_pause';
  } else if (stockRuntime && !stockOpen) {
    mode = isWeekend(easternParts(now)) ? 'weekend_idle' : 'eval_dormant';
    reason = 'stocks_closed';
    nextActiveAt = nextStockMarketOpen(now);
  } else if (stockRuntime && stockOpen && !liveTrading && !paperTrading) {
    mode = 'eval_dormant';
    reason = 'env_paper_disabled';
    nextActiveAt = null;
  }

  return {
    type: 'bot_state',
    timestamp: now.getTime(),
    mode,
    reason,
    next_active_at: nextActiveAt,
    active_strategies: collectActiveStrategies(ctx),
    active_brokers: collectActiveBrokers(ctx, env),
    execution_mode: executionMode,
    paper_trading: paperTrading,
    live_trading: liveTrading,
  };
}

module.exports = {
  buildBotStateFrame,
  collectActiveBrokers,
  collectActiveStrategies,
  isStockMarketOpen,
  nextStockMarketOpen,
};
