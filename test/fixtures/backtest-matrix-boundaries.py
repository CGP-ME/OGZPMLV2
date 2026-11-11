"""Native CLI boundary observations. Explicit invalid inputs, never fake results."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path.cwd()
spec = importlib.util.spec_from_file_location('matrix', root / 'tools/backtest-matrix.py')
assert spec is not None and spec.loader is not None
matrix = importlib.util.module_from_spec(spec)
spec.loader.exec_module(matrix)
matrix.require_isolation()
cell = {'id': 'source-drift-observation', 'confidence': .4, 'atrMinPercent': .1, 'stopLoss': -.5}
# Real child CLI must reject an unexpected source before configuration or app startup.
payload = {'cell': cell, 'sources': {'tools/backtest-matrix.py': 'deliberately-not-a-source-digest'}}
process = subprocess.run([sys.executable, 'tools/backtest-matrix.py', '--cell'],
                         input=json.dumps(payload), text=True, capture_output=True)
lines = [x[len(matrix.RESULT_PREFIX):] for x in process.stdout.splitlines() if x.startswith(matrix.RESULT_PREFIX)]
assert process.returncode == 1 and len(lines) == 1, (process.returncode, process.stderr)
receipt = json.loads(lines[0])
assert receipt['status'] == 'failed' and receipt['failure'] == 'source_changed_before_cell'
assert receipt['report'] is None and receipt['changed'] == ['tools/backtest-matrix.py']

# Invalid public plans must fail before creating an output directory.
with tempfile.TemporaryDirectory(prefix='matrix-boundary-') as scratch:
    p = Path(scratch)
    (p / 'plan.json').write_text(json.dumps({'confidnce': [.4]}))
    (p / 'data.json').write_text('[]')
    process = subprocess.run([sys.executable, 'tools/backtest-matrix.py', '--plan', str(p / 'plan.json'),
        '--data', str(p / 'data.json'), '--output', str(p / 'must-not-exist')], text=True, capture_output=True)
    assert process.returncode == 2, (process.returncode, process.stderr)
    assert 'Plan keys must be exactly' in process.stderr
    assert not (p / 'must-not-exist').exists()
print(json.dumps({'observations': ['source drift produces named failed receipt and nonzero exit',
    'invalid public plan exits before output or application startup'], 'sourceDriftReceipt': receipt}))
