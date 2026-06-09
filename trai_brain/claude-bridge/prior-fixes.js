'use strict';

const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./policy');

const FIXES_PATH = path.join(REPO_ROOT, 'ogz-meta', 'ledger', 'fixes.jsonl');

function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text.toLowerCase().replace(/[^a-z0-9_]/g, ' ').split(/\s+/).filter((t) => t.length > 2);
}

function loadFixes() {
  if (!fs.existsSync(FIXES_PATH)) return [];
  const lines = fs.readFileSync(FIXES_PATH, 'utf8').split('\n').filter(Boolean);
  const fixes = [];
  for (const line of lines) {
    try {
      fixes.push(JSON.parse(line));
    } catch (_) {  }
  }
  return fixes;
}

function scoreFix(fix, queryTerms) {
  const fields = [
    (fix.symptom || '') + ' ' + (fix.symptom || ''),
    fix.root_cause || '',
    (fix.tags || []).join(' ') + ' ' + (fix.tags || []).join(' '),
    fix.minimal_fix || '',
    (fix.files || []).join(' '),
  ];
  const fixTerms = new Set();
  for (const f of fields) {
    for (const t of tokenize(f)) fixTerms.add(t);
  }
  let hits = 0;
  for (const qt of queryTerms) {
    if (fixTerms.has(qt)) hits++;
  }
  return hits;
}

function topMatches(query, k = 3) {
  const fixes = loadFixes();
  if (fixes.length === 0) return [];
  const qt = tokenize(query);
  if (qt.length === 0) return [];
  const scored = fixes.map((f) => ({ fix: f, score: scoreFix(f, qt) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.filter((s) => s.score > 0).slice(0, k);
}

function formatBlock(matches) {
  if (matches.length === 0) {
    return '── PRIOR FIXES CHECK ──\nNo prior fix entries match this query. Proceeding without prior-fix context.\n──';
  }
  const lines = ['── PRIOR FIXES CHECK ──'];
  lines.push(`Matched ${matches.length} prior fix entries from ogz-meta/ledger/fixes.jsonl. Review BEFORE proposing changes:`);
  lines.push('');
  for (const { fix, score } of matches) {
    lines.push(`[${fix.id}] (relevance ${score}) ${fix.date} ${fix.severity || ''}`);
    if (Array.isArray(fix.tags) && fix.tags.length) lines.push(`  tags: ${fix.tags.join(', ')}`);
    if (fix.symptom) lines.push(`  symptom: ${String(fix.symptom).slice(0, 200)}`);
    if (fix.root_cause) lines.push(`  root_cause: ${String(fix.root_cause).slice(0, 300)}`);
    if (fix.minimal_fix) lines.push(`  minimal_fix: ${String(fix.minimal_fix).slice(0, 200)}`);
    if (Array.isArray(fix.files) && fix.files.length) lines.push(`  files: ${fix.files.join(', ')}`);
    lines.push('');
  }
  lines.push('If your current task overlaps any of these, READ THE FILES they touched before proposing a fix. Do not re-discover what is already in the ledger.');
  lines.push('──');
  return lines.join('\n');
}

module.exports = { topMatches, formatBlock, loadFixes, FIXES_PATH };
