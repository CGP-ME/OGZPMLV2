#!/usr/bin/env python3
"""Read-only native REST candles. UTC half-open ranges; no aggregation.

Only --env-file explicitly reads a file (two Alpaca keys only). IEX is not
consolidated SIP. API range exhaustion never proves complete market history.
"""
import argparse
import hashlib
import http.client
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


class Unavailable:
    """Named boundary outcome, never thrown; no partial data attached."""
    def __init__(self, code, stage, **details):
        self.code, self.stage, self.details = code, stage, details


def diagnostic(fault, source=None):
    import sys
    print(json.dumps(dict(error=fault.code, stage=fault.stage, source=source,
                          **fault.details)), file=sys.stderr)


def parse_time(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d\d-\d\d(?:T\d\d:\d\d(?::\d\d(?:\.\d{1,6})?)?(?:Z|[+-]\d\d:\d\d))?', value):
        return Unavailable('invalid_time_format', 'timestamp')
    try:
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        return Unavailable('invalid_calendar_time', 'timestamp')
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    if dt.microsecond % 1000:
        return Unavailable('timestamp_not_exact_milliseconds', 'timestamp')
    delta = dt - datetime(1970, 1, 1, tzinfo=UTC)
    return (delta.days * 86400 + delta.seconds) * 1000 + delta.microseconds // 1000


def iso(ms):
    return datetime.fromtimestamp(ms / 1000, UTC).isoformat().replace('+00:00', 'Z')


class CLIParser(argparse.ArgumentParser):
    def error(self, message):
        # argparse includes raw supplied values in its default diagnostics.
        self.exit(2, 'invalid_cli_syntax: check option names, choices and numeric types\n')


def arguments(argv=None, now=None):
    p = CLIParser(description=__doc__)
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
    return validate_arguments(a)


def validate_arguments(a):
    if not all([a.asset, a.symbol, a.timeframe, a.output]):
        return Unavailable('required_arguments_missing', 'arguments')
    pattern = r'[A-Z][A-Z0-9.]{0,14}' if a.asset == 'stocks' else r'[A-Z0-9]{2,15}-[A-Z0-9]{2,15}'
    if not re.fullmatch(pattern, a.symbol):
        return Unavailable('invalid_symbol', 'arguments')
    if a.timeframe not in set(sum(TIMEFRAMES.values(), [])):
        return Unavailable('unsupported_native_timeframe', 'arguments')
    if bool(a.start) == bool(a.lookback):
        return Unavailable('start_or_lookback_required', 'arguments')
    if a.start and not a.end:
        return Unavailable('end_required', 'arguments')
    a.end_policy = 'explicit' if a.end else ('now_minus_16_minutes' if a.asset == 'stocks' else 'now')
    a.end = parse_time(a.end) if a.end else a.now - (960000 if a.asset == 'stocks' else 0)
    if isinstance(a.end, Unavailable):
        return a.end
    if a.lookback:
        match = re.fullmatch(r'([1-9][0-9]{0,15})(s|m|h|d|w)', a.lookback)
        if not match:
            return Unavailable('invalid_lookback', 'arguments')
        a.start = a.end - int(match[1]) * {'s':1000,'m':60000,'h':3600000,'d':86400000,'w':604800000}[match[2]]
    else:
        a.start = parse_time(a.start)
    if isinstance(a.start, Unavailable):
        return a.start
    if not 0 <= a.start < a.end or a.start >= a.now:
        return Unavailable('invalid_range', 'arguments')
    if not (0.1 <= a.timeout <= 120 and 0 <= a.retries <= 10 and 1 <= a.page_size <= 10000 and 1 <= a.max_pages <= 100000):
        return Unavailable('invalid_numeric_bounds', 'arguments')
    if a.sources == 'auto':
        a.sources = ['alpaca'] if a.asset == 'stocks' else (['bitstamp','coinbase','kraken'] if a.symbol.endswith('-USD') else ['binance','bitstamp','kraken'])
    else:
        a.sources = a.sources.split(',')
    if len(a.sources) != len(set(a.sources)) or any(s not in TIMEFRAMES for s in a.sources):
        return Unavailable('invalid_sources', 'arguments')
    if any((s == 'alpaca') != (a.asset == 'stocks') for s in a.sources):
        return Unavailable('provider_asset_mismatch', 'arguments')
    return a


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
            return Unavailable('invalid_ohlcv', 'normalize')
        if timestamp in found:
            if found[timestamp][0] != numbers:
                return Unavailable('conflicting_duplicate_timestamp', 'normalize')
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
    from decimal import DecimalException
    try:
        n = Decimal(str(value)) * scale
    except (DecimalException, ValueError):
        return Unavailable('invalid_timestamp', 'timestamp')
    if not n.is_finite() or n != n.to_integral_value() or n < 0 or n > 253402214400000:
        return Unavailable('invalid_timestamp', 'timestamp')
    return int(n)


def decode_page(data, source, a):
    """Admit provider shape and timestamps before pagination or persistence."""
    if isinstance(data, Unavailable):
        return data
    if source in ('binance', 'coinbase'):
        batch = data
    elif not isinstance(data, dict):
        return Unavailable('provider_error', 'decode')
    elif source == 'bitstamp':
        envelope = data.get('data')
        batch = envelope.get('ohlc') if isinstance(envelope, dict) else None
    elif source == 'alpaca':
        bars = data.get('bars')
        if bars is None and 'bars' in data:
            batch = []
        elif isinstance(bars, dict):
            batch = bars.get(a.symbol, [])
        else:
            return Unavailable('invalid_bars_envelope', 'decode')
    else:
        if data.get('error'):
            return Unavailable('kraken_provider_error', 'decode')
        result = data.get('result')
        if not isinstance(result, dict) or 'error' not in data:
            return Unavailable('invalid_kraken_envelope', 'decode')
        pairs = [v for k,v in result.items() if k != 'last']
        if len(pairs) != 1:
            return Unavailable('unexpected_kraken_pair_count', 'decode')
        batch = pairs[0]
    if not isinstance(batch, list):
        return Unavailable('provider_error', 'decode')
    rows = []
    for b in batch:
        if source in ('alpaca','bitstamp'):
            fields = ('t','o','h','l','c','v') if source == 'alpaca' else ('timestamp','open','high','low','close','volume')
            if not isinstance(b, dict):
                return Unavailable('invalid_bar_shape', 'decode')
            missing = [k for k in fields if k not in b]
            if missing:
                return Unavailable('missing_bar_fields', 'decode', fields=missing)
            timestamp = parse_time(b[fields[0]]) if source == 'alpaca' else exact_timestamp(b[fields[0]], 1000)
            values = [b[k] for k in fields[1:]]
        else:
            size = 6 if source == 'coinbase' else 7
            if not isinstance(b, list) or len(b) < size:
                return Unavailable('invalid_bar_shape', 'decode')
            timestamp = exact_timestamp(b[0], 1 if source == 'binance' else 1000)
            values = b[1:6] if source == 'binance' else ([b[3],b[2],b[1],b[4],b[5]] if source == 'coinbase' else [b[1],b[2],b[3],b[4],b[6]])
        if isinstance(timestamp, Unavailable):
            return timestamp
        try:
            bar_end(timestamp, a.timeframe, source)
        except (ValueError, OverflowError, OSError):
            return Unavailable('invalid_calendar_boundary', 'decode')
        if source == 'binance':
            close = exact_timestamp(b[6])
            if isinstance(close, Unavailable):
                return close
            if close + 1 != bar_end(timestamp, a.timeframe, source):
                return Unavailable('invalid_binance_time_contract', 'decode')
        rows.append((timestamp, values))
    return rows


def retrieve_crypto(a, source, get, receipt):
    cursor = a.start
    end = min(a.end, a.now)
    rows = []
    limit = min(a.page_size, 299 if source == 'coinbase' else 1000)
    for _ in range(a.max_pages):
        if source == 'binance':
            data = get('https://data-api.binance.vision/api/v3/klines', dict(symbol=a.symbol.replace('-',''), interval=a.timeframe, startTime=cursor, endTime=end-1, limit=limit), {})
            batch = decode_page(data, source, a)
            if isinstance(batch, Unavailable):
                return batch
            next_cursor = max((bar_end(t, a.timeframe, source) for t,_ in batch), default=end)
        elif source == 'coinbase':
            stop = min(end, cursor + limit * duration(a.timeframe))
            data = get(f'https://api.exchange.coinbase.com/products/{a.symbol}/candles', dict(start=iso(cursor),end=iso(stop),granularity=duration(a.timeframe)//1000), {})
            batch = decode_page(data, source, a)
            if isinstance(batch, Unavailable):
                return batch
            receipt['filteredBars'] += sum(not cursor <= t < stop for t,_ in batch)
            batch = [(t,v) for t,v in batch if cursor <= t < stop]
            next_cursor = stop
        elif source == 'bitstamp':
            stop = min(end, cursor + limit * duration(a.timeframe))
            data = get(f'https://www.bitstamp.net/api/v2/ohlc/{a.symbol.replace("-", "").lower()}/', dict(step=duration(a.timeframe)//1000,start=cursor//1000,limit=limit,exclude_current_candle='true'), {})
            batch = decode_page(data, source, a)
            if isinstance(batch, Unavailable):
                return batch
            # A floored first opening may overlap cursor; advance on its native end.
            next_cursor = max((bar_end(t, a.timeframe, source) for t,_ in batch), default=stop)
            if next_cursor <= cursor:
                return Unavailable('nonprogressing_page', 'pagination')
            if batch and min(t for t,_ in batch) >= stop:
                return Unavailable('provider_ignored_requested_window', 'pagination')
        else:
            base, quote = a.symbol.split('-')
            pair = ('XBT' if base == 'BTC' else base) + quote
            receipt['providerSymbol'] = pair
            data = get('https://api.kraken.com/0/public/OHLC', dict(pair=pair,interval=duration(a.timeframe)//60000,since=cursor//1000), {})
            decoded = decode_page(data, source, a)
            if isinstance(decoded, Unavailable):
                return decoded
            batch = decoded[:-1]
            receipt['filteredBars'] += bool(decoded)
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
                    latest = decoded[-1][0]
                    if latest - eligible >= 720 * period:
                        return Unavailable('history_limit_720_recent_bars', 'retention')
            receipt.update(paginationExhausted=True, requestedWindowScanned=True)
            return batch
        receipt['pages'] += 1
        receipt['emptyWindows'] += not bool(batch)
        rows.extend(batch)
        if next_cursor >= end:
            receipt.update(paginationExhausted=True, requestedWindowScanned=True)
            return rows
        if next_cursor <= cursor:
            return Unavailable('nonprogressing_page', 'pagination')
        cursor = next_cursor
    return Unavailable('page_cap_truncated', 'pagination')


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
        batch = decode_page(data, source, a)
        if isinstance(batch, Unavailable):
            return batch
        receipt['emptyWindows'] += not bool(batch)
        rows.extend(batch)
        token = data.get('next_page_token')
        if token is None:
            receipt['paginationExhausted'] = True
            receipt['requestedWindowScanned'] = True
            return rows
        if not isinstance(token, str) or not token or len(token) > 4096 or any(ord(c) < 33 or ord(c) > 126 for c in token) or token in tokens:
            return Unavailable('invalid_or_repeated_page_token', 'pagination')
        tokens.add(token)
    return Unavailable('page_cap_truncated', 'pagination')


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
        self.warnings = []
        self.response_evidence = []

    def __call__(self, url, params, headers):
        self.response_evidence = []
        from email.utils import parsedate_to_datetime
        import math
        try:
            parts = urllib.parse.urlsplit(url)
        except ValueError:
            return Unavailable('disallowed_data_url', 'request')
        if parts.scheme != 'https' or parts.netloc not in self.HOSTS or parts.query or parts.fragment:
            return Unavailable('disallowed_data_url', 'request')
        if headers and parts.netloc != 'data.alpaca.markets':
            return Unavailable('credentials_wrong_host', 'request')
        if any(k not in ('APCA-API-KEY-ID','APCA-API-SECRET-KEY') or not isinstance(v, str) or not v or any(ord(c) < 33 or ord(c) > 126 for c in v) for k,v in headers.items()):
            return Unavailable('invalid_request_headers', 'request')
        for retry in range(self.args.retries + 1):
            self.sleep(0.35)
            request = urllib.request.Request(url + '?' + urllib.parse.urlencode(params), headers={'User-Agent':'OGZ-native-candle-retriever/1', **headers}, method='GET')
            self.requests += 1
            evidence = dict(request=self.requests, retry=retry, sha256=None, byteLength=None,
                            bodyScope="unavailable", absence="no_body_captured")
            self.response_evidence.append(evidence)
            delay = min(60, 2 ** retry)
            try:
                with self.opener.open(request, timeout=self.args.timeout) as response:
                    body = bytearray()
                    framing_fault = None
                    cap = 32 * 1024 * 1024 + 1
                    # Bounded read(n) can silently stop before Content-Length.
                    # Retain only bytes returned or exposed by IncompleteRead.
                    while len(body) < cap:
                        try:
                            part = response.read(min(65536, cap - len(body)))
                        except http.client.IncompleteRead as exc:
                            body.extend(exc.partial[:cap - len(body)])
                            framing_fault = Unavailable('http_framing_retry_exhausted', 'response_read',
                                                        exceptionType=type(exc).__name__)
                            break
                        except (http.client.HTTPException, OSError) as exc:
                            framing_fault = Unavailable('http_framing_retry_exhausted', 'response_read',
                                                        exceptionType=type(exc).__name__)
                            break
                        body.extend(part)
                        if not part:
                            if isinstance(response, http.client.HTTPResponse) and (
                                    response.length not in (None, 0) or
                                    (response.chunked and not response.isclosed())):
                                framing_fault = Unavailable('http_framing_retry_exhausted', 'response_read',
                                                            reason='incomplete_http_framing')
                            break
                    # Identity before decoding; never persist body or error text.
                    if body:
                        evidence.update(sha256=hashlib.sha256(body).hexdigest(), byteLength=len(body),
                                        bodyScope=('captured_prefix' if len(body) == cap else
                                                   'captured_partial' if framing_fault else 'complete'),
                                        absence=None)
                    if framing_fault:
                        evidence['absence'] = 'http_framing_incomplete'
            except urllib.error.HTTPError as exc:
                code = exc.code
                evidence.update(httpStatus=code, absence="http_error_body_not_read")
                metadata = exc.headers
                try:
                    exc.close()
                except OSError as close_error:
                    return Unavailable('http_response_close_failed', 'request_close', exceptionType=type(close_error).__name__)
                if code != 429 and not 500 <= code <= 599:
                    return Unavailable(f'http_{code}', 'request')
                for header, warning in (('Retry-After','invalid_retry_after'), ('X-RateLimit-Reset','invalid_rate_limit_reset')):
                    value = metadata.get(header)
                    if value is None:
                        continue
                    try:
                        try:
                            wait = float(value)
                            if header == 'X-RateLimit-Reset':
                                wait -= time.time()
                        except ValueError:
                            wait = parsedate_to_datetime(value).timestamp() - time.time() if header == 'Retry-After' else float(value)
                        valid = math.isfinite(wait)
                    except (TypeError, ValueError, OverflowError):
                        valid = False
                    if not valid:
                        fault = Unavailable(warning, 'retry_metadata')
                        self.warnings.append(dict(code=fault.code, stage=fault.stage))
                        diagnostic(fault)
                    else:
                        delay = max(delay, wait)
                if delay > 300:
                    return Unavailable('retry_delay_exceeds_bound', 'retry_metadata')
                fault = Unavailable(f'http_{code}_retry_exhausted', 'request')
            except http.client.HTTPException as exc:
                fault = Unavailable('http_framing_retry_exhausted', 'request', exceptionType=type(exc).__name__)
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                fault = Unavailable('network_retry_exhausted', 'request', exceptionType=type(exc).__name__)
            else:
                if framing_fault:
                    if retry == self.args.retries:
                        return framing_fault
                    self.retries += 1
                    self.sleep(delay)
                    continue
                if len(body) > 32 * 1024 * 1024:
                    return Unavailable('response_size_limit', 'response')
                from decimal import DecimalException
                try:
                    data = json.loads(body, parse_float=Decimal)
                except DecimalException as exc:
                    return Unavailable('invalid_json_number', 'response_decode', exceptionType=type(exc).__name__)
                except RecursionError:
                    return Unavailable('invalid_json_nesting', 'response_decode')
                except (ValueError, UnicodeError) as exc:
                    return Unavailable('invalid_json_response', 'response_decode', exceptionType=type(exc).__name__)
                # Provider envelopes are shallow; never route arbitrarily nested data.
                pending = [(data, 0)]
                while pending:
                    value, depth = pending.pop()
                    if isinstance(value, (list, dict)):
                        if depth >= 64:
                            return Unavailable('invalid_json_nesting', 'response_decode')
                        pending.extend((child, depth + 1) for child in (value.values() if isinstance(value, dict) else value))
                return data
            if retry == self.args.retries:
                return fault
            self.retries += 1
            self.sleep(delay)


def encode_json(value):
    """Encode exact numbers; return a named outcome before opening any file."""
    import math
    if isinstance(value, (Decimal, float)):
        if not (value.is_finite() if isinstance(value, Decimal) else math.isfinite(value)):
            return Unavailable('nonfinite_json_number', 'encode')
        return str(value)
    if isinstance(value, (dict, list, tuple)):
        parts = []
        entries = value.items() if isinstance(value, dict) else enumerate(value)
        for key, child in entries:
            text = encode_json(child)
            if isinstance(text, Unavailable):
                return text
            parts.append(json.dumps(key)+':'+text if isinstance(value, dict) else text)
        return ('{' if isinstance(value, dict) else '[') + ','.join(parts) + ('}' if isinstance(value, dict) else ']')
    try:
        return json.dumps(value, allow_nan=False)
    except (TypeError, ValueError):
        return Unavailable('invalid_json_value', 'encode')


def write_json(path, value):
    text = encode_json(value)
    if isinstance(text, Unavailable):
        return text
    with path.open('x', encoding='utf-8') as stream:
        stream.write(text + '\n')
    return None


def persist(path, value, stage):
    try:
        result = write_json(path, value)
    except (OSError, KeyboardInterrupt) as exc:
        result = Unavailable('output_write_failed', stage, exceptionType=type(exc).__name__)
    if isinstance(result, Unavailable):
        diagnostic(result)
    return result


def read_credentials(path, environ):
    keys = ('ALPACA_API_KEY', 'ALPACA_API_SECRET')
    result = {k:environ.get(k, '') if path is None else '' for k in keys}
    if path is None:
        if any(value and any(ord(c) < 33 or ord(c) > 126 for c in value) for value in result.values()):
            return Unavailable('invalid_environment_credentials', 'credentials')
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
            if not value or any(ord(c) < 33 or ord(c) > 126 for c in value):
                return Unavailable('invalid_explicit_credentials_file', 'credentials')
            result[key] = value
    except (OSError, UnicodeError) as exc:
        return Unavailable('unreadable_explicit_credentials_file', 'credentials', exceptionType=type(exc).__name__)
    return result


def source_attempt(a, source, transport, credentials, attempt, attempt_number):
    if a.timeframe not in TIMEFRAMES[source]:
        return Unavailable('unavailable_native_timeframe', 'source_admission')
    headers = {}
    if source == 'alpaca':
        if not all(credentials.get(k) for k in ('ALPACA_API_KEY','ALPACA_API_SECRET')):
            return Unavailable('missing_alpaca_credentials', 'credentials')
        headers = {'APCA-API-KEY-ID':credentials['ALPACA_API_KEY'], 'APCA-API-SECRET-KEY':credentials['ALPACA_API_SECRET']}
    client = transport or HTTPClient(a)
    pages_path = a.output / f'attempt-{attempt_number:02d}-{source}-pages.jsonl'
    attempt['rawPagesFile'] = pages_path.name
    def recorded_get(url, params, request_headers):
        attempt['requestsAttempted'] += 1
        records = attempt.setdefault('responseEvidence', [])
        evidence = dict(source=source, request=len(records) + 1, endpoint=url,
                        parameters={k:v for k,v in params.items() if k != 'page_token'},
                        transport='http_body_bytes' if isinstance(client, HTTPClient) else 'synthetic_semantic',
                        exchanges=[], wireAbsence=None if isinstance(client, HTTPClient) else
                        'injected_transport_has_no_http_bytes', outcome='pending')
        records.append(evidence)
        try:
            data = client(url, params, request_headers)
        except (urllib.error.URLError, OSError) as exc:
            data = Unavailable('network_retry_exhausted', 'request', exceptionType=type(exc).__name__)
        finally:
            if isinstance(client, HTTPClient):
                attempt['requestsAttempted'] = client.requests
                attempt['retries'] = client.retries
                attempt['warnings'] = list(client.warnings)
                evidence['exchanges'] = list(client.response_evidence)
        decoded = decode_page(data, source, a)
        if isinstance(decoded, Unavailable):
            evidence['outcome'] = decoded.code
            return decoded
        validation = normalize(decoded, a, source, dict(identicalDuplicates=0, filteredBars=0))
        if isinstance(validation, Unavailable):
            evidence['outcome'] = validation.code
            return validation
        evidence['outcome'] = 'candle_fields_admitted'
        # Persist only admitted candle fields, not extra provider text or tokens.
        if source in ('binance','coinbase'):
            payload = [b[:7 if source == 'binance' else 6] for b in data]
        elif source == 'alpaca':
            payload = {'bars':{a.symbol:[{k:b[k] for k in ('t','o','h','l','c','v')} for b in (data['bars'] or {}).get(a.symbol,[])]},
                       'nextPageTokenPresent': data.get('next_page_token') is not None}
        elif source == 'bitstamp':
            payload = {'ohlc':[{k:b[k] for k in ('timestamp','open','high','low','close','volume')} for b in data['data']['ohlc']]}
        else:
            payload = {'candles': [[t, *values] for t,values in decoded]}
        if payload is not None:
            text = encode_json({'endpoint':url,'parameters':{k:v for k,v in params.items() if k != 'page_token'},'response':payload})
            if isinstance(text, Unavailable):
                return text
            try:
                with pages_path.open('a', encoding='utf-8') as stream:
                    stream.write(text + '\n')
            except (OSError, KeyboardInterrupt) as exc:
                return Unavailable('output_raw_pages_failed', 'raw_pages', exceptionType=type(exc).__name__)
        return data
    rows = retrieve(a, source, recorded_get, headers, attempt)
    if isinstance(rows, Unavailable):
        return rows
    candles = normalize(rows, a, source, attempt)
    if isinstance(candles, Unavailable):
        return candles
    if not candles:
        return Unavailable('empty_requested_range', 'normalize')
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
        return Unavailable('history_boundary_shortfall', 'coverage')
    return candles


def run(a, transport=None, credentials=None):
    import os
    import sys
    try:
        a.output.mkdir(parents=True, exist_ok=False)
    except OSError as exc:
        diagnostic(Unavailable('output_directory_unavailable', 'output_directory', exceptionType=type(exc).__name__))
        return 2
    report = dict(symbol=a.symbol, asset=a.asset, timeframe=a.timeframe, start=iso(a.start), end=iso(a.end),
                  asOf=iso(a.now), feed=a.feed if a.asset == 'stocks' else None,
                  adjustment=a.adjustment if a.asset == 'stocks' else None, coverageUnknown=True,
                  coverageNote='API exhaustion is not proof of full market history; no-ticks versus outage unknown',
                  matrixCompatibleTimeframe=a.timeframe in MATRIX_FRAMES, attempts=[], status='failed')
    if 'alpaca' not in a.sources:
        credentials = {}
        report['credentialProvenance'] = dict(source='not_applicable', keyPresent=None, secretPresent=None)
    else:
        credential_source = 'explicit_file' if a.env_file is not None else ('provided' if credentials is not None else 'environment')
        report['credentialProvenance'] = dict(source=credential_source, keyPresent=None, secretPresent=None)
        credentials = read_credentials(a.env_file, os.environ) if a.env_file is not None or credentials is None else credentials
        if isinstance(credentials, Unavailable):
            diagnostic(credentials)
            report.update(error=credentials.code, stage=credentials.stage)
            persist(a.output / 'receipt.json', report, 'failure_receipt')
            return 1
        report['credentialProvenance'] = {
            'source': credential_source,
            'keyPresent': bool(credentials.get('ALPACA_API_KEY')),
            'secretPresent': bool(credentials.get('ALPACA_API_SECRET')),
        }
    report['endPolicy'] = a.end_policy
    for source in a.sources:
        candles = []
        attempt = dict(source=source, pages=0, requestsAttempted=0, retries=0, emptyWindows=0, identicalDuplicates=0, filteredBars=0,
                       sortedNetworkResponse=False, paginationExhausted=False, requestedWindowScanned=False, status='failed')
        report['attempts'].append(attempt)
        candles = source_attempt(a, source, transport, credentials, attempt, len(report['attempts']))
        if isinstance(candles, Unavailable):
            attempt.update(error=candles.code, stage=candles.stage, details=candles.details,
                           bars=None, quarantineScope='whole_source',
                           fallback=('stopped_output_failure' if candles.code.startswith('output_') else
                                     'next_allowed_source' if len(report['attempts']) < len(a.sources) else
                                     'no_allowed_sources_remaining'))
            diagnostic(candles, source)
        else:
            attempt['status'] = 'success'
            report.update(status='success', source=source, sourceSwitch=len(report['attempts']) > 1, bars=len(candles))
        attempt['statusScope'] = 'retrieval_only'
        attempt_path = a.output / f'attempt-{len(report["attempts"]):02d}-{source}.json'
        if persist(attempt_path, attempt, 'attempt_receipt') is not None:
            attempt['fallback'] = 'stopped_output_failure'
            report.update(status='failed', error='output_attempt_receipt_failed')
            persist(a.output/'receipt.json', report, 'failure_receipt')
            return 1
        if isinstance(candles, Unavailable) and candles.code.startswith('output_'):
            report.update(error=candles.code, stage=candles.stage)
            persist(a.output/'receipt.json', report, 'failure_receipt')
            return 1
        if attempt['status'] == 'success':
            staged_candles = a.output / 'candles.json.tmp'
            staged_receipt = a.output / 'receipt.json.tmp'
            published = []
            fault = persist(staged_candles, candles, 'candles_stage')
            if fault is None:
                fault = persist(staged_receipt, report, 'receipt_stage')
            if fault is None:
                stage = 'candles_rename'
                try:
                    published.append(a.output / 'candles.json')
                    staged_candles.rename(a.output / 'candles.json')
                    stage = 'receipt_rename'
                    published.append(a.output / 'receipt.json')
                    staged_receipt.rename(a.output / 'receipt.json')
                except (OSError, KeyboardInterrupt) as exc:
                    fault = Unavailable('output_publication_failed', stage, exceptionType=type(exc).__name__)
                    diagnostic(fault)
            if fault is None:
                return 0
            diagnostic(Unavailable('output_publication_failed', fault.stage))
            # Withdraw the success receipt before removing its candle artifact.
            # A failed unlink may leave the receipt visible: preserve candles even
            # when the syscall's effect is uncertain. Nonzero exit is not retraction.
            receipt_withdrawn = True
            for path in [*reversed(published), staged_candles, staged_receipt]:
                if path.name == 'candles.json' and not receipt_withdrawn:
                    diagnostic(Unavailable('output_publication_retained', 'cleanup',
                                           artifact=path.name, reason='receipt_withdrawal_failed'))
                    continue
                try:
                    path.unlink(missing_ok=True)
                except (OSError, KeyboardInterrupt) as exc:
                    if path.name == 'receipt.json':
                        receipt_withdrawn = False
                    diagnostic(Unavailable('output_cleanup_failed', 'cleanup', artifact=path.name, exceptionType=type(exc).__name__))
            report.update(status='failed', error='output_publication_failed')
            persist(a.output / 'receipt.json', report, 'failure_receipt')
            return 1
    persist(a.output / 'receipt.json', report, 'failure_receipt')
    return 1


def main(argv=None):
    import sys
    a = arguments(argv)
    if isinstance(a, Unavailable):
        diagnostic(a)
        return 2
    if a.list_timeframes:
        print(json.dumps({'native':TIMEFRAMES, 'matrixTimeframes':MATRIX_FRAMES, 'note':'No local aggregation; unsupported native timeframe fails/falls back.'}, indent=2))
        return 0
    try:
        code = run(a)
    except OSError as exc:
        diagnostic(Unavailable('output_io_failure', 'run_boundary', exceptionType=type(exc).__name__))
        return 1
    print(f'candle retrieval exit={code}; receipts: {a.output}')
    return code


if __name__ == '__main__':
    raise SystemExit(main())
