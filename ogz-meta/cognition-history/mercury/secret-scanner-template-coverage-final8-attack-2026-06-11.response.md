[MERCURY-BRIDGE] Index contains 10130 chunks
[MERCURY-BRIDGE] Query router: type=recent_change mode=hybrid-classified boost=recent_changes top-k=8
[MERCURY-BRIDGE] Rationale: recent-change pattern detected; boost recent_changes and changelog
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. scripts/scan-secrets.js:60-117 (function: isAllowedTokenAssignment#part2) sim=0.690
  2. public/js/panels/system-health.js:304-485 (function: render#part2) sim=0.720
  3. public/js/panels/system-health.js:304-485 (function: render#part3) sim=0.713
  4. ogz-meta/AGENTS.md:174-194 (doc_section: Mercury Rules#part1) sim=0.709
  5. ogz-meta/AGENTS.md:160-173 (doc_section: Verification Rules) sim=0.697
  6. ogz-meta/specs/config-consolidation-migration-gates-2026-06-08.md:138-168 (doc_section: Required Commands) sim=0.689
  7. core/CandleProcessor.js:961-1323 (method: handleMarketData#part8) sim=0.694
  8. trai_brain/mercury-bridge/tool-adapter.js:80-917 (function: createToolAdapter#part30) sim=0.618
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, regex_grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
[TRAI] LLM client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
[TRAI] LLM warm-up complete (278ms)
[TRAI] LLM client ready. Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...

═══ ANSWER ═══

**False‑negative shape**

```
API_URL = https://example.com/api?access_token=[REDACTED]
```

*The scanner never flags this line because the only URL‑credential check is the `URL_WITH_USERINFO` regex, which only matches credentials in the *userinfo* part of a URL (e.g. `user:pass@host`).  The query‑parameter form (`?…=…`) is not examined, so the line falls through the detection logic.*

**Where it bypasses the scanner**

* The URL‑credential branch in `inspectLine` is at lines 227‑230, where the code does:

```js
if (URL_WITH_USERINFO.test(inspectLine)) {
    findings.push({ filePath, lineNumber, reason: 'URL contains embedded credentials' });
}
```

*Because `URL_WITH_USERINFO` (defined on line 27) does **not** match a URL that carries a token in the query string, the `if` condition is false and no finding is produced.*

**Minimal root‑cause fix**

Add a second regex (or extend `URL_WITH_USERINFO`) that also catches tokens appearing in query‑string parameters, e.g.:

```js
// Extend URL detection to include query‑string credentials
const URL_WITH_CRED = /[?&][^=\s]+=[A-Za-z0-9._-]{10,}/i;
```

and add a corresponding check in `inspectLine` (just after the existing URL check):

```js
if (URL_WITH_USERINFO.test(inspectLine) || URL_WITH_CRED.test(inspectLine)) {
    findings.push({ filePath, lineNumber, reason: 'URL contains embedded credentials' });
}
```

With this change, the example line will be caught by the new `URL_WITH_CRED` branch, eliminating the false‑negative.

[iterations: 10 | termination: answer_given | latency: 17290ms]
