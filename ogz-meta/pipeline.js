#!/usr/bin/env node

/**
 * pipeline.js
 * Executes the full Claudito pipeline
 *
 * MODES:
 * - BUG FIX (default): Full pipeline with entomologist/exterminator
 * - REFACTOR: Issue starts with "refactor:" or "extract:" - skips bug hunting
 *
 * BUG FIX ORDER:
 * 1. /commander → 2. /branch → 3. /architect → 4. /entomologist → 5. /exterminator
 * 6. /critic → 7. /exterminator → 8. /debugger → 9. /validator → 10. /forensics
 * 11. /debugger → 12. /cicd → 13. /committer → 14. /scribe → 15. /janitor → 16. /warden
 *
 * REFACTOR ORDER (skips entomologist, branches from current):
 * 1. /commander → 2. /branch --refactor → 3. /architect → 4. /fixer
 * 5. /debugger → 6. /critic → 7. /validator → 8. /forensics
 * 9. /debugger → 10. /committer → 11. /scribe → 12. /janitor → 13. /warden
 */

const { route } = require('./slash-router');
const { shouldStop } = require('./manifest-schema');

// Bug fix pipeline - hunts for bugs, applies fixes
const BUGFIX_PIPELINE = [
  '/commander',
  '/branch',              // Stays on current branch
  '/architect',
  '/entomologist',        // Find bugs
  '/exterminator',        // Fix bugs
  '/critic',              // Hardening directives
  '/exterminator',        // Apply hardening
  '/debugger',            // Verification pass 1
  '/validator',
  '/forensics',
  '/debugger',            // Verification pass 2 (conditional)
  '/cicd',
  '/committer',
  '/scribe',
  '/janitor',
  '/warden'
];

// Mark-fixed pipeline — deterministic spec-doc status updater. Reads
// manifest.spec_source.fixMap = { "<fixId>": "<sha>" } and rewrites each
// matching `**Status:**` line in the spec doc to `**Status:** FIXED in <sha> — <date>`.
// One pipeline run = one consolidated commit + push, no matter how many fixes
// are in the batch. No Mercury, no anchor verify (spec doc lives in
// ogz-meta/ledger/ which isn't trade-path or RAG-indexed).
const MARK_FIXED_PIPELINE = [
  '/commander',
  '/branch',
  '/spec-update-status',  // Deterministic: edit Status lines + git commit + push
  '/scribe',
  '/janitor',
  '/warden'
];

// Write pipeline — spec-driven verbatim application. Architect-verify confirms
// the spec's str_replace target exists in current code; fixer-write applies the
// spec's replacement verbatim. No Mercury re-derivation, no prompt to bias.
// Critic/Validator/Forensics still run for audit value.
const WRITE_PIPELINE = [
  '/commander',
  '/branch',
  '/architect-verify',     // Deterministic: target exists in current code?
  '/fixer-write',          // Deterministic: ADVISORY writes proposal; EXECUTE applies str_replace
  '/mercury-attack',       // EXECUTE only: adversarial Mercury attack on the just-applied change
  '/mercury-critic',       // EXECUTE only: gates pipeline on Mercury findings (requires operator ack on fail-findings)
  '/anchor-verify-post',   // EXECUTE only: Fast P0 + Full P0 drift gate (trade-path only)
  '/debugger',
  '/critic',
  '/validator',
  '/forensics',
  '/debugger',
  '/committer',
  '/scribe',
  '/janitor',
  '/warden'
];

// Refactor pipeline - extraction/refactoring tasks, no bug hunting
const REFACTOR_PIPELINE = [
  '/commander',
  '/branch',
  '/architect',
  // NO entomologist - we're not hunting bugs
  // NO exterminator - architect + fixer handles extraction
  '/fixer',               // Apply the extraction/refactor
  '/debugger',            // Verification pass 1
  '/critic',              // Review the changes
  '/validator',
  '/forensics',
  '/debugger',            // Verification pass 2 (conditional)
  '/committer',
  '/scribe',
  '/janitor',
  '/warden'
];

const EXECUTE_PIPELINE = [
  '/commander',
  '/branch',
  '/architect',
  '/warden',
  '/fixer',
  '/entomologist',
  '/forensics',
  '/critic',
  '/forensics',
  '/critic',
  '/warden',
  '/locator',
  '/fixer --execute',
  '/committer',
  '/janitor'
];

// Detect mode from issue prefix or CLI flags
function detectMode(issue) {
  if (issue.includes('--mark-fixed')) return 'mark-fixed';
  if (issue.includes('--write')) return 'write';
  if (issue.includes('--execute')) return 'execute';
  if (issue.startsWith('refactor:') || issue.startsWith('extract:') || issue.includes('--refactor')) return 'refactor';
  if (issue.includes('--debug') || issue.startsWith('fix:') || issue.startsWith('bug:')) return 'bugfix';
  return 'bugfix';
}


