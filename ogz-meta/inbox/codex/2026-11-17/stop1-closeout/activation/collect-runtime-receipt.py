"""Read-only observation for this activation; private baseline is required."""
from pathlib import Path
import collections
import datetime
import hashlib
import json
import re
import socket
import subprocess
import urllib.request

root = Path.cwd()
packet = root / 'ogz-meta/inbox/codex/2026-11-17/stop1-closeout'
folder = packet / 'activation'
before = json.loads((folder / 'private/before.json').read_text())
roundtrip = json.loads((folder / 'live-roundtrip-receipt.json').read_text())
old_settings = json.loads((root / 'ogz-meta/inbox/codex/2026-11-17/journal-activation-012010/live-settings-stop1-before-hot-activation.json').read_text())
current_settings = json.loads((root / 'ogz-meta/inbox/codex/2026-11-17/journal-activation-012010/live-settings-stop1-final.json').read_text())
assert current_settings['success'] and current_settings['profile'] == 'paper'
assert set(old_settings['fields']) == set(current_settings['fields'])
assert all(old_settings['fields'][key]['value'] == row['value'] for key, row in current_settings['fields'].items())
assert all(row['source'].startswith('config:settings.json:') for row in current_settings['fields'].values())
assert not [key for key, row in current_settings['fields'].items() if 'restart' in row['effect']]
internals = json.loads((root / 'config/internals.json').read_text())
settings = json.loads((root / 'config/settings.json').read_text())
archived = set(json.loads((packet / 'fixtures/archived-env-names.json').read_text()))
roles = {'ogz-prime-v2': 'bot', 'ogz-websocket': 'websocket', 'ogz-supervisor': 'supervisor', 'ogz-stripe': 'checkout'}
processes = []
for proc in json.loads(subprocess.check_output(['pm2', 'jlist'])):
    if proc['name'] not in roles:
        continue
    env_info, pid = proc['pm2_env'], proc['pid']
    old = next(row for row in before['processes'] if row['name'] == proc['name'])
    assert pid != old['pid'] and env_info['restart_time'] == old['restarts'] + 1
    assert env_info['status'] == 'online' and env_info['pm_cwd'] == str(root)
    pairs = (Path('/proc') / str(pid) / 'environ').read_bytes().split(b'\0')
    env = {part.split(b'=', 1)[0].decode(): part.split(b'=', 1)[1].decode(errors='replace') for part in pairs if b'=' in part}
    # NODE_ENV was archived from .env; the ecosystem still legitimately owns
    # process posture through internals. It is not a retired trading override.
    assert not (archived - {'NODE_ENV'}).intersection(env)
    assert env.get('NODE_ENV') == internals['deployment']['pm2'][roles[proc['name']]]['nodeEnv']
    assert env.get('DOTENV_CONFIG_PATH') is None and env.get('BACKTEST_RUN_DESCRIPTOR_PATH') is None
    if roles[proc['name']] == 'bot':
        assert env.get('PROFILE') == 'paper'
    processes.append({'name': proc['name'], 'pid': pid, 'status': env_info['status'], 'restarts': env_info['restart_time'],
        'startedAt': env_info['pm_uptime'], 'cwd': env_info['pm_cwd'], 'script': env_info['pm_exec_path'],
        'onlyAuthorizedRestartObserved': True, 'environmentKeys': sorted(env),
        'bootstrap': {key: env.get(key) for key in ['PROFILE', 'DOTENV_CONFIG_PATH', 'BACKTEST_RUN_DESCRIPTOR_PATH', 'NODE_ENV', 'PM2_HOME']},
        'archivedTradingOverridesPresent': [], 'nodeEnvMatchesCanonicalDeploymentPosture': True})
