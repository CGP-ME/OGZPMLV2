'use strict';

const path = require('path');
const fs = require('fs');

/**
 * Resolves the backtest output root directory.
 * Controlled by BACKTEST_OUTPUT_DIR env var.
 * Falls back to repo-relative paths for VPS backward compatibility.
 */
function getOutputRoot() {
  const envRoot = process.env.BACKTEST_OUTPUT_DIR;
  if (envRoot) {
    return envRoot.replace(/\\/g, '/');  // normalize Windows paths
  }
  // Fallback: repo root (preserves existing VPS behavior)
  return path.resolve(__dirname, '..');
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

/**
 * Get the directory for per-backtest-run output (CSV + JSON report).
 * Creates a timestamped subdirectory under runs/.
 */
function getRunDir(timestamp) {
  const root = getOutputRoot();
  const runId = timestamp || Date.now();
  const envRoot = process.env.BACKTEST_OUTPUT_DIR;
  const dir = envRoot
    ? path.join(root, 'runs', String(runId))
    : root;  // legacy: write to repo root
  return ensureDir(dir);
}

/**
 * Get the directory for decision ledger JSONL files.
 */
function getLedgerDir() {
  const root = getOutputRoot();
  const envRoot = process.env.BACKTEST_OUTPUT_DIR;
  // If env var is set, use unified structure. Otherwise preserve legacy logs/decisions/.
  const dir = envRoot
    ? path.join(root, 'ledger')
    : path.join(root, 'logs', 'decisions');
  return ensureDir(dir);
}

/**
 * Get the directory for matrix sweep output.
 */
function getMatrixDir() {
  const root = getOutputRoot();
  const envRoot = process.env.BACKTEST_OUTPUT_DIR;
  // If env var is set, use unified structure. Otherwise preserve legacy backtest-results/.
  const dir = envRoot
    ? path.join(root, 'matrix')
    : path.join(root, 'backtest-results');
  return ensureDir(dir);
}

module.exports = {
  getOutputRoot,
  getRunDir,
  getLedgerDir,
  getMatrixDir,
  ensureDir,
};
