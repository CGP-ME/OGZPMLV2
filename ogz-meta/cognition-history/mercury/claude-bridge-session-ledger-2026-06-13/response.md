[MERCURY-BRIDGE] Index contains 10130 chunks
[MERCURY-BRIDGE] Query router: type=identifier mode=hybrid boost=none top-k=8
[MERCURY-BRIDGE] Rationale: code-flavored query with identifiers; kind modifier handles this in Layer 2
[MERCURY-BRIDGE] Embedding query for starter context...
[MERCURY-BRIDGE] Starter context: 8 chunks
  1. core/Supervisor.js:112-159 (method: constructor#part2) sim=0.758
  2. ogz-meta/execute-mission.js:68-499 (function: executeMission#part14) sim=0.755
  3. ogz-meta/Alignment/README.md:7-85 (doc_section: Cold-Start Order#part3) sim=0.736
  4. ogz-meta/Alignment/OGZ-MASTER-ALIGNMENT.md:451-466 (doc_section: WHAT I DID DO (Wolf's verification before revising)) sim=0.738
  5. core/Supervisor.js:963-1034 (method: _replayRestartHistory#part1) sim=0.745
  6. run-empire-v2.js:531-1441 (method: constructor#part32) sim=0.744
  7. ogz-meta/specs/MULTI-RUNTIME-BUILD-SPEC-2026-05-26.md:99-139 (doc_section: Commit 1 - Add dormant SessionRouter TransitionStore) sim=0.742
  8. ogz-meta/Alignment/OGZ-MASTER-ALIGNMENT.md:467-477 (doc_section: WHAT I DID NOT DO) sim=0.733
[MERCURY-BRIDGE] Tool adapter ready. Tools: grep, regex_grep, open_file, get_chunk, list_files, tavily_search, git_show, web_fetch
[TRAI] LLM client initializing...
   Provider: Mercury-2 (Inception Labs)
   Model:    mercury-2
   Endpoint: https://api.inceptionlabs.ai/v1
[TRAI] LLM warm-up complete (464ms)
[TRAI] LLM client ready. Provider: Mercury-2 (Inception Labs) | Model: mercury-2
[MERCURY-BRIDGE] Starting ReAct loop (max 60 iterations)...

═══ ANSWER ═══

**Exploit summary**

A malicious client (Session B) can bypass the per‑session enforcement by relying on the *environment‑variable fallback* used by `sessionIdFromHookInput`.  
If the process is started with `CLAUDE_SESSION_ID` set to the identifier of an already‑authenticated session (Session A), any hook that does **not** supply a `session_id` (or `sessionId`/`session.id`) will be treated as belonging to Session A. The ledger checks then read the *global* entries that were recorded for Session A, allowing Session B to:

* satisfy the forced‑read check in `pre‑edit` (the read was performed by Session A), and  
* record an edit under Session A’s bucket in `post‑edit`, thereby satisfying the edit‑ownership check in `finish‑gate`.

Because the fallback is performed **before** the “missing‑session‑identity” guard, the guard never triggers, and the hook proceeds as if it were the same session.

---

### 1. Session‑B satisfying forced‑read / edit attribution using Session A ledger data  

| File | Line(s) | Evidence |
|------|---------|----------|
| `hook-input.js` – `sessionIdFromHookInput` | 42‑46 | Returns the first non‑null value from `input.session_id`, `input.sessionId`, `input.session?.id`, **or** `process.env.CLAUDE_SESSION_ID`【`hook-input.js:42-46`】 |
| `pre-edit.js` – session‑id extraction | 58‑60 | Calls `sessionIdFromHookInput(input)` and aborts only if the result is falsy【`pre-edit.js:58-60`】 |
| `pre-edit.js` – forced‑read guard | 59‑61 | Emits a BLOCKED error **only** when `!sessionId`【`pre-edit.js:59-61`】 |
| `post-edit.js` – session‑id extraction | 11‑17 | Same fallback to `process.env.CLAUDE_SESSION_ID` via `editLedger.sessionIdFromHookInput`【`post-edit.js:11-17`】 |
| `edit-ledger.js` – `recordEdit` session‑id validation | 75‑78 | Throws only when `normalizeSessionId(sessionId)` is falsy【`edit-ledger.js:75-78`】 |

**Exploit steps**

1. Start the bridge process with `CLAUDE_SESSION_ID=SESSION‑A`.  
2. In Session B’s hook input **omit** any `session_id` field (or set it to `null`).  
3. `pre‑edit` calls `sessionIdFromHookInput`, receives `SESSION‑A` from the env var, and therefore **does not** hit the “missing‑session” guard.  
4. The forced‑read check `ledger.hasReadFile(rel, { sessionId })` looks up reads **only** for `SESSION‑A`; because Session A already performed the read, the check passes.  
5. `post‑edit` also receives `SESSION‑A` via the same fallback, so `recordEdit` records the edit under Session A’s bucket, satisfying the later ownership check in `finish‑gate`.

Thus Session B can edit a file after a read performed by Session A without ever presenting its own session identifier.

---

### 2. Missing hook session identity letting a path pass  

The same env‑var fallback makes the “missing‑session‑identity” guard ineffective:

| File | Line(s) | Evidence |
|------|---------|----------|
| `pre-edit.js` – guard | 59‑61 | BLOCKED only when `!sessionId`【`pre-edit.js:59-61`】 |
| `post-read.js` – guard | 13‑16 | BLOCKED only when `!sessionId`【`post-read.js:13-16`】 |
| `post-edit.js` – guard | 14‑17 | BLOCKED only when `!sessionId`【`post-edit.js:14-17`】 |

If `CLAUDE_SESSION_ID` is set, the guard never fires, so a hook that **lacks** an explicit session identifier is treated as if it had one.

---

### 3. Legacy global reads/edits weakening isolation  

`finish‑gate` can be invoked with **global** ledger data:

| File | Line(s) | Evidence |
|------|---------|----------|
| `finish-gate.js` – default `editedFiles` argument | 151‑152 | `editedFiles = editLedger.listEditedFiles()` (global list)【`finish-gate.js:151-152`】 |
| `edit-ledger.js` – `listEditedFiles` implementation | 94‑99 | Returns per‑session edits only when `sessionId` is supplied; otherwise returns the global list【`edit-ledger.js:94-99`】 |

If any code (including a future hook) calls `evaluateFinishGate` **without** a `sessionId`, the global edit list is used, allowing a session to satisfy the hot‑path proof check with edits performed by another session. This is a legacy path that bypasses the per‑session bucket.

---

### 4. Sibling state files  

* `read-ledger.json` and `edit-ledger.json` – contain both **global** arrays (`reads`, `edits`) and per‑session buckets (`sessions[sessionId]`). The global arrays are consulted when a session identifier is omitted (as shown above).  
* `task-contract.json` – only used for contract‑diff validation; it is not session‑scoped, so it does not affect isolation.  
* `hot-path-proof.json` – used by `finish‑gate` to verify proof of hot‑path changes; it is also global and therefore not a source of per‑session leakage.

Only the **ledger** files exhibit the bug class (fallback to global data when a session id is missing).

---

### 5. Test blind spots  

| Test | Coverage | Gap |
|------|----------|-----|
| `post-read` & `post-edit` missing‑session tests | Verify that the hook **fails** when `session_id` is absent. | They do **not** cover the case where `CLAUDE_SESSION_ID` is set, which makes the guard succeed. |
| `pre-edit` forced‑read test | Checks that a read must be performed in the *same* session. | Does not test the env‑var fallback, so the cross‑session bypass is unchecked. |
| `finish-gate` tests | Not present in the repository. | No test ensures that `evaluateFinishGate` is always called with a `sessionId`, leaving the global‑list path untested. |

---

### 6. Minimal exploit path (real bypass)

```bash
# 1. Start the bridge process with a known session id (Session‑A)
export CLAUDE_SESSION_ID=SESSION-A

# 2. Session‑B invokes the read hook (post‑read) without a session_id
#    → ledger.recordRead stores the read under SESSION‑A (via env var)

# 3. Session‑B now runs the edit hook (pre‑edit) also without a session_id
#    → pre‑edit receives sessionId = SESSION-A (env var)
#    → ledger.hasReadFile finds the read recorded in step 2 and passes

# 4. Session‑B runs the post‑edit hook (post‑edit) without a session_id
#    → editLedger.recordEdit records the edit under SESSION‑A

# 5. When finish‑gate runs (run()), it receives sessionId = SESSION‑A
#    → editLedger.listEditedFiles({ sessionId }) returns the edit just recorded,
#      satisfying the hot‑path proof check for SESSION‑A.
```

All steps succeed because the code **never** checks that the session identifier originates from the hook input; it silently falls back to the process‑wide `CLAUDE_SESSION_ID` environment variable. This defeats the intended per‑session isolation.

---

**Conclusion**

* The env‑var fallback in `sessionIdFromHookInput` (lines 42‑46) is the root cause of the bypass.  
* Missing‑session guards (lines 59‑61, 13‑16, 14‑17) are ineffective when the env var is set.  
* Global ledger arrays (`read-ledger.json`, `edit-ledger.json`) are still consulted when a session id is omitted, providing a legacy path for cross‑session attribution.  
* Tests do not cover the env‑var scenario nor the default‑argument path in `finish‑gate`, leaving the vulnerability untested.  

Fixes should either **remove** the environment‑variable fallback or **require** an explicit session identifier in every hook, and **ensure** that `evaluateFinishGate` is always called with a session‑specific edit list.

[iterations: 10 | termination: answer_given | latency: 9541ms]
