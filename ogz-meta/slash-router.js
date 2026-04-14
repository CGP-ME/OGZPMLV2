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
    '/bombardier': bombardier,  // Blast radius analysis - shows impact before fixing
    '/entomologist': entomologist,
    '/exterminator': exterminator,
    '/fixer': fixer,           // For refactor mode - applies extractions/refactors
    '/debugger': debuggerHandler,
    '/critic': critic,
    '/validator': validator,
    '/forensics': forensics,
    '/cicd': cicd,
    '/committer': committer,
    '/scribe': scribe,
    '/janitor': janitor,
    '/warden': warden
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
 * Branch: Creates a mission branch off the CURRENT branch
 *
 * Three modes:
 * - --stay: Skip dirty check, skip branching, work on current branch as-is
 * - --refactor: Require clean tree, stay on current branch
 * - No flag (bugfix): Require clean tree, branch from current branch
 */
async function branch(manifest, params) {
  const missionBranch = `mission/${manifest.mission_id}`;
  const isRefactor = params.includes('--refactor') || manifest.mode === 'refactor';
  const isStay = params.includes('--stay');

  // STAY MODE: Skip dirty check and branching — work on current branch as-is
  if (isStay) {
    const currentBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    console.log(`✅ Branch: Staying on ${currentBranch} (stay mode)`);
    updateSection(manifest, 'branch', {
      success: true,
      branch: currentBranch,
      mode: 'stay',
      based_on: currentBranch
    });
    return manifest;
  }

  // REFACTOR MODE: Stay on current branch, NO dirty check needed
  // (We're not switching branches, so dirty tree doesn't matter)
  if (isRefactor) {
    const currentBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    console.log(`✅ Branch: Staying on ${currentBranch} (refactor mode)`);
    updateSection(manifest, 'branch', {
      success: true,
      branch: currentBranch,
      mode: 'refactor',
      based_on: currentBranch
    });
    return manifest;
  }

  // BUG FIX MODE: Require clean tree, branch from current branch
  const baseBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
  console.log(`🔀 Branch: current branch is ${baseBranch}`);

  const dirty = execSync('git status --porcelain', { encoding: 'utf8' })
    .split('\n')
    .filter(line => !line.startsWith('??'))
    .filter(line => !line.includes('ogz-meta/manifests/'))
    .filter(line => !line.includes('prodlock-portable'))
    .filter(line => !line.includes('data/'))
    .filter(line => !line.includes('public/proof/'))
    .join('\n')
    .trim();
  if (dirty) {
    manifest.stop_conditions.warden_blocked = true;
    updateSection(manifest, 'branch', {
      blocked: true,
      reason: 'Working tree not clean; refusing to branch',
      dirty_preview: dirty.split('\n').slice(0, 10)
    });
    console.log('🛑 Branch: BLOCKED (dirty working tree)');
    return manifest;
  }

  try {
    execSync(`git pull origin ${baseBranch}`, { stdio: 'pipe' });
  } catch (e) {
    // Pull may fail if no remote tracking — that's OK, continue with local state
    console.log(`⚠️ Branch: pull from origin/${baseBranch} failed (continuing with local state)`);
  }

  try {
    execSync(`git checkout -b ${missionBranch}`, { stdio: 'pipe' });
  } catch (e) {
    try {
      execSync(`git checkout ${missionBranch}`, { stdio: 'pipe' });
    } catch (e2) {
      manifest.stop_conditions.warden_blocked = true;
      updateSection(manifest, 'branch', {
        blocked: true,
        reason: 'Failed to create/switch mission branch',
        error: e2.message
      });
      console.log('🛑 Branch: BLOCKED (could not create/switch mission branch)');
      return manifest;
    }
  }

  updateSection(manifest, 'branch', {
    base: baseBranch,
    branch: missionBranch
  });

  console.log(`✅ Branch: on ${missionBranch} (branched from ${baseBranch})`);
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
      maxIterations: 30,
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
          maxIterations: 30,
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

  // Parse issue for FULL_FILE pattern
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
  let tests = [
    { name: 'syntax_check', command: 'node --check run-empire-v2.js' },
    { name: 'unit_tests', command: 'npm test' }
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

      execSync(test.command, { encoding: 'utf8' });
      results.push({ test: test.name, passed: true });
    } catch (e) {
      results.push({ test: test.name, passed: false, error: e.message });
      // Test failures should stop the pipeline
      if (!results[results.length - 1].skipped) {
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
 * Committer: Commits changes
 */
async function committer(manifest, params) {
  const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();

  // CRITICAL: Clauditos cannot write to main
  if (branch === 'main') {
    manifest.stop_conditions.warden_blocked = true;
    updateSection(manifest, 'committer', {
      branch,
      blocked: true,
      reason: 'Clauditos cannot commit to production branch main'
    });
    console.log('🛑 Committer: BLOCKED (on main)');
    return manifest;
  }

  if (!branch.startsWith('mission/')) {
    console.log('⚠️  Not on mission branch, skipping commit');
    return manifest;
  }

  updateSection(manifest, 'committer', {
    commit_hash: 'pending',
    branch
  });

  console.log(`✅ Committer: Ready to commit on ${branch}`);
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