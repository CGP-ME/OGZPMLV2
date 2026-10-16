'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const Module = require('module');
const path = require('path');

const root = process.cwd();
const fixtureDir = path.join(__dirname, 'pinned');
const actualRead = fs.readFileSync;
const canonical = new Map([
  [path.join(root, 'config/settings.json'), path.join(fixtureDir, 'config__settings.json.cjs')],
  [path.join(root, 'config/internals.json'), path.join(fixtureDir, 'config__internals.json.cjs')],
]);
fs.readFileSync = function (file, ...args) {
  return actualRead.call(this, canonical.get(path.resolve(String(file))) || file, ...args);
};
const loaderFilename = path.join(root, 'foundation/ConfigLoader.js');
const actualLoad = Module._load;
Module._load = function (request, parent, isMain) {
  const resolved = Module._resolveFilename(request, parent, isMain);
  if (resolved !== loaderFilename) return actualLoad.apply(this, arguments);
  if (require.cache[resolved]) return require.cache[resolved].exports;
  const mod = new Module(resolved, parent);
  mod.filename = resolved;
  mod.paths = Module._nodeModulePaths(path.dirname(resolved));
  require.cache[resolved] = mod;
  mod._compile(actualRead(path.join(fixtureDir, 'foundation__ConfigLoader.js.cjs'), 'utf8'), resolved);
  return mod.exports;
};

for (const [key, value] of Object.entries({
  ALPACA_API_KEY: 'fixture-alpaca-key', ALPACA_API_SECRET: 'fixture-alpaca-secret',
  KRAKEN_API_KEY: 'fixture-kraken-key', KRAKEN_API_SECRET: 'fixture-kraken-secret',
  WEBSOCKET_AUTH_TOKEN: 'fixture-dashboard-token', SIGNALSTACK_WEBHOOK_URL: 'https://fixture.invalid/webhook',
})) process.env[key] = value;
process.env.DOTENV_CONFIG_PATH = path.join('/tmp', 'absent-provenance.env');

const ConfigLoader = require(path.join(root, 'foundation/ConfigLoader.js'));
const canonicalSettings = JSON.parse(actualRead(canonical.get(path.join(root, 'config/settings.json')), 'utf8'));
const canonicalInternals = JSON.parse(actualRead(canonical.get(path.join(root, 'config/internals.json')), 'utf8'));
const leaves = (value, prefix = '', result = []) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) leaves(child, prefix ? `${prefix}.${key}` : key, result);
  } else result.push(prefix);
  return result;
};
const snapshot = (role, profile) => {
  ConfigLoader._resetForTest();
  process.env.PROFILE = profile;
  const loaded = ConfigLoader.load({ role, silent: true, loadDotenv: false });
  const config = loaded.config;
  const missingSources = leaves(config).filter(key => loaded.sources?.[key] === undefined);
  return {
    role, profile, fingerprint: loaded.fingerprint, revisions: loaded.revisions,
    leafCount: leaves(config).length, sourceCount: Object.keys(loaded.sources || {}).length,
    missingSources, config, sources: loaded.sources,
  };
};
const result = { candidate: process.env.CONFIG_PROOF_REF || 'unqualified-source', roles: [], checks: [], failures: [] };
for (const profile of ['paper', 'production']) {
  const first = snapshot('bot', profile);
  const second = snapshot('bot', profile);
  result.roles.push({ role: 'bot', profile, fingerprint: first.fingerprint, revisions: first.revisions,
    leafCount: first.leafCount, sourceCount: first.sourceCount, missingSources: first.missingSources });
  result.sourceMaps = result.sourceMaps || {};
  result.sourceMaps[`bot/${profile}`] = first.sources;
  assert.equal(first.fingerprint, second.fingerprint);
  assert.deepEqual(first.revisions, second.revisions);
  assert.equal(first.missingSources.length, 0);
  assert.equal(second.missingSources.length, 0);
  result.checks.push(`bot/${profile} deterministic fingerprint and revision receipt`);
}
ConfigLoader._resetForTest();
process.env.PROFILE = 'paper';
const loadedOnce = ConfigLoader.load({ role: 'bot', silent: true, loadDotenv: false });
const receiptOnce = JSON.parse(JSON.stringify(loadedOnce.revisions));
const cached = ConfigLoader.load({ role: 'bot', silent: true, loadDotenv: false });
assert.strictEqual(cached, loadedOnce);
assert.deepEqual(cached.revisions, receiptOnce);
const forced = ConfigLoader.load({ role: 'bot', force: true, silent: true, loadDotenv: false });
assert.equal(forced.fingerprint, loadedOnce.fingerprint);
assert.deepEqual(forced.revisions, receiptOnce);
assert.deepEqual(forced.config, loadedOnce.config);
result.checks.push('same-process cache reuse preserves object and forced reload preserves values and receipt');
const supervisor = snapshot('supervisor', 'paper');
result.roles.push({ role: 'supervisor', profile: 'paper', fingerprint: supervisor.fingerprint,
  revisions: supervisor.revisions, leafCount: supervisor.leafCount, sourceCount: supervisor.sourceCount,
  missingSources: supervisor.missingSources });
