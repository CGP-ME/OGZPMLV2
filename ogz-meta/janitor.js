#!/usr/bin/env node

/**
 * janitor.js
 * HARDENED VERSION - Manifest-based cleanup only
 *
 * SAFETY PRINCIPLE:
 * - NEVER delete files based on pattern matching
 * - ONLY delete files explicitly listed in mission manifests
 * - Every file deletion is traceable to a specific mission
 *
 * This janitor can ONLY clean up artifacts from missions,
 * nothing else. It cannot "guess" what's junk.
 */

const fs = require('fs');
const path = require('path');

const MISSIONS_DIR = path.join(__dirname, 'support-missions');

/**
 * Load manifest file
 */
function loadManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    console.error(`❌ Manifest not found: ${manifestPath}`);
    return null;
  }

  try {
    const content = fs.readFileSync(manifestPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`❌ Failed to parse manifest: ${error.message}`);
    return null;
  }
}

/**
 * Find all mission manifests
 */
function findAllManifests() {
  if (!fs.existsSync(MISSIONS_DIR)) {
    return [];
  }

  const files = fs.readdirSync(MISSIONS_DIR);
  return files
    .filter(f => f.endsWith('.artifacts.json'))
    .map(f => path.join(MISSIONS_DIR, f));
}

/**
 * Display manifest report
 */
function displayManifestReport(manifests) {
  console.log('\n📊 JANITOR MANIFEST REPORT');
  console.log('=' .repeat(50));

  if (manifests.length === 0) {
    console.log('\n✨ No mission artifacts found. Nothing to clean.');
    return { totalFiles: 0, totalSize: 0 };
  }

  let totalFiles = 0;
  let totalSize = 0;

  for (const manifestPath of manifests) {
    const manifest = loadManifest(manifestPath);
    if (!manifest) continue;

    const missionName = path.basename(manifestPath, '.artifacts.json');
    console.log(`\n📁 Mission: ${missionName}`);
    console.log(`   Created: ${manifest.created}`);

    let missionFiles = 0;
    let missionSize = 0;

    // Count all artifact categories
    const categories = ['files', 'backups', 'tempFiles'];
    for (const category of categories) {
      const files = manifest[category] || [];
      if (files.length === 0) continue;

      console.log(`   ${category}: ${files.length} files`);
      for (const file of files) {
        if (fs.existsSync(file)) {
          const stat = fs.statSync(file);
          missionSize += stat.size;
          missionFiles++;
        }
      }
    }

    console.log(`   Total: ${missionFiles} files, ${formatBytes(missionSize)}`);
    totalFiles += missionFiles;
    totalSize += missionSize;
  }

  console.log('\n' + '-'.repeat(50));
  console.log(`📊 TOTAL: ${totalFiles} files, ${formatBytes(totalSize)}`);
  console.log(`   From ${manifests.length} missions`);

  return { totalFiles, totalSize };
}

/**
 * Clean artifacts from a specific manifest
 */
function cleanManifest(manifestPath, apply = false) {
  const manifest = loadManifest(manifestPath);
  if (!manifest) {
    return { deleted: [], failed: [] };
  }

  const results = {
    deleted: [],
    failed: [],
    skipped: []
  };

  console.log(`\n🧹 Cleaning mission: ${manifest.missionId}`);

  const categories = ['files', 'backups', 'tempFiles'];
  for (const category of categories) {
    const files = manifest[category] || [];
    if (files.length === 0) continue;

    console.log(`\n   Cleaning ${category}:`);

    for (const file of files) {
      if (!fs.existsSync(file)) {
        console.log(`   ⏭️  Already gone: ${path.basename(file)}`);
        continue;
      }

      if (!apply) {
        console.log(`   🔍 Would delete: ${path.basename(file)}`);
        results.skipped.push(file);
        continue;
      }

      try {
        // Safety check - ensure file is actually from this mission
        if (!file.includes(manifest.missionId)) {
          console.log(`   ⚠️  Skipping (not mission-owned): ${path.basename(file)}`);
          results.skipped.push(file);
          continue;
        }

        fs.unlinkSync(file);
        results.deleted.push(file);
        console.log(`   ✅ Deleted: ${path.basename(file)}`);
      } catch (error) {
        results.failed.push({ file, error: error.message });
        console.log(`   ❌ Failed: ${path.basename(file)} - ${error.message}`);
      }
    }
  }

  // Delete the manifest itself if all artifacts are cleaned
  if (apply && results.failed.length === 0) {
    try {
      fs.unlinkSync(manifestPath);
      console.log(`\n   ✅ Manifest deleted`);
    } catch (error) {
      console.log(`\n   ⚠️  Could not delete manifest: ${error.message}`);
    }
  }

  return results;
}

