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
        }
    };

    OGZ.register('Indicators', Indicators);
})(window.OGZ);
