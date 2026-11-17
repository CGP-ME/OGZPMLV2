#!/usr/bin/env python3
"""Confidence x ATR x stop-loss experiments around the current trading runner."""
import argparse
import copy
import csv
import hashlib
import itertools
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
RESULT_PREFIX = 'MATRIX_CELL_RESULT '

# Explicit current producer ownership, not inferred from flags or field presence.
# StrategyOrchestrator: EMA/MA/pattern/regime use defaults; RSI copies its
# default contract. RSI2MeanReversion emits that configured percentage.
# Other entries name the geometry input consumed by their same-named module
# (BreakRetest -> BreakAndRetest). OGZTPO's signal levels, LiquiditySweep and
# SmartMoneySweep have no supported exitContracts stop axis here.
STOP_OWNERS = {
    'EMASMACrossover': 'stopLossPercent', 'MADynamicSR': 'stopLossPercent',
    'CandlePattern': 'stopLossPercent', 'MarketRegime': 'stopLossPercent',
    'RSI': 'stopLossPercent', 'RSI2MeanReversion': 'stopLossPercent',
    'DonchianBreakout': 'atrStopMult', 'PropSafeEMAPullback': 'atrStopMult',
    'EMATrendRetest': 'atrStopMult', 'TimeSeriesMomentum': 'atrStopMult',
    'BreakRetest': 'stopBufferAtrMultiplier', 'NoWickImbalance': 'stopBufferAtr',
    'OpeningRangeBreakout': 'stopBufferPct',
}


def failure(stage, detail, cause=None):
    """A rejected unit is data, never an alternative successful result."""
    result = {'status': 'failed', 'failure': stage + '_failed',
              'stage': stage, 'detail': detail, 'report': None}
    if cause is not None:
        result['cause'] = type(cause).__name__
        if isinstance(cause, OSError):
            result['errno'] = cause.errno
    return result


def rejected(value):
    return isinstance(value, dict) and value.get('status') == 'failed'


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and (isinstance(value, int) or math.isfinite(value))


def prepare_settings(settings, plan, cell):
    """Change only a disposable settings copy, preserving current policy owners."""
    checked = plan_inputs(plan, settings)
    if rejected(checked):
        return checked
    if not isinstance(cell, dict) or any(not finite(cell.get(k)) for k in ('confidence', 'atrMinPercent', 'stopLoss')) or not 0 <= cell['confidence'] <= 1 or cell['atrMinPercent'] < 0:
        return failure('plan', 'Cell requires valid numeric axes')
    result = copy.deepcopy(settings)
    base = plan['baseProfile']
    profile = copy.deepcopy(settings['launchProfiles'][base])
    selected = plan['strategies']
    contracts = result['exitContracts']
    if not selected or len(set(selected)) != len(selected):
        return failure('plan', 'strategies must explicitly name unique strategies')
    for strategy in selected:
        if strategy == 'default' or strategy not in contracts:
            return failure('plan', f'Unknown strategy {strategy}')
    paths = plan['stopLoss']['paths']
    if not paths or len(set(paths)) != len(paths):
        return failure('plan', 'stopLoss.paths must name unique current strategy-owned controls')
    allowed = {'stopLossPercent': 'percent', 'atrStopMult': 'atr_multiple',
               'stopBufferAtr': 'atr_multiple', 'stopBufferAtrMultiplier': 'atr_multiple',
               'stopBufferPct': 'percent_buffer'}
    for field in paths:
        parts = field.split('.')
        if len(parts) != 3 or parts[0] != 'exitContracts' or parts[1] not in selected or parts[2] not in allowed:
            return failure('plan', f'Unsupported stop owner: {field}')
        strategy, key = parts[1:]
        if STOP_OWNERS.get(strategy) != key:
            return failure('plan', f'Unsupported current producer stop owner: {field}')
        contract = contracts[strategy]
        if key not in contract or not finite(contract[key]):
            return failure('plan', f'Stop control is not numeric: {field}')
        if plan['stopLoss']['unit'] != allowed[key]:
            return failure('plan', f'{field} requires unit {allowed[key]}')
        if key == 'stopLossPercent':
            if cell['stopLoss'] >= 0:
                return failure('plan', 'stopLossPercent uses a negative risk distance, e.g. -0.5')
            if contract.get('useStructuralExits') or contract.get('stopType') in ('atr', 'structural') or 'atrStopMult' in contract or result['strategyBehavior']['atrContracts']['enabled']:
                return failure('plan', f'{field} is superseded by structural/ATR geometry; choose that strategy\'s actual stop control')
        elif cell['stopLoss'] <= 0:
            return failure('plan', f'{field} requires a positive value')
        if any(key in values for values in contract.get('timeframes', {}).values()):
            return failure('plan', f'{field} has timeframe overrides; explicit support needed rather than an ineffective sweep')
        contract[key] = cell['stopLoss']
    if {p.split('.')[1] for p in paths} != set(selected):
        return failure('plan', 'Every selected strategy needs a stopLoss.paths owner')
    for strategy in selected:
        contracts[strategy]['minConfidence'] = cell['confidence']
        contracts[strategy]['atrMinPercent'] = cell['atrMinPercent']
        for frame in contracts[strategy].get('timeframes', {}).values():
            frame['minConfidence'] = cell['confidence']
            frame['atrMinPercent'] = cell['atrMinPercent']
    profile['mode'] = 'backtest'
    profile['confirmLive'] = False
    profile['sessionRouter']['mode'] = 'static'
    profile['sessionRouter']['staticSession'] = plan['identity']['assetClass']
    profile['confidence']['minTradeConfidence'] = cell['confidence']
    profile['strategies']['soloFilter'] = selected[:]
    result['launchProfiles']['matrix-replay'] = profile
    result['filters']['atrEnabled'] = True
    result['filters']['atrMinPercent'] = cell['atrMinPercent']
    return result, {'baseProfile': base, 'replayProfile': 'matrix-replay',
                    'axes': dict(cell), 'stopPaths': paths,
                    'confidenceSemantics': 'entry threshold and selected strategy contract floors; other confidence logic unchanged',
                    'atrSemantics': 'minimum ATR/price * 100 for selected strategies; filter enabled',
                    'initialState': 'empty isolated account/learned stores; no live state imported',
                    'transport': 'file candles, simulated execution, static dataset session, no network',
                    'modelAvailability': 'external model services unavailable in offline sandbox; configured TrAI not disabled'}


