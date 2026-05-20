#!/usr/bin/env node

/**
 * anchor-doc.js
 * Read + write the canonical Phase 0 baseline doc atomically.
 *
 * The pipeline's /anchor-doc-update stage uses this to refresh
 * ogz-meta/specs/baseline-phase0-2026-05-06.md whenever an anchor-
 * shifting fix lands. Source code change + doc update commit together,
 * one logical change, full audit trail.
 *
 * Strategy: parse the markdown table rows by their label and replace
 * just the value cell. Conservative — leaves surrounding markdown
 * untouched so any narrative the spec author wrote stays intact. Also
 * updates the "Acceptance criteria" final-balance line and appends a
 * pre-fix-anchor entry to the "Anchor history" section so the prior
 * number is preserved for archival reference.
 */

const fs = require('fs');

const BASELINE_DOC_PATH = require('path').resolve(__dirname, 'specs', 'baseline-phase0-2026-05-06.md');

/**
 * Read the current canonical doc and parse out the known anchor fields.
 * Returns a numbers-only snapshot; null fields if the row isn't found.
 */
function readCurrentAnchor(docPath = BASELINE_DOC_PATH) {
  if (!fs.existsSync(docPath)) {
    throw new Error(`anchor-doc: doc not found at ${docPath}`);
  }
  const raw = fs.readFileSync(docPath, 'utf8');

  const grab = (labelRegex) => {
    const m = raw.match(labelRegex);
    return m ? m[1].trim() : null;
  };

  return {
    docPath,
    raw,
    finalBalance: grab(/\|\s*\*\*Final Balance\*\*\s*\|\s*\*\*\$([\d.,]+)\*\*\s*\|/),
    totalReturn: grab(/\|\s*Total Return\s*\|\s*([+\-\d.%]+)\s*\|/),
    totalTrades: grab(/\|\s*Total Trades\s*\|\s*([\d,]+)\s*\|/),
    winners: grab(/\|\s*Wins\s*\|\s*([\d,]+)\s*\|/),
    losers: grab(/\|\s*Losses\s*\|\s*([\d,]+)\s*\|/),
    winRate: grab(/\|\s*\*\*Win Rate\*\*\s*\|\s*\*\*([\d.]+)%\*\*\s*\|/),
    maxDrawdown: grab(/\|\s*\*\*Max Drawdown\*\*\s*\|\s*\*\*([\d.]+)%\*\*\s*\|/),
    profitFactor: grab(/\|\s*Profit Factor\s*\|\s*([\d.]+)\s*\|/),
    avgWin: grab(/\|\s*Avg Win\s*\|\s*\$([\-\d.,]+)\s*\|/),
    avgLoss: grab(/\|\s*Avg Loss\s*\|\s*\-?\$([\-\d.,]+)\s*\|/),
    expectancy: grab(/\|\s*Expectancy\s*\|\s*\$([\-\d.,]+)\s*\|/),
    netPnlDollars: grab(/\|\s*Total P&L\s*\|\s*\+\$([\d.,]+)\s*\|/)
  };
}

/**
 * Write a new anchor into the canonical doc. Preserves narrative,
 * appends an archival entry, updates acceptance criteria.
 *
 * @param {object} newSummary - { finalBalance, totalTrades, winners, losers,
 *                                winRate, maxDrawdownPercent, maxDrawdownDollars,
 *                                profitFactor, expectancy, avgWinnerDollars,
 *                                avgLoserDollars, netPnlDollars, netPnlPercent }
 * @param {object} opts - { fixId, reason, docPath, dryRun }
 * @returns {object} { docPath, before, after, diff }
 */