result.sourceMaps = result.sourceMaps || {};
result.sourceMaps['supervisor/paper'] = supervisor.sources;
assert.equal(supervisor.missingSources.length, 0);
result.checks.push('supervisor source ownership complete');
ConfigLoader._resetForTest();
process.env.PROFILE = 'paper';
const dashboard = snapshot('dashboard', 'paper');
result.roles.push({ role: 'dashboard', profile: 'paper', fingerprint: dashboard.fingerprint,
  revisions: dashboard.revisions, leafCount: dashboard.leafCount, sourceCount: dashboard.sourceCount,
  missingSources: dashboard.missingSources });
result.sourceMaps['dashboard/paper'] = dashboard.sources;
assert.equal(dashboard.missingSources.length, 0);
result.checks.push('dashboard source ownership complete');

const legacyNames = {"ACCOUNT_BALANCE": "archived-sentinel-ACCOUNT_BALANCE", "ACCOUNT_DRAWDOWN_BYPASS": "archived-sentinel-ACCOUNT_DRAWDOWN_BYPASS", "ALPACA_MODE": "archived-sentinel-ALPACA_MODE", "ALPACA_SYMBOLS": "archived-sentinel-ALPACA_SYMBOLS", "API_EXTERNAL_URL": "archived-sentinel-API_EXTERNAL_URL", "API_PASSWORD": "archived-sentinel-API_PASSWORD", "API_PORT": "archived-sentinel-API_PORT", "API_USERNAME": "archived-sentinel-API_USERNAME", "ARCHON_API_KEY": "archived-sentinel-ARCHON_API_KEY", "ASSET_CLASS": "archived-sentinel-ASSET_CLASS", "ATR_FILTER_ENABLED": "archived-sentinel-ATR_FILTER_ENABLED", "ATR_MIN_PERCENT": "archived-sentinel-ATR_MIN_PERCENT", "AVATAR_ENABLED": "archived-sentinel-AVATAR_ENABLED", "AVATAR_IMAGE_URL": "archived-sentinel-AVATAR_IMAGE_URL", "BACKTEST_FAST": "archived-sentinel-BACKTEST_FAST", "BACKTEST_MODE": "archived-sentinel-BACKTEST_MODE", "BASE_POSITION_SIZE": "archived-sentinel-BASE_POSITION_SIZE", "BOT_WS_URL": "archived-sentinel-BOT_WS_URL", "BREAKEVEN_EXIT_PERCENT": "archived-sentinel-BREAKEVEN_EXIT_PERCENT", "BREAKEVEN_TRIGGER": "archived-sentinel-BREAKEVEN_TRIGGER", "BRIGHTDATA_SERP_ZONE": "archived-sentinel-BRIGHTDATA_SERP_ZONE", "BROKER": "archived-sentinel-BROKER", "BTC_WALLET_ADDRESS": "archived-sentinel-BTC_WALLET_ADDRESS", "CANDLE_PATTERN_MIN_CONFIDENCE": "archived-sentinel-CANDLE_PATTERN_MIN_CONFIDENCE", "CANDLE_TIMEFRAME": "archived-sentinel-CANDLE_TIMEFRAME", "CLAUDE_CODE_API_KEY": "archived-sentinel-CLAUDE_CODE_API_KEY", "COINBASE_API_KEY_NAME": "archived-sentinel-COINBASE_API_KEY_NAME", "COINBASE_PRIVATE_KEY": "archived-sentinel-COINBASE_PRIVATE_KEY", "CONFIDENCE_BOOST": "archived-sentinel-CONFIDENCE_BOOST", "CONFIDENCE_PENALTY": "archived-sentinel-CONFIDENCE_PENALTY", "CONFIRM_LIVE_TRADING": "archived-sentinel-CONFIRM_LIVE_TRADING", "CONTROL_WEBSOCKET_PORT": "archived-sentinel-CONTROL_WEBSOCKET_PORT", "DATABASE_URL": "archived-sentinel-DATABASE_URL", "DATA_FRESHNESS_WINDOW": "archived-sentinel-DATA_FRESHNESS_WINDOW", "DATA_WEBSOCKET_PORT": "archived-sentinel-DATA_WEBSOCKET_PORT", "DID_AVATAR_ID": "archived-sentinel-DID_AVATAR_ID", "DIRECTION_FILTER": "archived-sentinel-DIRECTION_FILTER", "EDGAR_USER_AGENT": "archived-sentinel-EDGAR_USER_AGENT", "ELEVENLABS_VOICE_ID": "archived-sentinel-ELEVENLABS_VOICE_ID", "EMERGENCY_CONFIDENCE": "archived-sentinel-EMERGENCY_CONFIDENCE", "ENABLE_ARBITRAGE": "archived-sentinel-ENABLE_ARBITRAGE", "ENABLE_DYNAMIC_SIZING": "archived-sentinel-ENABLE_DYNAMIC_SIZING", "ENABLE_HEDGING": "archived-sentinel-ENABLE_HEDGING", "ENABLE_LEARNING": "archived-sentinel-ENABLE_LEARNING", "ENABLE_PRICE_BROADCAST": "archived-sentinel-ENABLE_PRICE_BROADCAST", "ENABLE_SHORTS": "archived-sentinel-ENABLE_SHORTS", "ENABLE_TRAI": "archived-sentinel-ENABLE_TRAI", "ENABLE_VOLATILITY_SCALING": "archived-sentinel-ENABLE_VOLATILITY_SCALING", "EVAL_RULES_ENABLED": "archived-sentinel-EVAL_RULES_ENABLED", "EXECUTION_MODE": "archived-sentinel-EXECUTION_MODE", "EXIT_SYSTEM": "archived-sentinel-EXIT_SYSTEM", "FEATURE_FLAG": "archived-sentinel-FEATURE_FLAG", "FEE_MAKER": "archived-sentinel-FEE_MAKER", "FEE_SAFETY_BUFFER": "archived-sentinel-FEE_SAFETY_BUFFER", "FEE_SLIPPAGE": "archived-sentinel-FEE_SLIPPAGE", "FEE_TAKER": "archived-sentinel-FEE_TAKER", "FEE_TOTAL_ROUNDTRIP": "archived-sentinel-FEE_TOTAL_ROUNDTRIP", "FIB_PROXIMITY": "archived-sentinel-FIB_PROXIMITY", "FINAL_TARGET": "archived-sentinel-FINAL_TARGET", "FUND_TARGET": "archived-sentinel-FUND_TARGET", "GEMINI_API_KEY": "archived-sentinel-GEMINI_API_KEY", "GEMINI_EXCHANGE_API_KEY": "archived-sentinel-GEMINI_EXCHANGE_API_KEY", "GEMINI_EXCHANGE_API_SECRET": "archived-sentinel-GEMINI_EXCHANGE_API_SECRET", "GEMINI_SANDBOX": "archived-sentinel-GEMINI_SANDBOX", "GOOGLE_API_KEY": "archived-sentinel-GOOGLE_API_KEY", "GRAFANA_PASSWORD": "archived-sentinel-GRAFANA_PASSWORD", "GUI_WEBSOCKET_PORT": "archived-sentinel-GUI_WEBSOCKET_PORT", "HIGH_VOL_MULTIPLIER": "archived-sentinel-HIGH_VOL_MULTIPLIER", "HIGH_VOL_THRESHOLD": "archived-sentinel-HIGH_VOL_THRESHOLD", "HOUSTON_TARGET": "archived-sentinel-HOUSTON_TARGET", "JWT_SECRET": "archived-sentinel-JWT_SECRET", "LICENSE_ENCRYPTION_KEY": "archived-sentinel-LICENSE_ENCRYPTION_KEY", "LICENSE_PRIVATE_KEY": "archived-sentinel-LICENSE_PRIVATE_KEY", "LICENSE_PUBLIC_KEY": "archived-sentinel-LICENSE_PUBLIC_KEY", "LIVE_TRADING": "archived-sentinel-LIVE_TRADING", "LOG_DIRECTORY": "archived-sentinel-LOG_DIRECTORY", "LOG_LEVEL": "archived-sentinel-LOG_LEVEL", "LOW_VOL_MULTIPLIER": "archived-sentinel-LOW_VOL_MULTIPLIER", "LOW_VOL_THRESHOLD": "archived-sentinel-LOW_VOL_THRESHOLD", "MAX_CONFIDENCE": "archived-sentinel-MAX_CONFIDENCE", "MAX_DAILY_LOSS": "archived-sentinel-MAX_DAILY_LOSS", "MAX_DRAWDOWN": "archived-sentinel-MAX_DRAWDOWN", "MAX_POSITION_SIZE": "archived-sentinel-MAX_POSITION_SIZE", "MAX_POSITION_SIZE_PCT": "archived-sentinel-MAX_POSITION_SIZE_PCT", "MAX_RISK_PER_TRADE": "archived-sentinel-MAX_RISK_PER_TRADE", "MEMORY_DIR": "archived-sentinel-MEMORY_DIR", "MIN_HOLD_TIME_MINUTES": "archived-sentinel-MIN_HOLD_TIME_MINUTES", "MIN_PROFIT_TRAIL": "archived-sentinel-MIN_PROFIT_TRAIL", "MIN_TRADE_CONFIDENCE": "archived-sentinel-MIN_TRADE_CONFIDENCE", "MOBILE_PASSWORD": "archived-sentinel-MOBILE_PASSWORD", "MOBILE_SECRET": "archived-sentinel-MOBILE_SECRET", "MODULE_AUTOLOADER_PATH": "archived-sentinel-MODULE_AUTOLOADER_PATH", "MOVER_API_KEY": "archived-sentinel-MOVER_API_KEY", "MOVER_HTTP_PORT": "archived-sentinel-MOVER_HTTP_PORT", "MOVER_PERSONALITY": "archived-sentinel-MOVER_PERSONALITY", "MOVER_VOICE_API_KEY": "archived-sentinel-MOVER_VOICE_API_KEY", "MOVER_VPS_MODE": "archived-sentinel-MOVER_VPS_MODE", "MOVER_WS_PORT": "archived-sentinel-MOVER_WS_PORT", "MPM_BREAKEVEN_THRESHOLD": "archived-sentinel-MPM_BREAKEVEN_THRESHOLD", "NARRATOR_LABEL_SEED": "archived-sentinel-NARRATOR_LABEL_SEED", "NEWS_SEARCH_PROVIDER": "archived-sentinel-NEWS_SEARCH_PROVIDER", "NODE_ENV": "archived-sentinel-NODE_ENV", "OGZ_API_URL": "archived-sentinel-OGZ_API_URL", "OGZ_PUBLIC_HOST": "archived-sentinel-OGZ_PUBLIC_HOST", "OGZ_SSL_SERVER": "archived-sentinel-OGZ_SSL_SERVER", "OGZ_WS_URL": "archived-sentinel-OGZ_WS_URL", "OLLAMA_API_KEY": "archived-sentinel-OLLAMA_API_KEY", "OLLAMA_CLOUD_URL": "archived-sentinel-OLLAMA_CLOUD_URL", "OLLAMA_ENABLED": "archived-sentinel-OLLAMA_ENABLED", "OLLAMA_URL": "archived-sentinel-OLLAMA_URL", "PAPER_TRADING": "archived-sentinel-PAPER_TRADING", "PATTERN_CONFIDENCE": "archived-sentinel-PATTERN_CONFIDENCE", "PATTERN_DOMINANCE": "archived-sentinel-PATTERN_DOMINANCE", "PATTERN_UPDATE": "archived-sentinel-PATTERN_UPDATE", "PORT": "archived-sentinel-PORT", "POSTGRES_PASSWORD": "archived-sentinel-POSTGRES_PASSWORD", "POST_BREAKEVEN_TRAIL": "archived-sentinel-POST_BREAKEVEN_TRAIL", "PRIMARY_ASSET": "archived-sentinel-PRIMARY_ASSET", "PROFIT_PROTECTION": "archived-sentinel-PROFIT_PROTECTION", "REDIS_PASSWORD": "archived-sentinel-REDIS_PASSWORD", "REDIS_URL": "archived-sentinel-REDIS_URL", "RISK_CHECK": "archived-sentinel-RISK_CHECK", "RISK_MANAGER_BYPASS": "archived-sentinel-RISK_MANAGER_BYPASS", "RISK_PER_TRADE": "archived-sentinel-RISK_PER_TRADE", "SCALPER_MAX_HOLD_TIME": "archived-sentinel-SCALPER_MAX_HOLD_TIME", "SCALPER_MICRO_PROFIT": "archived-sentinel-SCALPER_MICRO_PROFIT", "SCALPER_MOMENTUM_SHIFT": "archived-sentinel-SCALPER_MOMENTUM_SHIFT", "SCALPER_QUICK_PROFIT": "archived-sentinel-SCALPER_QUICK_PROFIT", "SCALPER_STOP_MULTIPLIER": "archived-sentinel-SCALPER_STOP_MULTIPLIER", "SESSION_ROUTER_ENABLED": "archived-sentinel-SESSION_ROUTER_ENABLED", "SITE_URL": "archived-sentinel-SITE_URL", "SONAR_TOKEN": "archived-sentinel-SONAR_TOKEN", "SONAR_USER_TOKEN": "archived-sentinel-SONAR_USER_TOKEN", "SOURCEGRAPH_API_KEY": "archived-sentinel-SOURCEGRAPH_API_KEY", "SOURCEGRAPH_INSTANCE_URL": "archived-sentinel-SOURCEGRAPH_INSTANCE_URL", "SR_MAX_LEVELS": "archived-sentinel-SR_MAX_LEVELS", "SR_MIN_STRENGTH": "archived-sentinel-SR_MIN_STRENGTH", "SR_PROXIMITY": "archived-sentinel-SR_PROXIMITY", "SSL_ENABLED": "archived-sentinel-SSL_ENABLED", "SSL_SERVER_HOST": "archived-sentinel-SSL_SERVER_HOST", "SSL_SERVER_PORT": "archived-sentinel-SSL_SERVER_PORT", "STARTING_BALANCE": "archived-sentinel-STARTING_BALANCE", "STOP_LOSS_PERCENT": "archived-sentinel-STOP_LOSS_PERCENT", "SUBSCRIPTION_TIER": "archived-sentinel-SUBSCRIPTION_TIER", "SUPABASE_ANON_KEY": "archived-sentinel-SUPABASE_ANON_KEY", "SUPABASE_SERVICE_KEY": "archived-sentinel-SUPABASE_SERVICE_KEY", "SUPABASE_URL": "archived-sentinel-SUPABASE_URL", "TAKE_PROFIT_PERCENT": "archived-sentinel-TAKE_PROFIT_PERCENT", "TESTING": "archived-sentinel-TESTING", "TEST_MODE": "archived-sentinel-TEST_MODE", "TIER1_TARGET": "archived-sentinel-TIER1_TARGET", "TIER2_TARGET": "archived-sentinel-TIER2_TARGET", "TIER3_TARGET": "archived-sentinel-TIER3_TARGET", "TIGHT_TRAIL_DISTANCE": "archived-sentinel-TIGHT_TRAIL_DISTANCE", "TRADE_INTERVAL": "archived-sentinel-TRADE_INTERVAL", "TRADING_MODE": "archived-sentinel-TRADING_MODE", "TRADING_PAIR": "archived-sentinel-TRADING_PAIR", "TRAILING_ACTIVATION": "archived-sentinel-TRAILING_ACTIVATION", "TRAILING_STOP_PERCENT": "archived-sentinel-TRAILING_STOP_PERCENT", "TRAIL_DISTANCE": "archived-sentinel-TRAIL_DISTANCE", "TRAI_AUTO_HARVEST": "archived-sentinel-TRAI_AUTO_HARVEST", "TRAI_BACKTEST_MODE": "archived-sentinel-TRAI_BACKTEST_MODE", "TRAI_ENABLE_BACKTEST": "archived-sentinel-TRAI_ENABLE_BACKTEST", "TRAI_ENABLE_LLM": "archived-sentinel-TRAI_ENABLE_LLM", "TRAI_HARVEST_BOOST_WR": "archived-sentinel-TRAI_HARVEST_BOOST_WR", "TRAI_HARVEST_MIN_TRADES": "archived-sentinel-TRAI_HARVEST_MIN_TRADES", "TRAI_HARVEST_PENALTY_WR": "archived-sentinel-TRAI_HARVEST_PENALTY_WR", "TRAI_MAX_CONF": "archived-sentinel-TRAI_MAX_CONF", "TRAI_MAX_RISK": "archived-sentinel-TRAI_MAX_RISK", "TRAI_MIN_CONF": "archived-sentinel-TRAI_MIN_CONF", "TRAI_MODE": "archived-sentinel-TRAI_MODE", "TRAI_VETO": "archived-sentinel-TRAI_VETO", "TRAI_WEIGHT": "archived-sentinel-TRAI_WEIGHT", "TTP_RULES_ENABLED": "archived-sentinel-TTP_RULES_ENABLED", "USER_NARRATOR": "archived-sentinel-USER_NARRATOR", "USE_MODULE_AUTOLOADER": "archived-sentinel-USE_MODULE_AUTOLOADER", "USE_SSL": "archived-sentinel-USE_SSL", "VOICE_ENABLED": "archived-sentinel-VOICE_ENABLED", "WEBHOOK_DRY_RUN": "archived-sentinel-WEBHOOK_DRY_RUN", "WEBHOOK_ORDERS_ENABLED": "archived-sentinel-WEBHOOK_ORDERS_ENABLED", "WEBSOCKET_DOMAIN": "archived-sentinel-WEBSOCKET_DOMAIN", "WS_HOST": "archived-sentinel-WS_HOST", "WS_PORT": "archived-sentinel-WS_PORT", "WS_URL": "archived-sentinel-WS_URL"};
for (const [key, value] of Object.entries(legacyNames)) process.env[key] = value;
const clean = snapshot('bot', 'paper');
for (const key of Object.keys(legacyNames)) delete process.env[key];
const after = snapshot('bot', 'paper');
assert.equal(clean.fingerprint, after.fingerprint);
assert.deepEqual(clean.config, after.config);
result.archivedNamesExercised = Object.keys(legacyNames);
assert.deepEqual(clean.revisions, after.revisions);
result.checks.push('legacy environment sentinel names do not override canonical settings');

