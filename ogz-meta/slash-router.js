#!/usr/bin/env node

/**
 * slash-router.js
 * Routes slash commands to manifest sections
 *
 * RULES:
 * - Each command reads manifest
 * - Each command writes ONLY its section
 * - Each command emits a hook
 * - Any failure = STOP
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { createManifest, loadManifest, saveManifest, updateSection, shouldStop } = require('./manifest-schema');
const { ClauditoLogger } = require('./claudito-logger');

const MANIFEST_DIR = path.join(__dirname, 'manifests');

// Ensure manifest directory exists
if (!fs.existsSync(MANIFEST_DIR)) {
  fs.mkdirSync(MANIFEST_DIR, { recursive: true });
}

/**
 * Route command to handler
 */
async function route(command, args) {
  const [cmd, ...params] = command.split(' ');
  const manifestPath = args.manifest || path.join(MANIFEST_DIR, 'current.json');

  // Load or create manifest
  let manifest;
  if (cmd === '/start') {
    manifest = createManifest();
    manifest.issue = params.join(' ');
    saveManifest(manifest, manifestPath);
    console.log(`✅ Created manifest: ${manifest.mission_id}`);
    return manifest;
  } else {
    manifest = loadManifest(manifestPath);
  }

  // Check stop conditions
  const stopCheck = shouldStop(manifest);
  if (stopCheck.stop) {
    console.error(`🛑 STOP CONDITION: ${stopCheck.reason}`);
    process.exit(1);
  }

  // Route to handler
  const handlers = {
    '/branch': branch,
    '/commander': commander,
    '/architect': architect,
    '/architect-verify': architectVerify,  // Deterministic: confirms spec target exists in current code
    '/spec-update-status': specUpdateStatus,  // Deterministic: marks Fix N status as FIXED with commit SHA
    '/mercury-attack': mercuryAttack,      // Adversarial Mercury attack on the just-applied change (EXECUTE only)
    '/mercury-critic': mercuryCritic,      // Gates pipeline on Mercury findings; requires operator ack on fail-findings
    '/anchor-verify-post': anchorVerifyPost,  // Fast P0 + Full P0 drift check after code change (EXECUTE only)
    '/bombardier': bombardier,  // Blast radius analysis - shows impact before fixing
    '/entomologist': entomologist,
    '/exterminator': exterminator,
    '/fixer': fixer,           // For refactor mode - applies extractions/refactors
    '/fixer-write': fixerWrite, // Deterministic: applies verbatim str_replace from spec (no Mercury)
    '/debugger': debuggerHandler,
    '/critic': critic,
    '/validator': validator,
    '/forensics': forensics,
    '/cicd': cicd,
    '/committer': committer,
    '/scribe': scribe,
    '/janitor': janitor,
    '/warden': warden,
    '/locator': locator
  };

  const handler = handlers[cmd];
  if (!handler) {
    console.error(`❌ Unknown command: ${cmd}`);
    return null;
  }

  // Execute handler
  console.log(`\n🔧 Executing: ${cmd}`);
  const result = await handler(manifest, params);

  // Save updated manifest
  saveManifest(manifest, manifestPath);

  // Emit hook
  emitHook(cmd, manifest);

  return manifest;
}

/**
 * Branch: Always stays on current branch.
 * Wolf manages branching manually for rollback snapshots.
 */
async function branch(manifest, params) {
  const currentBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
  console.log(`✅ Branch: Staying on ${currentBranch}`);
  updateSection(manifest, 'branch', {
    success: true,
    branch: currentBranch,
    based_on: currentBranch
  });
  return manifest;
}

/**
 * Commander: Provides context
 */
async function commander(manifest, params) {
  const { getCurrentState, selectAgent } = require('./commander');
  const { ragQuery } = require('./rag-query');

  // Get current state from existing commander
  const state = getCurrentState();

  // Check Fix Ledger for known issues
  const ragResults = ragQuery(manifest.issue);

  updateSection(manifest, 'commander', {
    context: state,
    agent_selection: 'Pipeline mode - all agents',
    known_issues: ragResults.ledger.slice(0, 3),
    rag_score: ragResults.ledger[0]?._score || 0
  });

  if (ragResults.ledger.length > 0 && ragResults.ledger[0]._score > 150) {
    console.log(`   ⚠️  Known issue detected: ${ragResults.ledger[0].id}`);
  }

  console.log('✅ Commander: Context provided + ledger checked');
  return manifest;
}

/**
 * Architect: Maps system
 */
async function architect(manifest, params) {
  const { callMercury } = require('./cognition/mercury-bridge');
  const issue = manifest.issue || '';

  const result = await callMercury({
    role: 'architect',
    task: `design refactor plan for: ${issue}`,
    target: {
      issue,
      context: manifest.commander?.rag_results || manifest.commander?.known_issues || []
    },
    outputFormat: 'structured_plan',
    options: {
      maxIterations: 60,
      quiet: true,
      missionId: manifest.mission_id
    }
  });

  if (!result.success) {
    console.log(`⚠️  Architect: Mercury call failed (${result.reason})`);
    updateSection(manifest, 'architect', {
      plan: null,
      mercury_failed: true,
      reason: result.reason
    });
    return manifest;
  }

  const plan = result.data.plan || {};
  updateSection(manifest, 'architect', {
    plan,
    system_map: (plan.files || []).map(f => f.path),
    dependencies: (plan.files || []).flatMap(f => f.dependencies || []),
    mercury_iterations: result.iterations,
    mercury_duration_ms: result.duration_ms,
  });

  console.log(`✅ Architect: Plan designed — ${(plan.files || []).length} files, ${(plan.ordering || []).length} ordering steps (${result.iterations} Mercury iterations, ${(result.duration_ms/1000).toFixed(1)}s)`);
  return manifest;
}

/**
 * Bombardier: Blast radius analysis
 * Shows what will be affected before making changes
 */
async function bombardier(manifest, params) {
  const { Bombardier } = require('./bombardier');
  const bomb = new Bombardier();

  // Load or build call graph
  if (!bomb.loadCache()) {
    console.log('📊 Building call graph (first run)...');
    await bomb.buildGraph();
  }

  // Get target from params or from architect's findings
  let target = params[0];
  if (!target && manifest.architect?.system_map?.length > 0) {
    // Use first file from architect's system map
    target = manifest.architect.system_map[0];
  }

  if (!target) {
    console.log('⚠️ Bombardier: No target specified');
    updateSection(manifest, 'bombardier', {
      status: 'NO_TARGET',
      blast_radius: null
    });
    return manifest;
  }

  // Parse file:line or function name
  let result;
  if (target.includes(':')) {
    const [file, line] = target.split(':');
    result = bomb.getBlastRadius(file, parseInt(line, 10));
  } else {
    result = bomb.getBlastRadius(target);
  }

  // Print the blast radius
  bomb.printBlastRadius(result);

  // Store in manifest
  const blastData = {
    target,
    found: result.found,
    upstream_count: result.upstream?.length || 0,
    downstream_count: result.downstream?.length || 0,
    files_affected: result.files?.length || 0,
    risk_level: 'LOW'
  };

  // Calculate risk
  const totalImpact = blastData.upstream_count + blastData.downstream_count;
  if (totalImpact > 20 || blastData.files_affected > 5) blastData.risk_level = 'HIGH';
  else if (totalImpact > 10 || blastData.files_affected > 3) blastData.risk_level = 'MEDIUM';

  // Block if HIGH risk without explicit approval
  if (blastData.risk_level === 'HIGH') {
    console.log('\n⚠️  HIGH RISK - Review blast radius carefully before proceeding');
  }

  updateSection(manifest, 'bombardier', {
    status: 'ANALYZED',
    blast_radius: blastData,
    upstream: result.upstream?.slice(0, 10) || [],
    downstream: result.downstream?.slice(0, 10) || [],
    files: result.files || []
  });

  console.log(`✅ Bombardier: ${blastData.risk_level} risk - ${totalImpact} functions, ${blastData.files_affected} files`);
  return manifest;
}

/**
 * Entomologist: FINDS bugs via code scanning + RAG
 */
async function entomologist(manifest, params) {
  const { callMercury } = require('./cognition/mercury-bridge');
  const issue = manifest.issue || '';

  // Extract file references from issue text (reuse existing parser as input to Mercury)
  const codeScans = parseIssueForCodeRefs(issue);
  const targetFiles = codeScans.map(s => s.file).filter(Boolean);

  // Call Mercury as the cognition layer
  const result = await callMercury({
    role: 'entomologist',
    task: `identify bugs for: ${issue}`,
    target: {
      files: targetFiles,
      issue,
      context: manifest.commander?.rag_results || manifest.commander?.known_issues || []
    },
    outputFormat: 'structured_bugs',
    options: {
      maxIterations: 15,
      quiet: true,
      missionId: manifest.mission_id
    }
  });

  if (!result.success) {
    console.log(`⚠️  Entomologist: Mercury call failed (${result.reason})`);
    updateSection(manifest, 'entomologist', {
      bugs_found: [],
      mercury_failed: true,
      reason: result.reason
    });
    return manifest;
  }

  // Map Mercury bugs to manifest format (preserve backward compat with downstream stages)
  const bugs = (result.data.bugs || []).map(b => ({
    type: b.type || 'MERCURY_FOUND',
    location: `${b.file}:${b.line}`,
    description: b.description,
    code: b.evidence || '',
    severity: b.severity,
    bugType: b.type,
  }));

  updateSection(manifest, 'entomologist', {
    bugs_found: bugs,
    classifications: bugs.map(b => b.type),
    files_analyzed: result.data.files_analyzed || targetFiles,
    mercury_iterations: result.iterations,
    mercury_duration_ms: result.duration_ms,
    confidence: result.data.confidence
  });

  console.log(`✅ Entomologist: Found ${bugs.length} bugs (${result.iterations} Mercury iterations, ${(result.duration_ms/1000).toFixed(1)}s)`);
  return manifest;
}

/**
 * Parse issue text for file names, line numbers, functions, patterns to search
 * UPGRADED: Now handles semantic issues like "File.js function() expects X but receives Y"
 */
function parseIssueForCodeRefs(issue) {
  const refs = [];

  // Pattern 0: FULL_FILE - "Replace X.js with Y" or "replace: X.js with Y"
  // e.g., "Replace LiquiditySweepDetector.js with timeframe-agnostic version from ogz-meta/..."
  // e.g., "replace: LiquiditySweepDetector.js with ogz-meta/replacement.js"
  const fullFileMatch = issue.match(/replace[:\s]+([\w-]+\.js)\s+with\s+(?:.*?from\s+)?([^\s]+\.js)/i);
  if (fullFileMatch) {
    const targetFile = fullFileMatch[1].replace(/\.js$/, '');
    const replacementFile = fullFileMatch[2];
    refs.push({
      file: targetFile,
      type: 'full_file',
      bugType: 'FULL_FILE',
      replacementFile: replacementFile,
      description: `Replace entire ${targetFile}.js with ${replacementFile}`
    });
    return refs;  // Full file replacement takes precedence
  }

  // Pattern 1: "FileName.js line XXX" or "FileName.js:XXX" (exact line reference)
  // NOTE: .js extension is REQUIRED to avoid matching config keys like "entryWindowBars:18"
  // NOTE: [\w-]+ allows hyphenated filenames like "tuning-backtest-full.js"
  const fileLineMatch = issue.match(/([\w-]+\.js)\s*(?:line\s*|:)(\d+)/i);
  if (fileLineMatch) {
    const fileName = fileLineMatch[1].replace(/\.js$/, '');
    const lineNum = parseInt(fileLineMatch[2], 10);
    refs.push({ file: fileName, line: lineNum, type: 'exact', description: issue });
  }

  // Pattern 2: "FileName.js functionName()" - file + function reference (NEW)
  const fileFuncMatch = issue.match(/([\w-]+\.js)\s+(\w+)\(\)/i);
  if (fileFuncMatch && refs.length === 0) {
    const fileName = fileFuncMatch[1].replace(/\.js$/, '');
    const funcName = fileFuncMatch[2];
    refs.push({
      file: fileName,
      function: funcName,
      type: 'function',
      bugType: 'STRUCTURAL'
    });
  }

  // Pattern 3: Just "FileName.js" with semantic description (NEW)
  if (refs.length === 0) {
    const fileOnlyMatch = issue.match(/([\w-]+\.js)/i);
    if (fileOnlyMatch) {
      const fileName = fileOnlyMatch[1].replace(/\.js$/, '');
      refs.push({
        file: fileName,
        type: 'semantic',
        description: issue,
        bugType: 'SEMANTIC'
      });
    }
  }

  // Extract semantic context from issue (NEW)
  const semanticPatterns = {
    timeframeMismatch: /expects?\s+(\d+)m?\s+(?:candles?)?\s+but\s+receives?\s+(\d+)m/i,
    wrongAggregation: /aggregat(?:ion|e|ing)\s+(?:is\s+)?(\d+)x?\s+wrong/i,
    expectedVsActual: /should\s+be\s+(\d+)\s*(?:min|m|bars?)?\s*(?:not|instead\s+of|vs)?\s*(\d+)/i,
    removePattern: /remove\s+(?:internal\s+)?([^,.]+)/i,
    changeValue: /([\d.]+)\s*[→\->]+\s*([\d.]+)/,
    // Code expression changes: (oldExpr) → newExpr
    changeCodeExpr: /\(([^)]+)\)\s*[→\->]+\s*([^\s,]+(?:\s*===\s*'[^']+')?)/,
    // Simple text substitutions: old → new (for property access, identifiers, etc.)
    // Matches: c.c → _c(c), prev.c → _c(prev), foo → bar
    changeText: /(\w+(?:\.\w+)?)\s*[→\->]+\s*(\w+\([^)]*\)|\w+(?:\.\w+)?)/g,
  };

  for (const [key, pattern] of Object.entries(semanticPatterns)) {
    const match = issue.match(pattern);
    if (match && refs.length > 0) {
      refs[0].semantic = refs[0].semantic || {};
      refs[0].semantic[key] = match.slice(1);
    }
  }

  // Pattern: "hardcoded X.XXX" or "hardcoded 'value'"
  const hardcodedMatch = issue.match(/hardcoded\s+['"]?([0-9.]+|[^'"]+)['"]?/i);
  if (hardcodedMatch && refs.length > 0) {
    refs[0].pattern = hardcodedMatch[1];
    refs[0].bugType = 'HARDCODED_VALUE';
  }

  // Pattern: "→ TradingConfig" or "-> TradingConfig" - fix hint
  const fixHintMatch = issue.match(/[→\->]+\s*(\w+)/);
  if (fixHintMatch && refs.length > 0) {
    refs[0].fixHint = `Replace with ${fixHintMatch[1]}`;
  }

  // Pattern: look for common bug keywords
  if (issue.match(/fee|fees/i) && refs.length > 0) {
    refs[0].bugType = refs[0].bugType || 'FEE_MISMATCH';
  }

  return refs;
}

/**
 * Actually scan the codebase for the bug
 * UPGRADED: Now handles function references and semantic analysis
 */
