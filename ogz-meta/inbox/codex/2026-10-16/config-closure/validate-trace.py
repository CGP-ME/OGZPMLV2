"""Validate the complete owner/source accounting; this does not run the bot."""
import collections
import json
from pathlib import Path
import subprocess

packet = Path(__file__).resolve().parent
manifest = json.loads((packet / 'provenance/current-source-manifest.json').read_text())
ref = manifest['ref']
duplicate_keys = []


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            duplicate_keys.append(key)
        result[key] = value
    return result


def leaves(value, prefix=''):
    if isinstance(value, dict) and value:
        for key, child in value.items():
            yield from leaves(child, f'{prefix}.{key}' if prefix else key)
    elif isinstance(value, list) and value:
        for index, child in enumerate(value):
            yield from leaves(child, f'{prefix}.{index}')
    else:
        yield prefix


canonical = {}
for owner in ['config/settings.json', 'config/internals.json']:
    raw = subprocess.check_output(['git', 'show', f'{ref}:{owner}'])
    blob = subprocess.check_output(['git', 'hash-object', '--stdin'], input=raw).decode().strip()
    assert blob == manifest['files'][owner]
    canonical[owner] = set(leaves(json.loads(raw, object_pairs_hook=unique_object)))
assert not duplicate_keys, duplicate_keys
shared_paths = canonical['config/settings.json'] & canonical['config/internals.json']
assert shared_paths == {'revision', 'schemaVersion'}, shared_paths

rows = json.loads((packet / 'provenance/canonical-source-join.json').read_text())
keys = [(row['owner'], row['path']) for row in rows]
assert len(keys) == len(set(keys))
expected = {(owner, key) for owner, paths in canonical.items() for key in paths}
assert set(keys) == expected, {'missing': sorted(expected - set(keys)), 'extra': sorted(set(keys) - expected)}
proof = json.loads((packet / 'provenance/current-result.json').read_text())
assert proof['candidate'] == ref
for row in rows:
    for source in row['runtimeSources']:
        assert proof['sourceMaps'][source['snapshot']][source['runtimePath']] == source['source']
dispositions = json.loads((packet / 'provenance/canonical-dispositions.json').read_text())
conditional = {(row['canonicalOwner'], row['canonicalPath']) for row in dispositions['rows']}
unprojected = {(row['owner'], row['path']) for row in rows if not row['runtimeSources']}
assert conditional == unprojected

env = json.loads((packet / 'inventory/final-env-dispositions.json').read_text())
env_keys = [row['key'] for row in env['rows']]
assert len(env_keys) == len(set(env_keys)) == 184
print(json.dumps({
    'candidate': ref,
    'canonicalLeavesAndEmptyContainers': len(rows),
    'roleSourceJoined': len(rows) - len(conditional),
    'conditionalProfileToolDeploymentRows': len(conditional),
    'unaccountedCanonicalPaths': 0,
    'duplicateJsonProperties': 0,
    'sharedCanonicalPaths': sorted(shared_paths),
    'archivedEnvNamesAccounted': len(env_keys),
    'boundary': 'Complete owner/source accounting, not full consumer behavior or runtime activation acceptance.'
}, indent=2))
