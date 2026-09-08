# MISSION — MERCURY BRIDGE — AUTHORITY GATE READS RECEIPTS, NOT HEADINGS

**Tree:** `e54a8b8` + packet commits (bridge files unchanged since `3727b75d`, Sept 1). One branch. Tooling, not the bot; still a Ruling-7 packet, still cold-pulled.
**Executor:** Codex (has node; ran the bridge Sept 7).
**Trey's word (Sept 7):** "all of those things already print in the receipt." The gate grades headings; the ledger already holds the evidence. Point the gate at the ledger. Mercury's findings count when the receipts exist.
**Status:** GO on Trey's "go" Sept 7. Read-only until the packet lands; nothing else in the bridge changes.

## What the code does today (read at e54a8b8)
- `trai_brain/mercury-bridge/doctrine-review.js:121-231` `assessDoctrineReview` collects `namedAbsences`; **any** absence → `authorityCeiling: 'UNVERIFIED'` (`:218`).
- Each seat's cap flips `evidenceChecksPassed` false: `ask.js:966` (Mercury), `:1032` (Fable), `:1081` (Kimi). Panel verdict is `unverified` unless every seat is FULL: `reviewer-panel.js:81-82`, `adversarial-review.js:854`.
- Text-only absences that fire on every answer without boilerplate, diff or no diff:
  - `report_section_absent` — nine required headings (`:203-215`)
  - `coverage_insufficient` — requires a literal `CANDIDATE SET: examined N of M` line even when `changedFiles` is empty (`:135-139`; `!candidateSet` is true for any answer that doesn't write the line)
  - `inherited_section_incomplete` — requires an INHERITED section containing `|| 0`, "swallowed catch", "bypass env", "silent default" (`:162-170`)
- Receipt-based absences (keep): `whole_file_read_absent` (`:157-159`, telemetry), `ast_evidence_absent` (`:141-152`, autoScan meta — but ALSO requires a text section), `pre_answer_scan_absent` (`:153-155`), `sandbox_testimony_only` (`:178-183`), `testimony_only_finding` (`:185-188`), `fourth_shape_unclassified` (`:171-177`, diff-based).
- The same nine-section demand is injected into Mercury's prompt: `MERCURY_DOCTRINE_PROMPT` (`:5-21`).
- Receipts already recorded per seat: `files_mechanically_opened`, `tools_invoked`, `run_check_artifacts`, `answer_quality` incl. `missing_file_line_citation` (`run-ledger.js:458-476, :569-587`).

## The change (minimum surgery)
1. **Delete** `report_section_absent` and the `requiredSections` list (`doctrine-review.js:203-215`).
2. **Scope to diff review:** `coverage_insufficient` and `inherited_section_incomplete` fire only when `changedFiles.length > 0`. A read-only audit has no diff; these are not evidence checks for it.
3. **`ast_evidence_absent`** becomes receipt-only: drop the `astSection` text requirement; fire only when `changedJs.length > 0` and a changed JS file is absent from `autoScan.meta`.
4. **Add one receipt-based absence for read-only audits:** `no_mechanical_evidence` — fires when `telemetry.filesOpened` is empty AND `tools_invoked` total is 0 AND `answer_quality` contains `missing_file_line_citation`. An answer with opened files or file:line citations is evidence-qualified regardless of headings.
5. **Prompt:** remove the nine-section list from `MERCURY_DOCTRINE_PROMPT` (`:9-19`). Keep `TOTALITY_LAW` and the sandbox-provenance line (`:20`). Mercury is asked for receipts, not sections.
6. **Recheck carry-forward:** the Mercury recheck stage must receive pass-1's `files_mechanically_opened` and `claimed_file_citations` as fixed inputs in the recheck prompt so a recheck cannot "forget" a file it already opened (Sept 7 ledger line 17). The executor reads the recheck prompt builder in `ask.js` (not read by Fable — location and lines are the executor's to cite) and adds the carry-forward there.
7. Nothing else in the bridge changes. No new gates, flags, or knobs.

## Part B — Mercury's method (Trey, Sept 7, verbatim): "mercury should do this assess the quiestion decide any of its tooling is appropriate for it keep reading until it has read all the comments filing away potential answers while it reads then when exhausted go back over everything and pick the correct one citing everything"

