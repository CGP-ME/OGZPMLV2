#!/usr/bin/env python3
"""Read-only native REST candles. UTC half-open ranges; no aggregation.

Only --env-file explicitly reads a file (two Alpaca keys only). IEX is not
consolidated SIP. API range exhaustion never proves complete market history.
"""
import argparse
from datetime import datetime, timedelta, timezone
import json
import re
import time
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path
from decimal import Decimal

UTC = timezone.utc
TIMEFRAMES = {
    'alpaca': [f'{n}m' for n in range(1, 60)] + [f'{n}h' for n in range(1, 24)] + ['1d','1w','1M','2M','3M','4M','6M','12M'],
    'binance': '1s 1m 3m 5m 15m 30m 1h 2h 4h 6h 8h 12h 1d 3d 1w 1M'.split(),
    'bitstamp': '1m 3m 5m 15m 30m 1h 2h 4h 6h 12h 1d 3d'.split(),
    'coinbase': '1m 5m 15m 1h 6h 1d'.split(),
    'kraken': '1m 5m 15m 30m 1h 4h 1d 1w 15d'.split(),
}
MATRIX_FRAMES = '1m 5m 15m 30m 1h 4h 1d 5sec'.split()


def parse_time(value):
    if not re.fullmatch(r'\d{4}-\d\d-\d\d(?:T\d\d:\d\d(?::\d\d(?:\.\d{1,6})?)?(?:Z|[+-]\d\d:\d\d))?', value):
        raise ValueError('use ISO date or timezone-qualified ISO timestamp')
    dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    if dt.microsecond % 1000:
        raise ValueError('timestamp must be exactly representable in milliseconds')
    delta = dt - datetime(1970, 1, 1, tzinfo=UTC)
    return (delta.days * 86400 + delta.seconds) * 1000 + delta.microseconds // 1000


def iso(ms):
    return datetime.fromtimestamp(ms / 1000, UTC).isoformat().replace('+00:00', 'Z')


