'use strict';

const EASTERN_TIME_ZONE = 'America/New_York';
const STOCK_OPEN_HOUR = 9;
const STOCK_OPEN_MINUTE = 30;
const STOCK_CLOSE_HOUR = 16;
const STOCK_CLOSE_MINUTE = 0;

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

function collectActiveBrokers(ctx) {
  const runtimeScope = ctx?.stateManager?.getDashboardRuntimeScope?.() || null;
  const scopedBroker = cleanString(runtimeScope?.brokerId || runtimeScope?.broker);
  if (scopedBroker) return [scopedBroker.toUpperCase()];

  const activeBroker = cleanString(ctx?.sessionRouter?.activeBroker?.id)
    || cleanString(ctx?.sessionRouter?.activeBroker?.getBrokerName?.());
  if (activeBroker) return [activeBroker.toUpperCase()];

  const activeRouterSession = (cleanString(ctx && ctx.sessionRouter && ctx.sessionRouter.activeSession) ||
    (ctx?.sessionRouter?.mode === 'static' ? cleanString(ctx.sessionRouter.staticSession) : null) ||
    '').toLowerCase();
  if (activeRouterSession === 'crypto') {
    return ['KRAKEN'];
  } else if (activeRouterSession === 'stocks') {
    return ['ALPACA'];
  }
  return [];
}

function hasStockRuntime(ctx) {
  const runtimeScope = ctx?.stateManager?.getDashboardRuntimeScope?.() || null;
  if (runtimeScope) {
    return String(runtimeScope.assetClass || '').toLowerCase() === 'stocks'
      || String(runtimeScope.brokerId || runtimeScope.broker || '').toLowerCase() === 'alpaca';
  }
  const activeSession = cleanString(ctx?.sessionRouter?.activeSession).toLowerCase();
  if (activeSession) return activeSession === 'stocks';
  return ctx?.sessionRouter?.mode === 'static'
    && cleanString(ctx.sessionRouter.staticSession).toLowerCase() === 'stocks';
}

function buildBotStateFrame(ctx = {}, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const runtimeScope = ctx?.stateManager?.getDashboardRuntimeScope?.() || null;
  const executionMode = cleanString(
    runtimeScope?.executionMode ||
    (ctx.config && ctx.config.executionMode) ||
    (ctx.config && ctx.config.mode && ctx.config.mode.execution)
  );
  const liveTrading = executionMode === 'live';
  const paperTrading = executionMode === 'paper';
  const paused = Boolean(ctx && ctx.stateManager && typeof ctx.stateManager.isPaused === 'function' && ctx.stateManager.isPaused());
  const stockRuntime = hasStockRuntime(ctx);
  const stockOpen = isStockMarketOpen(now);

  let mode = liveTrading ? 'live' : paperTrading ? 'eval_active' : 'eval_dormant';
  let reason = liveTrading
    ? 'live_trading_enabled'
    : paperTrading
      ? 'paper_trading_enabled'
      : 'execution_mode_not_live_or_paper';
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
    reason = 'paper_mode_disabled';
    nextActiveAt = null;
  }

  return {
    type: 'bot_state',
    timestamp: now.getTime(),
    mode,
    reason,
    next_active_at: nextActiveAt,
    active_strategies: collectActiveStrategies(ctx),
    active_brokers: collectActiveBrokers(ctx),
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