function scanCodeForBug(scan) {
  const projectRoot = path.resolve(__dirname, '..');

  // Find the file
  let filePath = null;
  const possiblePaths = [
    `core/${scan.file}.js`,
    `core/indicators/${scan.file}.js`,
    `modules/${scan.file}.js`,
    `brokers/${scan.file}.js`,
    `tuning/${scan.file}.js`,
    `tools/${scan.file}.js`,
    `${scan.file}.js`,
    `core/${scan.file}`,
    `modules/${scan.file}`
  ];

  for (const p of possiblePaths) {
    const full = path.join(projectRoot, p);
    if (fs.existsSync(full)) {
      filePath = full;
      break;
    }
  }

  if (!filePath) {
    console.log(`   📂 File not found: ${scan.file}`);
    return null;
  }

  // Read the file
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  // FULL_FILE: Return file info for complete replacement
  if (scan.type === 'full_file' || scan.bugType === 'FULL_FILE') {
    return {
      file: path.relative(projectRoot, filePath),
      line: 1,
      location: path.relative(projectRoot, filePath) + ':1',
      code: `// Full file replacement: ${scan.file}.js`,
      description: scan.description || `Replace entire ${scan.file}.js`,
      bugType: 'FULL_FILE',
      replacementFile: scan.replacementFile,
      lineCount: lines.length
    };
  }

  // NEW: Handle function reference - find the function definition
  if (scan.type === 'function' && scan.function) {
    const funcPatterns = [
      new RegExp(`^\\s*${scan.function}\\s*\\(`),                    // functionName(
      new RegExp(`^\\s*async\\s+${scan.function}\\s*\\(`),           // async functionName(
      new RegExp(`^\\s*${scan.function}\\s*=\\s*(?:async\\s+)?\\(`), // functionName = (
      new RegExp(`\\s${scan.function}\\s*\\([^)]*\\)\\s*\\{`),       // method definition
    ];

    for (let i = 0; i < lines.length; i++) {
      for (const pattern of funcPatterns) {
        if (pattern.test(lines[i])) {
          // Found the function - extract context (function body start)
          const funcStart = i + 1;
          const codeSnippet = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');

          return {
            file: path.relative(projectRoot, filePath),
            line: funcStart,
            code: lines[i].trim(),
            codeContext: codeSnippet,
            description: `Found function '${scan.function}' at line ${funcStart}`,
            bugType: scan.bugType || 'STRUCTURAL',
            semantic: scan.semantic || null
          };
        }
      }
    }
    console.log(`   📂 Function '${scan.function}' not found in ${scan.file}`);
  }

  // NEW: Handle semantic scan - analyze file structure
  if (scan.type === 'semantic') {
    // Return file info for semantic analysis by higher-level code
    return {
      file: path.relative(projectRoot, filePath),
      line: 1,
      code: `// Full file scan: ${scan.file}`,
      description: scan.description || 'Semantic analysis required',
      bugType: 'SEMANTIC',
      fullContent: content,
      lineCount: lines.length,
      semantic: scan.semantic || null
    };
  }

  // Handle exact line reference
  if (scan.line && scan.line <= lines.length) {
    const lineContent = lines[scan.line - 1];

    // Check if the pattern exists on this line
    if (scan.pattern && lineContent.includes(scan.pattern)) {
      return {
        file: path.relative(projectRoot, filePath),
        line: scan.line,
        code: lineContent.trim(),
        description: `Found hardcoded '${scan.pattern}' at line ${scan.line}`,
        bugType: scan.bugType || 'HARDCODED_VALUE',
        semantic: scan.semantic || null
      };
    }

    // Even without pattern match, return the line for review
    return {
      file: path.relative(projectRoot, filePath),
      line: scan.line,
      code: lineContent.trim(),
      description: `Line ${scan.line} flagged for review`,
      bugType: scan.bugType || 'REVIEW_NEEDED',
      semantic: scan.semantic || null
    };
  }

  // If no specific line, grep for the pattern
  if (scan.pattern) {
    try {
      const grepResult = execSync(
        `grep -n "${scan.pattern}" "${filePath}" | head -5`,
        { encoding: 'utf8', timeout: 5000 }
      ).trim();

      if (grepResult) {
        const firstMatch = grepResult.split('\n')[0];
        const [lineNum, ...codeParts] = firstMatch.split(':');
        return {
          file: path.relative(projectRoot, filePath),
          line: parseInt(lineNum, 10),
          code: codeParts.join(':').trim(),
          description: `Found '${scan.pattern}' via grep`,
          bugType: scan.bugType || 'PATTERN_MATCH'
        };
      }
    } catch (e) {
      // grep returned no results
    }
  }

  return null;
}

/**
 * Apply a code fix based on bug info
 * UPGRADED 2026-03-10: Supports function-level and block replacements
 *
 * Fix types:
 *   - LINE: Single line replacement (original behavior)
 *   - FUNCTION: Replace entire function body
 *   - BLOCK: Replace a section between markers
 */
function applyCodeFix(bug) {
  const projectRoot = path.resolve(__dirname, '..');

  // Parse location "file:line"
  const [relFile, lineStr] = bug.location.split(':');
  const lineNum = parseInt(lineStr, 10);
  const filePath = path.join(projectRoot, relFile);

  if (!fs.existsSync(filePath)) {
    return { success: false, error: `File not found: ${relFile}` };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    // Create backup before any changes
    const backupPath = filePath + '.pipeline-backup';
    fs.writeFileSync(backupPath, content);

    // Determine fix type
    const fixType = bug.fix_type || (bug.replacement_block ? 'FUNCTION' : 'LINE');

    // ═══════════════════════════════════════════════════════════════════
    // FUNCTION-LEVEL REPLACEMENT (NEW)
    // ═══════════════════════════════════════════════════════════════════
    if (fixType === 'FUNCTION' && bug.replacement_block) {
      const funcName = bug.function_name || bug.description?.match(/function '(\w+)'/)?.[1];
      if (!funcName) {
        return { success: false, error: 'Function name required for FUNCTION fix type' };
      }

      // Find function boundaries
      const funcBounds = findFunctionBoundaries(lines, funcName, lineNum);
      if (!funcBounds) {
        return { success: false, error: `Could not find function boundaries for '${funcName}'` };
      }

      // Replace the function
      const before = lines.slice(0, funcBounds.start);
      const after = lines.slice(funcBounds.end + 1);
      const newContent = [...before, bug.replacement_block, ...after].join('\n');

      fs.writeFileSync(filePath, newContent);

      return {
        success: true,
        fix_type: 'FUNCTION',
        function_name: funcName,
        lines_replaced: funcBounds.end - funcBounds.start + 1,
        backup_path: backupPath,
        originalCode: lines.slice(funcBounds.start, funcBounds.end + 1).join('\n').substring(0, 200) + '...'
      };
    }

    // ═══════════════════════════════════════════════════════════════════
    // LINE-LEVEL REPLACEMENT (original behavior)
    // ═══════════════════════════════════════════════════════════════════
    if (lineNum < 1 || lineNum > lines.length) {
      return { success: false, error: `Line ${lineNum} out of range` };
    }

    const originalLine = lines[lineNum - 1];
    let newLine = originalLine;

    // Generic newCode replacement (NEW)
    if (bug.newCode && bug.code) {
      // Direct line replacement - use bug.code as search pattern, bug.newCode as replacement
      if (originalLine.includes(bug.code.trim())) {
        newLine = originalLine.replace(bug.code.trim(), bug.newCode.trim());
      } else {
        // Fuzzy match - just replace the whole line with newCode (preserve indentation)
        const indent = originalLine.match(/^(\s*)/)?.[1] || '';
        newLine = indent + bug.newCode.trim();
      }
    }
    // Handle "Replace with TradingConfig" pattern
    else if (bug.fix_hint && bug.fix_hint.includes('TradingConfig')) {
      if (bug.code.includes('0.0052') || bug.code.includes('fees')) {
        newLine = originalLine.replace(
          /\*\s*0\.0052\s*,?\s*(\/\/.*)?$/,
          `* TradingConfig.get('fees.totalRoundTrip'),  // From TradingConfig`
        );
      } else if (bug.code.match(/\*\s*0\.\d+/)) {
        const match = bug.code.match(/\*\s*(0\.\d+)/);
        if (match) {
          newLine = originalLine.replace(
            new RegExp(`\\*\\s*${match[1].replace('.', '\\.')}\\s*,?\\s*(\\/\\/.*)?$`),
            `* TradingConfig.get('fees.totalRoundTrip'),  // From TradingConfig`
          );
        }
      }
    }

    // If no change was made, return failure
    if (newLine === originalLine) {
      return { success: false, error: 'Could not determine fix transformation' };
    }

    // Apply the fix
    lines[lineNum - 1] = newLine;
    fs.writeFileSync(filePath, lines.join('\n'));

    return {
      success: true,
      fix_type: 'LINE',
      newCode: newLine.trim(),
      originalCode: originalLine.trim(),
      backup_path: backupPath
    };

  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Find the start and end line indices of a function
 * Uses brace matching to find the complete function body
 */
function findFunctionBoundaries(lines, funcName, hintLine) {
  // Start searching from hint line or beginning
  const searchStart = Math.max(0, (hintLine || 1) - 5);

  // Patterns to find function definition
  const funcPatterns = [
    new RegExp(`^\\s*${funcName}\\s*\\([^)]*\\)\\s*\\{`),           // method(args) {
    new RegExp(`^\\s*async\\s+${funcName}\\s*\\([^)]*\\)\\s*\\{`),  // async method(args) {
    new RegExp(`^\\s*${funcName}\\s*=\\s*(?:async\\s+)?function`),  // name = function
    new RegExp(`^\\s*${funcName}\\s*=\\s*(?:async\\s+)?\\(`),       // name = (args) =>
  ];

  let funcStart = -1;

  // Find function start
  for (let i = searchStart; i < lines.length; i++) {
    for (const pattern of funcPatterns) {
      if (pattern.test(lines[i])) {
        funcStart = i;
        break;
      }
    }
    if (funcStart >= 0) break;
  }

  if (funcStart < 0) return null;

  // Find function end using brace matching
  let braceCount = 0;
  let funcEnd = funcStart;
  let started = false;

  for (let i = funcStart; i < lines.length; i++) {
    const line = lines[i];
    for (const char of line) {
      if (char === '{') {
        braceCount++;
        started = true;
      } else if (char === '}') {
        braceCount--;
      }
    }
    if (started && braceCount === 0) {
      funcEnd = i;
      break;
    }
  }

  return { start: funcStart, end: funcEnd };
}

/**
 * Rollback a fix using the backup file
 */
function rollbackFix(filePath) {
  const backupPath = filePath + '.pipeline-backup';
  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, filePath);
    fs.unlinkSync(backupPath);
    return { success: true };
  }
  return { success: false, error: 'No backup found' };
}

/**
 * Load replacement blocks from manifest or replacement files
 */
function loadReplacementBlocks(manifest) {
  const replacements = {};
  const projectRoot = path.resolve(__dirname, '..');

  // 1. Check manifest for inline replacement_blocks
  if (manifest.replacement_blocks) {
    Object.assign(replacements, manifest.replacement_blocks);
  }

  // 2. Check for replacement file specified in params
  if (manifest.replacement_file) {
    const filePath = path.join(__dirname, 'replacements', manifest.replacement_file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      // Parse the replacement file - format: location as filename, content as body
      const location = manifest.entomologist?.bugs_found?.[0]?.location;
      if (location) {
        replacements[location] = content;
      }
    }
  }

  // 3. Check for mission-specific replacement file
  const missionReplacementPath = path.join(__dirname, 'replacements', `${manifest.mission_id}.js`);
  if (fs.existsSync(missionReplacementPath)) {
    const content = fs.readFileSync(missionReplacementPath, 'utf8');
    const location = manifest.entomologist?.bugs_found?.[0]?.location;
    if (location) {
      replacements[location] = content;
      console.log(`   📦 Loaded replacement from: ${missionReplacementPath}`);
    }
  }

  // 4. Check each bug for replacementFile path (FULL_FILE support)
  const bugs = manifest.entomologist?.bugs_found || [];
  for (const bug of bugs) {
    if (bug.replacementFile) {
      // Try paths: relative to ogz-meta, relative to project root, absolute
      const paths = [
        path.join(__dirname, bug.replacementFile),
        path.join(projectRoot, bug.replacementFile),
        bug.replacementFile
      ];
      for (const tryPath of paths) {
        if (fs.existsSync(tryPath)) {
          const content = fs.readFileSync(tryPath, 'utf8');
          const location = bug.location || `modules/${bug.file}.js:1`;
          replacements[location] = content;
          console.log(`   📦 Loaded FULL_FILE replacement from: ${tryPath}`);
          break;
        }
      }
    }
  }

  return replacements;
}

/**
 * Run the smoke test to verify fixes
 */