const tuning = ConfigLoader.listTuningProfileNames();
const tuningResolved = tuning.map(name => ConfigLoader.resolveTuningProfile(name));
const fees = ConfigLoader.listFeeProfileNames();
const feeResolved = fees.map(name => ConfigLoader.resolveFeeProfile(name));
const parallel = ConfigLoader.getParallelBacktestConfig();
const matrix = ConfigLoader.getMatrixSweepConfig();
assert.deepEqual(tuning, Object.keys(canonicalSettings.tuningProfiles.definitions));
assert.deepEqual(fees, Object.keys(canonicalSettings.feeProfiles.definitions));
for (const profile of tuning) assert.deepEqual(tuningResolved[tuning.indexOf(profile)], canonicalSettings.tuningProfiles.definitions[profile]);
for (const profile of fees) assert.deepEqual(feeResolved[fees.indexOf(profile)], canonicalSettings.feeProfiles.definitions[profile]);
assert.deepEqual(parallel, canonicalInternals.tooling.parallelBacktest);
assert.deepEqual(matrix, canonicalInternals.tooling.matrixSweep);
result.accessors = { tuningProfiles: tuning, feeProfiles: fees,
  parallelMatchesCanonical: true, matrixMatchesCanonical: true };
result.checks.push('parallel, matrix, tuning-profile and fee-profile accessors resolve canonical fixture values');
console.log(JSON.stringify(result));
