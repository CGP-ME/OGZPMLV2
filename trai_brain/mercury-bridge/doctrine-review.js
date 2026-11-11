'use strict';

const TOTALITY_LAW = 'TOTALITY LAW: "Thoroughly exhaust all sources when auditing. Do not roll with the first thing you come across — you want ALL of the possible answers before you decide, not just one answer. Audits aren\'t for speed. They\'re for totality. Thoroughness." Operationally: enumerate every candidate answer to the question (every file, every consumer, every changelog entry, every era of history that could speak) BEFORE ruling; a first hit is a lead, never a conclusion; stopping-at-first-hit is a named violation (the TFE miss, the CandleProcessor miss — both were this); the decision step is SEPARATE from and AFTER the collection step, and the report shows the full candidate set it decided over.';

const MERCURY_DOCTRINE_PROMPT = [
  'MERCURY REVIEW RECEIPT.',
  TOTALITY_LAW,
  'The word “all” converts the work from point-fix work into a totality claim.',
  'A model-sandbox run_check has no authority for test/build pass or fail claims. Label its execution provenance; only host-attested trusted-path receipts carry test/build authority.',
  'Report missing evidence, coverage limits, reviewer disagreements and reporting omissions honestly in the exit receipt. These diagnostics do not impose a verdict ceiling or require a rerun. They never authorize a fabricated PASS. Trey explicitly ruled that Astra executable-trust failures are recorded and dispatch continues. Repository-access protections and financial protections remain unchanged.',
  'Final adversarial answers must deliver the fields the existing receipt parser and doctrine assessor read. Use literal headings followed by colons, not a prose-only conclusion.',
  'VERDICT: found_break | no_break_found | cannot_verify. State your actual supported conclusion; an HTTP success or missing evidence never means no_break_found. Mercury, Astra and Fable use this same code-outcome vocabulary; agreement is recorded separately from the code outcome. Planning and architecture reviews retain their non-adversarial output contract.',
  'ADVERSARIAL_REVIEW_BLOCKING: yes | no. Include your actual evidence-to-verdict rationale and literal repo path:line citations.',
  'CANDIDATE SET: examined N of M; enumerate the complete candidate inventory, including every changed path. These are evidence counts, not confidence estimates. Unread or unresolved evidence must remain named.',
  'AST EVIDENCE: distinguish host-provided scan receipts from tools you actually used. Whole-file coverage requires complete delivered source, not an AST summary or an assertion that a file was read.',
  'INHERITED: identify each full repo-relative changed path and describe inherited fallback, swallowed error, environment bypass and silent default behavior, including unread areas. Use ordinary wording; category spellings are not evidence. Do not invent absence or zero findings.',
  'FOURTH SHAPE CLASSIFIER: classified N of M; classify every added throw, guard, gate or fallback with producer evidence. Review-tool restrictions are not bot-runtime authority. Do not introduce new bot gates.',
  'ALLEGATIONS: explain each finding and cite its basis. Distinguish observed evidence from testimony in ordinary language; literal classification tags are not required and do not establish evidence.',
  'SUBSTANTIVE RESOLUTION: convergence | UNRESOLVED-FOR-TREY | none. Use none when no substantive dispute exists; retain unresolved disagreements and the actual seat positions.',
  'WHAT I DID: mechanically examined evidence. WHAT I DID NOT DO: named gaps. WHAT I ASSUMED: assumptions or none. WHY THIS VERDICT: reasoning. IF INCOMPLETE, WHY: actual reason or not incomplete. Put each heading on its own line.',
].join('\n');

function uniqueInOrder(values) {
  return [...new Set(values.filter(Boolean))];
}

function changedDiffLines(diff) {
  return String(diff || '')
    .split(/\r?\n/)
    .filter(line => /^[+-](?![+-])/.test(line));
}