// Check for --execute flag in args (runs with approval, applies changes)
function hasExecuteFlag(issue) {
  return issue.includes('--execute');
}

// Parse --spec <path> + --fix-id <id> + --fix-map <id=sha,...> from raw argv.
// Returns { specPath, fixId, fixMap, resumeAfterMercuryAck, cleanIssue } where
// cleanIssue has those flags removed. fixMap is for --mark-fixed batch operations.
function parseWriteFlags(rawArgs) {
  let specPath = null;
  let fixId = null;
  let fixMap = null;  // populated when --fix-map is present
  let resumeAfterMercuryAck = false;
  const remaining = [];
  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === '--spec' && rawArgs[i + 1]) {
      specPath = rawArgs[i + 1];
      i++;
    } else if (rawArgs[i] === '--fix-id' && rawArgs[i + 1]) {
      fixId = rawArgs[i + 1];
      i++;
    } else if (rawArgs[i] === '--fix-map' && rawArgs[i + 1]) {
      // Format: "1=0e4dde9,2=498a16e,3=8b379ae,..."
      fixMap = {};
      const pairs = rawArgs[i + 1].split(',');
      for (const p of pairs) {
        const eq = p.indexOf('=');
        if (eq > 0) {
          const id = p.slice(0, eq).trim();
          const sha = p.slice(eq + 1).trim();
          if (id && sha) fixMap[id] = sha;
        }
      }
      i++;
    } else if (rawArgs[i] === '--resume-after-mercury-ack') {
      resumeAfterMercuryAck = true;
    } else {
      remaining.push(rawArgs[i]);
    }
  }
  return { specPath, fixId, fixMap, resumeAfterMercuryAck, cleanIssue: remaining.join(' ') };
}

// Legacy export for backwards compatibility
const PIPELINE = BUGFIX_PIPELINE;

/**
 * Execute full pipeline
 */