What the code does today (read at e54a8b8):
- `react-loop.js:637-731`: the loop runs until the assistant replies with content and no tool calls; that reply is returned as the final answer (`:722-731`, `termination: 'answer_given'`). No collection phase, no decision phase. Sept 7 ledger: answers given at iteration 18/60 and 22/60.
- `mercury.config.json` → `agentic.systemPrompt` (loaded `config.js:307`, injected `react-loop.js:601`): attacker persona ("adversarial verification gate", "break weak claims with lethal precision", "if the user says break my fix, attack"); contains "Do not stop at the first plausible finding" (INVESTIGATION DISCIPLINE) but also "Do not recap your search process. The user cares about the answer, not the path you took" (ANSWER FORMAT) — the opposite of "filing away potential answers … citing everything."
- Default mode without `--agentic` is single-shot RAG (`singleShot.systemPrompt`, "retrieved chunks are your ONLY source of ground truth", 2,000 tokens, no tools) — Serena unreachable in that mode.

The change:
7. **Two-phase loop.** Phase 1 (reading): the first content-only reply is not accepted as an answer. It must be the CANDIDATE SET: every file/reader/possible answer filed so far, each with file:line. The loop appends it to history and replies: "Anything unread? If yes, keep reading. If no, decide." Phase 2 (deciding): the next content-only reply is the answer; the Phase-1 candidate set and its citations are carried forward as fixed input and written to the ledger as `candidate_set`. This is the same mechanism as the recheck carry-forward in item 6 — one implementation serves both.
8. **Instructions:** the attacker framing applies only when the query contains "break my fix" (or a `--attack` flag); otherwise Mercury is a reader with Trey's method above, verbatim, as the system prompt's investigation section. Delete "Do not recap your search process" from ANSWER FORMAT. Keep the AST-mandatory and citation rules.
9. **Default mode is the reading mode (RULED Sept 7, Trey: "mercury reads everything yes I want it to fully understand before it answers").** Agentic two-phase is the default for every question; single-shot RAG only by explicit flag; attacker framing only on "break my fix". The executor lists anything that depends on single-shot being the default before flipping, and reports it, but the flip is ruled.

Proof for Part B: re-run Sept 7 ledger line 20 (15 env keys) — the ledger must show a `candidate_set` entry with file:line per candidate before the answer, and the answer's citations must be a subset of the candidate set's.

## Out of scope
The reviewer panel structure, Kimi adjudication, quarantines, identity posture, run-ledger schema, the `--agentic` default, `maxTokens` config coupling (`mercury.config.json` vs `--max-tokens`; noted Sept 7 as friction, separate item), the claude-bridge "break my fix" gate on Claude Code's seat.

## Proof (before cold-pull)
- Re-run the Sept 7 ledger line 20 prompt (15 env keys) unchanged: verdict must come back with panel authority FULL (telemetry shows tool calls + files opened), not `unverified`.
- Re-run with a deliberately evidence-free prompt ("answer from memory, open nothing"): must still cap `UNVERIFIED` via `no_mechanical_evidence`.
- Re-run ledger line 17 (profit-target key): recheck must retain `ogz-meta/claudito-logger.js:399` as fixed input; no contradiction between pass 1 and recheck.
- Existing bridge tests green (not proof; just not red). Diff attached. Packet per ruling 7.

---
**WHAT I DID:** read `react-loop.js:555-745` (setup, loop, termination), `config.js:307-311`, both system prompts in `mercury.config.json`; read `doctrine-review.js:1-238`, `ask.js:938-1084` (three call sites and the three seat gates), `reviewer-panel.js:70-95`, `run-ledger.js` receipt fields, `adversarial-review.js:854`; wrote the change from those lines.
**WHAT I DID NOT DO:** read the recheck prompt builder in `ask.js` (item 6 tells the executor to cite it), the bridge tests, `llm-client.js:392-396` authority assignment, or the claude-bridge gate.
**WHAT I ASSUMED:** the Sept 7 ledger lines 17 and 20 are replayable as written; the executor confirms before using them as the proof runs.