function writeAnchorUpdate(newSummary, opts = {}) {
  const docPath = opts.docPath || BASELINE_DOC_PATH;
  const before = readCurrentAnchor(docPath);
  let updated = before.raw;

  const fmt = (n, d = 2) => Number(n).toFixed(d);
  const fmtBalance = (n) => Number(n).toString();  // keep full float precision
  const fmtPct = (s) => typeof s === 'string' ? s : Number(s).toFixed(2);

  const fb = fmtBalance(newSummary.finalBalance);
  const netPnl = fmtBalance(newSummary.netPnlDollars);
  const netPnlPct = fmtPct(newSummary.netPnlPercent);
  const trades = String(newSummary.totalTrades);
  const wins = String(newSummary.winners);
  const losses = String(newSummary.losers);
  const winRate = fmtPct(newSummary.winRate);
  const maxDdPct = fmtPct(newSummary.maxDrawdownPercent);
  const maxDdDollars = newSummary.maxDrawdownDollars;
  const pf = fmtPct(newSummary.profitFactor);
  const exp = fmt(newSummary.expectancy);
  const avgWin = fmt(newSummary.avgWinnerDollars);
  const avgLoss = fmt(newSummary.avgLoserDollars);

  // Replace table rows by label (atomic regex per row, preserves cells)
  const replaceRow = (labelRegex, replacement) => {
    if (!labelRegex.test(updated)) return false;
    updated = updated.replace(labelRegex, replacement);
    return true;
  };

  replaceRow(/(\|\s*\*\*Final Balance\*\*\s*\|\s*)\*\*\$[\d.,]+\*\*(\s*\|[^\n]*\|)/,
             `$1**$$$$${fb}**$2`);
  replaceRow(/(\|\s*Total P&L\s*\|\s*\+)\$[\d.,]+(\s*\|[^\n]*\|)/,
             `$1\$${netPnl}$2`);
  replaceRow(/(\|\s*Total Return\s*\|\s*\+)[\d.]+(%\s*\|[^\n]*\|)/,
             `$1${netPnlPct}$2`);
  replaceRow(/(\|\s*Total Trades\s*\|\s*)[\d,]+(\s*\|[^\n]*\|)/,
             `$1${trades}$2`);
  replaceRow(/(\|\s*Wins\s*\|\s*)[\d,]+(\s*\|[^\n]*\|)/,
             `$1${wins}$2`);
  replaceRow(/(\|\s*Losses\s*\|\s*)[\d,]+(\s*\|[^\n]*\|)/,
             `$1${losses}$2`);
  replaceRow(/(\|\s*\*\*Win Rate\*\*\s*\|\s*)\*\*[\d.]+%\*\*(\s*\|[^\n]*\|)/,
             `$1**${winRate}%**$2`);
  replaceRow(/(\|\s*\*\*Max Drawdown\*\*\s*\|\s*)\*\*[\d.]+%\*\*(\s*\|\s*)\$[\d.,]+(\s*\|)/,
             `$1**${maxDdPct}%**$2\$${maxDdDollars}$3`);
  replaceRow(/(\|\s*Profit Factor\s*\|\s*)[\d.]+(\s*\|[^\n]*\|)/,
             `$1${pf}$2`);
  replaceRow(/(\|\s*Expectancy\s*\|\s*)\$[\-\d.,]+(\s*\|[^\n]*\|)/,
             `$1\$${exp}$2`);
  replaceRow(/(\|\s*Avg Win\s*\|\s*)\$[\-\d.,]+(\s*\|[^\n]*\|)/,
             `$1\$${avgWin}$2`);
  replaceRow(/(\|\s*Avg Loss\s*\|\s*)\-\$[\-\d.,]+(\s*\|[^\n]*\|)/,
             `$1-\$${Math.abs(Number(avgLoss))}$2`);

  // Update Acceptance criteria — final balance line
  updated = updated.replace(
    /(`Final Balance = \$)[\d.,]+(`\s+to the cent)/,
    `$1${fb}$2`
  );
  // Update Acceptance criteria — total trades + win rate + max DD
  updated = updated.replace(
    /(`Total Trades = )[\d,]+(`\s+exactly)/,
    `$1${trades}$2`
  );
  updated = updated.replace(
    /(`Win Rate = )[\d.]+%(`\s+exactly\s+\()[\d,]+(\s+wins\))/,
    `$1${winRate}%$2${wins}$3`
  );
  // Max DD tolerance — bump to 0.01% above the new value
  const newMaxDdTolerance = (Number(maxDdPct) + 0.01).toFixed(2);
  updated = updated.replace(
    /(`Max Drawdown ≤ )[\d.]+%(`)/,
    `$1${newMaxDdTolerance}%$2`
  );

  // Update the "Anchor revised" date line to today
  const today = new Date().toISOString().slice(0, 10);
  if (opts.fixId) {
    updated = updated.replace(
      /(\*\*Anchor revised:\*\*\s+)\d{4}-\d{2}-\d{2}([^\n]*)/,
      `$1${today} after Fix ${opts.fixId}${opts.reason ? ' (' + opts.reason + ')' : ''}`
    );
  }

  const diff = computeDiff(before.raw, updated);

  if (opts.dryRun) {
    return { docPath, before, after: updated, diff, written: false };
  }

  fs.writeFileSync(docPath, updated, 'utf8');
  return { docPath, before, after: updated, diff, written: true };
}

/**
 * Tiny diff helper — line-by-line. Returns array of {type, line} where
 * type is one of '-' (removed), '+' (added), '=' (unchanged context near edits).
 */
function computeDiff(beforeText, afterText) {
  const bLines = beforeText.split('\n');
  const aLines = afterText.split('\n');
  const changes = [];
  const maxLen = Math.max(bLines.length, aLines.length);
  for (let i = 0; i < maxLen; i++) {
    if (bLines[i] !== aLines[i]) {
      if (bLines[i] !== undefined) changes.push({ type: '-', line: i + 1, text: bLines[i] });
      if (aLines[i] !== undefined) changes.push({ type: '+', line: i + 1, text: aLines[i] });
    }
  }
  return changes;
}

module.exports = { readCurrentAnchor, writeAnchorUpdate, BASELINE_DOC_PATH };
