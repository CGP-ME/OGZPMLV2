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


def prepare_settings(settings, plan, cell):
    """Change only a disposable settings copy, preserving current policy owners."""
    result = copy.deepcopy(settings)
    base = plan['baseProfile']
    profile = copy.deepcopy(settings['launchProfiles'][base])
    selected = plan['strategies']
    contracts = result['exitContracts']
    if not selected or len(set(selected)) != len(selected):
        raise ValueError('strategies must explicitly name unique strategies')
    for strategy in selected:
        if strategy == 'default' or strategy not in contracts:
            raise ValueError(f'Unknown strategy {strategy}')
    paths = plan['stopLoss']['paths']
    if not paths or len(set(paths)) != len(paths):
        raise ValueError('stopLoss.paths must name unique current strategy-owned controls')
    allowed = {'stopLossPercent': 'percent', 'atrStopMult': 'atr_multiple',
               'stopBufferAtr': 'atr_multiple', 'stopBufferAtrMultiplier': 'atr_multiple',
               'stopBufferPct': 'percent_buffer'}
    for field in paths:
        parts = field.split('.')
        if len(parts) != 3 or parts[0] != 'exitContracts' or parts[1] not in selected or parts[2] not in allowed:
            raise ValueError(f'Unsupported stop owner: {field}')
        strategy, key = parts[1:]
        if STOP_OWNERS.get(strategy) != key:
            raise ValueError(f'Unsupported current producer stop owner: {field}')
        contract = contracts[strategy]
        if key not in contract or not isinstance(contract[key], (float, int)):
            raise ValueError(f'Stop control is not numeric: {field}')
        if plan['stopLoss']['unit'] != allowed[key]:
            raise ValueError(f'{field} requires unit {allowed[key]}')
        if key == 'stopLossPercent':
            if cell['stopLoss'] >= 0:
                raise ValueError('stopLossPercent uses a negative risk distance, e.g. -0.5')
            if contract.get('useStructuralExits') or contract.get('stopType') in ('atr', 'structural') or 'atrStopMult' in contract or result['strategyBehavior']['atrContracts']['enabled']:
                raise ValueError(f'{field} is superseded by structural/ATR geometry; choose that strategy\'s actual stop control')
        elif cell['stopLoss'] <= 0:
            raise ValueError(f'{field} requires a positive value')
        if any(key in values for values in contract.get('timeframes', {}).values()):
            raise ValueError(f'{field} has timeframe overrides; explicit support needed rather than an ineffective sweep')
        contract[key] = cell['stopLoss']
    if {p.split('.')[1] for p in paths} != set(selected):
        raise ValueError('Every selected strategy needs a stopLoss.paths owner')
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
    axes = []
    for name, values in [('confidence', plan['confidence']),
                         ('atrMinPercent', plan['atrMinPercent']),
                         ('stopLoss', plan['stopLoss']['values'])]:
        if not isinstance(values, list) or not values:
            raise ValueError(f'{name} requires a nonempty array')
        unique = []
        for value in values:
            if isinstance(value, bool) or not isinstance(value, (float, int)):
                raise ValueError(f'{name} requires finite numbers')
            if not math.isfinite(value):
                raise ValueError(f'{name} requires finite numbers')
            if name == 'confidence' and not 0 <= value <= 1:
                raise ValueError('confidence is a 0..1 fraction')
            if name == 'atrMinPercent' and value < 0:
                raise ValueError('ATR minimum percent cannot be negative')
            if value not in unique:
                unique.append(value)
        axes.append(unique)
    cells = []
    for confidence, atr, stop in itertools.product(*axes):
        cell = {'confidence': confidence, 'atrMinPercent': atr, 'stopLoss': stop}
        identity = json.dumps(cell, sort_keys=True, separators=(',', ':'))
        cells.append({'id': hashlib.sha256(identity.encode()).hexdigest()[:16], **cell})
    return cells


