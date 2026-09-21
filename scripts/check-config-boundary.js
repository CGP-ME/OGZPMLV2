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

function memberPropertyName(member) {
  if (!member || member.type !== 'MemberExpression') return null;
  if (member.computed && !isStringLiteral(member.property)) return null;
  return propertyName(member.property);
}

function isProcessEnv(node) {
  return node &&
    node.type === 'MemberExpression' &&
    isIdentifier(node.object, 'process') &&
    propertyName(node.property) === 'env';
}

function isProcessObject(node, processAliases) {
  return node &&
    node.type === 'Identifier' &&
    (node.name === 'process' || processAliases.has(node.name));
}

function isProcessEnvExpression(node, processAliases) {
  return node &&
    node.type === 'MemberExpression' &&
    isProcessObject(node.object, processAliases) &&
    memberPropertyName(node) === 'env';
}

function isProcessEnvMember(node) {
  return node &&
    node.type === 'MemberExpression' &&
    isProcessEnv(node.object);
}

function isProcessEnvMemberExpression(node, processAliases) {
  return node &&
    node.type === 'MemberExpression' &&
    isProcessEnvExpression(node.object, processAliases);
}

function envKeyFromMember(node, processAliases = new Set()) {
  if (!isProcessEnvMember(node) && !isProcessEnvMemberExpression(node, processAliases)) return null;
  return memberPropertyName(node) || '<computed>';
}

function isEnvAliasMember(node, envAliases) {
  return node &&
    node.type === 'MemberExpression' &&
    node.object &&
    node.object.type === 'Identifier' &&
    envAliases.has(node.object.name);
}

function envKeyFromAliasMember(node) {
  if (!node || node.type !== 'MemberExpression') return null;
  return memberPropertyName(node) || '<computed>';
}

function isConfigLoaderRequire(node) {
  return node &&
    node.type === 'CallExpression' &&
    isIdentifier(node.callee, 'require') &&
    node.arguments.length === 1 &&
    isStringLiteral(node.arguments[0]) &&
    node.arguments[0].value.includes('ConfigLoader');
}

function isConfigLoaderObject(node, configLoaderAliases) {
  return node &&
    node.type === 'Identifier' &&
    (node.name === 'ConfigLoader' || configLoaderAliases.has(node.name));
}

function isConfigLoaderMutationCall(node, configLoaderAliases, configMutationAliases) {
  if (!node || node.type !== 'CallExpression') return false;
  if (node.callee && node.callee.type === 'Identifier' && configMutationAliases.has(node.callee.name)) {
    return true;
  }
  const callee = node.callee;
  return callee &&
    callee.type === 'MemberExpression' &&
    isConfigLoaderObject(callee.object, configLoaderAliases) &&
    CONFIG_MUTATION_METHODS.has(memberPropertyName(callee));
}

function isConfigLoaderComputedCall(node, configLoaderAliases) {
  if (!node || node.type !== 'CallExpression') return false;
  const callee = node.callee;
  if (!callee || callee.type !== 'MemberExpression' || !callee.computed) return false;
  if (!isConfigLoaderObject(callee.object, configLoaderAliases)) return false;
  const prop = memberPropertyName(callee);
  return !prop || CONFIG_MUTATION_METHODS.has(prop);
}

function isConfigLoaderMutationMember(node, configLoaderAliases) {
  if (!node || node.type !== 'MemberExpression') return false;
  if (!isConfigLoaderObject(node.object, configLoaderAliases)) return false;
  const prop = memberPropertyName(node);
  return !prop || CONFIG_MUTATION_METHODS.has(prop);
}

function isProcessEnvOrAlias(node, envAliases, processAliases = new Set()) {
  return isProcessEnvExpression(node, processAliases) ||
    (node && node.type === 'Identifier' && envAliases.has(node.name));
}

function isObjectAliasMember(node, objectAliases, property) {
  return node &&
    node.type === 'MemberExpression' &&
    node.object &&
    node.object.type === 'Identifier' &&
    objectAliases.has(node.object.name) &&
    memberPropertyName(node) === property;
}

function isObjectAssignProcessEnv(node, envAliases, processAliases, objectAliases, objectMutationAliases) {
  if (!node || node.type !== 'CallExpression') return false;
  const callee = node.callee;
  const isAssignCallee = callee &&
    callee.type === 'MemberExpression' &&
    isObjectAliasMember(callee, objectAliases, 'assign');
  const isAssignAlias = callee &&
    callee.type === 'Identifier' &&
    objectMutationAliases.get(callee.name) === 'assign';
  return (isAssignCallee || isAssignAlias) &&
    node.arguments.some(arg => isProcessEnvOrAlias(arg, envAliases, processAliases));
}

