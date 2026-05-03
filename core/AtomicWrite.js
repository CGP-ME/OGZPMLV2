'use strict';

/**
 * Atomic file-write helpers.
 *
 * Pattern: write to a sibling .tmp file first, then renameSync to the
 * target path. POSIX guarantees rename atomicity within a filesystem,
 * so a crash mid-write either leaves the previous version intact or
 * lands the new content fully — never a half-written file.
 *
 * Use for any persisted state file whose corruption would block process
 * startup or cause silent data drift. Mercury Vector 6 fix surface:
 *   StateManager.js (state.json), CandleStore (candles), TradeJournal,
 *   PatternMemoryBank, KillSwitch, SingletonLock, etc.
 *
 * @module core/AtomicWrite
 */

const fs = require('fs');

/**
 * Write a value as JSON to filePath atomically.
 * Pretty-prints with 2-space indent for human-readability of state files.
 */
function writeJsonAtomic(filePath, data) {
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, filePath);
}

/**
 * Write a value as compact JSON (no indent) to filePath atomically.
 * Use for high-volume writes where indent overhead matters.
 */
function writeJsonCompactAtomic(filePath, data) {
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data));
  fs.renameSync(tmpPath, filePath);
}

/**
 * Write a string (CSV, plain text, etc.) to filePath atomically.
 */
function writeStringAtomic(filePath, content, options = {}) {
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, content, options);
  fs.renameSync(tmpPath, filePath);
}

module.exports = {
  writeJsonAtomic,
  writeJsonCompactAtomic,
  writeStringAtomic,
};
