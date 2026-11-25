#!/usr/bin/env node

/**
 * approve.js
 * Human approval gate for Claudito proposals
 *
 * Usage: node ogz-meta/approve.js <mission_id> [notes]
 */

const fs = require('fs');
const path = require('path');
const { loadManifest, saveManifest, shouldStop, captureWriteScope, sameWriteScope } = require('./manifest-schema');

const MANIFEST_DIR = path.join(__dirname, 'manifests');

function approve(missionId, notes) {
  const manifestPath = path.join(MANIFEST_DIR, `${missionId}.json`);
  const currentPath = path.join(MANIFEST_DIR, 'current.json');

  // Prefer the active copy of the requested mission over an older saved copy.
  let manifest;
  let usedPath;
  const current = fs.existsSync(currentPath) ? loadManifest(currentPath) : null;

  if (current && (missionId === 'current' || current.mission_id === missionId)) {
    manifest = current;
    usedPath = currentPath;
  } else if (fs.existsSync(manifestPath)) {
    manifest = loadManifest(manifestPath);
    usedPath = manifestPath;
  } else if (current) {
    manifest = current;
    usedPath = currentPath;
  } else {
    console.error(`No manifest found for mission: ${missionId}`);
    console.log('\nAvailable manifests:');
    (fs.existsSync(MANIFEST_DIR) ? fs.readdirSync(MANIFEST_DIR) : [])
      .filter(f => f.endsWith('.json'))
      .forEach(f => console.log(`  - ${f}`));
    process.exitCode = 1;
    return null;
  }

  if (missionId !== 'current' && manifest.mission_id !== missionId) {
    console.error(`Approval refused: requested ${missionId}, found ${manifest.mission_id}`);
    process.exitCode = 1;
    return null;
  }

  const stop = shouldStop(manifest);
  if (stop.stop) {
    console.error(`Approval refused: ${stop.reason}`);
    process.exitCode = 1;
    return null;
  }

  let writeScope;
  if (manifest.pipeline_type === 'write' || manifest.fixer?.plan?.spec_driven) {
    const captured = captureWriteScope(manifest);
    const proposalPath = manifest.fixer?.proposal_path;
    const proposalHash = proposalPath && fs.existsSync(proposalPath)
      ? require('crypto').createHash('sha256').update(fs.readFileSync(proposalPath)).digest('hex')
      : null;
    if (!captured.ok || !manifest.architect?.spec_target_verified ||
        !sameWriteScope(captured.scope, manifest.fixer?.write_scope) ||
        !proposalHash || proposalHash !== manifest.fixer?.proposal_sha256) {
      console.error(`Approval refused: ${captured.reason || 'write proposal, spec or target bytes changed; regenerate the proposal before approval'}`);
      process.exitCode = 1;
      return null;
    }
    writeScope = captured.scope;
  }

  // Check if already approved
  if (manifest.approval?.status === 'APPROVED') {
    if (writeScope && !sameWriteScope(writeScope, manifest.approval.write_scope)) {
      console.error('Approval refused: existing approval does not identify this write scope');
      process.exitCode = 1;
      return null;
    }
    console.log(`Mission ${manifest.mission_id} already approved`);
    console.log(`   Approved by: ${manifest.approval.approved_by}`);
    console.log(`   Approved at: ${manifest.approval.approved_at}`);
    return manifest;
  }

  // Show what's being approved
  console.log('\n' + '='.repeat(60));
  console.log('APPROVAL REVIEW');
  console.log('='.repeat(60));
  console.log(`\nMission: ${manifest.mission_id}`);
  console.log(`Issue: ${manifest.issue}`);
  console.log(`Mode: ${manifest.mode}`);
  console.log(`\nProposals to approve:`);

  const proposals = manifest.exterminator?.proposals || [];
  if (writeScope) {
    console.log(`  Exact write proposal: ${manifest.fixer.proposal_path}`);
    console.log(`  Spec SHA-256: ${writeScope.spec_source.sha256}`);
    writeScope.files.forEach(file => console.log(`  ${file.path}: ${file.sha256}`));
  } else if (proposals.length === 0) {
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
  if (writeScope) manifest.approval.write_scope = writeScope;

  // Save updated manifest
  saveManifest(manifest, usedPath);

  console.log('\n' + '='.repeat(60));
  console.log('APPROVED');
  console.log('='.repeat(60));
  console.log(`\nMission ${manifest.mission_id} has been approved.`);
  if (usedPath === currentPath) {
    console.log('\nTo continue this approved mission, run:');
    console.log('  node ogz-meta/pipeline.js --execute');
  } else {
    console.log(`Approved saved manifest: ${usedPath}`);
    console.log('The active pipeline mission was not changed; --execute resumes only current.json.');
  }
  return manifest;
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

  try {
    approve(missionId, notes);
  } catch (error) {
    console.error(`Approval failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { approve };
