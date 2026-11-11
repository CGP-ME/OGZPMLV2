#!/usr/bin/env python3
"""Synthetic boundary regression; no live responses or credentials."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]


def module():
    spec = importlib.util.spec_from_file_location('fetch_candles_boundaries', ROOT/'tools/fetch-candles.py')
    assert spec is not None and spec.loader is not None
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


class Boundaries(unittest.TestCase):
    def test_cli_rejects_fractional_loss_before_run(self):
        import contextlib
        import io
        m = module()
        for start, end in (
                ('2024-01-01T00:00:00.000001Z', '2024-01-01T00:01:00Z'),
                ('2024-01-01', '2024-01-01T00:01:00.999999Z'),
                ('1969-12-31T23:59:59.999000Z', '1970-01-01T00:01:00Z')):
            with self.subTest(start=start, end=end), tempfile.TemporaryDirectory() as root:
                output = Path(root)/'new'
                with patch.object(m, 'run', return_value=0) as run, contextlib.redirect_stderr(io.StringIO()):
                    with self.assertRaises(SystemExit) as error:
                        m.main(['--asset','crypto','--symbol','BTC-USD','--timeframe','1m',
                                '--sources','bitstamp','--start',start,'--end',end,'--output',str(output)])
                    self.assertEqual(error.exception.code, 2)
                    run.assert_not_called()
                self.assertFalse(output.exists())

    def test_parse_time_exact_milliseconds(self):
        m = module()
        for value, expected in (
                ('1970-01-01T00:00:00.000000Z', 0),
                ('1970-01-01T00:00:00.001000Z', 1),
                ('1970-01-01T00:00:01.001Z', 1001),
                ('1970-01-01T01:00:01.001000+01:00', 1001),
                ('1969-12-31T23:59:59.999000Z', -1),
                ('2024-01-01T00:00:00.000000Z', 1704067200000)):
            with self.subTest(value=value):
                self.assertEqual(m.parse_time(value), expected)

    def test_bitstamp_unaligned_native_pagination(self):
        m = module()
        for page_size in (1, 2, 3):
            for fraction in ('', '.001'):
                with self.subTest(page_size=page_size, fraction=fraction), tempfile.TemporaryDirectory() as root:
                    a = m.arguments(['--asset','crypto','--symbol','BTC-USD','--timeframe','1m','--sources','bitstamp',
                                     '--start',f'2011-09-01T00:00:30{fraction}Z','--end','2011-09-01T00:03:30Z',
                                     '--page-size',str(page_size),'--max-pages','6','--output',str(Path(root)/'new')])
                    base = m.parse_time('2011-09-01')//1000
                    calls = []
                    def transport(url, params, headers):
                        calls.append(params['start'])
                        first = params['start']//60*60  # Provider floors to its native minute.
                        return {'data':{'ohlc':[dict(timestamp=str(first+i*60), open='10', high='12', low='9', close='11', volume='4')
                                                for i in range(params['limit'])]}}
                    self.assertEqual(m.run(a, transport=transport, credentials={}), 0)
                    self.assertEqual(calls, [base+30] + [base+i*60 for i in range(page_size,4,page_size)])
                    bars = json.loads((a.output/'candles.json').read_text())
                    self.assertEqual([b['timestamp'] for b in bars], [(base+60)*1000, (base+120)*1000])
                    receipt = json.loads((a.output/'receipt.json').read_text())
                    self.assertTrue(receipt['coverageUnknown'])
                    self.assertEqual(receipt['attempts'][0]['gaps'], [])
                    pages = [json.loads(line) for line in (a.output/'attempt-01-bitstamp-pages.jsonl').read_text().splitlines()]
                    self.assertEqual(len(pages), len(calls))
                    self.assertEqual(pages[0]['response']['ohlc'][0]['timestamp'], str(base))

    def test_bitstamp_empty_windows_and_pagination_guards(self):
        m = module()
        for case, error in (('empty', 'empty_requested_range'), ('stale', 'nonprogressing_page'),
                            ('future', 'provider_ignored_requested_window'), ('cap', 'page_cap_truncated')):
            with self.subTest(case=case), tempfile.TemporaryDirectory() as root:
                a = m.arguments(['--asset','crypto','--symbol','BTC-USD','--timeframe','1m','--sources','bitstamp',
                                 '--start','2011-09-01T00:00:30.001Z','--end','2011-09-01T00:03:30Z',
                                 '--page-size','1','--max-pages', '1' if case=='cap' else '6','--output',str(Path(root)/'new')])
                calls = []
                def transport(url, params, headers):
                    calls.append(params['start'])
                    t = params['start']//60*60 + (-60 if case=='stale' else 600 if case=='future' else 0)
                    return {'data':{'ohlc':[] if case=='empty' else [dict(timestamp=str(t), open='10', high='12', low='9', close='11', volume='4')]}}
                self.assertEqual(m.run(a, transport=transport, credentials={}), 1)
                receipt = json.loads((a.output/'receipt.json').read_text())
                self.assertEqual(receipt['attempts'][0]['error'], error)
                self.assertEqual(len(calls), 3 if case=='empty' else 1)
                if case=='empty':
                    self.assertEqual(calls, [a.start//1000+i*60 for i in range(3)])
                    self.assertTrue(receipt['attempts'][0]['requestedWindowScanned'])
                self.assertFalse((a.output/'candles.json').exists())

    def test_recent_kraken_unaligned_start_is_not_old_history(self):
        m = module()
        with tempfile.TemporaryDirectory() as root:
            a = m.arguments(['--asset','crypto','--symbol','BTC-USD','--timeframe','1m','--sources','kraken',
                             '--start','2024-01-01T00:00:30Z','--end','2024-01-01T00:03:30Z','--output',str(Path(root)/'new')])
            start = m.parse_time('2024-01-01T00:01:00Z')//1000
            payload = {'error':[], 'result':{'XXBTZUSD':[[start+i*60,'10','12','9','11','10','4',2] for i in range(4)],'last':start+180}}
            self.assertEqual(m.run(a,transport=lambda *unused:payload),0)
            bars = json.loads((a.output/'candles.json').read_text())
            self.assertEqual([b['timestamp'] for b in bars],[start*1000,(start+60)*1000])

    def test_sparse_kraken_leading_gap_is_not_proven_retention(self):
        m = module()
        with tempfile.TemporaryDirectory() as root:
            a = m.arguments(['--asset','crypto','--symbol','BTC-USD','--timeframe','1m','--sources','kraken',
                             '--start','2024-01-01T00:00:30Z','--end','2024-01-01T00:05:00Z','--output',str(Path(root)/'new')])
            start = m.parse_time('2024-01-01T00:03:00Z')//1000
            payload = {'error':[], 'result':{'XXBTZUSD':[[start+i*60,'10','12','9','11','10','4',2] for i in range(3)],'last':start+120}}
            self.assertEqual(m.run(a,transport=lambda *unused:payload),0)
            attempt = json.loads((a.output/'receipt.json').read_text())['attempts'][0]
            self.assertEqual(attempt['leadingGap']['from'],m.parse_time('2024-01-01T00:01:00Z'))
            self.assertEqual(attempt['leadingGap']['cause'],'unknown_no_ticks_or_outage_or_retention')

    def test_monthly_gross_old_history_still_fails(self):
        m = module()
        with tempfile.TemporaryDirectory() as root:
            a = m.arguments(['--asset','crypto','--symbol','BTC-USDT','--timeframe','1M','--sources','binance',
                             '--start','2024-01-31','--end','2024-05-01','--output',str(Path(root)/'new')])
            t = m.parse_time('2024-04-01')
            payload = [[t,'10','12','9','11','4',a.end-1]]
            self.assertEqual(m.run(a,transport=lambda *unused:payload),1)
            self.assertEqual(json.loads((a.output/'receipt.json').read_text())['attempts'][0]['error'],'history_boundary_shortfall')

    def test_complete_months_after_unaligned_start(self):
        m = module()
        with tempfile.TemporaryDirectory() as root:
            a = m.arguments(['--asset','crypto','--symbol','BTC-USDT','--timeframe','1M','--sources','binance',
                             '--start','2024-01-31','--end','2024-04-01','--output',str(Path(root)/'new')])
            starts = [m.parse_time(d) for d in ('2024-02-01','2024-03-01')]
            payload = [[t,'10','12','9','11','4',m.bar_end(t,'1M','binance')-1] for t in starts]
            self.assertEqual(m.run(a,transport=lambda *unused:payload),0)
            self.assertEqual([b['timestamp'] for b in json.loads((a.output/'candles.json').read_text())],starts)
            receipt = json.loads((a.output/'receipt.json').read_text())
            self.assertEqual(receipt['attempts'][0]['boundaryShortfallToleranceMs'],31*86400000)

    def test_binance_malformed_close_cannot_skip_history(self):
        m = module()
        with tempfile.TemporaryDirectory() as root:
            a = m.arguments(['--asset','crypto','--symbol','BTC-USDT','--timeframe','1m','--sources','binance',
                             '--start','2024-01-01','--end','2024-01-01T00:03:00Z','--output',str(Path(root)/'new')])
            calls = []
            def transport(*unused):
                calls.append(True)
                return [[a.start,'10','12','9','11','4',a.end-1]]
            self.assertEqual(m.run(a,transport=transport),1)
            self.assertEqual(len(calls),1)
            receipt = json.loads((a.output/'receipt.json').read_text())
            self.assertEqual(receipt['attempts'][0]['error'],'invalid_binance_time_contract')
            self.assertFalse((a.output/'candles.json').exists())

    def test_publication_failures_cleanup(self):
        m = module()
        for failure in ('receipt_write','candle_rename','receipt_rename','after_candle_rename',
                        'after_receipt_rename','partial_close','interrupt_close'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as root:
                a = m.arguments(['--asset','crypto','--symbol','BTC-USDT','--timeframe','1m','--sources','binance',
                                 '--start','2024-01-01','--end','2024-01-01T00:01:00Z','--output',str(Path(root)/'new')])
                payload = [[a.start,'10','12','9','11','4',a.end-1]]
                original_write, original_rename = m.write_json, Path.rename
                def write(path, value):
                    if path.name == 'receipt.json.tmp' and failure == 'receipt_write':
                        raise OSError('synthetic receipt write failure')
                    if path.name == 'candles.json.tmp' and failure in ('partial_close','interrupt_close'):
                        path.write_text('[{"synthetic":')
                        if failure == 'interrupt_close':
                            raise KeyboardInterrupt()
                        raise OSError('synthetic partial write/close failure')
                    return original_write(path,value)
                def rename(path, target):
                    kind = 'candle' if path.name == 'candles.json.tmp' else 'receipt'
                    if failure == kind+'_rename':
                        raise OSError('synthetic rename failure')
                    result = original_rename(path,target)
                    if failure == 'after_'+kind+'_rename':
                        raise KeyboardInterrupt()
                    return result
                with patch.object(m,'write_json',side_effect=write), patch.object(Path,'rename',rename):
                    self.assertEqual(m.run(a,transport=lambda *unused:payload),1)
                self.assertFalse((a.output/'candles.json').exists())
                self.assertFalse(list(a.output.glob('*.tmp')))
                receipt = json.loads((a.output/'receipt.json').read_text())
                self.assertEqual(receipt['status'],'failed')
                self.assertEqual(receipt['error'],'output_publication_failed')
                self.assertEqual(receipt['attempts'][0]['statusScope'],'retrieval_only')

    def test_failed_candle_publication_does_not_leave_success_receipt(self):
        m = module()
        with tempfile.TemporaryDirectory() as root:
            a = m.arguments(['--asset','crypto','--symbol','BTC-USDT','--timeframe','1m','--sources','binance',
                             '--start','2024-01-01','--end','2024-01-01T00:01:00Z','--output',str(Path(root)/'new')])
            payload = [[a.start,'10','12','9','11','4',a.end-1]]
            original = m.write_json
            def fail_candle(path, value):
                if path.name in ('candles.json','candles.json.tmp'):
                    raise OSError('synthetic full disk')
                return original(path, value)
            with patch.object(m,'write_json',side_effect=fail_candle):
                try:
                    result = m.run(a,transport=lambda *unused:payload)
                except OSError:
                    result = 1
            self.assertNotEqual(result,0)
            receipt = a.output/'receipt.json'
            self.assertFalse(receipt.exists() and json.loads(receipt.read_text()).get('status')=='success',
                             'failed final candle write left success receipt')
            self.assertFalse((a.output/'candles.json').exists())


if __name__ == '__main__':
    unittest.main(verbosity=2)
