#!/usr/bin/env node

/**
 * reject.js
 * Human rejection gate for Claudito proposals
 *
 * Usage: node ogz-meta/reject.js <mission_id> <reason>
 */

const fs = require('fs');
const path = require('path');
const { loadManifest, saveManifest } = require('./manifest-schema');

const MANIFEST_DIR = path.join(__dirname, 'manifests');

function reject(missionId, reason) {
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
    process.exit(1);
  }

  // Show what's being rejected
  console.log('\n' + '='.repeat(60));
  console.log('🔍 REJECTION REVIEW');
  console.log('='.repeat(60));
  console.log(`\nMission: ${manifest.mission_id}`);
  console.log(`Issue: ${manifest.issue}`);

  const proposals = manifest.exterminator?.proposals || [];
  console.log(`\nProposals being rejected: ${proposals.length}`);

  // Update approval status
  manifest.approval = {
    status: 'REJECTED',
    approved_by: process.env.USER || 'human',
    approved_at: new Date().toISOString(),
    notes: reason || 'Rejected by human review'
  };

  // Mark mission as stopped
  manifest.stop_conditions.warden_blocked = true;
  manifest.state = 'REJECTED';

  // Save updated manifest
  saveManifest(manifest, usedPath);

  console.log('\n' + '='.repeat(60));
  console.log('❌ REJECTED');
  console.log('='.repeat(60));
  console.log(`\nMission ${manifest.mission_id} has been rejected.`);
  console.log(`Reason: ${reason || 'No reason provided'}`);
  console.log('\nNo changes will be applied.');
  console.log('\nThe proposal document remains at:');
  manifest.artifacts?.proposals?.forEach(p => console.log(`  ${p}`));
}

// CLI
if (require.main === module) {
  const missionId = process.argv[2];
  const reason = process.argv.slice(3).join(' ');

  if (!missionId) {
    console.log('📋 Claudito Rejection Gate');
    console.log('\nUsage: node ogz-meta/reject.js <mission_id> <reason>');
    console.log('\nExamples:');
    console.log('  node ogz-meta/reject.js MISSION-1234567890 "Approach is wrong"');
    console.log('  node ogz-meta/reject.js current "Need different solution"');
    process.exit(0);
  }

  if (!reason) {
    console.error('❌ Please provide a rejection reason');
    process.exit(1);
  }

  reject(missionId, reason);
}

module.exports = { reject };
