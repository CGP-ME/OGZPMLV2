"""Native observations of the new matrix. Synthetic input; no trading claims."""
import importlib.util
import json
from pathlib import Path

root = Path.cwd()
source = root / 'tools/backtest-matrix.py'
assert source.exists(), 'New confidence x ATR x stop-loss matrix is not implemented'
spec = importlib.util.spec_from_file_location('matrix', source)
assert spec is not None and spec.loader is not None
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
plan = {'confidence': [0.4, 0.6, 0.4], 'atrMinPercent': [0.1, 0.3],
        'stopLoss': {'values': [-0.5, -1], 'paths': ['exitContracts.EMASMACrossover.stopLossPercent'], 'unit': 'percent'}}
cells = m.expand_grid(plan)
assert len(cells) == 8, cells
assert len({c['id'] for c in cells}) == 8
assert cells[0]['confidence'] == 0.4 and cells[-1]['stopLoss'] == -1
assert m.expand_grid(plan) == cells
print(json.dumps({'observation': 'unique deterministic three-axis grid', 'cells': len(cells)}))
settings = json.loads((root / 'config/settings.json').read_text())
original = json.loads(json.dumps(settings))
plan.update({'baseProfile': 'paper', 'strategies': ['EMASMACrossover'],
             'identity': {'broker': 'alpaca', 'assetClass': 'stocks', 'tradingPair': 'TSLA', 'symbols': ['TSLA'], 'candleTimeframe': '15m'},
             'feeProfile': 'ttp_real'})
assert hasattr(m, 'prepare_settings'), 'Matrix must derive operational behavior rather than use the old backtest profile'
prepared, receipt = m.prepare_settings(settings, plan, cells[0])
assert settings == original, 'Cannot mutate operator settings'
p = prepared['launchProfiles']['matrix-replay']
assert p['strategyBehavior'] == settings['launchProfiles']['paper']['strategyBehavior']
assert p['confluence'] == settings['launchProfiles']['paper']['confluence']
assert p['pipeline'] == settings['launchProfiles']['paper']['pipeline']
assert p['venueGuards'] == settings['launchProfiles']['paper']['venueGuards']
assert p['mode'] == 'backtest' and p['confidence']['minTradeConfidence'] == 0.4
assert prepared['filters']['atrMinPercent'] == 0.1
assert prepared['exitContracts']['EMASMACrossover']['stopLossPercent'] == -0.5
assert prepared['exitContracts']['EMASMACrossover']['minConfidence'] == 0.4
assert prepared['trai'] == settings['trai'] and prepared['features'] == settings['features']
assert receipt['baseProfile'] == 'paper'
print(json.dumps({'observation': 'operational behavior preserved; only named dimensions and replay transport change', 'receipt': receipt}))
assert hasattr(m, 'validate_candles'), 'Matrix must reject malformed market input before dispatch'
valid = [{'timestamp': 1793629800000, 'open': 10, 'high': 11, 'low': 9, 'close': 10, 'volume': 30}]
assert m.validate_candles(valid, plan['identity']) == valid
for invalid in ([], valid + valid, [{**valid[0], 'close': 12}], [{**valid[0], 'volume': -1}], [{**valid[0], 'symbol': 'NVDA'}]):
    try:
        m.validate_candles(invalid, plan['identity'])
    except ValueError:
        pass
    else:
        raise AssertionError(f'Malformed candles admitted: {invalid}')
assert hasattr(m, 'validate_plan'), 'Plan schema must reject unknown/misspelled axes'
m.validate_plan(plan, settings)
try:
    m.validate_plan({**plan, 'confidnce': [0.7]}, settings)
except ValueError:
    pass
else:
    raise AssertionError('Misspelled/extra axes silently accepted')
assert hasattr(m, 'consumer_evidence'), 'Persist observed policy values and mismatches, not just requested settings'
trade = {'tradeId': 'synthetic', 'strategyName': 'EMASMACrossover', 'frozenExitPolicy': {'contract': {
    'stopLossPercent': -0.5, 'minConfidence': 0.4, 'atrMinPercent': 0.1}}}
evidence = m.consumer_evidence({'trades': [trade]}, plan, cells[0])
assert evidence['observedTrades'] == 1 and evidence['mismatches'] == []
trade['frozenExitPolicy']['contract']['stopLossPercent'] = -2
assert m.consumer_evidence({'trades': [trade]}, plan, cells[0], {
    'exitContracts.EMASMACrossover.stopLossPercent': -0.5,
    'exitContracts.EMASMACrossover.profitManagement.contractVolatilityAdjustment':
        settings['exitContracts']['EMASMACrossover']['profitManagement']['contractVolatilityAdjustment']})['mismatches']