function extractDiffReferenceNames(diff, { readSource } = {}) {
  const files = [];
  let file = null;
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  const diffPath = value => {
    if (value === '/dev/null') return null;
    const decoded = value.startsWith('"') ? JSON.parse(value) : value;
    return decoded.replace(/^[ab]\//, '');
  };
  for (const line of String(diff || '').split(/\r?\n/)) {
    if (line.startsWith('diff --git ')) inHunk = false;
    if (!inHunk && line.startsWith('--- ')) {
      file = { before: diffPath(line.slice(4)), after: null, removed: [], added: [] };
      files.push(file);
    } else if (!inHunk && file && line.startsWith('+++ ')) {
      file.after = diffPath(line.slice(4));
    } else if (file && /^@@ -\d/.test(line)) {
      const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunk) { oldLine = Number(hunk[1]); newLine = Number(hunk[2]); inHunk = true; }
    } else if (file && inHunk) {
      if (line.startsWith('-')) file.removed.push(oldLine++);
      else if (line.startsWith('+')) file.added.push(newLine++);
      else if (line.startsWith(' ')) { oldLine++; newLine++; }
    }
  }

  const references = [];
  const unresolved = [];
  const accessors = new Set(['getConfigValue', 'requiredString', 'optionalString',
    'requiredBoolean', 'optionalBoolean', 'requiredNumber', 'optionalNumber',
    'requiredText', 'optionalText']);
  const isMember = node => node && ['MemberExpression', 'OptionalMemberExpression'].includes(node.type);
  const literal = node => node && (node.type === 'StringLiteral' ? node.value
    : node.type === 'TemplateLiteral' && node.expressions.length === 0 ? node.quasis[0].value.cooked : null);
  const property = node => !node.computed && node.property.type === 'Identifier'
    ? node.property.name : literal(node.property);
  const isIdentifier = (node, name) => node && node.type === 'Identifier' && node.name === name;
  const namedObject = (node, name) => isIdentifier(node, name) || (isMember(node) && property(node) === name);
  for (const file of files) {
    for (const [side, changed] of [['before', file.removed], ['after', file.added]]) {
      const filename = file[side];
      if (!filename || !/\.(?:js|mjs|cjs)$/.test(filename) || changed.length === 0) continue;
      let ast;
      try {
        // Parse the complete selected source, never prose or a syntactically
        // incomplete diff fragment. Before and after use their own coordinates.
        ast = require('@babel/parser').parse(readSource(filename, side), {
          sourceType: 'unambiguous', plugins: ['jsx'],
        });
      } catch (error) {
        unresolved.push({ file: filename, side, error: `reference source unavailable or unparsed: ${error.message}` });
        continue;
      }
      const visit = node => {
        if (!node || typeof node !== 'object') return;
        if (node.loc && changed.some(line => line >= node.loc.start.line && line <= node.loc.end.line)) {
          let relevant = false;
          let name = null;
          if (isMember(node)) {
            const object = node.object;
            relevant = namedObject(object, 'config') || namedObject(object, 'env');
            if (relevant) name = property(node);
          } else if (['CallExpression', 'OptionalCallExpression'].includes(node.type)
              && accessors.has(isMember(node.callee) ? property(node.callee) : node.callee.name)) {
            relevant = true;
            name = literal(node.arguments[1]);
          }
          if (relevant) {
            if (name) references.push({ name, file: filename, side, line: node.loc.start.line, precision: 'ast_syntax' });
            else unresolved.push({ file: filename, side, line: node.loc.start.line,
              error: 'dynamic configuration reference requires source inspection' });
          }
        }
        for (const [key, child] of Object.entries(node)) {
          if (['loc', 'extra', 'comments', 'tokens', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) continue;
          if (Array.isArray(child)) child.forEach(visit);
          else if (child && typeof child === 'object') visit(child);
        }
      };
      visit(ast.program);
    }
  }
  return { names: uniqueInOrder(references.map(item => item.name)), references, unresolved };
}

function countDeclaration(answer, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(answer || '').match(new RegExp(`${escaped}[^\\n]*?(?:examined|classified)\\s+(\\d+)\\s+of\\s+(\\d+)`, 'i'));
  return match ? { examined: Number(match[1]), total: Number(match[2]) } : null;
}

function addedFourthShapeAdditions(diff) {
  let currentFile = null;
  let sourceLine = 0;
  const additions = [];
  for (const line of String(diff || '').split(/\r?\n/)) {
    const header = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (header) {
      currentFile = header[2];
      continue;
    }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) { sourceLine = Number(hunk[1]); continue; }
    if (/^(?:\+\+\+|---|\\)/.test(line)) continue;
    if (line.startsWith(' ')) { sourceLine += 1; continue; }
    if (!line.startsWith('+')) continue;
    const addedLine = sourceLine++;
    if (!currentFile || !currentFile.endsWith('.js')) continue;
    const code = line.slice(1)
      .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '')
      .replace(/\/\/.*$/, '')
      .trim();
    if (!code) continue;
    if (/\bthrow\b/.test(code) || /\b[A-Za-z_$][\w$]*(?:gate|guard|fallback)[\w$]*\b/i.test(code)) {
      additions.push({ path: currentFile, line: addedLine, code: line.slice(1).trim() });
    }
  }
  return additions;
}

