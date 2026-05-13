#!/usr/bin/env node

/**
 * spec-parser.js
 * Parses Wolf-format fix specs (OGZPMLV2-FIX-SPEC-BY-MODULE.md and similar).
 *
 * Purpose: --write flag needs deterministic, verbatim str_replace pairs
 * pulled directly from the spec doc — no Mercury re-derivation, nothing
 * for a prompt to bias.
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
 *   **str_replace target:**             (heading annotations like
 *   ```[lang]                            "target (BUY, lines 446-448)"
 *   <exact code to find>                 are tolerated)
 *   ```
 *
 *   **str_replace replacement:**
 *   ```[lang]
 *   <exact replacement>
 *   ```
 *
 *   (Optional additional target/replacement pairs for multi-site fixes
 *    like SHORT-side mirrors or related sister edits.)
 *
 *   **Verification:** ...
 *
 * Return shape (multi-block aware):
 *   {
 *     fixId: "4",
 *     title: "P2-E — null-symbol zombie trades",
 *     file: "core/StateManager.js",
 *     lineHint: "~408",
 *     edits: [
 *       { target: "<code>", replacement: "<code>" },   // primary
 *       { target: "<code>", replacement: "<code>" },   // additional (if present)
 *       ...
 *     ],
 *     // Backward-compat shortcuts to the first edit:
 *     target: edits[0].target,
 *     replacement: edits[0].replacement
 *   }
 *
 * Throws Error on:
 *   - spec file missing
 *   - "### Fix N:" section not found
 *   - "**File:** `...`" line missing
 *   - target/replacement count mismatch (unpaired blocks)
 *   - zero target blocks found
 */

const fs = require('fs');

/**
 * Parse a Fix N section out of a spec doc.
 *
 * @param {string} specPath - absolute path to the spec markdown file
 * @param {string|number} fixId - the Fix number to extract (e.g. 4 or "4")
 * @returns {object} { fixId, title, file, lineHint, edits[], target, replacement }
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

  // Find ALL target headings (with optional annotations like "target (BUY, lines 446-448)")
  // and ALL replacement headings, then pair them by appearance order.
  const targets = _extractAllFencedBlocks(section, /\*\*str_replace target[^*\n]*:\*\*\s*\n/g);
  const replacements = _extractAllFencedBlocks(section, /\*\*str_replace replacement[^*\n]*:\*\*\s*\n/g);

  if (targets.length === 0) {
    throw new Error(`spec-parser: Fix ${fixIdStr} has no "**str_replace target:**" fenced block`);
  }
  if (targets.length !== replacements.length) {
    throw new Error(
      `spec-parser: Fix ${fixIdStr} target/replacement count mismatch — ` +
      `${targets.length} target block(s) vs ${replacements.length} replacement block(s)`
    );
  }

  const edits = targets.map((target, i) => ({
    target,
    replacement: replacements[i]
  }));

  return {
    fixId: fixIdStr,
    title,
    file,
    lineHint,
    edits,
    // Backward-compat aliases for callers that read parsed.target / parsed.replacement
    target: edits[0].target,
    replacement: edits[0].replacement
  };
}

/**
 * Extract every fenced code block (```...```) that follows a matching heading
 * pattern in the given section. Pattern MUST have the `g` flag.
 */
function _extractAllFencedBlocks(section, headingPatternG) {
  const blocks = [];
  let match;
  // Reset lastIndex defensively in case the caller reuses the regex.
  headingPatternG.lastIndex = 0;
  while ((match = headingPatternG.exec(section)) !== null) {
    const afterHeading = section.slice(match.index + match[0].length);
    const fenceMatch = afterHeading.match(/^```[^\n]*\n([\s\S]*?)\n```/);
    if (fenceMatch) {
      blocks.push(fenceMatch[1]);
    }
  }
  return blocks;
}

module.exports = { parseFix };