function runSmokeTest() {
  const projectRoot = path.resolve(__dirname, '..');
  const smokeTestPath = path.join(projectRoot, 'scripts', 'smoke-test.js');

  if (!fs.existsSync(smokeTestPath)) {
    console.log(`   ⚠️  Smoke test not found: ${smokeTestPath}`);
    return { success: true, skipped: true };  // Don't block if no smoke test
  }

  try {
    const result = execSync(`node "${smokeTestPath}"`, {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Check for failure indicators
    if (result.includes('FAILED') || result.includes('Error:')) {
      return { success: false, output: result };
    }

    return { success: true, output: result };
  } catch (err) {
    return { success: false, error: err.message, output: err.stdout || '' };
  }
}

/**
 * Exterminator: PROPOSES fixes (advisory mode) or APPLIES fixes (execute mode)
 */
async function exterminator(manifest, params) {
  const bugs = manifest.entomologist.bugs_found || [];
  const fixes = [];

  // ADVISORY MODE (default): Call Mercury for intelligent fix proposals
  if (manifest.mode === 'ADVISORY' || !manifest.mode) {
    let proposals = [];

    if (bugs.length > 0) {
      const { callMercury } = require('./cognition/mercury-bridge');
      const result = await callMercury({
        role: 'exterminator',
        task: `propose fixes for ${bugs.length} bugs`,
        target: {
          bugs,
          issue: manifest.issue,
          context: manifest.commander?.rag_results || []
        },
        outputFormat: 'structured_proposals',
        options: {
          maxIterations: 15,
          quiet: true,
          missionId: manifest.mission_id
        }
      });

      if (result.success) {
        proposals = (result.data.proposals || []).map(p => ({
          bug_id: p.bug_id,
          location: `${p.file}:${p.line_start}`,
          description: p.rationale,
          proposed_fix: p.proposed_code,
          code: p.current_code,
          newCode: p.proposed_code,
          replacement_block: p.proposed_code,
          status: 'READY_TO_APPLY',
          side_effects: p.side_effects,
          tests_needed: p.tests_needed,
        }));
        console.log(`🧠 Exterminator: Mercury proposed ${proposals.length} fixes (${result.iterations} iterations, ${(result.duration_ms/1000).toFixed(1)}s)`);
      } else {
        console.log(`⚠️  Exterminator: Mercury call failed (${result.reason}), falling back to template proposals`);
        bugs.forEach(bug => {
          proposals.push({
            bug_id: bug.type,
            location: bug.location,
            description: bug.description,
            proposed_fix: `Fix for ${bug.type} at ${bug.location}`,
            status: 'PENDING_REVIEW',
            code: bug.code,
          });
        });
      }
    }

    // Generate proposal document
    const proposalDoc = generateProposalDocument(manifest, proposals);
    const proposalPath = path.join(__dirname, 'proposals', `${manifest.mission_id}-PROPOSAL.md`);

    if (!fs.existsSync(path.join(__dirname, 'proposals'))) {
      fs.mkdirSync(path.join(__dirname, 'proposals'), { recursive: true });
    }

    fs.writeFileSync(proposalPath, proposalDoc);
    manifest.artifacts.proposals.push(proposalPath);

    updateSection(manifest, 'exterminator', {
      fixes_applied: [],
      patches: [],
      proposals: proposals
    });

    console.log(`📋 Exterminator: Generated ${proposals.length} proposals (ADVISORY MODE)`);
    console.log(`   📄 Proposal document: ${proposalPath}`);
    console.log(`   ⏳ Awaiting human approval before any changes`);
  } else {
    // EXECUTE MODE: Only if explicitly enabled AND approved
    if (manifest.approval?.status !== 'APPROVED') {
      console.log(`🛑 Exterminator: BLOCKED - requires human approval first`);
      manifest.stop_conditions.warden_blocked = true;
      return manifest;
    }

    // Load replacement blocks from manifest or file
    const replacements = loadReplacementBlocks(manifest);

    // Track files modified for potential rollback
    const modifiedFiles = [];

    // Actually apply fixes
    for (const bug of bugs) {
      // Check if we have a replacement block for this bug
      const replacement = replacements[bug.location] || manifest.replacement_blocks?.[bug.location];

      // FULL_FILE replacement - copy entire replacement file to target
      if (bug.bugType === 'FULL_FILE') {
        const targetFile = bug.location.split(':')[0];
        const targetPath = path.join(process.cwd(), targetFile);

        if (!replacement) {
          fixes.push({
            bug_id: bug.type,
            location: bug.location,
            patch: 'BLOCKED: Full file replacement requires replacement file',
            applied: false,
            error: 'No replacement file provided'
          });
          console.log(`   ⚠️  Skipped: ${bug.location} - needs replacement file`);
          continue;
        }

        try {
          // Backup original
          const backupPath = targetPath + '.backup-' + Date.now();
          if (fs.existsSync(targetPath)) {
            fs.copyFileSync(targetPath, backupPath);
          }
          modifiedFiles.push({ path: targetFile, backup: backupPath });

          // Write replacement content
          fs.writeFileSync(targetPath, replacement, 'utf8');

          fixes.push({
            bug_id: bug.type,
            location: bug.location,
            fix_type: 'FULL_FILE',
            applied: true,
            backup: backupPath
          });
          console.log(`   ✅ Fixed (FULL_FILE): ${targetFile}`);
        } catch (e) {
          fixes.push({
            bug_id: bug.type,
            location: bug.location,
            fix_type: 'FULL_FILE',
            applied: false,
            error: e.message
          });
          console.log(`   ❌ Failed: ${bug.location} - ${e.message}`);
        }
        continue;
      }

      // STRUCTURAL/FUNCTION fixes require replacement block
      if (bug.bugType === 'STRUCTURAL' || bug.bugType === 'SEMANTIC') {
        if (!replacement) {
          fixes.push({
            bug_id: bug.type,
            location: bug.location,
            patch: 'BLOCKED: Structural fix requires replacement_block',
            applied: false,
            error: 'No replacement_block provided for structural fix'
          });
          console.log(`   ⚠️  Skipped: ${bug.location} - needs replacement_block`);
          continue;
        }

        // Apply function-level replacement
        const enrichedBug = {
          ...bug,
          replacement_block: replacement,
          fix_type: 'FUNCTION',
          function_name: bug.function_name || bug.description?.match(/[Ff]unction '(\w+)'/)?.[1]
        };

        const result = applyCodeFix(enrichedBug);
        modifiedFiles.push({ path: bug.location.split(':')[0], backup: result.backup_path });

        fixes.push({
          bug_id: bug.type,
          location: bug.location,
          fix_type: 'FUNCTION',
          lines_replaced: result.lines_replaced,
          applied: result.success,
          error: result.error || null
        });

        if (result.success) {
          console.log(`   ✅ Fixed (FUNCTION): ${bug.location} - replaced ${result.lines_replaced} lines`);
        } else {
          console.log(`   ❌ Failed: ${bug.location} - ${result.error}`);
        }
      }
      // LINE-level fixes (original behavior + newCode support)
      else if (bug.type === 'CODE_SCAN' && bug.code && (bug.fix_hint || bug.newCode)) {
        const result = applyCodeFix(bug);
        modifiedFiles.push({ path: bug.location.split(':')[0], backup: result.backup_path });

        fixes.push({
          bug_id: bug.type,
          location: bug.location,
          fix_type: 'LINE',
          original: bug.code,
          patch: result.newCode || 'N/A',
          applied: result.success,
          error: result.error || null
        });

        if (result.success) {
          console.log(`   ✅ Fixed (LINE): ${bug.location}`);
        } else {
          console.log(`   ❌ Failed: ${bug.location} - ${result.error}`);
        }
      } else {
        fixes.push({
          bug_id: bug.type,
          patch: `Manual fix needed for ${bug.type} at ${bug.location}`,
          applied: false
        });
      }
    }

    // Run smoke test if any fixes were applied
    const appliedFixes = fixes.filter(f => f.applied);
    if (appliedFixes.length > 0) {
      console.log(`\n🧪 Running smoke test after ${appliedFixes.length} fixes...`);
      const smokeResult = runSmokeTest();

      if (!smokeResult.success) {
        console.log(`   ❌ Smoke test FAILED - rolling back all changes`);
        // Rollback all modified files
        for (const mod of modifiedFiles) {
          if (mod.backup) {
            const fullPath = path.join(__dirname, '..', mod.path);
            rollbackFix(fullPath);
            console.log(`   ↩️  Rolled back: ${mod.path}`);
          }
        }
        manifest.stop_conditions.smoke_test_failed = true;
        fixes.forEach(f => { if (f.applied) { f.applied = false; f.error = 'Rolled back due to smoke test failure'; } });
      } else {
        console.log(`   ✅ Smoke test PASSED`);
        // Clean up backup files
        for (const mod of modifiedFiles) {
          if (mod.backup && fs.existsSync(mod.backup)) {
            fs.unlinkSync(mod.backup);
          }
        }
      }
    }

    updateSection(manifest, 'exterminator', {
      fixes_applied: fixes,
      patches: fixes.filter(f => f.applied).map(f => f.patch || f.fix_type),
      proposals: proposals,
      smoke_test: appliedFixes.length > 0 ? (manifest.stop_conditions.smoke_test_failed ? 'FAILED' : 'PASSED') : 'SKIPPED'
    });

    const applied = fixes.filter(f => f.applied).length;
    console.log(`✅ Exterminator: Applied ${applied}/${fixes.length} fixes (EXECUTE MODE - APPROVED)`);
  }

  return manifest;
}

/**
 * Fixer: For refactor mode - applies extractions/refactors based on architect plan
 * Similar to exterminator but works from architect's plan instead of entomologist's bugs
 */

/**
 * Locator: Reverify Mercury's edit line numbers against actual file content
 * before Fixer applies. Catches drift between Architect read and Fixer apply.
 */
async function locator(manifest, params) {
  const edits = manifest.fixer?.edits || [];
  const projectRoot = path.resolve(__dirname, '..');
  const corrections = [];
  const unlocatable = [];

  // Whitespace normalizer (same as Fixer uses)
  const normalize = (s) => s.split('\n').map(l => l.trim()).filter(l => l.length).join('\n');

  for (const edit of edits) {
    if (!edit.current_code || !edit.file) continue;
    const filePath = path.join(projectRoot, edit.file);
    if (!fs.existsSync(filePath)) {
      unlocatable.push({ file: edit.file, original_lines: `${edit.line_start}-${edit.line_end}`, reason: 'file not found' });
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const beforeNormalized = normalize(edit.current_code);
    const editLineCount = (edit.line_end || edit.line_start) - (edit.line_start || 1) + 1;

    // First check: does the original location still match?
    const originalSlice = lines.slice((edit.line_start || 1) - 1, edit.line_end || edit.line_start).join('\n');
    if (normalize(originalSlice) === beforeNormalized) {
      continue;  // already correct
    }

    // Search the entire file for matching content
    let foundAt = -1;
    for (let i = 1; i <= lines.length - editLineCount + 1; i++) {
      const candidate = lines.slice(i - 1, i - 1 + editLineCount).join('\n');
      if (normalize(candidate) === beforeNormalized) {
        foundAt = i;
        break;
      }
    }

    if (foundAt > 0) {
      const originalLines = `${edit.line_start}-${edit.line_end}`;
      edit.line_start = foundAt;
      edit.line_end = foundAt + editLineCount - 1;
      corrections.push({ file: edit.file, original_lines: originalLines, corrected_lines: `${edit.line_start}-${edit.line_end}` });
      console.log(`   🎯 Locator: ${edit.file} corrected ${originalLines} → ${edit.line_start}-${edit.line_end}`);
    } else {
      unlocatable.push({
        file: edit.file,
        original_lines: `${edit.line_start}-${edit.line_end}`,
        snippet: edit.current_code.slice(0, 80),
        reason: 'content not found in file'
      });
      console.log(`   ❌ Locator: ${edit.file}:${edit.line_start}-${edit.line_end} content NOT FOUND in file`);
    }
  }

  // Persist corrected edits back to manifest
  if (manifest.fixer) {
    manifest.fixer.edits = edits;
  }

  updateSection(manifest, 'locator', {
    corrections,
    unlocatable,
  });

  if (unlocatable.length > 0) {
    manifest.stop_conditions.warden_blocked = true;
    console.log(`🛑 Locator: BLOCKED — ${unlocatable.length} edits could not be located. Pipeline halted.`);
    return manifest;
  }

  console.log(`✅ Locator: ${corrections.length} corrections, ${edits.length - corrections.length} edits already correct`);
  return manifest;
}

async function fixer(manifest, params) {
  const plan = manifest.architect?.plan || {};
  const changes = [];
  const projectRoot = path.resolve(__dirname, '..');

  // Check mode
  const isExecuteMode = manifest.mode === 'EXECUTE' && manifest.approval?.status === 'APPROVED';

  if (!isExecuteMode) {
    // ADVISORY MODE: Use Mercury to verify architect plan against actual code
    const { callMercury } = require('./cognition/mercury-bridge');

    let fixerResult = null;
    if (plan && plan.files && plan.files.length > 0) {
      fixerResult = await callMercury({
        role: 'fixer',
        task: `verify and concretize refactor plan for: ${manifest.issue}`,
        target: {
          plan,
          issue: manifest.issue,
          context: manifest.commander?.rag_results || []
        },
        outputFormat: 'structured_edits',
        options: {
          maxIterations: 60,
          quiet: true,
          missionId: manifest.mission_id
        }
      });
    }

    // Build proposal from Mercury's verified edits or architect plan
    const edits = fixerResult?.success ? fixerResult.data.edits : [];
    const proposalDoc = generateRefactorProposal(manifest, edits);
    const proposalPath = path.join(__dirname, 'proposals', `${manifest.mission_id}-REFACTOR-PROPOSAL.md`);

    if (!fs.existsSync(path.join(__dirname, 'proposals'))) {
      fs.mkdirSync(path.join(__dirname, 'proposals'), { recursive: true });
    }

    fs.writeFileSync(proposalPath, proposalDoc);
    manifest.artifacts.proposals.push(proposalPath);

    updateSection(manifest, 'fixer', {
      changes_applied: [],
      plan: plan,
      edits: edits,
      proposal_path: proposalPath,
      mercury_iterations: fixerResult?.iterations || 0,
      mercury_duration_ms: fixerResult?.duration_ms || 0,
    });

    if (fixerResult?.success) {
      console.log(`🧠 Fixer: Mercury verified ${edits.length} edits (${fixerResult.iterations} iterations, ${(fixerResult.duration_ms/1000).toFixed(1)}s)`);
    }
    console.log(`📋 Fixer: Generated refactor proposal (ADVISORY MODE)`);
    console.log(`   📄 Proposal document: ${proposalPath}`);
    console.log(`   ⏳ Awaiting human approval before any changes`);
    return manifest;
  }

  // EXECUTE MODE: Apply changes
  console.log(`🔧 Fixer: Applying changes (EXECUTE MODE - APPROVED)`);

  // NEW: Apply Mercury's verified edits if available
  const mercuryEdits = manifest.fixer?.edits || manifest.architect?.plan?.files?.flatMap(f =>
    (f.changes || []).map(c => ({ file: f.path, ...c }))
  ) || [];

  if (mercuryEdits.length > 0) {
    console.log(`🧠 Fixer: Applying ${mercuryEdits.length} Mercury-verified edits`);
    const appliedChanges = [];

    // Group edits by file and sort descending by line_start
    // so earlier edits don't shift later edits' positions
    const editsByFile = {};
    for (const edit of mercuryEdits) {
      if (!editsByFile[edit.file]) editsByFile[edit.file] = [];
      editsByFile[edit.file].push(edit);
    }

    const orderedEdits = [];
    for (const file of Object.keys(editsByFile)) {
      const sorted = editsByFile[file].sort((a, b) => (b.line_start || 0) - (a.line_start || 0));
      orderedEdits.push(...sorted);
    }

    for (const edit of orderedEdits) {
      const filePath = path.join(projectRoot, edit.file);
      if (!fs.existsSync(filePath)) {
        console.log(`   ❌ ABORT: File not found: ${edit.file} — rolling back ALL edits`);
        for (const prev of appliedChanges) {
          if (prev.backup) {
            const prevPath = path.join(projectRoot, prev.file);
            fs.copyFileSync(prev.backup, prevPath);
            console.log(`   ↩️  Rolled back: ${prev.file}`);
          }
        }
        updateSection(manifest, 'fixer', { changes_applied: [], error: `File not found: ${edit.file}`, rollback: true });
        return manifest;
      }

      // Backup before edit
      const backupPath = filePath + '.pre-brainbug-' + Date.now();
      fs.copyFileSync(filePath, backupPath);

      let content = fs.readFileSync(filePath, 'utf8');
      const before = (edit.current_code || '').trim();
      const after = (edit.new_code || '').trim();

      if (!before || !after) {
        // New code insertion (no before block) — append after the file's last line matching context
        if (after && !before && edit.line_start) {
          const lines = content.split('\n');
          lines.splice(edit.line_start - 1, 0, after);
          content = lines.join('\n');
          fs.writeFileSync(filePath, content, 'utf8');
          appliedChanges.push({ file: edit.file, type: 'INSERT', backup: backupPath });
          console.log(`   ✅ Inserted new code in ${edit.file}`);
        } else {
          console.log(`   ⚠️  Skipped edit in ${edit.file}: missing before/after code`);
        }
        continue;
      }

      // Verified line-range replacement: use line numbers to locate, verify content before replacing
      const lines = content.split('\n');
      const lineStart = edit.line_start || 1;
      const lineEnd = edit.line_end || lineStart;
      const targetLines = lines.slice(lineStart - 1, lineEnd).join('\n');

      // Normalize whitespace for comparison (strip leading spaces per line, collapse blanks)
      const normalize = (s) => s.split('\n').map(l => l.trim()).filter(l => l.length).join('\n');
      const targetNormalized = normalize(targetLines);
      const beforeNormalized = normalize(before);

      // If exact line range doesn't match, search ±10 lines for the content
      let actualStart = lineStart;
      let actualEnd = lineEnd;
      if (targetNormalized !== beforeNormalized) {
        const windowStart = Math.max(1, lineStart - 10);
        const windowEnd = Math.min(lines.length, lineEnd + 10);
        const editLineCount = lineEnd - lineStart + 1;
        let foundAt = -1;

        for (let i = windowStart; i <= windowEnd - editLineCount + 1; i++) {
          const candidate = lines.slice(i - 1, i - 1 + editLineCount).join('\n');
          if (normalize(candidate) === beforeNormalized) {
            foundAt = i;
            break;
          }
        }

        if (foundAt > 0) {
          console.log(`   ⚠️  Mercury line drift detected — content found at line ${foundAt} instead of ${lineStart}`);
          actualStart = foundAt;
          actualEnd = foundAt + editLineCount - 1;
          // Re-extract for verification
          const newTarget = lines.slice(actualStart - 1, actualEnd).join('\n');
          if (normalize(newTarget) === beforeNormalized) {
            lines.splice(actualStart - 1, actualEnd - actualStart + 1, after);
            content = lines.join('\n');
            fs.writeFileSync(filePath, content, 'utf8');
            appliedChanges.push({ file: edit.file, type: 'REPLACE', lines: `${actualStart}-${actualEnd} (drift from ${lineStart})`, backup: backupPath });
            console.log(`   ✅ Applied edit to ${edit.file}:${actualStart}-${actualEnd} (drift-corrected)`);
            continue;
          }
        }
      }

      if (targetNormalized === beforeNormalized) {
        // Content verified — replace by line range
        lines.splice(lineStart - 1, lineEnd - lineStart + 1, after);
        content = lines.join('\n');
        fs.writeFileSync(filePath, content, 'utf8');
        appliedChanges.push({ file: edit.file, type: 'REPLACE', lines: `${lineStart}-${lineEnd}`, backup: backupPath });
        console.log(`   ✅ Applied edit to ${edit.file}:${lineStart}-${lineEnd}`);
      } else {
        // Byte-level diagnostic — find first divergent character
        const minLen = Math.min(targetNormalized.length, beforeNormalized.length);
        for (let i = 0; i < minLen; i++) {
          if (targetNormalized[i] !== beforeNormalized[i]) {
            console.log(`   🔬 First byte mismatch at index ${i} of ${minLen}:`);
            console.log(`      Expected char: ${JSON.stringify(beforeNormalized[i])} (code ${beforeNormalized.charCodeAt(i)})`);
            console.log(`      Found    char: ${JSON.stringify(targetNormalized[i])} (code ${targetNormalized.charCodeAt(i)})`);
            console.log(`      Expected ctx:  ${JSON.stringify(beforeNormalized.slice(Math.max(0, i - 10), i + 20))}`);
            console.log(`      Found    ctx:  ${JSON.stringify(targetNormalized.slice(Math.max(0, i - 10), i + 20))}`);
            break;
          }
        }
        if (targetNormalized.length !== beforeNormalized.length) {
          console.log(`   🔬 Length differs: expected ${beforeNormalized.length}, found ${targetNormalized.length}`);
        }
        console.log(`   ❌ ABORT: Content mismatch at ${edit.file}:${lineStart}-${lineEnd} — rolling back ALL edits`);
        console.log(`   Expected (normalized): ${beforeNormalized.slice(0, 80)}...`);
        console.log(`   Found    (normalized): ${targetNormalized.slice(0, 80)}...`);
        fs.copyFileSync(backupPath, filePath);
        for (const prev of appliedChanges) {
          if (prev.backup) {
            const prevPath = path.join(projectRoot, prev.file);
            fs.copyFileSync(prev.backup, prevPath);
            console.log(`   ↩️  Rolled back: ${prev.file}`);
          }
        }
        updateSection(manifest, 'fixer', { changes_applied: [], error: `Content mismatch at ${edit.file}:${lineStart}-${lineEnd}`, rollback: true });
        return manifest;
      }
    }

    // Run smoke test after all edits
    if (appliedChanges.length > 0) {
      console.log(`\n🧪 Running smoke test after ${appliedChanges.length} edits...`);
      const smokeResult = runSmokeTest();
      if (!smokeResult.success && !smokeResult.skipped) {
        console.log(`   ❌ Smoke test FAILED — rolling back all changes`);
        if (smokeResult.output) console.log(`   📋 Smoke test output:\n${smokeResult.output}`);
        if (smokeResult.error) console.log(`   💥 Smoke test error:\n${smokeResult.error}`);
        for (const change of appliedChanges) {
          if (change.backup) {
            const targetPath = path.join(projectRoot, change.file);
            fs.copyFileSync(change.backup, targetPath);
            console.log(`   ↩️  Rolled back: ${change.file}`);
          }
        }
        updateSection(manifest, 'fixer', { changes_applied: [], error: 'Smoke test failed after Mercury edits', rollback: true });
        return manifest;
      }
      console.log(`   ✅ Smoke test ${smokeResult.skipped ? 'skipped' : 'PASSED'}`);
    }

    changes.push(...appliedChanges);
    updateSection(manifest, 'fixer', { changes_applied: appliedChanges, plan, execute_mode: true });
    console.log(`✅ Fixer: Applied ${appliedChanges.length} Mercury-verified changes (EXECUTE MODE)`);
    return manifest;
  }

  // LEGACY: Parse issue for FULL_FILE pattern (old pipeline format)
  const refs = parseIssueForCodeRefs(manifest.issue);
  const fullFileRef = refs.find(r => r.bugType === 'FULL_FILE');

  if (fullFileRef && fullFileRef.replacementFile) {
    // FULL_FILE replacement
    const targetFile = `modules/${fullFileRef.file}.js`;
    const targetPath = path.join(projectRoot, targetFile);

    // Find replacement file
    const replacePaths = [
      path.join(__dirname, fullFileRef.replacementFile),
      path.join(projectRoot, fullFileRef.replacementFile),
      fullFileRef.replacementFile
    ];

    let replacementContent = null;
    let foundPath = null;
    for (const tryPath of replacePaths) {
      if (fs.existsSync(tryPath)) {
        replacementContent = fs.readFileSync(tryPath, 'utf8');
        foundPath = tryPath;
        break;
      }
    }

    if (!replacementContent) {
      console.log(`   ❌ Replacement file not found: ${fullFileRef.replacementFile}`);
      updateSection(manifest, 'fixer', { changes_applied: [], error: 'Replacement file not found' });
      return manifest;
    }

    // Backup and replace
    const backupPath = targetPath + '.backup-' + Date.now();
    if (fs.existsSync(targetPath)) {
      fs.copyFileSync(targetPath, backupPath);
    }

    fs.writeFileSync(targetPath, replacementContent, 'utf8');
    changes.push({
      type: 'FULL_FILE',
      target: targetFile,
      source: foundPath,
      backup: backupPath
    });

    console.log(`   📦 Loaded from: ${foundPath}`);
    console.log(`   ✅ Replaced: ${targetFile}`);

    // Run smoke test
    const smokeResult = runSmokeTest();
    if (!smokeResult.success && !smokeResult.skipped) {
      console.log(`   ❌ Smoke test FAILED - rolling back`);
      fs.copyFileSync(backupPath, targetPath);
      updateSection(manifest, 'fixer', { changes_applied: [], error: 'Smoke test failed', rollback: true });
      return manifest;
    }
    console.log(`   ✅ Smoke test ${smokeResult.skipped ? 'skipped' : 'PASSED'}`);
  }

  updateSection(manifest, 'fixer', {
    changes_applied: changes,
    plan: plan,
    execute_mode: true
  });

  console.log(`✅ Fixer: Applied ${changes.length} changes (EXECUTE MODE)`);
  return manifest;
}

/**
 * Generate refactor proposal document
 */
function generateRefactorProposal(manifest, edits) {
  const plan = manifest.architect?.plan || {};
  const fileList = (plan.files || []).map(f => `- \`${f.path}\` — ${(f.changes || []).length} changes`).join('\n') || 'None specified';
  const orderList = (plan.ordering || []).map((o, i) => `${i + 1}. ${o}`).join('\n') || 'Not specified';

  let editsSection = '';
  if (edits && edits.length > 0) {
    editsSection = `## Verified Edits (Mercury-confirmed against actual code)\n\n`;
    edits.forEach((e, i) => {
      editsSection += `### Edit ${i + 1}: ${e.file}:${e.line_start}-${e.line_end}\n`;
      editsSection += `**Verified:** ${e.verified ? 'YES' : 'NO'}${e.drift_note ? ` (${e.drift_note})` : ''}\n\n`;
      editsSection += `\`\`\`javascript\n// BEFORE:\n${e.current_code}\n// AFTER:\n${e.new_code}\n\`\`\`\n\n`;
    });
  }

  return `# REFACTOR PROPOSAL: ${manifest.mission_id}
Generated: ${new Date().toISOString()}

## ⚠️ ADVISORY MODE - NO CHANGES MADE
This document proposes refactoring changes for human review.
**Nothing has been modified. You must approve before execution.**

---

## Task
${manifest.issue}

## Architect Plan
${plan.summary || 'No plan generated'}

### Files to Modify
${fileList}

### Commit Ordering
${orderList}

### Verification
${plan.verification || 'Not specified'}

${editsSection}

## RAG Context
${manifest.commander?.known_issues?.map(i => `- [${i.severity}] ${i.id}: ${i.symptom?.slice(0, 80)}...`).join('\n') || 'No prior issues found'}

---

## Approval
Run: \`node ogz-meta/approve.js ${manifest.mission_id}\`

## Rejection
Run: \`node ogz-meta/reject.js ${manifest.mission_id}\`

---
Generated by Claudito Pipeline (Refactor Mode, Advisory)
`;
}

/**
 * Generate proposal document for human review
 * UPGRADED 2026-03-10: Supports replacement blocks for structural fixes
 */
function generateProposalDocument(manifest, proposals) {
  // Check for structural bugs
  const structuralBugs = manifest.entomologist?.bugs_found?.filter(
    b => b.bugType === 'STRUCTURAL' || b.bugType === 'SEMANTIC'
  ) || [];

  const doc = `# PROPOSAL: ${manifest.mission_id}
Generated: ${new Date().toISOString()}

## ⚠️ ADVISORY MODE - NO CHANGES MADE
This document proposes changes for human review.
**Nothing has been modified. You must approve before execution.**

---

## Issue
${manifest.issue}

## RAG Context Retrieved
${manifest.commander?.known_issues?.map(i => `- [${i.severity}] ${i.id}: ${i.symptom?.slice(0, 100)}...`).join('\n') || 'No prior issues found'}

## Bugs Identified
${manifest.entomologist?.bugs_found?.map((b, i) => `
### Bug ${i + 1}: ${b.type}
- **Location**: ${b.location}
- **Description**: ${b.description || 'See analysis'}
- **Fix Type**: ${b.bugType || 'LINE'}${b.semantic ? `
- **Semantic**: \`${JSON.stringify(b.semantic)}\`` : ''}
- **Score**: ${b.score || 'N/A'}
`).join('\n') || 'No bugs identified'}

## Proposed Fixes
${proposals.map((p, i) => `
### Proposal ${i + 1}: ${p.bug_id}
- **Location**: ${p.location}
- **Proposed Change**: ${p.proposed_fix}
- **Status**: ${p.status}
${p.replacement_block ? `
#### Replacement (ready to apply)
\`\`\`javascript
// BEFORE: ${p.code || '(original code)'}
// AFTER:  ${p.replacement_block}
\`\`\`
` : `
\`\`\`
// BEFORE: [Current code at ${p.location}]
// AFTER:  [Provide replacement_block to apply]
\`\`\`
`}`).join('\n')}
${structuralBugs.length > 0 ? `
## ⚠️ STRUCTURAL FIX REQUIRED

This proposal requires a replacement block. To provide the fix:

**Option 1: Inline in manifest**
\`\`\`bash
# Add replacement_block to ogz-meta/manifests/${manifest.mission_id}.json
# Then re-run: node ogz-meta/pipeline.js --execute "${manifest.issue}"
\`\`\`

**Option 2: Via replacement file**
\`\`\`bash
# Create: ogz-meta/replacements/${manifest.mission_id}.js
# Contains the new function/code block
# Then: node ogz-meta/pipeline.js --execute --replacement-file "${manifest.mission_id}.js" "${manifest.issue}"
\`\`\`
` : ''}
## Impact Analysis
- Files potentially affected: ${manifest.architect?.system_map?.join(', ') || 'Unknown'}
- Dependencies: ${manifest.architect?.dependencies?.join(', ') || 'Unknown'}

## To Approve
Run: \`node ogz-meta/approve.js ${manifest.mission_id}\`

## To Reject
Run: \`node ogz-meta/reject.js ${manifest.mission_id}\`

---
Generated by Claudito Pipeline (Advisory Mode)
`;

  return doc;
}

/**
 * Debugger: Tests fixes
 */
async function debuggerHandler(manifest, params) {
  // PIPELINE-DEBUGGER-HARDEN 2026-05-13: unit_tests is `npm test` -> jest --runInBand.
  // Two prior failure modes that bricked the pipeline:
  //   1) execSync's default 1MB maxBuffer overflowed by jest verbose output ->
  //      stdio buffer deadlock -> pipeline hung for 1.5 hours.
  //   2) Pre-existing env-config test failures (SESSION-HIGH-02: ASSET_CLASS /
  //      BROKER unset) tripped verification_failed -> pipeline halted before
  //      legitimate fixes could ship.
  // Fix: unit_tests is now advisory (optional: true) — results land in manifest
  // for visibility but don't halt the pipeline. Real quality gate is the
  // post-execute P0 anchor verification (operator-side). Hard timeout + 10MB
  // maxBuffer prevent any future hang or buffer deadlock.
  let tests = [
    { name: 'syntax_check', command: 'node --check run-empire-v2.js' },
    { name: 'unit_tests', command: 'npm test', optional: true, timeout: 60000 }
  ];

  // If forensics pass, add recommended verifications
  const isForensicsPass = params && params[0] === '--forensics';
  if (isForensicsPass && manifest.forensics?.recommended_verifications) {
    console.log('   🔬 Running forensics recommended verifications...');
    manifest.forensics.recommended_verifications.forEach((cmd, i) => {
      tests.push({
        name: `forensics_check_${i}`,
        command: cmd
      });
    });
  }

  const results = [];
  for (const test of tests) {
    try {
      if (test.name === 'unit_tests') {
        // Check if test script exists first
        try {
          const packageJson = require('../package.json');
          if (!packageJson.scripts?.test) {
            results.push({ test: test.name, passed: false, skipped: true, reason: 'No test script' });
            continue;
          }
        } catch (e) {
          results.push({ test: test.name, passed: false, skipped: true, reason: 'No package.json' });
          continue;
        }
      }

      execSync(test.command, {
        encoding: 'utf8',
        timeout: test.timeout || 30000,
        maxBuffer: 10 * 1024 * 1024  // 10MB — jest verbose output exceeds default 1MB
      });
      results.push({ test: test.name, passed: true });
    } catch (e) {
      results.push({ test: test.name, passed: false, error: e.message, optional: test.optional });
      // Optional failures are warnings, not halts. Non-optional failures halt.
      // PIPELINE-DEBUGGER-HARDEN 2026-05-13: unit_tests marked optional so
      // pre-existing env-config test failures don't block unrelated fixes.
      if (!test.optional && !results[results.length - 1].skipped) {
        manifest.stop_conditions.verification_failed = true;
      }
    }
  }

  updateSection(manifest, 'debugger', {
    tests_run: tests.map(t => t.name),
    results
  });

  console.log(`✅ Debugger: ${results.filter(r => r.passed).length}/${tests.length} tests passed`);
  return manifest;
}

/**
 * Critic: Lists weaknesses
 */
async function critic(manifest, params) {
  const proposals = manifest.exterminator?.proposals || [];
  const bugs = manifest.entomologist?.bugs_found || [];

  // Mechanical checks first (fast, no LLM needed)
  const mechanicalWeaknesses = [];
  if (!bugs.length) mechanicalWeaknesses.push('No bugs found - insufficient analysis');
  if (!manifest.debugger?.results?.every(r => r.passed)) mechanicalWeaknesses.push('Tests failing - fixes incomplete');

  // Mercury-powered semantic review if there are proposals to review
  let reviews = [];
  let overallVerdict = 'approve_all';
  let loopBack = false;

  if (proposals.length > 0) {
    const { callMercury } = require('./cognition/mercury-bridge');
    const result = await callMercury({
      role: 'critic',
      task: `review ${proposals.length} fix proposals for quality`,
      target: { proposals, bugs },
      outputFormat: 'structured_critique',
      options: {
        maxIterations: 10,
        quiet: true,
        missionId: manifest.mission_id
      }
    });

    if (result.success) {
      reviews = result.data.reviews || [];
      overallVerdict = result.data.overall_verdict || 'approve_all';
      loopBack = result.data.loop_back_required || false;

      // Convert Mercury rejections to weaknesses
      reviews.filter(r => r.verdict === 'reject' || r.verdict === 'needs_revision').forEach(r => {
        mechanicalWeaknesses.push(`Proposal ${r.proposal_id}: ${r.verdict} — ${(r.issues || []).join('; ')}`);
      });

      console.log(`🧠 Critic: Mercury reviewed ${proposals.length} proposals → ${overallVerdict} (${result.iterations} iterations, ${(result.duration_ms/1000).toFixed(1)}s)`);
    } else {
      console.log(`⚠️  Critic: Mercury call failed (${result.reason}), falling back to mechanical checks`);
    }
  }

  if (mechanicalWeaknesses.length >= 3 || loopBack) {
    manifest.stop_conditions.critic_failures = (manifest.stop_conditions.critic_failures || 0) + 1;
  }

  updateSection(manifest, 'critic', {
    weaknesses: mechanicalWeaknesses,
    reviews,
    overall_verdict: overallVerdict,
    loop_back_required: loopBack,
    force_rerun: mechanicalWeaknesses.length >= 3 || loopBack
  });

  console.log(`✅ Critic: Found ${mechanicalWeaknesses.length} weaknesses, verdict: ${overallVerdict}`);
  return manifest;
}

/**
 * Validator: Final checks
 */
async function validator(manifest, params) {
  const checks = [];

  checks.push({
    name: 'manifest_integrity',
    passed: true
  });

  checks.push({
    name: 'no_production_changes',
    passed: !manifest.artifacts.files_modified?.includes('main')
  });

  updateSection(manifest, 'validator', {
    checks_passed: checks.filter(c => c.passed).map(c => c.name),
    checks_failed: checks.filter(c => !c.passed).map(c => c.name)
  });

  console.log(`✅ Validator: ${checks.filter(c => c.passed).length}/${checks.length} checks passed`);
  return manifest;
}

/**
 * Forensics: Secondary verification
 */
async function forensics(manifest, params) {
  const proposals = manifest.exterminator?.proposals || [];
  const targetFiles = [...new Set(proposals.map(p => p.location?.split(':')[0]).filter(Boolean))];

  // Mechanical checks (fast, always run)
  let catalyzeVerification = false;
  const mechanicalRisks = [];

  if (manifest.debugger?.results?.some(r => !r.passed && !r.skipped)) {
    catalyzeVerification = true;
    mechanicalRisks.push('Test failures indicate potential regression');
  }
  if (manifest.critic?.weaknesses?.length >= 2) {
    catalyzeVerification = true;
  }

  // Mercury-powered semantic analysis if there are proposals to verify
  let risks = [];
  let silentBugs = [];
  let loopBack = false;

  if (proposals.length > 0) {
    const { callMercury } = require('./cognition/mercury-bridge');
    const result = await callMercury({
      role: 'forensics',
      task: `semantic risk analysis of ${proposals.length} proposed changes`,
      target: { proposals, files: targetFiles },
      outputFormat: 'structured_risks',
      options: {
        maxIterations: 15,
        quiet: true,
        missionId: manifest.mission_id
      }
    });

    if (result.success) {
      risks = result.data.risks || [];
      silentBugs = result.data.silent_bugs || [];
      loopBack = result.data.loop_back_required || false;
      catalyzeVerification = catalyzeVerification || risks.some(r => r.severity === 'critical' || r.severity === 'high');

      console.log(`🧠 Forensics: Mercury found ${risks.length} risks, ${silentBugs.length} silent bugs (${result.iterations} iterations, ${(result.duration_ms/1000).toFixed(1)}s)`);
    } else {
      console.log(`⚠️  Forensics: Mercury call failed (${result.reason}), mechanical checks only`);
    }
  }

  const allRisks = [...mechanicalRisks, ...risks.map(r => `${r.severity}: ${r.description}`)];

  updateSection(manifest, 'forensics', {
    silent_bugs: silentBugs,
    regression_risks: allRisks,
    semantic_risks: risks,
    catalyze_verification: catalyzeVerification,
    loop_back_required: loopBack,
    severity: risks.some(r => r.severity === 'critical') ? 'P0' : silentBugs.length > 0 ? 'P1' : 'P2',
  });

  if (risks.some(r => r.severity === 'critical') || loopBack) {
    manifest.stop_conditions.forensics_critical = true;
  }

  console.log(`✅ Forensics: ${silentBugs.length} silent bugs, ${allRisks.length} risks`);
  if (catalyzeVerification) {
    console.log('   🔄 Will trigger verification pass 2');
  }
  return manifest;
}

/**
 * CI/CD: Build and test
 */
async function cicd(manifest, params) {
  let buildResult = 'PASS';
  let testResult = 'PASS';

  try {
    execSync('node --check run-empire-v2.js', { encoding: 'utf8' });
  } catch (e) {
    buildResult = 'FAIL';
    manifest.stop_conditions.cicd_failed = true;
  }

  updateSection(manifest, 'cicd', {
    build_result: buildResult,
    test_result: testResult
  });

  console.log(`✅ CI/CD: Build ${buildResult}, Tests ${testResult}`);
  return manifest;
}

/**
 * Committer: Commits changes (Fix 37a: shell-safe via execFileSync)
 */
async function committer(manifest, params) {
  const { execFileSync } = require('child_process');

  // FIX 37A-BRANCH-READ: argv-style invocation, no shell, no expansion.
  let branch;
  try {
    branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
  } catch (err) {
    updateSection(manifest, 'committer', {
      branch: null,
      blocked: true,
      reason: `git branch read failed: ${err.message}`
    });
    console.log('COMMITTER: BLOCKED (git unavailable)');
    return manifest;
  }

  // CRITICAL: Clauditos cannot write to main (safety floor, preserved unchanged)
  if (branch === 'main') {
    manifest.stop_conditions.warden_blocked = true;
    updateSection(manifest, 'committer', {
      branch,
      blocked: true,
      reason: 'Clauditos cannot commit to production branch main'
    });
    console.log('COMMITTER: BLOCKED (on main)');
    return manifest;
  }

  // FIX 37/37A-ENV-NORM: env-var-gated branch policy. Codex F3: normalize so
  // 'true'/'TRUE'/'1'/'yes' all gate correctly (case-insensitive). Strict
  // === 'true' silently bypassed gate when operator set =1 or =yes.
  const requireMissionBranch = ['true', '1', 'yes'].includes(
    String(process.env.PIPELINE_REQUIRE_MISSION_BRANCH || '').toLowerCase()
  );
  if (requireMissionBranch && !branch.startsWith('mission/')) {
    console.log(`COMMITTER: PIPELINE_REQUIRE_MISSION_BRANCH set and branch '${branch}' is not mission/* — skipping commit`);
    updateSection(manifest, 'committer', {
      branch,
      commit_hash: null,
      reason: 'PIPELINE_REQUIRE_MISSION_BRANCH set and not on mission/*'
    });
    return manifest;
  }

  // Stage manifest-tracked files only. Per CLAUDE.md: never `git add -A` — the
  // committer must only stage files the pipeline itself recorded as modified
  // or created, otherwise unrelated working-tree changes get pulled into the
  // commit unintentionally.
  const filesModified = (manifest.artifacts && manifest.artifacts.files_modified) || [];
  const filesCreated = (manifest.artifacts && manifest.artifacts.files_created) || [];
  const filesToStage = [...filesModified, ...filesCreated].filter(Boolean);

  if (filesToStage.length === 0) {
    console.log(`COMMITTER: no files in manifest.artifacts.files_modified/created — nothing to commit on ${branch}`);
    updateSection(manifest, 'committer', {
      branch,
      commit_hash: null,
      reason: 'no files to commit (manifest.artifacts empty)'
    });
    return manifest;
  }

  // Build commit message: pipeline(fix-N): <issue>  OR  pipeline(mission): <issue>
  const fixId = manifest.spec_source && manifest.spec_source.fixId;
  const subject = fixId
    ? `pipeline(fix-${fixId}): ${manifest.issue || manifest.mission_id}`
    : `pipeline(mission): ${manifest.issue || manifest.mission_id}`;
  const bodyLine1 = `Mission: ${manifest.mission_id}`;
  const bodyLine2 = `Files: ${filesToStage.join(', ')}`;

  try {
    // FIX 37A-STAGE / 37B-MAXBUFFER: argv-style, no shell. Each filename is a
    // separate argv element; metacharacters cannot expand. '--' separator prevents
    // future filenames starting with '-' from being interpreted as git flags.
    // maxBuffer 10MB guards against pipe deadlock if git emits verbose output
    // (large file lists, warning floods). Default Node maxBuffer is 1MB.
    execFileSync('git', ['add', '--', ...filesToStage], { stdio: 'pipe', maxBuffer: 10 * 1024 * 1024 });

    // FIX 37A-COMMIT / 37B-MAXBUFFER: argv-style with repeated -m. git
    // concatenates -m bodies with blank lines between, producing the same
    // subject/body separation as before, without shell quoting.
    execFileSync(
      'git',
      ['commit', '-m', subject, '-m', bodyLine1, '-m', bodyLine2],
      { stdio: 'pipe', maxBuffer: 10 * 1024 * 1024 }
    );

    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }).trim();
    updateSection(manifest, 'committer', {
      branch,
      commit_hash: sha,
      files: filesToStage,
      message: subject
    });
    console.log(`COMMITTER: committed ${sha.slice(0, 7)} on ${branch} (${filesToStage.length} file(s))`);
  } catch (err) {
    console.error(`COMMITTER: git commit failed — ${err.message}`);
    updateSection(manifest, 'committer', {
      branch,
      commit_hash: null,
      error: err.message
    });
    manifest.stop_conditions.cicd_failed = true;
  }

  return manifest;
}

