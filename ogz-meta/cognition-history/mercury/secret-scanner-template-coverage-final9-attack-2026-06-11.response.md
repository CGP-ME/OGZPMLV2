[MERCURY-BRIDGE] Index contains 10130 chunks
[MERCURY-BRIDGE] Query router: type=recent_change mode=hybrid-classified boost=recent_changes top-k=8
[MERCURY-BRIDGE] Rationale: recent-change pattern detected; boost recent_changes and changelog
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. scripts/scan-secrets.js:60-117 (function: isAllowedTokenAssignment#part2) sim=0.690
  2. public/js/panels/system-health.js:304-485 (function: render#part2) sim=0.720
  3. public/js/panels/system-health.js:304-485 (function: render#part3) sim=0.719
  4. ogz-meta/AGENTS.md:160-173 (doc_section: Verification Rules) sim=0.702
  5. ogz-meta/AGENTS.md:174-194 (doc_section: Mercury Rules#part1) sim=0.714
  6. CHANGELOG.md:605-610 (doc_section: Candle Ingress Scope Stamping (2026-05-26)) sim=0.695
  7. trai_brain/mercury-bridge/tool-adapter.js:80-917 (function: createToolAdapter#part27) sim=0.615
  8. CHANGELOG.md:748-752 (doc_section: Live Trading Bypass Guard (2026-05-23)) sim=0.701
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, regex_grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
[TRAI] LLM client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
[TRAI] LLM warm-up complete (415ms)
[TRAI] LLM client ready. Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...

═══ ANSWER ═══

**False‑negative shape**

```
export API_KEY=[SENSITIVE_VALUE]
```

*The scanner never flags a credential when the assignment is prefixed with a shell‑style keyword such as `export` (or `let`, `const`, `var`, etc.).*

**Exact branch that misses it**

The detection logic lives in `inspectLine` at the `if` that checks a credential assignment:

- `scripts/scan-secrets.js:267‑274` – the `if (credentialAssignment && …)` block that creates a finding for a credential assignment.
- The regex that populates `credentialAssignment` is defined earlier at `scripts/scan-secrets.js:29` (`CREDENTIAL_ASSIGNMENT = /^\s*([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(.+)$/;`). This pattern does **not** allow a leading keyword such as `export`, so a line like `export API_KEY=secret` never matches, and the block at 267‑274 is never entered.

**Minimal root‑cause fix**

Adjust the `CREDENTIAL_ASSIGNMENT` pattern to optionally accept common declaration prefixes:

```js
// scripts/scan-secrets.js:29 (replace the line)
const CREDENTIAL_ASSIGNMENT = /^\s*(?:export\s+|let\s+|const\s+|var\s+)?([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(.+)$/;
```

or, more generally, allow any number of leading words ending with a space:

```js
const CREDENTIAL_ASSIGNMENT = /^\s*(?:\w+\s+)*([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(.+)$/;
```

With this change, the same `if` block at lines 267‑274 will be triggered for `export API_KEY=…`, correctly reporting a non‑placeholder credential.

[iterations: 6 | termination: answer_given | latency: 7281ms]
