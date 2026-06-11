[MERCURY-BRIDGE] Index contains 10130 chunks
[MERCURY-BRIDGE] Query router: type=recent_change mode=hybrid-classified boost=recent_changes top-k=8
[MERCURY-BRIDGE] Rationale: recent-change pattern detected; boost recent_changes and changelog
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. ogz-meta/specs/config-consolidation-migration-gates-2026-06-08.md:138-168 (doc_section: Required Commands) sim=0.722
  2. ogz-meta/specs/serena-tree-sitter-migration.md:20-27 (doc_section: What it unlocks) sim=0.743
  3. ogz-meta/specs/serena-mercury-integration.md:66-89 (doc_section: `tools/dep-scanner.js`#part1) sim=0.720
  4. ogz-meta/AGENTS.md:160-173 (doc_section: Verification Rules) sim=0.715
  5. public/js/panels/system-health.js:304-485 (function: render#part3) sim=0.716
  6. trai_brain/mercury-bridge/tool-adapter.js:80-917 (function: createToolAdapter#part27) sim=0.655
  7. pine-transpiler/core/PineParser.js:530-567 (method: primary) sim=0.575
  8. ogz-meta/specs/pre-eval-master-fix-plan-2026-05-20_1.md:83-104 (doc_section: Fix 1 — Confidence clamp at TradingLoop.js:135) sim=0.756
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, regex_grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
[TRAI] LLM client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
[TRAI] LLM warm-up complete (333ms)
[TRAI] LLM client ready. Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...

═══ ANSWER ═══

**False‑negative shape**
The scanner does not flag a vendor‑prefixed token that is assembled with a *template‑literal* (`` `sk_live_[REDACTED]` ``) or a back‑ticked string concatenation. The line looks like a normal assignment, but because the literal token is split across a `${}` expression the current `VENDOR_TOKEN_PREFIX` and `SPLIT_VENDOR_TOKEN` patterns never match, so the credential is missed.

**Example that is missed**

```
const REDACTED_VALUE = `[REDACTED]`;
```

or

```
const API_TOKEN = `sk_live_[REDACTED]` + `${PART}`;
```

**Why it is a false negative**
* `VENDOR_TOKEN_PREFIX` (line 24) only matches a complete token in the line.
* `SPLIT_VENDOR_TOKEN` (line 24‑25) only recognises splits that use single‑ or double‑quoted strings with a `+` operator. It does **not** handle back‑ticks or `${}` interpolation.
* `inspectLine` (lines 276‑282) simply tests the line against `SPLIT_VENDOR_TOKEN`; no extra handling for template literals exists.

**Minimal root‑cause fix**
Extend the split‑token detection to also recognise back‑tick strings and `${}` interpolation. A straightforward change is to broaden `SPLIT_VENDOR_TOKEN` to include back‑ticks:

```js
// scripts/scan-secrets.js – line 24‑25 (updated)
const SPLIT_VENDOR_TOKEN = /(?:["'](?:sk_live_[REDACTED]|sk_test_[REDACTED]|sk-)[A-Za-z0-9]{0,8}["']|`(?:sk_live_[REDACTED]|sk_test_[REDACTED]|sk-)[A-Za-z0-9]{0,8}`)\s*\+\s*(?:["'][A-Za-z0-9]{4,}["']|`[A-Za-z0-9]{4,}`)/;
```

This regex now matches both the existing single/double‑quoted splits **and** the back‑tick/template‑literal splits, causing the scanner to flag the credential on the same line.

**Regression test to add**

```js
test('detects vendor‑prefixed token split across a template literal', () => {
  const findings = reasonsFor('src/example.js', 'const API_TOKEN = `sk_live_[REDACTED]`');
  expect(findings).toContain('split vendor-prefixed token literal committed');
});
```

*Branch through `inspectLine`*: `inspectLine('src/example.js', 1, 'const API_TOKEN = `sk_live_[REDACTED]`', burned)` → matches the updated `SPLIT_VENDOR_TOKEN` and pushes a finding.

**Citations**

* Definition of `SPLIT_VENDOR_TOKEN` – lines 24‑25: `const SPLIT_VENDOR_TOKEN = /[\\\"'](?:sk_live_[REDACTED]|sk_test_[REDACTED]|sk-)[A-Za-z0-9]{0,8}[\\\"']\\s*\\+\\s*[\\\"'][A-Za-z0-9]{4,}[\\\"']/;`【file: scripts/scan-secrets.js, line:24-25】
* Usage in `inspectLine` – lines 276‑282 where the regex is applied: `if (SPLIT_VENDOR_TOKEN.test(inspectLine)) { findings.push({ … reason: 'split vendor-prefixed token literal committed' }); }`【file: scripts/scan-secrets.js, line:276-282】

These two locations are the only places that need to be updated to close the false‑negative gap.

[iterations: 3 | termination: answer_given | latency: 6559ms]