def arguments(argv=None, now=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--list-timeframes', action='store_true')
    p.add_argument('--asset', choices=['stocks', 'crypto'])
    p.add_argument('--symbol')
    p.add_argument('--timeframe')
    p.add_argument('--start')
    p.add_argument('--end')
    p.add_argument('--lookback')
    p.add_argument('--sources', default='auto')
    p.add_argument('--output', type=Path)
    p.add_argument('--feed', choices=['iex','sip'], default='sip', help='SIP consolidated historical feed (default); IEX is exchange-only')
    p.add_argument('--adjustment', choices=['raw','split','all'], default='raw')
    p.add_argument('--env-file', type=Path)
    p.add_argument('--timeout', type=float, default=30)
    p.add_argument('--retries', type=int, default=3)
    p.add_argument('--page-size', type=int, default=1000)
    p.add_argument('--max-pages', type=int, default=10000)
    a = p.parse_args(argv)
    a.now = int(time.time() * 1000) if now is None else now
    if a.list_timeframes:
        return a
    try:
        if not all([a.asset, a.symbol, a.timeframe, a.output]):
            raise ValueError('--asset --symbol --timeframe --output required')
        pattern = r'[A-Z][A-Z0-9.]{0,14}' if a.asset == 'stocks' else r'[A-Z0-9]{2,15}-[A-Z0-9]{2,15}'
        if not re.fullmatch(pattern, a.symbol):
            raise ValueError('symbol must be canonical uppercase; crypto requires explicit BASE-QUOTE')
        if a.timeframe not in set(sum(TIMEFRAMES.values(), [])):
            raise ValueError('unsupported native timeframe; use --list-timeframes')
        if bool(a.start) == bool(a.lookback):
            raise ValueError('provide --start OR --lookback')
        if a.start and not a.end:
            raise ValueError('--start requires --end')
        a.end_policy = 'explicit' if a.end else ('now_minus_16_minutes' if a.asset == 'stocks' else 'now')
        a.end = parse_time(a.end) if a.end else a.now - (960000 if a.asset == 'stocks' else 0)
        if a.lookback:
            m = re.fullmatch(r'([1-9][0-9]*)(s|m|h|d|w)', a.lookback)
            if not m:
                raise ValueError('lookback must be positive integer s/m/h/d/w')
            a.start = a.end - int(m[1]) * {'s':1000,'m':60000,'h':3600000,'d':86400000,'w':604800000}[m[2]]
        else:
            a.start = parse_time(a.start)
        if not 0 <= a.start < a.end or a.start >= a.now:
            raise ValueError('range must start before end and as-of now, at/after Unix epoch')
        if not (0.1 <= a.timeout <= 120 and 0 <= a.retries <= 10 and 1 <= a.page_size <= 10000 and 1 <= a.max_pages <= 100000):
            raise ValueError('bounds: timeout 0.1..120, retries 0..10, page-size 1..10000, max-pages 1..100000')
        if a.sources == 'auto':
            a.sources = ['alpaca'] if a.asset == 'stocks' else (['bitstamp','coinbase','kraken'] if a.symbol.endswith('-USD') else ['binance','bitstamp','kraken'])
        else:
            a.sources = a.sources.split(',')
        if len(a.sources) != len(set(a.sources)) or any(s not in TIMEFRAMES for s in a.sources):
            raise ValueError('sources must be distinct provider names or auto')
        if any((s == 'alpaca') != (a.asset == 'stocks') for s in a.sources):
            raise ValueError('provider does not support requested asset class')
    except (ValueError, OverflowError):
        p.error('invalid input: check symbol, range, native timeframe, provider and numeric bounds')
    return a


class FetchError(Exception):
    """Sanitized external-data failure, caught and persisted by run()."""


def duration(frame):
    return int(frame[:-1]) * {'s':1000,'m':60000,'h':3600000,'d':86400000,'w':604800000}[frame[-1]]


def bar_end(timestamp, frame, source):
    if frame[-1] == 'M' or (source == 'alpaca' and frame[-1] in 'dw'):
        from zoneinfo import ZoneInfo
        zone = ZoneInfo('America/New_York') if source == 'alpaca' else UTC
        dt = datetime.fromtimestamp(timestamp / 1000, zone)
        n = int(frame[:-1])
        if frame[-1] == 'M':
            month = dt.year * 12 + dt.month - 1 + n
            dt = dt.replace(year=month//12, month=month%12+1, day=1)
        else:
            dt += timedelta(days=n * (7 if frame[-1] == 'w' else 1))
        return int(dt.timestamp()*1000)
    return timestamp + duration(frame)


def normalize(rows, a, source, receipt):
    from decimal import Decimal, InvalidOperation
    found = {}
    previous = None
    for timestamp, values in rows:
        if previous is not None and timestamp < previous:
            receipt['sortedNetworkResponse'] = True
        previous = timestamp
        try:
            numbers = [Decimal(str(v)) for v in values]
            o, h, l, c, v = numbers
            valid = all(n.is_finite() for n in numbers) and min(o,h,l,c) > 0 and v >= 0 and l <= min(o,c) <= max(o,c) <= h
        except (ValueError, InvalidOperation, TypeError):
            valid = False
        if not valid:
            raise FetchError('invalid_ohlcv')
        if timestamp in found:
            if found[timestamp][0] != numbers:
                raise FetchError('conflicting_duplicate_timestamp')
            receipt['identicalDuplicates'] += 1
            continue
        found[timestamp] = (numbers, values)
    candles = []
    for timestamp, (numbers, values) in sorted(found.items()):
        if timestamp < a.start or bar_end(timestamp, a.timeframe, source) > min(a.end, a.now):
            receipt['filteredBars'] += 1
            continue
        candles.append(dict(zip(('open','high','low','close','volume'), numbers), timestamp=timestamp,
                            symbol=a.symbol, timeframe=a.timeframe, source=source, complete=True))
    receipt['firstTimestamp'] = candles[0]['timestamp'] if candles else None
    receipt['lastTimestamp'] = candles[-1]['timestamp'] if candles else None
    receipt['bars'] = len(candles)
    receipt['gaps'] = [] if a.asset == 'stocks' else [
        {'after': x['timestamp'], 'before': y['timestamp'], 'cause':'unknown_no_ticks_or_outage'}
        for x,y in zip(candles, candles[1:]) if bar_end(x['timestamp'], a.timeframe, source) < y['timestamp']]
    receipt['gapAssessment'] = 'not_assessed_stock_sessions_and_holidays' if a.asset == 'stocks' else 'observed_interbar_gaps_only'
    return candles


def exact_timestamp(value, scale=1):
    n = Decimal(str(value)) * scale
    if not n.is_finite() or n != n.to_integral_value() or n < 0 or n > 253402214400000:
        raise FetchError('invalid_timestamp')
    return int(n)


def retrieve_crypto(a, source, get, receipt):
    cursor = a.start
    end = min(a.end, a.now)
    rows = []
    limit = min(a.page_size, 299 if source == 'coinbase' else 1000)
    for _ in range(a.max_pages):
        if source == 'binance':
            data = get('https://data-api.binance.vision/api/v3/klines', dict(symbol=a.symbol.replace('-',''), interval=a.timeframe, startTime=cursor, endTime=end-1, limit=limit), {})
            if not isinstance(data, list):
                raise FetchError('provider_error')
            batch = [(exact_timestamp(b[0]), b[1:6]) for b in data]
            for b, (timestamp, _) in zip(data, batch):
                if exact_timestamp(b[6]) + 1 != bar_end(timestamp, a.timeframe, source):
                    raise FetchError('invalid_binance_time_contract')
            next_cursor = max((bar_end(t, a.timeframe, source) for t,_ in batch), default=end)
        elif source == 'coinbase':
            stop = min(end, cursor + limit * duration(a.timeframe))
            data = get(f'https://api.exchange.coinbase.com/products/{a.symbol}/candles', dict(start=iso(cursor),end=iso(stop),granularity=duration(a.timeframe)//1000), {})
            if not isinstance(data, list):
                raise FetchError('provider_error')
            batch = [(exact_timestamp(b[0], 1000),[b[3],b[2],b[1],b[4],b[5]]) for b in data]
            receipt['filteredBars'] += sum(not cursor <= t < stop for t,_ in batch)
            batch = [(t,v) for t,v in batch if cursor <= t < stop]
            next_cursor = stop
        elif source == 'bitstamp':
            stop = min(end, cursor + limit * duration(a.timeframe))
            data = get(f'https://www.bitstamp.net/api/v2/ohlc/{a.symbol.replace("-", "").lower()}/', dict(step=duration(a.timeframe)//1000,start=cursor//1000,limit=limit,exclude_current_candle='true'), {})
            batch = [(exact_timestamp(b['timestamp'], 1000),[b[k] for k in ('open','high','low','close','volume')]) for b in data['data']['ohlc']]
            # A floored first opening may overlap cursor; advance on its native end.
            next_cursor = max((bar_end(t, a.timeframe, source) for t,_ in batch), default=stop)
            if next_cursor <= cursor:
                raise FetchError('nonprogressing_page')
            if batch and min(t for t,_ in batch) >= stop:
                raise FetchError('provider_ignored_requested_window')
        else:
            base, quote = a.symbol.split('-')
            pair = ('XBT' if base == 'BTC' else base) + quote
            receipt['providerSymbol'] = pair
            data = get('https://api.kraken.com/0/public/OHLC', dict(pair=pair,interval=duration(a.timeframe)//60000,since=cursor//1000), {})
            if data['error']:
                raise FetchError('kraken_provider_error')
            pairs = [v for k,v in data['result'].items() if k != 'last']
            if len(pairs) != 1:
                raise FetchError('unexpected_kraken_pair_count')
            batch = [(exact_timestamp(b[0], 1000),[b[1],b[2],b[3],b[4],b[6]]) for b in pairs[0][:-1]]
            receipt['filteredBars'] += bool(pairs[0])
            receipt['pages'] += 1
            if batch:
                first = min(t for t,_ in batch)
                period = duration(a.timeframe)
                # Use the returned native grid, not the unaligned request instant.
                eligible = first - ((first - cursor) // period) * period
                if first > eligible:
                    attempt_gap = {'from': eligible, 'before': first,
                                   'cause': 'unknown_no_ticks_or_outage_or_retention'}
                    receipt['leadingGap'] = attempt_gap
                    latest = exact_timestamp(pairs[0][-1][0], 1000)
                    if latest - eligible >= 720 * period:
                        raise FetchError('history_limit_720_recent_bars')
            receipt.update(paginationExhausted=True, requestedWindowScanned=True)
            return batch
        receipt['pages'] += 1
        receipt['emptyWindows'] += not bool(batch)
        rows.extend(batch)
        if next_cursor >= end:
            receipt.update(paginationExhausted=True, requestedWindowScanned=True)
            return rows
        if next_cursor <= cursor:
            raise FetchError('nonprogressing_page')
        cursor = next_cursor
    raise FetchError('page_cap_truncated')


def retrieve(a, source, get, headers, receipt):
    if source != 'alpaca':
        return retrieve_crypto(a, source, get, receipt)
    rows = []
    token = None
    tokens = set()
    for _ in range(a.max_pages):
        params = dict(symbols=a.symbol, timeframe=a.timeframe[:-1] + {'m':'Min','h':'Hour','d':'Day','w':'Week','M':'Month'}[a.timeframe[-1]],
                      start=iso(a.start), end=iso(min(a.end,a.now)), limit=min(a.page_size,10000), adjustment=a.adjustment, feed=a.feed, sort='asc', asof='-')
        if token:
            params['page_token'] = token
        data = get('https://data.alpaca.markets/v2/stocks/bars', params, headers)
        receipt['pages'] += 1
        batch = data['bars'].get(a.symbol, []) if data['bars'] else []
        receipt['emptyWindows'] += not bool(batch)
        rows.extend((parse_time(b['t']), [b[k] for k in ('o','h','l','c','v')]) for b in batch)
        token = data.get('next_page_token')
        if token is None:
            receipt['paginationExhausted'] = True
            receipt['requestedWindowScanned'] = True
            return rows
        if not isinstance(token, str) or not token or token in tokens:
            raise FetchError('invalid_or_repeated_page_token')
        tokens.add(token)
    raise FetchError('page_cap_truncated')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class HTTPClient:
    HOSTS = {'data.alpaca.markets','data-api.binance.vision','www.bitstamp.net','api.exchange.coinbase.com','api.kraken.com'}

    def __init__(self, args, opener=None, sleep=time.sleep):
        self.args = args
        self.opener = opener or urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        self.sleep = sleep
        self.requests = 0
        self.retries = 0

    def __call__(self, url, params, headers):
        from email.utils import parsedate_to_datetime
        parts = urllib.parse.urlsplit(url)
        if parts.scheme != 'https' or parts.netloc not in self.HOSTS or parts.query or parts.fragment:
            raise FetchError('disallowed_data_url')
        if headers and parts.netloc != 'data.alpaca.markets':
            raise FetchError('credentials_wrong_host')
        for retry in range(self.args.retries + 1):
            self.sleep(0.35)
            request = urllib.request.Request(url + '?' + urllib.parse.urlencode(params), headers={'User-Agent':'OGZ-native-candle-retriever/1', **headers}, method='GET')
            self.requests += 1
            delay = min(60, 2 ** retry)
            try:
                with self.opener.open(request, timeout=self.args.timeout) as response:
                    body = response.read(32 * 1024 * 1024 + 1)
                if len(body) > 32 * 1024 * 1024:
                    raise FetchError('response_size_limit')
                return json.loads(body, parse_float=Decimal)
            except urllib.error.HTTPError as exc:
                code = exc.code
                if code != 429 and not 500 <= code <= 599:
                    exc.close()
                    raise FetchError(f'http_{code}') from None
                retry_after = exc.headers.get('Retry-After')
                reset = exc.headers.get('X-RateLimit-Reset')
                try:
                    if retry_after:
                        try:
                            delay = max(delay, float(retry_after))
                        except ValueError:
                            delay = max(delay, parsedate_to_datetime(retry_after).timestamp() - time.time())
                    if reset:
                        delay = max(delay, float(reset) - time.time())
                except (TypeError, ValueError, OverflowError):
                    pass  # Invalid rate metadata cannot weaken conservative backoff.
                exc.close()
                if not 0 <= delay <= 300:
                    raise FetchError('retry_delay_exceeds_bound') from None
                error = f'http_{code}_retry_exhausted'
            except (urllib.error.URLError, TimeoutError, OSError):
                error = 'network_retry_exhausted'
            except (ValueError, UnicodeError):
                raise FetchError('invalid_json_response') from None
            if retry == self.args.retries:
                raise FetchError(error)
            self.retries += 1
            self.sleep(delay)


def encode_json(value):
    """Emit validated Decimal values as JSON numbers without float rounding."""
    if isinstance(value, Decimal):
        if not value.is_finite():
            raise FetchError('nonfinite_json_number')
        return str(value)
    if isinstance(value, dict):
        return '{' + ','.join(json.dumps(k)+':'+encode_json(v) for k,v in value.items()) + '}'
    if isinstance(value, (list, tuple)):
        return '[' + ','.join(encode_json(v) for v in value) + ']'
    return json.dumps(value, allow_nan=False)


def write_json(path, value):
    with path.open('x', encoding='utf-8') as stream:
        stream.write(encode_json(value))
        stream.write('\n')


def read_credentials(path, environ):
    keys = ('ALPACA_API_KEY', 'ALPACA_API_SECRET')
    result = {k:environ.get(k, '') for k in keys}
    if path is None:
        return result
    try:
        text = path.read_text(encoding='utf-8')
        for line in text.splitlines():
            key, sep, value = line.strip().partition('=')
            if key not in keys or not sep:
                continue
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in '\"\'':
                value = value[1:-1]
            if not value or any(c in value for c in '\r\n\x00'):
                raise FetchError('invalid_explicit_credentials_file')
            result[key] = value
    except (OSError, UnicodeError):
        raise FetchError('unreadable_explicit_credentials_file') from None
    return result


def run(a, transport=None, credentials=None):
    import os
    import sys
    try:
        a.output.mkdir(parents=True, exist_ok=False)
    except OSError:
        print('output must be a NEW writable directory', file=sys.stderr)
        return 2
    report = dict(symbol=a.symbol, asset=a.asset, timeframe=a.timeframe, start=iso(a.start), end=iso(a.end),
                  asOf=iso(a.now), feed=a.feed if a.asset == 'stocks' else None,
                  adjustment=a.adjustment if a.asset == 'stocks' else None, coverageUnknown=True,
                  coverageNote='API exhaustion is not proof of full market history; no-ticks versus outage unknown',
                  matrixCompatibleTimeframe=a.timeframe in MATRIX_FRAMES, attempts=[], status='failed')
    try:
        credentials = credentials if credentials is not None else read_credentials(a.env_file, os.environ)
    except FetchError as exc:
        report['error'] = str(exc)
        write_json(a.output / 'receipt.json', report)
        return 1
    report['endPolicy'] = a.end_policy
    for source in a.sources:
        candles = []
        attempt = dict(source=source, pages=0, requestsAttempted=0, retries=0, emptyWindows=0, identicalDuplicates=0, filteredBars=0,
                       sortedNetworkResponse=False, paginationExhausted=False, requestedWindowScanned=False, status='failed')
        report['attempts'].append(attempt)
        try:
            if a.timeframe not in TIMEFRAMES[source]:
                raise FetchError('unavailable_native_timeframe')
            headers = {}
            if source == 'alpaca':
                if not all(credentials.get(k) for k in ('ALPACA_API_KEY','ALPACA_API_SECRET')):
                    raise FetchError('missing_alpaca_credentials')
                headers = {'APCA-API-KEY-ID':credentials['ALPACA_API_KEY'], 'APCA-API-SECRET-KEY':credentials['ALPACA_API_SECRET']}
            client = transport or HTTPClient(a)
            pages_path = a.output / f'attempt-{len(report["attempts"]):02d}-{source}-pages.jsonl'
            attempt['rawPagesFile'] = pages_path.name
            def recorded_get(url, params, request_headers):
                attempt['requestsAttempted'] += 1
                try:
                    data = client(url, params, request_headers)
                finally:
                    if isinstance(client, HTTPClient):
                        attempt['requestsAttempted'] = client.requests
                        attempt['retries'] = client.retries
                # Persist candle payloads only, never headers or provider error bodies.
                if source in ('binance','coinbase'):
                    payload = data if isinstance(data, list) else None
                elif source == 'alpaca':
                    payload = {'bars':data['bars'], 'next_page_token':data.get('next_page_token')} if isinstance(data, dict) and 'bars' in data else None
                elif source == 'bitstamp':
                    payload = data['data'] if isinstance(data, dict) and isinstance(data.get('data'), dict) and 'ohlc' in data['data'] else None
                else:
                    payload = data['result'] if isinstance(data, dict) and not data.get('error') and 'result' in data else None
                if payload is not None:
                    with pages_path.open('a', encoding='utf-8') as stream:
                        stream.write(encode_json({'endpoint':url,'parameters':params,'response':payload}) + '\n')
                return data
            rows = retrieve(a, source, recorded_get, headers, attempt)
            candles = normalize(rows, a, source, attempt)
            if not candles:
                raise FetchError('empty_requested_range')
            # Large leading absence is not adequate history, even on a successful API scan.
            # Stock tolerance permits ordinary closures, never treats a 24/7 grid as sessions.
            if a.timeframe.endswith('M'):
                from zoneinfo import ZoneInfo
                zone = ZoneInfo('America/New_York') if source == 'alpaca' else UTC
                dt = datetime.fromtimestamp(a.start / 1000, zone)
                n = int(a.timeframe[:-1])
                # Full native calendar period containing start, not its remainder.
                dt = dt.replace(month=((dt.month-1)//n)*n+1, day=1,
                                hour=0, minute=0, second=0, microsecond=0)
                anchor = int(dt.timestamp()*1000)
            else:
                anchor = candles[0]['timestamp']
            tolerance = max(7*86400000 if a.asset == 'stocks' else 86400000,
                            bar_end(anchor,a.timeframe,source)-anchor,
                            bar_end(candles[-1]['timestamp'],a.timeframe,source)-candles[-1]['timestamp'])
            attempt['leadingAbsenceMs'] = candles[0]['timestamp'] - a.start
            attempt['trailingAbsenceMs'] = max(0, min(a.end,a.now) - bar_end(candles[-1]['timestamp'],a.timeframe,source))
            attempt['boundaryShortfallToleranceMs'] = tolerance
            if max(attempt['leadingAbsenceMs'], attempt['trailingAbsenceMs']) >= tolerance:
                raise FetchError('history_boundary_shortfall')
            attempt['status'] = 'success'
            report.update(status='success', source=source, sourceSwitch=len(report['attempts']) > 1, bars=len(candles))
        except FetchError as exc:
            attempt['error'] = str(exc)
        except (KeyError, IndexError, AttributeError, TypeError, ValueError, ArithmeticError, OSError):
            attempt['error'] = 'malformed_provider_response_or_io_failure'
        attempt['statusScope'] = 'retrieval_only'
        if attempt['status'] == 'success':
            staged_candles = a.output / 'candles.json.tmp'
            staged_receipt = a.output / 'receipt.json.tmp'
            published = []
            try:
                write_json(a.output / f'attempt-{len(report["attempts"]):02d}-{source}.json', attempt)
                write_json(staged_candles, candles)
                write_json(staged_receipt, report)
                published.append(a.output / 'candles.json')
                staged_candles.rename(a.output / 'candles.json')
                # Receipt success is the commit marker. A hard kill between these
                # renames may leave candles without a receipt; no disk guarantee.
                published.append(a.output / 'receipt.json')
                staged_receipt.rename(a.output / 'receipt.json')
                return 0
            except (OSError, KeyboardInterrupt):
                for path in [staged_candles, staged_receipt, *published]:
                    try:
                        path.unlink(missing_ok=True)
                    except OSError:
                        pass  # Best effort only if the filesystem itself fails.
                report.update(status='failed', error='output_publication_failed')
                try:
                    write_json(a.output / 'receipt.json', report)
                except (OSError, KeyboardInterrupt):
                    pass
                return 1
        write_json(a.output / f'attempt-{len(report["attempts"]):02d}-{source}.json', attempt)
    write_json(a.output / 'receipt.json', report)
    return 1


def main(argv=None):
    import sys
    a = arguments(argv)
    if a.list_timeframes:
        print(json.dumps({'native':TIMEFRAMES, 'matrixTimeframes':MATRIX_FRAMES, 'note':'No local aggregation; unsupported native timeframe fails/falls back.'}, indent=2))
        return 0
    try:
        code = run(a)
    except OSError:
        print('output I/O failure; inspect partial receipts; no success claimed', file=sys.stderr)
        return 1
    print(f'candle retrieval exit={code}; receipts: {a.output}')
    return code


if __name__ == '__main__':
    raise SystemExit(main())
