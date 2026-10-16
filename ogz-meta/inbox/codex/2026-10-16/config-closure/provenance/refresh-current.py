#!/usr/bin/env python3
"""Refresh source identity or rebuild the canonical/source join from a pinned ref.

This is source/text accounting only.  It never imports ConfigLoader or another
production module, starts no process, and executes no role probe.  The intended
sequence is:

  1. refresh-current.py --ref <commit> --manifest-only
  2. rerun the isolated role probe to replace current-result.json
  3. refresh-current.py --ref <same-commit> --join

The join mode refuses a result from another candidate and requires the existing
1,693 conditional/unprojected canonical leaves to remain covered.  Source-map
labels are retained verbatim; only labels of the form config:<file>:<path> that
refer to an actual canonical path can associate a runtime route with a leaf.
"""

import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile


HERE = Path(__file__).resolve().parent
PACKET = HERE.parent
ROOT = PACKET.parents[4]
FILES = (
    'foundation/ConfigLoader.js',
    'config/settings.json',
    'config/internals.json',
    'core/AtomicWrite.js',
)
OWNERS = ('config/settings.json', 'config/internals.json')
EXPECTED_CONDITIONAL_ROWS = 1693


def git(*args, text=True, input_data=None):
    return subprocess.check_output(
        ['git', *args], cwd=ROOT, text=text, input=input_data
    )


def resolve_ref(ref):
    return git('rev-parse', '--verify', f'{ref}^{{commit}}').strip()


def blob_at(ref, filename):
    return git('rev-parse', f'{ref}:{filename}').strip()


def text_at(ref, filename):
    return git('show', f'{ref}:{filename}')


def write_json_atomically(destination, value):
    destination.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(value, indent=2) + '\n'
    with tempfile.NamedTemporaryFile(
        mode='w', encoding='utf8', dir=destination.parent,
        prefix=f'.{destination.name}.', delete=False
    ) as handle:
        handle.write(encoded)
        temporary = Path(handle.name)
    os.replace(temporary, destination)


