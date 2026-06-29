'use strict';

const fs = require('fs');
const path = require('path');

const { getLedgerDir } = require('./OutputPaths');

const AUTOPSY_ENABLED = process.env.DECISION_AUTOPSY_ENABLED !== 'false';

function fileForDate(now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  return path.join(getLedgerDir(), `autopsy_${date}.jsonl`);
}

function fallbackFileForDate(now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  const dir = process.env.DECISION_AUTOPSY_FALLBACK_DIR
    ? process.env.DECISION_AUTOPSY_FALLBACK_DIR.replace(/\\/g, '/')
    : path.resolve(__dirname, '..', 'logs', 'decisions');
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
  if (!AUTOPSY_ENABLED || !record || typeof record !== 'object') return false;
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
    return true;
  } catch (error) {
    console.error(`[DecisionAutopsyLogger] write failed: ${error.message}`);
    try {
      fs.appendFileSync(fallbackFileForDate(), `${JSON.stringify({
        ...autopsyRecord,
        _primaryAutopsyPath: primaryPath,
        _primaryAutopsyError: error.message,
      })}\n`);
      return true;
    } catch (fallbackError) {
      console.error(`[DecisionAutopsyLogger] fallback write failed: ${fallbackError.message}`);
      return false;
    }
  }
}

module.exports = {
  fileForDate,
  fallbackFileForDate,
  writeAutopsy,
};
