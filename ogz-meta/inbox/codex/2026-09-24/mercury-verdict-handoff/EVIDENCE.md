# Evidence

Command: `node ogz-meta/inbox/codex/2026-09-24/mercury-verdict-handoff/verify-verdict.cjs`.

```json
{"passed":true,"cases":8,"recheckVerdict":"found_break","historical":11,"recoveredExplicitVerdicts":3,"missingPromptFields":[],"historicalCeilings":["UNVERIFIED"]}
```

The eight direct cases include explicit no-break/break/cannot-verify, prose-only, missing blocking, unknown verdict, unfinished loop and previously parsed results. All preserve answer bytes and have no fabricated evidence approval. The actual recheck producer forwards an explicit found_break. All 13 required prompt labels are present.

Replayed 11 recorded Mercury answers from September 19, 20 and the last September 23 landing review. Three formerly no_claim outputs contain explicit verdict fields recovered by the existing parser. All 11 remain UNVERIFIED with existing evidence rules. `verdict-receipt.json` gives exact source receipt lines, run IDs, answer/line hashes, absences and source-code hashes. Existing raw receipts remain untouched. No new provider tapes exist for this diagnostic.

Syntax/diff checks completed without errors. No Jest, provider call, indexing, DB write, bot execution, PM2, broker action or deployment. Saved-response replay is not a new successful full-chain run, model coverage proof or cold-pull acceptance.
