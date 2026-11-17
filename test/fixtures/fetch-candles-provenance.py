#!/usr/bin/env python3
"""Offline synthetic byte provenance; run only through exact isolated candidate."""
import contextlib
import hashlib
import http.client
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
import urllib.error
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
marker = json.loads(Path('/run/ogz-helper-isolation.json').read_text())
assert marker['projectRoot'] == str(ROOT)
assert all(os.readlink('/proc/self/ns/' + k) != v for k, v in marker['hostNamespaces'].items())
spec = importlib.util.spec_from_file_location('provenance', ROOT/'tools/fetch-candles.py')
assert spec is not None and spec.loader is not None
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class Opener:
    def __init__(self, bodies):
        self.bodies = iter(bodies)
    def open(self, *args, **kwargs):
        body = next(self.bodies)
        if isinstance(body, Exception):
            raise body
        return body if isinstance(body, http.client.HTTPResponse) else io.BytesIO(body)

def framed(body, declared=None, chunked=False):
    class Socket:
        def makefile(self, *unused):
            header = (b'Transfer-Encoding: chunked' if chunked else
                      b'Content-Length: ' + str(len(body) if declared is None else declared).encode())
            return io.BytesIO(b'HTTP/1.1 200 OK\r\n' + header + b'\r\n\r\n' + body)
    response = http.client.HTTPResponse(Socket())
    response.begin()
    return response

