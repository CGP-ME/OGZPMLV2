#!/usr/bin/env node

/**
 * spec-parser.js
 * Parses Wolf-format fix specs (OGZPMLV2-FIX-SPEC-BY-MODULE.md and similar).
 *
 * Purpose: --write flag needs a deterministic, verbatim str_replace pair
 * pulled directly from the spec doc — no Mercury re-derivation, nothing for
 * a prompt to bias.
 *
 * Expected spec section format (per Wolf's convention):
 *
 *   ### Fix N: <title>
 *
 *   **File:** `path/to/file.js`
 *   **Line:** ~408
 *   **Status:** NOT FIXED
 *
 *   **Bug:** ...
 *
 *   **str_replace target:**
 *   ```[lang]
 *   <exact code to find>
 *   ```
 *
 *   **str_replace replacement:**
 *   ```[lang]
 *   <exact replacement>
 *   ```
 *
 *   **Verification:** ...
 *
 * The parser returns { fixId, title, file, target, replacement, lineHint }
 * or throws with a specific reason on malformed spec.
 */

const fs = require('fs');

/**
 * Parse a Fix N section out of a spec doc.
 *
 * @param {string} specPath - absolute path to the spec markdown file
 * @param {string|number} fixId - the Fix number to extract (e.g. 4 or "4")
 * @returns {object} { fixId, title, file, target, replacement, lineHint }
 * @throws {Error} if spec missing, section missing, or required blocks absent
 */
function parseFix(specPath, fixId) {
  if (!fs.existsSync(specPath)) {
    throw new Error(`spec-parser: spec file not found: ${specPath}`);
  }

  const raw = fs.readFileSync(specPath, 'utf8');
  const fixIdStr = String(fixId);

  // Anchor on `### Fix N:` exactly (digit boundary prevents Fix 1 from matching Fix 10).
  const sectionStart = new RegExp(`^### Fix ${fixIdStr}:\\s*(.+)$`, 'm');
  const startMatch = raw.match(sectionStart);
  if (!startMatch) {
    throw new Error(`spec-parser: section "### Fix ${fixIdStr}:" not found in ${specPath}`);
  }
  const title = startMatch[1].trim();
  const startIdx = startMatch.index;

  // Section ends at the next `### Fix <num>:` heading OR `# ` top-level heading.
  const remainder = raw.slice(startIdx + startMatch[0].length);
  const endMatch = remainder.match(/\n(### Fix \d+:|# [^\n]+\n=)/);
  const sectionEnd = endMatch ? startIdx + startMatch[0].length + endMatch.index : raw.length;
  const section = raw.slice(startIdx, sectionEnd);

  // File: `**File:** \`<path>\``
  const fileMatch = section.match(/\*\*File:\*\*\s+`([^`]+)`/);
  if (!fileMatch) {
    throw new Error(`spec-parser: Fix ${fixIdStr} missing "**File:** \`...\`" line`);
  }
  const file = fileMatch[1].trim();

  // Optional line hint
  const lineMatch = section.match(/\*\*Lines?:\*\*\s+([^\n]+)/);
  const lineHint = lineMatch ? lineMatch[1].trim() : null;

  // str_replace target — fenced code block following the heading
  const target = _extractFencedBlock(section, /\*\*str_replace target:\*\*\s*\n/);
  if (!target) {
    throw new Error(`spec-parser: Fix ${fixIdStr} missing "**str_replace target:**" fenced block`);
  }

  // str_replace replacement — fenced code block following the heading
  const replacement = _extractFencedBlock(section, /\*\*str_replace replacement:\*\*\s*\n/);
  if (!replacement) {
    throw new Error(`spec-parser: Fix ${fixIdStr} missing "**str_replace replacement:**" fenced block`);
  }

  return {
    fixId: fixIdStr,
    title,
    file,
    target,
    replacement,
    lineHint
  };
}

/**
 * Extract the first fenced code block (```...```) after a given heading pattern.
 * Handles bare ``` and language-tagged ```js / ```javascript.
 */
function _extractFencedBlock(section, headingPattern) {
  const headingMatch = section.match(headingPattern);
  if (!headingMatch) return null;
  const afterHeading = section.slice(headingMatch.index + headingMatch[0].length);

  // Match: optional language tag, then newline, then content, then closing ```.
  const fenceMatch = afterHeading.match(/^```[^\n]*\n([\s\S]*?)\n```/);
  if (!fenceMatch) return null;
  return fenceMatch[1];
}

module.exports = { parseFix };
