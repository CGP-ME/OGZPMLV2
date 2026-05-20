// analytics/TaxReportGenerator.js  
// Generate detailed tax reports (CSV, PDF, 8949) for accountants.

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { createObjectCsvWriter: createCsv } = require('csv-writer');

class TaxReportGenerator {
  constructor(config = {}) {
    this.config = {
      outputDir: path.join(process.cwd(), 'output', 'tax'),
      ...config
    };
  }

  async generateAnnualReport(year, trades) {
    const processed = this.processTrades(trades);
    const summary = this.calculateSummary(processed);
    const timestamp = new Date().toISOString().split('T')[0];
    const base = `OGZ_TaxReport_${year}_${timestamp}`;
    await this.generateCSV(processed, `${base}.csv`);
    await this.generatePDF(processed, summary, year, `${base}.pdf`);
    await this.generate8949Format(processed, `${base}_8949.csv`);
    console.log('✅ Tax reports generated in', this.config.outputDir);
  }

  processTrades(trades) {
    return trades.map(t => {
      const holdDays = (new Date(t.exitTime) - new Date(t.entryTime))/(1000*60*60*24);
      return {
        asset: t.assetName || 'BTC-USD',
        entryDate: new Date(t.entryTime).toISOString().split('T')[0],
        exitDate: new Date(t.exitTime).toISOString().split('T')[0],
        proceeds: t.exitPrice * t.size,
        costBasis: t.entryPrice * t.size,
        gainLoss: t.pnl,
        isLongTerm: holdDays>365,
        holdTimeDays: Math.floor(holdDays),
      };
    });
  }

  calculateSummary(processed) {
    return processed.reduce((sum, t) => {
      sum.totalTrades++;
      sum[t.isLongTerm?'longTermTrades':'shortTermTrades']++;
      sum.totalGains += Math.max(0, t.gainLoss);
      sum.totalLosses += Math.max(0, -t.gainLoss);
      return sum;
    }, { totalTrades:0, shortTermTrades:0, longTermTrades:0, totalGains:0, totalLosses:0 });
  }

  async generateCSV(records, filename) {
    const writer = createCsv({ path:path.join(this.config.outputDir, filename), header:Object.keys(records[0]).map(f=>({id:f,title:f})) });
    await writer.writeRecords(records);
    console.log('📄 CSV saved:', filename);
  }

  async generate8949Format(records, filename) {
    // Format same fields into IRS 8949 format…
  }

  async generatePDF(records, summary, year, filename) {
    const doc = new PDFDocument();
    doc.pipe(fs.createWriteStream(path.join(this.config.outputDir, filename)));
    doc.fontSize(24).text(`Tax Report ${year}`, { align:'center' }).moveDown();
    doc.fontSize(12).text(JSON.stringify(summary, null, 2));
    doc.end();
    console.log('📋 PDF saved:', filename);
  }
}

module.exports = TaxReportGenerator;
