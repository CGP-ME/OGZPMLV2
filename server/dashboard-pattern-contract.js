'use strict';

const DASHBOARD_PATTERN_ALIASES = new Map([
  ['doublebottom', 'double_bottom'],
  ['double_bottom', 'double_bottom'],
  ['doubletop', 'double_top'],
  ['double_top', 'double_top'],
  ['headandshoulders', 'head_shoulders'],
  ['head_shoulders', 'head_shoulders'],
  ['head_and_shoulders', 'head_shoulders'],
  ['inverseheadandshoulders', 'inv_head_shoulders'],
  ['inverse_head_and_shoulders', 'inv_head_shoulders'],
  ['inv_head_shoulders', 'inv_head_shoulders'],
  ['ascendingtriangle', 'ascending_triangle'],
  ['ascending_triangle', 'ascending_triangle'],
  ['triangle_ascending', 'ascending_triangle'],
  ['descendingtriangle', 'descending_triangle'],
  ['descending_triangle', 'descending_triangle'],
  ['triangle_descending', 'descending_triangle'],
  ['symmetrictriangle', 'symmetric_triangle'],
  ['symmetricaltriangle', 'symmetric_triangle'],
  ['symmetric_triangle', 'symmetric_triangle'],
  ['triangle_symmetric', 'symmetric_triangle'],
  ['bullflag', 'bull_flag'],
  ['bull_flag', 'bull_flag'],
  ['flag_bull', 'bull_flag'],
  ['bearflag', 'bear_flag'],
  ['bear_flag', 'bear_flag'],
  ['flag_bear', 'bear_flag'],
  ['cupandhandle', 'cup_handle'],
  ['cup_handle', 'cup_handle'],
  ['cup_and_handle', 'cup_handle'],
  ['risingwedge', 'wedge_rising'],
  ['wedge_rising', 'wedge_rising'],
  ['fallingwedge', 'wedge_falling'],
  ['wedge_falling', 'wedge_falling'],
  ['rectangle', 'rectangle'],
  ['support', 'support'],
  ['resistance', 'resistance'],
  ['liquiditysweep', 'liquidity_sweep'],
  ['liquidity_sweep', 'liquidity_sweep'],
  ['breakoutretest', 'breakout_retest'],
  ['breakout_retest', 'breakout_retest'],
  ['breakout', 'breakout_retest']
]);

const GENERIC_ML_PATTERN_NAMES = new Set([
  'learningpattern',
  'learning_pattern',
  'dtwmatch',
  'dtw_match',
  'mlpattern',
  'ml_pattern',
  'mldetected',
  'ml_detected'
]);

function normalizeDashboardPatternName(rawName, hasGeometry) {
  if (typeof rawName !== 'string' || !rawName.trim()) return null;
  const key = rawName.trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const compact = key.replace(/_/g, '');
  if (DASHBOARD_PATTERN_ALIASES.has(key)) return DASHBOARD_PATTERN_ALIASES.get(key);
  if (DASHBOARD_PATTERN_ALIASES.has(compact)) return DASHBOARD_PATTERN_ALIASES.get(compact);
  if (GENERIC_ML_PATTERN_NAMES.has(key) || GENERIC_ML_PATTERN_NAMES.has(compact)) {
    return hasGeometry ? 'ml_detected' : null;
  }
  return hasGeometry ? 'ml_detected' : null;
}

function finitePatternNumber(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function candleTimeMs(candle) {
  const value = candle?.t ?? candle?.time ?? candle?.timestamp ?? candle?.etime;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 1e12 ? Math.floor(numeric) : Math.floor(numeric * 1000);
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function candleClose(candle) {
  return finitePatternNumber(candle?.c, candle?.close, candle?.price);
}

function buildDashboardPatternGeometryFromCandles(candles) {
  if (!Array.isArray(candles) || candles.length < 3) return null;

  const points = candles
    .slice(-16)
    .map(candle => {
      const t = candleTimeMs(candle);
      const p = candleClose(candle);
      if (t === null || p === null) return null;
      return { t, p };
    })
    .filter(Boolean);

  if (points.length < 3) return null;

  return {
    source: 'recent_candles',
    points,
    trendLines: [
      { from: points[0], to: points[points.length - 1] }
    ],
    regions: []
  };
}

module.exports = {
  buildDashboardPatternGeometryFromCandles,
  normalizeDashboardPatternName,
};
