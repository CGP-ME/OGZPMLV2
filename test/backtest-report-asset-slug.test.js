'use strict';

const fs = require('fs');
const path = require('path');

describe('BacktestRunner standalone report asset slug', () => {
  test('uses validated data-file instrument slug for standalone report filenames', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'core', 'BacktestRunner.js'), 'utf8');
    expect(source).toContain("const { deriveReportAssetSlugFromDataFile } = require('./DataFileInstrument');");
    expect(source).toContain("const runId = `${runTimestamp}-${process.pid}-${randomUUID()}`;");
    expect(source).toContain('const runDir = getRunDir(runId);');
    expect(source).toContain('deriveReportAssetSlugFromDataFile(process.env.CANDLE_DATA_FILE)');
    expect(source).toContain('report${reportAssetSuffix}.json');
    expect(source).toContain('backtest-report-${runId}-${reportTag}${reportAssetSuffix}.json');
    expect(source).toContain('backtest-report-v14MERGED-${runId}${reportAssetSuffix}.json');
    expect(source).not.toContain('backtest-report-v14MERGED-${runTimestamp}.json');
    expect(source).not.toContain("path.join(runDir, 'report.json')");
  });
});
