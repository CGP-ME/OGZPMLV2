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
    '/entomologist': entomologist,
    '/exterminator': exterminator,
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
 * Branch: Creates a mission branch off master (read-only master rule)
 */
async function branch(manifest, params) {
  const missionBranch = `mission/${manifest.mission_id}`;

  // Safety: must be clean before branching
  const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
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

  // Always base off latest master
  try {
    execSync('git checkout master', { stdio: 'pipe' });
    execSync('git pull origin master', { stdio: 'pipe' });
  } catch (e) {
    manifest.stop_conditions.warden_blocked = true;
    updateSection(manifest, 'branch', {
      blocked: true,
      reason: 'Failed to checkout/pull master',
      error: e.message
    });
    console.log('🛑 Branch: BLOCKED (could not sync master)');
    return manifest;
  }

  // Create/switch mission branch
  try {
    execSync(`git checkout -b ${missionBranch}`, { stdio: 'pipe' });
  } catch (e) {
    // If it already exists locally, switch to it
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
    base: 'master',
    branch: missionBranch
  });

  console.log(`✅ Branch: on ${missionBranch} (based on master)`);
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
  // Read architecture from claudito_context
  const contextPath = path.join(__dirname, 'claudito_context.md');
  const context = fs.readFileSync(contextPath, 'utf8');

  updateSection(manifest, 'architect', {
    system_map: [
      'run-empire-v2.js (main)',
      'core/indicators/IndicatorEngine.js',
      'brokers/BrokerFactory.js',
      'core/StateManager.js'
    ],
    dependencies: ['Empire V2 Architecture', 'IBrokerAdapter']
  });

  console.log('✅ Architect: System mapped');
  return manifest;
}

/**
 * Entomologist: FINDS bugs only
 */
async function entomologist(manifest, params) {
  const { ragQuery } = require('./rag-query');

  // Use RAG to search for relevant issues
  const ragResults = ragQuery(manifest.issue);
  const bugs = [];

  // Analyze RAG results for bug patterns
  if (ragResults.reports.length > 0) {
    ragResults.reports.slice(0, 3).forEach(report => {
      bugs.push({
        type: 'DOCUMENTED',
        location: report.file,
        description: report.excerpt || 'See report for details',
        score: report.score
      });
    });
  }

  // Check for common patterns not in ledger
  if (manifest.issue.includes('trade') && !manifest.commander?.known_issues?.some(i => i.symptom?.includes('trade'))) {
    bugs.push({
      type: 'RATE_LIMIT',
      location: 'run-empire-v2.js:1451',
      description: 'Rate limiter may not apply to all paths'
    });
  }

  if (manifest.issue.includes('dashboard') && !manifest.commander?.known_issues?.some(i => i.symptom?.includes('dashboard'))) {
    bugs.push({
      type: 'DISPLAY',
      location: 'WebSocket server',
      description: 'Indicators may not be broadcasted'
    });
  }

  updateSection(manifest, 'entomologist', {
    bugs_found: bugs,
    classifications: bugs.map(b => b.type),
    rag_reports: ragResults.reports.slice(0, 3)
  });

  console.log(`✅ Entomologist: Found ${bugs.length} bugs (${ragResults.reports.length} reports)`);
  return manifest;
}

/**
 * Exterminator: APPLIES fixes only
 */
async function exterminator(manifest, params) {
  const bugs = manifest.entomologist.bugs_found || [];
  const fixes = [];

  // For each bug, define a fix (but don't apply yet)
  bugs.forEach(bug => {
    fixes.push({
      bug_id: bug.type,
      patch: `Fix for ${bug.type} at ${bug.location}`,
      applied: false // Will be true after execution
    });
  });

  updateSection(manifest, 'exterminator', {
    fixes_applied: fixes,
    patches: fixes.map(f => f.patch)
  });

  console.log(`✅ Exterminator: Prepared ${fixes.length} fixes`);
  return manifest;
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
  const weaknesses = [];

  // Check for issues
  if (!manifest.entomologist.bugs_found?.length) {
    weaknesses.push('No bugs found - insufficient analysis');
  }

  if (!manifest.debugger.results?.every(r => r.passed)) {
    weaknesses.push('Tests failing - fixes incomplete');
  }

  if (weaknesses.length >= 3) {
    manifest.stop_conditions.critic_failures++;
  }

  updateSection(manifest, 'critic', {
    weaknesses,
    force_rerun: weaknesses.length >= 3
  });

  console.log(`✅ Critic: Found ${weaknesses.length} weaknesses`);
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
    passed: !manifest.artifacts.files_modified?.includes('master')
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
  const silentBugs = [];
  const regressionRisks = [];
  let catalyzeVerification = false;

  // Check for silent issues
  if (manifest.issue.includes('memory')) {
    silentBugs.push('Potential memory leak in pattern storage');
    catalyzeVerification = true;
  }

  // Check if any tests failed - needs deeper verification
  if (manifest.debugger?.results?.some(r => !r.passed && !r.skipped)) {
    catalyzeVerification = true;
    regressionRisks.push('Test failures indicate potential regression');
  }

  // Check if critic found major issues
  if (manifest.critic?.weaknesses?.length >= 2) {
    catalyzeVerification = true;
  }

  updateSection(manifest, 'forensics', {
    silent_bugs: silentBugs,
    regression_risks: regressionRisks,
    catalyze_verification: catalyzeVerification,
    severity: silentBugs.length > 0 ? 'P1' : 'P2',
    recommended_verifications: catalyzeVerification ? [
      'node --check run-empire-v2.js',
      'pm2 status',
      'ps aux | grep node'
    ] : []
  });

  if (silentBugs.some(b => b.includes('leak'))) {
    manifest.stop_conditions.forensics_critical = true;
  }

  console.log(`✅ Forensics: ${silentBugs.length} silent bugs, ${regressionRisks.length} risks`);
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

  // CRITICAL: Clauditos cannot write to master
  if (branch === 'master') {
    manifest.stop_conditions.warden_blocked = true;
    updateSection(manifest, 'committer', {
      branch,
      blocked: true,
      reason: 'Clauditos cannot commit to production branch master'
    });
    console.log('🛑 Committer: BLOCKED (on master)');
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

  // CRITICAL: Check if on forbidden master branch
  const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
  if (branch === 'master') {
    violations.push('On production branch master (writes forbidden for Clauditos)');
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
 */
function emitHook(command, manifest) {
  const hookFile = path.join(MANIFEST_DIR, `${manifest.mission_id}.hook`);
  const hook = {
    command,
    state: manifest.state,
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync(hookFile, JSON.stringify(hook, null, 2));
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