function isObjectDefinePropertyProcessEnv(node, envAliases, processAliases, objectAliases, objectMutationAliases) {
  if (!node || node.type !== 'CallExpression') return false;
  const callee = node.callee;
  const isDefinePropertyCallee = callee &&
    callee.type === 'MemberExpression' &&
    isObjectAliasMember(callee, objectAliases, 'defineProperty');
  const isDefinePropertyAlias = callee &&
    callee.type === 'Identifier' &&
    objectMutationAliases.get(callee.name) === 'defineProperty';
  return (isDefinePropertyCallee || isDefinePropertyAlias) &&
    node.arguments.some(arg => isProcessEnvOrAlias(arg, envAliases, processAliases));
}

function isProcessEnvSpread(node, envAliases, processAliases) {
  return node &&
    node.type === 'SpreadElement' &&
    isProcessEnvOrAlias(node.argument, envAliases, processAliases);
}

function objectPatternNames(pattern) {
  if (!pattern || pattern.type !== 'ObjectPattern') return [];
  const names = [];
  for (const prop of pattern.properties || []) {
    if (!prop) continue;
    if (prop.type === 'RestElement' && prop.argument && prop.argument.type === 'Identifier') {
      names.push(prop.argument.name);
    } else {
      const key = propertyName(prop.key);
      if (key) names.push(key);
    }
  }
  return names;
}

