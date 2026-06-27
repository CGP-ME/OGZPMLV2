'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..');
const IGNORE_DIRS = ['node_modules', '.git', 'archive', '.claude', 'ogz-meta/ledger'];
const MUTATING_METHODS = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'set', 'delete', 'clear', 'add']);

let Parser = null;
let JavaScript = null;
let BabelParser = null;
try {
  Parser = require('tree-sitter');
  JavaScript = require('tree-sitter-javascript');
  BabelParser = require('@babel/parser');
} catch (err) {
  Parser = null;
  JavaScript = null;
}

function findJSFiles(dir, repoRoot = DEFAULT_REPO_ROOT, results = []) {
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relative = path.relative(repoRoot, fullPath).replace(/\\/g, '/');
    if (IGNORE_DIRS.some((ignored) => relative === ignored || relative.startsWith(`${ignored}/`))) {
      continue;
    }
    if (entry.isDirectory()) {
      findJSFiles(fullPath, repoRoot, results);
    } else if (entry.isFile() && entry.name.endsWith('.js') && !entry.name.endsWith('.bak')) {
      results.push(fullPath);
    }
  }
  return results;
}

function createParser() {
  if (!Parser || !JavaScript) {
    throw new Error('tree-sitter and tree-sitter-javascript are required for Serena symbol scanning');
  }
  const parser = new Parser();
  parser.setLanguage(JavaScript);
  return parser;
}

function nodeText(source, node) {
  if (!node) return '';
  return source.slice(node.startIndex, node.endIndex);
}

