# Principal Architecture Rerun Summary

Date: 2026-07-23
Author: Codex-1
Repo: `/opt/ogzprime/OGZPMLV2`
Branch: `codex/multi-asset-symbol-state`
HEAD at run start: `cf9ec3d985790236f325b8464f64bfc219625e30`

## Operator Ask

Rerun the principal systems architecture review prompt through:

1. Mercury
2. Mercury plus Fable review
3. Mercury plus Fable plus Kimi final synthesis

Run shape correction from Trey:

- Do not stop at the first plausible answer.
- Use all available tools and resources.
- Local means the current VPS checkout on the correct branch.
- The repo is public on GitHub, but the VPS checkout is authoritative.
- Deliver full reports to the inbox, not short summaries.

## Artifacts

| Artifact | Path | Notes |
|---|---|---|
| Original prompt | `ogz-meta/inbox/fable/2026-07-23/principal-systems-architecture-review-prompt.md` | Copied from the Codex attachment |
| Run directive | `ogz-meta/inbox/fable/2026-07-23/principal-systems-architecture-review-run-directive.md` | Added Trey's correction: tool-led, local authoritative, no first-plausible stopping |
| Combined Mercury prompt | `ogz-meta/inbox/fable/2026-07-23/principal-systems-architecture-review-combined-prompt.md` | Directive plus original prompt |
| Mercury raw receipt | `ogz-meta/inbox/fable/2026-07-23/codex1-result-principal-architecture-mercury-architecture.raw.txt` | Bridge raw output |
| Mercury report | `ogz-meta/inbox/fable/2026-07-23/codex1-result-principal-architecture-mercury-architecture.md` | Extracted readable answer |
| Fable first prompt | `ogz-meta/inbox/fable/2026-07-23/principal-systems-architecture-review-fable-prompt.md` | Mercury report attached for critique |
| Fable invalid-tool receipt | `ogz-meta/inbox/fable/2026-07-23/codex1-result-principal-architecture-mercury-fable.blocked-invalid-tool.raw.txt` | First Claude CLI command rejected invalid disallowed tool name |
| Fable stalled receipt | `ogz-meta/inbox/fable/2026-07-23/codex1-result-principal-architecture-mercury-fable.stalled-empty.raw.json` | Second Claude CLI command stalled empty and was killed |
| Fable fallback prompt | `ogz-meta/inbox/fable/2026-07-23/principal-systems-architecture-review-fable-fallback-prompt.md` | Max-effort fallback prompt with explicit evidence-gap handling |
| Fable raw stream | `ogz-meta/inbox/fable/2026-07-23/codex1-result-principal-architecture-mercury-fable.raw.stream.jsonl` | Full stream-json receipt, about 2.5 MB |
| Fable report | `ogz-meta/inbox/fable/2026-07-23/codex1-result-principal-architecture-mercury-fable.md` | 35 KB report, tool-heavy architecture review |
| Kimi final prompt | `ogz-meta/inbox/fable/2026-07-23/principal-systems-architecture-review-kimi-final-prompt.md` | Directive plus Mercury and Fable reports |
| Kimi rejected receipt | `ogz-meta/inbox/fable/2026-07-23/codex1-result-principal-architecture-mercury-fable-kimi-final.rejected-temperature.raw.json` | First Moonshot call rejected `temperature: 1`; Kimi requires `0.6` |
| Kimi raw receipt | `ogz-meta/inbox/fable/2026-07-23/codex1-result-principal-architecture-mercury-fable-kimi-final.raw.json` | Direct Moonshot API response |
| Kimi final report | `ogz-meta/inbox/fable/2026-07-23/codex1-result-principal-architecture-mercury-fable-kimi-final.md` | 703-line final synthesis |

## Run Results

### Mercury

Command shape:

`node trai_brain/mercury-bridge/ask.js --agentic --architecture --max-iterations=60 --max-tokens=7750 <combined prompt>`

Result:

- Termination: `answer_given`
- Iterations: 16
- Tool calls: 15 total, 15 succeeded, 0 failed
- Run ledger: `ogz-meta/cognition-history/mercury-runs/2026-07-23.jsonl:2`
- Reliability note: technically successful, but thin for the prompt scope and carried citation/claim-quality warnings.

### Mercury Plus Fable

Fable path used direct Claude Code because the bridge consensus provider is currently Kimi/Moonshot, not Claude/Fable.

First two attempts:

- Attempt 1 failed immediately because the CLI rejected `MultiEdit` in the disallowed-tools list.
- Attempt 2 stalled with empty output and was killed.

Successful attempt:

`claude -p --model fable --effort max --permission-mode dontAsk --output-format stream-json --include-partial-messages --no-session-persistence <fallback prompt>`

Result:

- Completed.
- Fable used repo tools, bridge reads, Mongo read-only inspection, hook enforcement probes, and subagent sweeps.
- Claude CLI reported cost: `$17.086154`.
- Output report is preserved at `codex1-result-principal-architecture-mercury-fable.md`.

Core Fable conclusion:

- Mercury's report was structurally useful but materially wrong on several architecture claims because Mercury's own ignore policy blinded it to `.claude/` and `ogz-meta/cognition/`.
- Fable corrected Mercury on run-ledger path validation, trace config ownership, write-tool exposure, hook enforcement, Mongo workload reality, and Mercury bridge enforcement surfaces.
- Fable raised a major architecture gap: `killswitch.flag` exists and is active on disk, but the reported KillSwitch read-side is not wired into production runtime consumers. This is a report finding only; no runtime action was taken.

### Mercury Plus Fable Plus Kimi

Kimi path used direct Moonshot API, not repo tools.

First Moonshot call:

- Rejected because `kimi-k3` only accepts `temperature: 0.6`.
- Receipt preserved.

Second Moonshot call:

- Model: `kimi-k3`
- Prompt tokens: 15,354
- Completion tokens: 10,450
- Total tokens: 25,804
- Finish reason: `stop`
- Output report: 703 lines, 44,939 bytes

Kimi role:

- Final synthesis over supplied Mercury and Fable artifacts.
- No independent local tool access.
- Evidence-weighted arbitration: Fable's direct-tool findings outrank Mercury where they conflict; Mercury retains value where Fable confirmed or narrowed the finding.

## High-Signal Findings From The Combined Reports

These are report findings, not code changes:

1. Mercury architecture mode still needs better decomposition for a prompt this broad. It succeeded mechanically but produced a thin answer.
2. Fable's max-effort pass produced the most evidence-rich local architecture review in this rerun.
3. Kimi produced the final 703-line synthesis from Mercury and Fable artifacts without tool access.
4. The Mercury bridge's ignore boundaries are doing real policy work, but they also make Mercury blind to some governance layers unless the task explicitly supplies those artifacts.
5. The biggest architecture lane called out by the reports is not buying new infra; it is fixing and documenting actual invariants already in the repo: KillSwitch read-side, retrieval scaling, receipt integrity, and governance/self-review lanes.
6. This rerun touched no trading runtime code and did not restart PM2.

## Dirty Tree Boundary

Unrelated pre-existing work remains untouched:

- `public/index.html`
- `killswitch.flag`
- large untracked `ogz-meta/cognition-history/`, `ogz-meta/ledger/`, and inbox piles

This report lane stages only the 2026-07-23 principal-architecture inbox artifacts listed above.