function objectPatternBindings(pattern) {
  if (!pattern || pattern.type !== 'ObjectPattern') return [];
  const bindings = [];
  for (const prop of pattern.properties || []) {
    if (!prop) continue;
    if (prop.type === 'RestElement' && prop.argument && prop.argument.type === 'Identifier') {
      bindings.push({ key: prop.argument.name, local: prop.argument.name });
      continue;
    }
    const key = propertyName(prop.key);
    let local = key;
    if (prop.value && prop.value.type === 'Identifier') {
      local = prop.value.name;
    } else if (prop.value && prop.value.type === 'AssignmentPattern' && prop.value.left.type === 'Identifier') {
      local = prop.value.left.name;
    }
    if (key && local) bindings.push({ key, local });
  }
  return bindings;
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
  const processAliases = new Set(['process']);
  const envAliases = new Set();
  const configLoaderAliases = new Set(['ConfigLoader']);
  const configMutationAliases = new Set();
  const objectAliases = new Set(['Object']);
  const objectMutationAliases = new Map();

  walk(ast, (node) => {
    if (node.type !== 'VariableDeclarator') return;

    if (node.id && node.id.type === 'Identifier' && isIdentifier(node.init, 'process')) {
      processAliases.add(node.id.name);
      return;
    }

    if (node.id && node.id.type === 'ObjectPattern' && isProcessObject(node.init, processAliases)) {
      for (const binding of objectPatternBindings(node.id)) {
        if (binding.key === 'env') {
          envAliases.add(binding.local);
          if (!isConfigOwner) {
            addFinding(findings, source, file, node, 'process_env_alias', binding.local);
          }
        }
      }
      return;
    }

    if (node.id && node.id.type === 'Identifier' && isIdentifier(node.init, 'Object')) {
      objectAliases.add(node.id.name);
      return;
    }

    if (node.id && node.id.type === 'ObjectPattern' && node.init && node.init.type === 'Identifier' && objectAliases.has(node.init.name)) {
      for (const binding of objectPatternBindings(node.id)) {
        if (binding.key === 'assign' || binding.key === 'defineProperty') {
          objectMutationAliases.set(binding.local, binding.key);
        }
      }
      return;
    }

    if (node.id && node.id.type === 'Identifier' && isProcessEnvExpression(node.init, processAliases)) {
      envAliases.add(node.id.name);
      if (!isConfigOwner) {
        addFinding(findings, source, file, node, 'process_env_alias', node.id.name);
      }
      return;
    }

    if (node.id && node.id.type === 'ObjectPattern' && isProcessEnvOrAlias(node.init, envAliases, processAliases)) {
      const names = objectPatternNames(node.id);
      if (!isConfigOwner) {
        addFinding(findings, source, file, node, 'process_env_destructure_read', names.join(',') || '<unknown>');
      }
      return;
    }

    if (node.id && node.id.type === 'Identifier' && (
      isIdentifier(node.init, 'ConfigLoader') || isConfigLoaderRequire(node.init)
    )) {
      configLoaderAliases.add(node.id.name);
      return;
    }

    if (node.id && node.id.type === 'Identifier' && isConfigLoaderMutationMember(node.init, configLoaderAliases)) {
      configMutationAliases.add(node.id.name);
      return;
    }

    if (node.id && node.id.type === 'ObjectPattern' && (
      isConfigLoaderObject(node.init, configLoaderAliases) || isConfigLoaderRequire(node.init)
    )) {
      for (const binding of objectPatternBindings(node.id)) {
        if (CONFIG_MUTATION_METHODS.has(binding.key)) {
          configMutationAliases.add(binding.local);
        }
      }
    }
  });

  walk(ast, (node, parent) => {
    if (!isConfigOwner && isProcessEnvMemberExpression(node, processAliases)) {
      addFinding(findings, source, file, node, 'process_env_read', envKeyFromMember(node, processAliases));
    }

    if (!isConfigOwner && isEnvAliasMember(node, envAliases)) {
      addFinding(findings, source, file, node, 'process_env_alias_read', envKeyFromAliasMember(node));
    }

    if (!isConfigOwner && node.type === 'AssignmentExpression') {
      if (isProcessEnvExpression(node.left, processAliases)) {
        addFinding(findings, source, file, node, 'process_env_object_reassignment', 'process.env');
      } else if (isProcessEnvMemberExpression(node.left, processAliases)) {
        addFinding(findings, source, file, node, 'process_env_write', envKeyFromMember(node.left, processAliases));
      } else if (isEnvAliasMember(node.left, envAliases)) {
        addFinding(findings, source, file, node, 'process_env_alias_write', envKeyFromAliasMember(node.left));
      }
    }

    if (!isConfigOwner && node.type === 'UpdateExpression' && isProcessEnvMemberExpression(node.argument, processAliases)) {
      addFinding(findings, source, file, node, 'process_env_write', envKeyFromMember(node.argument, processAliases));
    }

    if (!isConfigOwner && node.type === 'UpdateExpression' && isEnvAliasMember(node.argument, envAliases)) {
      addFinding(findings, source, file, node, 'process_env_alias_write', envKeyFromAliasMember(node.argument));
    }

    if (!isConfigOwner && node.type === 'UnaryExpression' && node.operator === 'delete' && isProcessEnvMemberExpression(node.argument, processAliases)) {
      addFinding(findings, source, file, node, 'process_env_delete', envKeyFromMember(node.argument, processAliases));
    }

    if (!isConfigOwner && node.type === 'UnaryExpression' && node.operator === 'delete' && isEnvAliasMember(node.argument, envAliases)) {
      addFinding(findings, source, file, node, 'process_env_alias_delete', envKeyFromAliasMember(node.argument));
    }

    if (!isConfigOwner && isObjectAssignProcessEnv(node, envAliases, processAliases, objectAliases, objectMutationAliases)) {
      addFinding(findings, source, file, node, 'process_env_bulk_mutation', 'Object.assign(process.env, ...)');
    }

    if (!isConfigOwner && isObjectDefinePropertyProcessEnv(node, envAliases, processAliases, objectAliases, objectMutationAliases)) {
      addFinding(findings, source, file, node, 'process_env_define_property', 'Object.defineProperty(process.env, ...)');
    }

    if (!isConfigOwner && isProcessEnvSpread(node, envAliases, processAliases)) {
      addFinding(findings, source, file, node, 'process_env_spread', '...process.env');
    }

    if (!isConfigOwner && isConfigLoaderMutationCall(node, configLoaderAliases, configMutationAliases)) {
      const detail = node.callee.type === 'Identifier'
        ? node.callee.name
        : memberPropertyName(node.callee);
      addFinding(findings, source, file, node, 'configloader_mutation_call', detail);
    }

    if (!isConfigOwner && isConfigLoaderComputedCall(node, configLoaderAliases)) {
      addFinding(findings, source, file, node, 'configloader_computed_call', memberPropertyName(node.callee) || '<computed>');
    }

    if (!isConfigOwner && node.type === 'LogicalExpression' && node.operator === '||') {
      const text = lineText(source, nodeLine(node));
      const mentionsEnvAlias = [...envAliases].some(alias => text.includes(`${alias}.`));
      const mentionsConfigAlias = [...configLoaderAliases].some(alias => text.includes(`${alias}.get`));
      if (text.includes('process.env') || text.includes('ConfigLoader.get') || mentionsEnvAlias || mentionsConfigAlias) {
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