assert m.consumer_evidence({'trades': []}, plan, cells[0])['status'] == 'no_trade_policy_evidence'
# Exercise native contract construction and persisted PolicyBuilder shape, not
# a made-up profitManagement subtree inside the frozen contract.
import subprocess
native = subprocess.run(['node', '-e', r'''
require('./foundation/ConfigLoader').load({loadDotenv: false, silent: true});
const {ExitContractManager} = require('./core/ExitContractManager');
const PolicyBuilder = require('./core/PolicyBuilder');
const ecm = new ExitContractManager();
const base = ecm.getDefaultContract('EMASMACrossover', {timeframe: '15m'});
const adjustment = base.profitManagement.contractVolatilityAdjustment;
const contracts = [0, adjustment.threshold, adjustment.threshold + 1].map(volatility =>
  PolicyBuilder.normalizeContract('EMASMACrossover', ecm.createExitContract(
    'EMASMACrossover', {}, {timeframe: '15m', volatility})));
// This is the native consumer of the TPO structural override emitted by
// StrategyOrchestrator (1984, 2427, 2917): it supersedes configured percent.
const tpoBase = ecm.getDefaultContract('OGZTPO', {timeframe: '15m'}).stopLossPercent;
const tpoSignalStop = tpoBase / 2;
const tpo = PolicyBuilder.normalizeContract('OGZTPO', ecm.createExitContract(
  'OGZTPO', {stopLossPercent: tpoSignalStop}, {timeframe: '15m', volatility: 0}));
console.log('NATIVE_STOP_FACTS ' + JSON.stringify({base: base.stopLossPercent, adjustment, contracts,
  tpoBase, tpoSignalStop, tpo}));
'''], cwd=root, text=True, capture_output=True, env={**__import__('os').environ,
    'ALPACA_API_KEY': 'offline-unusable-no-network', 'ALPACA_API_SECRET': 'offline-unusable-no-network',
    'KRAKEN_API_KEY': 'offline-unusable-no-network', 'KRAKEN_API_SECRET': 'offline-unusable-no-network',
    'WEBSOCKET_AUTH_TOKEN': 'offline-unusable-no-network'})
assert native.returncode == 0, native.stdout + native.stderr
facts = json.loads(next(line.removeprefix('NATIVE_STOP_FACTS ') for line in native.stdout.splitlines()
                        if line.startswith('NATIVE_STOP_FACTS ')))
assert facts['tpo']['stopLossPercent'] == facts['tpoSignalStop'] != facts['tpoBase']
assert facts['contracts'][0]['stopLossPercent'] == facts['base']
assert facts['contracts'][1]['stopLossPercent'] == facts['base']
assert facts['contracts'][2]['stopLossPercent'] == facts['base'] * facts['adjustment']['stopMultiplier']
assert 'profitManagement' not in facts['contracts'][2]
vol_cell = {**cells[0], 'stopLoss': facts['base']}
resolved = {'exitContracts.EMASMACrossover.stopLossPercent': facts['base'],
            'exitContracts.EMASMACrossover.profitManagement.contractVolatilityAdjustment': facts['adjustment']}
for contract in facts['contracts']:
    contract.update(minConfidence=vol_cell['confidence'], atrMinPercent=vol_cell['atrMinPercent'])
    persisted = {'tradeId': 'native-contract', 'strategyName': 'EMASMACrossover',
                 'frozenExitPolicy': {'contract': contract}}
    # No contract-creation volatility is persisted: allowed outcomes are bounded,
    # but matching the multiplier must NOT claim the trigger was proven.
    result = m.consumer_evidence({'trades': [persisted]}, plan, vol_cell, resolved)
    assert not result['mismatches'], result
    stop = result['stopChecks'][0]
    assert stop['resolvedBase'] == facts['base']
    assert stop['effectiveObserved'] == contract['stopLossPercent']
    assert stop['status'] == 'compatible_trigger_unverified', stop
