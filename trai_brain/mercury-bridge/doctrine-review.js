'use strict';

const TOTALITY_LAW = 'TOTALITY LAW: "Thoroughly exhaust all sources when auditing. Do not roll with the first thing you come across — you want ALL of the possible answers before you decide, not just one answer. Audits aren\'t for speed. They\'re for totality. Thoroughness." Operationally: enumerate every candidate answer to the question (every file, every consumer, every changelog entry, every era of history that could speak) BEFORE ruling; a first hit is a lead, never a conclusion; stopping-at-first-hit is a named violation (the TFE miss, the CandleProcessor miss — both were this); the decision step is SEPARATE from and AFTER the collection step, and the report shows the full candidate set it decided over.';

const MERCURY_DOCTRINE_PROMPT = [
  'MERCURY DOCTRINE — REQUIRED FOR THIS REVIEW.',
  TOTALITY_LAW,
  'The word “all” converts the work from point-fix work into a totality claim.',
  'Before the verdict, emit these exact sections:',
  'CANDIDATE SET: examined N of M. Enumerate every file, consumer, history entry, and other candidate examined. M must be at least the current diff touched-file count supplied by the host.',
  'AST EVIDENCE: cite the AST-capable scans used for every changed JavaScript file and every touched env-var/config-key name. Zero cited AST evidence is an absence.',
  'INHERITED: for every touched file, name inherited || 0 trading-data defaults, swallowed catches, bypass env reads, and silent defaults; mark them unfixed.',
  'FOURTH SHAPE CLASSIFIER: classified N of M. Classify every added throw, gate, guard, or fallback as producer-fixable, true boundary, or unreachability-receipted.',
  'ALLEGATIONS: tag every finding MECHANICAL or SUBSTANTIVE and tag its basis RECEIPT or TESTIMONY. Docs, snapshots, ledgers, session forms, and CHANGELOG are TESTIMONY; code at HEAD is RECEIPT. TESTIMONY alone cannot raise found_break.',
  'SUBSTANTIVE RESOLUTION: convergence, UNRESOLVED-FOR-TREY, or none. Substantive non-convergence is never pending and is never executor-adjudicated. An UNRESOLVED-FOR-TREY resolution quotes the Mercury, Fable, and Kimi seats separately.',
  'WHAT I EXAMINED: enumerate the inspected evidence.',
  'DID NOT EXAMINE: enumerate named absences.',
  'ASSUMED: enumerate assumptions.',
  'A model-sandbox run_check has no authority for test/build pass or fail claims. Label its execution provenance; only host-attested trusted-path receipts carry test/build authority.',
  'Missing obligations cap the verdict UNVERIFIED with named absences. They never refuse or terminate the run. The sole execution hard stop remains an unattested executable.',
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

function addedFourthShapeCount(diff) {
  let currentFile = null;
  let count = 0;
  for (const line of String(diff || '').split(/\r?\n/)) {
    const header = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (header) {
      currentFile = header[2];
      continue;
    }
    if (!currentFile || !currentFile.endsWith('.js') || !/^\+(?!\+\+)/.test(line)) continue;
    const code = line.slice(1)
      .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '')
      .replace(/\/\/.*$/, '')
      .trim();
    if (!code) continue;
    if (/\bthrow\b/.test(code) || /\b[A-Za-z_$][\w$]*(?:gate|guard|fallback)[\w$]*\b/i.test(code)) {
      count += 1;
    }
  }
  return count;
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

function answerNamesEveryFile(answer, heading, changedFiles) {
  if (!sectionPresent(answer, heading)) return false;
  const text = sectionValue(answer, heading);
  return changedFiles.every(file => text.includes(file));
}

function sectionValue(answer, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(answer || '').match(new RegExp(
    `(?:^|\\n)\\s*(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*(?:\\*\\*)?[A-Z][A-Z0-9 ]{2,}(?:\\*\\*)?\\s*:|$)`,
    'i'
  ));
  return match ? match[1].trim() : '';
}

function assessDoctrineReview({
  answer,
  changedFiles = [],
  diff = '',
  telemetry = {},
  autoScan = null,
  evidenceSources = [],
  reviewerId = null,
} = {}) {
  const text = String(answer || '');
  const namedAbsences = [];
  const addAbsence = name => {
    if (!namedAbsences.includes(name)) namedAbsences.push(name);
  };
  const candidateSet = countDeclaration(text, 'CANDIDATE SET');
  if (!candidateSet || candidateSet.examined < changedFiles.length || candidateSet.total < changedFiles.length
      || candidateSet.examined < candidateSet.total) {
    addAbsence('coverage_insufficient');
  }

  const changedJs = changedFiles.filter(file => file.endsWith('.js'));
  const scannedJs = new Set((autoScan && Array.isArray(autoScan.meta) ? autoScan.meta : []).map(entry => entry.file));
  const astEvidence = sectionValue(text, 'AST EVIDENCE');
  const astSection = sectionPresent(text, 'AST EVIDENCE')
    && !/^(?:none|zero|absent)\b/i.test(astEvidence)
    && /(?:serena|find_references|find_definition|property_refs|method_callers|class_fields|[A-Za-z0-9_./-]+\.(?:js|mjs|cjs):\d+)/i.test(astEvidence);
  if (changedJs.length > 0 && (!astSection || changedJs.some(file => !scannedJs.has(file)))) {
    addAbsence('ast_evidence_absent');
  }
  if (autoScan && Array.isArray(autoScan.errors) && autoScan.errors.length > 0) {
    addAbsence('pre_answer_scan_absent');
  }

  if (changedFiles.length > 0 && !completeWholeFileReads(changedFiles, telemetry, evidenceSources)) {
    addAbsence('whole_file_read_absent');
  }
  const inherited = sectionValue(text, 'INHERITED');
  const inheritedCategoriesPresent = /\|\|\s*0/.test(inherited)
    && /swallowed catch/i.test(inherited)
    && /bypass env/i.test(inherited)
    && /silent default/i.test(inherited);
  if (!answerNamesEveryFile(text, 'INHERITED', changedFiles) || !inheritedCategoriesPresent) {
    addAbsence('inherited_section_incomplete');
  }

  const fourthShapeCount = addedFourthShapeCount(diff);
  const fourthShape = countDeclaration(text, 'FOURTH SHAPE CLASSIFIER');
  if (fourthShapeCount > 0 && (!fourthShape || fourthShape.examined < fourthShapeCount
      || fourthShape.total < fourthShapeCount || fourthShape.examined < fourthShape.total)) {
    addAbsence('fourth_shape_unclassified');
  }

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
  if (hasSubstantive && !substantiveResolution) addAbsence('substantive_resolution_absent');
  if (substantiveResolution && substantiveResolution[1].toUpperCase() === 'UNRESOLVED-FOR-TREY') {
    addAbsence('substantive_unresolved_for_trey');
    if (reviewerId === 'kimi' && !['Mercury', 'Fable', 'Kimi'].every(seat => new RegExp(`\\b${seat}\\b`, 'i').test(text))) {
      addAbsence('substantive_seat_quotes_absent');
    }
  }

  const requiredSections = [
    'CANDIDATE SET',
    'AST EVIDENCE',
    'INHERITED',
    'FOURTH SHAPE CLASSIFIER',
    'ALLEGATIONS',
    'SUBSTANTIVE RESOLUTION',
    'WHAT I EXAMINED',
    'DID NOT EXAMINE',
    'ASSUMED',
  ];
  const missingSections = requiredSections.filter(section => !sectionPresent(text, section));
  if (missingSections.length > 0) addAbsence('report_section_absent');

  return {
    authorityCeiling: namedAbsences.length > 0 ? 'UNVERIFIED' : 'UNCHANGED',
    hardStop: false,
    namedAbsences,
    namedBreaks: namedAbsences.includes('fourth_shape_unclassified') ? ['fourth_shape_unclassified'] : [],
    candidateSet,
    changedFileCount: changedFiles.length,
    changedJsCount: changedJs.length,
    fourthShapeAdditionCount: fourthShapeCount,
    missingSections,
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
};
