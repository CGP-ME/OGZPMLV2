[MERCURY-BRIDGE] Index contains 10130 chunks
[MERCURY-BRIDGE] Query router: type=recent_change mode=hybrid-classified boost=recent_changes top-k=8
[MERCURY-BRIDGE] Rationale: recent-change pattern detected; boost recent_changes and changelog
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. ogz-meta/specs/serena-tree-sitter-migration.md:20-27 (doc_section: What it unlocks) sim=0.733
  2. ogz-meta/AGENTS.md:160-173 (doc_section: Verification Rules) sim=0.721
  3. public/js/panels/system-health.js:304-485 (function: render#part3) sim=0.727
  4. trai_brain/mercury-bridge/tool-adapter.js:80-917 (function: createToolAdapter#part27) sim=0.657
  5. public/js/panels/system-health.js:304-485 (function: render#part2) sim=0.721
  6. ogz-meta/specs/phase1-env-gates-investigation.md:91-105 (doc_section: 6. Recommendation) sim=0.707
  7. pine-transpiler/core/PineParser.js:530-567 (method: primary) sim=0.595
  8. scripts/scan-secrets.js:60-117 (function: isAllowedTokenAssignment#part2) sim=0.690
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, regex_grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
[TRAI] LLM client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
[TRAI] LLM warm-up complete (311ms)
[TRAI] LLM client ready. Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...

═══ ANSWER ═══

**False‑negative shape**

```
config = { API_KEY: "[REDACTED_VALUE]" };
```

*The scanner never flags this because the line does **not** match the `CREDENTIAL_ASSIGNMENT` branch (it looks for `=` assignments only). The token appears as an object‑property (`key: value`) and therefore falls through all detection branches.*

**Exact branch that is taken**

`inspectLine` → `CREDENTIAL_ASSIGNMENT` (line 280‑295) – the `if (credentialAssignment && …)` test fails, so no finding is added.

**Minimal root‑cause fix**

Add a second pattern that also catches object‑property style assignments, e.g.:

```js
// after the existing CREDENTIAL_ASSIGNMENT block
const OBJECT_PROPERTY = /([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(['"]?[^'"]+['"]?)/;
const propMatch = inspectLine.match(OBJECT_PROPERTY);
if (
  propMatch &&
  isCredentialName(propMatch[1]) &&
  !isAllowedTokenAssignment(propMatch[2]) &&
  !isDynamicAssignmentValue(propMatch[2])
) {
  findings.push({
    filePath,
    lineNumber,
    reason: `object property ${propMatch[1]} contains a non‑placeholder value`,
  });
}
```

This small addition makes the scanner recognise the same credential‑name logic for `key: value` pairs, eliminating the false‑negative shown above.

[iterations: 4 | termination: answer_given | latency: 10697ms]
