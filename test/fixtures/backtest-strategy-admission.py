"""Native strategy selection observations; synthetic candles, no profit claim."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import sys

root = Path.cwd()
marker = json.loads(Path('/run/ogz-helper-isolation.json').read_text())
assert marker['projectRoot'] == str(root)
assert all(os.readlink(f'/proc/self/ns/{name}') != value
           for name, value in marker['hostNamespaces'].items())
# Optional explicit source restoration is confined to disposable isolation.
if len(sys.argv) > 1:
    snapshot = json.loads(Path(sys.argv[1]).read_text())
    for name, source in snapshot['overlay'].items():
        target = root / name
        assert target.resolve().is_relative_to(root) and not target.is_symlink()
        target.write_text(source)
spec = importlib.util.spec_from_file_location('matrix', root / 'tools/backtest-matrix.py')
assert spec is not None and spec.loader is not None
matrix = importlib.util.module_from_spec(spec)
spec.loader.exec_module(matrix)
matrix.require_isolation()
settings_path = root / 'config/settings.json'
settings = json.loads(settings_path.read_text())
assert settings['launchProfiles']['paper']['pipeline']['enableMarketRegime'] is False
plan = json.loads((root / 'tools/backtest-matrix.example.json').read_text())
plan.update(confidence=[0.4], atrMinPercent=[0.1], strategies=['MarketRegime'])
plan['stopLoss'] = {'paths': ['exitContracts.MarketRegime.stopLossPercent'],
                    'unit': 'percent', 'values': [-0.5]}
candles = [dict(timestamp=1704205800000, open=10, high=11, low=9, close=10.5,
                volume=10000, symbol='TSLA', timeframe='15m', complete=True)]
cell = matrix.validate_plan(plan, settings)[0]
result = matrix.run_cell({'plan': plan, 'cell': cell, 'candles': candles})
print('STRATEGY_ADMISSION ' + json.dumps(result), flush=True)
assert result['status'] == 'failed', result['status']
assert result['failure'] == 'inactive_strategy_selection', result.get('failure')
assert result['strategySelection'] == {
    'requested': ['MarketRegime'], 'active': [], 'inactive': ['MarketRegime']}
assert result['report'] is None and 'runnerExitCode' not in result
assert json.loads(settings_path.read_text())['launchProfiles']['matrix-replay']['pipeline']['enableMarketRegime'] is False
print('DISABLED_SELECTION_REJECTED_WITHOUT_RUNNER', flush=True)
# A partially disabled selection must not silently become a smaller experiment.
settings_path.write_text(json.dumps(settings))
mixed = copy.deepcopy(plan)
mixed['strategies'] = ['EMASMACrossover', 'MarketRegime']
mixed['stopLoss']['paths'] = [f'exitContracts.{name}.stopLossPercent' for name in mixed['strategies']]
result = matrix.run_cell({'plan': mixed, 'cell': cell, 'candles': candles})
assert result['failure'] == 'inactive_strategy_selection', result
assert result['strategySelection'] == {'requested': mixed['strategies'],
    'active': ['EMASMACrossover'], 'inactive': ['MarketRegime']}
assert result['report'] is None and 'runnerExitCode' not in result
print('PARTIALLY_DISABLED_SELECTION_REJECTED', flush=True)
# An enabled strategy which does not trade is still a real no-trade experiment.
settings_path.write_text(json.dumps(settings))
active = copy.deepcopy(plan)
active['strategies'] = ['EMASMACrossover']
active['stopLoss']['paths'] = ['exitContracts.EMASMACrossover.stopLossPercent']
result = matrix.run_cell({'plan': active, 'cell': cell, 'candles': candles})
assert result['status'] == 'no_trades', result
assert result['runnerExitCode'] == 0
assert result['strategySelection'] == {'requested': active['strategies'],
    'active': active['strategies'], 'inactive': []}
assert result['report']['dataCoverage']['candlesProcessed'] == len(candles)
print('ACTIVE_NO_TRADE_EXPERIMENT_PRESERVED', flush=True)
settings_path.write_text(json.dumps(settings))