function oneLine(source, node, max = 220) {
  const text = nodeText(source, node).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function lineOf(node) {
  return node.startPosition.row + 1;
}

function field(node, name) {
  return node && typeof node.childForFieldName === 'function' ? node.childForFieldName(name) : null;
}

function namedChildren(node) {
  if (Array.isArray(node.namedChildren)) {
    return node.namedChildren.filter(Boolean);
  }
  const children = [];
  for (let i = 0; i < node.namedChildCount; i += 1) {
    const child = node.namedChild(i);
    if (child) children.push(child);
  }
  return children;
}

function propertyName(source, node) {
  const prop = field(node, 'property');
  if (!prop) return null;
  return nodeText(source, prop).replace(/^['"]|['"]$/g, '');
}

function receiverText(source, node) {
  const object = field(node, 'object');
  if (!object) return '';
  return nodeText(source, object).replace(/\s+/g, '');
}

function enclosingName(source, node) {
  let current = node.parent;
  while (current) {
    if (current.type === 'method_definition') {
      const name = field(current, 'name');
      return name ? nodeText(source, name) : '<method>';
    }
    if (current.type === 'function_declaration') {
      const name = field(current, 'name');
      return name ? nodeText(source, name) : '<function>';
    }
    if (current.type === 'function_expression' || current.type === 'arrow_function') {
      return `<${current.type}>`;
    }
    current = current.parent;
  }
  return '<module>';
}

function isSameNode(a, b) {
  return a && b && a.startIndex === b.startIndex && a.endIndex === b.endIndex && a.type === b.type;
}

function classifyPropertyOp(source, node) {
  const parent = node.parent;
  if (!parent) return 'read';

  if (parent.type === 'assignment_expression') {
    return isSameNode(field(parent, 'left'), node) ? 'write' : 'read';
  }
  if (parent.type === 'augmented_assignment_expression') {
    return isSameNode(field(parent, 'left'), node) ? 'write:compound' : 'read';
  }
  if (parent.type === 'update_expression') {
    return 'write:compound';
  }
  if (parent.type === 'unary_expression' && nodeText(source, parent).trim().startsWith('delete ')) {
    return 'delete';
  }
  if (parent.type === 'member_expression') {
    const method = propertyName(source, parent);
    if (MUTATING_METHODS.has(method) && parent.parent && parent.parent.type === 'call_expression') {
      return `mutate:${method}`;
    }
  }
  return 'read';
}

function classifyReturnOp(source, callNode) {
  const parent = callNode.parent;
  if (!parent) return 'call';
  if (parent.type === 'member_expression') {
    const method = propertyName(source, parent);
    const grand = parent.parent;
    if (method && grand && grand.type === 'call_expression' && MUTATING_METHODS.has(method)) {
      return `call+mutate-return:${method}`;
    }
    return 'call+read-return';
  }
  if (parent.type === 'subscript_expression') {
    return 'call+read-return';
  }
  return 'call';
}

function variableDeclaratorValue(node) {
  let current = node.parent;
  while (current) {
    if (current.type === 'variable_declarator') return field(current, 'value');
    current = current.parent;
  }
  return null;
}

function scopeAllows(file, repoRoot, scope) {
  if (!Array.isArray(scope) || scope.length === 0) return true;
  const rel = path.relative(repoRoot, file).replace(/\\/g, '/');
  return scope.some((entry) => {
    const raw = String(entry).replace(/\\/g, '/').trim();
    const clean = raw.replace(/\*\*\/\*\.js$/, '').replace(/\*\.js$/, '');
    if (!clean || clean === '.' || raw === '*' || raw === '**/*' || raw === '**/*.js') return true;
    return rel === clean || rel.startsWith(clean.replace(/\/$/, '') + '/');
  });
}

function parseFile(parser, file) {
  const source = fs.readFileSync(file, 'utf8');
  return { source, tree: parser.parse(source) };
}

function sourceLine(source, node) {
  if (!node || !node.loc || !node.loc.start) return '';
  return (source.split('\n')[node.loc.start.line - 1] || '').trim();
}

function babelNodeText(source, node, max = 220) {
  if (!node || typeof node.start !== 'number' || typeof node.end !== 'number') return '';
  const text = source.slice(node.start, node.end).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function babelLine(node) {
  return node && node.loc && node.loc.start ? node.loc.start.line : 1;
}

function babelColumn(node) {
  return node && node.loc && node.loc.start ? node.loc.start.column : 0;
}

function babelPropertyName(source, node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'StringLiteral' || node.type === 'NumericLiteral') return String(node.value);
  return babelNodeText(source, node).replace(/^['"]|['"]$/g, '');
}

function babelReceiverText(source, node) {
  if (!node || !node.object) return '';
  return babelNodeText(source, node.object).replace(/\s+/g, '');
}

function babelEnclosingName(node) {
  let current = node && node._serenaParent;
  while (current) {
    if (current.type === 'ClassMethod' || current.type === 'ObjectMethod') {
      return babelPropertyName('', current.key) || '<method>';
    }
    if (current.type === 'FunctionDeclaration') {
      return current.id ? current.id.name : '<function>';
    }
    if (current.type === 'FunctionExpression' || current.type === 'ArrowFunctionExpression') {
      return `<${current.type}>`;
    }
    current = current._serenaParent;
  }
  return '<module>';
}

function isBabelSameNode(a, b) {
  return a && b && a.start === b.start && a.end === b.end && a.type === b.type;
}

function babelClassifyPropertyOp(source, node) {
  const parent = node._serenaParent;
  if (!parent) return 'read';
  if (parent.type === 'AssignmentExpression') {
    if (!isBabelSameNode(parent.left, node)) return 'read';
    return parent.operator && parent.operator !== '=' ? 'write:compound' : 'write';
  }
  if (parent.type === 'UpdateExpression') {
    return 'write:compound';
  }
  if (parent.type === 'UnaryExpression' && parent.operator === 'delete') {
    return 'delete';
  }
  if (parent.type === 'MemberExpression') {
    const method = babelPropertyName(source, parent.property);
    const grand = parent._serenaParent;
    if (MUTATING_METHODS.has(method) && grand && grand.type === 'CallExpression') {
      return `mutate:${method}`;
    }
  }
  return 'read';
}

function babelClassifyReturnOp(source, callNode) {
  const parent = callNode._serenaParent;
  if (!parent) return 'call';
  if (parent.type === 'MemberExpression') {
    const method = babelPropertyName(source, parent.property);
    const grand = parent._serenaParent;
    if (method && grand && grand.type === 'CallExpression' && MUTATING_METHODS.has(method)) {
      return `call+mutate-return:${method}`;
    }
    return 'call+read-return';
  }
  return 'call';
}

function attachBabelParents(node, parent = null) {
  if (!node || typeof node.type !== 'string') return;
  Object.defineProperty(node, '_serenaParent', {
    value: parent,
    enumerable: false,
    configurable: true,
  });
  for (const key of Object.keys(node)) {
    if (key === '_serenaParent' || key === 'loc' || key === 'start' || key === 'end') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child.type === 'string') attachBabelParents(child, node);
      }
    } else if (value && typeof value.type === 'string') {
      attachBabelParents(value, node);
    }
  }
}

function walkBabel(node, visitor) {
  if (!node || typeof node.type !== 'string') return;
  visitor(node);
  for (const key of Object.keys(node)) {
    if (key === '_serenaParent' || key === 'loc' || key === 'start' || key === 'end') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) walkBabel(child, visitor);
    } else if (value && typeof value.type === 'string') {
      walkBabel(value, visitor);
    }
  }
}

