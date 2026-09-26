'use strict';

const TOTALITY_LAW = 'TOTALITY LAW: "Thoroughly exhaust all sources when auditing. Do not roll with the first thing you come across — you want ALL of the possible answers before you decide, not just one answer. Audits aren\'t for speed. They\'re for totality. Thoroughness." Operationally: enumerate every candidate answer to the question (every file, every consumer, every changelog entry, every era of history that could speak) BEFORE ruling; a first hit is a lead, never a conclusion; stopping-at-first-hit is a named violation (the TFE miss, the CandleProcessor miss — both were this); the decision step is SEPARATE from and AFTER the collection step, and the report shows the full candidate set it decided over.';

const MERCURY_DOCTRINE_PROMPT = [
  'MERCURY REVIEW RECEIPT.',
  TOTALITY_LAW,
  'The word “all” converts the work from point-fix work into a totality claim.',
  'A model-sandbox run_check has no authority for test/build pass or fail claims. Label its execution provenance; only host-attested trusted-path receipts carry test/build authority.',
  'Report missing evidence, coverage limits, reviewer disagreements and reporting omissions honestly in the exit receipt. These diagnostics do not impose a verdict ceiling or require a rerun. They never authorize a fabricated PASS. Executable trust and repository-access protections remain unchanged.',
  'Final adversarial answers must deliver the fields the existing receipt parser and doctrine assessor read. Use literal headings followed by colons, not a prose-only conclusion.',
  'VERDICT: found_break | no_break_found | cannot_verify. State your actual supported conclusion; an HTTP success or missing evidence never means no_break_found. Fable and Kimi retain their role-specific verdict vocabularies. Planning and architecture reviews retain their non-adversarial output contract.',
  'ADVERSARIAL_REVIEW_BLOCKING: yes | no. Include your actual evidence-to-verdict rationale and literal repo path:line citations.',
  'CANDIDATE SET: examined N of M; enumerate the complete candidate inventory, including every changed path. These are evidence counts, not confidence estimates. Unread or unresolved evidence must remain named.',
  'AST EVIDENCE: distinguish host-provided scan receipts from tools you actually used. Whole-file coverage requires complete delivered source, not an AST summary or an assertion that a file was read.',
  'INHERITED: use each exact full repo-relative changed path (not only its basename) and the presence, absence or unread status of || 0, swallowed catch, bypass env and silent default behavior. Do not invent absence or zero findings.',
  'FOURTH SHAPE CLASSIFIER: classified N of M; classify every added throw, guard, gate or fallback with producer evidence. Review-tool restrictions are not bot-runtime authority. Do not introduce new bot gates.',
  'ALLEGATIONS: classify each finding as MECHANICAL or SUBSTANTIVE and its basis as RECEIPT or TESTIMONY.',
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

function extractDiffReferenceNames(diff) {
  const names = [];
  const patterns = [
    /\bprocess\.env\.([A-Z][A-Z0-9_]*)\b/g,
    /\b(?:process\.)?env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g,
    /\bconfig\.([A-Za-z_$][\w$]*)\b/g,
    /\b(?:getConfigValue|requiredString|optionalString|requiredBoolean|optionalBoolean|requiredNumber|optionalNumber|requiredText|optionalText)\([^,]+,\s*['"]([A-Za-z_$][\w$.-]*)['"]/g,
  ];
  for (const line of changedDiffLines(diff)) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line)) !== null) names.push(match[1]);
    }
  }
  return uniqueInOrder(names);
}

function sectionPresent(answer, heading) {
  return new RegExp(`(?:^|\\n)\\s*(?:\\*\\*)?${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\*\\*)?\\s*:`, 'i').test(String(answer || ''));
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
  const categoryPatterns = [
    ['|| 0', /\|\|\s*0/],
    ['swallowed catch', /swallowed[\s\u2010-\u2015-]+catch/i],
    ['bypass env', /bypass[\s\u2010-\u2015-]+env/i],
    ['silent default', /silent(?:[\s\u2010-\u2015-]+(?:false|zero|null))?[\s\u2010-\u2015-]+default/i],
  ];
  const inheritedMissingCategories = categoryPatterns
    .filter(([, pattern]) => !pattern.test(inherited)).map(([name]) => name);
  if (changedFiles.length > 0
      && (inheritedMissingPaths.length > 0 || inheritedMissingCategories.length > 0)) {
    namedAbsences.push('inherited_section_incomplete');
  }
  const fourthShape = countDeclaration(answer, 'FOURTH SHAPE CLASSIFIER');
  if (fourthShapeCount > 0 && (!fourthShape || fourthShape.examined < fourthShapeCount
      || fourthShape.total < fourthShapeCount || fourthShape.examined < fourthShape.total)) {
    namedAbsences.push('fourth_shape_unclassified');
  }
  return { namedAbsences, inheritedMissingPaths, inheritedMissingCategories,
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

  if (changedFiles.length > 0 && !completeWholeFileReads(changedFiles, telemetry, evidenceSources)) {
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

  const allegationSection = sectionValue(text, 'ALLEGATIONS');
  if (sectionPresent(text, 'ALLEGATIONS') && !/\b(?:MECHANICAL|SUBSTANTIVE)\b/i.test(allegationSection)) {
    addAbsence('allegation_class_absent');
  }
  if (sectionPresent(text, 'ALLEGATIONS') && !/\b(?:RECEIPT|TESTIMONY)\b/i.test(allegationSection)) {
    addAbsence('allegation_basis_absent');
  }

  const hasSubstantive = /\bSUBSTANTIVE\b/i.test(text);
  const substantiveResolution = text.match(/SUBSTANTIVE RESOLUTION\s*:\s*(convergence|UNRESOLVED-FOR-TREY|none)\b/i);
  if (changedFiles.length > 0 && hasSubstantive && !substantiveResolution) {
    addAbsence('substantive_resolution_absent');
  }
  if (changedFiles.length > 0 && substantiveResolution
      && substantiveResolution[1].toUpperCase() === 'UNRESOLVED-FOR-TREY') {
    addAbsence('substantive_unresolved_for_trey');
    if (reviewerId === 'kimi' && !['Mercury', 'Fable', 'Kimi'].every(seat => new RegExp(`\\b${seat}\\b`, 'i').test(text))) {
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
