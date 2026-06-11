[MERCURY-BRIDGE] Index contains 10130 chunks
[MERCURY-BRIDGE] Query router: type=identifier mode=hybrid boost=none top-k=8
[MERCURY-BRIDGE] Rationale: code-flavored query with identifiers; kind modifier handles this in Layer 2
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. ogz-meta/specs/config-consolidation-migration-gates-2026-06-08.md:138-168 (doc_section: Required Commands) sim=0.723
  2. ogz-meta/AGENTS.md:359-383 (doc_section: Known Landmines#part1) sim=0.721
  3. ogz-meta/AGENTS.md:146-159 (doc_section: Editing Rules) sim=0.726
  4. scripts/scan-secrets.js:60-117 (function: isAllowedTokenAssignment#part2) sim=0.617
  5. CHANGELOG.md:605-610 (doc_section: Candle Ingress Scope Stamping (2026-05-26)) sim=0.712
  6. config/snapshots/README.md:9-14 (doc_section: What will live here (Phase 6+)) sim=0.705
  7. CHANGELOG.md:582-588 (doc_section: Backtest Report Scope Stamping (2026-05-26)) sim=0.715
  8. ogz-meta/codex-design/EMOJI-CLEANUP-MANIFEST.md:242-249 (doc_section: Scope Notes) sim=0.704
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, regex_grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
[TRAI] LLM client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
[TRAI] LLM warm-up complete (288ms)
[TRAI] LLM client ready. Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...

═══ ANSWER ═══

**False‑negative scenario**

A credential can slip through `node scripts/scan‑secrets.js --tracked` when it is written in a non‑`.env` file (e.g. a markdown, JSON, or generic config file) using a **lower‑case or mixed‑case key** that is not matched by the “template‑file” rule and that does not trigger any of the other token‑pattern checks.

*Why the scanner misses it*

1. **Only files that end with “.env.*” are treated as template files** – the check is performed by `isTemplateFile` (lines 92‑94).
   ```js
   function isTemplateFile(filePath) {
     return /\.env\.(example|template|sample)$/i.test(filePath);
   }
   ```
   A file such as `docs/README.md` therefore bypasses the template‑credential logic.

2. **The generic assignment detector (`ANY_ENV_ASSIGNMENT`) only matches *uppercase* variable names** (line 28).
   ```js
   const ANY_ENV_ASSIGNMENT = /^\s*[A-Z0-9_]+\s*=\s*[\\"']?([^\\\"'#\\s]+)/i;
   ```
   A line like
   ```text
   my_api_key = [REDACTED_VALUE]
   ```
   does **not** satisfy this regex, so the later hash‑comparison (lines 192‑199) is never executed.

3. **Template‑credential detection (`TEMPLATE_CREDENTIAL_ASSIGNMENT`) is only invoked for files that `isTemplateFile` returns true** (lines 181‑190).
   ```js
   if (isTemplateFile(filePath)) {
     const templateAssignment = inspectLine.match(TEMPLATE_CREDENTIAL_ASSIGNMENT);
     if (templateAssignment && !isAllowedTokenAssignment(templateAssignment[2])) {
       findings.push({
         filePath,
         lineNumber,
         reason: `template credential ${templateAssignment[1]} contains a non‑placeholder value`
       });
     }
   }
   ```
   Because the file is not a `.env.*` file, this block is skipped entirely.

4. **The “burned‑hash” checks only look for 64‑character hex strings** (lines 112‑119) and then optionally double‑hash them (lines 122‑128).
   ```js
   const hexCandidates = inspectLine.match(/[a-f0-9]{64}/gi) || [];
   for (const candidate of hexCandidates) {
     const normalizedCandidate = candidate.toLowerCase();
     if (!isBurnedHashFile(filePath) && burnedTokenHashes.has(normalizedCandidate)) { … }
     if (burnedTokenHashes.has(hashTokenLiteral(normalizedCandidate))) { … }
   }
   ```
   A normal secret that is not a 64‑hex hash never reaches these checks.

*Result*: a line such as `my_api_key = "s3cr3tP@ssw0rd"` placed in a tracked markdown or config file will be ignored by all of the detection branches, and the script will finish with a **PASS** even though a real credential is present.

**How to reproduce the false negative**

1. Create a tracked file `docs/README.md` (or any non‑`.env` file).
2. Add the line
   ```text
   my_api_key = [REDACTED_VALUE]
   ```
3. Run the scanner:
   ```bash
   node scripts/scan-secrets.js --tracked
   ```
   The output will be a PASS, because none of the code paths that raise a finding are triggered for this pattern.

**Key code locations that enable the bypass**

| Feature | Code location |
|---------|---------------|
| Template‑file detection | `isTemplateFile` (lines 92‑94) |
| Generic env‑assignment regex (uppercase only) | `ANY_ENV_ASSIGNMENT` (line 28) |
| Template‑credential regex (only for template files) | `TEMPLATE_CREDENTIAL_ASSIGNMENT` (line 27) and its usage (lines 181‑190) |
| Burned‑hash detection (hex‑only) | `hexCandidates` (line 112) and double‑hash check (lines 122‑128) |
| Burned‑hash file exclusion | `isBurnedHashFile` (lines 87‑89) |

These sections together create a gap that lets a real‑looking credential in a non‑`.env` file with a lower‑case key slip through unnoticed.

[iterations: 6 | termination: answer_given | latency: 11478ms]
