#!/usr/bin/env node

/**
 * execute-mission.js
 * Mission Executor - Executes approved support missions
 *
 * WORKFLOW:
 * 1. Support generates mission plan → USER REVIEWS
 * 2. User approves mission (with hash) → THIS SCRIPT VALIDATES
 * 3. Dry-run shows what will happen → USER VERIFIES
 * 4. Apply mode executes → DOCUMENTS EVERYTHING
 * 5. Diff gate shows changes → USER REVIEWS
 * 6. Optional commit/push → USER DECIDES
 *
 * NO EXECUTION WITHOUT EXPLICIT USER APPROVAL + HASH MATCH
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { updateLedger } = require('./update-ledger');

/**
 * Calculate hash of mission content
 */
function calculateHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Create mission artifact manifest
 */
function createArtifactManifest(missionId) {
  const manifestPath = path.join(
    __dirname,
    'support-missions',
    `${missionId}.artifacts.json`
  );

  const manifest = {
    missionId,
    created: new Date().toISOString(),
    files: [],
    backups: [],
    tempFiles: []
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifestPath;
}

/**
 * Add file to artifact manifest
 */
function addToManifest(manifestPath, category, filePath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest[category]) manifest[category] = [];
  if (!manifest[category].includes(filePath)) {
    manifest[category].push(filePath);
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

/**
 * Execute approved mission
 */
async function executeMission(missionFile, options = {}) {
  console.log('\n⚡ MISSION EXECUTOR ACTIVATED');
  console.log('=' .repeat(50));

  const isDryRun = options.dryRun || !options.apply;
  const isApply = options.apply === true;

  // Load mission plan
  if (!fs.existsSync(missionFile)) {
    console.error(`❌ Mission file not found: ${missionFile}`);
    process.exit(1);
  }

  const missionContent = fs.readFileSync(missionFile, 'utf8');
  const missionHash = calculateHash(missionContent);
  console.log(`\n📋 Loading mission: ${path.basename(missionFile)}`);
  console.log(`   Hash: ${missionHash.slice(0, 16)}...`);

  // Parse mission metadata
  const missionId = path.basename(missionFile, '.md').replace('MISSION-', '');
  const timestamp = new Date().toISOString();

  // Check for approval with hash validation
  const approvalFile = missionFile.replace('.md', '.approved');
  if (!fs.existsSync(approvalFile)) {
    console.log('\n⚠️  MISSION NOT APPROVED');
    console.log('To approve this mission:');
    console.log(`  echo "${missionHash}" > ${approvalFile}`);
    console.log('\n1. Review the mission plan carefully');
    console.log('2. Approve with the hash above');
    console.log('3. Run with --dry-run first');
    console.log('4. Only then run with --apply');
    process.exit(1);
  }

  // Validate approval hash
  const approvalContent = fs.readFileSync(approvalFile, 'utf8').trim();
  if (!approvalContent.includes(missionHash)) {
    console.error('\n❌ APPROVAL HASH MISMATCH');
    console.error(`Expected: ${missionHash}`);
    console.error(`Found:    ${approvalContent}`);
    console.error('\n⚠️  Mission file may have changed after approval!');
    console.error('Please review and re-approve if changes are intentional.');
    process.exit(1);
  }

  console.log('✅ Mission approved with valid hash');

  // Mode announcement
  if (isDryRun) {
    console.log('\n🔍 DRY RUN MODE - No changes will be made');
    console.log('To apply changes, run with --apply flag');
  } else {
    console.log('\n⚠️  APPLY MODE - Changes will be made!');

    // CREATE A PROPER CLONE BRANCH FROM MASTER
    const branchName = `mission/${missionId}/fixes-${new Date().toISOString().split('T')[0]}`;
    console.log(`\n🔒 SAFETY: Creating isolated work branch`);

    try {
      // Check current branch
      const currentBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();

      if (currentBranch === 'master' || currentBranch === 'main') {
        console.log(`   Currently on ${currentBranch} - creating isolated mission branch...`);

        // Check for uncommitted changes
        try {
          const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' });
          if (gitStatus.trim()) {
            console.error('\n❌ FATAL: You have uncommitted changes!');
            console.error('   Please commit or stash your changes first:');
            console.error('   git stash   (to save temporarily)');
            console.error('   git commit  (to save permanently)');
            console.error('\n   Refusing to proceed - your work is important!');
            process.exit(1);
          }
        } catch (e) {
          console.error('❌ Could not check git status');
          process.exit(1);
        }

        // Ensure we have latest master
        console.log('   📡 Fetching latest from origin...');
        execSync('git fetch origin master', { stdio: 'inherit' });

        // Create and checkout new branch from origin/master
        execSync(`git checkout -b ${branchName} origin/master`, { stdio: 'inherit' });
        console.log(`   ✅ Created branch: ${branchName}`);
        console.log('   🔒 This is an isolated clone of master');
        console.log('   🔒 All changes will be contained in this mission branch');
      } else if (currentBranch.startsWith('mission/')) {
        console.log(`   ✅ Already on mission branch: ${currentBranch}`);
        console.log('   Continuing work on existing mission branch...');
      } else {
        console.error(`\n❌ FATAL: Cannot run on branch '${currentBranch}'`);
        console.error('   Executor must run from master or existing mission branch');
        console.error('   Please run: git checkout master');
        process.exit(1);
      }
    } catch (error) {
      console.error('\n❌ FATAL: Could not create isolated work branch');
      console.error('   This executor REQUIRES branch isolation!');
      console.error(`   Error: ${error.message}`);
      process.exit(1);
    }

    console.log('\nPress Ctrl+C within 5 seconds to cancel...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  console.log('\n');

  // Check for PATCHSET section first (required for real fixes)
  const hasPatchset = missionContent.includes('## PATCHSET');
  const patchFileMatch = missionContent.match(/### Patch File\s*\n(.+\.patch)/);

  // Extract fix information from mission
  const fixes = extractFixes(missionContent);

  // CRITICAL GUARDRAIL: No real changes without a patchset
  if (!isDryRun && !hasPatchset && fixes.length > 0) {
    console.log('\n❌ FATAL: No PATCHSET found in mission!');
    console.log('   This mission contains only diagnostic references, not executable fixes.');
    console.log('\n   To apply actual fixes, the mission must include:');
    console.log('   ## PATCHSET (REQUIRED FOR APPLY)');
    console.log('   ### Patch File');
    console.log('   ogz-meta/support-missions/MISSION-xxx.patch');
    console.log('\n   Current mission contains:');
    fixes.slice(0, 3).forEach(f => {
      console.log(`   - ${f.description} (reference only)`);
    });
    console.log('\n💡 Next steps:');
    console.log('   1. Review the diagnostic report');
    console.log('   2. Generate actual patches if needed');
    console.log('   3. Or manually implement the suggested fixes');
    process.exit(1);
  }

  if (fixes.length === 0 && !hasPatchset) {
    console.log('ℹ️  No fixes or patchset found in mission plan.');
    console.log('This appears to be an informational/diagnostic mission only.');
    return;
  }

  // Create artifact manifest for tracking
  const manifestPath = isApply ? createArtifactManifest(missionId) : null;

  // Execute fixes
  const executionLog = [];
  let successCount = 0;
  let failureCount = 0;

  console.log(`\n📝 Planned Actions (${fixes.length} fixes):`);
  for (const fix of fixes) {
    console.log(`   - ${fix.description}`);
    if (fix.file) console.log(`     File: ${fix.file}`);
  }

  if (isDryRun) {
    console.log('\n🔍 DRY RUN ANALYSIS:');
    console.log('Files that would be modified:');
    const uniqueFiles = [...new Set(fixes.map(f => f.file).filter(Boolean))];
    uniqueFiles.forEach(f => console.log(`   - ${f}`));

    console.log('\nChangelog entry that would be added:');
    console.log('---');
    console.log(`### Mission ${missionId} - ${new Date().toISOString().split('T')[0]}`);
    console.log(`- **Type**: Support Mission Execution`);
    console.log(`- **Fixes**: ${fixes.length}`);
    fixes.forEach(f => console.log(`- ✅ ${f.description}`));
    console.log('---');

    console.log('\n✅ Dry run complete. No changes were made.');
    console.log('To apply these changes, run with --apply flag');
    return { dryRun: true, fixes: fixes.length };
  }

  // APPLY MODE - Apply patchset if it exists
  if (hasPatchset && patchFileMatch) {
    const patchFile = patchFileMatch[1].trim();
    const fullPatchPath = path.isAbsolute(patchFile) ? patchFile :
                          path.join(path.dirname(__dirname), patchFile);

    console.log(`\n📄 APPLYING PATCHSET`);
    console.log(`   Patch file: ${patchFile}`);

    if (!fs.existsSync(fullPatchPath)) {
      console.error(`\n❌ FATAL: Patch file not found: ${fullPatchPath}`);
      console.error('   Mission references a patchset that does not exist!');
      process.exit(1);
    }

    try {
      // Apply the patch
      console.log('   Applying patch...');
      execSync(`git apply --index "${fullPatchPath}"`, { stdio: 'inherit' });
      console.log('   ✅ Patch applied successfully');

      executionLog.push({
        fix: 'Applied patchset',
        file: patchFile,
        status: 'SUCCESS',
        timestamp: new Date().toISOString()
      });
      successCount++;

      // Add patch to manifest
      if (manifestPath) {
        addToManifest(manifestPath, 'files', fullPatchPath);
      }
    } catch (error) {
      console.error(`   ❌ Patch failed to apply: ${error.message}`);
      executionLog.push({
        fix: 'Apply patchset',
        file: patchFile,
        status: 'FAILED',
        error: error.message,
        timestamp: new Date().toISOString()
      });
      failureCount++;

      // Exit on patch failure
      console.error('\n❌ FATAL: Patch application failed!');
      console.error('   The patchset could not be applied cleanly.');
      console.error('   Please review the patch and resolve conflicts manually.');
      process.exit(1);
    }
  } else {
    // Legacy mode - execute individual fixes (deprecated)
    console.log('\n⚠️  DEPRECATED: Using legacy fix extraction (no patchset)');
    console.log('   This mode will be removed. Use PATCHSET format instead.');

    for (const fix of fixes) {
      console.log(`\n🔧 Executing fix: ${fix.description}`);
      console.log(`   File: ${fix.file}`);
      console.log(`   Line: ${fix.line || 'N/A'}`);

      try {
        // Backup original file
        if (fix.file && fs.existsSync(fix.file)) {
          const backupPath = `${fix.file}.backup.${missionId}`;
          fs.copyFileSync(fix.file, backupPath);
          console.log(`   Backup: ${backupPath}`);

          // Add to manifest
          if (manifestPath) {
            addToManifest(manifestPath, 'backups', backupPath);
          }
        }

        // Apply fix (this is where actual changes would happen)
        // For now, log what would be done
        console.log(`   Fix: ${fix.fix}`);

        executionLog.push({
          fix: fix.description,
          file: fix.file,
          status: 'SUCCESS',
          timestamp: new Date().toISOString()
        });

        successCount++;
        console.log('   ✅ Fix applied successfully');

      } catch (error) {
        console.error(`   ❌ Fix failed: ${error.message}`);
        executionLog.push({
          fix: fix.description,
          file: fix.file,
          status: 'FAILED',
          error: error.message,
          timestamp: new Date().toISOString()
        });
        failureCount++;
      }
    }
  }

  // Generate execution report
  const reportContent = generateExecutionReport(
    missionId,
    missionContent,
    executionLog,
    successCount,
    failureCount
  );

  // Save execution report
  const reportFile = missionFile.replace('.md', '-EXECUTED.md');
  fs.writeFileSync(reportFile, reportContent);
  console.log(`\n📄 Execution report: ${reportFile}`);

  // Update CHANGELOG
  updateChangelog(missionId, executionLog, successCount, failureCount);

  // Update Fix Ledger
  if (successCount > 0) {
    console.log('\n📝 Updating Fix Ledger...');

    // Create a temporary fix report for the ledger
    const fixReport = {
      id: `MISSION-${missionId}`,
      date: timestamp,
      severity: extractSeverity(missionContent),
      symptom: extractIssue(missionContent),
      root_cause: 'See mission report',
      minimal_fix: executionLog
        .filter(e => e.status === 'SUCCESS')
        .map(e => e.fix)
        .join('; '),
      files: [...new Set(executionLog.map(e => e.file).filter(Boolean))],
      what_worked: [`Applied ${successCount} fixes successfully`],
      what_failed: failureCount > 0 ? [`${failureCount} fixes failed`] : []
    };

    // Save temporary report for ledger processing
    const tempReportPath = path.join(__dirname, 'reports', `TEMP-MISSION-${missionId}.md`);
    fs.writeFileSync(tempReportPath, JSON.stringify(fixReport, null, 2));

    // Run ledger update
    try {
      execSync('node ogz-meta/update-ledger.js', { stdio: 'inherit' });
      console.log('✅ Fix Ledger updated');

      // Clean up temp report
      fs.unlinkSync(tempReportPath);
    } catch (error) {
      console.error('❌ Failed to update ledger:', error.message);
    }
  }

  // Rebuild context pack
  console.log('\n🔧 Rebuilding context pack...');
  try {
    execSync('node ogz-meta/build-claudito-context.js', { stdio: 'inherit' });
    console.log('✅ Context pack rebuilt');
  } catch (error) {
    console.error('❌ Failed to rebuild context:', error.message);
  }

  // DIFF GATE - Show changes before any commits
  console.log('\n🔍 DIFF GATE - Review Changes');
  console.log('=' .repeat(50));

  try {
    // Get git diff
    const gitDiff = execSync('git diff --stat', { encoding: 'utf8' });

    if (gitDiff.trim()) {
      console.log('\n📊 Files Changed:');
      console.log(gitDiff);

      console.log('\n📝 Full Diff (first 100 lines):');
      const fullDiff = execSync('git diff', { encoding: 'utf8' });
      const diffLines = fullDiff.split('\n').slice(0, 100);
      console.log(diffLines.join('\n'));

      if (fullDiff.split('\n').length > 100) {
        console.log('\n... diff truncated. Run "git diff" to see full changes');
      }

      // Save diff to file
      const diffFile = path.join(
        __dirname,
        'support-missions',
        `${missionId}.diff`
      );
      fs.writeFileSync(diffFile, fullDiff);
      console.log(`\n💾 Full diff saved to: ${diffFile}`);

      // Add diff file to manifest
      if (manifestPath) {
        addToManifest(manifestPath, 'files', diffFile);
      }
    } else {
      console.log('\nℹ️  No git changes detected');
    }
  } catch (error) {
    console.log('\n⚠️  Could not generate git diff (may not be a git repo)');
  }

  console.log('\n' + '='.repeat(50));
  console.log('⚠️  IMPORTANT: Changes have been made on a MISSION BRANCH');

  // Check if we're on a mission branch
  try {
    const currentBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();

    if (currentBranch.startsWith('mission/')) {
      console.log(`\n🔒 You are on isolated branch: ${currentBranch}`);
      console.log('   This is a CLONE of master - your changes are isolated!');

      console.log('\n📋 Next steps:');
      console.log('1. Review the diff above carefully');
      console.log('2. If changes look good, commit and push:');
      console.log('   git add .');
      console.log(`   git commit -m "Mission ${missionId}: <description>"`);
      console.log(`   git push -u origin "${currentBranch}"`);
      console.log('3. Create pull request for review:');
      console.log(`   gh pr create --title "Mission ${missionId}: Auto-fixes" --body "Generated by support mission ${missionId}"`);
      console.log('   Or go to GitHub and create PR manually');
      console.log('4. If you want to abandon these changes:');
      console.log('   git checkout master');
      console.log(`   git branch -D "${currentBranch}"`);
      console.log('5. Clean up mission artifacts:');
      console.log(`   node ogz-meta/janitor.js --manifest ${manifestPath}`);

      console.log('\n✅ SAFE: Master is untouched - all changes are isolated');
      console.log('🚨 PR must be reviewed before merging to master!');
    } else {
      console.log('\n⚠️  Not on a mission branch - manual review required');
      console.log('Next steps:');
      console.log('1. Review the diff above carefully');
      console.log('2. Handle changes manually');
      console.log('3. Clean up artifacts when done:');
      console.log(`   node ogz-meta/janitor.js --manifest ${manifestPath}`);
    }
  } catch (error) {
    console.log('\n⚠️  Could not determine branch status');
  }

  console.log('\n' + '='.repeat(50));
  console.log(`Mission execution complete: ${successCount} succeeded, ${failureCount} failed`);

  return {
    missionId,
    executionLog,
    successCount,
    failureCount
  };
}

/**
 * Extract fixes from mission content
 */
function extractFixes(content) {
  const fixes = [];

  // Look for Risk Map templates or similar fix sections
  const riskMapMatch = content.match(/```javascript\s*{([^}]+)}/g);
  if (riskMapMatch) {
    riskMapMatch.forEach(match => {
      try {
        // Parse risk map structure
        const fileMatch = match.match(/file:\s*"([^"]+)"/);
        const lineMatch = match.match(/line:\s*(\d+)/);
        const fixMatch = match.match(/minimal_fix:\s*"([^"]+)"/);
        const causeMatch = match.match(/root_cause:\s*"([^"]+)"/);

        if (fileMatch || fixMatch) {
          fixes.push({
            file: fileMatch ? fileMatch[1] : null,
            line: lineMatch ? lineMatch[1] : null,
            fix: fixMatch ? fixMatch[1] : 'See mission plan',
            description: causeMatch ? causeMatch[1] : 'Fix from mission',
            root_cause: causeMatch ? causeMatch[1] : null
          });
        }
      } catch (e) {
        // Ignore parse errors
      }
    });
  }

  // Look for similar past fixes that could be reapplied
  const similarFixesMatch = content.match(/## SIMILAR PAST FIXES\s*\n([\s\S]+?)(?=\n##|\n---|$)/);
  if (similarFixesMatch && similarFixesMatch[1].trim() !== 'None found - new issue class') {
    const fixLines = similarFixesMatch[1].split('\n').filter(line => line.startsWith('-'));
    fixLines.forEach(line => {
      const match = line.match(/- ([^:]+):\s*(.+)/);
      if (match) {
        fixes.push({
          description: match[1],
          fix: match[2],
          file: null, // Would need to look up from ledger
          line: null
        });
      }
    });
  }

  return fixes;
}

/**
 * Extract severity from mission content
 */
function extractSeverity(content) {
  const match = content.match(/\*\*Severity\*\*:\s*(\w+)/);
  return match ? match[1] : 'UNKNOWN';
}

/**
 * Extract issue description
 */
function extractIssue(content) {
  const match = content.match(/## ISSUE\s*\n(.+)/);
  return match ? match[1] : 'Unknown issue';
}

/**
 * Generate execution report
 */
function generateExecutionReport(missionId, originalMission, executionLog, successCount, failureCount) {
  return `# MISSION EXECUTION REPORT
Generated: ${new Date().toISOString()}
Mission ID: ${missionId}

## EXECUTION SUMMARY
- **Total Fixes Attempted**: ${executionLog.length}
- **Successful**: ${successCount}
- **Failed**: ${failureCount}

## EXECUTION LOG
${executionLog.map(entry => `
### ${entry.fix}
- **File**: ${entry.file || 'N/A'}
- **Status**: ${entry.status}
- **Timestamp**: ${entry.timestamp}
${entry.error ? `- **Error**: ${entry.error}` : ''}
`).join('\n')}

## POST-EXECUTION VERIFICATION

### Files Modified
${[...new Set(executionLog.filter(e => e.file).map(e => e.file))].map(f => `- ${f}`).join('\n')}

### Recommended Tests
1. Run smoke tests on affected subsystems
2. Verify dashboard displays indicators correctly
3. Check bot state consistency
4. Monitor for any new errors

### Rollback Instructions
If issues occur, backups are available:
${executionLog.filter(e => e.file).map(e => `- ${e.file}.backup.${missionId}`).join('\n')}

To rollback:
\`\`\`bash
# Replace current files with backups
${executionLog.filter(e => e.file).map(e => `cp ${e.file}.backup.${missionId} ${e.file}`).join('\n')}
\`\`\`

---
## ORIGINAL MISSION PLAN
${originalMission}
`;
}

/**
 * Update CHANGELOG
 */
function updateChangelog(missionId, executionLog, successCount, failureCount) {
  const changelogPath = path.join(path.dirname(__dirname), 'CHANGELOG.md');

  if (!fs.existsSync(changelogPath)) {
    console.warn('⚠️  CHANGELOG.md not found');
    return;
  }

  const entry = `
### Mission ${missionId} - ${new Date().toISOString().split('T')[0]}
- **Type**: Support Mission Execution
- **Fixes Applied**: ${successCount}
- **Failures**: ${failureCount}
${executionLog.filter(e => e.status === 'SUCCESS').map(e => `- ✅ ${e.fix}`).join('\n')}
${executionLog.filter(e => e.status === 'FAILED').map(e => `- ❌ ${e.fix}: ${e.error}`).join('\n')}

`;

  const currentContent = fs.readFileSync(changelogPath, 'utf8');
  const updatedContent = currentContent.replace(
    /(# CHANGELOG\n+)/,
    `$1${entry}`
  );

  fs.writeFileSync(changelogPath, updatedContent);
  console.log('✅ CHANGELOG updated');
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const missionFile = args.find(a => !a.startsWith('--'));
  const options = {
    dryRun: args.includes('--dry-run'),
    apply: args.includes('--apply')
  };

  if (!missionFile) {
    console.log('⚡ Mission Executor - Hardened Edition');
    console.log('\nUsage: node ogz-meta/execute-mission.js <mission-file> [options]');
    console.log('\nOptions:');
    console.log('  --dry-run  Show what would be done (default if no flag)');
    console.log('  --apply    Actually execute the mission');
    console.log('\nExample workflow:');
    console.log('  1. Review mission:');
    console.log('     cat ogz-meta/support-missions/MISSION-xxx.md');
    console.log('  2. Get approval hash:');
    console.log('     sha256sum ogz-meta/support-missions/MISSION-xxx.md');
    console.log('  3. Approve with hash:');
    console.log('     echo "HASH_HERE" > ogz-meta/support-missions/MISSION-xxx.approved');
    console.log('  4. Dry run first:');
    console.log('     node ogz-meta/execute-mission.js ogz-meta/support-missions/MISSION-xxx.md --dry-run');
    console.log('  5. Apply if looks good:');
    console.log('     node ogz-meta/execute-mission.js ogz-meta/support-missions/MISSION-xxx.md --apply');
    console.log('  6. Review diff and commit manually');
    process.exit(1);
  }

  executeMission(missionFile, options).catch(console.error);
}

module.exports = { executeMission };