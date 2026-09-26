'use strict';
// Real production methods with recorded candles, not a bot boot or a Jest count.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../../../../..');
const packet = path.resolve(__dirname, '..');
const clone = path.join(root, 'ogz-meta/inbox/codex/2026-09-26/mercury-exit-receipt/private/cold-pull-5gJPFK');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const git = args => execFileSync('git', args, { cwd: root, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }).toString();
function sourceClass(source) {
  const filename = path.join(clone, 'modules/DonchianBreakout.js');
  const compiled = new Module(filename, module);
  compiled.filename = filename; compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(source, filename); return compiled.exports;
}
const originalSource = git(['show', 'HEAD:modules/DonchianBreakout.js']);
const candidateSource = git(['show', ':modules/DonchianBreakout.js']);
const Original = sourceClass(originalSource); const Candidate = sourceClass(candidateSource);
const Loader = require(path.join(clone, 'foundation/ConfigLoader'));
// These syntactically valid inert strings are fixture inputs only. No service is constructed.
const snapshot = Loader.snapshot({ PROFILE: 'paper', WEBSOCKET_AUTH_TOKEN: 'fixture-no-network',
  ALPACA_API_KEY: 'fixture-no-network', ALPACA_API_SECRET: 'fixture-no-network' }, { loadDotenv: false, silent: true });
const Engine = require(path.join(clone, 'core/indicators/IndicatorEngine'));
const { IndicatorCalculator } = require(path.join(clone, 'core/IndicatorCalculator'));
const inputPath = path.join(root, 'tuning/tsla-15m-tiny.json');
const inputBytes = fs.readFileSync(inputPath); const candles = JSON.parse(inputBytes).candles;
const engine = new Engine({ ...snapshot.config.indicators.engine, symbol: 'TSLA', tf: '15m' });
const config = snapshot.config.strategies.DonchianBreakout;
const periods = [config.atrPeriod, 7, 14, 40];
const versions = periods.flatMap(period => [false, true].map(allowShorts => ({ period, allowShorts,
  original: new Original({ ...config, atrPeriod: period, allowShorts }),
  candidate: new Candidate({ ...config, atrPeriod: period, allowShorts }) })));
const receipts = [];
for (let i = 0; i < candles.length; i++) {
  const frame = engine.updateCandle(candles[i]);
  const history = candles.slice(0, i + 1); const ctx = { indicators: frame.indicators, priceHistory: history };
  for (const version of versions) {
    const before = version.original.evaluate(ctx); const after = version.candidate.evaluate(ctx);
    const withoutShared = version.candidate.evaluate({ priceHistory: history, indicators: {} });
    if (!before && !after) continue;
    const expectedAtr = IndicatorCalculator.calculateATR(history, version.period);
    const expectedStop = -(config.atrStopMult * expectedAtr / candles[i].c * 100);
    const distance = !after ? null : after.direction === 'buy'
      ? candles[i].c - after.exitContractHint.donchianChannelUpper
      : after.exitContractHint.donchianChannelLower - candles[i].c;
    const expectedConfidence = after ? Math.max(0, Math.min(1, 0.55 + Math.min(0.30,
      distance / expectedAtr * 0.15))) : null;
    receipts.push({ index: i, timestamp: candles[i].t, period: version.period,
      allowShorts: version.allowShorts, price: candles[i].c,
      sharedAtr: frame.indicators.atr, strategyAtr: expectedAtr,
      before, after, expectedStop, expectedConfidence,
      stopMatches: !!after && Math.abs(after.exitContractHint.stopLossPercent - expectedStop) < 1e-12,
      confidenceMatches: !!after && Math.abs(after.confidence - expectedConfidence) < 1e-12,
      sharedPresenceIrrelevant: JSON.stringify(after) === JSON.stringify(withoutShared) });
  }
}
const failed = receipts.filter(r => !r.stopMatches || !r.confidenceMatches || !r.sharedPresenceIrrelevant);
const summary = { at: new Date().toISOString(), head: git(['rev-parse', 'HEAD']).trim(),
  source: { originalSha256: hash(originalSource), candidateSha256: hash(candidateSource),
    configSha256: hash(fs.readFileSync(path.join(clone, 'config/settings.json'))) },
  input: { path: path.relative(root, inputPath), sha256: hash(inputBytes), candles: candles.length, symbol: 'TSLA', timeframe: '15m' },
  configuration: { fingerprint: snapshot.fingerprint, atrPeriod: config.atrPeriod,
    strategySource: snapshot.sources['strategies.DonchianBreakout.atrPeriod'], sharedPeriod: snapshot.config.indicators.engine.atrPeriod },
  observedSignals: receipts.length, failures: failed.length,
  affectedBefore: receipts.filter(r=>r.before && Math.abs(r.before.exitContractHint.stopLossPercent-r.expectedStop)>1e-12).length,
  periods: periods.map(period=>({ period, signals: receipts.filter(r=>r.period===period).length })),
  limits: ['Actual loader, IndicatorEngine and strategy evaluation only; not an orchestrator/engine boot, broker, deployment or profitability receipt.',
    'Parameter variants are explicit fixture configuration inputs; production settings are unchanged.',
    'Shared engine uses Wilder ATR; strategy-owned existing calculator uses trailing SMA ATR. Both period and smoothing can differ.'], receipts };
const destination = path.join(packet, 'donchian-both-directions.json');
fs.writeFileSync(destination, JSON.stringify(summary, null, 2)+'\n', { flag: 'wx' });
console.log(JSON.stringify({ output: path.relative(root, destination), signals: receipts.length, failed: failed.length,
  affectedBefore: summary.affectedBefore, example: receipts.find(r=>r.period===config.atrPeriod) }));
if (!receipts.length || failed.length) process.exitCode = 1;