function variableDeclaratorInit(node) {
  let current = node && node._serenaParent;
  while (current) {
    if (current.type === 'VariableDeclarator') return current.init;
    current = current._serenaParent;
  }
  return null;
}

function scanFileWithBabel(file, repoRoot, source) {
  if (!BabelParser) return { propertyRefs: [], methodCalls: [], classSurfaces: [] };
  let ast;
  try {
    ast = BabelParser.parse(source, {
      sourceType: 'unambiguous',
      plugins: [
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        'dynamicImport',
        'jsx',
        'nullishCoalescingOperator',
        'objectRestSpread',
        'optionalChaining',
      ],
    });
  } catch (_) {
    return { propertyRefs: [], methodCalls: [], classSurfaces: [] };
  }

  attachBabelParents(ast);
  const rel = path.relative(repoRoot, file).replace(/\\/g, '/');
  const propertyRefs = [];
  const methodCalls = [];
  const classSurfaces = [];

  function addPropertyRef(node, propName, opOverride = null, receiverOverride = null) {
    propertyRefs.push({
      file: rel,
      line: babelLine(node),
      column: babelColumn(node),
      property: propName,
      receiver: receiverOverride == null ? babelReceiverText(source, node) : receiverOverride,
      receiverPath: receiverOverride == null ? babelReceiverText(source, node) : receiverOverride,
      op: opOverride || babelClassifyPropertyOp(source, node),
      context: babelNodeText(source, node._serenaParent || node) || sourceLine(source, node),
      enclosing: babelEnclosingName(node),
    });
  }

  walkBabel(ast, (node) => {
    if (node.type === 'MemberExpression' && !node.computed) {
      const prop = babelPropertyName(source, node.property);
      if (prop) addPropertyRef(node, prop);
    } else if (node.type === 'ObjectProperty') {
      const parent = node._serenaParent;
      if (parent && parent.type === 'ObjectPattern') {
        const prop = babelPropertyName(source, node.key);
        const value = variableDeclaratorInit(node);
        if (prop) {
          propertyRefs.push({
            file: rel,
            line: babelLine(node.key || node),
            column: babelColumn(node.key || node),
            property: prop,
            receiver: value ? babelNodeText(source, value).replace(/\s+/g, '') : '',
            receiverPath: value ? babelNodeText(source, value).replace(/\s+/g, '') : '',
            op: 'destructure',
            context: babelNodeText(source, parent._serenaParent || parent) || sourceLine(source, node),
            enclosing: babelEnclosingName(node),
          });
        }
      }
    } else if (node.type === 'CallExpression' && node.callee && node.callee.type === 'MemberExpression') {
      const method = babelPropertyName(source, node.callee.property);
      if (method) {
        methodCalls.push({
          file: rel,
          line: babelLine(node),
          column: babelColumn(node),
          method,
          receiver: babelReceiverText(source, node.callee),
          receiverPath: babelReceiverText(source, node.callee),
          op: babelClassifyReturnOp(source, node),
          context: babelNodeText(source, node),
          enclosing: babelEnclosingName(node),
        });
      }
    } else if (node.type === 'ClassDeclaration') {
      const surface = {
        file: rel,
        line: babelLine(node),
        className: node.id ? node.id.name : '<anonymous>',
        fields: [],
        methods: [],
        getters: [],
        setters: [],
      };
      for (const child of (node.body && node.body.body) || []) {
        if (child.type === 'ClassMethod' || child.type === 'ClassPrivateMethod') {
          const name = babelPropertyName(source, child.key) || '<anonymous>';
          if (child.kind === 'get') surface.getters.push({ name, line: babelLine(child) });
          else if (child.kind === 'set') surface.setters.push({ name, line: babelLine(child) });
          else surface.methods.push({ name, line: babelLine(child) });
        } else if (child.type === 'ClassProperty' || child.type === 'ClassPrivateProperty' || child.type === 'PropertyDefinition') {
          const name = babelPropertyName(source, child.key);
          if (name) surface.fields.push({ name, line: babelLine(child) });
        }
      }
      classSurfaces.push(surface);
    }
  });

  return { propertyRefs, methodCalls, classSurfaces };
}