def validate_plan(plan, settings):
    required = {'baseProfile', 'identity', 'strategies', 'feeProfile', 'confidence', 'atrMinPercent', 'stopLoss'}
    if not isinstance(plan, dict) or set(plan) != required:
        raise ValueError(f'Plan keys must be exactly {sorted(required)}')
    if plan['baseProfile'] not in settings['launchProfiles'] or not isinstance(settings['launchProfiles'][plan['baseProfile']], dict):
        raise ValueError('baseProfile must name an existing operational launch profile')
    if not isinstance(plan['strategies'], list) or any(not isinstance(s, str) for s in plan['strategies']):
        raise ValueError('strategies must be an array of names')
    identity = plan['identity']
    if not isinstance(identity, dict) or set(identity) != {'broker', 'assetClass', 'tradingPair', 'symbols', 'candleTimeframe'}:
        raise ValueError('identity requires broker, assetClass, tradingPair, symbols, candleTimeframe')
    if (identity['broker'], identity['assetClass']) not in [('alpaca', 'stocks'), ('kraken', 'crypto')]:
        raise ValueError('identity must pair alpaca/stocks or kraken/crypto')
    if not isinstance(identity['tradingPair'], str) or not re.fullmatch(r'[A-Z0-9]+(?:-[A-Z0-9]+)?', identity['tradingPair']):
        raise ValueError('tradingPair must be a canonical ticker or pair')
    if identity['symbols'] != [identity['tradingPair']]:
        raise ValueError('Current replay accepts one symbol per dataset; symbols must match tradingPair')
    if identity['candleTimeframe'] not in ('5sec', '1m', '5m', '15m', '30m', '1h', '4h', '1d'):
        raise ValueError('Unsupported candleTimeframe')
    fee = settings['feeProfiles']['definitions'].get(plan['feeProfile'])
    if fee is None or identity['assetClass'] not in fee['assetClasses']:
        raise ValueError('feeProfile must explicitly cover the selected asset class')
    if not isinstance(plan['stopLoss'], dict) or set(plan['stopLoss']) != {'values', 'paths', 'unit'}:
        raise ValueError('stopLoss requires exactly values, paths, unit')
    if not isinstance(plan['stopLoss']['paths'], list) or any(not isinstance(p, str) for p in plan['stopLoss']['paths']):
        raise ValueError('stopLoss.paths must be an array of canonical paths')
    cells = expand_grid(plan)
    for cell in cells:
        prepare_settings(settings, plan, cell)
    return cells


def validate_candles(candles, identity):
    if not isinstance(candles, list) or not candles:
        raise ValueError('Historical data must be a nonempty OHLCV array')
    previous = None
    for index, candle in enumerate(candles):
        if not isinstance(candle, dict):
            raise ValueError(f'candle[{index}] must be an object')
        def number(long, short):
            value = candle.get(long, candle.get(short))
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                raise ValueError(f'candle[{index}].{long} must be finite')
            return value
        stamp = number('timestamp', 't')
        # Accept seconds or milliseconds, as the canonical OHLC normalizer does.
        normalized = stamp * 1000 if stamp < 1e12 else stamp
        if normalized <= 0 or (previous is not None and normalized <= previous):
            raise ValueError(f'candle[{index}] timestamps must be unique and increasing')
        previous = normalized
        opening, high, low, close, volume = [number(a, b) for a, b in [('open','o'), ('high','h'), ('low','l'), ('close','c'), ('volume','v')]]
        if low <= 0 or high < max(opening, close, low) or low > min(opening, close) or volume < 0:
            raise ValueError(f'candle[{index}] has invalid OHLCV geometry')
        for key, expected in [('symbol', identity['tradingPair']), ('timeframe', identity['candleTimeframe'])]:
            if key in candle and candle[key] != expected:
                raise ValueError(f'candle[{index}].{key} conflicts with identity')
        if candle.get('complete') is False or candle.get('isClosed') is False:
            raise ValueError(f'candle[{index}] is not completed')
    return candles


def require_isolation():
    marker = json.loads(Path('/run/ogz-helper-isolation.json').read_text())
    if marker['projectRoot'] != str(ROOT) or any(
            os.readlink(f'/proc/self/ns/{key}') == value
            for key, value in marker['hostNamespaces'].items()):
        raise RuntimeError('Cell execution requires scripts/test-isolated.py namespaces')


