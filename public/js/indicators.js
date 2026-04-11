/**
 * indicators.js - Deterministic Indicator Math
 * Pure stateless calculations for chart overlays
 */
(function(OGZ) {
    'use strict';

    const Indicators = {
        calculateEMA: (data, period) => {
            const k = 2 / (period + 1);
            let ema = [data[0]];
            for (let i = 1; i < data.length; i++) {
                ema.push(data[i] * k + ema[i - 1] * (1 - k));
            }
            return ema;
        },

        calculateSMA: (data, period) => {
            const sma = [];
            for (let i = 0; i < data.length; i++) {
                if (i < period - 1) { sma.push(null); continue; }
                const slice = data.slice(i - period + 1, i + 1);
                sma.push(slice.reduce((a, b) => a + b) / period);
            }
            return sma;
        },

        calculateBollinger: (data, period = 20, stdDev = 2) => {
            const bands = { upper: [], middle: [], lower: [] };
            for (let i = 0; i < data.length; i++) {
                if (i < period) {
                    bands.upper.push(null); bands.middle.push(null); bands.lower.push(null);
                    continue;
                }
                const slice = data.slice(i - period, i);
                const mean = slice.reduce((a, b) => a + b) / period;
                const sd = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period);
                bands.middle.push(mean);
                bands.upper.push(mean + (stdDev * sd));
                bands.lower.push(mean - (stdDev * sd));
            }
            return bands;
        },

        calculateRSI: (data, period = 14) => {
            let gains = 0, losses = 0;
            for (let i = 1; i <= period; i++) {
                const diff = data[i] - data[i - 1];
                if (diff >= 0) gains += diff; else losses -= diff;
            }
            let avgG = gains / period, avgL = losses / period;
            const rsi = [null];
            for (let i = period + 1; i < data.length; i++) {
                const diff = data[i] - data[i - 1];
                avgG = (avgG * (period - 1) + (diff > 0 ? diff : 0)) / period;
                avgL = (avgL * (period - 1) + (diff < 0 ? -diff : 0)) / period;
                rsi.push(100 - (100 / (1 + (avgG / avgL))));
            }
            return rsi;
        },

        calculateVWAP: (candles) => {
            let cumVol = 0, cumTP = 0;
            return candles.map(c => {
                const tp = (c.high + c.low + c.close) / 3;
                cumVol += c.volume;
                cumTP += tp * c.volume;
                return cumVol > 0 ? cumTP / cumVol : tp;
            });
        },

        calculateATR: (candles, period = 14) => {
            const tr = candles.map((c, i) => {
                if (i === 0) return c.high - c.low;
                const prev = candles[i - 1];
                return Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
            });
            const atr = [tr[0]];
            for (let i = 1; i < tr.length; i++) {
                atr.push((atr[i - 1] * (period - 1) + tr[i]) / period);
            }
            return atr;
        },

        calculateMACD: (closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) => {
            const ema = (data, period) => {
                const k = 2 / (period + 1);
                let e = [data[0]];
                for (let i = 1; i < data.length; i++) e.push(data[i] * k + e[i - 1] * (1 - k));
                return e;
            };
            const emaFast = ema(closes, fastPeriod);
            const emaSlow = ema(closes, slowPeriod);
            const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
            const signalLine = ema(macdLine, signalPeriod);
            return { macd: macdLine, signal: signalLine };
        },

        calculateIchimoku: (candles) => {
            const tenkan = [], kijun = [], senkouA = [], senkouB = [];
            const highLow = (data, start, len) => {
                const slice = data.slice(Math.max(0, start - len + 1), start + 1);
                return { high: Math.max(...slice.map(c => c.high)), low: Math.min(...slice.map(c => c.low)) };
            };
            for (let i = 0; i < candles.length; i++) {
                if (i >= 8) {
                    const hl9 = highLow(candles, i, 9);
                    tenkan.push((hl9.high + hl9.low) / 2);
                } else { tenkan.push(null); }
                if (i >= 25) {
                    const hl26 = highLow(candles, i, 26);
                    kijun.push((hl26.high + hl26.low) / 2);
                } else { kijun.push(null); }
                if (tenkan[i] && kijun[i]) { senkouA.push((tenkan[i] + kijun[i]) / 2); }
                else { senkouA.push(null); }
                if (i >= 51) {
                    const hl52 = highLow(candles, i, 52);
                    senkouB.push((hl52.high + hl52.low) / 2);
                } else { senkouB.push(null); }
            }
            return { tenkan, kijun, senkouA, senkouB };
        },

        calculateFibonacci: (candles, lookback = 50) => {
            const recent = candles.slice(-lookback);
            const high = Math.max(...recent.map(c => c.high));
            const low = Math.min(...recent.map(c => c.low));
            const diff = high - low;
            return [
                { level: 0, price: high, label: '0%' },
                { level: 0.236, price: high - diff * 0.236, label: '23.6%' },
                { level: 0.382, price: high - diff * 0.382, label: '38.2%' },
                { level: 0.5, price: high - diff * 0.5, label: '50%' },
                { level: 0.618, price: high - diff * 0.618, label: '61.8%' },
                { level: 0.786, price: high - diff * 0.786, label: '78.6%' },
                { level: 1, price: low, label: '100%' }
            ];
        },

        calculateSupportResistance: (candles, lookback = 50) => {
            const recent = candles.slice(-lookback);
            const levels = [];
            for (let i = 2; i < recent.length - 2; i++) {
                if (recent[i].high > recent[i - 1].high && recent[i].high > recent[i - 2].high &&
                    recent[i].high > recent[i + 1].high && recent[i].high > recent[i + 2].high) {
                    levels.push({ price: recent[i].high, type: 'resistance' });
                }
                if (recent[i].low < recent[i - 1].low && recent[i].low < recent[i - 2].low &&
                    recent[i].low < recent[i + 1].low && recent[i].low < recent[i + 2].low) {
                    levels.push({ price: recent[i].low, type: 'support' });
                }
            }
            // Cluster nearby levels
            const clustered = [];
            const used = new Set();
            for (let i = 0; i < levels.length; i++) {
                if (used.has(i)) continue;
                let sum = levels[i].price, count = 1;
                for (let j = i + 1; j < levels.length; j++) {
                    if (used.has(j)) continue;
                    if (Math.abs(levels[j].price - levels[i].price) / levels[i].price < 0.003) {
                        sum += levels[j].price; count++; used.add(j);
                    }
                }
                clustered.push({ price: sum / count, type: levels[i].type, strength: count });
                used.add(i);
            }
            return clustered.sort((a, b) => b.strength - a.strength).slice(0, 6);
        }
    };

    OGZ.register('Indicators', Indicators);
})(window.OGZ);
