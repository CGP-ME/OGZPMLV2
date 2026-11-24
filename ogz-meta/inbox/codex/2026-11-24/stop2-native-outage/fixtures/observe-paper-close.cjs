'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
require(path.join(process.cwd(), 'test/helpers/require-isolation.cjs'))();
const root = process.cwd();
if (process.argv.includes('--candidate')) {
  const candidate = JSON.parse(fs.readFileSync(path.join(__dirname, 'candidate-sources.json'), 'utf8'));
  for (const [name, source] of Object.entries(candidate.files)) fs.writeFileSync(name, source);
  console.log('CANDIDATE_TREE ' + candidate.tree);
}
// Fixture strategy selection, changed only within the disposable source snapshot.
const settings = JSON.parse(fs.readFileSync('config/settings.json', 'utf8'));
settings.launchProfiles.paper.strategies.soloFilter = ['CandlePattern'];
fs.writeFileSync('config/settings.json', JSON.stringify(settings));
const env = path.join(__dirname, 'synthetic.env');
fs.writeFileSync(env, 'ALPACA_API_KEY=synthetic\nALPACA_API_SECRET=synthetic\nKRAKEN_API_KEY=synthetic\nKRAKEN_API_SECRET=synthetic\nWEBSOCKET_AUTH_TOKEN=synthetic\n');
process.env.PROFILE = 'paper';
process.env.DOTENV_CONFIG_PATH = env;
const ConfigLoader = require(path.join(root, 'foundation/ConfigLoader'));
ConfigLoader.load({ role: 'bot', silent: true });
const stateManager = require(path.join(root, 'core/StateManager')).getInstance();
stateManager.initializeFreshState(100000, { source: 'isolated_scoped_close_observation' });
const { StrategyOrchestrator } = require(path.join(root, 'core/StrategyOrchestrator'));
const OrderExecutor = require(path.join(root, 'core/OrderExecutor'));
const TradingLoop = require(path.join(root, 'core/TradingLoop'));
const SessionRouter = require(path.join(root, 'core/SessionRouter'));
const trace = require(path.join(root, 'core/TraceSpine'));
const start = Date.now() - 240 * 60000;
const candles = Array.from({ length: 240 }, (_, i) => ({ t: start + i * 60000, o: 100 + i * .01, h: 100.1 + i * .01, l: 99.9 + i * .01, c: 100.02 + i * .01, v: 1000, timeframe: '1m' }));
const price = candles.at(-1).c;
const indicators = { atr: 1, volatility: .01, ema9: price - .02, ema20: price - .1, ema50: price - .2, ema200: price - .8, rsi: 50, rsi2: 50, trend: 'uptrend' };
const patterns = [{ name: 'fixture-bearish-pattern', type: 'shooting_star', direction: 'bearish', confidence: .99 }];
const orchestrator = new StrategyOrchestrator({ mtfBaseTimeframe: '1m' });
const logs = [];
const scope = { brokerId: 'alpaca', accountId: 'fixture-alpaca', accountIdSource: 'fixture', assetClass: 'stocks', executionMode: 'paper', timeframe: '1m' };
const ctx = {
  config: scope, executionMode: 'paper', paperTrading: true, backtestMode: false,
  backtestFast: true, tradingPair: 'NVDA', stateManager,
  runner: { getSymbolTimeframeContext: () => ({ priceHistory: candles, marketData: ctx.marketData }) },
  marketData: { price, timestamp: candles.at(-1).t },
  orderRouter: { sendOrder: async () => { throw new Error('Synthetic paper observation must not send a broker order'); } },
  notifyTrade: async () => {}, discordNotifier: { notifyTrade() {} },
  performanceAnalyzer: { processTrade: trade => logs.push({ completedTrade: trade }) },
  logTrade: trade => logs.push({ trade }),
};
const executor = new OrderExecutor(ctx);
ctx.executeTrade = executor.executeTrade.bind(executor);
const router = new SessionRouter({ mode: 'static', staticSession: 'stocks', stockSymbols: ['NVDA', 'TSLA'], cryptoSymbols: ['BTC-USD'], executeTrade: ctx.executeTrade, transitionStoreOptions: { dir: path.join(__dirname, 'close-transition'), staleLockMs: 30000 } });
const runnerSource = fs.readFileSync('run-empire-v2.js', 'utf8');
const ast = require('acorn').parse(runnerSource, { ecmaVersion: 'latest' });
const classNode = ast.body.find(n => n.type === 'ClassDeclaration' && n.id.name === 'OGZPrimeV14Bot');
const method = classNode.body.body.find(n => n.key.name === '_quarantineCandleDataSymbol');
const bot = { sessionRouter: router, candleTimeframe: '1m', config: { ...ConfigLoader.load({ role: 'bot', silent: true }).config, executionMode: 'paper' } };
const quarantine = vm.runInNewContext('({' + runnerSource.slice(method.start, method.end) + '})', { stateManager, console, ...trace })._quarantineCandleDataSymbol.bind(bot);
bot._quarantineCandleDataSymbol = quarantine;
const queue = Object.create(TradingLoop.prototype);
queue.symbolOperationQueues = new Map();
queue.analyzingSymbols = new Set();
bot.tradingLoop = queue;
bot._getSilentNativeFrames = () => [];
const recoveryMethod = classNode.body.body.find(n => n.key.name === '_resolveCandleDataHalt');
const resolveRecovery = vm.runInNewContext('({' + runnerSource.slice(recoveryMethod.start, recoveryMethod.end) + '})', {
  stateManager, console, ...trace, normalizeRuntimeSymbol: value => value,
})._resolveCandleDataHalt.bind(bot);
const broker = { fromBrokerSymbol: symbol => symbol,
  getAccountIdentity: () => ({ brokerId: 'alpaca', accountId: 'fixture-alpaca', accountIdSource: 'fixture' }),
  getPositions: async () => [], getOpenOrders: async () => [], getBalance: async () => ({ USD: 100000 }), config: { mode: 'paper' } };
