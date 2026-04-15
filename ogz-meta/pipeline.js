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
  if (issue.includes('--execute')) return 'execute';
  if (issue.startsWith('refactor:') || issue.startsWith('extract:') || issue.includes('--refactor')) return 'refactor';
  if (issue.includes('--debug') || issue.startsWith('fix:') || issue.startsWith('bug:')) return 'bugfix';
  return 'bugfix';
}


// Check for --execute flag in args (runs with approval, applies changes)
function hasExecuteFlag(issue) {
  return issue.includes('--execute');
}

// Legacy export for backwards compatibility
const PIPELINE = BUGFIX_PIPELINE;

/**
 * Execute full pipeline
 */
async function execute(issue) {
  const pipelineType = detectMode(issue);
  const executeMode = hasExecuteFlag(issue);

  // Clean issue text (remove all flags)
  const cleanIssue = issue.replace(/--refactor|--execute|--debug/g, '').trim();

  // Build pipeline based on detected mode
  let pipeline = pipelineType === 'execute' ? [...EXECUTE_PIPELINE] : pipelineType === 'refactor' ? [...REFACTOR_PIPELINE] : [...BUGFIX_PIPELINE];

  console.log('🚀 CLAUDITO PIPELINE INITIATED');
  console.log('=' .repeat(50));
  console.log(`🔧 Pipeline: ${pipelineType.toUpperCase()}`);
  console.log(`📋 Mode: ${executeMode ? 'EXECUTE (will apply changes)' : 'ADVISORY (proposals only)'}`);

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
  const issue = process.argv.slice(2).join(' ');

  if (!issue) {
    console.log('🚀 Claudito Pipeline');
    console.log('\nUsage: node ogz-meta/pipeline.js "<issue description>" [flags]');
    console.log('\nFLAGS:');
    console.log('  --execute  Apply fixes instead of just proposing (requires prior approval)');
    console.log('\nPIPELINE TYPES:');
    console.log('  BUG FIX (default): Any issue without prefix');
    console.log('  REFACTOR: Start with "refactor:" or "extract:"');
    console.log('\nEXECUTION MODES:');
    console.log('  ADVISORY (default): Generates proposals, does not modify code');
    console.log('  EXECUTE (--execute): Applies fixes after human approval');
    console.log('\nWORKFLOW:');
    console.log('  1. Run pipeline (advisory):  node ogz-meta/pipeline.js "fix issue"');
    console.log('  2. Review proposal in ogz-meta/proposals/');
    console.log('  3. Approve: node ogz-meta/approve.js <mission_id>');
    console.log('  4. Execute: node ogz-meta/pipeline.js --execute "fix issue"');
    console.log('\nBUG FIX PIPELINE:');
    BUGFIX_PIPELINE.forEach((cmd, i) => {
      console.log(`  ${i + 1}. ${cmd}`);
    });
    console.log('\nREFACTOR PIPELINE (skips bug hunting, stays on current branch):');
    REFACTOR_PIPELINE.forEach((cmd, i) => {
      console.log(`  ${i + 1}. ${cmd}`);
    });
    console.log('\nStop conditions:');
    console.log('  - Critic fails twice');
    console.log('  - Forensics finds critical issue');
    console.log('  - CI/CD fails');
    console.log('  - Warden blocks');
    process.exit(0);
  }

  execute(issue).catch(console.error);
}

module.exports = { execute, PIPELINE, BUGFIX_PIPELINE, REFACTOR_PIPELINE, EXECUTE_PIPELINE, detectMode };