def expand_grid(plan):
    """Stable, deduplicated Cartesian product; confidence is a 0..1 fraction."""
    if not isinstance(plan, dict) or not {'confidence', 'atrMinPercent', 'stopLoss'} <= plan.keys() or not isinstance(plan['stopLoss'], dict) or 'values' not in plan['stopLoss']:
        return failure('plan', 'Grid requires confidence, atrMinPercent and stopLoss.values')
    axes = []
    for name, values in [('confidence', plan['confidence']),
                         ('atrMinPercent', plan['atrMinPercent']),
                         ('stopLoss', plan['stopLoss']['values'])]:
        if not isinstance(values, list) or not values:
            return failure('plan', f'{name} requires a nonempty array')
        unique = []
        for value in values:
            if not finite(value):
                return failure('plan', f'{name} requires finite numbers')
            if name == 'confidence' and not 0 <= value <= 1:
                return failure('plan', 'confidence is a 0..1 fraction')
            if name == 'atrMinPercent' and value < 0:
                return failure('plan', 'ATR minimum percent cannot be negative')
            if value not in unique:
                unique.append(value)
        axes.append(unique)
    cells = []
    for confidence, atr, stop in itertools.product(*axes):
        cell = {'confidence': confidence, 'atrMinPercent': atr, 'stopLoss': stop}
        identity = json.dumps(cell, sort_keys=True, separators=(',', ':'))
        cells.append({'id': hashlib.sha256(identity.encode()).hexdigest()[:16], **cell})
    return cells


def plan_inputs(plan, settings):
    required = {'baseProfile', 'identity', 'strategies', 'feeProfile', 'confidence', 'atrMinPercent', 'stopLoss'}
    if not isinstance(plan, dict) or set(plan) != required:
        return failure('plan', f'Plan keys must be exactly {sorted(required)}')
    if not isinstance(settings, dict) or any(not isinstance(settings.get(k), dict) for k in ('launchProfiles', 'exitContracts', 'feeProfiles', 'filters', 'strategyBehavior', 'trai')):
        return failure('settings', 'Settings require operational profiles and policy objects')
    if not isinstance(settings['feeProfiles'].get('definitions'), dict) or not isinstance(settings['strategyBehavior'].get('atrContracts'), dict) or not isinstance(settings['strategyBehavior']['atrContracts'].get('enabled'), bool) or not isinstance(settings['trai'].get('llm'), dict) or not isinstance(settings['trai']['llm'].get('apiKeyEnv'), str):
        return failure('settings', 'Settings require fee definitions, ATR policy and LLM variable name')
    if not isinstance(plan['baseProfile'], str) or plan['baseProfile'] not in settings['launchProfiles'] or not isinstance(settings['launchProfiles'][plan['baseProfile']], dict):
        return failure('plan', 'baseProfile must name an existing operational launch profile')
    if not isinstance(plan['strategies'], list) or any(not isinstance(s, str) for s in plan['strategies']):
        return failure('plan', 'strategies must be an array of names')
    profile = settings['launchProfiles'][plan['baseProfile']]
    if any(not isinstance(profile.get(k), dict) for k in ('sessionRouter', 'confidence', 'strategies')):
        return failure('settings', 'Selected profile requires sessionRouter, confidence and strategies')
    for strategy in plan['strategies']:
        if strategy in settings['exitContracts']:
            contract = settings['exitContracts'][strategy]
            if not isinstance(contract, dict) or not isinstance(contract.get('timeframes', {}), dict) or any(not isinstance(v, dict) for v in contract.get('timeframes', {}).values()):
                return failure('settings', 'Strategy contract requires object/timeframe objects')
    identity = plan['identity']
    if not isinstance(identity, dict) or set(identity) != {'broker', 'assetClass', 'tradingPair', 'symbols', 'candleTimeframe'}:
        return failure('plan', 'identity requires broker, assetClass, tradingPair, symbols, candleTimeframe')
    if (identity['broker'], identity['assetClass']) not in [('alpaca', 'stocks'), ('kraken', 'crypto')]:
        return failure('plan', 'identity must pair alpaca/stocks or kraken/crypto')
    if not isinstance(identity['tradingPair'], str) or not re.fullmatch(r'[A-Z0-9]+(?:-[A-Z0-9]+)?', identity['tradingPair']):
        return failure('plan', 'tradingPair must be a canonical ticker or pair')
    if identity['symbols'] != [identity['tradingPair']]:
        return failure('plan', 'Current replay accepts one symbol per dataset; symbols must match tradingPair')
    if identity['candleTimeframe'] not in ('5sec', '1m', '5m', '15m', '30m', '1h', '4h', '1d'):
        return failure('plan', 'Unsupported candleTimeframe')
    if not isinstance(plan['feeProfile'], str):
        return failure('plan', 'feeProfile must name an existing profile')
    fee = settings['feeProfiles']['definitions'].get(plan['feeProfile'])
    if not isinstance(fee, dict) or not isinstance(fee.get('assetClasses'), list) or identity['assetClass'] not in fee['assetClasses']:
        return failure('plan', 'feeProfile must explicitly cover the selected asset class')
    if not isinstance(plan['stopLoss'], dict) or set(plan['stopLoss']) != {'values', 'paths', 'unit'}:
        return failure('plan', 'stopLoss requires exactly values, paths, unit')
    if not isinstance(plan['stopLoss']['paths'], list) or any(not isinstance(p, str) for p in plan['stopLoss']['paths']):
        return failure('plan', 'stopLoss.paths must be an array of canonical paths')
    return {'status': 'valid'}


