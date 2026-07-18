# K3 Bakeoff Test 4 - Mercury Bridge Self-Audit

Date: 2026-07-18
Codex lane: K3 bakeoff / fourth-eye audition
Report file: `ogz-meta/inbox/fable/2026-07-18/codex1-summary-k3-bakeoff-4.md`
Raw run log: `ogz-meta/cognition-history/k3-bakeoff/2026-07-18/test4-bridge-self-audit.log`

## Index Receipt

- Mercury index SHA for code-bearing HEAD: `04d5a1cf960f690934006ba7a7070a16e39a0876`
- Current HEAD when report was written: advanced by report-only commits after the reindex.
- Code relevance: no bridge/runtime code changed after the reindex.

## Prompt Scope

Question: self-audit the Mercury bridge: ReAct loop, tool adapter path resolution, provider routing, Kimi consensus request shaping, degraded-evidence handling, run-ledger verdict classification, and telemetry completeness.

Scoped files: `trai_brain/mercury-bridge/`, plus package/test files only if needed by the bridge.

Secrets boundary in prompt: no `.env`, no `ogz-meta/cognition-history`, no broker/account data, no `data/journal`, no `data/state`, no logs, no public proof account data, and no API keys.

## Result

Mercury verdict: `bridge_flawed`

Kimi/Fable review status: `needs_more_evidence`, then useful recheck.

Kimi did not accept Mercury's first pass as clean proof. It challenged the missing line evidence for tool-failure handling, provider routing, sanitizer leakage, and verdict classification. Mercury rechecked the requested files.

## Locally Verified Findings

1. Tool-call failures do not stop the ReAct loop immediately:
   - Current code catches adapter exceptions and converts them into `{ error: err.message }`.
   - That failed tool result is appended to history and sent back to the model, then the loop continues.
   - Final answer handling occurs later when the model emits no tool calls.
   - Evidence: `trai_brain/mercury-bridge/react-loop.js:574-595`, `trai_brain/mercury-bridge/react-loop.js:598-609`.
   - Important limitation: downstream run-ledger classification now marks tool-failed runs as `inconclusive_toolfail`, so this is not currently a commit-blocking authority path. It is still a review-quality risk because the final answer can exist beside failed tool evidence.

2. Tool-failure detection is telemetry, not loop control:
   - `isFailedToolResult()` identifies failed tool outputs.
   - The reviewed path uses failure state for telemetry/classification, not as a ReAct-loop abort.
   - Evidence: `trai_brain/mercury-bridge/react-loop.js:194-202`, `trai_brain/mercury-bridge/run-ledger.js:98-115`.

3. Provider error sanitizer does not redact filesystem paths:
   - `sanitizeProviderMessage()` redacts request IDs, org IDs, account tokens, and provider refs.
   - It does not redact absolute repo/user paths if a provider error includes them.
   - Evidence: `trai_brain/mercury-bridge/provider-preflight.js:22-34`.
   - Severity: hygiene/privacy issue, not proven secrets leakage by itself.

4. Verdict classification is still text-driven after toolfail filtering:
   - `classifyMercuryVerdict()` first returns `tool_failure` or `inconclusive_toolfail` when the bridge records errors.
   - If tools are clean, it still maps answer text containing words like `bug`, `bypass`, `unsafe`, or `failure mode` into `found_break`.
   - Evidence: `trai_brain/mercury-bridge/run-ledger.js:111-135`.
   - Severity: report-classification risk. Earlier R-FS2 removed commit-blocking authority from this field, so this no longer freezes code by itself.

5. Provider-routing claim was overstated by Mercury:
   - Mercury claimed unsupported consensus providers can pass through unchecked.
   - Current config has a supported-provider allowlist for consensus provider names.
   - `PersistentLLMClient` also rejects unknown provider names.
   - Evidence: `trai_brain/mercury-bridge/config.js:337-385`, `core/persistent_llm_client.js:88-95`.
   - Disposition: downgrade from "unvalidated arbitrary provider" to "ensure provider routing tests stay explicit for Kimi and Claude paths."

## Kimi Value

Strong. Kimi rejected weak proof instead of agreeing with Mercury. Its challenge forced the recheck that separated real bridge hygiene issues from an overstated provider-routing claim.

## Tool Quality

- Mercury pass 1: 22 tool calls, 22 succeeded, 0 failed.
- Kimi/Fable consensus: `openai/kimi-k3`, latency 46.048s.
- Mercury recheck: 9 tool calls, 8 succeeded, 1 failed due a bad relative `open_file` path. Evidence quality is marked degraded, then locally verified with direct file reads.

## Follow-Up Candidate

Bridge hardening lane:

1. Make failed tool calls structurally visible in the final packet, with a policy choice on whether ReAct continues or terminates after tool failure.
2. Add filesystem-path redaction to provider preflight and ledger sanitizers.
3. Make `found_break` classification evidence-aware, or label it explicitly as text classification when evidence binding is absent.
4. Keep provider routing tests explicit for Mercury, Claude Code, Kimi/OpenAI-compatible, Ollama, and Ollama Cloud.