async function execute(issue, specSource, options = {}) {
  const pipelineType = detectMode(issue);
  const executeMode = hasExecuteFlag(issue);
  const resumeAfterMercuryAck = options.resumeAfterMercuryAck === true;

  // Clean issue text (remove all flags)
  const cleanIssue = issue.replace(/--refactor|--execute|--debug|--write|--mark-fixed/g, '').trim();

  // Build pipeline based on detected mode
  let pipeline;
  if (pipelineType === 'mark-fixed') pipeline = [...MARK_FIXED_PIPELINE];
  else if (pipelineType === 'write') pipeline = [...WRITE_PIPELINE];
  else if (pipelineType === 'execute') pipeline = [...EXECUTE_PIPELINE];
  else if (pipelineType === 'refactor') pipeline = [...REFACTOR_PIPELINE];
  else pipeline = [...BUGFIX_PIPELINE];

  if (resumeAfterMercuryAck) {
    if (!executeMode) {
      console.log('\n❌ --resume-after-mercury-ack requires --execute');
      return;
    }
    const resumeStart = pipeline.indexOf('/mercury-critic');
    if (resumeStart === -1) {
      console.log('\n❌ --resume-after-mercury-ack is only supported for pipelines with /mercury-critic');
      return;
    }
    pipeline = pipeline.slice(resumeStart);
  }

  console.log('🚀 CLAUDITO PIPELINE INITIATED');
  console.log('=' .repeat(50));
  console.log(`🔧 Pipeline: ${pipelineType.toUpperCase()}`);
  console.log(`📋 Mode: ${executeMode ? 'EXECUTE (will apply changes)' : 'ADVISORY (proposals only)'}`);
  if (specSource) {
    console.log(`📄 Spec: ${specSource.path} (Fix ${specSource.fixId})`);
  }

  let manifest;

  // In EXECUTE mode, load the approved manifest instead of creating new
  if (executeMode) {
    const { loadManifest, saveManifest } = require('./manifest-schema');
    const currentPath = require('path').join(__dirname, 'manifests', 'current.json');
    const fs = require('fs');

    if (fs.existsSync(currentPath)) {
      manifest = loadManifest(currentPath);
      if (manifest.approval?.status === 'APPROVED') {
        console.log(`\n✅ Loaded approved mission: ${manifest.mission_id}`);
        manifest.mode = 'EXECUTE';  // Ensure execute mode
        manifest.pipeline_type = pipelineType;  // Ensure correct pipeline type
        // Spec_source persists from the advisory run; --write --execute reuses it.
        // BUT --mark-fixed --execute (run AFTER a --write --execute) brings a
        // different spec_source shape (fixMap instead of fixId). If a fresh
        // specSource is passed on this invocation, overwrite the loaded one
        // so the new operation sees its own shape, not the prior mission's.
        if (specSource) {
          manifest.spec_source = specSource;
        }
        if (resumeAfterMercuryAck) {
          const fs = require('fs');
          const path = require('path');
          const ackPath = path.join(__dirname, 'manifests', `${manifest.mission_id}-mercury-ack.txt`);
          const gate = manifest.critic?.mercury_critic?.gate;
          if (gate !== 'fail-findings') {
            console.log(`\n❌ --resume-after-mercury-ack expected current Mercury gate fail-findings, got ${gate || '(missing)'}`);
            return;
          }
          if (!fs.existsSync(ackPath)) {
            console.log(`\n❌ --resume-after-mercury-ack missing ack file: ${path.relative(process.cwd(), ackPath)}`);
            return;
          }
          console.log(`\n✅ Resuming after Mercury ack: ${path.relative(process.cwd(), ackPath)}`);
        }
        // Reset stop conditions for fresh execute run
        manifest.stop_conditions = {
          critic_failures: 0,
          forensics_critical: false,
          verification_failed: false,
          cicd_failed: false,
          manifest_mismatch: false,
          warden_blocked: false
        };
        saveManifest(manifest, currentPath);  // Save so all commands see EXECUTE mode
      } else {
        console.log(`\n❌ Current mission not approved. Run: node ogz-meta/approve.js ${manifest.mission_id}`);
        return;
      }
    } else {
      console.log(`\n❌ No current mission found. Run pipeline in ADVISORY mode first.`);
      return;
    }
  } else {
    // Start new mission in ADVISORY mode
    manifest = await route(`/start ${cleanIssue}`, {});
    manifest.pipeline_type = pipelineType;
    manifest.mode = 'ADVISORY';
    // Attach spec_source for --write mode so architect-verify and fixer-write
    // can find the verbatim target/replacement blocks deterministically.
    if (specSource) {
      manifest.spec_source = specSource;
      const { saveManifest } = require('./manifest-schema');
      saveManifest(manifest, require('path').join(__dirname, 'manifests', 'current.json'));
    }
  }

  console.log(`\n📋 Mission: ${manifest.mission_id}`);
  console.log(`📝 Issue: ${manifest.issue || issue}`);

  // Execute pipeline
  let debuggerRuns = 0;

  for (let i = 0; i < pipeline.length; i++) {
    const command = pipeline[i];

    // Handle conditional second debugger pass
    if (command === '/debugger') {
      debuggerRuns++;
      if (debuggerRuns === 2) {
        if (!manifest.forensics?.catalyze_verification) {
          console.log('\n⏭️  Skipping verification pass 2 (forensics did not trigger)');
          continue;
        }
        console.log('\n🔄 Forensics triggered verification pass 2');
        // Pass forensics flag to debugger
        manifest = await route(`${command} --forensics`, { manifest: `ogz-meta/manifests/current.json` });
        console.log(`   State: ${manifest.state}`);
        continue;
      }
    }

    console.log('\n' + '-'.repeat(50));

    // Check stop conditions before each step
    const stopCheck = shouldStop(manifest);
    if (stopCheck.stop) {
      console.log(`\n🛑 PIPELINE STOPPED: ${stopCheck.reason}`);
      console.log(`   At stage: ${command}`);
      break;
    }

    // Execute command
    manifest = await route(command, { manifest: `ogz-meta/manifests/current.json` });

    // Pipeline status
    console.log(`   State: ${manifest.state}`);
  }

  // Final report
  console.log('\n' + '=' .repeat(50));
  console.log('📊 PIPELINE COMPLETE');
  console.log(`   Final state: ${manifest.state}`);

  if (manifest.state === 'COMPLETE') {
    console.log('   ✅ SUCCESS: Pipeline completed');
    if (manifest.pipeline_type === 'bugfix') {
      console.log(`   Bugs found: ${manifest.entomologist?.bugs_found?.length || 0}`);
      console.log(`   Fixes applied: ${manifest.exterminator?.fixes_applied?.length || 0}`);
    } else {
      console.log(`   Pipeline: REFACTOR/EXTRACTION`);
      console.log(`   Changes applied: ${manifest.fixer?.changes_applied?.length || 'N/A'}`);
    }
    console.log(`   Execution mode: ${manifest.mode || 'ADVISORY'}`)
    console.log(`   Tests passed: ${manifest.debugger?.results?.filter(r => r.passed).length || 0}`);
    console.log(`   Warden approved: ${manifest.warden?.final_approval ? 'YES' : 'NO'}`);

    // Merge-back guidance
    const baseBranch = manifest.branch?.base;
    const missionBranch = manifest.branch?.branch;
    if (baseBranch && missionBranch && missionBranch.startsWith('mission/')) {
      console.log(`\n   🔀 MERGE BACK: This mission branched from ${baseBranch}`);
      console.log(`   To merge back:  git checkout ${baseBranch} && git merge ${missionBranch}`);
      console.log(`   To discard:     git checkout ${baseBranch} && git branch -D ${missionBranch}`);
    }
  } else {
    const stopCheck = shouldStop(manifest);
    console.log(`   ⚠️  INCOMPLETE: ${stopCheck.reason || 'Unknown'}`);
  }

  return manifest;
}