def validate_plan(plan, settings):
    checked = plan_inputs(plan, settings)
    if rejected(checked):
        return checked
    cells = expand_grid(plan)
    if rejected(cells):
        return cells
    for cell in cells:
        prepared = prepare_settings(settings, plan, cell)
        if rejected(prepared):
            return prepared
    return cells


def validate_candles(candles, identity):
    if not isinstance(identity, dict) or any(not isinstance(identity.get(k), str) for k in ('tradingPair', 'candleTimeframe')):
        return failure('candles', 'Candles require explicit symbol/timeframe identity')
    if not isinstance(candles, list) or not candles:
        return failure('candles', 'Historical data must be a nonempty OHLCV array')
    previous = None
    for index, candle in enumerate(candles):
        if not isinstance(candle, dict):
            return failure('candles', f'candle[{index}] must be an object')
        numbers = []
        for long, short in [('timestamp', 't'), ('open', 'o'), ('high', 'h'), ('low', 'l'), ('close', 'c'), ('volume', 'v')]:
            value = candle.get(long, candle.get(short))
            if not finite(value):
                return failure('candles', f'candle[{index}].{long} must be finite')
            numbers.append(value)
        stamp, opening, high, low, close, volume = numbers
        # Accept seconds or milliseconds, as the canonical OHLC normalizer does.
        normalized = stamp * 1000 if stamp < 1e12 else stamp
        if normalized <= 0 or (previous is not None and normalized <= previous):
            return failure('candles', f'candle[{index}] timestamps must be unique and increasing')
        previous = normalized

        if low <= 0 or high < max(opening, close, low) or low > min(opening, close) or volume < 0:
            return failure('candles', f'candle[{index}] has invalid OHLCV geometry')
        for key, expected in [('symbol', identity['tradingPair']), ('timeframe', identity['candleTimeframe'])]:
            if key in candle and candle[key] != expected:
                return failure('candles', f'candle[{index}].{key} conflicts with identity')
        if candle.get('complete') is False or candle.get('isClosed') is False:
            return failure('candles', f'candle[{index}] is not completed')
    return candles


def require_isolation():
    marker = read_json(Path('/run/ogz-helper-isolation.json'), 'isolation')
    if rejected(marker):
        return marker
    if not isinstance(marker, dict) or marker.get('projectRoot') != str(ROOT) or not isinstance(marker.get('hostNamespaces'), dict) or set(marker['hostNamespaces']) != {'mnt', 'net', 'pid'}:
        return failure('isolation', 'Cell execution requires scripts/test-isolated.py namespaces')
    try:
        shared = any(
            os.readlink(f'/proc/self/ns/{key}') == value
            for key, value in marker['hostNamespaces'].items())
    except OSError as error:
        return failure('isolation', 'Cannot read namespace identity', error)
    if shared:
        return failure('isolation', 'Cell execution requires scripts/test-isolated.py namespaces')
    return {'status': 'isolated'}


def read_json(path, stage):
    try:
        text = path.read_text()
    except (OSError, UnicodeError) as error:
        return failure(stage, 'Cannot read JSON input', error)
    return parse_json(text, stage)


