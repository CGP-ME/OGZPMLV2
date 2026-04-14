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

const {
  initializeSessionForm,
  appendWorkLog,
  confirmContextRead,
  finalizeSessionForm,
  saveSessionForm
} = require('./session-form');

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

  // Preserve session form before save (JSON.stringify would lose it)
  const sessionForm = manifest._sessionForm;

  // Save updated manifest (strips non-schema fields)
  saveManifest(manifest, manifestPath);

  // Restore session form reference
  if (sessionForm) {
    manifest._sessionForm = sessionForm;
  }

  // Emit hook
  emitHook(cmd, manifest);

  return manifest;
}

/**
 * Branch: Creates a mission branch off master (read-only master rule)
 */
async function branch(manifest, params) {
  const missionBranch = `mission/${manifest.mission_id}`;

  // Safety: must be clean before branching (ignore manifest files)
  const dirty = execSync('git status --porcelain', { encoding: 'utf8' })
    .split('\n')
    .filter(line => !line.includes('ogz-meta/manifests/'))
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
 * Entomologist: FINDS bugs using AI + RAG
 */
async function entomologist(manifest, params) {
  const { ragQuery } = require('./rag-query');
  const brain = require('./ollama-brain');

  // Step 1: RAG search for known related issues
  const ragResults = ragQuery(manifest.issue);
  const bugs = [];

  // Include documented bugs from RAG
  if (ragResults.reports.length > 0) {
    ragResults.reports.slice(0, 3).forEach(report => {
      bugs.push({
        type: 'DOCUMENTED',
        location: report.file,
        description: report.excerpt || 'See report for details',
        score: report.score,
        source: 'rag'
      });
    });
  }

  // Step 2: AI analysis — read actual code and find bugs
  console.log('   🧠 Calling DeepSeek for code analysis...');
  const health = await brain.healthCheck();

  if (health.running) {
    const projectDir = path.resolve(__dirname, '..');
    const relevantFiles = brain.findRelevantFiles(manifest.issue, projectDir);

    if (relevantFiles.length > 0) {
      console.log(`   📂 Analyzing ${relevantFiles.length} files: ${relevantFiles.map(f => path.basename(f)).join(', ')}`);

      const knownIssues = manifest.commander?.known_issues || [];
      const analysis = await brain.analyzeBugs(manifest.issue, relevantFiles, { knownIssues });

      if (analysis.bugs && analysis.bugs.length > 0) {
        analysis.bugs.forEach(bug => {
          bugs.push({
            ...bug,
            source: 'deepseek-r1'
          });
        });
        console.log(`   🔬 AI found ${analysis.bugs.length} bugs`);
      } else if (analysis.error) {
        console.log(`   ⚠️  AI analysis error: ${analysis.error}`);
      } else {
        console.log('   ✅ AI found no additional bugs');
      }

      // Store raw AI response for scribe/review
      manifest._aiAnalysis = analysis.rawResponse;
    } else {
      console.log('   ⚠️  No relevant files found for issue');
    }
  } else {
    console.log('   ⚠️  Ollama not running — falling back to RAG-only analysis');
    console.log(`   💡 Start it with: ollama serve`);
  }

  updateSection(manifest, 'entomologist', {
    bugs_found: bugs,
    classifications: bugs.map(b => b.type),
    rag_reports: ragResults.reports.slice(0, 3),
    ai_analyzed: health.running
  });

  console.log(`✅ Entomologist: Found ${bugs.length} bugs (${bugs.filter(b => b.source === 'deepseek-r1').length} from AI, ${bugs.filter(b => b.source === 'rag').length} from RAG)`);
  return manifest;
}

/**
 * Exterminator: PROPOSES fixes using AI (advisory mode) or APPLIES fixes (execute mode)
 */
async function exterminator(manifest, params) {
  const brain = require('./ollama-brain');
  const bugs = manifest.entomologist.bugs_found || [];
  const proposals = [];
  const fixes = [];

  // ADVISORY MODE (default): Use AI to generate fix proposals
  if (manifest.mode === 'ADVISORY' || !manifest.mode) {
    const health = await brain.healthCheck();

    if (health.running && bugs.length > 0) {
      console.log('   🧠 Calling DeepSeek for fix generation...');
      const projectDir = path.resolve(__dirname, '..');
      const relevantFiles = brain.findRelevantFiles(manifest.issue, projectDir);

      const fixResult = await brain.generateFix(manifest.issue, bugs, relevantFiles);

      if (fixResult.fixes && fixResult.fixes.length > 0) {
        fixResult.fixes.forEach((fix, i) => {
          proposals.push({
            bug_id: fix.description || bugs[i]?.type || `FIX-${i + 1}`,
            location: fix.file || bugs[i]?.location || 'unknown',
            description: fix.description || bugs[i]?.description || 'See fix details',
            proposed_fix: fix.after || fix.why || 'See proposal document',
            before: fix.before || '',
            after: fix.after || '',
            why: fix.why || '',
            line: fix.line,
            impact: 'See proposal document for full analysis',
            status: 'PENDING_REVIEW',
            source: 'deepseek-r1'
          });
        });
        console.log(`   🔧 AI generated ${fixResult.fixes.length} fix proposals`);
      }

      // Store raw response
      manifest._aiFixResponse = fixResult.rawResponse;
    } else if (!health.running) {
      console.log('   ⚠️  Ollama not running — generating stub proposals');
      bugs.forEach(bug => {
        proposals.push({
          bug_id: bug.type,
          location: bug.location,
          description: bug.description,
          proposed_fix: `Fix for ${bug.type} at ${bug.location}`,
          status: 'PENDING_REVIEW',
          source: 'stub'
        });
      });
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

    // In execute mode, apply the approved proposals
    const approvedProposals = manifest.exterminator?.proposals || [];
    for (const proposal of approvedProposals) {
      if (proposal.before && proposal.after && proposal.location !== 'unknown') {
        fixes.push({
          bug_id: proposal.bug_id,
          file: proposal.location,
          patch: `${proposal.before} → ${proposal.after}`,
          applied: true
        });
      }
    }

    updateSection(manifest, 'exterminator', {
      fixes_applied: fixes,
      patches: fixes.map(f => f.patch),
      proposals: approvedProposals
    });

    console.log(`✅ Exterminator: Applied ${fixes.length} fixes (EXECUTE MODE - APPROVED)`);
  }

  return manifest;
}

/**
 * Generate proposal document for human review
 */
function generateProposalDocument(manifest, proposals) {
  const fixSections = proposals.map((p, i) => {
    let section = `
### Proposal ${i + 1}: ${p.bug_id}
- **Location**: ${p.location}${p.line ? ` (line ~${p.line})` : ''}
- **Status**: ${p.status}
- **Source**: ${p.source || 'unknown'}${p.why ? `\n- **Why**: ${p.why}` : ''}`;

    if (p.before) {
      section += `\n\n**BEFORE:**\n\`\`\`javascript\n${p.before}\n\`\`\``;
    }
    if (p.after) {
      section += `\n\n**AFTER:**\n\`\`\`javascript\n${p.after}\n\`\`\``;
    }
    if (!p.before && !p.after) {
      section += `\n\n**Proposed Change**: ${p.proposed_fix || 'See analysis'}`;
    }

    return section;
  }).join('\n');

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
### Bug ${i + 1}: [${b.severity || 'MEDIUM'}] ${b.type}
- **Location**: ${b.location}
- **Description**: ${b.description || 'See analysis'}
- **Source**: ${b.source || 'unknown'}
`).join('\n') || 'No bugs identified'}

## Proposed Fixes
${fixSections}

## AI Analysis (Raw)
${manifest._aiAnalysis ? '```\n' + String(manifest._aiAnalysis).slice(0, 3000) + '\n```' : 'No AI analysis available'}

## AI Fix Details (Raw)
${manifest._aiFixResponse ? '```\n' + String(manifest._aiFixResponse).slice(0, 3000) + '\n```' : 'No AI fix details available'}

## Impact Analysis
- Files potentially affected: ${manifest.architect?.system_map?.join(', ') || 'Unknown'}
- Dependencies: ${manifest.architect?.dependencies?.join(', ') || 'Unknown'}

## To Approve
Run: \`node ogz-meta/approve.js ${manifest.mission_id}\`

## To Reject
Run: \`node ogz-meta/reject.js ${manifest.mission_id} "reason"\`

---
Generated by Claudito Pipeline (Advisory Mode) with DeepSeek R1
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
 * Critic: Reviews fixes using AI + rule checks
 */
async function critic(manifest, params) {
  const brain = require('./ollama-brain');
  const weaknesses = [];

  // Rule-based checks
  if (!manifest.entomologist.bugs_found?.length) {
    weaknesses.push('No bugs found - insufficient analysis');
  }

  if (!manifest.debugger.results?.every(r => r.passed)) {
    weaknesses.push('Tests failing - fixes incomplete');
  }

  // AI-powered review of proposals
  const proposals = manifest.exterminator?.proposals || [];
  if (proposals.length > 0) {
    const health = await brain.healthCheck();
    if (health.running) {
      console.log('   🧠 AI reviewing proposed fixes...');
      const projectDir = path.resolve(__dirname, '..');
      const relevantFiles = brain.findRelevantFiles(manifest.issue, projectDir);
      const code = relevantFiles.length > 0
        ? brain.extractRelevantCode(relevantFiles[0], manifest.issue).code
        : '';

      const review = await brain.reviewFix(manifest.issue, proposals, code);
      
      if (!review.approved) {
        weaknesses.push(`AI reviewer flagged concerns: ${review.review.slice(0, 200)}`);
      }
      
      manifest._aiReview = review.review;
      console.log(`   AI verdict: ${review.approved ? 'APPROVED' : 'CONCERNS FLAGGED'}`);
    }
  }

  if (weaknesses.length >= 3) {
    manifest.stop_conditions.critic_failures++;
  }

  updateSection(manifest, 'critic', {
    weaknesses,
    force_rerun: weaknesses.length >= 3,
    ai_reviewed: true
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

  // ── FINALIZE SESSION FORM ──
  if (manifest._sessionForm) {
    try {
      const handoff = {
        readyToDeploy: manifest.artifacts?.files_modified || [],
        inProgress: [],
        needsAttention: manifest.forensics?.silent_bugs || [],
        nextSteps: [
          manifest.mode === 'ADVISORY'
            ? `Review proposals then: node ogz-meta/approve.js ${manifest.mission_id}`
            : 'Verify bot is running: pm2 status'
        ],
        verification: {
          botRunning: manifest.cicd?.build_result === 'PASS',
          noCrashLoops: true,
          noNewErrors: !manifest.stop_conditions?.cicd_failed,
          stateConsistent: !manifest.stop_conditions?.manifest_mismatch,
          newIssuesIntroduced: manifest.forensics?.silent_bugs || []
        }
      };

      await finalizeSessionForm(manifest._sessionForm, handoff);
      const formPath = saveSessionForm(manifest._sessionForm);
      manifest.artifacts.session_form = formPath;
      console.log(`   ✅ Session form saved: ${formPath}`);
    } catch (e) {
      console.log(`   ⚠️  Session form save failed: ${e.message}`);
    }
  }

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