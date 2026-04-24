/**
 * foundation/ohlc-normalize.js
 *
 * Single-choke-point OHLC shape translator. Every broker adapter emits
 * 'ohlc' events in whatever shape its upstream API delivers; this
 * normalizer converts ANY recognized shape into the canonical
 * Kraken-style array the downstream CandleProcessor / indicator
 * engine expects:
 *
 *   [time, etime, open, high, low, close, vwap, volume, count]
 *
 * The alternative (convert inside each adapter) means every new broker
 * re-implements the same field-name + type translation boilerplate.
 * Centralizing here means new adapters stay dumb: they emit their
 * native shape, the listener normalizes once, downstream never sees
 * broker-specific quirks.
 *
 * Supported input shapes:
 *   - Already-canonical array (passthrough)
 *   - Alpaca-style short-name object: { o, h, l, c, v, t, symbol }
 *   - Long-name object: { open, high, low, close, volume, time }
 *   - Mixed timestamp formats: ISO string, ms number, seconds number
 *
 * Returns null if the input can't be normalized (missing time or OHLC
 * fields). Callers should check the return value and skip/log on null
 * rather than feeding garbage to indicators.
 *
 * @module foundation/ohlc-normalize
 */
'use strict';

/**
 * Coerce a timestamp field to milliseconds since epoch.
 * Accepts ISO-8601 strings, second-precision numbers (< 1e12 means
 * seconds, so multiply by 1000), or millisecond numbers. Returns null
 * on unparseable input.
 */
function _toMs(raw) {
    if (raw == null) return null;
    if (typeof raw === 'number') {
        if (!isFinite(raw) || raw <= 0) return null;
        // Heuristic: timestamps before 1e12 are seconds-precision
        // (Sep 2001 threshold is fine for any realistic bar data)
        return raw < 1e12 ? raw * 1000 : raw;
    }
    if (typeof raw === 'string') {
        const n = Date.parse(raw);
        return isFinite(n) ? n : null;
    }
    return null;
}

function _num(v) {
    if (v == null) return null;
    const n = Number(v);
    return isFinite(n) ? n : null;
}

/**
 * Normalize any recognized broker OHLC emit into the canonical
 * Kraken-style array. Returns null if unnormalizable.
 *
 * @param {Array|Object} input - Raw OHLC payload from a broker adapter
 * @returns {Array|null} 9-element array [t, et, o, h, l, c, vwap, v, count]
 *                        or null on malformed input
 */
function normalizeOhlc(input) {
    // Passthrough for canonical arrays (Kraken already emits this shape)
    if (Array.isArray(input)) return input;

    if (!input || typeof input !== 'object') return null;

    // Time — accept t (Alpaca short), time (long-name), or timestamp
    const tMs = _toMs(input.t ?? input.time ?? input.timestamp);
    if (tMs == null) return null;

    // OHLC — accept short or long field names
    const o = _num(input.o ?? input.open);
    const h = _num(input.h ?? input.high);
    const l = _num(input.l ?? input.low);
    const c = _num(input.c ?? input.close);
    if (o == null || h == null || l == null || c == null) return null;

    const v = _num(input.v ?? input.volume) ?? 0;

    // etime: bar-close timestamp. If not supplied, reuse bar-open;
    // downstream code using etime to detect bar-close may need the
    // adapter to pass it explicitly, but most indicator math only
    // reads the bar-open time field.
    const etime = input.etime != null ? _toMs(input.etime) : tMs;

    // vwap / count — Alpaca IEX doesn't supply these; Kraken does.
    // null preserves the "not available" semantic rather than faking 0
    // (which would bias anything averaging these values).
    const vwap = input.vwap != null ? _num(input.vwap) : null;
    const count = input.count != null ? _num(input.count) : null;

    return [tMs, etime, o, h, l, c, vwap, v, count];
}

module.exports = { normalizeOhlc };