def parse_json(text, stage):
    constants = []
    def invalid_constant(token):
        constants.append(token)
        return token
    try:
        value = json.loads(text, parse_constant=invalid_constant)
    except (ValueError, UnicodeError, RecursionError) as error:
        return failure(stage, 'Malformed JSON input', error)
    pending = [value]
    while pending:
        item = pending.pop()
        if isinstance(item, float) and not math.isfinite(item):
            return failure(stage, 'Nonfinite JSON numbers are unusable')
        if isinstance(item, dict):
            pending.extend(item.values())
        elif isinstance(item, list):
            pending.extend(item)
    if constants:
        return failure(stage, 'Nonfinite JSON numbers are unusable')
    return value


def diagnostic(result):
    print('MATRIX_FAILURE ' + json.dumps(result, allow_nan=False), file=sys.stderr, flush=True)


def consumer_evidence(report, plan, cell, resolved=None):
    """Read persisted trade policy facts; no trades is no policy evidence."""
    if not isinstance(report, dict) or not isinstance(report.get('trades'), list):
        return failure('report', 'Report requires an explicit trades array')
    trades = report['trades']
    for trade in trades:
        if not isinstance(trade, dict) or not isinstance(trade.get('strategyName'), str) or not isinstance(trade.get('frozenExitPolicy'), dict) or not isinstance(trade['frozenExitPolicy'].get('contract'), dict):
            return failure('report', 'Trade requires strategyName and frozen contract')
    evidence = {'status': 'observed' if trades else 'no_trade_policy_evidence',
                'observedTrades': len(trades), 'mismatches': [], 'strategies': {}}
    resolved = resolved or {}
    evidence['stopChecks'] = []
    for trade in trades:
        strategy = trade.get('strategyName')
        contract = (trade.get('frozenExitPolicy') or {}).get('contract', {})
        observed = evidence['strategies'].setdefault(strategy, {'confidenceFloors': [], 'atrMinimums': [], 'stopDistances': []})
        for key, column in [('minConfidence', 'confidenceFloors'), ('atrMinPercent', 'atrMinimums'), ('stopLossPercent', 'stopDistances')]:
            value = contract.get(key)
            if value not in observed[column]:
                observed[column].append(value)
        expected = {'minConfidence': cell['confidence'], 'atrMinPercent': cell['atrMinPercent']}
        for field in plan['stopLoss']['paths']:
            _, owner, key = field.split('.')
            if owner == strategy and key == 'stopLossPercent':
                base = resolved.get(field)
                effective = contract.get(key)
                adjustment = resolved.get(f'exitContracts.{owner}.profitManagement.contractVolatilityAdjustment')
                check = {'tradeId': trade.get('tradeId'), 'strategy': strategy,
                         'requestedBase': cell['stopLoss'], 'resolvedBase': base,
                         'effectiveObserved': effective,
                         'status': 'unverified_missing_resolved_adjustment'}
                evidence['stopChecks'].append(check)
                if field in resolved and base != cell['stopLoss']:
                    evidence['mismatches'].append({'tradeId': trade.get('tradeId'), 'strategy': strategy,
                        'field': field, 'requested': cell['stopLoss'], 'observed': base})
                # PolicyBuilder drops the contract adjustment and creation context.
                # ATR-at-entry / fill price and later policy volatility are not
                # necessarily the orchestrator's exact ATR/price trigger inputs.
                def finite(value):
                    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
                if (finite(base) and isinstance(adjustment, dict)
                        and finite(adjustment.get('threshold')) and finite(adjustment.get('stopMultiplier'))):
                    candidates = [base, base * adjustment['stopMultiplier']]
                    check.update(allowedEffective=candidates, adjustment=adjustment,
                                 status='compatible_trigger_unverified')
                    if not finite(effective) or not any(math.isclose(effective, v, rel_tol=1e-12, abs_tol=1e-12) for v in candidates):
                        check['status'] = 'mismatch'
                        evidence['mismatches'].append({'tradeId': trade.get('tradeId'), 'strategy': strategy,
                            'field': key, 'requested': cell['stopLoss'], 'allowedEffective': candidates, 'observed': effective})
                evidence['status'] = 'partially_verified'
        for key, value in expected.items():
            if contract.get(key) != value:
                evidence['mismatches'].append({'tradeId': trade.get('tradeId'), 'strategy': strategy,
                    'field': key, 'requested': value, 'observed': contract.get(key)})
    if plan['stopLoss']['unit'] != 'percent':
        evidence['stopVerification'] = 'Resolved owner and observed derived distances; geometry effect requires strategy-specific comparison'
    return evidence


