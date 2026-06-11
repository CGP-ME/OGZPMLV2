[MERCURY-BRIDGE] Index contains 10130 chunks
[MERCURY-BRIDGE] Query router: type=identifier mode=hybrid boost=none top-k=8
[MERCURY-BRIDGE] Rationale: code-flavored query with identifiers; kind modifier handles this in Layer 2
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. ogz-meta/specs/config-consolidation-migration-gates-2026-06-08.md:138-168 (doc_section: Required Commands) sim=0.729
  2. ogz-meta/AGENTS.md:146-159 (doc_section: Editing Rules) sim=0.729
  3. ogz-meta/support.js:116-180 (function: generateMissionPlan#part2) sim=0.646
  4. ogz-meta/codex-design/EMOJI-CLEANUP-MANIFEST.md:242-249 (doc_section: Scope Notes) sim=0.719
  5. CHANGELOG.md:582-588 (doc_section: Backtest Report Scope Stamping (2026-05-26)) sim=0.719
  6. CHANGELOG.md:570-576 (doc_section: Pattern Memory Scope Isolation (2026-05-26)) sim=0.714
  7. scripts/update-repo-history.js:45-107 (function: buildHistory#part2) sim=0.612
  8. ogz-meta/specs/config-consolidation-migration-gates-2026-06-08.md:56-69 (doc_section: Inventory Test) sim=0.717
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, regex_grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
[TRAI] LLM client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
[TRAI] LLM warm-up complete (269ms)
[TRAI] LLM client ready. Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...

═══ ANSWER ═══

**False‑negative scenario**

`node scripts/scan-secrets.js --tracked` can miss a credential when the credential is a **raw SHA‑256 hash that appears in a tracked file** (for example a backup or reference file).

The scanner extracts any 64‑character hexadecimal string (`hexCandidates`) and then **hashes that string again** before checking it against the deny‑list of burned hashes:

* The list of burned hashes is loaded from `ogz‑meta/security/burned‑env‑template‑sha256.txt` (lines 53‑62) – each line is stored as the literal hash value.
* In `inspectLine` the scanner finds every 64‑hex candidate (line 107) and calls `hashTokenLiteral(candidate)` (line 109) before testing membership in the deny‑list.

```js
// scripts/scan-secrets.js
53‑62  // loadBurnedTokenHashes() → hashes.add(hash.toLowerCase())
107‑110 // const hexCandidates = inspectLine.match(/[a-f0-9]{64}/gi) || [];
        // if (burnedTokenHashes.has(hashTokenLiteral(candidate.toLowerCase()))) { … }
```

Because the candidate is already a hash, hashing it a second time produces a completely different value, so the `has()` test never succeeds. Consequently a line such as:

```
API_TOKEN=[REDACTED_VALUE]
```

(which is the first entry in `ogz‑meta/security/burned‑env‑template‑sha256.txt`, line 3) **passes the scan** even though it contains a known burned credential.

**Result**

A tracked or staged file that contains a raw burned SHA‑256 hash (or any other 64‑hex token) will not be reported as a secret because the scanner double‑hashes the candidate before comparison. This is a concrete false‑negative that can be exploited by placing a real‑looking credential in a public template, markdown, config, test fixture, or backup file while the scanner still reports “PASS”.

[iterations: 17 | termination: answer_given | latency: 24290ms]
