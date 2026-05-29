'use strict';

const MATURITY_TIERS = new Set(['New', 'Forming', 'Confirmed', 'Mature', 'Stale']);

function finiteNonNegativeNumber(value) {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  if (typeof value === 'string' && value.trim().length === 0) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function finiteTimestamp(value) {
  const n = finiteNonNegativeNumber(value);
  return n !== null && n > 0 ? n : null;
}

function resolvePatternSampleCount(pattern = {}, stats = null) {
  const candidates = [
    stats?.timesSeen,
    stats?.sampleCount,
    stats?.totalTrades,
    stats?.total,
    pattern.timesSeen,
    pattern.sampleCount,
    pattern.samples,
    pattern.occurrences,
    pattern.stats?.timesSeen,
    pattern.stats?.sampleCount,
    pattern.stats?.totalTrades,
    pattern.stats?.total,
    pattern.bestMatch?.timesSeen,
    pattern.bestMatch?.sampleCount,
    pattern.bestMatch?.totalTrades,
    pattern.bestMatch?.total,
  ];

  for (const candidate of candidates) {
    const n = finiteNonNegativeNumber(candidate);
    if (n !== null) return Math.floor(n);
  }
  return null;
}

function maturityFromSamples(sampleCount, timestamps = {}, now = Date.now()) {
  const count = finiteNonNegativeNumber(sampleCount);
  if (count === null) return null;
  if (count === 0) return null;

  const lastSeen = finiteTimestamp(timestamps.lastSeen);
  if (lastSeen === null) return null;
  if (lastSeen !== null && now - lastSeen > 15 * 60 * 1000) return 'Stale';

  if (count <= 1) return 'New';
  if (count <= 5) return 'Forming';

  const firstSeen = finiteTimestamp(timestamps.firstSeen);
  if (firstSeen !== null && now - firstSeen >= 30 * 60 * 1000) return 'Mature';
  return 'Confirmed';
}

function resolvePatternMaturity(pattern = {}, stats = null, now = Date.now()) {
  const sampleCount = resolvePatternSampleCount(pattern, stats);
  const timestamps = {
    firstSeen: stats?.firstSeen ?? pattern.firstSeen ?? pattern.stats?.firstSeen,
    lastSeen: stats?.lastSeen ?? pattern.lastSeen ?? pattern.stats?.lastSeen,
  };
  const maturity = maturityFromSamples(sampleCount, timestamps, now);
  if (!maturity) return { sampleCount: null, maturity: null };
  return { sampleCount, maturity };
}

function stampPatternMaturity(pattern, stats = null, now = Date.now()) {
  if (!pattern || typeof pattern !== 'object') return null;
  const resolved = resolvePatternMaturity(pattern, stats, now);
  if (!resolved.maturity) return null;

  pattern.sampleCount = resolved.sampleCount;
  pattern.samples = resolved.sampleCount;
  pattern.maturity = resolved.maturity;
  pattern.isNew = resolved.maturity === 'New';
  return resolved;
}

function isMaturityTier(value) {
  return MATURITY_TIERS.has(value);
}

module.exports = {
  MATURITY_TIERS,
  isMaturityTier,
  maturityFromSamples,
  resolvePatternMaturity,
  resolvePatternSampleCount,
  stampPatternMaturity,
};
