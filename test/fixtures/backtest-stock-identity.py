"""Isolated stock identity regression; SYNTHETIC mechanics, not performance data.

Optional first argument: private committed-source overlay JSON. Restoration is
confined to the mandatory disposable namespace; candidate identity files remain.
Remaining arguments select symbols (default AAPL).
"""
import importlib.util
import json
import os
from pathlib import Path
import sys

root = Path.cwd()
marker = json.loads(Path('/run/ogz-helper-isolation.json').read_text())
assert marker['projectRoot'] == str(root)
assert all(os.readlink(f'/proc/self/ns/{k}') != v for k, v in marker['hostNamespaces'].items())
args = sys.argv[1:]
if args and args[0].endswith('.json'):
    overlay = json.loads(Path(args.pop(0)).read_text())['overlay']
    for name, source in overlay.items():
        if name == 'CHANGELOG.md':
            continue
        assert name not in ('core/BacktestRunner.js', 'core/DataFileInstrument.js')
        target = root / name
        assert target.resolve().is_relative_to(root) and not target.is_symlink()
        target.write_text(source)

spec = importlib.util.spec_from_file_location('matrix', root / 'tools/backtest-matrix.py')
assert spec is not None and spec.loader is not None
matrix = importlib.util.module_from_spec(spec)
spec.loader.exec_module(matrix)
matrix.require_isolation()
settings = json.loads((root / 'config/settings.json').read_text())
if args == ['scope']:
    import subprocess
    native = r"""
const assert = require('assert');
const loader = require('./foundation/ConfigLoader');
loader.load({loadDotenv:false, silent:true});
const Runner = require('./core/BacktestRunner');
const receiver = {ctx:{runtimeConfig:{execution:{assetClass:'stocks', broker:'alpaca'}}}};
const check = (file, symbol, timeframe) => Runner.prototype._assertDataFileMatchesRuntimeScope.call(receiver, file, symbol, timeframe);
const instruments = require('./core/DataFileInstrument');
// Exercise the unchanged public legacy producer, descriptor validation, then
// native runner admission: suffix tokens are not a second canonical symbol.
const fs = require('fs');
const path = require('path');
const worker = require('./tools/backtest-worker-env');
const file = 'tsla-custom-15m.json';
fs.writeFileSync(file, '[]');
const descriptor = worker.buildBacktestRunDescriptor({
  projectRoot: process.cwd(), dataFile: file, stateFile: 'identity-state.json',
  dataDir: 'identity-data', reportTag: 'identity-legacy', outputDir: 'identity-reports',
  feeProfileName: 'ttp_real', freshStart: true,
});
assert.equal(descriptor.identity.tradingPair, 'TSLA');
fs.writeFileSync('identity-descriptor.json', JSON.stringify(descriptor));
const descriptorPath = path.resolve('identity-descriptor.json');
const receipt = loader.snapshot({BACKTEST_RUN_DESCRIPTOR_PATH:descriptorPath}, {
  role:'bot', loadDotenv:false, silent:true, runDescriptorPath:descriptorPath,
});
assert.deepEqual(receipt.errors, []);
const produced = {ctx:{runtimeConfig:receipt.config}};
console.log('LEGACY_PRODUCER_IDENTITY ' + JSON.stringify(descriptor.identity));
Runner.prototype._assertDataFileMatchesRuntimeScope.call(produced, file, 'TSLA', '15m');
assert.equal(instruments.deriveReportAssetSlugFromDataFile(file, receipt.config.execution), 'TSLA');
assert.throws(() => Runner.prototype._assertDataFileMatchesRuntimeScope.call(produced, file, 'TSLA-CUSTOM', '15m'), /refusing mislabeled backtest/);
assert.throws(() => Runner.prototype._assertDataFileMatchesRuntimeScope.call(produced, file, 'NVDA', '15m'), /refusing mislabeled backtest/);
assert.throws(() => Runner.prototype._assertDataFileMatchesRuntimeScope.call(produced, file, 'TSLA', '5m'), /refusing mismatched backtest/);
console.log('LEGACY_PRODUCER_TO_RUNNER_PASS');
for (const symbol of ['TSLA','RIOT','MARA','AAPL','NVDA','ZZZTEST','BTC','BRK-B']) {
  check(`${symbol.toLowerCase()}-15m.json`, symbol, '15m');
  assert.equal(instruments.deriveReportAssetSlugFromDataFile(`${symbol.toLowerCase()}-15m.json`, receiver.ctx.runtimeConfig.execution), symbol);
}
// Legacy grammar has a single answer independent of the requested symbol.
assert.equal(instruments.resolveInstrumentFromDataFile('tsla-custom-15m.json', {assetClass:'stocks', broker:'alpaca', tradingPair:'TSLA-CUSTOM'}).tradingPair, 'TSLA');
assert.throws(() => check('tsla-custom-15m.json', 'TSLA-CUSTOM', '15m'), /refusing mislabeled backtest/);
assert.throws(() => check('zzztest-custom-15m.json', 'ZZZTEST', '15m'), /refusing mislabeled backtest/);
assert.throws(() => check('tsla-usd-15m.json', 'TSLA', '15m'), /refusing mislabeled backtest/);
check('kraken/tsla-15m.json', 'TSLA', '15m');
const crypto = {ctx:{runtimeConfig:{execution:{broker:'kraken', assetClass:'crypto'}}}};
Runner.prototype._assertDataFileMatchesRuntimeScope.call(crypto, 'polygon-btc-15m.json', 'XBT/USD', '15m');
assert.throws(() => Runner.prototype._assertDataFileMatchesRuntimeScope.call(crypto, 'polygon-btc-15m.json', 'ETH-USD', '15m'), /refusing mislabeled backtest/);
assert.throws(() => check('nvda-15m.json', 'AAPL', '15m'), /refusing mislabeled backtest/);
assert.throws(() => check('aapl-5m.json', 'AAPL', '15m'), /refusing mismatched backtest/);
assert.throws(() => check('aapl-usd-15m.json', 'AAPL', '15m'), /refusing mislabeled backtest/);
assert.throws(() => check('brk.b-15m.json', 'BRK.B', '15m'), /Cannot derive ticker/);
assert.equal(instruments.resolveInstrumentFromDataFile('tsla-15m-2y.json').tradingPair, 'TSLA');
assert.equal(instruments.resolveInstrumentFromDataFile('polygon-btc-1y.json').tradingPair, 'BTC-USD');
assert.throws(() => instruments.resolveInstrumentFromDataFile('zzztest-15m.json'), /Cannot derive asset class/);
const legacy = {ctx:{}};
Runner.prototype._assertDataFileMatchesRuntimeScope.call(legacy, 'polygon-btc-15m.json', 'XBT/USD', '15m');
console.log('SCOPE_AND_LEGACY_REGRESSIONS_PASS');
"""
    environment = dict(os.environ)
    for key in ['ALPACA_API_KEY', 'ALPACA_API_SECRET', 'KRAKEN_API_KEY', 'KRAKEN_API_SECRET', 'WEBSOCKET_AUTH_TOKEN']:
        environment[key] = 'offline-unusable-no-network'
    sys.exit(subprocess.run(['node', '-e', native], env=environment).returncode)