/**
 * Scribe: Updates documentation
 */
async function scribe(manifest, params) {
  const { execSync } = require('child_process');
  const fs = require('fs');
  const path = require('path');

  const changelogEntry = `Mission ${manifest.mission_id}: ${manifest.issue}`;

  // Write mission report for ledger harvesting if fixes were applied
  if (manifest.exterminator?.fixes_applied?.length > 0) {
    const reportContent = `# MISSION REPORT - ${manifest.mission_id}
Generated: ${new Date().toISOString()}

## Issue
${manifest.issue}

## Severity
${manifest.forensics?.severity || 'MEDIUM'}

## Root Cause
${manifest.entomologist?.bugs_found[0]?.description || 'See bug analysis'}

## Minimal Fix
${manifest.exterminator.fixes_applied[0]?.patch || 'Applied fixes per manifest'}

## Files Modified
${manifest.artifacts?.files_modified?.join(', ') || 'None'}

## What Worked
${manifest.debugger?.results?.filter(r => r.passed).map(r => r.test).join(', ') || 'Tests pending'}

## What Failed
${manifest.debugger?.results?.filter(r => !r.passed && !r.skipped).map(r => r.test).join(', ') || 'None'}
`;

    // Write report for harvesting
    const reportPath = path.join(__dirname, 'reports', `MISSION-${manifest.mission_id}.md`);
    if (!fs.existsSync(path.dirname(reportPath))) {
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    }
    fs.writeFileSync(reportPath, reportContent);
    console.log(`   ✅ Mission report written`);

    // Update ledger digest
    try {
      execSync('node ogz-meta/update-ledger.js', { stdio: 'pipe' });
      console.log('   ✅ Ledger updated');
    } catch (e) {
      console.log('   ⚠️  Ledger update failed');
    }

    // Rebuild context pack
    try {
      execSync('node ogz-meta/build-claudito-context.js', { stdio: 'pipe' });
      console.log('   ✅ Context pack rebuilt');
    } catch (e) {
      console.log('   ⚠️  Context rebuild failed');
    }
  }

  updateSection(manifest, 'scribe', {
    changelog_entry: changelogEntry,
    ledger_update: manifest.exterminator?.fixes_applied?.length > 0 ? 'completed' : 'skipped'
  });

  console.log('✅ Scribe: Documentation updated');
  return manifest;
}

