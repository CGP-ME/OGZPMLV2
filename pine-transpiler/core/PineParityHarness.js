const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const PineRuntime = require('./PineRuntime');

const repoRoot = path.resolve(__dirname, '..', '..');

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function resolveRepoPath(filePath, baseDir = repoRoot) {
  if (path.isAbsolute(filePath)) return filePath;
  return path.resolve(baseDir, filePath);
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function readCsvRows(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '');

  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const row = {};
    parseCsvLine(line).forEach((value, index) => {
      row[headers[index]] = value;
    });
    return row;
  });
}

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTimestamp(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : value;
}

function readCandleFile(filePath, format) {
  if (format === 'json' || (!format && filePath.endsWith('.json'))) {
    return readJsonFile(filePath);
  }

  if (format === 'tradingview_csv' || format === 'csv' || filePath.endsWith('.csv')) {
    return readCsvRows(filePath).map((row) => ({
      timestamp: parseTimestamp(row.time ?? row.timestamp ?? row.date),
      open: parseNumber(row.open ?? row.o),
      high: parseNumber(row.high ?? row.h),
      low: parseNumber(row.low ?? row.l),
      close: parseNumber(row.close ?? row.c),
      volume: parseNumber(row.volume ?? row.v),
    }));
  }

  throw Object.assign(new Error(`Unsupported candle file format: ${format || filePath}`), {
    code: 'PINE_PARITY_FIXTURE_INVALID',
  });
}

function readExpectedSignalFile(filePath, format) {
  if (format === 'json' || (!format && filePath.endsWith('.json'))) {
    return readJsonFile(filePath);
  }

  if (format === 'tradingview_trade_csv' || format === 'csv' || filePath.endsWith('.csv')) {
    return readCsvRows(filePath)
      .map((row) => ({
        barIndex: parseNumber(row.barindex ?? row.bar_index ?? row.bar),
        timestamp: parseTimestamp(row.time ?? row.timestamp ?? row.date),
        direction: row.direction ?? row.side ?? row.signal ?? row.action,
      }))
      .filter((signal) => signal.direction);
  }

  throw Object.assign(new Error(`Unsupported expected signal file format: ${format || filePath}`), {
    code: 'PINE_PARITY_FIXTURE_INVALID',
  });
}

function readPineSource(sourcePath) {
  const body = fs.readFileSync(sourcePath, 'utf8');
  const generatedMatch = body.match(/const SOURCE = `([\s\S]*?)`;/);
  return generatedMatch ? generatedMatch[1] : body;
}

function normalizeCandle(raw) {
  return {
    timestamp: raw.t !== undefined ? raw.t : raw.timestamp,
    open: raw.o !== undefined ? raw.o : raw.open,
    high: raw.h !== undefined ? raw.h : raw.high,
    low: raw.l !== undefined ? raw.l : raw.low,
    close: raw.c !== undefined ? raw.c : raw.close,
    volume: raw.v !== undefined ? raw.v : raw.volume,
  };
}

function normalizeDirection(direction) {
  if (direction === 'buy' || direction === 'long') return 'buy';
  if (direction === 'sell' || direction === 'short') return 'sell';
  return direction;
}

function signalFromRuntimeSignal(signal, candle, barIndex) {
  if (!signal || !signal.direction) return null;
  return {
    barIndex,
    timestamp: candle.timestamp,
    direction: normalizeDirection(signal.direction),
  };
}

function normalizeExpectedSignal(signal) {
  if (!Number.isInteger(signal.barIndex)) {
    throw Object.assign(new Error('Expected parity signal missing integer barIndex'), {
      code: 'PINE_PARITY_FIXTURE_INVALID',
    });
  }

  const direction = normalizeDirection(signal.direction);
  if (direction !== 'buy' && direction !== 'sell') {
    throw Object.assign(new Error(`Expected parity signal has unsupported direction: ${signal.direction}`), {
      code: 'PINE_PARITY_FIXTURE_INVALID',
    });
  }

  return {
    barIndex: signal.barIndex,
    timestamp: signal.timestamp,
    direction,
  };
}

function signalKey(signal) {
  return `${signal.barIndex}:${signal.direction}`;
}

function groupDirectionsByBar(signals) {
  const byBar = new Map();
  for (const signal of signals) {
    const current = byBar.get(signal.barIndex) || new Set();
    current.add(signal.direction);
    byBar.set(signal.barIndex, current);
  }
  return byBar;
}

function compareSignalLists(expectedSignals, actualSignals) {
  const expected = expectedSignals.map(normalizeExpectedSignal);
  const actual = actualSignals.map((signal) => ({
    barIndex: signal.barIndex,
    timestamp: signal.timestamp,
    direction: normalizeDirection(signal.direction),
  }));

  const expectedKeys = new Set(expected.map(signalKey));
  const actualKeys = new Set(actual.map(signalKey));
  const expectedByBar = groupDirectionsByBar(expected);
  const actualByBar = groupDirectionsByBar(actual);

  const missing = expected.filter((signal) => !actualKeys.has(signalKey(signal)));
  const extra = actual.filter((signal) => !expectedKeys.has(signalKey(signal)));
  const divergentBars = Array.from(new Set([...missing, ...extra].map((signal) => signal.barIndex)))
    .sort((a, b) => a - b)
    .map((barIndex) => ({
      barIndex,
      expected: Array.from(expectedByBar.get(barIndex) || []).sort(),
      actual: Array.from(actualByBar.get(barIndex) || []).sort(),
      timestamp:
        expected.find((signal) => signal.barIndex === barIndex)?.timestamp ??
        actual.find((signal) => signal.barIndex === barIndex)?.timestamp,
    }));

  return {
    match: missing.length === 0 && extra.length === 0,
    expectedCount: expected.length,
    actualCount: actual.length,
    countDelta: actual.length - expected.length,
    missing,
    extra,
    divergentBars,
  };
}

