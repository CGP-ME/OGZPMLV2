'use strict';
const { z } = require('zod');

/**
 * Canonical flat indicator snapshot.
 * NO nested indicators.indicators — ever.
 * Every field is explicitly declared and validated at runtime.
 */
const IndicatorSnapshotSchema = z.object({
  timestamp: z.number(),
  indicators: z.object({
    // RSI - zod 4 syntax: use union for nullable with constraints
    rsi: z.union([z.number().min(0).max(100), z.null()]),  // Null during warmup
    // Moving averages — nullable during warmup
    ema9: z.union([z.number(), z.null()]),
    ema20: z.union([z.number(), z.null()]),
    ema50: z.union([z.number(), z.null()]),
    ema200: z.union([z.number(), z.null()]),
    sma20: z.number().nullable().optional(),
    sma50: z.number().nullable().optional(),
    sma200: z.number().nullable().optional(),
    // Volatility — nullable during warmup
    atr: z.union([z.number().min(0), z.null()]),
    atrPercent: z.union([z.number().min(0), z.null()]),
    // Bollinger Bands — nullable during warmup
    bbUpper: z.union([z.number(), z.null()]),
    bbMiddle: z.union([z.number(), z.null()]),
    bbLower: z.union([z.number(), z.null()]),
    bbWidth: z.union([z.number(), z.null()]),
    bbPercentB: z.union([z.number(), z.null()]),
    // MACD — nullable during warmup
    macd: z.union([z.number(), z.null()]),
    macdSignal: z.union([z.number(), z.null()]),
    macdHistogram: z.union([z.number(), z.null()]),
    // Stochastic RSI
    stochRsiK: z.number().nullable().optional(),
    stochRsiD: z.number().nullable().optional(),
    // ADX
    adx: z.number().nullable().optional(),
    plusDI: z.number().nullable().optional(),
    minusDI: z.number().nullable().optional(),
    // Volume — nullable during warmup
    volume: z.union([z.number().min(0), z.null()]),
    vwap: z.number().nullable().optional(),
    obv: z.number().nullable().optional(),
    mfi: z.number().nullable().optional(),
    // Trend
    superTrend: z.number().nullable().optional(),
    superTrendDirection: z.string().nullable().optional(),
    // Price — nullable until first candle arrives
    price: z.union([z.number().positive(), z.null()]),
  }),
  // Optional metadata
  candle: z.object({
    open: z.number(),
    high: z.number(),
    low: z.number(),
    close: z.number(),
    volume: z.number(),
    timestamp: z.number(),
  }).optional(),
  overlays: z.object({}).passthrough().optional(),
});

/**
 * Validate a snapshot object. Throws ZodError with detailed message if invalid.
 * Call this at EVERY boundary where indicator data is produced or consumed.
 */
function validateSnapshot(raw) {
  return IndicatorSnapshotSchema.parse(raw);
}

/**
 * Safe validation that returns null instead of throwing.
 * Use in non-critical paths (e.g., logging, diagnostics).
 */
function validateSnapshotSafe(raw) {
  const result = IndicatorSnapshotSchema.safeParse(raw);
  if (result.success) return result.data;
  const errMsg = result.error.issues.map(function(i) { return i.path.join('.') + ': ' + i.message; }).join(', ');
  console.error('[DTO] Invalid snapshot:', errMsg);
  return null;
}

module.exports = { IndicatorSnapshotSchema, validateSnapshot, validateSnapshotSafe };
