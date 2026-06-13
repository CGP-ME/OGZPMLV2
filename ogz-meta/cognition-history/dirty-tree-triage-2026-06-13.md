# Dirty Tree Triage - 2026-06-13

## Scope

Cleaned significant untracked workspace artifacts after the TRAI and dashboard cleanup slices. Tracked runtime/source files were already clean before this triage.

## Committed Source Inputs

- `ogz-meta/specs/OPERATOR-DESIGN-GAPS.md` was committed because `ogz-meta/specs/MULTI-RUNTIME-IMPLEMENTATION-SPEC-2026-05-25.md` lists it as a source input.
- `ogz-meta/specs/PLATFORM-VISION-VERIFIED-FINDINGS-2026-05-19.md` was committed because `ogz-meta/codex-design/02-ARCHITECTURE-DESIGN-ADDENDUM-SESSIONROUTER-FINAL-SIGNOFF-2026-05-20.md` lists it as a source document.
- `ogz-meta/specs/pre-eval-master-fix-plan-2026-05-20_1.md` was committed because tracked session/Mercury records cite it as the source for finished pre-eval fixes.
- `ogz-meta/QuarantinedExpansionFiles/sourcegraph-deep-search-2026-05-20.md` was committed at the archive path named by the pre-eval plan.
- `ogz-meta/specs/GRAND-SCHEME-AUDIT-2026-05-14.md` was committed because `ogz-meta/specs/thisiswhatimtalkingabout.md` references it as the audit source.

These documents are historical/source material unless a newer current doc explicitly promotes a claim from them.

## Quarantined Outside Repo

Moved these untracked files to `/opt/ogzprime/quarantine/dirty-tree-triage-2026-06-13T0520Z/`:

- `ogz-meta/Alignment/OGZ-DIGEST-2026-05-19.md` because `ogz-meta/Alignment/README.md` explicitly says to use the tracked verified digest instead.
- `ogz-meta/UPDATED-E2E-OGZPRIME-AND-MUTATIONS-DEADCODE.md` because it is a stale branch map for `alpaca/stocks-paper-flip` and was not referenced by tracked current docs.
- `ogz-meta/apex-website-stuff.md` because it is product/website intake, not current eval/runtime source.
- `ogz-meta/sessions/CODEX-WORKLOG-2026-05-20-PRE-EVAL.md` because it is an unreferenced old worklog and the relevant pre-eval source plan/session docs are tracked.
- `ogz-meta/specs/OGZPrime_Business_Architecture_Plan.md` because it is product/commercial planning intake, not current runtime source.
- `ogz-meta/specs/OGZPrime_Raw_Chat_Transcript.md` because it is a raw transcript intake file, not curated source doctrine.
- `scripts/download-tsla-unseen.js` because it is a stale one-off clone of the tracked TSLA downloader flow and its output `tuning/tsla-15m-unseen.json` is already tracked.
- `tuning/tsla-15m-750.json` because it was an empty generated tuning artifact.

## Verification

- Significant untracked candidates were classified with `git ls-files --others --exclude-standard`.
- Referenced-source decisions were checked with `git grep` against tracked docs.
- Each committed document slice passed `npm run scan:secrets` before commit.
