#!/usr/bin/env python3
"""Synthetic offline producer regressions; mandatory isolation only.

Rule: an unwithdrawn success receipt must retain its candle artifact.
These injected syscall faults do not establish crash/power-loss durability.
"""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
marker = json.loads(Path('/run/ogz-helper-isolation.json').read_text())
assert marker['projectRoot'] == str(ROOT)
assert all(os.readlink('/proc/self/ns/' + k) != v for k, v in marker['hostNamespaces'].items())


def module():
    spec = importlib.util.spec_from_file_location('fetch_closeout', ROOT/'tools/fetch-candles.py')
    assert spec is not None and spec.loader is not None
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def args(m, root, sources='binance,coinbase'):
    return m.arguments(['--asset','crypto','--symbol','BTC-USD','--timeframe','1m',
                        '--start','2024-01-01','--end','2024-01-01T00:01:00Z',
                        '--sources',sources,'--output',str(Path(root)/'out')])


class Closeout(unittest.TestCase):
    def test_publication_interruptions_and_persistent_cleanup_failures(self):
        m = module()
        # Real renames bracketed by interruptions; cleanup faults persist.
        for boundary in ('before_candles', 'after_candles', 'before_receipt', 'after_receipt',
                         'partial_candles', 'partial_receipt', 'healthy'):
            for removal in ('none', 'receipt.json', 'candles.json', 'candles.json.tmp', 'receipt.json.tmp', 'all'):
                for error_type in (OSError, KeyboardInterrupt):
                    with self.subTest(boundary=boundary, removal=removal, error=error_type.__name__), tempfile.TemporaryDirectory() as root:
                        a = args(m, root)
                        original_rename, original_unlink, original_write = Path.rename, Path.unlink, m.write_json
                        calls, removals = [], []
                        def transport(*unused):
                            calls.append(True)
                            return [[a.start,'10.1234567890123456789','12','9','11','4',a.end-1]]
                        def rename(path, target):
                            kind = 'candles' if path.name == 'candles.json.tmp' else 'receipt'
                            if boundary == 'before_' + kind:
                                raise error_type('HOSTILE injected rename')
                            result = original_rename(path, target)
                            if boundary == 'after_' + kind:
                                raise error_type('HOSTILE injected rename')
                            return result
                        def unlink(path, *pos, **kw):
                            removals.append(path.name)
                            if removal in (path.name, 'all'):
                                raise error_type('HOSTILE persistent cleanup')
                            return original_unlink(path, *pos, **kw)
                        def write(path, value):
                            if boundary == 'partial_' + path.name.removesuffix('.json.tmp'):
                                path.write_text('{"incomplete":')
                                raise error_type('HOSTILE partial stage')
                            return original_write(path, value)
                        stderr = io.StringIO()
                        with patch.object(Path, 'rename', rename), patch.object(Path, 'unlink', unlink), patch.object(m, 'write_json', write), contextlib.redirect_stderr(stderr):
                            code = m.run(a, transport=transport, credentials={})
                        self.assertEqual(code, 0 if boundary == 'healthy' else 1)
                        self.assertEqual(len(calls), 1)
                        self.assertNotIn('HOSTILE', stderr.getvalue())
                        receipt = json.loads((a.output/'receipt.json').read_text())
                        unwithdrawn = boundary == 'after_receipt' and removal in ('receipt.json', 'all')
                        self.assertEqual(receipt['status'], 'success' if boundary == 'healthy' or unwithdrawn else 'failed')
                        if boundary == 'healthy' or unwithdrawn:
                            self.assertTrue((a.output/'candles.json').is_file(), 'success receipt lost its corresponding candles')
                            self.assertIn('10.1234567890123456789', (a.output/'candles.json').read_text())
                        if unwithdrawn:
                            self.assertNotIn('candles.json', removals, 'must not even try destructive candle cleanup before receipt withdrawal')
                            self.assertIn('output_cleanup_failed', stderr.getvalue())
                            self.assertIn('output_publication_retained', stderr.getvalue())
                        if boundary != 'healthy':
                            self.assertIn('output_publication_failed', stderr.getvalue())
                        if removal == 'none' and boundary != 'healthy':
                            self.assertFalse((a.output/'candles.json').exists())
                            self.assertFalse(list(a.output.glob('*.tmp')))


    def test_routing_metadata_matches_storage_stop_and_source_exhaustion(self):
        m = module()
        for case in ('raw_pages', 'attempt_receipt', 'exhausted', 'fallback'):
            with self.subTest(case=case), tempfile.TemporaryDirectory() as root:
                a = args(m, root)
                calls = []
                original_open, original_write = Path.open, m.write_json
                def transport(url, *unused):
                    calls.append(url)
                    if case == 'raw_pages':
                        return [[a.start,10,12,9,11,4,a.end-1]]
                    if case == 'fallback' and 'coinbase' in url:
                        return [[a.start//1000,9,12,10,11,4]]
                    return m.Unavailable('network_retry_exhausted', 'request')
                def opening(path, *pos, **kw):
                    if case == 'raw_pages' and path.suffix == '.jsonl':
                        raise OSError('HOSTILE storage')
                    return original_open(path, *pos, **kw)
                def writing(path, value):
                    if case == 'attempt_receipt' and path.name.startswith('attempt-'):
                        raise OSError('HOSTILE storage')
                    return original_write(path, value)
                err = io.StringIO()
                with patch.object(Path, 'open', opening), patch.object(m, 'write_json', writing), contextlib.redirect_stderr(err):
                    code = m.run(a, transport=transport, credentials={})
                self.assertEqual(code, 0 if case == 'fallback' else 1)
                self.assertEqual(len(calls), 1 if case in ('raw_pages','attempt_receipt') else 2)
                receipt = json.loads((a.output/'receipt.json').read_text())
                attempts = receipt['attempts']
                if case in ('raw_pages', 'attempt_receipt'):
                    self.assertEqual(attempts[0]['fallback'], 'stopped_output_failure')
                    self.assertIn('output_', err.getvalue())
                else:
                    self.assertEqual(attempts[0]['fallback'], 'next_allowed_source')
                    if case == 'exhausted':
                        self.assertEqual(attempts[-1]['fallback'], 'no_allowed_sources_remaining')
                    else:
                        self.assertEqual(attempts[-1]['status'], 'success')
                        self.assertNotIn('fallback', attempts[-1])
                for index, attempt in enumerate(attempts, 1):
                    path = a.output / f'attempt-{index:02d}-{attempt["source"]}.json'
                    if path.exists():
                        self.assertEqual(json.loads(path.read_text()), attempt)
                self.assertNotIn('HOSTILE', err.getvalue())


if __name__ == '__main__':
    unittest.main(verbosity=2)
