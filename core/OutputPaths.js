'use strict';

const path = require('path');
const fs = require('fs');
const ConfigLoader = require('../foundation/ConfigLoader');

function configuredOutputRoot() {
  const loadedSnapshot = ConfigLoader.getCachedSnapshot();
  const loadedValue = loadedSnapshot?.config?.paths?.backtestOutputDir;
  if (loadedValue !== undefined) return loadedValue;
  return ConfigLoader.getInternalsFileValue('paths.backtestOutputDir');
}

/**
 * Resolves the backtest output root directory.
 * Controlled by config/internals.json paths.backtestOutputDir.
 * An explicit empty value preserves the repo-relative output layout.
 */
function getOutputRoot() {
  const configuredRoot = configuredOutputRoot();
  if (configuredRoot) {
    return configuredRoot.replace(/\\/g, '/');  // normalize Windows paths
  }
  // An explicit empty configured root preserves the existing repo-root layout.
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
 * Creates a per-run subdirectory under runs/.
 */
function getRunDir(runId) {
  const root = getOutputRoot();
  if (!runId) {
    throw new Error('[OutputPaths] getRunDir requires explicit runId');
  }
  const configuredRoot = configuredOutputRoot();
  const dir = configuredRoot
    ? path.join(root, 'runs', String(runId))
    : root;
  return ensureDir(dir);
}

/**
 * Get the shared root used by typed backtest workers and their controller.
 * A configured root is already the report root. An explicit empty value keeps
 * the historical repo-relative backtest-results/ layout.
 */
function getBacktestResultsDir() {
  const root = getOutputRoot();
  const configuredRoot = configuredOutputRoot();
  return ensureDir(configuredRoot ? root : path.join(root, 'backtest-results'));
}

/**
 * Get the directory for decision ledger JSONL files.
 */
function getLedgerDir() {
  const root = getOutputRoot();
  const configuredRoot = configuredOutputRoot();
  // A configured output root uses the unified structure; empty preserves logs/decisions/.
  const dir = configuredRoot
    ? path.join(root, 'ledger')
    : path.join(root, 'logs', 'decisions');
  return ensureDir(dir);
}

/**
 * Get the directory for matrix sweep output.
 */
function getMatrixDir() {
  const root = getOutputRoot();
  const configuredRoot = configuredOutputRoot();
  // A configured output root uses the unified structure; empty preserves backtest-results/.
  const dir = configuredRoot
    ? path.join(root, 'matrix')
    : path.join(root, 'backtest-results');
  return ensureDir(dir);
}

module.exports = {
  getOutputRoot,
  getRunDir,
  getBacktestResultsDir,
  getLedgerDir,
  getMatrixDir,
  ensureDir,
};
