'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DECISION_LEDGER_SCHEMA_PATH = path.join(PROJECT_ROOT, 'ogz-meta', 'specs', 'decision-ledger-schema.json');
const REQUIRED_TRADE_FIELDS = Object.freeze([
  'tradeId',
  'entryPrice',
  'exitPrice',
  'closedOrderQuantity',
  'feesDollars',
  'netPnlDollars',
  'rawPnlDollars',
  'strategyName',
  'direction',
  'entryTime',
  'exitTime',
  'mfePercent',
  'maePercent',
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function listFilesRecursive(root, predicate, results = []) {
  if (!fs.existsSync(root)) return results;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      listFilesRecursive(full, predicate, results);
    } else if (predicate(full)) {
      results.push(full);
    }
  }
  return results;
}

function newestFile(files) {
  if (!files.length) return null;
  return files
    .map(file => ({ file, mtimeMs: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0].file;
}

function roundCents(value) {
  return Math.round(Number(value) * 100) / 100;
}

function finiteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function nonEmpty(value) {
  return typeof value === 'string' ? value.trim().length > 0 : value !== null && value !== undefined;
}

function loadJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return { ok: true, value: JSON.parse(line), line: index + 1 };
      } catch (error) {
        return { ok: false, error: error.message, line: index + 1, raw: line };
      }
    });
}

function dataFileCandleCount(dataFile) {
  const resolved = path.isAbsolute(dataFile) ? dataFile : path.resolve(PROJECT_ROOT, dataFile);
  const parsed = readJson(resolved);
  const candles = Array.isArray(parsed) ? parsed : parsed.candles;
  if (!Array.isArray(candles)) {
    throw new Error(`Unable to count candles in ${resolved}`);
  }
  return {
    dataFile: resolved,
    expectedCandles: candles.length,
    startTimestamp: timestampOf(candles[0]),
    endTimestamp: timestampOf(candles[candles.length - 1]),
  };
}

