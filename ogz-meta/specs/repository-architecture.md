# Repository Architecture: Meta vs Ledger

## Rule
- `ogz-meta/specs/` = canonical truth. Indexed by Mercury. Auto-retrieved as authoritative.
- `ogz-ledger/` = everything else. NOT indexed. Referenceable by explicit pointer only.
- `ogz-meta/` top-level files = pipeline code + alignment docs. Indexed but treated as infrastructure, not design specs.

## Decision test
Before committing any new file, one question:
"Is this verified canonical truth about what the system IS or MUST DO?"
- YES → `ogz-meta/specs/`
- NO → `ogz-ledger/`

## What goes in ogz-meta/specs
- Canonical specs (architecture, schemas, design contracts)
- Forensic artifacts (trace tables, sequence diagrams, flowcharts) verified against source
- Repository rules (this doc)
- Mermaid charts verified against current HEAD

## What goes in ogz-ledger
- Proposals (before verification and adoption)
- Session handoffs, TODO lists, working docs
- Audit reports, cold traces
- Screenshots, debug output
- Historical artifacts, superseded specs
- Pipeline mission manifests
- Health reports, runtime logs

## Mercury indexing
**Included:**
- `core/**/*.js`
- `brokers/**/*.js`
- `modules/**/*.js`
- `run-empire-v2.js`
- `ogz-meta/specs/**`

**Excluded:**
- `ogz-ledger/**`
- `ogz-meta/proposals/**`
- `ogz-meta/manifests/**`
- `ogz-meta/ledger/**`
- `ogz-meta/health-reports/**`
- `ogz-meta/logs/**`
- `ogz-meta/sessions/**`
- `ogz-meta/audits/**`
- `node_modules/**`
- `.git/**`

## Promotion rule
Artifacts are BORN in `ogz-ledger/` and PROMOTED to `ogz-meta/specs/` only after:
1. Verification against source (Mercury cross-check or equivalent)
2. Explicit decision to treat as canonical
3. Review by operator (Trey)

## Drift recovery
If ogz-meta gets contaminated:
1. `git mv` offending files to `ogz-ledger/`
2. Nuke Mercury index, reindex
