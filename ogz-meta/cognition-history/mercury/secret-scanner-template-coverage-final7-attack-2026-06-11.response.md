[MERCURY-BRIDGE] Index contains 10130 chunks
[MERCURY-BRIDGE] Query router: type=recent_change mode=hybrid-classified boost=recent_changes top-k=8
[MERCURY-BRIDGE] Rationale: recent-change pattern detected; boost recent_changes and changelog
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. scripts/scan-secrets.js:60-117 (function: isAllowedTokenAssignment#part2) sim=0.689
  2. public/js/panels/system-health.js:304-485 (function: render#part2) sim=0.720
  3. public/js/panels/system-health.js:304-485 (function: render#part3) sim=0.715
  4. ogz-meta/AGENTS.md:174-194 (doc_section: Mercury Rules#part1) sim=0.713
  5. ogz-meta/AGENTS.md:160-173 (doc_section: Verification Rules) sim=0.698
  6. ogz-meta/specs/config-consolidation-migration-gates-2026-06-08.md:138-168 (doc_section: Required Commands) sim=0.688
  7. core/CandleProcessor.js:961-1323 (method: handleMarketData#part8) sim=0.694
  8. core/StateManager.js:1716-1905 (method: load#part9) sim=0.694
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, regex_grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
[TRAI] LLM client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
[TRAI] LLM warm-up complete (242ms)
[TRAI] LLM client ready. Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...

═══ ANSWER ═══

**False‑negative shape**
A credential line that uses a *Bearer* token prefix is not caught by the scanner:

```
[AUTH_HEADER]=Bearer [TOKEN]
```

**Why it is missed**
The scanner only checks for vendor‑prefixed tokens (`VENDOR_TOKEN_PREFIX` on line 23) and for JWTs, private‑key blocks, URLs with embedded credentials, and generic credential assignments (the `credentialAssignment` block on lines 243‑250). There is no pattern that looks for the literal word **Bearer** followed by a token, so a line such as `Authorization: Bearer [REDACTED]…` (or an assignment like `AUTH_HEADER=Bearer [REDACTED]…`) falls through all detection branches and produces no finding.

**Exact branch that skips it**
The line is processed by `inspectLine`, reaches the `credentialAssignment` block (lines 243‑250), but `CREDENTIAL_ASSIGNMENT` does not match because the value starts with the word *Bearer* and the scanner never applies a separate check for that pattern. Consequently, no finding is added.

**Minimal root‑cause fix**
Add a regular expression for Bearer [REDACTED] and test it in `inspectLine` alongside the existing `VENDOR_TOKEN_PREFIX` check.

```js
// scripts/scan-secrets.js
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9\-_\.]{10,}\b/i;   // ← new pattern

// Inside inspectLine, after the VENDOR_TOKEN_PREFIX test (around line 227)
if (VENDOR_TOKEN_PREFIX.test(inspectLine) || BEARER_TOKEN.test(inspectLine)) {
  findings.push({
    filePath,
    lineNumber,
    reason: 'vendor‑prefixed or Bearer [REDACTED] literal committed',
  });
}
```

*Citation*:
- Vendor‑prefix regex definition (line 23) – `VENDOR_TOKEN_PREFIX`.
- Vendor‑prefix detection branch (lines 227‑232) – where the new `BEARER_TOKEN` check should be added.
- Credential‑assignment detection (lines 243‑250) – shows the current path that does not cover Bearer [REDACTED]

[iterations: 7 | termination: answer_given | latency: 9931ms]
