'use strict';

const fs = require('fs');
const path = require('path');

const DECISIONS_DIR = path.join(__dirname, '..', 'logs', 'decisions');
const LEDGER_BUFFER_SIZE = parseInt(process.env.LEDGER_BUFFER_SIZE || '1', 10);
const LEDGER_VALIDATE = process.env.LEDGER_VALIDATE !== 'false';

let writeBuffer = [];

function ensureDir() {
  if (!fs.existsSync(DECISIONS_DIR)) {
    fs.mkdirSync(DECISIONS_DIR, { recursive: true });
  }
}

function getFilePath(prefix) {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(DECISIONS_DIR, `${prefix}_${date}.jsonl`);
}

/**
 * Write a completed trade's decision ledger to JSONL.
 * Called from StateManager.closePosition on full close.
 */
function writeOnClose(ledger) {
  if (!ledger || !ledger.tradeId) return;

  // Optional schema validation
  if (LEDGER_VALIDATE) {
    try {
      const { validateLedgerSkeleton } = require('./dto/DecisionLedgerSchema');
      const result = validateLedgerSkeleton(ledger);
      if (!result.success) {
        console.warn(`[LEDGER] Schema validation failed for ${ledger.tradeId}:`, result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', '));
        // Write to separate malformed log instead of corrupting main JSONL
        _appendLine(getFilePath('malformed'), JSON.stringify({
          timestamp: new Date().toISOString(),
          tradeId: ledger.tradeId,
          errors: result.error.issues,
          raw: ledger,
        }));
        return;
      }
    } catch (e) {
      // Schema module not available — skip validation, still write
      console.warn('[LEDGER] Schema validation skipped:', e.message);
    }
  }

  const line = JSON.stringify({
    ...ledger,
    _persistedAt: new Date().toISOString(),
  });

  if (LEDGER_BUFFER_SIZE <= 1) {
    // Immediate write (live mode)
    _appendLine(getFilePath('decisions'), line);
  } else {
    // Buffered write (backtest mode)
    writeBuffer.push(line);
    if (writeBuffer.length >= LEDGER_BUFFER_SIZE) {
      _flushBuffer();
    }
  }
}

/**
 * Write a rejected trade (killed by a risk gate before entry).
 */
function writeRejection(ledger) {
  if (!ledger || !ledger.tradeId) return;

  const line = JSON.stringify({
    ...ledger,
    _rejectedAt: new Date().toISOString(),
    _type: 'rejection',
  });

  _appendLine(getFilePath('rejections'), line);
}

/**
 * Flush buffered writes. Called at end of backtest or when buffer is full.
 */
function flush() {
  _flushBuffer();
}

function _flushBuffer() {
  if (writeBuffer.length === 0) return;
  ensureDir();
  const filePath = getFilePath('decisions');
  try {
    fs.appendFileSync(filePath, writeBuffer.join('\n') + '\n');
    writeBuffer = [];
  } catch (e) {
    console.error(`[LEDGER] Failed to flush ${writeBuffer.length} entries:`, e.message);
  }
}

function _appendLine(filePath, line) {
  ensureDir();
  try {
    fs.appendFileSync(filePath, line + '\n');
  } catch (e) {
    console.error(`[LEDGER] Write failed to ${filePath}:`, e.message);
  }
}

module.exports = { writeOnClose, writeRejection, flush };
