#!/usr/bin/env python3
"""Run helper verification in disposable storage with no host services/secrets."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIRS = {
    'core', 'foundation', 'modules', 'brokers', 'utils', 'server', 'test',
    'tests', 'scripts', 'tools', 'pine-transpiler', 'backtest', 'trai_brain',
    'public', 'config', 'ogz-meta', 'deploy', '.github', '.claude',
}
SOURCE_SUFFIXES = {'.js', '.cjs', '.mjs', '.json', '.ts', '.py', '.sh', '.html', '.css', '.md', '.yml', '.yaml'}
PRIVATE_ROOTS = {'data', 'logs', 'backups', 'backtest-results', 'profiles'}
PRIVATE_META = {'inbox', 'archive', 'ledger', 'cognition-history', 'sessions', 'evidence', 'proposals', 'health-reports'}
BOOTSTRAP = ('scripts/test-isolated.py', 'test/helpers/require-isolation.cjs')


def eligible(relative):
    parts = relative.parts
    if any(p.startswith('.') and not (i == 0 and p in {'.github', '.claude'}) for i, p in enumerate(parts)):
        return False
    if 'node_modules' in parts or parts[0] in PRIVATE_ROOTS:
        return False
    if parts[0] == 'config' and len(parts) > 2:
        return False
    if parts[0] == '.claude' and len(parts) > 1 and parts[1] in {'memory', 'session-state'}:
        return False
    if parts[0] == 'public' and 'proof' in parts and relative.suffix not in {'.js', '.html', '.css'}:
        return False
    if parts[0] == 'trai_brain' and ('models' in parts or relative.name == 'trai_journal.jsonl'):
        return False
    if parts[0] == 'ogz-meta' and (len(parts) > 1 and parts[1] in PRIVATE_META or relative.suffix not in {'.js', '.cjs', '.mjs', '.py', '.sh'} and 'test-fixtures' not in parts):
        return False
    if relative.name in {'credentials.json', 'secrets.json'}:
        return False
    return (len(parts) == 1 or parts[0] in SOURCE_DIRS) and relative.suffix in SOURCE_SUFFIXES


def copy_source(relative, destination):
    source = ROOT / relative
    # Never follow a source symlink into a runtime bank or operator directory.
    if source.is_symlink() or source.resolve() != source or not source.is_file():
        raise ValueError(f'Non-regular source cannot enter helper sandbox: {relative}')
    target = destination / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    target.chmod(source.stat().st_mode & 0o777)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fixture', action='append', default=[], help='Additional repo file beneath a fixtures/ directory')
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command
    if command[:1] == ['--']:
        command = command[1:]
    if not command:
        parser.error('provide a command after --')
    if sys.platform != 'linux' or not shutil.which('bwrap'):
        parser.error('Linux bubblewrap is required; verification will not run unisolated')
    fixtures = []
    for value in args.fixture:
        relative = Path(value)
        if relative.is_absolute() or '..' in relative.parts or 'fixtures' not in relative.parts or relative.suffix not in SOURCE_SUFFIXES or any(p.startswith('.') for p in relative.parts):
            parser.error('--fixture must name a repo-relative source file beneath fixtures/')
        if not (ROOT / relative).is_file():
            parser.error(f'fixture does not exist: {relative}')
        fixtures.append(relative)

    tracked = subprocess.check_output(['git', '-C', str(ROOT), 'ls-files', '-z']).decode().split('\0')
    sources = {Path(name) for name in tracked if name and eligible(Path(name))}
    sources.update(Path(name) for name in BOOTSTRAP)
    sources.update(fixtures)
    # This directory is created exclusively for this invocation. No real state,
    # journals, learned banks, .env, home, PM2 socket or git metadata is copied.
    with tempfile.TemporaryDirectory(prefix='ogz-helper-isolation-') as scratch:
        workspace = Path(scratch) / 'workspace'
        workspace.mkdir()
        for relative in sorted(sources):
            if (ROOT / relative).exists():
                copy_source(relative, workspace)
        marker = Path(scratch) / 'isolation.json'
        marker.write_text(json.dumps({
            'hostNamespaces': {name: os.readlink(f'/proc/self/ns/{name}') for name in ('mnt', 'net', 'pid')},
            'projectRoot': str(ROOT),
        }))
        argv = [shutil.which('bwrap'), '--unshare-all', '--unshare-user', '--disable-userns', '--die-with-parent', '--new-session', '--cap-drop', 'ALL', '--clearenv']
        for directory in ('/usr', '/bin', '/sbin', '/lib', '/lib64'):
            if Path(directory).exists():
                argv += ['--ro-bind', directory, directory]
        argv += ['--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp', '--dir', '/tmp/home', '--dir', '/run']
        for filename in ('/etc/ld.so.cache', '/etc/passwd', '/etc/group'):
            if Path(filename).exists():
                argv += ['--ro-bind', filename, filename]
        argv += ['--bind', str(workspace), str(ROOT), '--ro-bind', str(ROOT / 'node_modules'), str(ROOT / 'node_modules'), '--ro-bind', str(marker), '/run/ogz-helper-isolation.json', '--chdir', str(ROOT)]
        for key, value in {'PATH': '/usr/bin:/bin', 'HOME': '/tmp/home', 'TMPDIR': '/tmp', 'NODE_ENV': 'test', 'LANG': 'C.UTF-8', 'TZ': 'America/New_York'}.items():
            argv += ['--setenv', key, value]
        print('[helper isolation] disposable source snapshot; host runtime, credentials and network excluded', file=sys.stderr, flush=True)
        # Clear the supervisor's environment too, not just the executed command:
        # an init process visible through /proc must never inherit host secrets.
        return subprocess.run([*argv, '--', *command], cwd=ROOT, env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'}).returncode


if __name__ == '__main__':
    sys.exit(main())
