'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  MERCURY_DOCTRINE_PROMPT,
  assessDoctrineReview,
  extractDiffReferenceNames,
} = require('../trai_brain/mercury-bridge/doctrine-review');
const {
  buildCurrentChangeBlastRadius,
  buildMercuryIntentPrompt,
} = require('../trai_brain/mercury-bridge/ask');
const { parseAdversarialReviewAnswer } = require('../trai_brain/mercury-bridge/adversarial-review');
const { buildRunLedgerEntry } = require('../trai_brain/mercury-bridge/run-ledger');
const { createToolAdapter } = require('../trai_brain/mercury-bridge/tool-adapter');
const {
  hasUnsupportedTestOutcomeClaim,
  summarizeToolTelemetry,
} = require('../trai_brain/mercury-bridge/react-loop');

describe('Mercury doctrine extension', () => {
  test('carries Totality verbatim and every required report section in the review prompt', () => {
    const prompt = buildMercuryIntentPrompt('Mercury, break my fix.');

    expect(prompt).toContain('The word “all” converts the work from point-fix work into a totality claim.');
    expect(prompt).toContain(MERCURY_DOCTRINE_PROMPT);
    for (const section of [
      'CANDIDATE SET',
      'AST EVIDENCE',
      'INHERITED',
      'FOURTH SHAPE CLASSIFIER',
      'ALLEGATIONS',
      'SUBSTANTIVE RESOLUTION',
      'WHAT I EXAMINED',
      'DID NOT EXAMINE',
      'ASSUMED',
    ]) {
      expect(prompt).toContain(section);
    }
  });

  test('extracts changed env-var and config-key names without hardcoded key lists', () => {
    const diff = [
      'diff --git a/core/a.js b/core/a.js',
      '+const cap = process.env.MAX_DRAWDOWN;',
      '-const topic = env["NTFY_TOPIC"];',
      '+if (config.riskLimit.enabled) return;',
      '+const limit = getConfigValue(settings, "venue.maxLoss");',
    ].join('\n');

    expect(extractDiffReferenceNames(diff)).toEqual([
      'MAX_DRAWDOWN',
      'NTFY_TOPIC',
      'riskLimit',
      'venue.maxLoss',
    ]);
  });

  test('pre-answer scan covers every changed JavaScript file and touched name', async () => {
    const blast = jest.fn(async file => ({ callerCount: 1, riskLevel: 'medium', latencyMs: 3, file }));
    const findReferences = jest.fn(async symbol => ({ symbol, count: 2, matches: [] }));
    const result = await buildCurrentChangeBlastRadius({
      repoRoot: process.cwd(),
      changedFiles: ['core/a.js', 'test/a.test.js', 'docs/a.md'],
      currentDiffFn: () => [
        '+const cap = process.env.MAX_DRAWDOWN;',
        '+const mode = config.reviewMode;',
      ].join('\n'),
      existsFn: () => true,
      getBlastRadiusFn: blast,
      formatForMercuryFn: value => JSON.stringify(value),
      findReferencesFn: findReferences,
    });

    expect(blast.mock.calls.map(call => call[0])).toEqual(['core/a.js', 'test/a.test.js']);
    expect(findReferences.mock.calls.map(call => call[0])).toEqual(['MAX_DRAWDOWN', 'reviewMode']);
    expect(result.changedFiles).toEqual(['core/a.js', 'test/a.test.js', 'docs/a.md']);
    expect(result.changedFileCount).toBe(3);
    expect(result.referenceScans).toHaveLength(2);
    expect(result.text).toContain('Changed files: 3');
  });

  test('caps incomplete doctrine evidence with named absences instead of refusing the run', () => {
    const answer = [
      'CANDIDATE SET: examined 1 of 2',
      'INHERITED: core/a.js only',
      'ALLEGATIONS: TESTIMONY SUBSTANTIVE finding from docs',
      'The sandbox tests passed.',
      'VERDICT: found_break',
    ].join('\n');
    const assessment = assessDoctrineReview({
      answer,
      changedFiles: ['core/a.js', 'docs/a.md'],
      diff: 'diff --git a/core/a.js b/core/a.js\n+throw new Error("bad");',
      telemetry: {
        filesOpened: ['core/a.js:1-2'],
        runChecks: [{ status: 'passed', execution_provenance: 'model_sandbox' }],
      },
    });

    expect(assessment.authorityCeiling).toBe('UNVERIFIED');
    expect(assessment.namedAbsences).toEqual(expect.arrayContaining([
      'coverage_insufficient',
      'ast_evidence_absent',
      'whole_file_read_absent',
      'inherited_section_incomplete',
      'fourth_shape_unclassified',
      'sandbox_testimony_only',
      'testimony_only_finding',
      'substantive_resolution_absent',
      'report_section_absent',
    ]));
    expect(assessment.hardStop).toBe(false);
  });

  test('accepts complete machine-readable doctrine evidence without manufacturing authority', () => {
    const answer = [
      'CANDIDATE SET: examined 2 of 2',
      '- core/a.js',
      '- docs/a.md',
      'AST EVIDENCE: serena_blast_radius core/a.js:1-3',
      'INHERITED: core/a.js and docs/a.md — || 0: none; swallowed catches: none; bypass env reads: none; silent defaults: none',
      'FOURTH SHAPE CLASSIFIER: classified 1 of 1; true boundary core/a.js:2',
      'ALLEGATIONS: MECHANICAL RECEIPT none',
      'SUBSTANTIVE RESOLUTION: none',
      'WHAT I EXAMINED: core/a.js; docs/a.md',
      'DID NOT EXAMINE: none',
      'ASSUMED: none',
      'VERDICT: no_break_found',
    ].join('\n');
    const assessment = assessDoctrineReview({
      answer,
      changedFiles: ['core/a.js', 'docs/a.md'],
      diff: '+if (externalError) throw externalError;',
      telemetry: {
        filesOpened: ['core/a.js:1-3', 'docs/a.md:1-2'],
        fileReads: [
          { file: 'core/a.js', startLine: 1, endLine: 3, totalLines: 3 },
          { file: 'docs/a.md', startLine: 1, endLine: 2, totalLines: 2 },
        ],
        runChecks: [],
      },
      autoScan: { meta: [{ file: 'core/a.js' }], errors: [] },
    });

    expect(assessment.authorityCeiling).toBe('UNCHANGED');
    expect(assessment.namedAbsences).toEqual([]);
    expect(assessment.hardStop).toBe(false);
  });

  test('Fourth Shape counts executable additions, not doctrine prose containing reserved words', () => {
    const assessment = assessDoctrineReview({
      answer: [
        'CANDIDATE SET: examined 1 of 1',
        'AST EVIDENCE: Serena trai_brain/example.js:1-3',
        'INHERITED: trai_brain/example.js — || 0: none; swallowed catches: none; bypass env reads: none; silent defaults: none',
        'FOURTH SHAPE CLASSIFIER: classified 1 of 1; true boundary trai_brain/example.js:3',
        'ALLEGATIONS: MECHANICAL RECEIPT none',
        'SUBSTANTIVE RESOLUTION: none',
        'WHAT I EXAMINED: trai_brain/example.js',
        'DID NOT EXAMINE: none',
        'ASSUMED: none',
      ].join('\n'),
      changedFiles: ['trai_brain/example.js'],
      diff: [
        'diff --git a/trai_brain/example.js b/trai_brain/example.js',
        '+++ b/trai_brain/example.js',
        "+  'Classify every throw, gate, guard, or fallback.',",
        '+  if (externalFailure) throw externalFailure;',
      ].join('\n'),
      telemetry: {
        fileReads: [{ file: 'trai_brain/example.js', startLine: 1, endLine: 3, totalLines: 3 }],
        runChecks: [],
      },
      autoScan: { meta: [{ file: 'trai_brain/example.js' }], errors: [] },
    });

    expect(assessment.fourthShapeAdditionCount).toBe(1);
    expect(assessment.namedAbsences).not.toContain('fourth_shape_unclassified');
  });

  test('model-sandbox run_check never authorizes test or build claims', () => {
    const history = [{
      toolName: 'run_check',
      toolArgs: { profile: 'focused-jest' },
      toolResult: { source: 'run_check', exit_code: 0, artifact_citation: 'artifact:1-2' },
    }];

    expect(hasUnsupportedTestOutcomeClaim('All tests passed. core/a.js:1-2', history)).toBe(true);
    expect(summarizeToolTelemetry(history).runChecks[0].execution_provenance).toBe('model_sandbox');
  });

  test('review schema preserves doctrine sections for receipts and adjudication', () => {
    const parsed = parseAdversarialReviewAnswer([
      'CANDIDATE SET: examined 2 of 2',
      'AST EVIDENCE: Serena evidence',
      'INHERITED: none',
      'FOURTH SHAPE CLASSIFIER: classified 0 of 0',
      'ALLEGATIONS: SUBSTANTIVE RECEIPT question',
      'SUBSTANTIVE RESOLUTION: UNRESOLVED-FOR-TREY',
      'WHAT I EXAMINED: two files',
      'DID NOT EXAMINE: none',
      'ASSUMED: none',
      'CONSENSUS_BLOCKING: yes',
      'VERDICT: needs_more_evidence',
    ].join('\n'));

    expect(parsed).toMatchObject({
      candidateSet: 'examined 2 of 2',
      astEvidence: 'Serena evidence',
      fourthShapeClassifier: 'classified 0 of 0',
      allegationClass: 'SUBSTANTIVE RECEIPT question',
      substantiveResolution: 'UNRESOLVED-FOR-TREY',
      whatIExamined: 'two files',
      didNotExamine: 'none',
      assumed: 'none',
    });
  });

  test('run receipt carries doctrine assessment, scan coverage, and execution provenance', () => {
    const doctrineReview = {
      authorityCeiling: 'UNVERIFIED',
      namedAbsences: ['coverage_insufficient'],
      candidateSet: { examined: 1, total: 2 },
    };
    const entry = buildRunLedgerEntry({
      repoRoot: process.cwd(),
      query: 'audit',
      startedAt: new Date('2026-09-01T00:00:00.000Z'),
      finishedAt: new Date('2026-09-01T00:00:01.000Z'),
      autoBlastRadius: {
        source: 'current_changes',
        changedFiles: ['core/a.js', 'docs/a.md'],
        changedFileCount: 2,
        meta: [{ file: 'core/a.js', callerCount: 1, riskLevel: 'medium' }],
        referenceNames: ['MAX_DRAWDOWN'],
        referenceScans: [{ symbol: 'MAX_DRAWDOWN', total: 4 }],
        errors: [],
      },
      result: {
        termination: 'answer_given',
        answer: 'CANDIDATE SET: examined 1 of 2',
        doctrineReview,
        reviewQuarantines: [{ load_bearing: true, absence: 'coverage_insufficient' }],
        toolTelemetry: {
          byTool: {},
          filesOpened: ['core/a.js:1-2'],
          fileReads: [{ file: 'core/a.js', startLine: 1, endLine: 2, totalLines: 2 }],
          runCheckArtifacts: ['artifact:1-2'],
          runChecks: [{ status: 'passed', execution_provenance: 'model_sandbox' }],
        },
      },
    });

    expect(entry.doctrine_review).toEqual(doctrineReview);
    expect(entry.source_refs).toMatchObject({
      changed_files: ['core/a.js', 'docs/a.md'],
      changed_file_count: 2,
      reference_names: ['MAX_DRAWDOWN'],
      reference_scans: [{ symbol: 'MAX_DRAWDOWN', total: 4 }],
    });
    expect(entry.file_reads).toEqual([{ file: 'core/a.js', startLine: 1, endLine: 2, totalLines: 2 }]);
    expect(entry.run_checks[0].execution_provenance).toBe('model_sandbox');
  });

  test('rules-as-greps carries every banned reporting class', () => {
    const rule = JSON.parse(fs.readFileSync(path.join(
      process.cwd(),
      'ogz-meta/cognition/mercury-rules/no-banned-report-language.json'
    ), 'utf8'));
    const pattern = new RegExp(rule.pattern, 'im');

    expect(pattern.test('This is the first time the gate worked.')).toBe(true);
    expect(pattern.test('The audit is approximately 95% complete.')).toBe(true);
    expect(pattern.test('We announced a workaround for the missing receipt.')).toBe(true);
    expect(pattern.test('20/20 tests passed, which proves the contract.')).toBe(true);
    expect(pattern.test('19 of 20 files examined (95%).')).toBe(false);
  });

  test('banned report language rule executes through the live rule_scan adapter', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mercury-doctrine-rule-'));
    try {
      const ruleDir = path.join(root, 'ogz-meta/cognition/mercury-rules');
      fs.mkdirSync(ruleDir, { recursive: true });
      fs.copyFileSync(
        path.join(process.cwd(), 'ogz-meta/cognition/mercury-rules/no-banned-report-language.json'),
        path.join(ruleDir, 'no-banned-report-language.json')
      );
      fs.writeFileSync(path.join(root, 'report.md'), 'The audit is approximately 95% complete.\n');

      const result = await createToolAdapter({ repoRoot: root }).execute('rule_scan', {
        rule: 'no-banned-report-language',
      });

      expect(result.error).toBeUndefined();
      expect(result.results[0].error).toBeUndefined();
      expect(result.results[0].matches).toEqual(expect.arrayContaining([
        expect.objectContaining({ file: 'report.md' }),
      ]));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