function scanFile(file, repoRoot, parser) {
  const { source, tree } = parseFile(parser, file);
  const rel = path.relative(repoRoot, file).replace(/\\/g, '/');
  const propertyRefs = [];
  const methodCalls = [];
  const classSurfaces = [];

  function addPropertyRef(node, propName, opOverride = null, receiverOverride = null) {
    propertyRefs.push({
      file: rel,
      line: lineOf(node),
      column: node.startPosition.column,
      property: propName,
      receiver: receiverOverride == null ? receiverText(source, node) : receiverOverride,
      receiverPath: receiverOverride == null ? receiverText(source, node) : receiverOverride,
      op: opOverride || classifyPropertyOp(source, node),
      context: oneLine(source, node.parent || node),
      enclosing: enclosingName(source, node),
    });
  }

  function visit(node) {
    if (!node) return;
    if (node.type === 'member_expression') {
      const prop = propertyName(source, node);
      if (prop) {
        addPropertyRef(node, prop);
      }
    } else if (node.type === 'shorthand_property_identifier_pattern' || node.type === 'property_identifier') {
      const parent = node.parent;
      if (parent && (parent.type === 'object_pattern' || parent.type === 'pair_pattern')) {
        const prop = nodeText(source, node);
        const value = variableDeclaratorValue(node);
        propertyRefs.push({
          file: rel,
          line: lineOf(node),
          column: node.startPosition.column,
          property: prop,
          receiver: value ? nodeText(source, value).replace(/\s+/g, '') : '',
          receiverPath: value ? nodeText(source, value).replace(/\s+/g, '') : '',
          op: 'destructure',
          context: oneLine(source, parent.parent || parent),
          enclosing: enclosingName(source, node),
        });
      }
    } else if (node.type === 'call_expression') {
      const callee = field(node, 'function');
      if (callee && callee.type === 'member_expression') {
        const method = propertyName(source, callee);
        if (method) {
          methodCalls.push({
            file: rel,
            line: lineOf(node),
            column: node.startPosition.column,
            method,
            receiver: receiverText(source, callee),
            receiverPath: receiverText(source, callee),
            op: classifyReturnOp(source, node),
            context: oneLine(source, node),
            enclosing: enclosingName(source, node),
          });
        }
      }
    } else if (node.type === 'class_declaration') {
      const name = field(node, 'name');
      const body = field(node, 'body');
      const surface = {
        file: rel,
        line: lineOf(node),
        className: name ? nodeText(source, name) : '<anonymous>',
        fields: [],
        methods: [],
        getters: [],
        setters: [],
      };
      if (body) {
        for (const child of namedChildren(body)) {
          if (child.type === 'method_definition') {
            const methodName = field(child, 'name');
            const methodText = methodName ? nodeText(source, methodName) : '<anonymous>';
            const prefix = nodeText(source, child).trim().split(/\s+/)[0];
            if (prefix === 'get') {
              surface.getters.push({ name: methodText, line: lineOf(child) });
            } else if (prefix === 'set') {
              surface.setters.push({ name: methodText, line: lineOf(child) });
            } else {
              surface.methods.push({ name: methodText, line: lineOf(child) });
            }
          } else if (child.type === 'field_definition' || child.type === 'public_field_definition') {
            const fieldName = field(child, 'property') || field(child, 'name') || child.namedChild(0);
            if (fieldName) surface.fields.push({ name: nodeText(source, fieldName), line: lineOf(child) });
          }
        }
      }
      classSurfaces.push(surface);
    }

    for (const child of namedChildren(node)) {
      visit(child);
    }
  }

  visit(tree.rootNode);
  if (propertyRefs.length === 0 && methodCalls.length === 0 && classSurfaces.length === 0) {
    return scanFileWithBabel(file, repoRoot, source);
  }
  return { propertyRefs, methodCalls, classSurfaces };
}