def write_join_atomically(destination, rows):
    """Keep the established one-canonical-row-per-line join format."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    encoded = '[\n' + ''.join(
        json.dumps(row, separators=(',', ':')) + (',\n' if index < len(rows) - 1 else '\n')
        for index, row in enumerate(rows)
    ) + ']\n'
    with tempfile.NamedTemporaryFile(
        mode='w', encoding='utf8', dir=destination.parent,
        prefix=f'.{destination.name}.', delete=False
    ) as handle:
        handle.write(encoded)
        temporary = Path(handle.name)
    os.replace(temporary, destination)


def duplicate_rejecting_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f'duplicate JSON property: {key}')
        result[key] = value
    return result


def canonical_leaves(value, prefix=''):
    """Yield dotted scalar, empty-object, and empty-array paths in JSON order."""
    if isinstance(value, dict) and value:
        for key, child in value.items():
            child_path = f'{prefix}.{key}' if prefix else key
            yield from canonical_leaves(child, child_path)
    elif isinstance(value, list) and value:
        for index, child in enumerate(value):
            child_path = f'{prefix}.{index}' if prefix else str(index)
            yield from canonical_leaves(child, child_path)
    else:
        yield prefix


def canonical_at(ref):
    result = {}
    for owner in OWNERS:
        result[owner] = json.loads(
            text_at(ref, owner), object_pairs_hook=duplicate_rejecting_object
        )
    shared = set(canonical_leaves(result[OWNERS[0]])) & set(canonical_leaves(result[OWNERS[1]]))
    if shared != {'revision', 'schemaVersion'}:
        raise ValueError(f'unexpected shared canonical paths: {sorted(shared)}')
    return result


def parse_canonical_source(label):
    """Return (owner, path) only for literal canonical source-map labels."""
    for owner in OWNERS:
        prefix = f'config:{Path(owner).name}:'
        if label.startswith(prefix):
            return owner, label[len(prefix):]
    return None


def path_is_under(path, source_path):
    return source_path == '' or path == source_path or path.startswith(f'{source_path}.')


def common_suffix_length(left, right):
    left_parts = left.split('.')
    right_parts = right.split('.')
    common = 0
    while (
        common < len(left_parts)
        and common < len(right_parts)
        and left_parts[-(common + 1)] == right_parts[-(common + 1)]
    ):
        common += 1
    return common


def source_targets(owner, source_path, runtime_path, canonical_paths):
    """Map one route to its precise canonical leaf without inventing aliases.

    A leaf label is direct provenance even where ConfigLoader renames the runtime
    path (for example launch-profile mode).  A group label is only propagated to
    the literal runtime leaf beneath that group; it is not fanned out to every
    leaf in the source group.  The `internals.` runtime wrapper is a documented
    projection name, so it is removed before this literal comparison.
    """
    # Explicit source projections in buildRoleConfig/buildConfig.
    projections = {
        'services.dashboard.stockData': 'services.marketData.alpaca',
        'services.webhookOrders': 'webhookOrders',
    }
    projected_root = projections.get(source_path)
    if projected_root and path_is_under(runtime_path, projected_root):
        projected_path = source_path + runtime_path[len(projected_root):]
        if projected_path in canonical_paths:
            return [projected_path]
    normalized_runtime = runtime_path.removeprefix('internals.')
    if normalized_runtime in canonical_paths and path_is_under(normalized_runtime, source_path):
        return [normalized_runtime]
    # Profile projections rename their runtime root (for example
    # launchProfiles.<name>.venueGuards.ttp -> evalRules.ttp).  Their leaf tail
    # still identifies the canonical descendant.  Take a unique longest tail;
    # equal tails are ambiguous and deliberately remain unjoined.
    if not source_path.startswith('launchProfiles.'):
        return []
    best_length = 0
    best_paths = []
    for candidate in canonical_paths:
        if not path_is_under(candidate, source_path):
            continue
        common = common_suffix_length(normalized_runtime, candidate)
        if common > best_length:
            best_length = common
            best_paths = [candidate]
        elif common and common == best_length:
            best_paths.append(candidate)
    return best_paths if best_length and len(best_paths) == 1 else []


def make_manifest(ref):
    return {
        'ref': ref,
        'files': {filename: blob_at(ref, filename) for filename in FILES},
        'scope': (
            'Pinned ConfigLoader, both canonical JSON files, and AtomicWrite for '
            'current source/role accounting. No activation claim.'
        ),
    }


def rebuild_join(ref, manifest=None, proof=None, existing_rows=None):
    manifest_path = HERE / 'current-source-manifest.json'
    proof_path = HERE / 'current-result.json'
    manifest = manifest if manifest is not None else json.loads(manifest_path.read_text())
    proof = proof if proof is not None else json.loads(proof_path.read_text())
    if manifest.get('ref') != ref:
        raise ValueError(
            f'current-source-manifest.json ref {manifest.get("ref")!r} does not match --ref {ref}'
        )
    if proof.get('candidate') != ref:
        raise ValueError(
            f'current-result.json candidate {proof.get("candidate")!r} does not match --ref {ref}; rerun roles first'
        )
    expected_files = {filename: blob_at(ref, filename) for filename in FILES}
    if manifest.get('files') != expected_files:
        raise ValueError(
            'current-source-manifest.json file blobs do not match --ref; rerun --manifest-only before roles'
        )
    source_maps = proof.get('sourceMaps')
    if not isinstance(source_maps, dict) or not source_maps:
        raise ValueError('current-result.json has no non-empty sourceMaps object')

    canonical = canonical_at(ref)
    paths_by_owner = {owner: list(canonical_leaves(canonical[owner])) for owner in OWNERS}
    routes_by_owner_path = {(owner, path): [] for owner in OWNERS for path in paths_by_owner[owner]}
    unmatched_labels = set()
    malformed_maps = []

    for snapshot, source_map in source_maps.items():
        if not isinstance(source_map, dict):
            malformed_maps.append(snapshot)
            continue
        for runtime_path, label in source_map.items():
            if not isinstance(runtime_path, str) or not isinstance(label, str):
                malformed_maps.append(snapshot)
                continue
            parsed = parse_canonical_source(label)
            if parsed is None:
                continue
            owner, source_path = parsed
            if source_path in paths_by_owner[owner]:
                # Exact canonical scalar labels identify their owner even when
                # the runtime name differs. Preserve every recorded route.
                matches = [source_path]
            else:
                matches = source_targets(owner, source_path, runtime_path, paths_by_owner[owner])
            if not matches:
                unmatched_labels.add(label)
                continue
            route = {'snapshot': snapshot, 'runtimePath': runtime_path, 'source': label}
            for path in matches:
                routes_by_owner_path[(owner, path)].append(route)

    if malformed_maps:
        raise ValueError(f'non-object or non-string source map entries in snapshots: {sorted(set(malformed_maps))}')

    canonical_rows = [
        {'owner': owner, 'path': path, 'runtimeSources': routes_by_owner_path[(owner, path)]}
        for owner in OWNERS
        for path in paths_by_owner[owner]
    ]
    # Preserve existing row order for reviewable diffs while removing deleted
    # paths and appending genuinely new canonical leaves in JSON source order.
    # Route contents always come from the new pinned ref/proof, never old rows.
    if existing_rows is None:
        existing_rows = json.loads((HERE / 'canonical-source-join.json').read_text())
    rows_by_key = {(row['owner'], row['path']): row for row in canonical_rows}
    rows = []
    for prior in existing_rows:
        key = (prior.get('owner'), prior.get('path'))
        if key in rows_by_key:
            rows.append(rows_by_key.pop(key))
    rows.extend(row for row in canonical_rows if (row['owner'], row['path']) in rows_by_key)
    keys = [(row['owner'], row['path']) for row in rows]
    if len(keys) != len(set(keys)):
        raise ValueError('duplicate canonical owner/path rows generated')
    conditional = [row for row in rows if not row['runtimeSources']]
    if len(conditional) != EXPECTED_CONDITIONAL_ROWS:
        raise ValueError(
            f'conditional coverage changed to {len(conditional)}, expected {EXPECTED_CONDITIONAL_ROWS}; '
            'review roles/source labels before overwriting canonical-source-join.json'
        )
    return rows, {
        'canonicalRows': len(rows),
        'roleSourceJoinedRows': len(rows) - len(conditional),
        'conditionalRows': len(conditional),
        'unmatchedLiteralCanonicalLabels': sorted(unmatched_labels),
        'ignoredNonCanonicalSourceLabels': sum(
            1 for source_map in source_maps.values() for label in source_map.values()
            if isinstance(label, str) and parse_canonical_source(label) is None
        ),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ref', required=True, help='Commit/ref to pin; it is resolved to a full commit SHA.')
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--manifest-only', action='store_true', help='Write only current-source-manifest.json.')
    mode.add_argument('--join', action='store_true', help='Rebuild canonical-source-join.json after role proof refresh.')
    args = parser.parse_args()
    ref = resolve_ref(args.ref)

    if args.manifest_only:
        write_json_atomically(HERE / 'current-source-manifest.json', make_manifest(ref))
        print(json.dumps({'mode': 'manifest-only', 'ref': ref, 'files': list(FILES)}, indent=2))
        return

    rows, summary = rebuild_join(ref)
    write_join_atomically(HERE / 'canonical-source-join.json', rows)
    print(json.dumps({'mode': 'join', 'ref': ref, **summary}, indent=2))


if __name__ == '__main__':
    main()
