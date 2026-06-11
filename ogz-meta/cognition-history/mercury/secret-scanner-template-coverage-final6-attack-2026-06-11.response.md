[MERCURY-BRIDGE] Index contains 10130 chunks
[MERCURY-BRIDGE] Query router: type=recent_change mode=hybrid-classified boost=recent_changes top-k=8
[MERCURY-BRIDGE] Rationale: recent-change pattern detected; boost recent_changes and changelog
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. public/js/panels/system-health.js:304-485 (function: render#part2) sim=0.727
  2. ogz-meta/AGENTS.md:160-173 (doc_section: Verification Rules) sim=0.710
  3. ogz-meta/AGENTS.md:174-194 (doc_section: Mercury Rules#part1) sim=0.713
  4. ogz-meta/specs/config-consolidation-migration-gates-2026-06-08.md:138-168 (doc_section: Required Commands) sim=0.699
  5. public/js/panels/system-health.js:304-485 (function: render#part3) sim=0.719
  6. ogz-meta/specs/phase1-env-gates-investigation.md:91-105 (doc_section: 6. Recommendation) sim=0.697
  7. scripts/update-repo-history.js:45-107 (function: buildHistory#part2) sim=0.560
  8. core/CandleProcessor.js:755-842 (method: attemptBackfill#part2) sim=0.700
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, regex_grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
[TRAI] LLM client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
[TRAI] LLM warm-up complete (275ms)
[TRAI] LLM client ready. Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...

═══ ANSWER ═══

**False‑negative shape**
A credential assignment whose variable name contains a hyphen is never flagged, e.g.:

```
API-KEY=[REDACTED_VALUE]
```

**Why it slips through**
`inspectLine` only looks for credential assignments via the `CREDENTIAL_ASSIGNMENT` regex (line 27). The regex is:

```js
const CREDENTIAL_ASSIGNMENT = /^\s*([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.+)$/;
```

Because the character class `[A-Za-z0-9_]*` does **not** include a hyphen (`-`), a line like `API-KEY=…` does not match, so `credentialAssignment` is `null` and the whole branch that would push a finding (lines 243‑258) is never executed.

**Minimal fix**
Relax the variable‑name pattern to allow hyphens (and optionally other non‑word characters) while still requiring the name to start with a letter:

```js
// scripts/scan-secrets.js – replace line 27
const CREDENTIAL_ASSIGNMENT = /^\s*([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(.+)$/;
```

This change lets `inspectLine` capture `API-KEY` (and similar names), after which the existing credential‑name checks and placeholder‑allowance logic correctly flag the non‑placeholder value.

[iterations: 5 | termination: answer_given | latency: 5864ms]