bad = json.loads(json.dumps(persisted))
bad['frozenExitPolicy']['contract']['stopLossPercent'] = -2
assert m.consumer_evidence({'trades': [bad]}, plan, vol_cell, resolved)['mismatches']
wrong_base = {**resolved, 'exitContracts.EMASMACrossover.stopLossPercent': -3}
assert m.consumer_evidence({'trades': [persisted]}, plan, vol_cell, wrong_base)['mismatches']
missing = m.consumer_evidence({'trades': [persisted]}, plan, vol_cell)
assert missing['stopChecks'][0]['status'] == 'unverified_missing_resolved_adjustment'
assert missing['status'] == 'partially_verified'
assert m.consumer_evidence({'trades': []}, plan, vol_cell, resolved)['status'] == 'no_trade_policy_evidence'
print(json.dumps({'observation': 'native base/effective stop chain; bounded widening; missing trigger disclosed'}))
# Admission must fail before dispatch (including a would-be zero-trade cell).
owner_cases = {'EMASMACrossover': ('stopLossPercent', 'percent', -0.7),
               'MADynamicSR': ('stopLossPercent', 'percent', -0.7),
               'CandlePattern': ('stopLossPercent', 'percent', -0.7),
               'MarketRegime': ('stopLossPercent', 'percent', -0.7),
               'RSI': ('stopLossPercent', 'percent', -0.7),
               'RSI2MeanReversion': ('stopLossPercent', 'percent', -0.7),
               'DonchianBreakout': ('atrStopMult', 'atr_multiple', 2),
               'PropSafeEMAPullback': ('atrStopMult', 'atr_multiple', 2),
               'EMATrendRetest': ('atrStopMult', 'atr_multiple', 2),
               'TimeSeriesMomentum': ('atrStopMult', 'atr_multiple', 2),
               'BreakRetest': ('stopBufferAtrMultiplier', 'atr_multiple', .2),
               'NoWickImbalance': ('stopBufferAtr', 'atr_multiple', .1),
               'OpeningRangeBreakout': ('stopBufferPct', 'percent_buffer', .05)}
for strategy in settings['exitContracts']:
    if strategy == 'default':
        continue
    key, unit, value = owner_cases.get(strategy, ('stopLossPercent', 'percent', -.7))
    owner_plan = {**plan, 'strategies': [strategy],
                  'stopLoss': {'paths': [f'exitContracts.{strategy}.{key}'], 'unit': unit, 'values': [value]}}
    if strategy in owner_cases:
        m.validate_plan(owner_plan, settings)
    else:
        try:
            m.validate_plan(owner_plan, settings)
        except ValueError:
            pass
        else:
            raise AssertionError(f'Unsupported producer owner admitted: {strategy}.{key}')
# A numeric field planted on a supported strategy is not a supported owner.
for strategy, (key, unit, value) in owner_cases.items():
    fake = json.loads(json.dumps(settings))
    fake['exitContracts'][strategy]['stopBufferPct'] = .1
    wrong = 'stopBufferPct' if key != 'stopBufferPct' else 'atrStopMult'
    fake['exitContracts'][strategy][wrong] = .1
    wrong_plan = {**plan, 'strategies': [strategy], 'stopLoss': {
        'paths': [f'exitContracts.{strategy}.{wrong}'],
        'unit': 'percent_buffer' if wrong == 'stopBufferPct' else 'atr_multiple', 'values': [.1]}}
    try:
        m.validate_plan(wrong_plan, fake)
    except ValueError:
        pass
    else:
        raise AssertionError(f'Cross-owner field admitted: {strategy}.{wrong}')
assert settings == original
print(json.dumps({'observation': 'explicit producer owner admission; unsupported and cross-owner paths rejected before trades'}))
if '--integration' in __import__('sys').argv:
    assert hasattr(m, 'run_cell'), 'No isolated real-runner execution implemented'
    import datetime
    import math
    candles = []
    day = datetime.datetime(2026, 11, 2, 14, 30, tzinfo=datetime.timezone.utc)
    previous = 10.0
    while len(candles) < 320:
        if day.weekday() < 5:
            for bar in range(26):
                i = len(candles)
                close = 10 + 0.55 * math.sin(i / 8) + 0.002 * i
                candles.append({'timestamp': int((day + datetime.timedelta(minutes=15 * bar)).timestamp() * 1000),
                    'open': previous, 'high': max(previous, close) + .06, 'low': min(previous, close) - .06,
                    'close': close, 'volume': 10000 + 73 * (i % 17), 'symbol': 'TSLA', 'timeframe': '15m'})
                previous = close
                if len(candles) == 320:
                    break
        day += datetime.timedelta(days=1)
    outcome = m.run_cell({'plan': plan, 'cell': cells[0], 'candles': candles})
    print('NATIVE_MATRIX_OBSERVATION ' + json.dumps(outcome))
    assert outcome['status'] in ('complete', 'no_trades'), outcome.get('failure')
    assert outcome['report']['dataCoverage']['candlesProcessed'] == 320
    assert outcome['resolved']['confidence.minTradeConfidence'] == 0.4
    assert outcome['resolved']['filters.atrMinPercent'] == 0.1
    assert outcome['resolved']['exitContracts.EMASMACrossover.stopLossPercent'] == -0.5
    assert len(outcome['report']['trades']) > 0, 'Must demonstrate real trades, not just runner startup'