function addedFourthShapeCount(diff) {
  return addedFourthShapeAdditions(diff).length;
}

function completeWholeFileReads(changedFiles, telemetry, evidenceSources) {
  const reads = Array.isArray(telemetry && telemetry.fileReads) ? telemetry.fileReads : [];
  const attestedWholeFiles = new Set((Array.isArray(evidenceSources) ? evidenceSources : [])
    .filter(source => source && source.path && source.line_start === 1
      && Number.isInteger(source.line_end)
      && Number.isInteger(source.artifact_bytes)
      && Number.isInteger(source.excerpt_bytes)
      && source.artifact_bytes - source.excerpt_bytes <= 1)
    .map(source => source.path));
  return changedFiles.every((file) => {
    if (attestedWholeFiles.has(file)) return true;
    const fileReads = reads.filter(read => read && read.file === file && Number.isInteger(read.startLine)
      && Number.isInteger(read.endLine) && Number.isInteger(read.totalLines));
    if (fileReads.length === 0) return false;
    const totalLines = Math.max(...fileReads.map(read => read.totalLines));
    const covered = new Set();
    for (const read of fileReads) {
      for (let line = Math.max(1, read.startLine); line <= Math.min(totalLines, read.endLine); line += 1) covered.add(line);
    }
    return covered.size >= totalLines;
  });
}

function sectionValue(answer, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(answer || '').match(new RegExp(
    `(?:^|\\n)\\s*(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*(?:\\*\\*)?[A-Z][A-Z0-9 ]{2,}(?:\\*\\*)?\\s*:|$)`,
    'i'
  ));
  return match ? match[1].trim() : '';
}

// Shared by the report producer's repair feedback and the downstream assessor.
// This checks the existing reporting obligations, not the review's conclusion.
function assessReviewReport(answer, changedFiles, fourthShapeCount) {
  const namedAbsences = [];
  const inherited = sectionValue(answer, 'INHERITED');
  const inheritedMissingPaths = changedFiles.filter(file => !inherited.includes(file));
  if (inheritedMissingPaths.length > 0) {
    namedAbsences.push('inherited_section_incomplete');
  }
  const fourthShape = countDeclaration(answer, 'FOURTH SHAPE CLASSIFIER');
  if (fourthShapeCount > 0 && (!fourthShape || fourthShape.examined < fourthShapeCount
      || fourthShape.total < fourthShapeCount || fourthShape.examined < fourthShape.total)) {
    namedAbsences.push('fourth_shape_unclassified');
  }
  return { namedAbsences, inheritedMissingPaths,
    fourthShape, fourthShapeExpected: fourthShapeCount };
}