const recoveryFrames = () => [{ timeframe: '1m', timeframeMs: 60000, scopeEnvelope: scope,
  restRequestStartedAt: Date.now(), candles: [{ etime: Date.now() - 30000 }] }];
const loopSource = fs.readFileSync('core/TradingLoop.js', 'utf8');
const from = loopSource.indexOf('        const allResults = this._ledgerAllResults(orchResult);');
const to = loopSource.indexOf('\n      }', from);
assert.ok(from >= 0 && to > from);
const makeLedger = vm.runInThisContext('(function(ConfigLoader,positionEffectFromAction,decision,orchResult,marketData,symbol,analysisTimeframe,indicators,confidence,riskGates){' + loopSource.slice(from, to) + '})');
const loop = Object.create(TradingLoop.prototype);
loop._patternScope = symbol => ({ ...scope, symbol });
async function enter(symbol) {
  const scopedCandles = candles.map(c => ({ ...c, ...scope, symbol, etime: c.t + 60000 }));
  for (const candle of scopedCandles) orchestrator.ingestMarketCandle(symbol, candle);
  const mtf = orchestrator.captureDecisionMtf(symbol, scopedCandles.at(-1));
  const orch = orchestrator.evaluate(indicators, patterns, { currentRegime: 'uptrend', confidence: .8 }, scopedCandles, { symbol, timeframe: '1m', price, mtf });
  assert.equal(orch.winnerStrategy, 'CandlePattern');
  const decision = { action: 'SELL_SHORT', confidence: orch.confidence, traceId: 'fixture-' + symbol, signalId: 'signal-' + symbol, decisionId: 'decision-' + symbol };
  makeLedger.call(loop, ConfigLoader, require(path.join(root, 'core/PositionEffect')).positionEffectFromAction, decision, orch, ctx.marketData, symbol, '1m', indicators, orch.confidence / 100, []);
  const result = await executor.executeTrade(decision, { totalConfidence: orch.confidence }, price, indicators, patterns, null, orch, symbol, '1m', { priceHistory: scopedCandles, marketData: ctx.marketData });
  assert.equal(result.success, true, JSON.stringify(result));
  stateManager.updateLastPrice(symbol, price, ctx.marketData.timestamp);
  return result;
}
async function main() {
  const nvda = await enter('NVDA');
  const tsla = await enter('TSLA');
  const stale = process.argv.includes('--stale');
  if (stale) stateManager.state.lastPriceTimes.set('NVDA', Date.now() - 86400000);
  ctx.marketData.timestamp += 60000;
  const result = await quarantine('NVDA', '1m', 'synthetic native stream unavailable', scope, 'unavailable', { code: 'native_feed_unavailable', scopeIsCurrent: () => true });
  const repeated = await quarantine('NVDA', '1m', 'repeated outage observation', scope, 'unavailable', { code: 'native_feed_unavailable', scopeIsCurrent: () => true });
  assert.equal(repeated.closedTrades.length, 0, 'repeated outage must not create a duplicate close');
  const saved = JSON.parse(fs.readFileSync(ConfigLoader.get('paths.stateFile'), 'utf8'));
  const positions = Array.from(stateManager.get('activeTrades').values());
  assert.equal(result.symbolHalted, true);
  if (stale) {
    assert.equal(result.closedTrades.length, 0);
    assert.equal(result.closeFailures[0].reason, 'current_exit_price_unavailable');
    assert.equal(positions.length, 2);
    assert.equal(stateManager.get('closedTrades').length, 0);
    assert.equal(stateManager.isPaused(), false);
    assert.equal(stateManager.isSymbolHalted('TSLA'), false);
    console.log('STALE_PRICE_RECEIPT ' + JSON.stringify({ result, remainingSymbols: positions.map(t => t.symbol), globalPause: stateManager.isPaused(), actualPaperExecutor: true }));
    const waiting = await resolveRecovery('NVDA', recoveryFrames(), broker, () => true, 'native_feed_unavailable');
    assert.equal(waiting.status, 'pending');
    assert.equal(stateManager.getTradesBySymbol('NVDA').length, 1);
    stateManager.updateLastPrice('NVDA', price, Date.now());
    const recovered = await resolveRecovery('NVDA', recoveryFrames(), broker, () => true, 'native_feed_unavailable');
    assert.equal(recovered.status, 'recovered', JSON.stringify(recovered));
    assert.equal(stateManager.getTradesBySymbol('NVDA').length, 0);
    assert.equal(stateManager.getTradesBySymbol('TSLA').length, 1);
    assert.equal(stateManager.isSymbolHalted('NVDA'), false);
    const savedAfter = JSON.parse(fs.readFileSync(ConfigLoader.get('paths.stateFile'), 'utf8'));
    assert.equal(new Map(savedAfter.activeTrades).has(nvda.orderId), false);
    assert.equal(new Map(savedAfter.activeTrades).has(tsla.orderId), true);
    const closedAfter = stateManager.get('closedTrades');
    assert.equal(closedAfter.length, 1);assert.equal(closedAfter[0].symbol, 'NVDA');
    console.log('POSITION_RECOVERY_RECEIPT ' + JSON.stringify({ waiting, recovered,
      remainingSymbols: stateManager.getAllTrades().map(trade => trade.symbol),
      recordedClose: logs.map(row => row.trade).find(trade => trade?.symbol === 'NVDA' && trade.type === 'COVER'),
      actualPaperExecutor: true, actualStatePersistence: true,
      limits: ['Recovery frame and broker REST collaborators are synthetic; the actual strategy, paper executor, exit intent and saved-position owners execute inside isolation. No live fills or activation.'] }));
    return;
  }
  assert.equal(result.closedTrades.length, 1);
  assert.equal(result.closeFailures.length, 0, JSON.stringify(result));
  assert.equal(result.remainingTradeIds.length, 0);
  assert.equal(positions.length, 1);
  assert.equal(positions[0].symbol, 'TSLA');
  assert.equal(stateManager.isSymbolHalted('TSLA'), false);
  assert.equal(stateManager.isPaused(), false);
  const closed = stateManager.get('closedTrades');
  assert.equal(closed.length, 1);
  assert.equal(closed[0].symbol, 'NVDA');
  const closeLog = logs.map(row => row.trade).find(trade => trade && trade.symbol === 'NVDA' && trade.type === 'COVER');
  console.log('SCOPED_CLOSE_LOG ' + JSON.stringify(closeLog));
  assert.ok(closeLog, 'actual executor must record its scoped close');
  assert.ok(new Map(saved.activeTrades).has(tsla.orderId));
  assert.equal(new Map(saved.activeTrades).has(nvda.orderId), false);
  console.log('SCOPED_CLOSE_RECEIPT ' + JSON.stringify({
    result, positions: positions.map(t => ({ id: t.id, symbol: t.symbol, direction: t.direction })),
    closed: closed.map(t => ({ symbol: t.symbol, direction: t.direction, exitPrice: t.exitPrice })), closeLog,
    savedHalt: saved.symbolEntryHalts.NVDA, globalPause: stateManager.isPaused(),
    actualStrategyAndExecutor: true, actualStatePersistence: true,
    limits: ['Synthetic prices and in-sandbox paper fills; not a live broker fill or live activation receipt.', 'Exact quarantine method and ledger producer extracted from the source AST/text; no whole-bot startup in this observation.', 'Fixture selects CandlePattern; notification and journal callback collaborators are captured locally.'],
  }));
}
main().finally(() => {
  orchestrator.mtfAdapter.destroy();
  for (const bySymbol of orchestrator.symbolStrategyModules.values()) for (const byFrame of bySymbol.values()) for (const module of byFrame.values()) if (typeof module.destroy === 'function') module.destroy();
}).catch(error => { console.error(error); process.exitCode = 1; });
