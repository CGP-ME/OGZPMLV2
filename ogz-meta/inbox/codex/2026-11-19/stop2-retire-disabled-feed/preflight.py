"""Read-only activation preflight. Captures no credential values and restarts nothing."""
from pathlib import Path
import datetime, hashlib, json, subprocess

ROOT = Path('/opt/ogzprime/OGZPMLV2')
PACKET = Path(__file__).resolve().parent
DAY = PACKET.parent
sha = lambda b: hashlib.sha256(b).hexdigest()
def read(name):
    return json.loads((ROOT / name).read_text())

previous = read('ogz-meta/inbox/codex/2026-11-19/stop2-paper-activation/runtime-receipt.json')
prior_preflight = read('ogz-meta/inbox/codex/2026-11-19/stop2-paper-activation/preflight.json')
expected = {x['path']: x['sha256'] for x in previous['sourceManifest']}
for lane in ['stop2-indicator-refresh', 'stop2-indicator-samples']:
    expected.update(json.loads((DAY / lane / 'source-identity.json').read_text())['sourceHashes'])
expected['run-empire-v2.js'] = json.loads((DAY / 'stop2-history-broker-owner/source-identity.json').read_text())['sourceHash']
expected.update(json.loads((DAY / 'stop2-observed-analytics/source-identity.json').read_text())['workingCandidateHashes'])
expected.update(json.loads((PACKET / 'source-identity.json').read_text())['workingSourceHashes'])
observed = {f: sha((ROOT / f).read_bytes()) for f in expected}
drift = [f for f in expected if expected[f] != observed[f]]
internals, settings = read('config/internals.json'), read('config/settings.json')
processes = json.loads(subprocess.check_output(['pm2', 'jlist'], cwd=ROOT))
before = {p['name']: p for p in prior_preflight['processes']}
activated = {p['name']: p for p in previous['processes']}
process_rows = []
offsets = {}
for p in processes:
    e = p['pm2_env']
    environ = dict(row.split('=', 1) for row in Path(f'/proc/{p["pid"]}/environ').read_bytes().decode().split('\0') if '=' in row)
    bootstrap = internals['deployment']['pm2']['launchEnvironment'] | {'PM2_HOME': internals['services']['supervisor']['pm2Home']}
    process_rows.append({
        'name': p['name'], 'pid': p['pid'], 'status': e['status'], 'restarts': e['restart_time'],
        'startedAt': e['pm_uptime'], 'cwd': e['pm_cwd'], 'script': e['pm_exec_path'],
        'profile': environ.get('PROFILE'),
        'canonicalBootstrapMatches': all(environ.get(k) == str(v) for k, v in bootstrap.items()),
        'environmentKeysAddedSinceApprovedPreflight': sorted(set(environ) - set(before[p['name']]['environmentKeys'])),
        'environmentKeysRemovedSinceApprovedPreflight': sorted(set(before[p['name']]['environmentKeys']) - set(environ)),
        'samePidAsLastActivation': p['pid'] == activated[p['name']]['pid'],
        'alternateDotenvPathPresent': 'DOTENV_CONFIG_PATH' in environ,
        'backtestDescriptorPresent': 'OGZ_BACKTEST_RUN_DESCRIPTOR' in environ,
    })
    offsets[p['name']] = {key: {'path': e[key], 'size': Path(e[key]).stat().st_size} for key in ['pm_out_log_path','pm_err_log_path']}
state_path = ROOT / 'data/state-paper.json'
state = json.loads(state_path.read_text())
result = {
    'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'sourceHead': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT).decode().strip(),
    'branch': subprocess.check_output(['git', 'branch', '--show-current'], cwd=ROOT).decode().strip(),
    'priorActivationHead': previous['activatedHead'], 'reviewedSourceFiles': len(expected),
    'unexpectedSourceDrift': drift, 'sourceManifest': [{'path': f, 'sha256': h} for f,h in observed.items()],
    'configurationFiles': [{'path': 'config/'+name+'.json', 'revision': data['revision'], 'rawFileSHA256': sha((ROOT/'config'/ (name+'.json')).read_bytes())} for name,data in [('settings',settings),('internals',internals)]],
    'canonicalProfile': internals['deployment']['pm2']['bot']['launchProfile'],
    'canonicalMode': settings['launchProfiles'][internals['deployment']['pm2']['bot']['launchProfile']]['mode'],
    'processes': process_rows, 'activePositionCount': len(state['activeTrades']),
    'pauseReason': state['pauseReason'], 'symbolHaltCount': len(state['symbolEntryHalts']),
    'stateFileSHA256': sha(state_path.read_bytes()), 'activationPerformed': False,
    'proposedCommand': ['pm2','restart','ecosystem.config.js','--only','ogz-supervisor,ogz-websocket,ogz-stripe,ogz-prime-v2','--update-env'],
    'reasonForAllFour': 'All four roles load canonical config snapshots; internals revision 14 removes the obsolete fabricated ratio. Refresh all role provenance together.',
    'authorizationStatus': 'Separate approval pending; no command executed',
    'preservation': 'No state/journal/history writes, no stashes, resets, worktrees or unrelated staging. Refresh this preflight immediately before an approved activation.',
}
(PACKET/'preflight.json').write_text(json.dumps(result, indent=2)+'\n')
(PACKET/'private/preflight-log-offsets.json').write_text(json.dumps(offsets, indent=2)+'\n')
print(json.dumps({k: result[k] for k in ['sourceHead','reviewedSourceFiles','unexpectedSourceDrift','canonicalMode','activePositionCount','pauseReason','symbolHaltCount']}))
print(json.dumps(process_rows, indent=2))
assert not drift, 'Unexpected source drift must be reconciled before activation'
assert result['canonicalMode'] == 'paper'
assert all(p['status'] == 'online' and p['canonicalBootstrapMatches'] and p['samePidAsLastActivation'] for p in process_rows)
assert all(not p['environmentKeysAddedSinceApprovedPreflight'] and not p['alternateDotenvPathPresent'] and not p['backtestDescriptorPresent'] for p in process_rows)