for symbol in args or ['AAPL']:
    (root / 'config/settings.json').write_text(json.dumps(settings))
    plan = json.loads((root / 'tools/backtest-matrix.example.json').read_text())
    plan.update(confidence=[0.4], atrMinPercent=[0.1])
    plan['stopLoss']['values'] = [-0.5]
    plan['identity'].update(tradingPair=symbol, symbols=[symbol])
    candles = [dict(timestamp=1704205800000, open=10, high=11, low=9,
                    close=10.5, volume=10000, symbol=symbol, timeframe='15m', complete=True)]
    if symbol == 'BRK.B':
        try:
            matrix.validate_plan(plan, settings)
        except ValueError as error:
            assert str(error) == 'tradingPair must be a canonical ticker or pair'
            print('DOTTED_SYMBOL_UNSUPPORTED ' + str(error), flush=True)
            continue
        raise AssertionError('Dotted symbol unexpectedly accepted')
    cells = matrix.validate_plan(plan, settings)
    matrix.validate_candles(candles, plan['identity'])
    for field, wrong in [('symbol', 'OTHER'), ('timeframe', '5m')]:
        try:
            matrix.validate_candles([{**candles[0], field: wrong}], plan['identity'])
        except ValueError as error:
            assert str(error) == f'candle[0].{field} conflicts with identity'
        else:
            raise AssertionError(f'{field} mismatch accepted')
    result = matrix.run_cell(dict(plan=plan, cell=cells[0], candles=candles))
    print('SYNTHETIC_IDENTITY_RESULT ' + json.dumps(dict(symbol=symbol, result=result)), flush=True)
    assert result['runnerExitCode'] == 0, (symbol, result.get('failure'))
    assert result['status'] == 'no_trades', (symbol, result.get('failure'))
    assert result['report']['dataCoverage']['symbol'] == symbol
    assert result['report']['dataCoverage']['complete'] is True
print('STOCK_IDENTITY_PASS', flush=True)
