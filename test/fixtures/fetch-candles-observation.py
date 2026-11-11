#!/usr/bin/env python3
"""Offline regression; all HTTP payloads below are SYNTHETIC, not live evidence."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'tools/fetch-candles.py'

class Observation(unittest.TestCase):
    def test_01_dates_and_native_frames(self):
        self.assertTrue(SOURCE.is_file(), 'standalone retriever missing')
        spec = importlib.util.spec_from_file_location('fetch_candles', SOURCE)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertEqual(module.parse_time('2024-01-01'), 1704067200000)
        args = module.arguments(['--asset','crypto','--symbol','BTC-USD','--timeframe','4h','--lookback','2w','--output','new'], now=1705276800000)
        self.assertEqual(args.start, 1704067200000)
        self.assertEqual(args.end, 1705276800000)
        self.assertIn('1M', module.TIMEFRAMES['binance'])
        self.assertNotIn('4h', module.TIMEFRAMES['coinbase'])

    def test_02_alpaca_short_page_token_output(self):
        import tempfile
        import json
        spec = importlib.util.spec_from_file_location('fetch_candles', SOURCE)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertTrue(hasattr(module, 'run'), 'retrieval/output missing')
        with tempfile.TemporaryDirectory() as root:
            out = Path(root) / 'new'
            args = module.arguments(['--asset','stocks','--symbol','TSLA','--feed','iex','--timeframe','1m','--start','2024-01-01','--end','2024-01-02','--output',str(out)])
            calls = []
            def transport(url, params, headers):
                calls.append(params.copy())
                bar = {'t':'2024-01-01T15:00:00Z','o':10,'h':12,'l':9,'c':11,'v':4}
                return {'bars': {'TSLA':[bar]}, 'next_page_token':'next' if len(calls) == 1 else None}
            self.assertEqual(module.run(args, transport=transport, credentials={'ALPACA_API_KEY':'synthetic','ALPACA_API_SECRET':'synthetic'}), 0)
            self.assertEqual(calls[1]['page_token'], 'next')
            candles = json.loads((out / 'candles.json').read_text())
            receipt = json.loads((out / 'receipt.json').read_text())
            self.assertEqual(len(candles), 1)
            self.assertEqual(candles[0]['timestamp'], 1704121200000)
            self.assertTrue(candles[0]['complete'])
            self.assertEqual(receipt['attempts'][0]['identicalDuplicates'], 1)
            self.assertEqual(receipt['feed'], 'iex')
            self.assertTrue(receipt['coverageUnknown'])
            self.assertEqual(module.run(args, transport=transport), 2)

    def test_03_crypto_native_pagination_and_failures(self):
        import tempfile
        import json
        spec = importlib.util.spec_from_file_location('fetch_candles', SOURCE)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        start = 1704067200000
        with tempfile.TemporaryDirectory() as root:
            for source in ('binance','coinbase','bitstamp','kraken'):
                with self.subTest(source=source):
                    args = module.arguments(['--asset','crypto','--symbol','BTC-USD','--timeframe','1m','--start','2024-01-01','--end','2024-01-01T00:03:00Z','--sources',source,'--page-size','2','--output',str(Path(root)/source)])
                    calls = []
                    def transport(url, params, headers):
                        calls.append(params.copy())
                        self.assertFalse(headers)
                        if source == 'binance':
                            self.assertEqual(params['symbol'], 'BTCUSD')
                            ts = [start,start+60000] if len(calls)==1 else [start+120000]
                            return [[t,'10','12','9','11','4',t+59999] for t in ts]
                        if source == 'coinbase':
                            t = module.parse_time(params['start']) // 1000
                            return [[t+60,9,12,10,11,4],[t,9,12,10,11,4]]
                        if source == 'bitstamp':
                            self.assertNotIn('end', params)
                            t = params['start']
                            return {'data':{'pair':'BTC/USD','ohlc':[dict(timestamp=str(x),open='10',high='12',low='9',close='11',volume='4') for x in (t,t+60)]}}
                        self.assertEqual(params['pair'], 'XBTUSD')
                        return {'error':[], 'result':{'XXBTZUSD':[[start//1000+i*60,'10','12','9','11','10','4',2] for i in range(4)],'last':start//1000+180}}
                    self.assertEqual(module.run(args, transport=transport), 0)
                    bars = json.loads((args.output/'candles.json').read_text())
                    self.assertEqual([b['timestamp'] for b in bars], [start,start+60000,start+120000])
                    self.assertTrue(all(b['source']==source for b in bars))
                    self.assertEqual(len(calls), 1 if source=='kraken' else 2)
            args.output = Path(root)/'old-kraken'
            args.start -= 86400000
            self.assertEqual(module.run(args, transport=transport), 1)
            self.assertFalse((args.output/'candles.json').exists())
            self.assertEqual(json.loads((args.output/'receipt.json').read_text())['attempts'][0]['error'], 'history_limit_720_recent_bars')

    def test_04_secure_http_retry_cli(self):
        import io
        import urllib.error
        import subprocess
        spec = importlib.util.spec_from_file_location('fetch_candles', SOURCE)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertTrue(hasattr(module, 'HTTPClient'), 'bounded HTTP missing')
        args = module.arguments(['--asset','crypto','--symbol','BTC-USD','--timeframe','1m','--lookback','1h','--output','unused'])
        waits, calls = [], []
        class Opener:
            def open(self, request, timeout):
                calls.append(request)
                if len(calls) == 1:
                    raise urllib.error.HTTPError(request.full_url,429,'synthetic',{'Retry-After':'2'},io.BytesIO(b'secret body'))
                return io.BytesIO(b'[]')
        client = module.HTTPClient(args, opener=Opener(), sleep=waits.append)
        self.assertEqual(client('https://api.exchange.coinbase.com/products/BTC-USD/candles',{},{}), [])
        self.assertIn(2.0, waits)
        self.assertEqual(len(calls), 2)
        with self.assertRaises(module.FetchError):
            client('https://evil.example/data',{}, {'APCA-API-KEY-ID':'synthetic'})
        class Denied:
            def open(self, request, timeout):
                raise urllib.error.HTTPError(request.full_url,403,'secret error',{},io.BytesIO(b'secret body'))
        with self.assertRaisesRegex(module.FetchError, '^http_403$'):
            module.HTTPClient(args, opener=Denied(), sleep=waits.append)('https://data.alpaca.markets/v2/stocks/bars',{}, {})
        self.assertIsNone(module.NoRedirect().redirect_request(None,None,302,'',{},'https://evil.example'))
        proc = subprocess.run(['python3',str(SOURCE),'--list-timeframes'],capture_output=True,text=True)
        self.assertEqual(proc.returncode, 0)
        self.assertIn('coinbase', proc.stdout)

    def test_05_calendar_sip_cutoff_and_explicit_env(self):
        import tempfile
        spec = importlib.util.spec_from_file_location('fetch_candles', SOURCE)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        args = module.arguments(['--asset','stocks','--symbol','TSLA','--timeframe','1d','--lookback','30d','--output','unused'], now=1710201600000)
        self.assertEqual(args.feed, 'sip')
        self.assertEqual(args.end, 1710200640000)
        self.assertEqual(module.bar_end(module.parse_time('2024-03-10T05:00:00Z'),'1d','alpaca'), module.parse_time('2024-03-11T04:00:00Z'))
        self.assertEqual(module.bar_end(module.parse_time('2024-11-03T04:00:00Z'),'1d','alpaca'), module.parse_time('2024-11-04T05:00:00Z'))
        self.assertEqual(module.bar_end(module.parse_time('2024-03-01T05:00:00Z'),'1M','alpaca'), module.parse_time('2024-04-01T04:00:00Z'))
        self.assertEqual(module.bar_end(module.parse_time('2024-02-01'),'1M','binance'), module.parse_time('2024-03-01'))
        with tempfile.TemporaryDirectory() as root:
            env = Path(root)/'explicit'
            env.write_text('UNRELATED=$(touch NO)\nALPACA_API_KEY="synthetic-key"\nALPACA_API_SECRET=synthetic-secret\n')
            self.assertEqual(module.read_credentials(env, {}), {'ALPACA_API_KEY':'synthetic-key','ALPACA_API_SECRET':'synthetic-secret'})
            self.assertFalse((Path(root)/'NO').exists())

    def test_06_range_adequacy_fallback_raw_receipts(self):
        import tempfile
        import json
        spec = importlib.util.spec_from_file_location('fetch_candles', SOURCE)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as root:
            args = module.arguments(['--asset','crypto','--symbol','BTC-USD','--timeframe','1m','--start','2024-01-01','--end','2024-01-03','--sources','binance,coinbase','--output',str(Path(root)/'out')])
            def transport(url, params, headers):
                if 'binance' in url:
                    t = module.parse_time('2024-01-02')
                    return [[t,'10','12','9','11','4',t+59999]] if params['startTime'] <= t else []
                t = module.parse_time(params['start'])//1000
                return [[t,9,12,10,11,4]]
            self.assertEqual(module.run(args,transport=transport),0)
            receipt = json.loads((args.output/'receipt.json').read_text())
            self.assertEqual(receipt['source'], 'coinbase')
            self.assertEqual(receipt['attempts'][0]['error'], 'history_boundary_shortfall')
            self.assertTrue(receipt['sourceSwitch'])
            self.assertTrue((args.output/'attempt-01-binance-pages.jsonl').is_file())
            raw_pages = [json.loads(line) for line in (args.output/'attempt-01-binance-pages.jsonl').read_text().splitlines()]
            self.assertEqual(raw_pages[0]['response'][0][1], '10')
            self.assertTrue(all(b['source']=='coinbase' for b in json.loads((args.output/'candles.json').read_text())))
            args.sources = ['binance']
            args.output = Path(root)/'conflict'
            def conflict(url,params,headers):
                return [[args.start,'10','12','9',c,'4',args.start+59999] for c in ('10','11')] if params['startTime'] == args.start else []
            self.assertEqual(module.run(args,transport=conflict),1)
            self.assertFalse((args.output/'candles.json').exists())
            self.assertEqual(json.loads((args.output/'receipt.json').read_text())['attempts'][0]['error'],'conflicting_duplicate_timestamp')
            args.output = Path(root)/'cap'
            args.max_pages = 1
            def cap(url,params,headers):
                return [[args.start,'10','12','9','11','4',args.start+59999]]
            self.assertEqual(module.run(args,transport=cap),1)
            self.assertFalse((args.output/'candles.json').exists())
            self.assertEqual(json.loads((args.output/'receipt.json').read_text())['attempts'][0]['error'],'page_cap_truncated')

    def test_07_native_matrix_exact_numeric_output(self):
        import tempfile
        import json
        from decimal import Decimal
        spec = importlib.util.spec_from_file_location('fetch_candles', SOURCE)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        matrix_spec = importlib.util.spec_from_file_location('backtest_matrix', ROOT/'tools/backtest-matrix.py')
        matrix = importlib.util.module_from_spec(matrix_spec)
        matrix_spec.loader.exec_module(matrix)
        with tempfile.TemporaryDirectory() as root:
            args = module.arguments(['--asset','crypto','--symbol','BTC-USDT','--timeframe','1m','--start','2024-01-01','--end','2024-01-01T00:01:00Z','--sources','binance','--output',str(Path(root)/'out')])
            def transport(url,params,headers):
                return [[args.start,'10.1234567890123456789','12','9','11','4',args.end-1]]
            self.assertEqual(module.run(args,transport=transport),0)
            text = (args.output/'candles.json').read_text()
            matrix.validate_candles(json.loads(text), {'tradingPair':'BTC-USDT','candleTimeframe':'1m'})
            self.assertEqual(json.loads(text,parse_float=Decimal)[0]['open'],Decimal('10.1234567890123456789'))

    def test_08_malformed_and_unfinished_fail_closed(self):
        import tempfile
        import json
        spec = importlib.util.spec_from_file_location('fetch_candles', SOURCE)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as root:
            args = module.arguments(['--asset','crypto','--symbol','BTC-USDT','--timeframe','1m','--start','2024-01-01','--end','2024-01-01T00:01:00Z','--sources','binance','--output',str(Path(root)/'out')])
            for name, payload in [('short',[[args.start]]), ('fractional',[[args.start+0.5,'10','12','9','11','4',args.end-1]]), ('negative',[[args.start,'10','12','9','11','-1',args.end-1]]), ('unfinished',[[args.start+30000,'10','12','9','11','4',args.end+29999]])]:
                with self.subTest(name=name):
                    args.output = Path(root)/name
                    self.assertEqual(module.run(args,transport=lambda *unused:payload),1)
                    self.assertFalse((args.output/'candles.json').exists())
                    self.assertEqual(json.loads((args.output/'receipt.json').read_text())['status'],'failed')

    def test_09_trailing_shortfall_and_numeric_timestamp(self):
        import tempfile
        import json
        spec = importlib.util.spec_from_file_location('fetch_candles', SOURCE)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as root:
            args = module.arguments(['--asset','crypto','--symbol','BTC-USD','--timeframe','1m','--start','2024-01-01','--end','2024-01-03','--sources','coinbase','--output',str(Path(root)/'out')])
            def transport(url, params, headers):
                return [[args.start//1000,9,12,10,11,4]]
            self.assertEqual(module.run(args,transport=transport),1)
            self.assertEqual(json.loads((args.output/'receipt.json').read_text())['attempts'][0]['error'],'history_boundary_shortfall')
            args.output = Path(root)/'fractional'
            args.end = args.start + 60000
            self.assertEqual(module.run(args,transport=lambda *unused:[[args.start/1000+0.0005,9,12,10,11,4]]),1)

    def test_10_request_failure_receipt_and_cli_inputs(self):
        import tempfile
        import json
        import subprocess
        spec = importlib.util.spec_from_file_location('fetch_candles', SOURCE)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as root:
            args = module.arguments(['--asset','crypto','--symbol','BTC-USDT','--timeframe','1m','--start','2024-01-01','--end','2024-01-01T00:03:00Z','--sources','binance','--output',str(Path(root)/'out')])
            calls = []
            def transport(url,params,headers):
                calls.append(params)
                if len(calls)==2:
                    raise module.FetchError('network_retry_exhausted')
                return [[args.start,'10','12','9','11','4',args.start+59999]]
            self.assertEqual(module.run(args,transport=transport),1)
            self.assertFalse((args.output/'candles.json').exists())
            attempt = json.loads((args.output/'receipt.json').read_text())['attempts'][0]
            self.assertEqual(attempt['requestsAttempted'],2)
            self.assertEqual(attempt['pages'],1)
            self.assertFalse(attempt['requestedWindowScanned'])
        proc = subprocess.run(['python3',str(SOURCE),'--asset','crypto','--symbol','btcusd','--timeframe','1m','--lookback','1h','--output','unused'],capture_output=True,text=True)
        self.assertEqual(proc.returncode,2)

if __name__ == '__main__':
    unittest.main(verbosity=2)
