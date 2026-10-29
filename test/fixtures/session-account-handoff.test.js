'use strict';
require('./canonical-config-snapshot')();
const fs = require('fs');
const os = require('os');
const path = require('path');
const acorn = require('acorn');
const SessionRouter = require('../../core/SessionRouter');
const RiskManager = require('../../core/RiskManager');

// Execute the runner's real scope/identity methods without booting another bot.
const source = fs.readFileSync(path.join(__dirname, '../../run-empire-v2.js'), 'utf8');
const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true });
const runner = ast.body.find(n => n.type === 'ClassDeclaration' && n.id.name === 'OGZPrimeV14Bot');
const methods = ['isSessionRoutingActive', '_brokerIdForSession', '_assetClassForSession',
 'getCandleScopeEnvelope', 'cleanRuntimeAccountId', 'normalizeBrokerId', 'brokerIdFromAdapter',
 'promoteBrokerAccountIdentity', 'resolveBrokerAccountScope'];
const RunnerScope = new Function(`return class { ${methods.map(name => {
 const method = runner.body.body.find(n => n.key.name === name);
 return source.slice(method.start, method.end);
}).join('\n')} }`)();

test.each(['stocks', 'crypto'])('handoff hydrates %s with its broker account, then emits a consistent scope', async target => {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-account-handoff-'));
 const log = jest.spyOn(console, 'log').mockImplementation(() => {});
 const router = new SessionRouter({ mode: 'scheduled', stockSymbols: ['TSLA'],
  cryptoSymbols: ['BTC-USD'], forceCloseOnSessionEnd: false,
  transitionStoreOptions: { dir, staleLockMs: 60000 } });
 const adapter = brokerId => ({ getBrokerName: () => brokerId,
  getAccountIdentity: () => ({ brokerId, accountId: `fixture-${brokerId}`, accountIdSource: 'broker:fixture' }),
  getPositions: async () => [], getOpenOrders: async () => [], getBalance: async () => ({ total: 100 }),
  unsubscribeAll() {}, removeAllListeners() {}, removeListener() {}, on() {}, subscribeToCandles() {} });
 router.krakenAdapter = adapter('kraken'); router.alpacaAdapter = adapter('alpaca');
 const destination = target === 'stocks' ? router.alpacaAdapter : router.krakenAdapter;
 const origin = target === 'stocks' ? router.krakenAdapter : router.alpacaAdapter;
 const ctx = Object.assign(new RunnerScope(), { sessionRouter: router, sessionRouterConfig: { mode: 'scheduled' },
  config: { executionMode: 'paper', brokerId: origin.getBrokerName(), accountId: `fixture-${origin.getBrokerName()}`, accountIdSource: 'broker:fixture' },
  brokerAccountIdentities: new Map(), kraken: origin, candleTimeframe: '15m', evaluationTimeframes: ['15m'],
  riskManager: new RiskManager({ enabled: false }), tradingLoop: { waitForPendingOperations: async () => {} },
  patternChecker: { memory: { switchSessionScope: scope => ({ switched: true,
   storagePath: `/fixture/unified-patterns.paper.${scope.assetClass}.json`, mode: 'paper', assetBucket: scope.assetClass }) } } });
 const observed = [];
 ctx.hydrateActiveTimeframeFromRest = async () => {
  const scope = ctx.getCandleScopeEnvelope({ timeframe: '15m' });
  expect(ctx.kraken).toBe(destination);
  expect(scope.accountId).toBe(`fixture-${destination.getBrokerName()}`);
  observed.push(scope);
 };
 router.ctx = ctx; router.onOhlcCallback = () => {};
 let paused = false;
 router.stateManager = { state: { activeTrades: new Map() }, isPaused: () => paused,
  pauseTrading: async () => { paused = true; }, resumeTrading: async () => { paused = false; },
  resumeTradingIfPausedBy: async () => { paused = false; return { success: true }; },
  setDashboardRuntimeScope: scope => ({ ...scope, scopeComplete: true }) };
 router.activeSession = target === 'stocks' ? 'crypto' : 'stocks'; router.activeBroker = origin;
 const emitted = []; router.on('transition', event => emitted.push(event));
 try {
  await (target === 'stocks' ? router._transitionToStocks(new Date()) : router._transitionToCrypto(new Date()));
  expect(router.failedSafeMode).toBe(false);
  expect(observed).toHaveLength(1);
  expect(emitted).toHaveLength(1);
  expect(emitted[0].runtimeScope.accountId).toBe(observed[0].accountId);
  expect(router.transitionStore.readStatus().state).toBe('TARGET_ACTIVATED');
 } finally { log.mockRestore(); fs.rmSync(dir, { recursive: true, force: true }); }
});