function timestampOf(candle) {
  const value = candle && (candle.timestamp ?? candle.t ?? candle.time);
  const numeric = typeof value === 'string' ? Date.parse(value) : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function validateJsonSchemaObject(schema, value, label, errors) {
  if (!schema || typeof schema !== 'object') return;
  if (Array.isArray(schema.type)) {
    const matches = schema.type.some(type => {
      if (type === 'null') return value === null;
      if (type === 'object') return value && typeof value === 'object' && !Array.isArray(value);
      if (type === 'array') return Array.isArray(value);
      if (type === 'integer') return Number.isInteger(value);
      if (type === 'number') return Number.isFinite(Number(value));
      return typeof value === type;
    });
    if (!matches) errors.push(`${label} expected ${schema.type.join('|')}`);
    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
      errors.push(`${label} enum mismatch (${value})`);
    }
    return;
  }
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`${label} expected object`);
      return;
    }
    for (const required of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, required)) {
        errors.push(`${label}.${required} missing`);
      }
    }
    const props = schema.properties || {};
    for (const [key, childSchema] of Object.entries(props)) {
      if (value[key] !== undefined) {
        validateJsonSchemaObject(childSchema, value[key], `${label}.${key}`, errors);
      }
    }
    return;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`${label} expected array`);
      return;
    }
    value.forEach((item, index) => validateJsonSchemaObject(schema.items, item, `${label}[${index}]`, errors));
    return;
  }
  if (schema.type === 'string' && typeof value !== 'string') errors.push(`${label} expected string`);
  if (schema.type === 'integer' && !Number.isInteger(value)) errors.push(`${label} expected integer`);
  if (schema.type === 'number' && !Number.isFinite(Number(value))) errors.push(`${label} expected number`);
  if (schema.type === 'boolean' && typeof value !== 'boolean') errors.push(`${label} expected boolean`);
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${label} enum mismatch (${value})`);
  }
}

function validateDecisionLedgers(ledgerDir) {
  const schema = readJson(DECISION_LEDGER_SCHEMA_PATH);
  const decisionFiles = listFilesRecursive(ledgerDir, file => /decisions_.*\.jsonl$/.test(path.basename(file)));
  const errors = [];
  const tradeIds = new Set();
  let rows = 0;
  for (const file of decisionFiles) {
    for (const parsed of loadJsonl(file)) {
      if (!parsed.ok) {
        errors.push(`${file}:${parsed.line} JSON parse failed: ${parsed.error}`);
        continue;
      }
      rows += 1;
      if (nonEmpty(parsed.value?.tradeId)) tradeIds.add(String(parsed.value.tradeId));
      validateJsonSchemaObject(schema, parsed.value, `${file}:${parsed.line}`, errors);
    }
  }
  return {
    ok: errors.length === 0,
    rows,
    files: decisionFiles,
    tradeIds: Array.from(tradeIds).sort(),
    errors,
  };
}

function validateAccounting(report) {
  const trades = Array.isArray(report.trades) ? report.trades : [];
  const startingBalance = finiteNumber(report.summary?.startingBalance ?? report.summary?.initialBalance);
  const finalBalance = finiteNumber(report.summary?.finalBalance);
  const gross = trades.reduce((sum, trade) => sum + (finiteNumber(trade.rawPnlDollars) ?? 0), 0);
  const fees = trades.reduce((sum, trade) => sum + (finiteNumber(trade.feesDollars) ?? 0), 0);
  const expected = startingBalance === null ? null : startingBalance + gross - fees;
  const ok = startingBalance !== null && finalBalance !== null && roundCents(expected) === roundCents(finalBalance);
  return {
    ok,
    startingBalance,
    finalBalance,
    grossPnlDollars: gross,
    feesDollars: fees,
    expectedFinalBalance: expected,
    centDelta: finalBalance === null || expected === null ? null : roundCents(finalBalance - expected),
  };
}

function validateFields(report) {
  const errors = [];
  const trades = Array.isArray(report.trades) ? report.trades : [];
  trades.forEach((trade, index) => {
    for (const field of REQUIRED_TRADE_FIELDS) {
      const value = trade[field];
      if (!nonEmpty(value)) {
        errors.push(`trades[${index}].${field} missing/null`);
      } else if (['entryPrice', 'exitPrice', 'closedOrderQuantity', 'feesDollars', 'netPnlDollars', 'rawPnlDollars', 'mfePercent', 'maePercent'].includes(field)
        && finiteNumber(value) === null) {
        errors.push(`trades[${index}].${field} non-finite`);
      }
    }
  });
  return { ok: errors.length === 0, errors };
}

function validateCoverage(report, expectedCoverage) {
  const coverage = report.dataCoverage || {};
  const expectedCandles = expectedCoverage?.expectedCandles ?? coverage.expectedCandles;
  const candlesProcessed = finiteNumber(coverage.candlesProcessed ?? report.summary?.candlesProcessed);
  const startTimestamp = finiteNumber(coverage.startTimestamp);
  const endTimestamp = finiteNumber(coverage.endTimestamp);
  const errors = [];
  if (!Number.isFinite(expectedCandles)) errors.push('expected candle count missing');
  if (candlesProcessed !== expectedCandles) {
    errors.push(`candlesProcessed ${candlesProcessed} != expected ${expectedCandles}`);
  }
  const hasExpectedStart = expectedCoverage
    && expectedCoverage.startTimestamp !== null
    && expectedCoverage.startTimestamp !== undefined;
  const hasExpectedEnd = expectedCoverage
    && expectedCoverage.endTimestamp !== null
    && expectedCoverage.endTimestamp !== undefined;
  if (hasExpectedStart && startTimestamp !== expectedCoverage.startTimestamp) {
    errors.push(`startTimestamp ${startTimestamp} != requested ${expectedCoverage.startTimestamp}`);
  }
  if (hasExpectedEnd && endTimestamp !== expectedCoverage.endTimestamp) {
    errors.push(`endTimestamp ${endTimestamp} != requested ${expectedCoverage.endTimestamp}`);
  }
  if (coverage.complete !== true) errors.push('dataCoverage.complete is not true');
  return { ok: errors.length === 0, errors, coverage, expectedCoverage };
}

function validateWorkerReport(reportPath, expectedCoverage = null) {
  const report = readJson(reportPath);
  const trades = Array.isArray(report.trades) ? report.trades : [];
  const reportTradeCount = finiteNumber(report.summary?.totalTrades ?? report.metrics?.totalTrades);
  const lifecycleErrors = [];
  if (reportTradeCount !== trades.length) {
    lifecycleErrors.push(`report totalTrades ${reportTradeCount} != trades.length ${trades.length}`);
  }
  const accounting = validateAccounting(report);
  const fields = validateFields(report);
  const coverage = validateCoverage(report, expectedCoverage);
  const lifecycle = { ok: lifecycleErrors.length === 0, errors: lifecycleErrors, reportTrades: reportTradeCount, tradeRows: trades.length };
  const checks = {
    accounting,
    lifecycle,
    fields,
    coverage,
  };
  return {
    reportPath,
    status: Object.values(checks).every(check => check.ok) ? 'PASS' : 'FAIL',
    trades: trades.length,
    checks,
  };
}

function integrityBooleans(checks) {
  return {
    identity: Boolean(checks.accounting?.ok),
    lifecycle: Boolean(checks.lifecycle?.ok),
    fields: Boolean(checks.fields?.ok),
    coverage: Boolean(checks.coverage?.ok),
    schema: Boolean(checks.schema?.ok),
    dataParity: Boolean(checks.dataParity?.ok),
  };
}

function validateDataParityStamp(dataParityStamp, matrix) {
  const errors = [];
  if (!dataParityStamp || dataParityStamp.status !== 'PASS') {
    errors.push('data parity stamp missing or not PASS');
  }
  const stampChecks = dataParityStamp?.checks || {};
  for (const key of ['provenance', 'sameWindow', 'groundTruth']) {
    if (stampChecks[key] !== true) errors.push(`data parity ${key} is not green`);
  }
  const matrixDataFile = matrix?.dataFile
    ? path.resolve(PROJECT_ROOT, matrix.dataFile)
    : null;
  const stampDataFile = dataParityStamp?.dataFile
    ? path.resolve(PROJECT_ROOT, dataParityStamp.dataFile)
    : null;
  if (!stampDataFile) errors.push('data parity stamp missing dataFile');
  if (matrixDataFile && stampDataFile && matrixDataFile !== stampDataFile) {
    errors.push(`data parity dataFile ${stampDataFile} != matrix dataFile ${matrixDataFile}`);
  }
  if (!dataParityStamp?.dataFileSha256) {
    errors.push('data parity stamp missing dataFileSha256');
  } else if (stampDataFile && fs.existsSync(stampDataFile)) {
    const currentSha = sha256File(stampDataFile);
    if (currentSha !== dataParityStamp.dataFileSha256) {
      errors.push('data parity dataFileSha256 does not match current data file');
    }
  }
  if (!dataParityStamp?.stampedAt || Number.isNaN(Date.parse(dataParityStamp.stampedAt))) {
    errors.push('data parity stamp missing stampedAt');
  }
  return {
    ok: errors.length === 0,
    status: dataParityStamp?.status || null,
    path: dataParityStamp?.path || null,
    dataFile: dataParityStamp?.dataFile || null,
    dataFileSha256: dataParityStamp?.dataFileSha256 || null,
    stampedAt: dataParityStamp?.stampedAt || null,
    checks: stampChecks,
    errors,
  };
}

function stampReport(reportPath, stamp) {
  const report = readJson(reportPath);
  report.integrityStamp = stamp;
  writeJson(reportPath, report);
}

function validateMatrixRun({ matrixReportPath, outputDir = null, dataParityStamp = null }) {
  const matrix = readJson(matrixReportPath);
  const matrixDir = outputDir || path.dirname(matrixReportPath);
  const expectedCoverage = matrix.dataFile ? dataFileCandleCount(matrix.dataFile) : null;
  const workerReports = [];
  const errors = [];
  let totalTradesFromWorkers = 0;

  for (const result of matrix.results || []) {
    if (!result.reportPath) {
      if (Number(result.trades) > 0) errors.push(`${result.name || result.strategy} missing reportPath`);
      continue;
    }
    const reportPath = path.isAbsolute(result.reportPath)
      ? result.reportPath
      : path.resolve(path.dirname(matrixReportPath), result.reportPath);
    if (!fs.existsSync(reportPath)) {
      errors.push(`${result.name || result.strategy} reportPath not found: ${reportPath}`);
      continue;
    }
    const worker = validateWorkerReport(reportPath, expectedCoverage);
    workerReports.push(worker);
    totalTradesFromWorkers += worker.trades;
  }

  const ledgerDir = path.join(matrixDir, 'ledger');
  const schema = validateDecisionLedgers(ledgerDir);
  const matrixTradeCount = (matrix.results || []).reduce((sum, result) => sum + (finiteNumber(result.trades) ?? 0), 0);
  const lifecycleErrors = [];
  if (matrixTradeCount !== totalTradesFromWorkers) {
    lifecycleErrors.push(`matrix trades ${matrixTradeCount} != worker trade rows ${totalTradesFromWorkers}`);
  }
  if (matrixTradeCount > 0 && schema.files.length === 0) {
    lifecycleErrors.push('no isolated decision ledger files found for run');
  }
  const reportTradeIds = new Set();
  const windowEndTradeIds = new Set();
  const missingReportTradeIds = [];
  for (const worker of workerReports) {
    const report = readJson(worker.reportPath);
    for (const [index, trade] of (Array.isArray(report.trades) ? report.trades : []).entries()) {
      if (nonEmpty(trade.tradeId)) {
        reportTradeIds.add(String(trade.tradeId));
      } else {
        missingReportTradeIds.push(`${worker.reportPath}:trades[${index}].tradeId missing`);
      }
    }
    for (const position of (Array.isArray(report.windowEndPositions) ? report.windowEndPositions : [])) {
      if (nonEmpty(position.tradeId)) {
        windowEndTradeIds.add(String(position.tradeId));
      }
    }
  }
  if (missingReportTradeIds.length > 0) {
    lifecycleErrors.push(...missingReportTradeIds.slice(0, 20));
    if (missingReportTradeIds.length > 20) {
      lifecycleErrors.push(`${missingReportTradeIds.length - 20} additional report tradeId omissions`);
    }
  }
  const ledgerTradeIds = new Set(schema.tradeIds || []);
  const missingLedgerTradeIds = Array.from(reportTradeIds).filter(tradeId => !ledgerTradeIds.has(tradeId));
  const orphanLedgerTradeIds = Array.from(ledgerTradeIds).filter(tradeId => !reportTradeIds.has(tradeId) && !windowEndTradeIds.has(tradeId));
  if (missingLedgerTradeIds.length > 0) {
    lifecycleErrors.push(`decision ledger missing ${missingLedgerTradeIds.length} report trade group(s): ${missingLedgerTradeIds.slice(0, 20).join(', ')}`);
  }
  if (orphanLedgerTradeIds.length > 0) {
    lifecycleErrors.push(`decision ledger has ${orphanLedgerTradeIds.length} orphan trade group(s): ${orphanLedgerTradeIds.slice(0, 20).join(', ')}`);
  }

  const dataParity = validateDataParityStamp(dataParityStamp, matrix);
  const checks = {
    accounting: { ok: workerReports.every(report => report.checks.accounting.ok), failed: workerReports.filter(report => !report.checks.accounting.ok).map(report => report.reportPath) },
    lifecycle: { ok: lifecycleErrors.length === 0 && workerReports.every(report => report.checks.lifecycle.ok), errors: lifecycleErrors },
    fields: { ok: workerReports.every(report => report.checks.fields.ok), failed: workerReports.filter(report => !report.checks.fields.ok).map(report => ({ reportPath: report.reportPath, errors: report.checks.fields.errors.slice(0, 20) })) },
    coverage: { ok: workerReports.every(report => report.checks.coverage.ok), failed: workerReports.filter(report => !report.checks.coverage.ok).map(report => ({ reportPath: report.reportPath, errors: report.checks.coverage.errors })) },
    schema,
    dataParity,
  };
  const booleans = integrityBooleans(checks);
  const status = errors.length === 0 && Object.values(booleans).every(Boolean) ? 'PASS' : 'FAILED-INTEGRITY';
  const stamp = {
    version: 1,
    status,
    stampedAt: new Date().toISOString(),
    matrixReportPath,
    outputDir: matrixDir,
    trades: matrixTradeCount,
    checks: booleans,
    details: checks,
    errors,
    workerReports: workerReports.map(report => ({
      reportPath: report.reportPath,
      status: report.status,
      trades: report.trades,
      checks: {
        identity: report.checks.accounting.ok,
        lifecycle: report.checks.lifecycle.ok,
        fields: report.checks.fields.ok,
        coverage: report.checks.coverage.ok,
      },
    })),
  };

  for (const worker of workerReports) {
    const workerStampChecks = integrityBooleans({
      accounting: worker.checks.accounting,
      lifecycle: worker.checks.lifecycle,
      fields: worker.checks.fields,
      coverage: worker.checks.coverage,
      schema,
      dataParity: checks.dataParity,
    });
    stampReport(worker.reportPath, {
      version: 1,
      status: worker.status === 'PASS' && Object.values(workerStampChecks).every(Boolean) ? 'PASS' : 'FAILED-INTEGRITY',
      stampedAt: stamp.stampedAt,
      parentMatrixReportPath: matrixReportPath,
      checks: workerStampChecks,
      details: {
        dataParity,
      },
    });
  }
  stampReport(matrixReportPath, stamp);
  return stamp;
}

function findLatestMatrixReport(outputDir) {
  return newestFile(listFilesRecursive(outputDir, file => /^matrix-.*\.json$/.test(path.basename(file))));
}

function assertLabIntegrity(filePath, report) {
  const stamp = report?.integrityStamp;
  if (!stamp || stamp.status !== 'PASS') {
    throw new Error(`Strategy Lab refuses ${filePath}: missing full-green integrityStamp`);
  }
  const checks = stamp.checks || {};
  const required = ['identity', 'lifecycle', 'fields', 'coverage', 'schema'];
  required.push('dataParity');
  for (const key of required) {
    if (checks[key] !== true) {
      throw new Error(`Strategy Lab refuses ${filePath}: integrity ${key} is not green`);
    }
  }
  const dataParity = stamp.details?.dataParity || null;
  if (!dataParity || dataParity.status !== 'PASS') {
    throw new Error(`Strategy Lab refuses ${filePath}: data parity detail missing or not PASS`);
  }
  for (const key of ['provenance', 'sameWindow', 'groundTruth']) {
    if (dataParity.checks?.[key] !== true) {
      throw new Error(`Strategy Lab refuses ${filePath}: data parity ${key} is not green`);
    }
  }
  if (!dataParity.dataFileSha256 || !dataParity.stampedAt) {
    throw new Error(`Strategy Lab refuses ${filePath}: data parity provenance detail incomplete`);
  }
}

module.exports = {
  assertLabIntegrity,
  dataFileCandleCount,
  findLatestMatrixReport,
  validateMatrixRun,
  validateWorkerReport,
};
