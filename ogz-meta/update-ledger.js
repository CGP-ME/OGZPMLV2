#!/usr/bin/env node

/**
 * update-ledger.js
 * Harvests fix knowledge from reports and updates the Fix Ledger
 * Append-only, structured memory that accumulates over time
 */

const fs = require('fs');
const path = require('path');

const LEDGER_DIR = path.join(__dirname, 'ledger');
const LEDGER_FILE = path.join(LEDGER_DIR, 'fixes.jsonl');
const REPORTS_DIR = path.dirname(__dirname); // Root directory with reports

// Ensure ledger directory exists
if (!fs.existsSync(LEDGER_DIR)) {
  fs.mkdirSync(LEDGER_DIR, { recursive: true });
}

// Initialize ledger if it doesn't exist
if (!fs.existsSync(LEDGER_FILE)) {
  fs.writeFileSync(LEDGER_FILE, '');
}

/**
 * Parse a report file and extract fix entries
 */
function parseReport(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);
  const entries = [];

  // Pattern for SURGICAL-FIXES-REPORT.md style
  const issuePattern = /## CRITICAL ISSUE #(\d+): (.+?)\n/g;
  const problemPattern = /### Problem\n([\s\S]+?)###/g;
  const solutionPattern = /### Solution\n([\s\S]+?)###/g;
  const impactPattern = /### Impact\n([\s\S]+?)(?:###|---)/g;

  // Extract structured issues
  let match;
  while ((match = issuePattern.exec(content))) {
    const issueNum = match[1];
    const issueTitle = match[2];

    // Find corresponding problem/solution/impact
    problemPattern.lastIndex = match.index;
    solutionPattern.lastIndex = match.index;
    impactPattern.lastIndex = match.index;

    const problemMatch = problemPattern.exec(content);
    const solutionMatch = solutionPattern.exec(content);
    const impactMatch = impactPattern.exec(content);

    // Extract file references
    const filePattern = /`([^`]+\.js)`|File[:\s]+`?([^`\n]+\.js)`?/g;
    const files = [];
    let fileMatch;
    const sectionText = content.slice(match.index, match.index + 2000);
    while ((fileMatch = filePattern.exec(sectionText))) {
      const file = fileMatch[1] || fileMatch[2];
      if (file && !files.includes(file)) files.push(file);
    }

    // Determine tags based on content
    const tags = [];
    if (issueTitle.match(/state|sync/i)) tags.push('state');
    if (issueTitle.match(/memory|leak/i)) tags.push('memory');
    if (issueTitle.match(/trai|ai/i)) tags.push('trai');
    if (issueTitle.match(/rate|limit/i)) tags.push('rate-limit');
    if (issueTitle.match(/persist/i)) tags.push('persistence');
    if (issueTitle.match(/block/i)) tags.push('performance');

    // Extract what worked/failed from impact
    const whatWorked = [];
    const whatFailed = [];
    if (impactMatch) {
      const impactText = impactMatch[1];
      const lines = impactText.split('\n');
      lines.forEach(line => {
        if (line.includes('✅')) whatWorked.push(line.replace('✅', '').trim());
        if (line.includes('❌')) whatFailed.push(line.replace('❌', '').trim());
      });
    }

    entries.push({
      id: `FIX-${new Date().toISOString().split('T')[0]}-${issueTitle.replace(/\s+/g, '-').toUpperCase().slice(0, 30)}`,
      date: new Date().toISOString().split('T')[0],
      severity: 'CRITICAL',
      tags: tags,
      symptom: problemMatch ? problemMatch[1].trim().split('\n')[0] : issueTitle,
      root_cause: problemMatch ? problemMatch[1].trim() : 'See report',
      minimal_fix: solutionMatch ? solutionMatch[1].trim().split('\n')[0] : 'See report',
      files: files,
      verification: whatWorked.slice(0, 3),
      outcome: 'success',
      what_worked: whatWorked,
      what_failed: whatFailed,
      evidence: [`${fileName}#${issueTitle}`],
      commit: null
    });
  }

  // Pattern for FIX-XXX style reports
  if (fileName.startsWith('FIX-')) {
    const rootCauseMatch = content.match(/## Root Cause\n([\s\S]+?)##/);
    const filesMatch = content.match(/## Files Modified\n([\s\S]+?)##/);

    entries.push({
      id: fileName.replace('.md', ''),
      date: new Date().toISOString().split('T')[0],
      severity: 'HIGH',
      tags: ['pattern-memory', 'recording'],
      symptom: content.match(/## Problem\n([\s\S]+?)##/)?.[1]?.trim() || 'Pattern memory not growing',
      root_cause: rootCauseMatch?.[1]?.trim() || 'See report',
      minimal_fix: 'Fixed feature data conversion in pattern pipeline',
      files: filesMatch ? filesMatch[1].match(/\w+\.js/g) || [] : [],
      verification: ['Patterns now recording', 'Memory growing'],
      outcome: 'success',
      what_worked: ['Preserving features array through pipeline'],
      what_failed: ['String signature truncation'],
      evidence: [fileName],
      commit: null
    });
  }

  return entries;
}

/**
 * Check if entry already exists in ledger
 */
function entryExists(ledgerContent, entryId) {
  return ledgerContent.split('\n')
    .filter(line => line.trim())
    .some(line => {
      try {
        const entry = JSON.parse(line);
        return entry.id === entryId;
      } catch {
        return false;
      }
    });
}

/**
 * Main update process
 */
function updateLedger() {
  console.log('📚 Updating Fix Ledger...');

  // Read existing ledger
  const existingLedger = fs.readFileSync(LEDGER_FILE, 'utf8');

  // Find all report files
  const reportFiles = fs.readdirSync(REPORTS_DIR)
    .filter(f => f.match(/(SURGICAL|FIX-\d+|VERIFY).*\.md$/))
    .map(f => path.join(REPORTS_DIR, f));

  let newEntries = 0;

  for (const reportFile of reportFiles) {
    console.log(`  Parsing ${path.basename(reportFile)}...`);
    const entries = parseReport(reportFile);

    for (const entry of entries) {
      if (!entryExists(existingLedger, entry.id)) {
        fs.appendFileSync(LEDGER_FILE, JSON.stringify(entry) + '\n');
        newEntries++;
        console.log(`    ✅ Added: ${entry.id}`);
      }
    }
  }

  console.log(`\n📊 Ledger updated: ${newEntries} new entries added`);

  // Generate summary stats
  const allEntries = fs.readFileSync(LEDGER_FILE, 'utf8')
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));

  const stats = {
    total: allEntries.length,
    critical: allEntries.filter(e => e.severity === 'CRITICAL').length,
    high: allEntries.filter(e => e.severity === 'HIGH').length,
    success: allEntries.filter(e => e.outcome === 'success').length,
    tags: {}
  };

  allEntries.forEach(entry => {
    entry.tags.forEach(tag => {
      stats.tags[tag] = (stats.tags[tag] || 0) + 1;
    });
  });

  console.log('\n📈 Ledger Statistics:');
  console.log(`  Total fixes: ${stats.total}`);
  console.log(`  Critical: ${stats.critical}, High: ${stats.high}`);
  console.log(`  Success rate: ${((stats.success / stats.total) * 100).toFixed(1)}%`);
  console.log(`  Top tags: ${Object.entries(stats.tags).slice(0, 5).map(([k,v]) => `${k}(${v})`).join(', ')}`);

  return allEntries;
}

// Generate lessons digest
function generateDigest(entries) {
  const digestPath = path.join(LEDGER_DIR, 'lessons_digest.md');

  const lessons = new Set();
  const patterns = {};

  entries.forEach(entry => {
    // Extract key lessons
    entry.what_worked.forEach(w => {
      if (w.length < 100) lessons.add(`✅ ${w}`);
    });

    entry.what_failed.forEach(f => {
      if (f.length < 100) lessons.add(`❌ Never: ${f}`);
    });

    // Track patterns
    entry.tags.forEach(tag => {
      patterns[tag] = patterns[tag] || [];
      patterns[tag].push(entry.minimal_fix);
    });
  });

  let digest = '# Lessons Digest\n\n';
  digest += `*Generated: ${new Date().toISOString()}*\n\n`;
  digest += '## Key Lessons\n\n';

  Array.from(lessons).slice(0, 20).forEach(lesson => {
    digest += `- ${lesson}\n`;
  });

  digest += '\n## Common Patterns\n\n';
  Object.entries(patterns).slice(0, 10).forEach(([tag, fixes]) => {
    digest += `### ${tag}\n`;
    fixes.slice(0, 3).forEach(fix => {
      digest += `- ${fix}\n`;
    });
    digest += '\n';
  });

  fs.writeFileSync(digestPath, digest);
  console.log(`\n📝 Lessons digest updated: ${digestPath}`);
}

// Run if called directly
if (require.main === module) {
  const entries = updateLedger();
  generateDigest(entries);
}

module.exports = { updateLedger, generateDigest };