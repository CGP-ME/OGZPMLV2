#!/usr/bin/env node

/**
 * manifest-schema.js
 * Mission Manifest Schema - Single source of truth
 *
 * RULES:
 * - Every agent reads the manifest
 * - Every agent writes ONLY its section
 * - Manifest is immutable between stages
 * - Any mismatch = STOP
 */

/**
 * Create empty manifest
 */
function createManifest(missionId) {
  return {
    mission_id: missionId || `MISSION-${Date.now()}`,
    created: new Date().toISOString(),
    state: 'INIT',
    issue: '',

    // ADVISORY MODE: Clauditos analyze and propose, never execute
    // All changes require human approval
    mode: 'ADVISORY',  // ADVISORY (default) or EXECUTE (requires explicit flag)

    // Each agent owns exactly ONE section
    commander: {
      timestamp: null,
      context: null,
      agent_selection: null
    },

    branch: {
      timestamp: null,
      base: null,
      branch: null,
      blocked: false,
      reason: null
    },

    architect: {
      timestamp: null,
      system_map: [],
      dependencies: []
    },

    entomologist: {
      timestamp: null,
      bugs_found: [],
      classifications: []
    },

    exterminator: {
      timestamp: null,
      fixes_applied: [],    // Only populated in EXECUTE mode
      patches: [],
      proposals: []         // ADVISORY mode: proposed changes for human review
    },

    fixer: {
      timestamp: null,
      changes_applied: [],  // For refactor mode
      plan: {},
      proposal_path: null
    },

    debugger: {
      timestamp: null,
      tests_run: [],
      results: []
    },

    critic: {
      timestamp: null,
      weaknesses: [],
      force_rerun: false
    },

    validator: {
      timestamp: null,
      checks_passed: [],
      checks_failed: []
    },

    locator: {
      timestamp: null,
      corrections: [],
      unlocatable: []
    },

    forensics: {
      timestamp: null,
      silent_bugs: [],
      regression_risks: []
    },

    cicd: {
      timestamp: null,
      build_result: null,
      test_result: null
    },

    committer: {
      timestamp: null,
      commit_hash: null,
      branch: null
    },

    scribe: {
      timestamp: null,
      changelog_entry: null,
      ledger_update: null
    },

    janitor: {
      timestamp: null,
      files_cleaned: [],
      artifacts_removed: []
    },

    warden: {
      timestamp: null,
      scope_violations: [],
      safety_blocks: [],
      final_approval: false
    },

    // Artifacts tracking
    artifacts: {
      files_created: [],
      files_modified: [],
      backups: [],
      reports: [],
      proposals: []         // ADVISORY mode: proposal documents for review
    },

    // Human approval tracking
    approval: {
      status: 'PENDING',    // PENDING, APPROVED, REJECTED
      approved_by: null,
      approved_at: null,
      notes: null
    },

    // Stop conditions
    stop_conditions: {
      critic_failures: 0,
      verification_failed: false,
      cicd_failed: false,
      manifest_mismatch: false,
      warden_blocked: false
    }
  };
}

/**
 * Load manifest from file
 */
