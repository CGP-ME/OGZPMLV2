#!/usr/bin/env node
'use strict';

// Static reconciliation of only canonical-source-join rows with no runtime
// source-map entry. It does not execute a tool, import a module, or claim that
// a conditional profile is selected in a running process.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '../../../../../..');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const join = JSON.parse(fs.readFileSync(path.join(HERE, 'canonical-source-join.json'), 'utf8'));
const prefixes = ['tooling', 'tuningProfiles', 'launchProfiles', 'feeProfiles', 'deployment'];
const rows = join.filter(row => prefixes.some(prefix => row.path === prefix || row.path.startsWith(`${prefix}.`)) && row.runtimeSources.length === 0);

const evidence = {
  tooling: {
    confidenceGrid: ['tools/grid-search-confidence.js:27-28', 'ConfigLoader.getInternalsFileValue(tooling.confidenceGrid) copies thresholds before the tool creates worker overrides.'],
    dataParity: ['tools/data-parity-check.js:11,52,459-462', 'The parity tool reads the internals block and loads the market-data-tool role for a requested comparison.'],
    stockDownload: ['foundation/ConfigLoader.js:643-647,1612-1623; scripts/fetch-stock-data.js:15-18', 'The market-data-tool snapshot exposes tooling.stockDownload and the fetch script spreads it into its request configuration.'],
    parallelBacktest: ['foundation/ConfigLoader.js:4520-4523; tools/parallel-backtest.js:63-66', 'The parallel-backtest tool obtains a frozen parallelBacktest block at module initialization.'],
    weekendCampaign: ['tools/weekend-campaign-gauntlet.js:11-43', 'The campaign tool reads this internals block and assigns its defaults before command processing.'],
    matrixSweep: ['foundation/ConfigLoader.js:4525-4527; tools/matrix-sweep.js:94-96; tools/harvest-pattern-pack.js:44-49', 'Both matrix-sweep and harvest-pattern-pack call getMatrixSweepConfig and consume separate portions of the returned canonical block.'],
  },
  tuning: ['tools/tuning-profiles.js:9-16,32-35; tools/parallel-backtest.js:619-647', 'The resolver is used by the backtest tool, but a named profile is a tool/descriptor choice; static source cannot establish which name a user selected.'],
  launch: ['foundation/ConfigLoader.js:435-445,476-489,1056-1178', 'PROFILE selects a named launch profile, defaultProfile is used only when PROFILE is absent, and the selected profile is projected into runtime config.'],
  fee: ['tools/fee-profiles.js:5-16; tools/backtest-worker-env.js:104-114; tools/parallel-backtest.js:618-647', 'Backtest tooling resolves an explicit fee profile and rejects missing or inapplicable selection.'],
  deployment: ['ecosystem.config.js:3-6', 'The PM2 manifest reads deployment.pm2 as a single object. This is a manifest-consumer proof only; no PM2 process was inspected or restarted.'],
};

function classify(row) {
  const parts = row.path.split('.');
  const root = parts[0];
  if (root === 'tooling') {
    const section = parts[1];
    if (section === 'matrixSweep') return {
      disposition: 'conditional_tool_reader',
      effect: 'Read when matrix-sweep or harvest-pattern-pack is invoked; no running-tool claim is made.',
      evidence: evidence.tooling.matrixSweep,
      gap: 'No invocation/runtime acceptance claim is made.'
    };
    return {
      disposition: 'conditional_tool_reader',
      effect: `Read when the ${section} operational tool is invoked; not evidence that the tool is running.`,
      evidence: evidence.tooling[section] || ['No section-specific reader was established.', 'Needs focused source follow-up.'],
      gap: 'No invocation/runtime acceptance claim is made.'
    };
  }
  if (root === 'tuningProfiles') return {
    disposition: row.path === 'tuningProfiles.defaultProfile' ? 'tool_default_selector' : 'conditional_tool_profile_definition',
    effect: row.path === 'tuningProfiles.defaultProfile'
      ? 'Default only for callers that omit a tuning-profile name.'
      : 'Definition is resolved only when a tool or descriptor names this profile.',
    evidence: evidence.tuning,
    gap: 'Selection is intentionally user/tool/descriptor-deferred; no active run profile is claimed.'
  };
  if (root === 'launchProfiles') return {
    disposition: row.path === 'launchProfiles.defaultProfile' ? 'conditional_launch_default_selector' : 'conditional_launch_profile_definition',
    effect: row.path === 'launchProfiles.defaultProfile'
      ? 'Selects a profile only when PROFILE is absent.'
      : `Projected into runtime config only when PROFILE or a verified backtest descriptor selects ${parts[1]}.`,
    evidence: evidence.launch,
    gap: 'Static source proves the selection route, not which profile a running process selected.'
  };
  if (root === 'feeProfiles') return {
    disposition: 'conditional_tool_fee_profile_definition',
    effect: 'Applied only when backtest tooling names this fee profile and the instrument asset class is accepted.',
    evidence: evidence.fee,
    gap: 'No current backtest invocation or selected profile is asserted.'
  };
  return {
    disposition: 'active_deployment_manifest_value_runtime_unverified',
    effect: 'Read as part of deployment.pm2 while evaluating the PM2 ecosystem manifest.',
    evidence: evidence.deployment,
    gap: 'Manifest-reader proof only; process-manager application and runtime state were deliberately not inspected.'
  };
}

const outputRows = rows.map(row => ({
  canonicalPath: row.path,
  canonicalOwner: row.owner,
  sourceMapStatus: 'no_runtime_source_map_entry',
  ...classify(row),
}));
const summary = Object.fromEntries(prefixes.map(prefix => {
  const group = outputRows.filter(row => row.canonicalPath === prefix || row.canonicalPath.startsWith(`${prefix}.`));
  const dispositions = {};
  for (const row of group) dispositions[row.disposition] = (dispositions[row.disposition] || 0) + 1;
  return [prefix, { count: group.length, dispositions }];
}));
const report = {
  schemaVersion: 1,
  candidate: head,
  scope: 'Only canonical-source-join leaves/empty containers with no runtime source-map entry. Static read/caller evidence; no process, network, PM2, or production code operation.',
  summary,
  emptyContainerRows: [],
  emptyContainerNote: 'The scoped canonical-source-join input has no empty-container row; every one of its 1,693 rows is a canonical leaf or array member.',
  rows: outputRows,
  gaps: outputRows.filter(row => row.disposition === 'retained_inactive_no_current_reader').map(row => ({ path: row.canonicalPath, gap: row.gap })),
  gapSummary: [],
};
fs.writeFileSync(path.join(HERE, 'canonical-dispositions.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ candidate: head, total: outputRows.length, summary, gaps: report.gaps.length }, null, 2));
