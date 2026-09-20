'use strict';

const fs = require('fs');
const path = require('path');

const { getLedgerDir } = require('./OutputPaths');
const ConfigLoader = require('../foundation/ConfigLoader');

const AUTOPSY_ENABLED = ConfigLoader.get('internals.decisionRecords.autopsyEnabled');

function fileForDate(now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  return path.join(getLedgerDir(), `autopsy_${date}.jsonl`);
}

function fallbackFileForDate(now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  const configuredDir = ConfigLoader.get('internals.decisionRecords.autopsyFallbackDirectory');
  const dir = path.resolve(__dirname, '..', configuredDir);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `autopsy_fallback_${date}.jsonl`);
}

function safeJsonClone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function canonicalSymbol(raw) {
  if (!raw || raw === 'unknown') return raw;
  return String(raw).toUpperCase().replace('XBT', 'BTC').replace('/', '-');
}

function writeAutopsy(record) {
  if (!AUTOPSY_ENABLED) {
    return { success: true, persisted: false, skipped: true, reason: 'disabled' };
  }
  if (!record || typeof record !== 'object') {
    return { success: false, persisted: false, skipped: false, reason: 'invalid_record' };
  }
  const cloned = safeJsonClone(record) || {};
  const originalSymbol = cloned.originalSymbol || record.originalSymbol || record.symbol || null;
  const autopsyRecord = {
    ...cloned,
    originalSymbol,
    symbol: canonicalSymbol(record.symbol),
    _type: 'decision_autopsy',
    _persistedAt: new Date().toISOString(),
  };
  let primaryPath = null;
  try {
    primaryPath = fileForDate();
    fs.appendFileSync(primaryPath, `${JSON.stringify(autopsyRecord)}\n`);
    return { success: true, persisted: true, skipped: false, path: primaryPath };
  } catch (error) {
    console.error(`[DecisionAutopsyLogger] write failed: ${error.message}`);
    try {
      const fallbackPath = fallbackFileForDate();
      fs.appendFileSync(fallbackPath, `${JSON.stringify({
        ...autopsyRecord,
        _primaryAutopsyPath: primaryPath,
        _primaryAutopsyError: error.message,
      })}\n`);
      return { success: true, persisted: true, skipped: false, path: fallbackPath };
    } catch (fallbackError) {
      console.error(`[DecisionAutopsyLogger] fallback write failed: ${fallbackError.message}`);
      return {
        success: false,
        persisted: false,
        skipped: false,
        reason: fallbackError.message,
      };
    }
  }
}

module.exports = {
  fileForDate,
  fallbackFileForDate,
  writeAutopsy,
};