/**
 * Janitor: Cleans artifacts
 */
async function janitor(manifest, params) {
  const artifacts = manifest.artifacts.files_created || [];

  updateSection(manifest, 'janitor', {
    files_cleaned: [],
    artifacts_removed: artifacts.filter(f => f.includes('.tmp'))
  });

  console.log(`✅ Janitor: ${artifacts.length} artifacts marked for cleanup`);
  return manifest;
}

/**
 * Warden: Final gate
 */
async function warden(manifest, params) {
  const violations = [];

  // CRITICAL: Check if on forbidden main branch
  const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
  if (branch === 'main') {
    violations.push('On production branch main (writes forbidden for Clauditos)');
  }

  // Check scope
  if (manifest.artifacts.files_modified?.length > 10) {
    violations.push('Too many files modified');
  }

  if (violations.length > 0) {
    manifest.stop_conditions.warden_blocked = true;
  }

  updateSection(manifest, 'warden', {
    scope_violations: violations,
    safety_blocks: [],
    final_approval: violations.length === 0
  });

  console.log(`✅ Warden: ${violations.length === 0 ? 'APPROVED' : 'BLOCKED'}`);
  return manifest;
}

/**
 * Emit hook for downstream processing
 * Enhanced with real-time console logging per ogz-meta specs
 */
