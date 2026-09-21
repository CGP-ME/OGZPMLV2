/**
 * ConfigAudit.js - Report the canonical resolved configuration and its sources.
 *
 * Run: node tools/config-audit.js
 * Output is written to stdout only; callers choose any evidence destination.
 *
 * This tool asks ConfigLoader for the same role-aware frozen snapshot consumed
 * by the process. It does not reimplement precedence, inject fixture values, or
 * read behavioral aliases directly from process.env.
 */

'use strict';

const path = require('path');
const ConfigLoader = require('../foundation/ConfigLoader');
const { scanProject } = require('../scripts/check-config-boundary');

const REDACTED_VALUE = '[REDACTED]';
const SECRET_PATH_PATTERN = /(^|[._-])(apiKey|apiSecret|secret|token|dsn|webhookUrl|password|privateKey)($|[._-])/i;
const SECRET_ENV_PATTERN = /(^|_)(API_KEY|API_SECRET|SECRET|TOKEN|DSN|WEBHOOK_URL|PASSWORD|PRIVATE_KEY)($|_)/i;
const CAPABILITY_PATH_PATTERN = /(^|\.)(ntfyTopic|deadmanUrl)($|\.)/i;

function createAuditContext(options = {}) {
  const sourceEnv = options.sourceEnv ?? process.env;
  const role = options.role || 'bot';
  const runDescriptorPath = options.runDescriptorPath === undefined
    ? sourceEnv.BACKTEST_RUN_DESCRIPTOR_PATH
    : options.runDescriptorPath;
  const loadDotenv = options.loadDotenv !== false;
  const configSnapshot = ConfigLoader.snapshot(sourceEnv, {
    silent: true,
    role,
    runDescriptorPath,
    loadDotenv,
  });

  return {
    configSnapshot,
    role,
    runDescriptorPath: configSnapshot.runDescriptor?.path || runDescriptorPath || null,
  };
}

function flattenConfigLeaves(obj, prefix = '', leaves = {}) {
  if (obj === null || obj === undefined || typeof obj !== 'object' || Array.isArray(obj)) {
    if (prefix) leaves[prefix] = obj;
    return leaves;
  }

  for (const [key, value] of Object.entries(obj)) {
    const pathKey = prefix ? `${prefix}.${key}` : key;
    flattenConfigLeaves(value, pathKey, leaves);
  }

  return leaves;
}

function isSecretPath(configPath) {
  const candidate = String(configPath || '');
  const normalizedCandidate = candidate.replace(/([a-z0-9])([A-Z])/g, '$1_$2');
  return (
    SECRET_PATH_PATTERN.test(candidate) ||
    SECRET_PATH_PATTERN.test(normalizedCandidate) ||
    SECRET_ENV_PATTERN.test(candidate) ||
    SECRET_ENV_PATTERN.test(normalizedCandidate) ||
    CAPABILITY_PATH_PATTERN.test(candidate)
  );
}

function auditEntry(configPath, entry) {
  const source = String(entry?.source || '');
  const credentialSource = source.startsWith('dotenv:') || source.startsWith('explicit:');
  if (!credentialSource && !isSecretPath(configPath)) return entry;
  return {
    ...entry,
    value: REDACTED_VALUE,
    redacted: true,
  };
}

function addConfigLoaderLeaves(resolved, context) {
  const leaves = flattenConfigLeaves(context.configSnapshot.config);
  for (const [configPath, value] of Object.entries(leaves)) {
    resolved[configPath] = auditEntry(configPath, {
      value,
      source: context.configSnapshot.sources[configPath] || `unattributed:${configPath}`,
    });
  }
  return resolved;
}

function buildResolvedConfig(context = createAuditContext()) {
  return addConfigLoaderLeaves({}, context);
}

function getRiskConfigViolations(context = createAuditContext()) {
  return (context.configSnapshot.errors || [])
    .filter(error => /^risk\..+ requires explicit profile source$/.test(error));
}

function getConfigValidationErrors(context = createAuditContext()) {
  return [...(context.configSnapshot.errors || [])];
}

function findConfigBoundaryFindings(projectRoot = path.resolve(__dirname, '..')) {
  return scanProject(projectRoot);
}

