'use strict';

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const DEFAULT_ROOTS = Object.freeze([
  'core',
  'modules',
  'foundation',
  'brokers',
  'run-empire-v2.js',
]);

const CONFIG_OWNER_FILES = Object.freeze(new Set([
  'foundation/ConfigLoader.js',
  'core/BacktestConfigOverrides.js',
]));

const CONFIG_MUTATION_METHODS = Object.freeze(new Set([
  'setOverrides',
  'applyOverrideMap',
  'applyBacktestConfigOverrides',
  'applyTuningProfile',
  'runWithTuningProfile',
  'clearOverrides',
  'freeze',
  'unfreeze',
]));

const SOURCE_EXTENSIONS = Object.freeze(new Set(['.js', '.cjs', '.mjs']));

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function collectFiles(projectRoot, entries = DEFAULT_ROOTS) {
  const files = [];

  function visit(entry) {
    const fullPath = path.join(projectRoot, entry);
    if (!fs.existsSync(fullPath)) return;
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(fullPath).sort()) {
        if (child === 'node_modules') continue;
        visit(path.join(entry, child));
      }
      return;
    }
    if (stat.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry))) {
      files.push(toPosix(entry));
    }
  }

  for (const entry of entries) visit(entry);
  return files.sort();
}

function parseSource(source, file) {
  return parser.parse(source, {
    sourceType: 'unambiguous',
    allowReturnOutsideFunction: true,
    errorRecovery: true,
    plugins: [
      'classProperties',
      'dynamicImport',
      'objectRestSpread',
      'optionalChaining',
    ],
    sourceFilename: file,
  });
}

function isIdentifier(node, name) {
  return node && node.type === 'Identifier' && node.name === name;
}

function isStringLiteral(node) {
  return node && (node.type === 'StringLiteral' || node.type === 'Literal') && typeof node.value === 'string';
}

function propertyName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (isStringLiteral(node)) return node.value;
  return null;
}

function isProcessEnv(node) {
  return node &&
    node.type === 'MemberExpression' &&
    isIdentifier(node.object, 'process') &&
    propertyName(node.property) === 'env';
}

function isProcessEnvMember(node) {
  return node &&
    node.type === 'MemberExpression' &&
    isProcessEnv(node.object);
}

function envKeyFromMember(node) {
  if (!isProcessEnvMember(node)) return null;
  return propertyName(node.property) || '<computed>';
}

function isConfigLoaderMutationCall(node) {
  if (!node || node.type !== 'CallExpression') return false;
  const callee = node.callee;
  return callee &&
    callee.type === 'MemberExpression' &&
    isIdentifier(callee.object, 'ConfigLoader') &&
    CONFIG_MUTATION_METHODS.has(propertyName(callee.property));
}

function isObjectAssignProcessEnv(node) {
  if (!node || node.type !== 'CallExpression') return false;
  const callee = node.callee;
  return callee &&
    callee.type === 'MemberExpression' &&
    isIdentifier(callee.object, 'Object') &&
    propertyName(callee.property) === 'assign' &&
    node.arguments.some(arg => isProcessEnv(arg));
}

function nodeLine(node) {
  return node && node.loc && node.loc.start ? node.loc.start.line : 0;
}

function lineText(source, line) {
  return source.split('\n')[line - 1]?.trim() || '';
}

function addFinding(findings, source, file, node, kind, detail) {
  const line = nodeLine(node);
  findings.push({
    kind,
    file,
    line,
    detail,
    code: lineText(source, line),
  });
}

function walk(node, visitor, parent = null) {
  if (!node || typeof node !== 'object') return;
  visitor(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) walk(item, visitor, node);
    } else if (child && typeof child.type === 'string') {
      walk(child, visitor, node);
    }
  }
}

function scanSource(source, file) {
  const findings = [];
  const ast = parseSource(source, file);
  const isConfigOwner = CONFIG_OWNER_FILES.has(file);

  walk(ast, (node, parent) => {
    if (!isConfigOwner && isProcessEnvMember(node)) {
      addFinding(findings, source, file, node, 'process_env_read', envKeyFromMember(node));
    }

    if (!isConfigOwner && node.type === 'AssignmentExpression') {
      if (isProcessEnv(node.left)) {
        addFinding(findings, source, file, node, 'process_env_object_reassignment', 'process.env');
      } else if (isProcessEnvMember(node.left)) {
        addFinding(findings, source, file, node, 'process_env_write', envKeyFromMember(node.left));
      }
    }

    if (!isConfigOwner && node.type === 'UpdateExpression' && isProcessEnvMember(node.argument)) {
      addFinding(findings, source, file, node, 'process_env_write', envKeyFromMember(node.argument));
    }

    if (!isConfigOwner && node.type === 'UnaryExpression' && node.operator === 'delete' && isProcessEnvMember(node.argument)) {
      addFinding(findings, source, file, node, 'process_env_delete', envKeyFromMember(node.argument));
    }

    if (!isConfigOwner && isObjectAssignProcessEnv(node)) {
      addFinding(findings, source, file, node, 'process_env_bulk_mutation', 'Object.assign(process.env, ...)');
    }

    if (!isConfigOwner && isConfigLoaderMutationCall(node)) {
      addFinding(findings, source, file, node, 'configloader_mutation_call', propertyName(node.callee.property));
    }

    if (!isConfigOwner && node.type === 'LogicalExpression' && node.operator === '||') {
      const text = lineText(source, nodeLine(node));
      if (text.includes('process.env') || text.includes('ConfigLoader.get')) {
        addFinding(findings, source, file, node, 'silent_or_default_override', '|| fallback on env/config read');
      }
    }
  });

  return findings.sort((a, b) => (a.file.localeCompare(b.file) || a.line - b.line || a.kind.localeCompare(b.kind)));
}

function scanProject(projectRoot = process.cwd(), entries = DEFAULT_ROOTS) {
  const findings = [];
  for (const file of collectFiles(projectRoot, entries)) {
    const source = fs.readFileSync(path.join(projectRoot, file), 'utf8');
    findings.push(...scanSource(source, file));
  }
  return findings.sort((a, b) => (a.file.localeCompare(b.file) || a.line - b.line || a.kind.localeCompare(b.kind)));
}

function formatFindings(findings) {
  if (findings.length === 0) return 'config boundary: PASS\n';
  const lines = [
    `config boundary: FAIL (${findings.length} finding${findings.length === 1 ? '' : 's'})`,
    '',
  ];
  for (const finding of findings) {
    lines.push(`${finding.file}:${finding.line} [${finding.kind}] ${finding.detail}`);
    lines.push(`  ${finding.code}`);
  }
  return `${lines.join('\n')}\n`;
}

function main(argv = process.argv.slice(2)) {
  const projectRoot = process.cwd();
  const findings = scanProject(projectRoot);
  process.stdout.write(formatFindings(findings));
  if (findings.length > 0 && argv.includes('--fail-on-findings')) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  CONFIG_MUTATION_METHODS,
  CONFIG_OWNER_FILES,
  collectFiles,
  formatFindings,
  scanProject,
  scanSource,
};