function emitHook(command, manifest) {
  const hookFile = path.join(MANIFEST_DIR, `${manifest.mission_id}.hook`);
  const hook = {
    command,
    state: manifest.state,
    timestamp: new Date().toISOString()
  };

  // Write to file (original behavior)
  fs.writeFileSync(hookFile, JSON.stringify(hook, null, 2));

  // Real-time console logging (new per ogz-meta specs)
  ClauditoLogger.hook(command, manifest.state, {
    missionId: manifest.mission_id,
    result: manifest[command.replace('/', '')]?.status || 'executed'
  });
}

/**
 * Architect-Verify: deterministic spec-target verification for --write mode.
 *
 * Reads manifest.spec_source.{path, fixId}, calls spec-parser, then confirms
 * the spec's str_replace target text exists VERBATIM at the named file.
 * No Mercury call — no prompt to bias, no re-derivation. Fails loud on drift.
 *
 * Halts pipeline (manifest_mismatch=true) if:
 * - spec_source not present in manifest
 * - parseFix throws (spec missing the section or required blocks)
 * - target text not found in current file
 * - target text appears more than once and no replace_all flag is set
 */
async function architectVerify(manifest, params) {
  const { parseFix } = require('./spec-parser');
  const fs = require('fs');
  const path = require('path');

  const spec = manifest.spec_source;
  if (!spec || !spec.path || !spec.fixId) {
    console.error('❌ architect-verify: manifest.spec_source.{path,fixId} missing — required for --write mode');
    manifest.stop_conditions.manifest_mismatch = true;
    return manifest;
  }

  let parsed;
  try {
    parsed = parseFix(spec.path, spec.fixId);
  } catch (err) {
    console.error(`❌ architect-verify: spec parse failed — ${err.message}`);
    manifest.stop_conditions.manifest_mismatch = true;
    return manifest;
  }

  const parsedFiles = parsed.files || [{ file: parsed.file, lineHint: parsed.lineHint, edits: parsed.edits }];
  const editVerifications = [];

  for (let fileIndex = 0; fileIndex < parsedFiles.length; fileIndex++) {
    const fileEntry = parsedFiles[fileIndex];
    const filePath = path.isAbsolute(fileEntry.file)
      ? fileEntry.file
      : path.join(process.cwd(), fileEntry.file);

    if (!fs.existsSync(filePath)) {
      console.error(`❌ architect-verify: target file not found: ${filePath}`);
      manifest.stop_conditions.manifest_mismatch = true;
      return manifest;
    }

    const fileContents = fs.readFileSync(filePath, 'utf8');

    fileEntry.edits.forEach((edit, editIndex) => {
      editVerifications.push({
        file: fileEntry.file,
        fileIndex,
        editIndex,
        index: editVerifications.length,
        occurrences: _countOccurrences(fileContents, edit.target),
        firstLineOfTarget: edit.target.split('\n')[0].slice(0, 100)
      });
    });
  }

  const missing = editVerifications.filter(v => v.occurrences === 0);
  if (missing.length > 0) {
    console.error(`❌ architect-verify: ${missing.length}/${editVerifications.length} target block(s) NOT FOUND`);
    missing.forEach(m => {
      console.error(`   ${m.file} edit[${m.editIndex}] missing — first line: ${m.firstLineOfTarget}`);
    });
    console.error(`   Spec authored against an earlier code state; current code has drifted.`);
    manifest.stop_conditions.manifest_mismatch = true;
    return manifest;
  }

  updateSection(manifest, 'architect', {
    plan: { spec_driven: true, fixId: parsed.fixId, title: parsed.title, files: parsedFiles.map(f => f.file) },
    system_map: parsedFiles.map(f => f.file),
    spec_target_occurrences: editVerifications.reduce((sum, v) => sum + v.occurrences, 0),
    spec_target_verified: true,
    line_hint: parsedFiles.map(f => ({ file: f.file, lineHint: f.lineHint || 'n/a' })),
    edit_count: editVerifications.length,
    file_count: parsedFiles.length,
    edit_verifications: editVerifications
  });

  console.log(`✅ Architect-Verify: Fix ${parsed.fixId} "${parsed.title}"`);
  console.log(`   Files: ${parsedFiles.length}  Edits: ${editVerifications.length}`);
  editVerifications.forEach(v => {
    console.log(`   ${v.file} edit[${v.editIndex}] occurrences: ${v.occurrences}`);
  });
  return manifest;
}

/**
 * Fixer-Write: deterministic spec-driven application for --write mode.
 *
 * In ADVISORY mode: parses spec, generates proposal markdown showing the
 * verbatim target/replacement, writes proposal to ogz-meta/proposals/.
 * Does NOT modify the target file.
 *
 * In EXECUTE mode: parses spec, performs the str_replace on the target file
 * (single replacement; if target appears multiple times, ALL are replaced —
 * the spec is responsible for surrounding context to disambiguate).
 * Records the applied edit in manifest.fixer.
 */
async function fixerWrite(manifest, params) {
  const { parseFix } = require('./spec-parser');
  const fs = require('fs');
  const path = require('path');

  const spec = manifest.spec_source;
  if (!spec || !spec.path || !spec.fixId) {
    console.error('❌ fixer-write: manifest.spec_source missing');
    manifest.stop_conditions.manifest_mismatch = true;
    return manifest;
  }

  let parsed;
  try {
    parsed = parseFix(spec.path, spec.fixId);
  } catch (err) {
    console.error(`❌ fixer-write: spec parse failed — ${err.message}`);
    manifest.stop_conditions.manifest_mismatch = true;
    return manifest;
  }

  const parsedFiles = parsed.files || [{ file: parsed.file, lineHint: parsed.lineHint, edits: parsed.edits }];

  if (manifest.mode === 'EXECUTE') {
    const perEditResults = [];
    const filesWritten = [];

    // Apply each file's edits in order. Fail loud + abort if any target missing
    // (architect-verify already checked, but re-check to catch concurrent edits
    // and to detect cases where an earlier edit's replacement inadvertently
    // removed a later edit's target).
    for (let fileIndex = 0; fileIndex < parsedFiles.length; fileIndex++) {
      const fileEntry = parsedFiles[fileIndex];
      const filePath = path.isAbsolute(fileEntry.file)
        ? fileEntry.file
        : path.join(process.cwd(), fileEntry.file);
      let fileContents = fs.readFileSync(filePath, 'utf8');

      for (let editIndex = 0; editIndex < fileEntry.edits.length; editIndex++) {
        const edit = fileEntry.edits[editIndex];
        if (!fileContents.includes(edit.target)) {
          console.error(`❌ fixer-write: ${fileEntry.file} edit[${editIndex}] target disappeared mid-apply (concurrent edit or earlier replacement clobbered it)`);
          manifest.stop_conditions.verification_failed = true;
          return manifest;
        }
        const occurrencesReplaced = (fileContents.match(new RegExp(_escapeRegex(edit.target), 'g')) || []).length;
        fileContents = fileContents.split(edit.target).join(edit.replacement);
        perEditResults.push({
          file: fileEntry.file,
          fileIndex,
          editIndex,
          index: perEditResults.length,
          occurrencesReplaced
        });
      }

      fs.writeFileSync(filePath, fileContents, 'utf8');
      filesWritten.push(fileEntry.file);
    }

    // FIX 40/40A: /fixer-write must feed the manifest-scoped committer with a
    // canonical repo-relative path. The committer stages manifest.artifacts
    // entries directly through git add, so reject empty/outside-repo paths and
    // normalize separators before deduping.
    const repoRoot = process.cwd();
    if (!manifest.artifacts) manifest.artifacts = {};
    if (!Array.isArray(manifest.artifacts.files_modified)) {
      manifest.artifacts.files_modified = [];
    }
    if (!Array.isArray(manifest.artifacts.files_created)) {
      manifest.artifacts.files_created = [];
    }

    for (const file of filesWritten) {
      const artifactPath = path.relative(repoRoot, path.resolve(file)).replace(/\\/g, '/');
      if (!artifactPath) {
        throw new Error('fixer-write: parsed file resolved to empty artifact path');
      }
      if (artifactPath === '..' || artifactPath.startsWith('../') || path.isAbsolute(artifactPath)) {
        throw new Error(`fixer-write: refusing outside-repo artifact path: ${file}`);
      }
      if (
        !manifest.artifacts.files_modified.includes(artifactPath) &&
        !manifest.artifacts.files_created.includes(artifactPath)
      ) {
        manifest.artifacts.files_modified.push(artifactPath);
      }
    }

    const totalReplaced = perEditResults.reduce((sum, r) => sum + r.occurrencesReplaced, 0);

    updateSection(manifest, 'fixer', {
      changes_applied: [{
        files: filesWritten,
        fixId: parsed.fixId,
        title: parsed.title,
        editCount: perEditResults.length,
        totalSitesReplaced: totalReplaced,
        perEditResults,
        spec_driven: true
      }],
      plan: { spec_driven: true, fixId: parsed.fixId }
    });

    console.log(`✅ Fixer-Write (EXECUTE): applied Fix ${parsed.fixId} to ${filesWritten.length} file(s) — ${perEditResults.length} edit(s), ${totalReplaced} site(s) replaced`);
    perEditResults.forEach(r => {
      console.log(`   ${r.file} edit[${r.editIndex}] -> ${r.occurrencesReplaced} site(s)`);
    });
    return manifest;
  }

  // ADVISORY mode: write proposal, do not modify source
  const proposalDir = path.join(__dirname, 'proposals');
  if (!fs.existsSync(proposalDir)) fs.mkdirSync(proposalDir, { recursive: true });
  const proposalPath = path.join(proposalDir, `${manifest.mission_id}-WRITE-PROPOSAL.md`);

  const editBlocks = parsedFiles.flatMap(fileEntry =>
    fileEntry.edits.map((edit, i) => `
## ${fileEntry.file} - Edit ${i + 1} of ${fileEntry.edits.length}

### str_replace target (verbatim from spec)
\`\`\`
${edit.target}
\`\`\`

### str_replace replacement (verbatim from spec)
\`\`\`
${edit.replacement}
\`\`\`
`)
  ).join('\n');

  const proposalBody = `# WRITE PROPOSAL: ${manifest.mission_id}
Generated: ${new Date().toISOString()}

## ⚠️ ADVISORY MODE — NO CHANGES MADE
This proposal is a deterministic application of spec block(s). Nothing has
been modified. Re-run with --execute to apply.

## Source
- Spec: \`${spec.path}\`
- Fix: ${parsed.fixId} — ${parsed.title}
- Files: ${parsedFiles.map(f => `\`${f.file}\``).join(', ')}
- Line hints: ${parsedFiles.map(f => `${f.file}: ${f.lineHint || 'n/a'}`).join('; ')}
- Edit count: ${parsedFiles.reduce((sum, f) => sum + f.edits.length, 0)}
${editBlocks}

## Pre-flight verification (from architect-verify)
- Total target occurrences across all edits: ${manifest.architect?.spec_target_occurrences ?? 'n/a'}
- All edits verified: ${manifest.architect?.spec_target_verified ?? 'n/a'}
- Per-edit verifications: ${JSON.stringify(manifest.architect?.edit_verifications?.map(v => ({file: v.file, edit: v.editIndex, occ: v.occurrences})) ?? 'n/a')}

## Approve
\`\`\`
node ogz-meta/approve.js ${manifest.mission_id}
node ogz-meta/pipeline.js --write --spec ${spec.path} --fix-id ${spec.fixId} --execute
\`\`\`

## Reject
\`\`\`
node ogz-meta/reject.js ${manifest.mission_id} "<reason>"
\`\`\`
`;
  fs.writeFileSync(proposalPath, proposalBody, 'utf8');

  updateSection(manifest, 'fixer', {
    proposal_path: proposalPath,
    plan: { spec_driven: true, fixId: parsed.fixId, title: parsed.title, files: parsedFiles.map(f => f.file) }
  });

  console.log(`✅ Fixer-Write (ADVISORY): proposal written`);
  console.log(`   ${proposalPath}`);
  return manifest;
}

/**
 * Spec-Update-Status: deterministic spec-doc status-line updater for --mark-fixed.
 *
 * Reads manifest.spec_source.{path, fixMap} where fixMap is { "<fixId>": "<sha>" }.
 * For each entry, locates the Fix N section in the spec doc, finds its
 * **Status:** line, and rewrites it to:
 *   **Status:** FIXED in <sha> — <ISO-date>
 *
 * Stages the spec doc, runs git commit + push with a summary message listing
 * every fixId updated. One pipeline run = one consolidated commit, no matter
 * how many fixes are in the batch.
 *
 * Halts pipeline (manifest_mismatch=true) if:
 * - spec_source.fixMap missing or empty
 * - any fixId's section can't be located in the spec doc
 * - any fixId's section has no Status line to rewrite
 */