/**
 * Clean all manifests
 */
function cleanAllManifests(apply = false) {
  const manifests = findAllManifests();

  if (manifests.length === 0) {
    console.log('\n✨ No mission artifacts to clean.');
    return;
  }

  const allResults = {
    deleted: [],
    failed: [],
    skipped: []
  };

  for (const manifestPath of manifests) {
    const results = cleanManifest(manifestPath, apply);
    allResults.deleted.push(...results.deleted);
    allResults.failed.push(...results.failed);
    allResults.skipped.push(...results.skipped);
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('🧹 CLEANUP COMPLETE');
  console.log(`   Deleted: ${allResults.deleted.length} files`);
  console.log(`   Failed: ${allResults.failed.length} files`);
  console.log(`   Skipped: ${allResults.skipped.length} files`);

  if (!apply && allResults.skipped.length > 0) {
    console.log('\n💡 This was a dry run. To actually delete, use --apply');
  }

  // Save cleanup log
  if (apply && allResults.deleted.length > 0) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      deleted: allResults.deleted.length,
      failed: allResults.failed.length,
      files: allResults.deleted
    };

    const logFile = path.join(__dirname, 'janitor.log');
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    console.log(`\n📝 Cleanup logged to: ogz-meta/janitor.log`);
  }

  return allResults;
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const manifestArg = args.find(a => a.startsWith('--manifest='));
  const manifestPath = manifestArg ? manifestArg.split('=')[1] : null;
  const flags = {
    apply: args.includes('--apply'),
    report: args.includes('--report') || (!args.includes('--apply') && !manifestPath),
    all: args.includes('--all')
  };

  console.log('🧹 OGZ JANITOR - HARDENED EDITION');
  console.log('Manifest-based cleanup only (no pattern matching)\n');

  if (manifestPath) {
    // Clean specific manifest
    if (!fs.existsSync(manifestPath)) {
      console.error(`❌ Manifest not found: ${manifestPath}`);
      process.exit(1);
    }

    const results = cleanManifest(manifestPath, flags.apply);

    if (!flags.apply && results.skipped.length > 0) {
      console.log('\n💡 To actually delete these files, run with --apply flag');
    }
  } else if (flags.all) {
    // Clean all manifests
    cleanAllManifests(flags.apply);
  } else {
    // Report mode
    const manifests = findAllManifests();
    const { totalFiles } = displayManifestReport(manifests);

    if (totalFiles > 0) {
      console.log('\n💡 Options:');
      console.log('  --manifest=<path>  Clean specific mission artifacts');
      console.log('  --all              Clean all mission artifacts');
      console.log('  --apply            Actually delete (default is dry-run)');
      console.log('\nExamples:');
      console.log('  node ogz-meta/janitor.js --all');
      console.log('  node ogz-meta/janitor.js --all --apply');
      console.log('  node ogz-meta/janitor.js --manifest=ogz-meta/support-missions/MISSION-xxx.artifacts.json --apply');
    }
  }
}

module.exports = {
  loadManifest,
  cleanManifest,
  cleanAllManifests,
  findAllManifests
};