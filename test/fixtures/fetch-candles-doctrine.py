#!/usr/bin/env python3
"""SYNTHETIC offline fault tests; run only through mandatory isolation."""
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
assert Path('/run/ogz-helper-isolation.json').is_file()

def module():
    spec = importlib.util.spec_from_file_location('fetch_doctrine', ROOT/'tools/fetch-candles.py')
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def args(m, root, sources='alpaca'):
    stocks = sources == 'alpaca'
    return m.arguments(['--asset','stocks' if stocks else 'crypto','--symbol','TSLA' if stocks else 'BTC-USD',
        '--timeframe','1m','--start','2024-01-01','--end','2024-01-01T00:01:00Z',
        '--sources',sources,'--output',str(Path(root)/'out')])


class Doctrine(unittest.TestCase):
    def test_http_numeric_and_nesting_faults_fall_back(self):
        m = module()
        for fault in ('numeric', 'nesting'):
            with self.subTest(fault=fault), tempfile.TemporaryDirectory() as root:
                a = args(m, root, 'binance,coinbase')
                calls = []
                class Opener:
                    def open(self, request, timeout):
                        calls.append(request.full_url)
                        if 'binance' in request.full_url:
                            if fault == 'numeric':
                                body = ('[[%s,1e999999999999999999999999999999999999,12,9,11,4,%s,"HOSTILE"]]' % (a.start, a.end-1)).encode()
                            else:
                                body = b'[' * 20000 + b'"HOSTILE"' + b']' * 20000
                        else:
                            body = json.dumps([[a.start//1000,9,12,10,11,4]]).encode()
                        return io.BytesIO(body)
                err = io.StringIO()
                with contextlib.redirect_stderr(err):
                    code = m.run(a, transport=m.HTTPClient(a, opener=Opener(), sleep=lambda x:None))
                self.assertEqual(code, 0)
                receipt = json.loads((a.output/'receipt.json').read_text())
                attempt = json.loads((a.output/'attempt-01-binance.json').read_text())
                self.assertEqual(attempt['error'], 'invalid_json_number' if fault == 'numeric' else 'invalid_json_nesting')
                self.assertEqual(attempt['stage'], 'response_decode')
                self.assertIsNone(attempt['bars'])
                self.assertEqual(attempt['quarantineScope'], 'whole_source')
                self.assertEqual(receipt['source'], 'coinbase')
                self.assertTrue(receipt['sourceSwitch'])
                self.assertEqual(len(calls), 2)
                self.assertTrue(all(b['source']=='coinbase' for b in json.loads((a.output/'candles.json').read_text())))
                self.assertNotIn('HOSTILE', err.getvalue()+''.join(p.read_text() for p in a.output.iterdir()))

    def test_unused_malformed_credentials_do_not_block_public_crypto(self):
        m = module()
        for source in ('coinbase', 'alpaca'):
            with self.subTest(source=source), tempfile.TemporaryDirectory() as root:
                a = args(m, root, source)
                calls = []
                def transport(url, params, headers):
                    calls.append(headers)
                    return [[a.start//1000,9,12,10,11,4]]
                err = io.StringIO()
                with patch.dict(os.environ, {'ALPACA_API_KEY':'synthetic\nHOSTILE','ALPACA_API_SECRET':'synthetic'}, clear=True), contextlib.redirect_stderr(err):
                    code = m.run(a, transport=transport)
                receipt = json.loads((a.output/'receipt.json').read_text())
                if source == 'coinbase':
                    self.assertEqual(code, 0)
                    self.assertEqual(calls, [{}])
                    self.assertEqual(receipt['credentialProvenance'], {'source':'not_applicable','keyPresent':None,'secretPresent':None})
                else:
                    self.assertEqual(code, 1)
                    self.assertEqual(calls, [])
                    self.assertEqual(receipt['error'], 'invalid_environment_credentials')
                self.assertNotIn('HOSTILE', err.getvalue()+json.dumps(receipt))

    def test_explicit_file_never_mixes_environment(self):
        m = module()
        with tempfile.TemporaryDirectory() as root:
            a = args(m,root)
            a.env_file = Path(root)/'synthetic.env'
            a.env_file.write_text('ALPACA_API_KEY=synthetic-file-key\n')
            calls=[]
            with patch.dict(os.environ, {'ALPACA_API_SECRET':'synthetic-environment-secret'}, clear=True):
                code=m.run(a,transport=lambda *x:calls.append(x))
            self.assertEqual(code,1)
            self.assertEqual(calls,[], 'incomplete explicit pair must not authenticate')
            receipt=json.loads((a.output/'receipt.json').read_text())
            self.assertEqual(receipt['credentialProvenance'], {'source':'explicit_file','keyPresent':True,'secretPresent':False})
            self.assertEqual(receipt['attempts'][0]['error'],'missing_alpaca_credentials')
            self.assertNotIn('synthetic-',json.dumps(receipt))

    def test_provider_failure_is_named_outcome_and_source_fallback(self):
        m=module()
        with tempfile.TemporaryDirectory() as root:
            a=args(m,root,'binance,coinbase')
            calls=[]
            def transport(url,params,headers):
                calls.append(url)
                if 'binance' in url:
                    return [[a.start,'10','12','9','11','-1',a.end-1]]
                return [[a.start//1000,9,12,10,11,4]]
            err=io.StringIO()
            with contextlib.redirect_stderr(err):
                self.assertEqual(m.run(a,transport=transport),0)
            receipt=json.loads((a.output/'receipt.json').read_text())
            self.assertEqual(receipt['source'],'coinbase')
            attempt=receipt['attempts'][0]
            self.assertEqual(attempt['error'],'invalid_ohlcv')
            self.assertEqual(attempt['stage'],'normalize')
            self.assertIsNone(attempt['bars'])
            self.assertIn('invalid_ohlcv',err.getvalue())
            self.assertEqual(m.exact_timestamp('bad').code,'invalid_timestamp')
            self.assertEqual(m.parse_time('bad').code,'invalid_time_format')
            self.assertTrue(all(b['source']=='coinbase' for b in json.loads((a.output/'candles.json').read_text())))

    def test_timestamp_consumers_and_missing_fields(self):
        m=module()
        self.assertEqual(m.arguments(['--asset','crypto','--symbol','BTC-USD','--timeframe','1m',
            '--start','bad','--end','2024-01-02','--output','unused']).code,'invalid_time_format')
        for source in ('binance','coinbase','bitstamp','kraken','alpaca'):
            with self.subTest(source=source), tempfile.TemporaryDirectory() as root:
                a=args(m,root,source)
                payload={'binance':[['bad',10,12,9,11,4,a.end-1]],
                         'coinbase':[['bad',9,12,10,11,4]],
                         'bitstamp':{'data':{'ohlc':[{'timestamp':'bad','open':10,'high':12,'low':9,'close':11,'volume':4}]}},
                         'kraken':{'error':[],'result':{'pair':[['bad',10,12,9,11,1,4],['bad',10,12,9,11,1,4]],'last':1}},
                         'alpaca':{'bars':{'TSLA':[{'t':'2024-01-01'}]}}}[source]
                self.assertEqual(m.run(a,transport=lambda *x:payload,credentials={'ALPACA_API_KEY':'synthetic','ALPACA_API_SECRET':'synthetic'}),1)
                attempt=json.loads((a.output/'receipt.json').read_text())['attempts'][0]
                self.assertEqual(attempt['error'],'missing_bar_fields' if source=='alpaca' else 'invalid_timestamp')
                self.assertIsNone(attempt['bars'])
                self.assertFalse((a.output/'candles.json').exists())

    def test_http_outcomes_rate_warning_and_safe_errors(self):
        import urllib.error
        m=module()
        with tempfile.TemporaryDirectory() as root:
            a=args(m,root)
            a.retries=1
            class Opener:
                calls=0
                def open(self,request,timeout):
                    self.calls+=1
                    if self.calls==1:
                        raise urllib.error.HTTPError(request.full_url,429,'HOSTILE-secret',{'Retry-After':'HOSTILE-invalid'},io.BytesIO(b'HOSTILE-body'))
                    return io.BytesIO(b'[]')
            waits=[]; err=io.StringIO()
            client=m.HTTPClient(a,opener=Opener(),sleep=waits.append)
            with contextlib.redirect_stderr(err):
                self.assertEqual(client('https://api.kraken.com/0/public/OHLC',{},{}),[])
            self.assertIn('invalid_retry_after',err.getvalue())
            self.assertIn(1,waits)
            self.assertEqual(client.warnings[0]['code'],'invalid_retry_after')
            self.assertNotIn('HOSTILE',err.getvalue())
            self.assertEqual(client('https://hostile.invalid',{},{}).code,'disallowed_data_url')
            class Denied:
                def open(self,*x,**kw):
                    raise urllib.error.HTTPError('https://HOSTILE',403,'HOSTILE',{},io.BytesIO(b'HOSTILE'))
            self.assertEqual(m.HTTPClient(a,opener=Denied(),sleep=lambda x:None)('https://api.kraken.com/0/public/OHLC',{},{}).code,'http_403')

    def test_storage_failures_are_loud_and_stop_fallback(self):
        m=module()
        for target in ('pages','attempt','publication'):
            with self.subTest(target=target), tempfile.TemporaryDirectory() as root:
                a=args(m,root,'binance,coinbase'); calls=[]; err=io.StringIO()
                original_open=Path.open; original_write=m.write_json; original_unlink=Path.unlink
                def transport(*x):
                    calls.append(x)
                    return [[a.start,10,12,9,11,4,a.end-1]]
                def opening(path,*x,**kw):
                    if target=='pages' and path.suffix=='.jsonl':
                        raise OSError('HOSTILE secret URL')
                    return original_open(path,*x,**kw)
                def writing(path,value):
                    if (target=='attempt' and path.name.startswith('attempt-')) or (target=='publication' and path.name in ('receipt.json.tmp','receipt.json')):
                        raise OSError('HOSTILE secret URL')
                    return original_write(path,value)
                def unlink(path,*x,**kw):
                    if target=='publication' and path.name=='candles.json.tmp':
                        raise OSError('HOSTILE cleanup')
                    return original_unlink(path,*x,**kw)
                with patch.object(Path,'open',opening),patch.object(m,'write_json',writing),patch.object(Path,'unlink',unlink),contextlib.redirect_stderr(err):
                    self.assertEqual(m.run(a,transport=transport),1)
                self.assertEqual(len(calls),1)
                self.assertNotIn('HOSTILE',err.getvalue())
                self.assertIn('output_',err.getvalue())
                if target=='publication':
                    self.assertIn('output_cleanup_failed',err.getvalue())
                    self.assertIn('failure_receipt',err.getvalue())
                self.assertFalse((a.output/'candles.json').exists())

    def test_nonfinite_encoding_returns_named_outcome(self):
        from decimal import Decimal
        m=module()
        self.assertEqual(m.encode_json({'x':Decimal('NaN')}).code,'nonfinite_json_number')

    def test_hostile_payload_not_persisted_and_transport_fault_named(self):
        m=module()
        for case in ('payload','transport'):
            with tempfile.TemporaryDirectory() as root:
                a=args(m,root,'binance'); err=io.StringIO()
                def transport(*x):
                    if case=='transport':
                        raise TimeoutError('HOSTILE-secret-url')
                    return [[a.start,'HOSTILE-secret-url',12,9,11,4,a.end-1]]
                with contextlib.redirect_stderr(err):
                    self.assertEqual(m.run(a,transport=transport),1)
                text=''.join(p.read_text() for p in a.output.iterdir())+err.getvalue()
                self.assertNotIn('HOSTILE',text)
                self.assertIn('network_retry_exhausted' if case=='transport' else 'invalid_ohlcv',text)

    def test_public_cli_missing_credentials_and_unwritable_output(self):
        import subprocess
        with tempfile.TemporaryDirectory() as root:
            base=['python3',str(ROOT/'tools/fetch-candles.py'),'--asset','stocks','--symbol','TSLA','--timeframe','1m',
                  '--start','2024-01-01','--end','2024-01-02']
            env={'PATH':os.environ['PATH']}
            result=subprocess.run(base+['--output',str(Path(root)/'out')],env=env,capture_output=True,text=True)
            self.assertEqual(result.returncode,1)
            self.assertIn('missing_alpaca_credentials',result.stderr)
            result=subprocess.run(base+['--output',str(Path(root)/'out')],env=env,capture_output=True,text=True)
            self.assertEqual(result.returncode,2)
            self.assertIn('output_directory',result.stderr)
            result=subprocess.run(base+['--output',str(Path(root)/'missing'),'--env-file',str(Path(root)/'absent')],env=env,capture_output=True,text=True)
            self.assertEqual(result.returncode,1)
            self.assertIn('unreadable_explicit_credentials_file',result.stderr)

    def test_boundary_overflow_bad_credentials_and_cli_redaction(self):
        import subprocess
        m=module()
        with tempfile.TemporaryDirectory() as root:
            a=args(m,root,'binance')
            a.timeframe='1M'
            a.end=m.parse_time('9999-12-31')
            t=m.parse_time('9999-12-01')
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(m.run(a,transport=lambda *x:[[t,10,12,9,11,4,a.end-1]]),1)
            receipt=json.loads((a.output/'receipt.json').read_text())
            self.assertIn(receipt['attempts'][0]['error'],('invalid_calendar_boundary','invalid_binance_time_contract'))
            env=Path(root)/'synthetic.env';env.write_text('ALPACA_API_KEY=synthetic\nALPACA_API_SECRET=synthetic\x01\n')
            self.assertEqual(m.read_credentials(env,{}).code,'invalid_explicit_credentials_file')
            proc=subprocess.run(['python3',str(ROOT/'tools/fetch-candles.py'),'--timeout','HOSTILE-credential'],capture_output=True,text=True)
            self.assertEqual(proc.returncode,2)
            self.assertNotIn('HOSTILE',proc.stderr)

    def test_all_request_failures_and_credential_provenance(self):
        import urllib.error
        m=module()
        with tempfile.TemporaryDirectory() as root:
            a=args(m,root); a.retries=0
            for body,code in ((b'HOSTILE','invalid_json_response'),):
                class Opener:
                    def open(self,*x,**kw): return io.BytesIO(body)
                result=m.HTTPClient(a,opener=Opener(),sleep=lambda x:None)('https://api.kraken.com/0/public/OHLC',{}, {})
                self.assertEqual(result.code,code)
            self.assertEqual(m.exact_timestamp('1e99999999999999').code,'invalid_timestamp')
            with patch.dict(os.environ,{'ALPACA_API_KEY':'synthetic\nHOSTILE','ALPACA_API_SECRET':'synthetic'},clear=True):
                credentials=m.read_credentials(None,os.environ)
            self.assertEqual(credentials.code,'invalid_environment_credentials')
            a.env_file=Path(root)/'missing'
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(m.run(a,transport=lambda *x:self.fail('unexpected request')),1)
            receipt=json.loads((a.output/'receipt.json').read_text())
            self.assertEqual(receipt['credentialProvenance'],{'source':'explicit_file','keyPresent':None,'secretPresent':None})

    def test_provider_token_and_request_header_control_bytes(self):
        m=module()
        with tempfile.TemporaryDirectory() as root:
            a=args(m,root)
            a.retries=0
            class NoNetwork:
                def open(self,*x,**kw):
                    return io.BytesIO(b'[]')
            client=m.HTTPClient(a,opener=NoNetwork(),sleep=lambda x:None)
            result=client('https://data.alpaca.markets/v2/stocks/bars',{}, {'APCA-API-KEY-ID':'synthetic\nHOSTILE'})
            self.assertEqual(result.code,'invalid_request_headers')
            calls=[]
            def transport(*x):
                calls.append(x)
                return {'bars':{'TSLA':[]},'next_page_token':'HOSTILE\nvalue'}
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(m.run(a,transport=transport,credentials={'ALPACA_API_KEY':'synthetic','ALPACA_API_SECRET':'synthetic'}),1)
            self.assertEqual(len(calls),1)
            self.assertNotIn('HOSTILE',''.join(p.read_text() for p in a.output.iterdir()))

if __name__ == '__main__':
    unittest.main(verbosity=2)
