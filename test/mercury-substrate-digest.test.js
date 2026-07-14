'use strict';

const {
  buildDigest,
  formatDigestMarkdown,
} = require('../trai_brain/mercury-bridge/substrate-digest');

describe('Mercury substrate digest', () => {
  test('summarizes run ledgers without live Mercury calls', () => {
    const digest = buildDigest([
      {
        run_id: 'run-1',
        verdict: 'found_break',
        tools_invoked: [
          { name: 'git_diff', calls: 1, succeeded: 1, failed: 0 },
          { name: 'open_file', calls: 2, succeeded: 2, failed: 0 },
        ],
        answer_quality: ['uncited_run_check_claim'],
        files_opened: ['core/Foo.js:1-5'],
        answer_excerpt: 'Break at core/Foo.js:1-5.',
      },
      {
        run_id: 'run-2',
        verdict: 'cannot_verify',
        tools_invoked: [
          { name: 'run_check', calls: 1, succeeded: 0, failed: 1 },
        ],
        answer_quality: ['missing_file_line_citation'],
        files_opened: [],
        answer_excerpt: 'Claim at core/Bar.js:2.',
        next_rule_candidate: 'no-silent-fallback',
      },
      {
        run_id: 'run-3',
        verdict: 'no_break_found',
        tools_invoked: [],
        answer_quality: [],
        files_opened: [],
        answer_excerpt: 'No break found.',
        next_rule_candidate: 'no-silent-fallback',
      },
    ], [{ name: 'p0-anchor-finder' }]);

    expect(digest.total_runs).toBe(3);
    expect(digest.by_verdict).toEqual({
      found_break: 1,
      cannot_verify: 1,
      no_break_found: 1,
    });
    expect(digest.tool_invocations).toEqual({
      git_diff: 1,
      open_file: 2,
      run_check: 1,
    });
    expect(digest.tool_failures).toEqual({ run_check: 1 });
    expect(digest.answer_quality_flags).toEqual({
      uncited_run_check_claim: 1,
      missing_file_line_citation: 1,
    });
    expect(digest.runs_by_verdict).toEqual({
      found_break: ['run-1'],
      cannot_verify: ['run-2'],
      no_break_found: ['run-3'],
    });
    expect(digest.code_claim_without_open_file).toEqual(['run-2']);
    expect(digest.repeated_rule_candidates).toEqual({ 'no-silent-fallback': 2 });
    expect(digest.canaries.names).toEqual(['p0-anchor-finder']);
  });

  test('formats a compact markdown digest', () => {
    const digest = buildDigest([], [{ name: 'symbol-reference-recall' }]);
    const markdown = formatDigestMarkdown(digest);

    expect(markdown).toContain('# Mercury Substrate Digest');
    expect(markdown).toContain('Total runs: 0');
    expect(markdown).toContain('- symbol-reference-recall');
  });
});
