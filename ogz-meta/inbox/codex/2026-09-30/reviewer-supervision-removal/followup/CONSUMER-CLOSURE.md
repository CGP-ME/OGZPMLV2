# Exact candidate consumer trace

Source: tree `5ca3c369188c3841c10593d8ece061f57f21886a`, eight files hashed in CONSUMER-CLOSURE.json. This is source inspection plus previously existing mechanical proof, not fresh semantic approval. Current qualified review harness 55361b324d94f1e8ae6e07a18d4780629cc793a6 is distinct.

## Delivered source and accepted semantic records

`evidence-ingestion.js:2296-2298` defines deliveredSourceUnits from mapper requests whose receipt is not failed, including malformed model answers. That measures source delivered in successful requests, not valid claim schema or semantic agreement. `:2304-2318` uses it for source/diff ranges. Separately `:2682-2693` retains acceptedSet/finalAcceptedSet for unaccepted unit and coverage diagnostics. Neither set is undefined.

`evidence-ingestion.js:2760-2779` emits host_preloaded_shard fileReads only when every packed source unit for that artifact was delivered. `:2781-2785` derives wholeFilesRead/missingWholeFileReads from those reads. This literal wholeFilesRead property has no independent branch consumer in ask, reviewer-panel, run-ledger or doctrine-review: it travels inside coverage receipts. Doctrine independently consumes telemetry.fileReads at `doctrine-review.js:95-118`, and coverage.complete/authorityReady at `:170-175`; incompleteness adds named diagnostic absences. It does not compel another provider loop.

`run-ledger.js:864` retains sharded coverage; `:982` retains tool file_reads; `:988-1012` persists candidate coverage, claims, source receipts and citations. `ask.js:1300-1309` supplies the actual candidate and telemetry to doctrine assessment; `:1363-1387` carries them through recheck and candidate merge. These fields remain evidence, not automatic code approval.

## Answer completion and verdict ownership

`evidence-ingestion.js:2812-2819` returns structured answer when valid or literal raw output otherwise, with answer_given only for a nonfailed, nonempty final response. `reviewer-panel.js:218` recognizes nonempty answer_given as a delivered answer. `ask.js:747-754` parses explicit verdict fields; the comment expressly forbids inferring verdict from successful transport. `run-ledger.js:562-564` maps answer_given without a review verdict to cannot_verify, not pass. Panel decision and Kimi's actual words must still be inspected; a panel pass about agreement is not automatically a code-clearance statement.

Known open issue: continuation finish spreads previous then continued, so an inherited parsed classification may survive a new answer. Root confirmed this separately and assigned its producer fix. This report does not claim all receipt classifications are correct.

## Count producer

`evidence-ingestion.js:2299-2303` computes fourthShapeAdditions then fourthShapeAdditionCount from `.length`; `:2797-2800` explicitly publishes both in reportedCoverage. `explicit-continuation.js:55` reads that count and records a null absence when not supplied. The allegation that this count has no producer is not supported by this exact source. This does not treat absent external fields as zero or imply semantic agreement with every addition.

## Source-window start line producer

`explicit-continuation.js:106-126` accepts only open_file, selected-tree source_ref, valid delivered line bounds, correct numbered lines and matching known source bytes before crediting source. It offsets the numbered result by result.start_line at `:116`.

`tool-adapter.js:699-714` constructs numbered open_file output and explicitly supplies start_line, end_line and total_lines; `:1913` preserves those fields while adding the immutable review tree identity. git_show also emits start_line at `:1016-1023`, but sourceWindow does not accept git_show as current selected-source coverage. Missing start_line in an invented result is not proof the actual open_file producer omits it. An error result is rejected before source credit.

## Proof boundaries

Existing INGESTION-PROOF exercises malformed mapper/candidate/final testimony, empty/provider failure, and output diagnostics. PANEL-INGESTION-PROOF exercises actual ingestion and panel/ledger owners with fake seat reasoning; it explicitly does not exercise runAgentic orchestration or real Fable-requested routing. Exact-source React suite covers 34 behaviors. These are mechanical proofs, not substitutes for the live panel. Inherited dirty temperature/tool-adapter changes are not evidence for the immutable candidate and were not relied on here.

No production, index, runtime, provider, role or authority changes performed.