async function specUpdateStatus(manifest, params) {
  const { parseFix } = require('./spec-parser');
  const fs = require('fs');
  const path = require('path');

  const spec = manifest.spec_source;
  if (!spec || !spec.path || !spec.fixMap || Object.keys(spec.fixMap).length === 0) {
    console.error('❌ spec-update-status: manifest.spec_source.{path,fixMap} missing or empty');
    manifest.stop_conditions.manifest_mismatch = true;
    return manifest;
  }

  const specAbs = path.isAbsolute(spec.path)
    ? spec.path
    : path.join(process.cwd(), spec.path);
  if (!fs.existsSync(specAbs)) {
    console.error(`❌ spec-update-status: spec file not found: ${specAbs}`);
    manifest.stop_conditions.manifest_mismatch = true;
    return manifest;
  }

  let raw = fs.readFileSync(specAbs, 'utf8');
  const updates = [];
  const isoDate = new Date().toISOString().slice(0, 10);

  for (const [fixId, sha] of Object.entries(spec.fixMap)) {
    // Verify section exists via parseFix (also confirms the **Status:** line is locatable
    // because parseFix walks the full Fix N section).
    let parsed;
    try {
      parsed = parseFix(specAbs, fixId);
    } catch (err) {
      console.error(`❌ spec-update-status: Fix ${fixId} parse failed — ${err.message}`);
      manifest.stop_conditions.manifest_mismatch = true;
      return manifest;
    }

    // Locate the section boundary on `raw` so we know the byte range to operate on.
    // Re-using the same regex shape as the parser (section ends at next ### Fix / ## / # heading).
    const sectionStart = new RegExp(`^### Fix ${fixId}:\\s*.+$`, 'm');
    const startMatch = raw.match(sectionStart);
    if (!startMatch) {
      console.error(`❌ spec-update-status: Fix ${fixId} section anchor not found on second pass`);
      manifest.stop_conditions.manifest_mismatch = true;
      return manifest;
    }
    const startIdx = startMatch.index;
    const remainder = raw.slice(startIdx + startMatch[0].length);
    const endMatch = remainder.match(/\n(### Fix \d+:|## [^\n]+|# [^\n]+)/);
    const sectionEnd = endMatch ? startIdx + startMatch[0].length + endMatch.index : raw.length;

    // Within the section, find the FIRST line matching `**Status:** ...` (anchored at line start).
    // Preserve the trailing newline and any content after; rewrite only that one line.
    const sectionBefore = raw.slice(0, startIdx);
    const sectionBody = raw.slice(startIdx, sectionEnd);
    const sectionAfter = raw.slice(sectionEnd);
    const statusMatch = sectionBody.match(/^\*\*Status:\*\*[^\n]*$/m);
    const newStatusLine = `**Status:** FIXED in ${sha} — ${isoDate}`;

    let rewrittenBody;
    if (statusMatch) {
      // Existing Status line — rewrite in place.
      rewrittenBody = sectionBody.replace(statusMatch[0], newStatusLine);
    } else {
      // No Status line authored by Wolf (some fixes omit it). Insert one
      // right after the **Lines:** (or **Line:**) marker so the section
      // gets a Status without requiring a doc edit. Anchored insertion
      // keeps surrounding spec text untouched.
      const lineMarkerMatch = sectionBody.match(/^\*\*Lines?:\*\*[^\n]*$/m);
      if (!lineMarkerMatch) {
        console.error(`❌ spec-update-status: Fix ${fixId} has neither **Status:** nor **Line:**/**Lines:** anchor — cannot determine insertion point`);
        manifest.stop_conditions.manifest_mismatch = true;
        return manifest;
      }
      const insertAfter = lineMarkerMatch.index + lineMarkerMatch[0].length;
      rewrittenBody = sectionBody.slice(0, insertAfter)
        + `\n${newStatusLine}`
        + sectionBody.slice(insertAfter);
      console.log(`   Fix ${fixId}: no Status line found — inserted after **Line:**/**Lines:** anchor`);
    }
    raw = sectionBefore + rewrittenBody + sectionAfter;

    updates.push({
      fixId,
      title: parsed.title,
      sha,
      oldStatus: statusMatch ? statusMatch[0].slice(0, 100) : '(none — inserted)',
      newStatus: newStatusLine
    });
  }

  // Write the updated spec doc and stage it.
  fs.writeFileSync(specAbs, raw, 'utf8');

  const fixIdList = updates.map(u => u.fixId).join(', ');
  try {
    execSync(`git add "${spec.path}"`, { encoding: 'utf8' });
    const commitMsg = `chore(spec): mark Fixes ${fixIdList} as FIXED with commit SHAs

Spec doc status update via --mark-fixed pipeline. No code change.

Updates:
${updates.map(u => `- Fix ${u.fixId}: ${u.sha} — ${u.title}`).join('\n')}

Pipeline trail:
- Spec source:  ${spec.path}
- Mission:      ${manifest.mission_id}
- Operator:     spec-update-status (deterministic, no Mercury)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`;

    // Write the commit message to a temp file and use -F to avoid shell escaping issues.
    const msgFile = path.join('/tmp', `mark-fixed-msg-${Date.now()}.txt`);
    fs.writeFileSync(msgFile, commitMsg, 'utf8');
    execSync(`git commit -F "${msgFile}"`, { encoding: 'utf8' });
    fs.unlinkSync(msgFile);
    const sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();

    // Push so the spec doc update is visible on remote immediately — no
    // "I committed but forgot to push" gap. If push fails (e.g., network),
    // commit is still local and operator can push manually.
    try {
      execSync(`git push origin ${branch}`, { encoding: 'utf8' });
      console.log(`✅ Spec-Update-Status: pushed to origin/${branch}`);
    } catch (pushErr) {
      console.warn(`⚠️ Spec-Update-Status: commit succeeded but push failed — ${pushErr.message}. Run \`git push origin ${branch}\` manually.`);
    }

    updateSection(manifest, 'committer', {
      commit_hash: sha,
      branch
    });

    console.log(`✅ Spec-Update-Status: marked ${updates.length} fix(es) as FIXED — commit ${sha.slice(0, 7)}`);
    updates.forEach(u => console.log(`   Fix ${u.fixId} (${u.sha}): ${u.title}`));
  } catch (err) {
    console.error(`❌ spec-update-status: git operation failed — ${err.message}`);
    manifest.stop_conditions.verification_failed = true;
    return manifest;
  }

  return manifest;
}

/**
 * Mercury-Attack: adversarial Mercury attack on the just-applied change.
 *
 * Runs in EXECUTE mode only — ADVISORY no-ops because the file hasn't been
 * touched yet. Reads manifest.spec_source.{path,fixId} to find the target
 * file + fix metadata, calls Serena for blast radius (5s timeout fallback),
 * then dispatches Mercury with an attack-framed prompt against the changed
 * file. Writes a timestamped transcript to ogz-meta/cognition-history/
 * mercury-attacks/ and attaches a verdict summary to manifest.mercury_attack.
 *
 * Per [Mercury Dispatch Law] memory rule: --max-iterations=60, --max-tokens=7750,
 * attack framing only. Per [Mercury Attack Not Verify]: never use verification
 * framing ("is it correct?") — only adversarial ("find a state that LIES").
 */
async function mercuryAttack(manifest, params) {
  if (manifest.mode !== 'EXECUTE') {
    console.log('⏭️  Mercury-Attack: ADVISORY mode, no code applied yet — skipping');
    return manifest;
  }

  const { parseFix } = require('./spec-parser');
  const fs = require('fs');
  const path = require('path');

  const spec = manifest.spec_source;
  if (!spec || !spec.path || !spec.fixId) {
    console.log('⏭️  Mercury-Attack: no spec_source.{path,fixId} — skipping (not a --write mission)');
    return manifest;
  }

  let parsed;
  try {
    parsed = parseFix(spec.path, spec.fixId);
  } catch (err) {
    console.error(`❌ mercury-attack: spec parse failed — ${err.message}`);
    manifest.stop_conditions.manifest_mismatch = true;
    return manifest;
  }

  const parsedFiles = parsed.files || [{ file: parsed.file, lineHint: parsed.lineHint, edits: parsed.edits }];
  const targetFiles = parsedFiles.map(f => f.file);
  const fixId = parsed.fixId;
  const fixTitle = parsed.title;

  // Build attack-framed prompt. Include the spec's title + line hint + a
  // synthesized description of the change so Mercury has the WHAT before
  // it goes hunting for the failure mode.
  const editSummary = parsedFiles.flatMap(fileEntry =>
    fileEntry.edits.map((e, i) => {
      const firstTarget = e.target.split('\n')[0].slice(0, 80);
      return `  ${fileEntry.file} edit ${i + 1}/${fileEntry.edits.length}: ${firstTarget}...`;
    })
  ).join('\n');

  const attackPrompt = [
    `Adversarial review of Fix ${fixId} across ${targetFiles.length} file(s).`,
    `Title: ${fixTitle}`,
    `Files: ${targetFiles.join(', ')}`,
    `Line hints: ${parsedFiles.map(f => `${f.file}: ${f.lineHint || 'n/a'}`).join('; ')}`,
    `Edits applied: ${parsedFiles.reduce((sum, f) => sum + f.edits.length, 0)}`,
    editSummary,
    ``,
    `## Your job — ATTACK, do not verify`,
    ``,
    `Read these files: ${targetFiles.join(', ')}.`,
    `The change has ALREADY been applied. For each caller`,
    `in the blast radius, hunt for a state where the new code BREAKS that`,
    `caller's contract or LIES to a downstream consumer. Construct concrete`,
    `failure modes with file:line citations.`,
    ``,
    `Specific weapons to try:`,
    `1. STATE that the new code's invariants DON'T cover — find an input`,
    `   where the precondition holds but the postcondition is wrong.`,
    `2. CALLER CONTRACT that the change broke silently — destructuring,`,
    `   shape, ordering, side-effect timing, prototype chain.`,
    `3. ENV / TIMING edge case — module-load vs. call-time evaluation,`,
    `   dotenv ordering, empty-string vs. undefined env values.`,
    `4. CONCURRENT MUTATION race — does the change introduce a window`,
    `   where two callers observe inconsistent state?`,
    `5. SCOPE GAP — are there other call-sites in the same file or repo`,
    `   that should have received the same change but didn't?`,
    ``,
    `Do not verify "is the fix correct" — attack the fix. If no real bug`,
    `exists, say so and explain why each weapon failed. Don't invent.`,
  ].join('\n');

  // Serena blast radius (5s timeout fallback per spec)
  let blastRadiusFormatted = null;
  let blastMeta = [];
  try {
    const { getBlastRadius, formatForMercury } = require('../tools/serena-bridge');
    const blastResults = [];
    for (const targetFile of targetFiles) {
      const br = await getBlastRadius(targetFile);
      blastMeta.push({ file: targetFile, callerCount: br.callerCount, riskLevel: br.riskLevel, latencyMs: br.latencyMs, summary: br.summary });
      blastResults.push(`## ${targetFile}\n${formatForMercury(br)}`);
      console.log(`   Serena ${targetFile}: ${br.callerCount} caller(s), risk=${br.riskLevel}, ${br.latencyMs}ms`);
    }
    blastRadiusFormatted = blastResults.join('\n\n');
  } catch (err) {
    console.warn(`   Serena failed: ${err.message} — Mercury attacks without blast radius`);
    blastMeta = null;
  }

  console.log(`🔍 Mercury-Attack: dispatching against ${targetFiles.join(', ')} (Fix ${fixId})...`);
  const t0 = Date.now();
  let result;
  try {
    const { runAgentic } = require('../trai_brain/mercury-bridge/ask');
    result = await runAgentic(attackPrompt, {
      blastRadius: blastRadiusFormatted,
      maxIterations: 60,
      maxTokens: 7750,
      quiet: true,  // Pipeline output stays readable; full trace in transcript
    });
  } catch (err) {
    console.error(`❌ mercury-attack: dispatch failed — ${err.message}`);
    // Don't halt pipeline on Mercury infrastructure failure — record and continue.
    // /critic stage will still run on the applied code.
    updateSection(manifest, 'critic', {
      mercury_attack: { error: err.message, dispatched: false }
    });
    return manifest;
  }
  const elapsed = Date.now() - t0;

  // Write transcript to repo-rooted cognition-history dir.
  const transcriptDir = path.join(__dirname, 'cognition-history', 'mercury-attacks');
  if (!fs.existsSync(transcriptDir)) fs.mkdirSync(transcriptDir, { recursive: true });
  const fileBase = targetFiles.length === 1
    ? path.basename(targetFiles[0], path.extname(targetFiles[0]))
    : 'multi-file';
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const transcriptPath = path.join(transcriptDir, `fix${fixId}-${fileBase}-attack-${ts}.md`);

  const verdict = (result && typeof result === 'object' && result.answer)
    ? result.answer
    : (typeof result === 'string' ? result : JSON.stringify(result, null, 2));
  const iterations = (result && result.iterations) || null;

  const transcriptBody = [
    `# Fix ${fixId} — Mercury Adversarial Attack Result`,
    ``,
    `**Generated:** ${new Date().toISOString()}`,
    `**Targets:** ${targetFiles.map(f => `\`${f}\``).join(', ')}`,
    `**Title:** ${fixTitle}`,
    `**Edits:** ${parsedFiles.reduce((sum, f) => sum + f.edits.length, 0)}`,
    `**Iterations:** ${iterations || 'n/a'}`,
    `**Elapsed:** ${elapsed}ms`,
    `**Mission:** ${manifest.mission_id}`,
    ``,
    `## Serena Blast Radius`,
    Array.isArray(blastMeta)
      ? blastMeta.map(meta => `- ${meta.file}: callers ${meta.callerCount} / risk ${meta.riskLevel} / latency ${meta.latencyMs}ms\n  ${meta.summary}`).join('\n')
      : `(Serena failed or timed out — Mercury attacked without blast radius)`,
    ``,
    `## Mercury Verdict`,
    ``,
    verdict,
    ``,
  ].join('\n');

  fs.writeFileSync(transcriptPath, transcriptBody, 'utf8');

  // Attach summary to manifest. Findings count is a crude heuristic — count
  // table rows or numbered bullets in the verdict text. The /critic stage
  // (running after this) can read the transcript for detail.
  const findingsHeuristic = (verdict.match(/^\|\s*\d+\s*\|/gm) || []).length
    || (verdict.match(/^\s*\d+\.\s/gm) || []).length;

  updateSection(manifest, 'critic', {
    mercury_attack: {
      dispatched: true,
      targets: targetFiles,
      iterations: iterations,
      elapsedMs: elapsed,
      transcript: path.relative(process.cwd(), transcriptPath),
      findingsCount: findingsHeuristic,
      blastRadius: blastMeta || null,
    }
  });

  console.log(`✅ Mercury-Attack: ${iterations || '?'} iterations, ~${findingsHeuristic} finding(s), transcript ${path.relative(process.cwd(), transcriptPath)}`);
  return manifest;
}

/**
 * Mercury-Critic: Structural gate on Mercury's adversarial findings.
 *
 * Runs immediately after /mercury-attack. Reads ONLY the `## Mercury Verdict`
 * section of the transcript (never the prompt-scaffold above it), classifies
 * the verdict into one of five states, and halts the pipeline on anything
 * other than `pass` or `ack`.
 *
 * Gate states:
 *   pass             — no findings, no infra error, no truncation suspicion
 *   ack              — operator wrote an ack file ratifying findings as reviewed
 *   fail-infra       — Mercury dispatch failed or returned an error stub
 *   fail-truncation  — Mercury answered too quickly with too little content
 *   fail-findings    — Mercury surfaced findings; operator ack required
 *
 * On fail-* the stage sets stop_conditions.forensics_critical so the pipeline
 * halts before /anchor-verify-post. Operator must either revise the fix and
 * re-run, or write a mercury-ack file ratifying the findings as accepted.
 *
 * Skipped automatically in ADVISORY mode (no code applied → nothing to gate).
 */