def consumer_evidence(report, plan, cell, resolved=None):
    """Read persisted trade policy facts; no trades is no policy evidence."""
    trades = report.get('trades', [])
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
    require_isolation()
    plan, cell = payload['plan'], payload['cell']
    settings_path = ROOT / 'config/settings.json'
    original = json.loads(settings_path.read_text())
    validate_plan(plan, original)
    validate_candles(payload['candles'], plan['identity'])
    settings, receipt = prepare_settings(original, plan, cell)
    settings_path.write_text(json.dumps(settings, indent=2) + '\n')
    identity = plan['identity']
    work = Path(tempfile.mkdtemp(prefix='matrix-cell-'))
    data = work / f"{identity['tradingPair'].lower()}-{identity['candleTimeframe']}.json"
    data.write_text(json.dumps(payload['candles']))
    descriptor = {'schemaVersion': 1, 'launchProfile': 'matrix-replay',
        'identity': identity, 'data': {'candleFile': str(data)},
        'report': {'tag': cell['id'], 'outputDir': str(work / 'reports')},
        'state': {'stateFile': str(work / 'state/state.json'), 'dataDir': str(work / 'state'), 'freshStart': True},
        'services': {'dashboard': False, 'notifications': False, 'sentry': False, 'webhookOrders': False},
        'feeProfile': plan['feeProfile'], 'overrides': {}}
    descriptor_path = work / 'run.json'
    descriptor_path.write_text(json.dumps(descriptor))
    # Inert constructor inputs, not credentials: the namespace has no network,
    # no host environment and no operator .env. No broker/model response is mocked.
    env_file = work / 'offline.env'
    key_names = ['ALPACA_API_KEY', 'ALPACA_API_SECRET', 'KRAKEN_API_KEY', 'KRAKEN_API_SECRET']
    llm_key = settings['trai']['llm']['apiKeyEnv']
    if not re.fullmatch(r'[A-Z][A-Z0-9_]*', llm_key):
        raise ValueError('Invalid configured LLM credential variable name')
    key_names.append(llm_key)
    env_file.write_text(''.join(f'{k}=offline-unusable-no-network\n' for k in key_names))
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
    probe = subprocess.run(['node', '-e', config_script, json.dumps(tracked_paths)], cwd=ROOT,
                           env=environment, text=True, capture_output=True)
    outcome = {'cell': cell, 'policy': receipt, 'status': 'failed', 'report': None}
    if probe.returncode:
        outcome['failure'] = 'configuration_resolution_failed'
        outcome['log'] = probe.stdout + probe.stderr
        return outcome
    resolved = json.loads(probe.stdout.strip().splitlines()[-1])
    outcome.update(resolved)
    if resolved['strategySelection']['inactive']:
        outcome['failure'] = 'inactive_strategy_selection'
        outcome['log'] = probe.stdout + probe.stderr
        return outcome
    with (work / 'runner.log').open('w+') as log:
        process = subprocess.run(['node', 'run-empire-v2.js'], cwd=ROOT, env=environment,
                                 stdout=log, stderr=subprocess.STDOUT)
        log.seek(0)
        outcome['log'] = log.read()
    outcome['runnerExitCode'] = process.returncode
    reports = list((work / 'reports').rglob('report-*.json'))
    if len(reports) != 1:
        outcome['failure'] = f'expected_one_structured_report_found_{len(reports)}'
        return outcome
    raw = reports[0].read_bytes()
    report = json.loads(raw)
    outcome['report'] = report
    outcome['reportSha256'] = hashlib.sha256(raw).hexdigest()
    outcome['consumerEvidence'] = consumer_evidence(report, plan, cell, resolved['resolved'])
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
    """Fingerprint the exact eligible working source, including concurrent edits."""
    import importlib.util
    spec = importlib.util.spec_from_file_location('isolation_source', ROOT / 'scripts/test-isolated.py')
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    return {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
            for name in sorted(set(tracked)) if name and module.eligible(Path(name))
            and (ROOT / name).is_file() and not (ROOT / name).is_symlink()}


