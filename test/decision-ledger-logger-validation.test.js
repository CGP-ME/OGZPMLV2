'use strict';

const fs = require('fs');
const path = require('path');

const TEST_OUTPUT_ROOT = path.join(__dirname, '.tmp-decision-ledger');

function readJsonl(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

describe('DecisionLedgerLogger validation failure routing', () => {
  let originalBacktestOutputDir;
  let originalLedgerValidate;
  let errorSpy;

  beforeEach(() => {
    originalBacktestOutputDir = process.env.BACKTEST_OUTPUT_DIR;
    originalLedgerValidate = process.env.LEDGER_VALIDATE;
    process.env.BACKTEST_OUTPUT_DIR = TEST_OUTPUT_ROOT;
    process.env.LEDGER_VALIDATE = 'true';
    fs.rmSync(TEST_OUTPUT_ROOT, { recursive: true, force: true });
    jest.resetModules();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.dontMock('../core/dto/DecisionLedgerSchema');
    jest.resetModules();
    fs.rmSync(TEST_OUTPUT_ROOT, { recursive: true, force: true });
    if (originalBacktestOutputDir === undefined) delete process.env.BACKTEST_OUTPUT_DIR;
    else process.env.BACKTEST_OUTPUT_DIR = originalBacktestOutputDir;
    if (originalLedgerValidate === undefined) delete process.env.LEDGER_VALIDATE;
    else process.env.LEDGER_VALIDATE = originalLedgerValidate;
    errorSpy.mockRestore();
  });

  test('routes validation exceptions to malformed ledger instead of main decisions log', () => {
    jest.doMock('../core/dto/DecisionLedgerSchema', () => ({
      validateLedgerSkeleton: () => {
        throw new Error('schema boom');
      },
    }));

    const logger = require('../core/DecisionLedgerLogger');
    logger.writeOnClose({ tradeId: 'LEDGER-SCHEMA-BOOM', symbol: 'TSLA' });

    const ledgerDir = path.join(TEST_OUTPUT_ROOT, 'ledger');
    const malformedPath = path.join(ledgerDir, `malformed_${new Date().toISOString().split('T')[0]}.jsonl`);
    const decisionsPath = path.join(ledgerDir, `decisions_${new Date().toISOString().split('T')[0]}.jsonl`);

    expect(fs.existsSync(decisionsPath)).toBe(false);
    expect(fs.existsSync(malformedPath)).toBe(true);
    expect(readJsonl(malformedPath)[0]).toMatchObject({
      tradeId: 'LEDGER-SCHEMA-BOOM',
      errors: [{
        path: ['schema'],
        message: 'schema boom',
        code: 'schema_validation_exception',
      }],
      raw: {
        tradeId: 'LEDGER-SCHEMA-BOOM',
        symbol: 'TSLA',
      },
    });
  });
});
