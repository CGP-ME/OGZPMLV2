"""Fourth Shape: invalid units are named before dispatch, not exception flow."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

root = Path.cwd()
spec = importlib.util.spec_from_file_location('matrix', root / 'tools/backtest-matrix.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
assert not m.rejected(m.require_isolation())
settings = json.loads((root / 'config/settings.json').read_text())
plan = json.loads((root / 'tools/backtest-matrix.example.json').read_text())
plan.update(confidence=[.4], atrMinPercent=[.1])
plan['stopLoss']['values'] = [-.5]
valid = [dict(timestamp=1704205800000, open=10, high=11, low=9, close=10, volume=1)]

def failed(value, stage):
    assert isinstance(value, dict) and value['status'] == 'failed', value
    assert value['stage'] == stage and value['failure'] and value['detail'], value

if len(sys.argv) == 1 or sys.argv[1] == 'input':
    for value in (None, [], {}, {**plan, 'baseProfile': []}, {**plan, 'feeProfile': {}}, {**plan, 'confidence': [True]}, {**plan, 'confidence': [float('nan')]}):
        failed(m.validate_plan(value, settings), 'plan')
    for value in (None, [], [None], [{**valid[0], 'open': None}], valid + valid, [{**valid[0], 'close': 12}]):
        failed(m.validate_candles(value, plan['identity']), 'candles')
    assert m.validate_candles(valid, plan['identity']) == valid
    assert len(m.validate_plan(plan, settings)) == 1
    print('INPUT_ROUTING_PASS')

if len(sys.argv) > 1 and sys.argv[1] == 'cli':
    import tempfile
    with tempfile.TemporaryDirectory() as directory:
        d = Path(directory)
        (d / 'data.json').write_text(json.dumps(valid))
        for value in ([], {}, {**plan, 'confidence': [True]}):
            (d / 'plan.json').write_text(json.dumps(value))
            p = subprocess.run([sys.executable, 'tools/backtest-matrix.py', '--plan', str(d/'plan.json'), '--data', str(d/'data.json'), '--output', str(d/'absent')], text=True, capture_output=True)
            assert p.returncode == 2 and '"stage": "plan"' in p.stderr, (p.returncode, p.stdout, p.stderr)
            assert 'Traceback' not in p.stderr and not (d/'absent').exists()
        (d/'plan.json').write_text(json.dumps(plan))
        p = subprocess.run([sys.executable, 'tools/backtest-matrix.py', '--plan', str(d/'plan.json'), '--data', str(d/'data.json'), '--dry-run'], text=True, capture_output=True)
        assert p.returncode == 0 and json.loads(p.stdout)['total'] == 1, p.stderr
    for value in ('{', '[]', '{}'):
        p = subprocess.run([sys.executable, 'tools/backtest-matrix.py', '--cell'], input=value, text=True, capture_output=True)
        lines = [x[len(m.RESULT_PREFIX):] for x in p.stdout.splitlines() if x.startswith(m.RESULT_PREFIX)]
        assert p.returncode == 1 and len(lines) == 1 and 'Traceback' not in p.stderr, (p.stdout,p.stderr)
        failed(json.loads(lines[0]), 'worker_input')
    print('CLI_ROUTING_PASS')

if len(sys.argv) > 1 and sys.argv[1] == 'worker':
    from unittest.mock import patch
    cell = m.validate_plan(plan, settings)[0]
    for payload in (None, {}, {'plan': plan, 'cell': {}, 'candles': valid}, {'plan': {}, 'cell': cell, 'candles': valid}, {'plan': plan, 'cell': cell, 'candles': []}):
        result = m.run_cell(payload)
        assert m.rejected(result) and result['report'] is None, result
    with patch.object(m, 'require_isolation', return_value=m.failure('isolation','missing')):
        failed(m.run_cell({'plan': plan, 'cell': cell, 'candles': valid}), 'isolation')
    with patch.object(m.subprocess, 'run', side_effect=OSError(5, 'synthetic process fault')):
        failed(m.run_cell({'plan': plan, 'cell': cell, 'candles': valid}), 'configuration_probe')
    (root/'config/settings.json').write_text(json.dumps(settings))
    with patch.object(m.subprocess, 'run', return_value=subprocess.CompletedProcess([],0,'not-json','')):
        failed(m.run_cell({'plan': plan, 'cell': cell, 'candles': valid}), 'configuration_report')
    (root/'config/settings.json').write_text(json.dumps(settings))
    for report in (None, [], {}, {'trades': None}, {'trades': [None]}, {'trades': [{'strategyName': []}]}):
        failed(m.consumer_evidence(report, plan, cell), 'report')
    print('WORKER_ROUTING_PASS')

if len(sys.argv) > 1 and sys.argv[1] == 'publication':
    from unittest.mock import patch
    import tempfile
    import io
    import contextlib
    # Fault injection only at OS/process boundaries, real aggregate/publication code.
    plan['confidence'] = [.4, .5]
    cells = m.validate_plan(plan, settings)
    # Obtain the healthy receipt from the native producer, not a success-shaped
    # approximation that omits runner completion/coverage/configuration.
    healthy = m.run_cell({'plan': plan, 'cell': cells[1], 'candles': valid})
    assert healthy['status'] == 'no_trades', healthy
    (root/'config/settings.json').write_text(json.dumps(settings))
    def worker(command, **kwargs):
        payload = json.loads(kwargs['input'])
        c = payload['cell']
        if c == cells[0]:
            return subprocess.CompletedProcess(command, 0, m.RESULT_PREFIX + '[]', '')
        result = healthy
        return subprocess.CompletedProcess(command, 0, m.RESULT_PREFIX + json.dumps(result), '')
    with tempfile.TemporaryDirectory() as directory:
        d = Path(directory)
        with patch.object(m, 'source_manifest', return_value={'tools/backtest-matrix.py':'x','scripts/test-isolated.py':'y'}), patch.object(m.subprocess, 'run', side_effect=worker):
            result = m.execute_matrix(plan, valid, d/'continuation', 2)
            assert result['finishedCells'] == 2 and result['failedCells'] == 1, result
            assert result['results'][1]['status'] == 'no_trades', result
            assert all((d/'continuation'/row['receipt']).is_file() for row in result['results'])
            real_replace = m.os.replace
            def broken(source, target):
                if Path(target).name == cells[1]['id'] + '.json':
                    raise OSError(28, 'sensitive mock text must not leak')
                return real_replace(source,target)
            stderr = io.StringIO()
            with patch.object(m.os, 'replace', side_effect=broken), contextlib.redirect_stderr(stderr):
                result = m.execute_matrix(plan, valid, d/'publication-fault', 2)
            assert result['status'] == 'failed' and result['failedCells'] == 2, result
            assert 'publication' in stderr.getvalue() and 'OSError' in stderr.getvalue()
            assert 'sensitive mock text' not in stderr.getvalue()
            assert json.loads((d/'publication-fault/matrix.json').read_text())['status'] == 'failed'
        with patch.object(m.os, 'replace', side_effect=OSError(28,'secret')):
            failed(m.write_json(d/'unwritten.json', {}), 'publication')
    print('PUBLICATION_ROUTING_PASS')

if len(sys.argv) > 1 and sys.argv[1] == 'shapes':
    from unittest.mock import patch
    cell = m.validate_plan(plan, settings)[0]
    for value in (None, [], {}, {**settings, 'launchProfiles': None}, {**settings, 'exitContracts': None}):
        assert m.rejected(m.validate_plan(plan, value))
    for value in (None, [], {}):
        assert m.rejected(m.prepare_settings(settings, value, cell))
        assert m.rejected(m.expand_grid(value))
        assert m.rejected(m.validate_candles(valid, value))
    # CLI isolation absence remains a receipt, with no app invocation.
    real_read = Path.read_text
    def absent(path, *a, **kw):
        if str(path) == '/run/ogz-helper-isolation.json':
            raise FileNotFoundError(2, 'missing marker')
        return real_read(path,*a,**kw)
    with patch.object(Path, 'read_text', absent):
        failed(m.require_isolation(), 'isolation')
        failed(m.run_cell({'plan': plan,'cell': cell,'candles':valid}), 'isolation')
    print('SHAPES_ROUTING_PASS')

if len(sys.argv) > 1 and sys.argv[1] == 'reports':
    from unittest.mock import patch
    import copy
    cell = m.validate_plan(plan, settings)[0]
    # Native configuration probe, synthetic report transport at the process seam.
    native_run = subprocess.run
    for malformed in ('{', '[]', '{}', '{"trades": NaN}', json.dumps({'summary':{},'dataCoverage':{},'configuration':{},'windowEndPositions':[], 'trades':None})):
        (root/'config/settings.json').write_text(json.dumps(settings))
        def run(command, **kwargs):
            if command == ['node','run-empire-v2.js']:
                descriptor = json.loads(Path(kwargs['env']['BACKTEST_RUN_DESCRIPTOR_PATH']).read_text())
                output = Path(descriptor['report']['outputDir'])
                output.mkdir()
                (output/'report-malformed.json').write_text(malformed)
                return subprocess.CompletedProcess(command,0)
            return native_run(command,**kwargs)
        with patch.object(m.subprocess,'run',side_effect=run):
            result = m.run_cell({'plan':plan,'cell':cell,'candles':valid})
        assert m.rejected(result) and result['stage'] == 'report', result
    (root/'config/settings.json').write_text(json.dumps(settings))
    for text in ('NaN','Infinity','{"x":NaN}', '{"x":1e999}'):
        assert m.rejected(m.parse_json(text, 'report')), text
    print('REPORT_ROUTING_PASS')

if len(sys.argv) > 1 and sys.argv[1] == 'receipt':
    from unittest.mock import patch
    import tempfile
    cell = m.validate_plan(plan, settings)[0]
    for report in ([1], 'bad', 2):
        receipt = {'cell': cell, 'status': 'failed', 'failure': 'external_failure', 'report': report}
        process = subprocess.CompletedProcess([], 1, m.RESULT_PREFIX + json.dumps(receipt), '')
        with tempfile.TemporaryDirectory() as directory, patch.object(m, 'source_manifest', return_value={'tools/backtest-matrix.py':'x','scripts/test-isolated.py':'y'}), patch.object(m.subprocess,'run',return_value=process):
            result = m.execute_matrix(plan, valid, Path(directory)/'out')
            assert result['status'] == 'failed' and result['finishedCells'] == 1
            saved = json.loads((Path(directory)/'out'/result['results'][0]['receipt']).read_text())
            assert saved['failure'] == 'worker_report_failed' and saved['report'] is None
    print('RECEIPT_ROUTING_PASS')

if len(sys.argv) > 1 and sys.argv[1] == 'trade-rows':
    import contextlib
    import copy
    import io
    import runpy
    import tempfile
    from unittest.mock import patch
    original_settings = (root/'config/settings.json').read_text()
    with patch.object(sys, 'argv', ['test/fixtures/backtest-matrix-observation.py', '--integration']), contextlib.redirect_stdout(io.StringIO()):
        observed = runpy.run_path('test/fixtures/backtest-matrix-observation.py')
    m, plan, candles, healthy = (observed[k] for k in ('m', 'plan', 'candles', 'outcome'))
    (root/'config/settings.json').write_text(original_settings)
    plan.update(confidence=[.4, .5], atrMinPercent=[.1])
    plan['stopLoss']['values'] = [-.5]
    cells = m.validate_plan(plan, json.loads(original_settings))
    assert healthy['cell'] == cells[0] and healthy['status'] == 'complete'
    continuation = m.run_cell({'plan': plan, 'cell': cells[1], 'candles': candles})
    (root/'config/settings.json').write_text(original_settings)
    quiet = m.run_cell({'plan': plan, 'cell': cells[0], 'candles': candles[:1]})
    (root/'config/settings.json').write_text(original_settings)
    assert continuation['status'] == 'complete' and quiet['status'] == 'no_trades'
    def aggregate(receipts, data, selected_plan):
        def transport(command, **kwargs):
            cell = json.loads(kwargs['input'])['cell']
            receipt = next(x for x in receipts if x['cell'] == cell)
            return subprocess.CompletedProcess(command, 0, m.RESULT_PREFIX + json.dumps(receipt), '')
        with tempfile.TemporaryDirectory() as directory, patch.object(m, 'source_manifest', return_value={'tools/backtest-matrix.py':'x','scripts/test-isolated.py':'y'}), patch.object(m.subprocess, 'run', side_effect=transport):
            output = Path(directory)/'out'
            result = m.execute_matrix(selected_plan, data, output, 2)
            saved = [json.loads((output/row['receipt']).read_text()) for row in result['results']]
            return result, saved
    for receipt, data in ((healthy, candles), (quiet, candles[:1])):
        result, saved = aggregate([receipt], data, {**plan, 'confidence':[.4]})
        assert result['status'] == 'complete' and saved[0]['report'] == receipt['report']
        print('NATIVE_RECEIPT_ACCEPTED', receipt['status'], len(data), flush=True)
    mutations = [('empty_trade', (), {}),
                 ('missing_strategyName', ('strategyName',), None),
                 ('nonstring_strategyName', ('strategyName',), []),
                 ('missing_frozenExitPolicy', ('frozenExitPolicy',), None),
                 ('nonobject_frozenExitPolicy', ('frozenExitPolicy',), []),
                 ('missing_contract', ('frozenExitPolicy', 'contract'), None),
                 ('nonobject_contract', ('frozenExitPolicy', 'contract'), [])]
    for label, path, value in mutations:
        bad = copy.deepcopy(healthy)
        if not path:
            bad['report']['trades'][0] = value
        else:
            target = bad['report']['trades'][0]
            for key in path[:-1]:
                target = target[key]
            if value is None:
                target.pop(path[-1])
            else:
                target[path[-1]] = value
        assert len(bad['report']['trades']) == bad['report']['summary']['totalTrades']
        native = m.consumer_evidence(bad['report'], plan, cells[0])
        assert m.rejected(native) and native['stage'] == 'report', label
        result, saved = aggregate([bad, continuation], candles, plan)
        print('TRADE_ROW_OBSERVED', label, result['status'], result['failedCells'], flush=True)
        assert result['status'] == 'failed' and result['finishedCells'] == 2 and result['failedCells'] == 1, label
        assert saved[0]['failure'] == 'worker_report_failed' and saved[0]['report'] is None, label
        assert result['results'][0]['summary'] is None and result['results'][0]['windowEndPositions'] is None
        assert saved[1]['report'] == continuation['report'] and saved[1]['status'] == 'complete'
        print('TRADE_ROW_REJECTED_HEALTHY_CONTINUED', label, flush=True)
    print('NATIVE_TRADE_ROWS_PASS')