function formatDivergentBars(comparison, limit = 25) {
  return comparison.divergentBars.slice(0, limit).map((bar) => ({
    barIndex: bar.barIndex,
    timestamp: bar.timestamp,
    expected: bar.expected.join(',') || 'none',
    actual: bar.actual.join(',') || 'none',
  }));
}

function runPineParity({ pineSource, candles }) {
  const runtime = new PineRuntime(pineSource);
  const actualSignals = [];

  candles.forEach((rawCandle, barIndex) => {
    const candle = normalizeCandle(rawCandle);
    const signal = signalFromRuntimeSignal(runtime.evaluate(candle), candle, barIndex);
    if (signal) actualSignals.push(signal);
  });

  return actualSignals;
}

function loadParityFixture(fixturePath) {
  const absoluteFixturePath = path.resolve(fixturePath);
  const fixture = readJsonFile(absoluteFixturePath);
  const baseDir = fixture.pathsRelativeTo === 'fixture'
    ? path.dirname(absoluteFixturePath)
    : repoRoot;

  const pineSourcePath = resolveRepoPath(fixture.pineSourcePath, baseDir);
  const candleFilePath = resolveRepoPath(fixture.candleFilePath, baseDir);
  const expectedSignalListPath = fixture.expectedSignalListPath
    ? resolveRepoPath(fixture.expectedSignalListPath, baseDir)
    : null;

  const candleFileExists = fs.existsSync(candleFilePath);
  const expectedSignalListExists = expectedSignalListPath ? fs.existsSync(expectedSignalListPath) : false;
  const candleFileSha256 = candleFileExists ? sha256File(candleFilePath) : null;
  const pineSourceSha256 = sha256File(pineSourcePath);
  const expectedSignalListFileSha256 = expectedSignalListExists ? sha256File(expectedSignalListPath) : null;

  return {
    ...fixture,
    fixturePath: absoluteFixturePath,
    pineSourcePath,
    candleFilePath,
    expectedSignalListPath,
    candleFileExists,
    expectedSignalListExists,
    candleFileSha256,
    pineSourceSha256,
    expectedSignalListFileSha256,
  };
}

function verifyFixtureHashes(fixture) {
  const failures = [];

  if (fixture.expectedCandleFileSha256 && fixture.expectedCandleFileSha256 !== fixture.candleFileSha256) {
    failures.push({
      file: fixture.candleFilePath,
      expected: fixture.expectedCandleFileSha256,
      actual: fixture.candleFileSha256,
    });
  }

  if (fixture.expectedPineSourceSha256 && fixture.expectedPineSourceSha256 !== fixture.pineSourceSha256) {
    failures.push({
      file: fixture.pineSourcePath,
      expected: fixture.expectedPineSourceSha256,
      actual: fixture.pineSourceSha256,
    });
  }

  if (
    fixture.expectedSignalListSha256 &&
    fixture.expectedSignalListSha256 !== fixture.expectedSignalListFileSha256
  ) {
    failures.push({
      file: fixture.expectedSignalListPath,
      expected: fixture.expectedSignalListSha256,
      actual: fixture.expectedSignalListFileSha256,
    });
  }

  return failures;
}

function runParityFixture(fixturePath) {
  const fixture = loadParityFixture(fixturePath);
  const missingFixtureFiles = [];
  if (!fixture.candleFileExists) missingFixtureFiles.push(fixture.candleFilePath);
  if (!Array.isArray(fixture.expectedSignals) && !fixture.expectedSignalListExists) {
    missingFixtureFiles.push(fixture.expectedSignalListPath || 'expectedSignals');
  }

  if (missingFixtureFiles.length > 0) {
    return {
      fixture,
      status: 'blocked',
      reason: 'missing_fixture_exports',
      missingFixtureFiles,
      message: 'Fixture cannot certify parity without TradingView candle and signal exports.',
    };
  }

  const hashFailures = verifyFixtureHashes(fixture);

  if (hashFailures.length > 0) {
    return {
      fixture,
      status: 'failed',
      reason: 'sha256_mismatch',
      hashFailures,
    };
  }

  const expectedSignals = Array.isArray(fixture.expectedSignals)
    ? fixture.expectedSignals
    : readExpectedSignalFile(fixture.expectedSignalListPath, fixture.expectedSignalListFormat);

  if (!Array.isArray(expectedSignals)) {
    return {
      fixture,
      status: 'blocked',
      reason: 'missing_expected_signal_list',
      message: 'Fixture cannot certify parity without a TradingView expected signal list.',
    };
  }

  const pineSource = readPineSource(fixture.pineSourcePath);
  const candles = readCandleFile(fixture.candleFilePath, fixture.candleFileFormat);
  const actualSignals = runPineParity({ pineSource, candles });
  const comparison = compareSignalLists(expectedSignals, actualSignals);

  return {
    fixture,
    status: comparison.match ? 'passed' : 'failed',
    reason: comparison.match ? null : 'signal_divergence',
    comparison,
    actualSignals,
  };
}

module.exports = {
  compareSignalLists,
  formatDivergentBars,
  loadParityFixture,
  normalizeCandle,
  readCandleFile,
  readExpectedSignalFile,
  readPineSource,
  runPineParity,
  runParityFixture,
  sha256File,
  verifyFixtureHashes,
};