function scanRepo(repoRoot = DEFAULT_REPO_ROOT, opts = {}) {
  const parser = createParser();
  const files = findJSFiles(repoRoot, repoRoot).filter((file) => scopeAllows(file, repoRoot, opts.scope));
  const propertyRefs = [];
  const methodCalls = [];
  const classSurfaces = [];
  const errors = [];
  for (const file of files) {
    try {
      const scan = scanFile(file, repoRoot, parser);
      propertyRefs.push(...scan.propertyRefs);
      methodCalls.push(...scan.methodCalls);
      classSurfaces.push(...scan.classSurfaces);
    } catch (err) {
      errors.push({
        file: path.relative(repoRoot, file).replace(/\\/g, '/'),
        error: err.message,
      });
    }
  }
  return { propertyRefs, methodCalls, classSurfaces, errors, filesScanned: files.length };
}

function applyCommonFilters(rows, opts = {}) {
  let filtered = rows;
  if (opts.receiver) {
    filtered = filtered.filter((row) => row.receiver === opts.receiver || row.receiverPath === opts.receiver);
  }
  if (opts.receiverPath) {
    filtered = filtered.filter((row) => row.receiverPath === opts.receiverPath);
  }
  if (opts.op) {
    const ops = Array.isArray(opts.op) ? opts.op : String(opts.op).split(',').map((part) => part.trim()).filter(Boolean);
    filtered = filtered.filter((row) => ops.some((op) => {
      if (op.endsWith('*')) return row.op.startsWith(op.slice(0, -1));
      return row.op === op;
    }));
  }
  return filtered;
}

function getPropertyReferences(propName, opts = {}) {
  const repoRoot = opts.repoRoot || DEFAULT_REPO_ROOT;
  const scan = scanRepo(repoRoot, opts);
  const rows = applyCommonFilters(
    scan.propertyRefs.filter((ref) => ref.property === propName),
    opts
  );
  return {
    source: 'serena_tree_sitter_property_refs',
    parser: 'tree-sitter-javascript',
    property: propName,
    total: rows.length,
    filesScanned: scan.filesScanned,
    errors: scan.errors,
    references: rows.slice(0, opts.limit || 200),
    truncated: rows.length > (opts.limit || 200),
  };
}

function getMethodCallers(methodName, opts = {}) {
  const repoRoot = opts.repoRoot || DEFAULT_REPO_ROOT;
  const scan = scanRepo(repoRoot, opts);
  const rows = applyCommonFilters(
    scan.methodCalls.filter((call) => call.method === methodName || `${call.receiver}.${call.method}` === methodName),
    opts
  );
  return {
    source: 'serena_tree_sitter_method_callers',
    parser: 'tree-sitter-javascript',
    method: methodName,
    total: rows.length,
    filesScanned: scan.filesScanned,
    errors: scan.errors,
    callers: rows.slice(0, opts.limit || 200),
    truncated: rows.length > (opts.limit || 200),
  };
}

function getClassFields(className, opts = {}) {
  const repoRoot = opts.repoRoot || DEFAULT_REPO_ROOT;
  const scan = scanRepo(repoRoot, opts);
  const matches = scan.classSurfaces.filter((surface) => surface.className === className);
  return {
    source: 'serena_tree_sitter_class_fields',
    parser: 'tree-sitter-javascript',
    className,
    total: matches.length,
    filesScanned: scan.filesScanned,
    errors: scan.errors,
    classes: matches.slice(0, opts.limit || 20),
    truncated: matches.length > (opts.limit || 20),
  };
}

module.exports = {
  findJSFiles,
  getClassFields,
  getMethodCallers,
  getPropertyReferences,
  scanRepo,
};
