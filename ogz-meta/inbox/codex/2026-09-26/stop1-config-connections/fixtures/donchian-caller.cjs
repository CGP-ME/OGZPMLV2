'use strict';
// Observe the actual registered per-symbol strategy closure, not a copied caller.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../../../../..');
const packet = path.resolve(__dirname, '..');
const clone = path.join(root, 'ogz-meta/inbox/codex/2026-09-26/mercury-exit-receipt/private/cold-pull-5gJPFK');
process.env.PROFILE = 'paper';
process.env.WEBSOCKET_AUTH_TOKEN = 'fixture-no-network';
process.env.ALPACA_API_KEY = 'fixture-no-network';
process.env.ALPACA_API_SECRET = 'fixture-no-network';
const Loader = require(path.join(clone, 'foundation/ConfigLoader'));
const snapshot = Loader.load({ loadDotenv: false, silent: true });
const { StrategyOrchestrator } = require(path.join(clone, 'core/StrategyOrchestrator'));
const IndicatorEngine = require(path.join(clone, 'core/indicators/IndicatorEngine'));
const { IndicatorCalculator } = require(path.join(clone, 'core/IndicatorCalculator'));
const orchestrator = new StrategyOrchestrator({ mtfBaseTimeframe: '15m' });
const registered = orchestrator.strategies.find(s => s.name === 'DonchianBreakout');
const engine = new IndicatorEngine({ ...snapshot.config.indicators.engine, symbol: 'TSLA', tf: '15m' });
const input = fs.readFileSync(path.join(root, 'tuning/tsla-15m-tiny.json'));
const candles = JSON.parse(input).candles;
const receipts = [];
for (let i = 0; i < candles.length; i++) {
  const snapshotFrame = engine.updateCandle(candles[i]);
  const history = candles.slice(0, i + 1);
  const result = registered.evaluate({ indicators: snapshotFrame.indicators, priceHistory: history,
    extras: { symbol: 'TSLA', timeframe: '15m' } });
  if (!result) continue;
  const cfg = snapshot.config.strategies.DonchianBreakout;
  const expected = -cfg.atrStopMult * IndicatorCalculator.calculateATR(history, cfg.atrPeriod) / candles[i].c * 100;
  receipts.push({ index: i, timestamp: candles[i].t, result, expectedStop: expected,
    matches: Math.abs(expected - result.exitContractHint.stopLossPercent) < 1e-12 });
}
const receipt = { at: new Date().toISOString(), source: Object.fromEntries([
  'modules/DonchianBreakout.js', 'core/StrategyOrchestrator.js', 'foundation/ConfigLoader.js',
  'core/IndicatorCalculator.js', 'core/indicators/IndicatorEngine.js', 'config/settings.json'
].map(file=>[file, crypto.createHash('sha256').update(fs.readFileSync(path.join(clone,file))).digest('hex')])),
  configuration: { fingerprint: snapshot.fingerprint, period: snapshot.config.strategies.DonchianBreakout.atrPeriod,
    source: snapshot.sources['strategies.DonchianBreakout.atrPeriod'] },
  inputSha256: crypto.createHash('sha256').update(input).digest('hex'), candleCount: candles.length,
  moduleScopes: [...orchestrator.symbolStrategyModules.keys()], signals: receipts.length,
  failures: receipts.filter(r=>!r.matches).length, receipts,
  limits: 'Real registered strategy closure, canonical config and IndicatorEngine on recorded TSLA candles; not full Orchestrator.evaluate, bot, broker, UI, live position or deployment acceptance.' };
fs.writeFileSync(path.join(packet, 'donchian-caller.json'), JSON.stringify(receipt,null,2)+'\n', { flag:'wx' });
console.log(JSON.stringify({ signals:receipt.signals, failures:receipt.failures, scopes:receipt.moduleScopes }));
if (!receipts.length || receipt.failures) process.exitCode=1;
