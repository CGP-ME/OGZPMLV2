#!/usr/bin/env python3
"""Reconstruct exact source fixtures, then use the repository isolation launcher."""
from pathlib import Path
import argparse
import json
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('proof', choices=['roles', 'archived-env', 'all-editable'])
parser.add_argument('--source', choices=['baseline', 'current'], default='baseline')
args = parser.parse_args()
root = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip())
packet = Path(__file__).resolve().parent
manifest = json.loads((packet / ('provenance/current-source-manifest.json' if args.source == 'current' else 'provenance/source-manifest.json')).read_text())
ref = manifest['ref']
source_files = ['foundation/ConfigLoader.js', 'config/settings.json', 'config/internals.json']
if args.proof == 'all-editable':
    target = packet / 'all-editable/fixtures'
    probe = target / 'probe.cjs'
else:
    target = packet / 'provenance/fixtures/pinned'
    probe = packet / 'provenance/fixtures' / ('all-env-probe.cjs' if args.proof == 'archived-env' else 'provenance-probe.cjs')
target.mkdir(parents=True, exist_ok=True)
fixtures = [probe]
for filename in source_files:
    data = subprocess.check_output(['git', 'show', ref + ':' + filename], cwd=root)
    blob = subprocess.check_output(['git', 'hash-object', '--stdin'], input=data, cwd=root).decode().strip()
    assert blob == manifest['files'][filename], filename
    if args.proof == 'all-editable' and filename.endswith('.json'):
        data = b'module.exports = ' + data + b';\n'
    fixture = target / (filename.replace('/', '__') + '.cjs')
    fixture.write_bytes(data)
    fixtures.append(fixture)
# AtomicWrite is a production dependency of the loader. Refuse to silently use
# a different helper implementation; this assertion affects only this proof.
actual_atomic = subprocess.check_output(['git', 'hash-object', 'core/AtomicWrite.js'], cwd=root, text=True).strip()
assert actual_atomic == manifest['files']['core/AtomicWrite.js'], 'AtomicWrite source differs from receipt'
cmd = ['python3', 'scripts/test-isolated.py']
for fixture in fixtures:
    cmd.extend(['--fixture', str(fixture.relative_to(root))])
cmd.extend(['--', 'env', 'CONFIG_PROOF_REF='+ref, 'node', str(probe.relative_to(root))])
raise SystemExit(subprocess.call(cmd, cwd=root))
