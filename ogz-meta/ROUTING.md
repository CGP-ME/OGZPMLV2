# OGZPrime Output Routing

This file defines where agent outputs, evidence, and archived material belong.

## Laws

1. Agents write session output ONLY to `ogz-meta/inbox/<agent>/<YYYY-MM-DD>/`. Writing anywhere else outside assigned mission files is a defect.
2. `inbox` -> `evidence` promotion requires `MANIFEST.md` with source, date, and why kept.
3. `ogz-meta/specs/` is canonical-only, human-promoted, nothing auto-writes.
4. Superseded docs move to `ogz-meta/archive/`, never deleted.
5. `logs/decisions/` older than 7 days: gzip in place. Document only while campaign is live; do not run rotation during active campaigns.

## Directory Roles

- `ogz-meta/inbox/claudito/` - Claudito pipeline/session output before promotion.
- `ogz-meta/inbox/mercury/` - raw Mercury prompts, responses, and attack traces before promotion.
- `ogz-meta/inbox/codex/` - Codex mission notes and temporary non-code work products before promotion.
- `ogz-meta/inbox/desktop-commander/` - Desktop Commander local/VPS audit outputs before promotion.
- `ogz-meta/inbox/fable/` - Fable consensus/intake outputs before promotion.
- `ogz-meta/evidence/campaigns/` - curated campaign evidence with manifests.
- `ogz-meta/evidence/backtests/` - curated backtest evidence with manifests.
- `ogz-meta/evidence/mercury-runs/` - promoted Mercury evidence with manifests.
- `ogz-meta/evidence/error-census/` - log/error census outputs and trace findings.
- `ogz-meta/archive/` - superseded docs and historical material preserved, not deleted.
