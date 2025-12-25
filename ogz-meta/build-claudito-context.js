#!/usr/bin/env node

/**
 * build-claudito-context.js
 * UPGRADED: Now a curator that includes Fix Ledger insights
 *
 * Builds a curated context pack that:
 * - Always includes core architecture/guardrails
 * - Includes recent/relevant fixes from ledger
 * - Includes lessons digest
 * - Stays under size limit (30k chars)
 */

const fs = require("fs");
const path = require("path");

const META_DIR = __dirname;
const LEDGER_FILE = path.join(META_DIR, 'ledger', 'fixes.jsonl');
const DIGEST_FILE = path.join(META_DIR, 'ledger', 'lessons_digest.md');

// Core files that are ALWAYS included
const CORE_FILES = [
  "00_intent.md",
  "01_purpose-and-vision.md",
  "02_architecture-overview.md",
  "03_modules-overview.md",
  "04_guardrails-and-rules.md",
  "05_landmines-and-gotchas.md",
];

// Dynamic files that may be truncated
const DYNAMIC_FILES = [
  "06_recent-changes.md",
  "07_trey-brain-lessons.md",
];

const OUTPUT_FILE = "claudito_context.md";
const MAX_SIZE = 30000; // Character limit for context pack

function readIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[WARN] Missing file: ${path.basename(filePath)} (skipping)`);
    return null;
  }
  return fs.readFileSync(filePath, "utf8");
}

/**
 * Load and curate Fix Ledger entries
 */
function getCuratedFixes(maxEntries = 10) {
  if (!fs.existsSync(LEDGER_FILE)) return '';

  const entries = fs.readFileSync(LEDGER_FILE, 'utf8')
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));

  if (entries.length === 0) return '';

  // Sort by recency and severity
  const scored = entries.map(entry => {
    let score = 0;

    // Recency score
    const daysSince = Math.floor((Date.now() - new Date(entry.date).getTime()) / (1000 * 60 * 60 * 24));
    score += Math.max(0, 30 - daysSince) * 2;

    // Severity score
    if (entry.severity === 'CRITICAL') score += 20;
    if (entry.severity === 'HIGH') score += 10;

    return { ...entry, _score: score };
  });

  const topEntries = scored
    .sort((a, b) => b._score - a._score)
    .slice(0, maxEntries);

  let content = '\n\n---\n\n<!-- Fix Ledger (Recent/Critical) -->\n\n';
  content += '# Recent Fix History\n\n';

  topEntries.forEach(entry => {
    content += `## ${entry.id}\n`;
    content += `- **Date**: ${entry.date}\n`;
    content += `- **Severity**: ${entry.severity}\n`;
    content += `- **Symptom**: ${entry.symptom}\n`;
    content += `- **Fix**: ${entry.minimal_fix}\n`;
    if (entry.what_worked.length > 0) {
      content += `- **✅ Worked**: ${entry.what_worked[0]}\n`;
    }
    if (entry.what_failed.length > 0) {
      content += `- **❌ Failed**: ${entry.what_failed[0]}\n`;
    }
    content += '\n';
  });

  return content;
}

/**
 * Main curator function
 */
function main() {
  console.log("🔧 Building Curated Context Pack...");

  let parts = [];
  let totalSize = 0;

  // Add core files (always included)
  for (const fileName of CORE_FILES) {
    const fullPath = path.join(META_DIR, fileName);
    const content = readIfExists(fullPath);

    if (!content) continue;

    const section = `\n\n---\n\n<!-- ${fileName} -->\n\n` + content.trim() + "\n";
    parts.push(section);
    totalSize += section.length;
  }

  console.log(`  Core files: ${totalSize} chars`);

  // Add curated fixes from ledger
  const fixSection = getCuratedFixes();
  if (fixSection) {
    parts.push(fixSection);
    totalSize += fixSection.length;
    console.log(`  Fix ledger: ${fixSection.length} chars`);
  }

  // Add lessons digest if exists
  const digest = readIfExists(DIGEST_FILE);
  if (digest && totalSize + digest.length < MAX_SIZE - 2000) {
    const digestSection = `\n\n---\n\n<!-- Lessons Digest -->\n\n` + digest;
    parts.push(digestSection);
    totalSize += digestSection.length;
    console.log(`  Lessons digest: ${digestSection.length} chars`);
  }

  // Add dynamic files if space allows
  for (const fileName of DYNAMIC_FILES) {
    if (totalSize > MAX_SIZE - 2000) break;

    const fullPath = path.join(META_DIR, fileName);
    const content = readIfExists(fullPath);

    if (!content) continue;

    let section = `\n\n---\n\n<!-- ${fileName} -->\n\n` + content.trim() + "\n";

    // Truncate if needed
    if (totalSize + section.length > MAX_SIZE) {
      const available = MAX_SIZE - totalSize - 100;
      section = section.slice(0, available) + "\n\n[... truncated for size ...]";
    }

    parts.push(section);
    totalSize += section.length;
  }

  if (parts.length === 0) {
    console.error("❌ No content found. Nothing to build.");
    process.exit(1);
  }

  const outputPath = path.join(META_DIR, OUTPUT_FILE);
  const finalContent =
    "# OGZPrime – Curated Context Pack\n" +
    `_Generated: ${new Date().toISOString()}_\n` +
    `_Size: ${totalSize} chars (limit: ${MAX_SIZE})_\n` +
    parts.join("");

  fs.writeFileSync(outputPath, finalContent, "utf8");

  console.log(`\n✅ Built curated context: ${OUTPUT_FILE}`);
  console.log(`   Total size: ${finalContent.length} chars`);
  console.log(`   Path: ${outputPath}`);

  // Show summary
  const ledgerExists = fs.existsSync(LEDGER_FILE);
  const digestExists = fs.existsSync(DIGEST_FILE);

  console.log('\n📊 Context includes:');
  console.log(`   Core architecture: ✓`);
  console.log(`   Fix ledger: ${ledgerExists ? '✓' : '✗ (run update-ledger.js)'}`);
  console.log(`   Lessons digest: ${digestExists ? '✓' : '✗ (run update-ledger.js)'}`);
  console.log(`   Recent changes: ${totalSize < MAX_SIZE ? '✓' : 'partial'}`);

  if (!ledgerExists) {
    console.log('\n💡 Tip: Run these commands to build knowledge base:');
    console.log('   node ogz-meta/update-ledger.js');
    console.log('   node ogz-meta/build-claudito-context.js');
  }
}

main();
