#!/usr/bin/env node

/**
 * pipeline.js
 * Executes the full Claudito pipeline
 *
 * PATCHED: Session form now travels with the mission.
 * - Initialized at /start
 * - Each agent appends work via manifest.sessionForm
 * - /scribe finalizes and saves the form
 *
 * IMMUTABLE ORDER:
 * 1. /commander
 * 2. /branch
 * 3. /architect
 * 4. /entomologist
 * 5. /exterminator
 * 6. /critic
 * 7. /exterminator (hardening)
 * 8. /debugger (verification 1)
 * 9. /validator
 * 10. /forensics
 * 11. /debugger (verification 2, conditional)
 * 12. /cicd
 * 13. /committer
 * 14. /scribe
 * 15. /janitor
 * 16. /warden
 */

const { route } = require('./slash-router');
const { shouldStop } = require('./manifest-schema');
const {
  initializeSessionForm,
  appendWorkLog,
  finalizeSessionForm,
  saveSessionForm
} = require('./session-form');

const PIPELINE = [
  '/commander',
  '/branch',              // Creates mission branch (Clauditos never write to master)
  '/architect',
  '/entomologist',
  '/exterminator',
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

/**
 * Execute full pipeline
 */
async function execute(issue) {
  console.log('🚀 CLAUDITO PIPELINE INITIATED');
  console.log('=' .repeat(50));

  // ── START MISSION ──
  let manifest = await route(`/start ${issue}`, {});
  console.log(`\n📋 Mission: ${manifest.mission_id}`);
  console.log(`📝 Issue: ${issue}`);

  // ── INITIALIZE SESSION FORM ──
  console.log('\n📋 Initializing session form...');
  const sessionForm = await initializeSessionForm({
    description: issue,
    goal: issue,
    complexity: 'Medium',
    modulesInScope: []
  });

  // Attach form to manifest so every agent can access it
  manifest._sessionForm = sessionForm;

  console.log(`✅ Session form initialized: ${sessionForm.identity.date} ${sessionForm.identity.time}`);

  // ── EXECUTE PIPELINE ──
  let debuggerRuns = 0;

  for (let i = 0; i < PIPELINE.length; i++) {
    const command = PIPELINE[i];

    // Handle conditional second debugger pass
    if (command === '/debugger') {
      debuggerRuns++;
      if (debuggerRuns === 2) {
        if (!manifest.forensics?.catalyze_verification) {
          console.log('\n⏭️  Skipping verification pass 2 (forensics did not trigger)');
          continue;
        }
        console.log('\n🔄 Forensics triggered verification pass 2');
        manifest = await route(`${command} --forensics`, { manifest: `ogz-meta/manifests/current.json` });

        // Log to session form
        appendWorkLog(manifest._sessionForm, {
          claudito: 'debugger',
          action: 'Verification pass 2 (forensics-triggered)',
          notes: `Results: ${manifest.debugger?.results?.filter(r => r.passed).length || 0} passed`
        });

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

      // Log the stop to session form
      appendWorkLog(manifest._sessionForm, {
        claudito: 'pipeline',
        action: `PIPELINE STOPPED at ${command}`,
        notes: stopCheck.reason,
        bugsFound: [{
          bug: `Pipeline halted: ${stopCheck.reason}`,
          severity: 'Critical',
          fixed: false,
          details: `Stopped at stage ${command}`
        }]
      });

      break;
    }

    // Execute command
    const prevState = manifest.state;
    manifest = await route(command, { manifest: `ogz-meta/manifests/current.json` });

    // ── LOG TO SESSION FORM ──
    const agentName = command.replace('/', '');
    const agentData = manifest[agentName] || {};
    const workEntry = buildWorkEntry(agentName, agentData, manifest);
    appendWorkLog(manifest._sessionForm, workEntry);

    // Pipeline status
    console.log(`   State: ${manifest.state}`);
  }

  // ── FINALIZE SESSION FORM ──
  console.log('\n📋 Finalizing session form...');

  const handoff = {
    readyToDeploy: manifest.artifacts?.files_modified || [],
    inProgress: [],
    needsAttention: manifest.forensics?.silent_bugs || [],
    nextSteps: buildNextSteps(manifest),
    verification: {
      botRunning: manifest.cicd?.build_result === 'PASS',
      noCrashLoops: true,
      noNewErrors: !manifest.stop_conditions.cicd_failed,
      stateConsistent: !manifest.stop_conditions.manifest_mismatch,
      newIssuesIntroduced: manifest.forensics?.silent_bugs || []
    }
  };

  await finalizeSessionForm(manifest._sessionForm, handoff);
  const formPath = saveSessionForm(manifest._sessionForm);
  console.log(`✅ Session form saved: ${formPath}`);

  // ── FINAL REPORT ──
  console.log('\n' + '=' .repeat(50));
  console.log('📊 PIPELINE COMPLETE');
  console.log(`   Final state: ${manifest.state}`);

  if (manifest.state === 'COMPLETE') {
    console.log('   ✅ SUCCESS: Pipeline completed');
    console.log(`   Bugs found: ${manifest.entomologist?.bugs_found?.length || 0}`);
    console.log(`   Fixes applied: ${manifest.exterminator?.fixes_applied?.length || 0}`);
    console.log(`   Proposals: ${manifest.exterminator?.proposals?.length || 0}`);
    console.log(`   Tests passed: ${manifest.debugger?.results?.filter(r => r.passed).length || 0}`);
    console.log(`   Warden approved: ${manifest.warden?.final_approval ? 'YES' : 'NO'}`);
    console.log(`   Session form: ${formPath}`);
  } else {
    const stopCheck = shouldStop(manifest);
    console.log(`   ⚠️  INCOMPLETE: ${stopCheck.reason || 'Unknown'}`);
    console.log(`   Session form (partial): ${formPath}`);
  }

  // Show approval instructions if in ADVISORY mode
  if (manifest.mode === 'ADVISORY' && manifest.exterminator?.proposals?.length > 0) {
    console.log('\n' + '─'.repeat(50));
    console.log('📋 ADVISORY MODE — Proposals generated, no code changed.');
    console.log('   To approve: node ogz-meta/approve.js ' + manifest.mission_id);
    console.log('   To reject:  node ogz-meta/reject.js ' + manifest.mission_id + ' "reason"');
    console.log('   After approval, re-run with EXECUTE mode to apply fixes.');
  }

  return manifest;
}

/**
 * Build a work log entry from agent output
 */
function buildWorkEntry(agentName, agentData, manifest) {
  const entry = {
    claudito: agentName,
    action: '',
    notes: null,
    filesCreated: [],
    filesModified: [],
    bugsFound: [],
    decisions: []
  };

  switch (agentName) {
    case 'commander':
      entry.action = 'Context provided + ledger checked';
      entry.notes = `Mode: ${agentData.context?.activeMode || 'unknown'}, Known issues: ${agentData.known_issues?.length || 0}`;
      break;

    case 'branch':
      entry.action = agentData.blocked ? `Branch BLOCKED: ${agentData.reason}` : `Created branch: ${agentData.branch}`;
      break;

    case 'architect':
      entry.action = 'System mapped';
      entry.notes = `Dependencies: ${agentData.dependencies?.join(', ') || 'none'}`;
      break;

    case 'entomologist':
      entry.action = `Found ${agentData.bugs_found?.length || 0} bugs`;
      entry.bugsFound = (agentData.bugs_found || []).map(b => ({
        bug: `[${b.type}] ${b.description || 'See analysis'}`,
        severity: b.type === 'CRITICAL' ? 'Critical' : 'Medium',
        fixed: false,
        details: `Location: ${b.location || 'unknown'}`
      }));
      break;

    case 'exterminator':
      if (manifest.mode === 'ADVISORY') {
        entry.action = `Generated ${agentData.proposals?.length || 0} proposals (ADVISORY)`;
        entry.decisions = (agentData.proposals || []).map(p =>
          `[PROPOSAL] ${p.bug_id}: ${p.proposed_fix}`
        );
      } else {
        entry.action = `Applied ${agentData.fixes_applied?.length || 0} fixes`;
        entry.filesModified = (agentData.fixes_applied || []).map(f => ({
          file: f.bug_id || 'unknown',
          what: f.patch || 'fix applied',
          why: `Bug: ${f.bug_id}`
        }));
      }
      break;

    case 'debugger':
      const passed = agentData.results?.filter(r => r.passed).length || 0;
      const total = agentData.tests_run?.length || 0;
      entry.action = `Tests: ${passed}/${total} passed`;
      if (agentData.results?.some(r => !r.passed && !r.skipped)) {
        entry.bugsFound = agentData.results
          .filter(r => !r.passed && !r.skipped)
          .map(r => ({
            bug: `Test failed: ${r.test}`,
            severity: 'High',
            fixed: false,
            details: r.error?.slice(0, 200) || 'See test output'
          }));
      }
      break;

    case 'critic':
      entry.action = `Found ${agentData.weaknesses?.length || 0} weaknesses`;
      entry.notes = agentData.weaknesses?.join('; ') || 'No weaknesses found';
      if (agentData.force_rerun) {
        entry.decisions.push('DECISION: Force rerun triggered due to 3+ weaknesses');
      }
      break;

    case 'validator':
      entry.action = `Checks: ${agentData.checks_passed?.length || 0} passed, ${agentData.checks_failed?.length || 0} failed`;
      break;

    case 'forensics':
      entry.action = `Silent bugs: ${agentData.silent_bugs?.length || 0}, Regression risks: ${agentData.regression_risks?.length || 0}`;
      entry.notes = `Severity: ${agentData.severity || 'P2'}${agentData.catalyze_verification ? ' — triggered verification pass 2' : ''}`;
      entry.bugsFound = (agentData.silent_bugs || []).map(b => ({
        bug: b,
        severity: 'Medium',
        fixed: false,
        details: 'Silent bug found by forensics'
      }));
      break;

    case 'cicd':
      entry.action = `Build: ${agentData.build_result || '?'}, Tests: ${agentData.test_result || '?'}`;
      break;

    case 'committer':
      entry.action = agentData.blocked ? `Commit BLOCKED: ${agentData.reason}` : `Ready to commit on ${agentData.branch}`;
      break;

    case 'scribe':
      entry.action = `Documentation updated. Changelog: ${agentData.changelog_entry || 'none'}`;
      break;

    case 'janitor':
      entry.action = `Cleaned ${agentData.files_cleaned?.length || 0} files, removed ${agentData.artifacts_removed?.length || 0} artifacts`;
      break;

    case 'warden':
      entry.action = manifest.warden?.final_approval
        ? '✅ APPROVED — no scope violations'
        : `❌ BLOCKED — ${agentData.scope_violations?.join(', ') || 'unknown violation'}`;
      entry.decisions = (agentData.scope_violations || []).map(v =>
        `WARDEN VIOLATION: ${v}`
      );
      break;

    default:
      entry.action = `${agentName} executed`;
  }

  return entry;
}

/**
 * Build next steps based on pipeline outcome
 */
function buildNextSteps(manifest) {
  const steps = [];

  if (manifest.state === 'COMPLETE' && manifest.warden?.final_approval) {
    if (manifest.mode === 'ADVISORY') {
      steps.push('Review proposals in ogz-meta/proposals/');
      steps.push(`Approve: node ogz-meta/approve.js ${manifest.mission_id}`);
      steps.push('Re-run pipeline in EXECUTE mode after approval');
    } else {
      steps.push('Verify bot is running: pm2 status');
      steps.push('Monitor for 15 minutes for stability');
      steps.push('Check dashboard: https://ogzprime.com dashboard');
    }
  } else if (manifest.stop_conditions.warden_blocked) {
    steps.push('Address warden violations before proceeding');
    steps.push('Check scope — are you changing too many files?');
  } else if (manifest.stop_conditions.cicd_failed) {
    steps.push('Fix syntax errors: node --check run-empire-v2.js');
    steps.push('Run tests manually to identify failures');
  } else if (manifest.stop_conditions.forensics_critical) {
    steps.push('Forensics found critical issue — investigate before proceeding');
    steps.push('Check for memory leaks or data corruption');
  } else {
    steps.push('Investigate why pipeline did not complete');
    steps.push('Check manifests/current.json for state details');
  }

  return steps;
}

// CLI interface
if (require.main === module) {
  const issue = process.argv.slice(2).join(' ');

  if (!issue) {
    console.log('🚀 Claudito Pipeline');
    console.log('\nUsage: node ogz-meta/pipeline.js "<issue description>"');
    console.log('\nThis will execute the FULL pipeline:');
    PIPELINE.forEach((cmd, i) => {
      console.log(`  ${i + 1}. ${cmd}`);
    });
    console.log('\nSession form is initialized at start and saved at end.');
    console.log('Form location: ogz-meta/sessions/SESSION-*.md');
    console.log('\nStop conditions:');
    console.log('  - Critic fails twice');
    console.log('  - Forensics finds critical issue');
    console.log('  - CI/CD fails');
    console.log('  - Warden blocks');
    process.exit(0);
  }

  execute(issue).catch(err => {
    console.error('\n❌ PIPELINE FATAL ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
}

module.exports = { execute, PIPELINE };