def run_cell(payload):
    """Execute the real bot in the disposable source tree, never on the host."""
    isolation = require_isolation()
    if rejected(isolation):
        return isolation
    if not isinstance(payload, dict) or not {'plan', 'cell', 'candles'} <= payload.keys():
        return failure('worker_input', 'Worker requires plan, cell and candles')
    plan, cell = payload['plan'], payload['cell']
    settings_path = ROOT / 'config/settings.json'
    original = read_json(settings_path, 'settings_input')
    if rejected(original):
        return original
    cells = validate_plan(plan, original)
    if rejected(cells):
        return cells
    if cell not in cells:
        return failure('worker_input', 'Cell must be an exact member of the validated grid')
    checked = validate_candles(payload['candles'], plan['identity'])
    if rejected(checked):
        return checked
    prepared = prepare_settings(original, plan, cell)
    if rejected(prepared):
        return prepared
    settings, receipt = prepared
    llm_key = settings['trai']['llm']['apiKeyEnv']
    if not isinstance(llm_key, str) or not re.fullmatch(r'[A-Z][A-Z0-9_]*', llm_key):
        return failure('configuration', 'Invalid configured LLM credential variable name')
    saved = write_json(settings_path, settings)
    if rejected(saved):
        return saved
    identity = plan['identity']
    try:
        work = Path(tempfile.mkdtemp(prefix='matrix-cell-'))
    except OSError as error:
        return failure('worker_storage', 'Cannot create cell workspace', error)
    data = work / f"{identity['tradingPair'].lower()}-{identity['candleTimeframe']}.json"
    saved = write_json(data, payload['candles'])
    if rejected(saved):
        return saved
    descriptor = {'schemaVersion': 1, 'launchProfile': 'matrix-replay',
        'identity': identity, 'data': {'candleFile': str(data)},
        'report': {'tag': cell['id'], 'outputDir': str(work / 'reports')},
        'state': {'stateFile': str(work / 'state/state.json'), 'dataDir': str(work / 'state'), 'freshStart': True},
        'services': {'dashboard': False, 'notifications': False, 'sentry': False, 'webhookOrders': False},
        'feeProfile': plan['feeProfile'], 'overrides': {}}
    descriptor_path = work / 'run.json'
    saved = write_json(descriptor_path, descriptor)
    if rejected(saved):
        return saved
    # Inert constructor inputs, not credentials: the namespace has no network,
    # no host environment and no operator .env. No broker/model response is mocked.
    env_file = work / 'offline.env'
    key_names = ['ALPACA_API_KEY', 'ALPACA_API_SECRET', 'KRAKEN_API_KEY', 'KRAKEN_API_SECRET']
    key_names.append(llm_key)
    try:
        env_file.write_text(''.join(f'{k}=offline-unusable-no-network\n' for k in key_names))
    except OSError as error:
        return failure('worker_storage', 'Cannot write offline constructor inputs', error)
    environment = dict(os.environ, BACKTEST_RUN_DESCRIPTOR_PATH=str(descriptor_path),
                       DOTENV_CONFIG_PATH=str(env_file))
    receipt['credentialInputs'] = 'inert offline constructor tokens; no real credentials or service responses'
    config_script = """
const loader = require('./foundation/ConfigLoader');
const s = loader.load({silent: true});
const paths = JSON.parse(process.argv[1]);
const resolved = Object.fromEntries(paths.map(p => [p, p.split('.').reduce((v, k) => v?.[k], s.config)]));
// Ask the same native registration/filter owner the replay uses; do not keep
// a second strategy-to-toggle table or turn disabled strategies on for a sweep.
const {StrategyOrchestrator} = require('./core/StrategyOrchestrator');
const {CandleAggregator} = require('./core/CandleAggregator');
const candleIntervals = new CandleAggregator();
const baseTimeframe = [...s.config.orchestrator.mtfTimeframes].sort(
  (a, b) => candleIntervals.getIntervalMs(a) - candleIntervals.getIntervalMs(b))[0];
const orchestrator = new StrategyOrchestrator({mtfBaseTimeframe: baseTimeframe});
const requested = s.config.strategies.soloFilter;
const active = orchestrator.strategies.map(strategy => strategy.name);
const inactive = requested.filter(name => !active.includes(name));
console.log(JSON.stringify({resolved, fingerprint: s.fingerprint, fees: s.config.fees,
  warnings: s.warnings, strategySelection: {requested, active, inactive}}));
"""
    tracked_paths = ['confidence.minTradeConfidence', 'filters.atrEnabled', 'filters.atrMinPercent',
                     'strategyBehavior.emaCrossover', 'trai.enabled', 'features.enableLearning',
                     *plan['stopLoss']['paths']]
    tracked_paths += [f'exitContracts.{s}.{k}' for s in plan['strategies'] for k in ('minConfidence', 'atrMinPercent')]
    tracked_paths += [f'exitContracts.{s}.profitManagement.contractVolatilityAdjustment' for s in plan['strategies']]
    try:
        probe = subprocess.run(['node', '-e', config_script, json.dumps(tracked_paths)], cwd=ROOT,
                               env=environment, text=True, capture_output=True)
    except (OSError, UnicodeError) as error:
        return failure('configuration_probe', 'Cannot execute configuration probe', error)
    outcome = {'cell': cell, 'policy': receipt, 'status': 'failed', 'report': None}
    if probe.returncode:
        outcome['failure'] = 'configuration_resolution_failed'
        outcome['log'] = probe.stdout + probe.stderr
        return outcome
    lines = probe.stdout.strip().splitlines()
    resolved = parse_json(lines[-1] if lines else '', 'configuration_report')
    if rejected(resolved):
        return resolved
    if not isinstance(resolved, dict) or not isinstance(resolved.get('resolved'), dict) or not isinstance(resolved.get('fingerprint'), str) or not isinstance(resolved.get('strategySelection'), dict):
        return failure('configuration_report', 'Probe requires resolved values, fingerprint and strategy selection')
    selection = resolved['strategySelection']
    if any(not isinstance(selection.get(k), list) or any(not isinstance(v, str) for v in selection[k]) for k in ('requested', 'active', 'inactive')) or selection['requested'] != plan['strategies'] or selection['inactive'] != [s for s in plan['strategies'] if s not in selection['active']]:
        return failure('configuration_report', 'Probe strategy selection is inconsistent')
    outcome.update(resolved)
    if resolved['strategySelection']['inactive']:
        outcome['failure'] = 'inactive_strategy_selection'
        outcome['log'] = probe.stdout + probe.stderr
        return outcome
    try:
        with (work / 'runner.log').open('w+') as log:
            process = subprocess.run(['node', 'run-empire-v2.js'], cwd=ROOT, env=environment,
                                     stdout=log, stderr=subprocess.STDOUT)
            log.seek(0)
            outcome['log'] = log.read()
    except (OSError, UnicodeError) as error:
        return {**outcome, **failure('runner_execution', 'Cannot execute/read runner', error)}
    outcome['runnerExitCode'] = process.returncode
    reports = list((work / 'reports').rglob('report-*.json'))
    if len(reports) != 1:
        outcome['failure'] = f'expected_one_structured_report_found_{len(reports)}'
        return outcome
    try:
        raw = reports[0].read_bytes()
    except OSError as error:
        return {**outcome, **failure('report_read', 'Cannot read runner report', error)}
    report = parse_json(raw, 'report')
    if rejected(report):
        return {**outcome, **report}
    if not isinstance(report, dict) or any(not isinstance(report.get(k), dict) for k in ('summary', 'dataCoverage', 'configuration')) or not isinstance(report.get('windowEndPositions'), list):
        return {**outcome, **failure('report', 'Report requires summary, coverage, configuration and windowEndPositions')}
    outcome['report'] = report
    outcome['reportSha256'] = hashlib.sha256(raw).hexdigest()
    outcome['consumerEvidence'] = consumer_evidence(report, plan, cell, resolved['resolved'])
    if rejected(outcome['consumerEvidence']):
        return {**outcome, **outcome['consumerEvidence']}
    summary, coverage = report.get('summary', {}), report.get('dataCoverage', {})
    if process.returncode != 0 or summary.get('executionComplete') is not True or coverage.get('complete') is not True:
        outcome['failure'] = 'runner_incomplete'
    elif report.get('configuration', {}).get('fingerprint') != resolved['fingerprint']:
        outcome['failure'] = 'runner_configuration_identity_mismatch'
    elif coverage.get('candlesProcessed') != len(payload['candles']) or len(report.get('trades', [])) != summary.get('totalTrades'):
        outcome['failure'] = 'report_count_mismatch'
    elif outcome['consumerEvidence']['mismatches']:
        outcome['failure'] = 'requested_parameters_differ_from_observed_trade_policy'
    else:
        outcome['status'] = 'complete' if report['trades'] else 'no_trades'
    return outcome