// CLI interface
if (require.main === module) {
  const rawArgs = process.argv.slice(2);
  // Pull --spec and --fix-id out before joining the issue string so they
  // don't become part of the human-readable issue text.
  const writeFlags = parseWriteFlags(rawArgs);
  const issue = writeFlags.cleanIssue;

  if (!issue) {
    console.log('🚀 Claudito Pipeline');
    console.log('\nUsage: node ogz-meta/pipeline.js "<issue description>" [flags]');
    console.log('\nFLAGS:');
    console.log('  --execute  Apply fixes (requires prior approval)');
    console.log('  --write    Spec-driven verbatim application (no Mercury re-derivation)');
    console.log('  --spec <path>   Path to the spec doc (required with --write)');
    console.log('  --fix-id <id>   Which Fix N in the spec (required with --write)');
    console.log('  --resume-after-mercury-ack  Continue an applied write mission after reviewing Mercury findings');
    console.log('\nPIPELINE TYPES:');
    console.log('  BUG FIX (default): Any issue without prefix');
    console.log('  REFACTOR: Start with "refactor:" or "extract:" — Mercury re-derives plan');
    console.log('  WRITE: --write — deterministic, reads str_replace block from spec verbatim');
    console.log('\nWORKFLOW:');
    console.log('  Refactor/Bugfix (Mercury-driven):');
    console.log('    1. node ogz-meta/pipeline.js "<issue>"');
    console.log('    2. Review proposal in ogz-meta/proposals/');
    console.log('    3. node ogz-meta/approve.js <mission_id>');
    console.log('    4. node ogz-meta/pipeline.js --execute "<issue>"');
    console.log('  Write (spec-driven):');
    console.log('    1. node ogz-meta/pipeline.js --write --spec <path> --fix-id <N> "<title>"');
    console.log('    2. Review proposal in ogz-meta/proposals/<id>-WRITE-PROPOSAL.md');
    console.log('    3. node ogz-meta/approve.js <mission_id>');
    console.log('    4. node ogz-meta/pipeline.js --write --spec <path> --fix-id <N> --execute "<title>"');
    console.log('    5. If Mercury blocks after applied code and you accept the reviewed findings:');
    console.log('       node ogz-meta/pipeline.js --write --spec <path> --fix-id <N> --execute --resume-after-mercury-ack "<title>"');
    console.log('\nStop conditions:');
    console.log('  - Critic fails twice');
    console.log('  - Forensics finds critical issue');
    console.log('  - CI/CD fails');
    console.log('  - Warden blocks');
    console.log('  - architect-verify: spec target not found in current code (--write only)');
    process.exit(0);
  }

  // For --write, build spec_source from CLI flags. For --mark-fixed, build it
  // with a fixMap instead. For other modes, pass null.
  const isWriteMode = issue.includes('--write');
  const isMarkFixedMode = issue.includes('--mark-fixed');
  let specSource = null;
  if (isWriteMode) {
    if (!writeFlags.specPath || !writeFlags.fixId) {
      console.error('❌ --write requires both --spec <path> and --fix-id <id>');
      process.exit(1);
    }
    specSource = { path: writeFlags.specPath, fixId: writeFlags.fixId };
  } else if (isMarkFixedMode) {
    if (!writeFlags.specPath || !writeFlags.fixMap || Object.keys(writeFlags.fixMap).length === 0) {
      console.error('❌ --mark-fixed requires both --spec <path> and --fix-map <id=sha,id=sha,...>');
      process.exit(1);
    }
    specSource = { path: writeFlags.specPath, fixMap: writeFlags.fixMap };
  }

  execute(issue, specSource, { resumeAfterMercuryAck: writeFlags.resumeAfterMercuryAck }).catch(console.error);
}

module.exports = { execute, PIPELINE, BUGFIX_PIPELINE, REFACTOR_PIPELINE, EXECUTE_PIPELINE, WRITE_PIPELINE, detectMode, parseWriteFlags };