function assessDoctrineReview({
  answer,
  candidateSet: structuredCandidateSet = null,
  changedFiles = [],
  diff = '',
  telemetry = {},
  autoScan = null,
  evidenceSources = [],
  reviewerId = null,
  answerQuality = {},
} = {}) {
  const text = String(answer || '');
  const namedAbsences = [];
  const addAbsence = name => {
    if (!namedAbsences.includes(name)) namedAbsences.push(name);
  };
  const candidateSet = countDeclaration(structuredCandidateSet ? structuredCandidateSet.content : text, 'CANDIDATE SET');
  const candidateCoverage = structuredCandidateSet && structuredCandidateSet.coverage;
  if (candidateCoverage && candidateCoverage.complete !== true) addAbsence('coverage_insufficient');
  if (candidateCoverage && candidateCoverage.authorityReady !== true) addAbsence('coverage_unresolved');
  if (changedFiles.length > 0 && (!candidateSet || candidateSet.examined < changedFiles.length
      || candidateSet.total < changedFiles.length || candidateSet.examined < candidateSet.total)) {
    addAbsence('coverage_insufficient');
  }

  const changedJs = changedFiles.filter(file => file.endsWith('.js'));
  const scannedJs = new Set((autoScan && autoScan.ast && Array.isArray(autoScan.ast.fileReceipts)
    ? autoScan.ast.fileReceipts : []).map(entry => entry.file));
  if (changedJs.length > 0 && changedJs.some(file => !scannedJs.has(file))) {
    addAbsence('ast_evidence_absent');
  }
  if (autoScan && Array.isArray(autoScan.errors) && autoScan.errors.length > 0) {
    addAbsence('pre_answer_scan_absent');
  }

  const explicitSourceCoverage = structuredCandidateSet && structuredCandidateSet.explicitContinuation;
  const wholeFilesRead = explicitSourceCoverage
    ? changedFiles.every(file => explicitSourceCoverage.source_coverage.some(read => read.path === file && read.complete === true))
    : completeWholeFileReads(changedFiles, telemetry, evidenceSources);
  if (changedFiles.length > 0 && !wholeFilesRead) {
    addAbsence('whole_file_read_absent');
  }
  const filesOpened = Array.isArray(telemetry.filesOpened) ? telemetry.filesOpened : [];
  const toolInvocationTotal = Number.isInteger(telemetry.total)
    ? telemetry.total
    : Object.values(telemetry.byTool || {}).reduce((total, stats) => total + Number(stats && stats.calls || 0), 0);
  const answerQualityFlags = Array.isArray(answerQuality.flags) ? answerQuality.flags : [];
  if (changedFiles.length === 0 && filesOpened.length === 0 && toolInvocationTotal === 0
      && answerQualityFlags.includes('missing_file_line_citation')) {
    addAbsence('no_mechanical_evidence');
  }
  const fourthShapeCount = addedFourthShapeCount(diff);
  assessReviewReport(text, changedFiles, fourthShapeCount).namedAbsences.forEach(addAbsence);

  const runChecks = Array.isArray(telemetry.runChecks) ? telemetry.runChecks : [];
  const testClaim = /\b(?:tests?|build)\b[\s\S]{0,180}\b(?:pass(?:ed|es)?|fail(?:ed|s)?|green|red)\b/i.test(text)
    || /\b(?:pass(?:ed|es)?|fail(?:ed|s)?|green|red)\b[\s\S]{0,180}\b(?:tests?|build)\b/i.test(text);
  if (testClaim && runChecks.some(check => check.execution_provenance === 'model_sandbox')) {
    addAbsence('sandbox_testimony_only');
  }

  if (/\bVERDICT\s*:\s*(?:found_break|blocked)\b/i.test(text)
      && /\bTESTIMONY\b/i.test(text) && !/\bRECEIPT\b/i.test(text)) {
    addAbsence('testimony_only_finding');
  }

  const hasSubstantive = /\bSUBSTANTIVE\b/i.test(text);
  const substantiveResolution = text.match(/SUBSTANTIVE RESOLUTION\s*:\s*(convergence|UNRESOLVED-FOR-TREY|none)\b/i);
  if (changedFiles.length > 0 && hasSubstantive && !substantiveResolution) {
    addAbsence('substantive_resolution_absent');
  }
  if (changedFiles.length > 0 && substantiveResolution
      && substantiveResolution[1].toUpperCase() === 'UNRESOLVED-FOR-TREY') {
    addAbsence('substantive_unresolved_for_trey');
    if (reviewerId === 'fable' && !['Mercury', 'Astra', 'Fable'].every(seat => new RegExp(`\\b${seat}\\b`, 'i').test(text))) {
      addAbsence('substantive_seat_quotes_absent');
    }
  }

  return {
    namedAbsences,
    namedBreaks: namedAbsences.includes('fourth_shape_unclassified') ? ['fourth_shape_unclassified'] : [],
    candidateSet,
    candidateCoverage: candidateCoverage || null,
    changedFileCount: changedFiles.length,
    changedJsCount: changedJs.length,
    fourthShapeAdditionCount: fourthShapeCount,
    executionProvenance: {
      runChecks: runChecks.map(check => check.execution_provenance || 'model_sandbox'),
    },
  };
}

module.exports = {
  TOTALITY_LAW,
  MERCURY_DOCTRINE_PROMPT,
  assessDoctrineReview,
  extractDiffReferenceNames,
  addedFourthShapeCount,
  addedFourthShapeAdditions,
  assessReviewReport,
};