class Provenance(unittest.TestCase):
    def run_case(self, bodies, synthetic=False, end='2024-01-01T00:01:00Z', retries=0):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        a = m.arguments(['--asset','crypto','--symbol','BTC-USD','--timeframe','1m',
                         '--start','2024-01-01','--end',end,'--sources','binance,coinbase',
                         '--retries',str(retries),'--output',str(Path(temp.name)/'out')])
        err = io.StringIO()
        opener = Opener(bodies)
        with patch.object(m.urllib.request, 'build_opener', return_value=opener), patch.object(m.time, 'sleep'), contextlib.redirect_stderr(err):
            # Constructor default sleep is already bound; inject no-op explicitly.
            transport = (lambda *unused: [[a.start,10,12,9,11,4,a.start+59999]]) if synthetic else m.HTTPClient(a, opener=opener, sleep=lambda _: None)
            code = m.run(a, transport=transport, credentials={})
        report = json.loads((a.output/'receipt.json').read_text())
        saved = err.getvalue() + ''.join(p.read_text() for p in a.output.iterdir())
        self.assertNotIn('HOSTILE_SECRET', saved)
        for i, attempt in enumerate(report['attempts'], 1):
            self.assertEqual(json.loads((a.output/f'attempt-{i:02d}-{attempt["source"]}.json').read_text()), attempt)
        return code, report

    def test_native_short_length_and_chunked_eof(self):
        body = b'[[1704067200000,10,12,9,11,4,1704067259999]]'
        good = b'[[1704067200,9,12,10,11,4]]'
        chunk = hex(len(body))[2:].encode() + b'\r\n' + body + b'\r\n'
        for response in (framed(body, len(body)+10), framed(chunk, chunked=True)):
            with self.subTest(chunked=response.chunked):
                code, report = self.run_case([response, framed(good)])
                self.assertEqual(code, 0)
                self.assertEqual(report['source'], 'coinbase')
                attempt = report['attempts'][0]
                self.assertEqual(attempt['error'], 'http_framing_retry_exhausted')
                self.assertEqual(attempt['fallback'], 'next_allowed_source')
                wire = attempt['responseEvidence'][0]['exchanges'][0]
                self.assertEqual(wire['bodyScope'], 'captured_partial')
                self.assertEqual(wire['sha256'], hashlib.sha256(body).hexdigest())
                self.assertEqual(wire['byteLength'], len(body))

    def test_native_complete_length_and_chunked(self):
        body = b'[[1704067200000,10,12,9,11,4,1704067259999]]'
        chunk = hex(len(body))[2:].encode() + b'\r\n' + body + b'\r\n0\r\n\r\n'
        for response in (framed(body), framed(chunk, chunked=True)):
            code, report = self.run_case([response])
            self.assertEqual(code, 0)
            wire = report['attempts'][0]['responseEvidence'][0]['exchanges'][0]
            self.assertEqual(wire['bodyScope'], 'complete')
            self.assertEqual(wire['sha256'], hashlib.sha256(body).hexdigest())

    def test_framing_retry_network_has_no_stale_bytes(self):
        body = b'[[1704067200000,10,12,9,11,4,1704067259999]]'
        code, report = self.run_case([framed(body, len(body)+10),
            urllib.error.URLError('HOSTILE_SECRET'), framed(b'[[1704067200,9,12,10,11,4]]')], retries=1)
        self.assertEqual(code, 0)
        exchanges = report['attempts'][0]['responseEvidence'][0]['exchanges']
        self.assertEqual(len(exchanges), 2)
        self.assertEqual(exchanges[0]['bodyScope'], 'captured_partial')
        self.assertIsNone(exchanges[1]['sha256'])
        self.assertIsNone(exchanges[1]['byteLength'])
        self.assertEqual(exchanges[1]['bodyScope'], 'unavailable')

    def test_empty_and_protocol_faults_never_claim_complete(self):
        good = b'[[1704067200,9,12,10,11,4]]'
        for bad in (framed(b'', 10), framed(b'', 0), framed(b'ZZ\r\nHOSTILE_SECRET', chunked=True),
                    http.client.BadStatusLine('HOSTILE_SECRET')):
            code, report = self.run_case([bad, framed(good)])
            self.assertEqual(code, 0)
            wire = report['attempts'][0]['responseEvidence'][0]['exchanges'][0]
            self.assertEqual(wire['bodyScope'], 'unavailable')
            self.assertIsNone(wire['sha256'])
            self.assertIsNone(wire['byteLength'])

    def test_native_partial_chunk_exposes_only_stdlib_captured_bytes(self):
        # HTTPResponse discards bytes from a short _safe_read within a chunk.
        # Claim only the previous complete chunk exposed by IncompleteRead.partial.
        first = b'HOSTILE_SECRET'
        chunks = b'e\r\n' + first + b'\r\na\r\nabc'
        code, report = self.run_case([framed(chunks, chunked=True), framed(b'[[1704067200,9,12,10,11,4]]')])
        self.assertEqual(code, 0)
        wire = report['attempts'][0]['responseEvidence'][0]['exchanges'][0]
        self.assertEqual(wire['bodyScope'], 'captured_partial')
        self.assertEqual(wire['sha256'], hashlib.sha256(first).hexdigest())
        self.assertEqual(wire['byteLength'], len(first))

    def test_framing_retry_can_recover_on_same_source(self):
        body = b'[[1704067200000,10,12,9,11,4,1704067259999]]'
        code, report = self.run_case([framed(body, len(body)+10), framed(body)], retries=1)
        self.assertEqual(code, 0)
        self.assertEqual(report['source'], 'binance')
        exchanges = report['attempts'][0]['responseEvidence'][0]['exchanges']
        self.assertEqual([x['bodyScope'] for x in exchanges], ['captured_partial', 'complete'])

    def test_malformed_body_identity_survives_fallback(self):
        good = b'[[1704067200,9,12,10,11,4]]'
        for bad in (b'{"HOSTILE_SECRET":', b'[1e99999999999999999999999999999999999]', b'[[1704067200000,"HOSTILE_SECRET",12,9,11,4,1704067259999]]'):
            with self.subTest(body=hashlib.sha256(bad).hexdigest()):
                code, report = self.run_case([bad, good])
                self.assertEqual(code, 0)
                self.assertEqual(report['source'], 'coinbase')
                for attempt, body in zip(report['attempts'], (bad, good)):
                    self.assertIn('responseEvidence', attempt, 'missing exact raw HTTP hash evidence')
                    evidence = attempt['responseEvidence'][0]
                    self.assertEqual(evidence['source'], attempt['source'])
                    self.assertIn('endpoint', evidence)
                    wire = evidence['exchanges'][0]
                    self.assertEqual(wire['sha256'], hashlib.sha256(body).hexdigest())
                    self.assertEqual(wire['byteLength'], len(body))
                    self.assertEqual(wire['bodyScope'], 'complete')
                self.assertEqual(report['attempts'][0]['responseEvidence'][0]['outcome'], report['attempts'][0]['error'])

    def test_semantically_equal_bytes_have_distinct_identity(self):
        bodies = [b'[[1704067200000,10,12,9,11,4,1704067259999]]', b' [ [1704067200000,10.0,12,9,11,4,1704067259999] ]\n']
        hashes = []
        for body in bodies:
            code, report = self.run_case([body])
            self.assertEqual(code, 0)
            wire = report['attempts'][0]['responseEvidence'][0]['exchanges'][0]
            self.assertEqual(wire['sha256'], hashlib.sha256(body).hexdigest())
            hashes.append(wire['sha256'])
        self.assertNotEqual(*hashes)

    def test_network_fault_does_not_reuse_previous_page_or_retry(self):
        first = b'[[1704067200000,10,12,9,11,4,1704067259999]]'
        code, report = self.run_case([first, urllib.error.URLError('HOSTILE_SECRET'), urllib.error.URLError('HOSTILE_SECRET'), b'[[1704067200,9,12,10,11,4],[1704067260,9,12,10,11,4]]'], end='2024-01-01T00:02:00Z', retries=1)
        self.assertEqual(code, 0)
        evidence = report['attempts'][0]['responseEvidence']
        self.assertEqual(len(evidence), 2)
        self.assertEqual(len(evidence[1]['exchanges']), 2)
        for exchange in evidence[1]['exchanges']:
            self.assertIsNone(exchange['sha256'])
            self.assertIsNone(exchange['byteLength'])
            self.assertEqual(exchange['bodyScope'], 'unavailable')
        self.assertNotEqual(evidence[0]['request'], evidence[1]['request'])

    def test_http_error_body_is_not_read_or_archived(self):
        class Unreadable(io.BytesIO):
            def read(self, *unused):
                raise AssertionError('error bodies must not be read')
        fault = urllib.error.HTTPError('https://example.invalid/HOSTILE_SECRET', 403,
                                       'HOSTILE_SECRET', {}, Unreadable(b'HOSTILE_SECRET'))
        code, report = self.run_case([fault, b'[[1704067200,9,12,10,11,4]]'])
        self.assertEqual(code, 0)
        wire = report['attempts'][0]['responseEvidence'][0]['exchanges'][0]
        self.assertIsNone(wire['sha256'])
        self.assertEqual(wire['absence'], 'http_error_body_not_read')
        self.assertEqual(wire['httpStatus'], 403)

    def test_synthetic_transport_has_no_wire_claim(self):
        code, report = self.run_case([], synthetic=True)
        self.assertEqual(code, 0)
        evidence = report['attempts'][0]['responseEvidence'][0]
        self.assertEqual(evidence['transport'], 'synthetic_semantic')
        self.assertEqual(evidence['exchanges'], [])
        self.assertEqual(evidence['wireAbsence'], 'injected_transport_has_no_http_bytes')

    def test_oversize_is_prefix_not_complete_body(self):
        body = b' ' * (32 * 1024 * 1024 + 20)
        code, report = self.run_case([framed(body), framed(b'[[1704067200,9,12,10,11,4]]')])
        self.assertEqual(code, 0)
        self.assertEqual(report['attempts'][0]['error'], 'response_size_limit')
        wire = report['attempts'][0]['responseEvidence'][0]['exchanges'][0]
        self.assertEqual(wire['bodyScope'], 'captured_prefix')
        self.assertEqual(wire['byteLength'], 32 * 1024 * 1024 + 1)
        self.assertEqual(wire['sha256'], hashlib.sha256(body[:32 * 1024 * 1024 + 1]).hexdigest())

if __name__ == '__main__':
    unittest.main(verbosity=2)
