#!/usr/bin/env node

/**
 * pipeline.js
 * Executes the full Claudito pipeline
 *
 * IMMUTABLE ORDER:
 * 1. /commander
 * 2. /architect
 * 3. /entomologist
 * 4. /exterminator
 * 5. /debugger
 * 6. /critic
 * 7. /validator
 * 8. /forensics
 * 9. /cicd
 * 10. /committer
 * 11. /scribe
 * 12. /janitor
 * 13. /warden
 */

const { route } = require('./slash-router');
const { shouldStop } = require('./manifest-schema');

const PIPELINE = [
  '/commander',
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

  // Start mission
  let manifest = await route(`/start ${issue}`, {});
  console.log(`\n📋 Mission: ${manifest.mission_id}`);
  console.log(`📝 Issue: ${issue}`);

  // Execute pipeline
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
    console.log(`   Bugs found: ${manifest.entomologist.bugs_found?.length || 0}`);
    console.log(`   Fixes applied: ${manifest.exterminator.fixes_applied?.length || 0}`);
    console.log(`   Tests passed: ${manifest.debugger.results?.filter(r => r.passed).length || 0}`);
    console.log(`   Warden approved: ${manifest.warden.final_approval ? 'YES' : 'NO'}`);
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
    console.log('\nUsage: node ogz-meta/pipeline.js "<issue description>"');
    console.log('\nThis will execute the FULL pipeline:');
    PIPELINE.forEach((cmd, i) => {
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

module.exports = { execute, PIPELINE };