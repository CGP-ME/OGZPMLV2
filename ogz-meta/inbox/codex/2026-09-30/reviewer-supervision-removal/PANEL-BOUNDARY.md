# Panel boundary investigation

Read-only investigation, 2026-09-30. No providers, mutations to production, staging, or Git changes. Sources: current reviewer-panel.js, adversarial-review.js, ask.js relevant callers, evidence-ingestion.js relevant phase orchestration, run-ledger.js consumers; a51b33e4 mission/work/evidence/inherited packet; Trey Doctrine and Trey Rulings. This is a bounded panel-consumer audit, not full subsystem reachability proof.

## Existing instruction

The September 26 `mercury-exit-receipt/MISSION.md` explicitly instructs removal of automatic panel/doctrine ceilings and report-format retries while preserving answers, evidence, failures, identities, disagreements, executable trust, credentials, repository access, and evidence provenance. Its EVIDENCE names malformed-evidence repair as still retained at that time. Today's instruction extends removal to the extra host response supervision; it does not erase the panel architecture.

## Keep: actual panel and receipt ownership

- reviewer-panel.js:6-12 registry, 102-174 seat selection, 230-258 selected-seat execution/absence recording.
- reviewer-panel.js:82-99 reportedPanelDecision preserves last selected reviewer's own raw verdict; absence must not become an earlier seat's pass.
- reviewer-panel.js:176-214 diagnostics currently observe evidence/identity/label differences without replacing reported verdict. These are receipt fields, not execution loops. Do not remove them as supposed watchdog tissue.
- reviewer-panel.js:44-79 identity and final-review dependency provenance: establishes whose answer Kimi actually received.
- adversarial-review.js:1172-1295 Fable stage; 1298 onward Kimi stage. These are actual reviewers, not a fourth supervisor.
- ask.js:1351-1378 Fable-triggered Mercury rechecks, and adversarial-review.js:327-391 recheck prompt construction. These implement agents checking one another. Preserve substantive reviewer-requested rechecks while removing host-imposed resubmission protocol from their runner.
- ask.js:1300-1310, 1338-1347, 1385-1395, 1429-1438 doctrine assessments are diagnostic observations. Preserve receipts rather than deleting their owner wholesale.
- Source snapshots, physical bytes, hashes, tool delivery telemetry, provider request/response/cost records, credential isolation, repository access and executable trust remain.

## Remove: host enforcement over reviewer submissions

Root owns detailed ReAct/continuation boundary. In explicit ingestion, relevant control owners are map repair loop evidence-ingestion.js:2377 onward; per-target candidate loop 2709 onward, especially rejected-inventory handling 2756-2807; final malformed retry 2909-2946. These add model calls or withhold completion based on host response schemas. Preserve the original responses and diagnostic validation results; deliver them to Fable/Kimi rather than treating them as absent.

The byte envelope remains a physical transport concern. Keeping shard transport and source receipts does not require keeping host semantic adjudication, whole-file-read mandate, or compliance retries. Never simply delete the size limit and send oversized payloads. Oversized-source continuation may remain as transport with no separate host authority over findings.

## Dangling-consumer risks

1. reviewer-panel.js:217-227 ensureReviewerAnswer rejects a nonempty answer whenever termination is not answer_given; ask.js:1298 invokes it before downstream panel metadata. An answer liberated from host rejection must propagate as an actual delivered answer, or this caller recreates rejection.
2. run-ledger.js:562 likewise maps non-answer_given termination to blocked. Preserve genuine provider/transport absence without treating a delivered nonconforming response as absent.
3. run-ledger.js:989-1017 serializes candidate-set/sharded evidence fields. Their shapes must remain truthful if mandatory candidate filing is removed. Do not claim complete inventory merely because a response exists.
4. adversarial-review.js:661 and 821-824 feed captured candidate inventory and ingestion coverage to Fable/Kimi. Keep gaps visible; raw testimony must survive parsing failures.
5. ask.js:1380-1383 merges recheck candidates; ask.js:1373 carries continuation factory. Removing candidate-only or continuation supervision must remove obsolete callbacks/arguments without removing substantive panel rechecks.
6. adversarial-review.js:455-505 legacy finalReviewDecision has fallback language `pass_pending_local_proof`; formatAdversarialReviewPacket:562 calls it but overrides reporting with panel raw verdict when panel exists (root should verify no-panel call sites). Do not mistake this legacy formatter for new review authority; do not expand scope without consumer evidence.
7. ask.js:801-803/825-827 evidenceChecksPassed feeds diagnostics and inherited evidence basis, not the reported verdict. Removing observation fields could erase receipts without removing actual retry mechanisms.

## Concrete completion proof needed

Exercise actual orchestrator with deterministic provider stubs: a malformed/partial but nonempty Mercury answer reaches Fable, then Fable's substantive recheck reaches Mercury, then Kimi receives both original and recheck testimony. Missing citations/full-file coverage become receipt observations, not extra host repair calls. Provider failure remains named and later selected seats continue. Reordered/omitted seats retain current selection semantics. Large source uses bounded transport. Confirm no automatic host submission-repair, impasse, or full-file-read path survives, and no source/identity/receipt field falsely upgrades absent evidence.