function sourceLabelFor(sourceValue) {
  const source = String(sourceValue || '');
  if (source.startsWith('config:settings.json:')) return 'SET';
  if (source.startsWith('config:internals.json:')) return 'INT';
  if (source.startsWith('config:')) return 'CFG';
  if (source.startsWith('descriptor:')) return 'RUN';
  if (source.startsWith('dotenv:') || source.startsWith('explicit:')) return 'CRED';
  if (source.startsWith('env:')) return 'BOOT';
  if (source.startsWith('derived:')) return 'DER';
  if (source.startsWith('default:') || source === 'default') return 'DEF';
  if (source.startsWith('not-applicable')) return 'N/A';
  return 'UNK';
}

function printValidationErrors(errors) {
  if (errors.length === 0) return;
  console.log(`\n-- CONFIG VALIDATION ERRORS ${'-'.repeat(50)}`);
  for (const error of errors) console.log(`  [ERR] ${error}`);
}

function printBoundaryFindings(findings) {
  console.log(`\n${'='.repeat(80)}`);
  console.log('  STATIC CONFIG-BOUNDARY CANDIDATES');
  console.log(`${'='.repeat(80)}\n`);
  console.log('  Scope: deployed runtime roots from scripts/check-config-boundary.js');
  console.log('  These are AST discovery findings. Reachability still requires source tracing.\n');

  if (findings.length === 0) {
    console.log('  No direct process.env access or ConfigLoader mutation calls found in the scanned roots.');
    return;
  }

  for (const finding of findings) {
    console.log(`  ${finding.file}:${finding.line} [${finding.kind}] ${finding.detail}`);
  }
}

function run(context = createAuditContext()) {
  console.log(`\n${'='.repeat(80)}`);
  console.log('  OGZPRIME CONFIG AUDIT - Canonical Resolved Values and Sources');
  console.log('='.repeat(80));

  const resolved = buildResolvedConfig(context);
  const configValidationErrors = getConfigValidationErrors(context);
  const riskConfigViolations = getRiskConfigViolations(context);
  const fingerprint = context.configSnapshot.fingerprint;

  console.log(`\n  Config Fingerprint: ${fingerprint}`);
  console.log(`  Process Role: ${context.configSnapshot.role}`);
  console.log(`  Settings Revision: ${context.configSnapshot.revisions?.settings || 'unknown'}`);
  console.log(`  Internals Revision: ${context.configSnapshot.revisions?.internals || 'unknown'}`);
  console.log(`  Run Descriptor: ${context.runDescriptorPath || 'none'}`);
  console.log(`  Timestamp: ${new Date().toISOString()}\n`);

  const groups = {};
  for (const [key, entry] of Object.entries(resolved)) {
    const group = key.split('.')[0];
    if (!groups[group]) groups[group] = [];
    groups[group].push({ key, ...entry });
  }

  for (const [groupName, entries] of Object.entries(groups)) {
    console.log(`\n-- ${groupName.toUpperCase()} ${'-'.repeat(Math.max(1, 70 - groupName.length))}`);
    for (const entry of entries) {
      const serialized = typeof entry.value === 'string'
        ? entry.value
        : JSON.stringify(entry.value);
      const value = serialized === undefined ? 'undefined' : serialized;
      console.log(`  [${sourceLabelFor(entry.source)}] ${entry.key.padEnd(45)} = ${value} [${entry.source}]`);
    }
  }

  printValidationErrors(configValidationErrors);

  const configBoundaryFindings = findConfigBoundaryFindings();
  printBoundaryFindings(configBoundaryFindings);

  const auditData = {
    fingerprint,
    timestamp: new Date().toISOString(),
    role: context.configSnapshot.role,
    revisions: context.configSnapshot.revisions,
    runDescriptorPath: context.runDescriptorPath,
    resolved,
    configValidationErrors,
    riskConfigViolations,
    configBoundaryFindings,
  };

  console.log(`\n${'='.repeat(80)}\n`);
  return auditData;
}

if (require.main === module) {
  const auditData = run();
  if (auditData.configValidationErrors.length > 0 || auditData.configBoundaryFindings.length > 0) {
    process.exitCode = 1;
  }
}

module.exports = {
  addConfigLoaderLeaves,
  auditEntry,
  buildResolvedConfig,
  createAuditContext,
  findConfigBoundaryFindings,
  flattenConfigLeaves,
  getConfigValidationErrors,
  getRiskConfigViolations,
  isSecretPath,
  REDACTED_VALUE,
  run,
  sourceLabelFor,
};