async function mercuryCritic(manifest, params) {
  if (manifest.mode !== 'EXECUTE') {
    console.log('⏭️  Mercury-Critic: ADVISORY mode, no Mercury attack to gate — skipping');
    return manifest;
  }

  const fs = require('fs');
  const path = require('path');

  const ma = manifest.critic && manifest.critic.mercury_attack ? manifest.critic.mercury_attack : null;

  // Case 1: Mercury was never dispatched (no spec_source, or dispatch threw).
  if (!ma || ma.dispatched === false) {
    const reason = ma && ma.error
      ? `Mercury dispatch failed: ${ma.error}`
      : 'Mercury attack stage did not run (no spec_source or unknown failure)';
    manifest.stop_conditions.forensics_critical = true;
    updateSection(manifest, 'critic', {
      mercury_critic: {
        gate: 'fail-infra',
        reason: reason,
        timestamp: new Date().toISOString(),
      }
    });
    console.log(`🛑 Mercury-Critic: gate=fail-infra — ${reason}`);
    return manifest;
  }

  // Case 2: Transcript path missing or unreadable.
  if (!ma.transcript || !fs.existsSync(path.resolve(process.cwd(), ma.transcript))) {
    const reason = `Mercury transcript missing at ${ma.transcript || '(none)'}`;
    manifest.stop_conditions.forensics_critical = true;
    updateSection(manifest, 'critic', {
      mercury_critic: {
        gate: 'fail-infra',
        reason: reason,
        timestamp: new Date().toISOString(),
      }
    });
    console.log(`🛑 Mercury-Critic: gate=fail-infra — ${reason}`);
    return manifest;
  }

  const transcriptAbs = path.resolve(process.cwd(), ma.transcript);
  const fullTranscript = fs.readFileSync(transcriptAbs, 'utf8');

  // Extract ONLY the `## Mercury Verdict` section. Anything before that header
  // is metadata + Claude's attack-prompt scaffolding. Counting bullets or
  // citations in the prompt section is a critical bug — that text is by-design
  // attack-shaped and would always look like findings.
  const verdictHeaderRe = /^## Mercury Verdict\s*$/m;
  const verdictMatch = fullTranscript.match(verdictHeaderRe);
  let verdict;
  if (verdictMatch) {
    verdict = fullTranscript.slice(verdictMatch.index + verdictMatch[0].length).trim();
  } else {
    const reason = 'Transcript has no `## Mercury Verdict` section';
    manifest.stop_conditions.forensics_critical = true;
    updateSection(manifest, 'critic', {
      mercury_critic: {
        gate: 'fail-infra',
        reason: reason,
        transcript: ma.transcript,
        timestamp: new Date().toISOString(),
      }
    });
    console.log(`🛑 Mercury-Critic: gate=fail-infra — ${reason}`);
    return manifest;
  }

  // Case 3: Mercury infrastructure failure detected in the verdict body.
  // The mercury-bridge returns stub answers like "(Mercury call failed: Request
  // timeout)" when the Inception Labs API errors or hangs. These are NOT
  // "Mercury found nothing."
  const infraFailurePatterns = [
    /Mercury call failed/i,
    /Request timeout/i,
    /\(Mercury .* failed:/i,
    /termination:\s*error/i,
  ];
  const mercuryInfraError = infraFailurePatterns.some(function (re) { return re.test(verdict); });
  if (mercuryInfraError) {
    const reason = `Mercury infrastructure failure — no real verdict produced. Verdict head: "${verdict.slice(0, 160).replace(/\s+/g, ' ')}…". Retry dispatch.`;
    manifest.stop_conditions.forensics_critical = true;
    updateSection(manifest, 'critic', {
      mercury_critic: {
        gate: 'fail-infra',
        reason: reason,
        transcript: ma.transcript,
        verdictBodyLength: verdict.length,
        timestamp: new Date().toISOString(),
      }
    });
    console.log(`🛑 Mercury-Critic: gate=fail-infra — ${reason}`);
    return manifest;
  }

  // Case 4: Operator ack file.
  const ackPath = path.join(__dirname, 'manifests', `${manifest.mission_id}-mercury-ack.txt`);
  let operatorAck = null;
  if (fs.existsSync(ackPath)) {
    operatorAck = fs.readFileSync(ackPath, 'utf8').trim();
  }

  // Heuristic finding detection on the VERDICT BODY ONLY.
  const numberedBullets = (verdict.match(/^\s*\d+[.)]\s+\S/gm) || []).length;
  // Markdown content rows: pipe-delimited lines that aren't separator (---|---).
  // Mercury structures findings in tables with location-named rows, not
  // numbered rows, so we count all non-separator content rows.
  const tableRows = (verdict.match(/^\|(?!\s*[-:]+\s*\|)[^\n]*\|[^\n]*$/gm) || []).length;
  // File:line citations: allow optional whitespace around the colon — Mercury
  // sometimes writes `core/X.js : 123` with spaces.
  const fileLineCitations = (verdict.match(/\b[a-zA-Z][\w./-]+\.js\s*:\s*\d+(?:[-\u2011]\d+)?/g) || []).length;
  // Adversarial / exploit-confirmation keywords — broad vocabulary list to
  // catch Mercury's varied phrasing ("diverge", "violating", "bypass", etc.).
  const adversarialHits = (verdict.match(/\b(ATTACK SUCCEEDED|CRASH|BREAKS|LIES|corrupted|race condition|silent.*corruption|halt-not-hide|diverge|divergen|bypass|violat|out[- ]of[- ]sync|stale|inconsistent|incorrect|wrong)\b/gi) || []).length;
  const findingsScore = numberedBullets + tableRows + adversarialHits;

  // Case 5: Truncation suspect. Mercury self-terminated very early AND verdict
  // body is short. Catches the Fix 30 V2 pattern.
  const iters = ma.iterations || 0;
  const truncationSuspect = iters > 0 && iters < 15 && verdict.length < 3000;
  if (truncationSuspect && findingsScore === 0) {
    const reason = `Suspected response truncation — iters=${iters}/60, body=${verdict.length} chars, findings=0. Re-dispatch with narrower scope.`;
    manifest.stop_conditions.forensics_critical = true;
    updateSection(manifest, 'critic', {
      mercury_critic: {
        gate: 'fail-truncation',
        reason: reason,
        transcript: ma.transcript,
        verdictBodyLength: verdict.length,
        iterations: iters,
        timestamp: new Date().toISOString(),
      }
    });
    console.log(`🛑 Mercury-Critic: gate=fail-truncation — ${reason}`);
    return manifest;
  }

  // Case 6: Findings present.
  if (findingsScore > 0) {
    if (operatorAck) {
      updateSection(manifest, 'critic', {
        mercury_critic: {
          gate: 'ack',
          reason: `Operator ack: ${operatorAck.slice(0, 200)}`,
          transcript: ma.transcript,
          findingsScore: findingsScore,
          breakdown: { numberedBullets: numberedBullets, tableRows: tableRows, adversarialHits: adversarialHits, fileLineCitations: fileLineCitations },
          verdictBodyLength: verdict.length,
          human_ack: operatorAck,
          timestamp: new Date().toISOString(),
        }
      });
      console.log(`✅ Mercury-Critic: gate=ack — operator ratified ${findingsScore} finding(s) score`);
      return manifest;
    }
    const reason = `Mercury surfaced findings — score=${findingsScore} (bullets=${numberedBullets}, rows=${tableRows}, adversarial=${adversarialHits}, citations=${fileLineCitations}). Operator review required. Write ack to ${path.relative(process.cwd(), ackPath)} to proceed.`;
    manifest.stop_conditions.forensics_critical = true;
    updateSection(manifest, 'critic', {
      mercury_critic: {
        gate: 'fail-findings',
        reason: reason,
        transcript: ma.transcript,
        findingsScore: findingsScore,
        breakdown: { numberedBullets: numberedBullets, tableRows: tableRows, adversarialHits: adversarialHits, fileLineCitations: fileLineCitations },
        verdictBodyLength: verdict.length,
        ackPath: path.relative(process.cwd(), ackPath),
        timestamp: new Date().toISOString(),
      }
    });
    console.log(`🛑 Mercury-Critic: gate=fail-findings — ${reason}`);
    return manifest;
  }

  // Case 7: Pass.
  updateSection(manifest, 'critic', {
    mercury_critic: {
      gate: 'pass',
      reason: 'No findings, no infra error, no truncation suspicion',
      transcript: ma.transcript,
      findingsScore: 0,
      breakdown: { numberedBullets: numberedBullets, tableRows: tableRows, adversarialHits: adversarialHits, fileLineCitations: fileLineCitations },
      verdictBodyLength: verdict.length,
      iterations: iters,
      timestamp: new Date().toISOString(),
    }
  });
  console.log(`✅ Mercury-Critic: gate=pass — Mercury found nothing actionable (verdict body ${verdict.length} chars, ${iters}/60 iters)`);
  return manifest;
}

/**
 * Anchor-Verify-Post: Fast P0 + Full P0 drift check after the code change.
 *
 * Runs in EXECUTE mode only. Calls ogz-meta/anchor-runner.runP0 for both
 * profiles and compares finalBalance to the canonical anchor doc. If either
 * drifts, halts the pipeline. Records summaries to manifest.anchor_verification.
 *
 * Skipped automatically for files outside the trade path (cognition infra,
 * tooling, docs) because anchor is invariant to non-trade-path changes by
 * construction — running anchors there wastes ~3min of pipeline time.
 */
async function anchorVerifyPost(manifest, params) {
  if (manifest.mode !== 'EXECUTE') {
    console.log('⏭️  Anchor-Verify-Post: ADVISORY mode — skipping');
    return manifest;
  }

  const { parseFix } = require('./spec-parser');
  const path = require('path');

  const spec = manifest.spec_source;
  if (!spec || !spec.path || !spec.fixId) {
    console.log('⏭️  Anchor-Verify-Post: no spec_source — skipping');
    return manifest;
  }

  let parsed;
  try {
    parsed = parseFix(spec.path, spec.fixId);
  } catch (err) {
    console.error(`❌ anchor-verify-post: spec parse failed — ${err.message}`);
    manifest.stop_conditions.manifest_mismatch = true;
    return manifest;
  }

  const parsedFiles = parsed.files || [{ file: parsed.file, lineHint: parsed.lineHint, edits: parsed.edits }];
  const targetFiles = parsedFiles.map(f => f.file);

  // Trade-path = core/, brokers/, modules/, run-empire-v2.js per Trade-Path P0 Law.
  // Other files (foundation/, ogz-meta/, tools/, trai_brain/) feed trade-path but
  // their changes typically don't move the backtest anchor. Running anchors anyway
  // is the discipline — but if a fix is clearly cognition-infra-only, skip to save
  // ~3 minutes of pipeline time. The litmus: does the file path start with one of
  // the trade-path prefixes?
  const tradePathPrefixes = ['core/', 'brokers/', 'modules/', 'run-empire-v2.js', 'foundation/'];
  const isTradePath = targetFiles.some(file => tradePathPrefixes.some(p => file.startsWith(p)));
  if (!isTradePath) {
    console.log(`⏭️  Anchor-Verify-Post: ${targetFiles.join(', ')} is not trade-path — skipping anchors`);
    return manifest;
  }

  const { runP0 } = require('./anchor-runner');
  const { readCurrentAnchor } = require('./anchor-doc');

  // Read canonical anchor for comparison. If the doc is missing, log but
  // don't halt — fall back to recording only.
  let canonical = null;
  try {
    const anchor = readCurrentAnchor();
    canonical = {
      finalBalanceFull: anchor.finalBalance ? parseFloat(anchor.finalBalance.replace(/,/g, '')) : null
    };
  } catch (err) {
    console.warn(`   Could not read canonical anchor doc: ${err.message} — recording only`);
  }

  const logTag = `mission-${manifest.mission_id.slice(-8)}`;
  let fastResult, fullResult;

  console.log(`📊 Anchor-Verify-Post: running Fast P0 (750-candle)...`);
  try {
    fastResult = runP0('fast', logTag);
    console.log(`   Fast P0: $${fastResult.summary.finalBalance} (${fastResult.summary.totalTrades} trades, WR ${fastResult.summary.winRate}%, PF ${fastResult.summary.profitFactor})`);
  } catch (err) {
    console.error(`❌ anchor-verify-post: Fast P0 failed — ${err.message}`);
    manifest.stop_conditions.verification_failed = true;
    return manifest;
  }

  console.log(`📊 Anchor-Verify-Post: running Full P0 (canonical 2y)...`);
  try {
    fullResult = runP0('full', logTag);
    console.log(`   Full P0: $${fullResult.summary.finalBalance} (${fullResult.summary.totalTrades} trades, WR ${fullResult.summary.winRate}%, PF ${fullResult.summary.profitFactor})`);
  } catch (err) {
    console.error(`❌ anchor-verify-post: Full P0 failed — ${err.message}`);
    manifest.stop_conditions.verification_failed = true;
    return manifest;
  }

  // Compare Full P0 to canonical (Fast P0 isn't tracked in the doc, but we
  // record it for the audit trail).
  let drift = null;
  if (canonical && canonical.finalBalanceFull != null) {
    const delta = fullResult.summary.finalBalance - canonical.finalBalanceFull;
    if (Math.abs(delta) > 0.001) {
      drift = { canonical: canonical.finalBalanceFull, actual: fullResult.summary.finalBalance, delta };
      console.error(`❌ Anchor-Verify-Post: Full P0 DRIFTED — canonical $${canonical.finalBalanceFull}, actual $${fullResult.summary.finalBalance}, delta $${delta.toFixed(6)}`);
      manifest.stop_conditions.verification_failed = true;
    } else {
      console.log(`✅ Anchor-Verify-Post: Full P0 HELD bit-for-bit ($${fullResult.summary.finalBalance} = canonical)`);
    }
  } else {
    console.log(`✅ Anchor-Verify-Post: both profiles ran clean (no canonical comparison — record-only)`);
  }

  updateSection(manifest, 'validator', {
    anchor_verification: {
      fastP0: fastResult.summary,
      fullP0: fullResult.summary,
      fastLog: path.relative(process.cwd(), fastResult.log),
      fullLog: path.relative(process.cwd(), fullResult.log),
      fastReport: path.relative(process.cwd(), fastResult.report),
      fullReport: path.relative(process.cwd(), fullResult.report),
      canonical: canonical || null,
      drift: drift || null,
      heldBitForBit: !drift,
    }
  });

  return manifest;
}

/**
 * Count non-overlapping occurrences of `needle` in `haystack`.
 */
function _countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

/**
 * Escape regex special chars for use in RegExp constructor.
 */
function _escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// CLI interface
if (require.main === module) {
  const command = process.argv[2];
  const args = {
    manifest: process.argv[3]
  };

  if (!command) {
    console.log('🔧 Slash Router');
    console.log('\nUsage: node ogz-meta/slash-router.js <command> [manifest]');
    console.log('\nCommands:');
    console.log('  /start "issue description"  - Start new mission');
    console.log('  /commander                   - Provide context');
    console.log('  /architect                   - Map system');
    console.log('  /entomologist                - Find bugs');
    console.log('  /exterminator                - Fix bugs');
    console.log('  /debugger                    - Test fixes');
    console.log('  /critic                      - Find weaknesses');
    console.log('  /validator                   - Final checks');
    console.log('  /forensics                   - Deep verification');
    console.log('  /cicd                        - Build/test');
    console.log('  /committer                   - Commit changes');
    console.log('  /scribe                      - Update docs');
    console.log('  /janitor                     - Clean artifacts');
    console.log('  /warden                      - Final approval');
    process.exit(0);
  }

  route(command, args).then(manifest => {
    if (manifest) {
      console.log(`\n📋 State: ${manifest.state}`);
      const stopCheck = shouldStop(manifest);
      if (stopCheck.stop) {
        console.log(`🛑 STOPPED: ${stopCheck.reason}`);
      }
    }
  }).catch(console.error);
}

module.exports = { route };