def source_manifest():
    """Use the launcher's eligibility owner, with deterministic file loading."""
    import runpy
    try:
        module = runpy.run_path(str(ROOT / 'scripts/test-isolated.py'))
        tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT, stderr=subprocess.PIPE).decode().split('\0')
        return {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
                for name in sorted(set(tracked)) if name and module['eligible'](Path(name))
                and (ROOT / name).is_file() and not (ROOT / name).is_symlink()}
    except (OSError, UnicodeError, subprocess.SubprocessError) as error:
        return failure('source_manifest', 'Cannot fingerprint source snapshot', error)


def write_json(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    try:
        temporary.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')
        os.replace(temporary, path)
    except (OSError, ValueError, TypeError, UnicodeError) as error:
        result = failure('publication', 'Cannot publish JSON artifact', error)
        diagnostic(result)
        return result
    return {'status': 'published'}


def execute_matrix(plan, candles, output, workers=1):
    from concurrent.futures import ThreadPoolExecutor, as_completed
    settings = read_json(ROOT / 'config/settings.json', 'settings_input')
    if rejected(settings):
        return settings
    cells = validate_plan(plan, settings)
    if rejected(cells):
        return cells
    checked = validate_candles(candles, plan['identity'])
    if rejected(checked):
        return checked
    if not isinstance(workers, int) or isinstance(workers, bool) or workers < 1:
        return failure('plan', 'workers must be positive')
    manifest = source_manifest()
    if rejected(manifest):
        return manifest
    for required in ['tools/backtest-matrix.py', 'scripts/test-isolated.py']:
        if required not in manifest:
            return failure('source_manifest', f'{required} must be tracked so the isolation launcher includes it')
    try:
        output.mkdir(parents=True, exist_ok=False)
    except OSError as error:
        return failure('publication', 'Output requires a new writable directory', error)
    for name, value in [('plan.json', plan), ('sources.json', manifest)]:
        saved = write_json(output / name, value)
        if rejected(saved):
            return saved
    data_hash = hashlib.sha256(json.dumps(candles, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    aggregate = {'schemaVersion': 1, 'status': 'running', 'publicationFailures': [], 'plan': plan, 'dataSha256': data_hash,
        'sourceManifestSha256': hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest(),
        'expectedCells': len(cells), 'finishedCells': 0, 'failedCells': 0, 'results': [],
        'limitations': ['Single-symbol, single-native-timeframe OHLC replay; absent MTF inputs remain unavailable.',
            'No tick tape: live intrabar order, latency and broker fills are not reproduced.',
            'Fresh isolated learned/account state, not the deployed learned banks.',
            'External TrAI model service unavailable offline; local code stays configured.',
            'Window-end positions are reported separately by the current runner; headline trade P&L is not a fully reconciled liquidation-equity ranking.']}
    saved = write_json(output / 'matrix.json', aggregate)
    if rejected(saved):
        return saved

    def dispatch(cell):
        payload = {'plan': plan, 'cell': cell, 'candles': candles, 'sources': manifest}
        command = ['python3', 'scripts/test-isolated.py', '--', 'python3', 'tools/backtest-matrix.py', '--cell']
        try:
            process = subprocess.run(command, cwd=ROOT, input=json.dumps(payload), text=True,
                                     capture_output=True, env={'PATH': os.environ.get('PATH', '/usr/bin:/bin'),
                                                              'TMPDIR': os.environ.get('TMPDIR', str(output))})
        except (OSError, UnicodeError) as error:
            return {'cell': cell, **failure('worker_execution', 'Cannot execute isolated worker', error)}
        messages = [line[len(RESULT_PREFIX):] for line in process.stdout.splitlines() if line.startswith(RESULT_PREFIX)]
        if len(messages) == 1:
            result = parse_json(messages[0], 'worker_report')
            if not isinstance(result, dict) or result.get('status') not in ('failed', 'complete', 'no_trades'):
                result = failure('worker_report', 'Worker receipt requires an explicit outcome')
            elif result.get('report') is not None and (not isinstance(result['report'], dict) or not isinstance(result['report'].get('summary'), dict) or not isinstance(result['report'].get('windowEndPositions'), list)):
                result = failure('worker_report', 'Worker receipt has an unusable report')
            elif not rejected(result) and (result.get('cell') != cell or result.get('report') is None):
                result = failure('worker_report', 'Worker receipt does not match cell/report structure')
            elif not rejected(result):
                # Reconcile external success with the native run_cell contract.
                # This is receipt admission, not another trading-policy gate.
                report = result['report']
                summary = report['summary']
                coverage = report.get('dataCoverage')
                configuration = report.get('configuration')
                trades = report.get('trades')
                if not isinstance(trades, list) or any(not isinstance(t, dict) or not isinstance(t.get('strategyName'), str) or not isinstance(t.get('frozenExitPolicy'), dict) or not isinstance(t['frozenExitPolicy'].get('contract'), dict) for t in trades) or not isinstance(coverage, dict) or not isinstance(configuration, dict):
                    result = failure('worker_report', 'Success requires trades, coverage and configuration')
                elif type(result.get('runnerExitCode')) is not int or result['runnerExitCode'] != 0 or summary.get('executionComplete') is not True or coverage.get('complete') is not True:
                    result = failure('worker_report', 'Success requires completed runner execution and coverage')
                elif not isinstance(result.get('fingerprint'), str) or not result['fingerprint'] or configuration.get('fingerprint') != result['fingerprint']:
                    result = failure('worker_report', 'Success configuration fingerprints must match')
                elif type(summary.get('totalTrades')) is not int or summary['totalTrades'] != len(trades) or type(coverage.get('candlesProcessed')) is not int or coverage['candlesProcessed'] != len(candles):
                    result = failure('worker_report', 'Success report counts do not reconcile')
                elif result['status'] != ('complete' if trades else 'no_trades'):
                    result = failure('worker_report', 'Success status conflicts with trade count')
        else:
            result = {'status': 'failed', 'failure': 'sandbox_no_unique_receipt', 'report': None, 'log': process.stdout}
        result['cell'] = cell
        result['sandboxExitCode'] = process.returncode
        if process.returncode != 0:
            result['status'] = 'failed'
            result.setdefault('failure', 'sandbox_nonzero_exit')
        log = result.pop('log', '')
        if not isinstance(log, str):
            result = {'cell': cell, **failure('worker_report', 'Worker log must be text')}
            log = ''
        try:
            (output / f"{cell['id']}.log").write_text(log + '\n' + process.stderr)
        except (OSError, UnicodeError) as error:
            result = {'cell': cell, **failure('publication', 'Cannot publish worker log', error)}
        return result

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(dispatch, cell): cell for cell in cells}
        for future in as_completed(futures):
            cell = futures[future]
            try:
                result = future.result()
            except Exception as error:
                result = {'cell': cell, **failure('worker_execution', 'Worker future failed unexpectedly', error)}
            if rejected(result):
                diagnostic({k: v for k, v in result.items() if k not in ('report', 'log')})
            saved = write_json(output / f"{cell['id']}.json", result)
            published = not rejected(saved)
            if not published:
                result = {'cell': cell, **saved}
                aggregate['publicationFailures'].append({'cell': cell, **saved})
            report = result.get('report') or {}
            row = {'cell': cell, 'status': result['status'], 'failure': result.get('failure'),
                   'receipt': f"{cell['id']}.json" if published else None, 'summary': report.get('summary'),
                   'windowEndPositions': len(report['windowEndPositions']) if isinstance(report.get('windowEndPositions'), list) else None,
                   'consumerEvidence': result.get('consumerEvidence')}
            aggregate['results'].append(row)
            order = {c['id']: i for i, c in enumerate(cells)}
            aggregate['results'].sort(key=lambda r: order[r['cell']['id']])
            aggregate['finishedCells'] += 1
            aggregate['failedCells'] += result['status'] == 'failed'
            saved = write_json(output / 'matrix.json', aggregate)
            if rejected(saved):
                aggregate['publicationFailures'].append(saved)
            print(f"{aggregate['finishedCells']}/{len(cells)} {cell['id']} {result['status']} {result.get('failure') or ''}", flush=True)
    fields = ['id', 'confidence', 'atrMinPercent', 'stopLoss', 'status', 'totalTrades', 'totalPnL', 'totalFeesPaid', 'maxDrawdownPercent', 'winRate', 'windowEndPositions', 'failure']
    try:
        with (output / 'matrix.csv.tmp').open('w', newline='') as stream:
            writer = csv.DictWriter(stream, fieldnames=fields)
            writer.writeheader()
            for row in aggregate['results']:
                summary = row['summary'] or {}
                writer.writerow({**row['cell'], 'status': row['status'],
                    **{k: summary.get(k) for k in fields[5:10]},
                    'windowEndPositions': row['windowEndPositions'], 'failure': row['failure']})
        os.replace(output / 'matrix.csv.tmp', output / 'matrix.csv')
    except (OSError, UnicodeError, csv.Error) as error:
        result = failure('publication', 'Cannot publish comparison CSV', error)
        diagnostic(result)
        aggregate['publicationFailures'].append(result)
    aggregate['status'] = 'failed' if aggregate['failedCells'] or aggregate['publicationFailures'] else 'complete'
    saved = write_json(output / 'matrix.json', aggregate)
    if rejected(saved):
        aggregate['status'] = 'failed'
        aggregate['publicationFailures'].append(saved)
    return aggregate


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, help='JSON confidence/ATR/stop-loss experiment plan')
    parser.add_argument('--data', type=Path, help='Raw historical REST OHLCV JSON array')
    parser.add_argument('--output', type=Path, help='New result directory (never overwrites a run)')
    parser.add_argument('--workers', type=int, default=1, help='Concurrent isolated cells; default 1')
    parser.add_argument('--dry-run', action='store_true', help='Validate plan/data and print cells without running bot')
    parser.add_argument('--cell', action='store_true', help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    if args.cell:
        result = require_isolation()
        if not rejected(result):
            payload = parse_json(sys.stdin.read(), 'worker_input')
            if rejected(payload):
                result = payload
            elif not isinstance(payload, dict) or not isinstance(payload.get('sources'), dict) or not payload['sources'] or not isinstance(payload.get('cell'), dict):
                result = failure('worker_input', 'Worker requires cell and nonempty source manifest')
            else:
                changed = []
                for name, digest in payload['sources'].items():
                    path = Path(name)
                    if path.is_absolute() or '..' in path.parts or not isinstance(digest, str):
                        result = failure('worker_input', 'Source manifest requires relative paths and digests')
                        break
                    try:
                        if not (ROOT / name).is_file() or hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != digest:
                            changed.append(name)
                    except OSError as error:
                        result = failure('source_read', 'Cannot verify source snapshot', error)
                        break
                else:
                    if changed:
                        result = {'cell': payload['cell'], 'status': 'failed', 'failure': 'source_changed_before_cell', 'changed': changed, 'report': None}
                    else:
                        result = run_cell(payload)
        print(RESULT_PREFIX + json.dumps(result, allow_nan=False), flush=True)
        return 1 if result['status'] == 'failed' else 0
    if args.plan is None or args.data is None or (args.output is None and not args.dry_run):
        parser.error('--plan and --data are required, plus --output unless --dry-run')
    if args.workers < 1:
        parser.error('--workers must be positive')
    plan = read_json(args.plan, 'plan_input')
    candles = read_json(args.data, 'data_input')
    settings = read_json(ROOT / 'config/settings.json', 'settings_input')
    for value in (plan, candles, settings):
        if rejected(value):
            diagnostic(value)
            return 2
    cells = validate_plan(plan, settings)
    if rejected(cells):
        diagnostic(cells)
        return 2
    checked = validate_candles(candles, plan['identity'])
    if rejected(checked):
        diagnostic(checked)
        return 2
    if args.dry_run:
        print(json.dumps({'cells': cells, 'total': len(cells), 'candles': len(candles), 'plan': plan}, indent=2))
        return 0

    aggregate = execute_matrix(plan, candles, args.output.resolve(), args.workers)
    if rejected(aggregate):
        diagnostic({k: v for k, v in aggregate.items() if k not in ('results', 'plan')})
        return 1
    print(f"Results: {args.output.resolve() / 'matrix.json'}", flush=True)
    return 1 if aggregate['failedCells'] else 0


if __name__ == '__main__':
    sys.exit(main())
