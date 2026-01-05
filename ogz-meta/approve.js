#!/usr/bin/env node

/**
 * approve.js
 * Human approval gate for Claudito proposals
 *
 * Usage: node ogz-meta/approve.js <mission_id> [notes]
 */

const fs = require('fs');
const path = require('path');
const { loadManifest, saveManifest } = require('./manifest-schema');

const MANIFEST_DIR = path.join(__dirname, 'manifests');

function approve(missionId, notes) {
  const manifestPath = path.join(MANIFEST_DIR, `${missionId}.json`);
  const currentPath = path.join(MANIFEST_DIR, 'current.json');

  // Try mission-specific first, then current
  let manifest;
  let usedPath;

  if (fs.existsSync(manifestPath)) {
    manifest = loadManifest(manifestPath);
    usedPath = manifestPath;
  } else if (fs.existsSync(currentPath)) {
    manifest = loadManifest(currentPath);
    usedPath = currentPath;
  } else {
    console.error(`❌ No manifest found for mission: ${missionId}`);
    console.log('\nAvailable manifests:');
    fs.readdirSync(MANIFEST_DIR)
      .filter(f => f.endsWith('.json'))
      .forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  }

  // Check if already approved
  if (manifest.approval?.status === 'APPROVED') {
    console.log(`⚠️  Mission ${manifest.mission_id} already approved`);
    console.log(`   Approved by: ${manifest.approval.approved_by}`);
    console.log(`   Approved at: ${manifest.approval.approved_at}`);
    return;
  }

  // Show what's being approved
  console.log('\n' + '='.repeat(60));
  console.log('🔍 APPROVAL REVIEW');
  console.log('='.repeat(60));
  console.log(`\nMission: ${manifest.mission_id}`);
  console.log(`Issue: ${manifest.issue}`);
  console.log(`Mode: ${manifest.mode}`);
  console.log(`\nProposals to approve:`);

  const proposals = manifest.exterminator?.proposals || [];
  if (proposals.length === 0) {
    console.log('  (No proposals found)');
  } else {
    proposals.forEach((p, i) => {
      console.log(`  ${i + 1}. [${p.bug_id}] ${p.location}`);
      console.log(`     ${p.proposed_fix}`);
    });
  }

  // Update approval status
  manifest.approval = {
    status: 'APPROVED',
    approved_by: process.env.USER || 'human',
    approved_at: new Date().toISOString(),
    notes: notes || null
  };

  // Save updated manifest
  saveManifest(manifest, usedPath);

  console.log('\n' + '='.repeat(60));
  console.log('✅ APPROVED');
  console.log('='.repeat(60));
  console.log(`\nMission ${manifest.mission_id} has been approved.`);
  console.log(`\nTo execute the approved changes, run:`);
  console.log(`  node ogz-meta/execute.js ${manifest.mission_id}`);
  console.log('\nOr to continue the pipeline in execute mode:');
  console.log(`  node ogz-meta/pipeline.js --execute "${manifest.issue}"`);
}

// CLI
if (require.main === module) {
  const missionId = process.argv[2];
  const notes = process.argv.slice(3).join(' ');

  if (!missionId) {
    console.log('📋 Claudito Approval Gate');
    console.log('\nUsage: node ogz-meta/approve.js <mission_id> [notes]');
    console.log('\nExamples:');
    console.log('  node ogz-meta/approve.js MISSION-1234567890');
    console.log('  node ogz-meta/approve.js MISSION-1234567890 "Reviewed, looks good"');
    console.log('\nTo approve the current mission:');
    console.log('  node ogz-meta/approve.js current');
    process.exit(0);
  }

  approve(missionId, notes);
}

module.exports = { approve };
