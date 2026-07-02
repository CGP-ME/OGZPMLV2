# Claude Bridge Hot-Path Proof Schema

Source of truth: `trai_brain/claude-bridge/finish-gate.js`.

This note documents what the finish gate actually checks for
`.claude/session-state/hot-path-proof.json`. It is not a bypass recipe. The gate
still decides pass/fail from current git diff, the edit ledger, and this proof
file.

## When The Gate Requires Proof

`evaluateFinishGate()` receives the current `git diff --name-only HEAD --` file
list and the Claude edit-ledger file list for the active session.

In hook mode it evaluates hot-path scope as edited files only. A file is hot-path
when it matches one of these prefixes or exact paths:

- `core/`
- `brokers/`
- `modules/`
- `foundation/`
- `config/`
- `public/js/`
- `public/unified-dashboard`
- `run-empire-v2.js`
- `kraken_adapter_simple.js`
- `ogzprime-ssl-server.js`
- `start-ogzprime.sh`

If the edited hot-path list is empty, the gate exits with `no_hot_path_changes`.
If any edited hot-path file exists, the proof file must exist and satisfy every
check below.

## Required Top-Level Fields

```json
{
  "changeset": "human-readable description",
  "changedFiles": ["core/Example.js"],
  "mercury": {},
  "p0": {},
  "fallbackDefaultScan": {}
}
```

Only `changedFiles`, `mercury`, `p0`, and sometimes `fallbackDefaultScan` are
enforced. `changeset` is useful context but not enforced by the gate.

## `changedFiles`

Must be an array containing every edited hot-path file currently present in the
diff. Missing even one hot-path file triggers:

`proof_changed_files_do_not_cover_current_hot_path_diff`

This is exact path matching against the repo-relative file names from git diff.

## `mercury`

Required shape:

```json
{
  "completed": true,
  "prompt": "Mercury, break my fix...",
  "promptPath": "optional/repo-relative/prompt.md"
}
```

The gate accepts either inline `mercury.prompt` or text read from
`mercury.promptPath`. The prompt fails if it contains soft confirmation language
such as "is this correct", "verify this", "confirm this", "does this look", or
"beam me up".

The prompt must hit at least three adversarial patterns, including terms such as
"break my fix", "find a state", "construct", "crash", "lie", "bypass",
"corrupt", "silent", "new failure mode", or "underlying mechanism".

If this proof is missing or soft-framed, the gate triggers:

`missing_adversarial_mercury_break_my_fix_proof`

Fields like `command`, `chain`, and `findings` are recommended for operator
review but are not directly enforced by the current gate.

## `p0`

Required shape:

```json
{
  "completed": true,
  "exitCode": 0,
  "command": "node ogz-meta/gates/multi-runtime-gate-runner.js --p0",
  "logPath": "repo-relative/path/to/existing.log"
}
```

The command string must include the exact P0 gate command. `logPath` must point
to an existing file under the repo root. If any part is missing, the gate
triggers:

`missing_p0_gate_proof`

`summary` is useful for humans but is not enforced by the current gate.

## `fallbackDefaultScan`

This section is required only when the hot-path diff adds lines matching the
gate's suspicious fallback/default patterns:

- `default`
- `fallback`
- `||`
- `??`
- empty catch blocks
- catch blocks that log, return, continue, or do nothing

Required shape when suspicious lines exist:

```json
{
  "completed": true,
  "noUnapprovedFallbacksOrDefaults": true,
  "reviewedAddedLines": ["one reviewed entry per suspicious added line"]
}
```

`reviewedAddedLines.length` must be at least the number of suspicious added
lines detected in the hot-path diff. If it is missing or too short, the gate
triggers:

`unapproved_fallback_or_default_added_lines`

`reviewNote` is useful for humans but not enforced by the current gate.

## Failure Reasons

- `missing_explicit_edit_scope`: the gate was called without an edit-ledger file
  list.
- `task_contract_diff_outside_write_scope`: edited changed files violate the
  active task contract.
- `missing_hot_path_proof`: a hot-path diff exists but the proof file is absent.
- `proof_changed_files_do_not_cover_current_hot_path_diff`: `changedFiles` does
  not cover all edited hot-path files in the current diff.
- `missing_adversarial_mercury_break_my_fix_proof`: Mercury proof is missing,
  incomplete, or soft-framed.
- `missing_p0_gate_proof`: P0 proof is missing, failed, has the wrong command,
  or points to a missing log file.
- `unapproved_fallback_or_default_added_lines`: suspicious fallback/default
  additions were not explicitly reviewed in `fallbackDefaultScan`.

## Minimal Passing Example

```json
{
  "changeset": "Example hot-path fix",
  "changedFiles": ["run-empire-v2.js"],
  "mercury": {
    "completed": true,
    "prompt": "Mercury, break my fix. Find a state where this change can silently bypass the underlying mechanism, construct the failure, and name new failure modes."
  },
  "p0": {
    "completed": true,
    "exitCode": 0,
    "command": "node ogz-meta/gates/multi-runtime-gate-runner.js --p0",
    "logPath": "ogz-meta/ledger/example-p0.log"
  },
  "fallbackDefaultScan": {
    "completed": true,
    "noUnapprovedFallbacksOrDefaults": true,
    "reviewedAddedLines": []
  }
}
```

The example only passes if `changedFiles` matches the current edited hot-path
diff and the `p0.logPath` exists.