def write_json(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')
    os.replace(temporary, path)


def execute_matrix(plan, candles, output, workers=1):
    from concurrent.futures import ThreadPoolExecutor, as_completed
    settings = json.loads((ROOT / 'config/settings.json').read_text())
    cells = validate_plan(plan, settings)
    validate_candles(candles, plan['identity'])
    manifest = source_manifest()
    for required in ['tools/backtest-matrix.py', 'scripts/test-isolated.py']:
        if required not in manifest:
            raise ValueError(f'{required} must be tracked so the isolation launcher includes it')
    output.mkdir(parents=True, exist_ok=False)
    write_json(output / 'plan.json', plan)
    write_json(output / 'sources.json', manifest)
    data_hash = hashlib.sha256(json.dumps(candles, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    aggregate = {'schemaVersion': 1, 'plan': plan, 'dataSha256': data_hash,
        'sourceManifestSha256': hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest(),
        'expectedCells': len(cells), 'finishedCells': 0, 'failedCells': 0, 'results': [],
        'limitations': ['Single-symbol, single-native-timeframe OHLC replay; absent MTF inputs remain unavailable.',
            'No tick tape: live intrabar order, latency and broker fills are not reproduced.',
            'Fresh isolated learned/account state, not the deployed learned banks.',
            'External TrAI model service unavailable offline; local code stays configured.',
            'Window-end positions are reported separately by the current runner; headline trade P&L is not a fully reconciled liquidation-equity ranking.']}
    write_json(output / 'matrix.json', aggregate)

    def dispatch(cell):
        payload = {'plan': plan, 'cell': cell, 'candles': candles, 'sources': manifest}
        command = ['python3', 'scripts/test-isolated.py', '--', 'python3', 'tools/backtest-matrix.py', '--cell']
        process = subprocess.run(command, cwd=ROOT, input=json.dumps(payload), text=True,
                                 capture_output=True, env={'PATH': os.environ.get('PATH', '/usr/bin:/bin'),
                                                          'TMPDIR': os.environ.get('TMPDIR', str(output))})
        messages = [line[len(RESULT_PREFIX):] for line in process.stdout.splitlines() if line.startswith(RESULT_PREFIX)]
        if len(messages) == 1:
            result = json.loads(messages[0])
        else:
            result = {'cell': cell, 'status': 'failed', 'failure': 'sandbox_no_unique_receipt', 'report': None,
                      'log': process.stdout}
        result['sandboxExitCode'] = process.returncode
        if process.returncode != 0:
            result['status'] = 'failed'
            result.setdefault('failure', 'sandbox_nonzero_exit')
        log = result.pop('log', '')
        (output / f"{cell['id']}.log").write_text(log + '\n' + process.stderr)
        write_json(output / f"{cell['id']}.json", result)
        return result

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(dispatch, cell): cell for cell in cells}
        for future in as_completed(futures):
            cell = futures[future]
            try:
                result = future.result()
            except Exception as error:
                result = {'cell': cell, 'status': 'failed', 'failure': f'{type(error).__name__}: {error}', 'report': None}
                write_json(output / f"{cell['id']}.json", result)
            report = result.get('report') or {}
            row = {'cell': cell, 'status': result['status'], 'failure': result.get('failure'),
                   'receipt': f"{cell['id']}.json", 'summary': report.get('summary'),
                   'windowEndPositions': len(report.get('windowEndPositions', [])),
                   'consumerEvidence': result.get('consumerEvidence')}
            aggregate['results'].append(row)
            order = {c['id']: i for i, c in enumerate(cells)}
            aggregate['results'].sort(key=lambda r: order[r['cell']['id']])
            aggregate['finishedCells'] += 1
            aggregate['failedCells'] += result['status'] == 'failed'
            write_json(output / 'matrix.json', aggregate)
            print(f"{aggregate['finishedCells']}/{len(cells)} {cell['id']} {result['status']} {result.get('failure') or ''}", flush=True)
    fields = ['id', 'confidence', 'atrMinPercent', 'stopLoss', 'status', 'totalTrades', 'totalPnL', 'totalFeesPaid', 'maxDrawdownPercent', 'winRate', 'windowEndPositions', 'failure']
    with (output / 'matrix.csv').open('w', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for row in aggregate['results']:
            summary = row['summary'] or {}
            writer.writerow({**row['cell'], 'status': row['status'],
                **{k: summary.get(k) for k in fields[5:10]},
                'windowEndPositions': row['windowEndPositions'], 'failure': row['failure']})
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
        require_isolation()
        payload = json.load(sys.stdin)
        changed = [name for name, digest in payload['sources'].items()
                   if not (ROOT / name).is_file() or hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != digest]
        if changed:
            result = {'cell': payload['cell'], 'status': 'failed', 'failure': 'source_changed_before_cell', 'changed': changed, 'report': None}
        else:
            try:
                result = run_cell(payload)
            except Exception as error:
                result = {'cell': payload['cell'], 'status': 'failed', 'failure': f'{type(error).__name__}: {error}', 'report': None}
        print(RESULT_PREFIX + json.dumps(result, allow_nan=False), flush=True)
        return 1 if result['status'] == 'failed' else 0
    if args.plan is None or args.data is None or (args.output is None and not args.dry_run):
        parser.error('--plan and --data are required, plus --output unless --dry-run')
    if args.workers < 1:
        parser.error('--workers must be positive')
    plan = json.loads(args.plan.read_text())
    candles = json.loads(args.data.read_text())
    cells = validate_plan(plan, json.loads((ROOT / 'config/settings.json').read_text()))
    validate_candles(candles, plan['identity'])
    if args.dry_run:
        print(json.dumps({'cells': cells, 'total': len(cells), 'candles': len(candles), 'plan': plan}, indent=2))
        return 0
    assert args.output is not None
    aggregate = execute_matrix(plan, candles, args.output.resolve(), args.workers)
    print(f"Results: {args.output.resolve() / 'matrix.json'}", flush=True)
    return 1 if aggregate['failedCells'] else 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f'Matrix input/execution error: {error}', file=sys.stderr)
        sys.exit(2)