assert len(processes) == 4
state = json.loads((root / internals['paths']['stateFile']).read_text())
active = dict(state['activeTrades'])
positions = []
for old in before['state']['trades']:
    trade = active[old['id']]
    assert all(trade[key] == old[key] for key in ['symbol', 'direction', 'entryPrice', 'sizeUsd'])
    policy_hash = hashlib.sha256(json.dumps(trade['frozenExitPolicy'], sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    assert policy_hash == old['policySha256'] and trade.get('operatorStop') == old['operatorStop']
    positions.append({**old, 'stillOpen': True, 'entryFactsPreserved': True, 'frozenPolicyPreserved': True, 'operatorStopPreserved': True})
assert not state['pauseReason'] and not state['symbolEntryHalts']
logs, errors, applied, relay, hydration = {}, {}, [], [], []
for name, paths in before['logs'].items():
    logs[name] = {}
    for kind, item in paths.items():
        with Path(item['path']).open('rb') as handle:
            handle.seek(item['offset'])
            raw = handle.read()
        (folder / 'private' / (name + '-' + kind + '.log')).write_bytes(raw)
        lines = raw.decode(errors='replace').splitlines()
        logs[name][kind] = {'lineCount': len(lines), 'sha256': hashlib.sha256(raw).hexdigest()}
        if kind == 'pm_err_log_path':
            counts = collections.Counter()
            for line in lines:
                label = ('preexisting_30m_1d_nonactive_subscription' if 'TIMEFRAME-NON-ACTIVE' in line else
                    'shutdown_socket_closed' if 'dashboard WebSocket closed' in line else
                    'journal_open_exposure_refusal' if 'Refusing open-trade reconciliation' in line else 'unclassified')
                counts[label] += 1
            errors[name] = dict(counts)
        for line in lines:
            if '[SETTINGS_APPLIED]' in line:
                applied.append(json.loads(line[line.index('{'):]))
            if '[TRAI_REQUEST_CONFIGURATION]' in line:
                relay.append(json.loads(line[line.index('{'):]))
            if '[REST_HYDRATION_COMPLETE]' in line:
                hydration.append({'hydrated': json.loads(re.search(r'hydrated=(\[.*?\]) unavailable=', line).group(1)),
                    'unavailable': json.loads(re.search(r'unavailable=(\[.*?\]) recovered=', line).group(1)),
                    'ready': 'status="ready"' in line,
                    'recoveryPending': json.loads(re.search(r'recoveryPending=(\[.*?\]) status=', line).group(1))})
assert hydration and hydration[-1]['ready'] and not hydration[-1]['unavailable'] and not hydration[-1]['recoveryPending']
for event in [row for row in roundtrip['messages'] if row.get('applied')]:
    assert any(row.get('requestId') == event['requestId'] and row['configuration'] == event['configuration'] for row in applied)
    assert any(row['configuration'] == event['configuration'] for row in relay)
decision_file = root / 'logs/decisions/autopsy_2026-11-17.jsonl'
with decision_file.open('rb') as handle:
    handle.seek(max(0, decision_file.stat().st_size - 1500000))
    decision_lines = handle.read().decode(errors='replace').splitlines()
decisions = []
for line in decision_lines:
    try:
        row = json.loads(line)
    except json.JSONDecodeError:
        continue
    if row.get('configuration') == current_settings['configuration']:
        decisions.append({key: row.get(key) for key in ['traceId', 'timestamp', 'symbol', 'timeframe', 'status', 'skipReason', 'configuration']})
assert decisions
history = []
for row in before['history']:
    file = root / row['path']
    preserved = False
    if file.exists():
        with file.open('rb') as handle:
            preserved = hashlib.sha256(handle.read(row['bytes'])).hexdigest() == row['sha256']
    history.append({'path': row['path'], 'present': file.exists(), 'previousBytesPreserved': preserved})
ledgers = [row for row in history if Path(row['path']).name == 'trade-ledger.jsonl']
assert all(row['present'] and row['previousBytesPreserved'] for row in ledgers)
assert all(row['present'] for row in history)
health = {}
for suffix in ['/api/health', '/control-panel.html']:
    with urllib.request.urlopen(f"http://{settings['services']['dashboard']['host']}:{settings['services']['dashboard']['port']}{suffix}", timeout=15) as response:
        body = response.read()
        health[suffix] = {'status': response.status, 'bytes': len(body), 'cacheControl': response.headers.get('Cache-Control')}
with socket.create_connection((settings['services']['dashboard']['host'], settings['services']['checkout']['port']), timeout=5):
    health['checkout'] = {'port': settings['services']['checkout']['port'], 'acceptsConnection': True}
with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
    client.settimeout(5)
    client.connect(internals['services']['supervisor']['recovery']['socketPath'])
    client.sendall(b'GET /recovery HTTP/1.0\r\nHost: local\r\n\r\n')
    body = b''
    while True:
        chunk = client.recv(8192)
        if not chunk:
            break
        body += chunk
    health['supervisorRecovery'] = {'httpStatusLine': body.split(b'\r\n', 1)[0].decode(), 'responseReceived': bool(body)}
receipt = {'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'policyHashMethod': 'sha256 of Python json.dumps(policy, sort_keys=True, separators=(comma, colon)), UTF-8',
    'activation': json.loads((folder / 'activation-command.json').read_text()),
    'activatedHead': before['head'], 'branch': before['branch'], 'sourceIncludesPreservedInheritedWork': True,
    'sourceManifest': before['source'], 'processes': processes, 'configuration': current_settings['configuration'],
    'profile': current_settings['profile'], 'editableFieldCount': len(current_settings['fields']),
    'allEditableSourcesCanonicalSettings': True, 'allEditableValuesRestoredToPreActivation': True,
    'restartRequiredDescriptors': 0, 'positionPreservation': positions, 'pauseReason': state['pauseReason'],
    'symbolHalts': state['symbolEntryHalts'], 'hydration': hydration[-1],
    'hotSaveAndRestoreConfirmedInBotAndRelayLogs': True, 'settingsApplied': applied,
    'relayConfigurationReceipts': relay[-5:], 'decisionRecordCountAtCurrentRevision': len(decisions),
    'decisionSamples': decisions[-3:], 'health': health,
    'history': {'filesChecked': len(history), 'missing': 0,
        'priorByteRangesPreserved': sum(row['previousBytesPreserved'] for row in history),
        'tradeLedgerFiles': len(ledgers), 'allTradeLedgerPriorBytesPreserved': True,
        'changedReplayFiles': [Path(row['path']).name for row in history if not row['previousBytesPreserved']],
        'limit': 'Existing replay files advanced post-exit capture. Prior full replay payloads were not backed up in this activation; field-by-field preservation of rewritten replays is not claimed.'},
    'stderrClassification': errors, 'logManifest': logs,
    'startupObservations': ['Supervisor observed one HTTP 502 during relay reload and then returned to HEALTHY.',
        'TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are absent from .env; Telegram prompt delivery is not established.',
        'Supervisor deadman URL is absent and its boot log explicitly reports disabled.'],
    'limitations': ['No live trade stop was changed; UI/relay functions and actual state/exit modules were exercised in isolation.',
        'No rendered-browser proof, stock-session or full session-switch certification in this Stop 1 activation.',
        'Auxiliary role ownership uses current isolated source checks, actual bootstrap environments and startup paths. Runtime settings identity is directly returned by the bot; no auxiliary introspection endpoint was added.',
        'No fresh RAG publication or complete-panel consensus is claimed.']}
(folder / 'runtime-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({key: receipt[key] for key in ['observedAt', 'configuration', 'decisionRecordCountAtCurrentRevision', 'history', 'health', 'stderrClassification']}, indent=2))