function loadManifest(path) {
  const fs = require('fs');
  if (!fs.existsSync(path)) {
    throw new Error(`Manifest not found: ${path}`);
  }
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

/**
 * Save manifest to file
 */
function saveManifest(manifest, path) {
  const fs = require('fs');
  fs.writeFileSync(path, JSON.stringify(manifest, null, 2));
}

/**
 * Identify the exact spec and target bytes shown by a write proposal.
 * File and parser failures are reported to the caller before approval or writes.
 */
function captureWriteScope(manifest) {
  const fs = require('fs');
  const path = require('path');
  const { createHash } = require('crypto');
  const { parseFix } = require('./spec-parser');
  const spec = manifest.spec_source;
  if (!spec?.path || !spec.fixId) {
    return { ok: false, reason: 'Write mission requires spec_source.path and fixId' };
  }

  try {
    const root = fs.realpathSync(path.resolve(__dirname, '..'));
    const identify = name => {
      const absolute = path.resolve(root, name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (!relative || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
        return { ok: false, reason: `Write scope is outside the repository: ${name}` };
      }
      if (fs.realpathSync(absolute) !== absolute || !fs.statSync(absolute).isFile()) {
        return { ok: false, reason: `Write scope requires a regular file without symlinks: ${name}` };
      }
      return {
        ok: true,
        path: relative,
        sha256: createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')
      };
    };

    const specFile = identify(spec.path);
    if (!specFile.ok) return specFile;
    const parsed = parseFix(path.join(root, specFile.path), spec.fixId);
    const files = [];
    for (const entry of parsed.files) {
      const file = identify(entry.file);
      if (!file.ok) return file;
      files.push({ path: file.path, sha256: file.sha256 });
    }
    return {
      ok: true,
      parsed,
      scope: {
        mission_id: manifest.mission_id,
        issue: manifest.issue,
        pipeline_type: manifest.pipeline_type || 'write',
        spec_source: { path: specFile.path, fixId: parsed.fixId, sha256: specFile.sha256 },
        files,
        edits_sha256: createHash('sha256').update(JSON.stringify(parsed.files)).digest('hex')
      }
    };
  } catch (error) {
    return { ok: false, reason: `Cannot identify write scope: ${error.message}` };
  }
}

function sameWriteScope(left, right) {
  return Boolean(left && right && JSON.stringify(left) === JSON.stringify(right));
}

/**
 * Update manifest section (agent-specific)
 */
function updateSection(manifest, agent, data) {
  if (!manifest[agent]) {
    throw new Error(`Invalid agent: ${agent}`);
  }

  manifest[agent] = {
    ...manifest[agent],
    ...data,
    timestamp: new Date().toISOString()
  };

  // Update state
  const stateFlow = {
    'commander': 'BRANCH',
    'branch': 'ARCHITECT',
    'architect': 'ENTOMOLOGY',
    'entomologist': 'EXTERMINATION',
    'exterminator': 'DEBUG',
    'debugger': 'CRITIC',
    'critic': 'VALIDATE',
    'validator': 'FORENSICS',
    'forensics': 'CICD',
    'cicd': 'COMMIT',
    'committer': 'SCRIBE',
    'scribe': 'JANITOR',
    'janitor': 'WARDEN',
    'warden': manifest.warden.final_approval ? 'COMPLETE' : 'WARDEN'
  };

  manifest.state = shouldStop(manifest).stop ? 'HALTED' : (stateFlow[agent] || manifest.state);

  return manifest;
}

/**
 * Check stop conditions
 */
function shouldStop(manifest) {
  const stops = manifest.stop_conditions;

  for (const role of ['architect', 'entomologist', 'exterminator', 'fixer', 'critic', 'forensics']) {
    if (manifest[role]?.mercury_failed) {
      return { stop: true, reason: `${role} model call failed: ${manifest[role].reason}` };
    }
  }

  const review = manifest.critic?.mercury_attack;
  if (review?.dispatched === false || review?.completed === false) {
    return { stop: true, reason: `Mercury review did not complete: ${review.error}` };
  }
  const report = manifest.critic?.mercury_critic;
  if (report?.gate === 'infra_issue') {
    return { stop: true, reason: `Mercury review unavailable: ${report.reason}` };
  }
  if (report?.gate === 'unverified') {
    return { stop: true, reason: `Mercury review unresolved: ${report.reason}` };
  }

  if (stops.critic_failures >= 2) {
    return { stop: true, reason: 'Critic failed twice' };
  }

  if (stops.verification_failed) {
    return { stop: true, reason: 'Verification tests failed' };
  }

  if (stops.cicd_failed) {
    return { stop: true, reason: 'CI/CD build failed' };
  }

  if (stops.manifest_mismatch) {
    return { stop: true, reason: 'Manifest integrity violation' };
  }

  if (stops.warden_blocked) {
    return { stop: true, reason: 'Warden blocked execution' };
  }

  return { stop: false };
}

module.exports = {
  createManifest,
  loadManifest,
  saveManifest,
  captureWriteScope,
  sameWriteScope,
  updateSection,
  shouldStop
};
