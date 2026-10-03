# Restart handoff — halt-producer repair lane

Trey requested this stopping point before restarting his computer. Resume this lane; do not take over Stop 1, Mercury repair, or frontend settings. This is an explicitly requested handoff, not a return to mandatory receipt packets.

## Authority and latest decisions

Read current AGENTS.md, ogz-meta/AGENTS.md, Alignment README, TREY-DOCTRINE-FABLE-LANE.md and TREY-RULINGS.md. Latest direct instructions control older conflicting automatic-flatten/quarantine language.

- Fix upstream producers through Fourth Shape. Do not add automatic bot/trade halts, shutdowns, flattening, quarantine, fabricated defaults or warn-only swallowing. Do not merely delete protection around an unfixed producer. Preserve evidence; bring irreducible external behavior to Trey.
- Trey authorized implementation after the investigation: “hammer down”, “commit each one separate”, “GO FOR IT”, and explicitly emphasized preserving his rulings and other agents' work. Each logical producer/consumer repair gets its own verified, reviewed atomic commit and push. No PM2 restart or runtime activation is authorized.
- **Latest account-ownership ruling:** after discussing a webhook exit checked against an unrelated Alpaca price-feed account, Trey said: “yes it should absolutely check the account tht it sent the payment from”. This is NOT approval of the earlier proposed shortcut to settle solely from a webhook fill without checking the executing account. Verify against the actual account/venue that handled the order. If the correct account cannot be checked, retain explicit unverified status and report it; do not substitute another account, infer flatness, automatically halt, or send an additional sale. This interpretation was stated back to Trey, who replied “good”. No implementation of this ownership change has been made yet.
- Ruling 15 (2026-10-03) replaces mandatory accountability packets with one detailed CHANGELOG.md entry per logical change: problem, changes, verification, review findings/resolution, limitations and runtime status. Preserve existing receipts; link supporting evidence when useful. No duplicate MISSION/WORK/EVIDENCE/REVIEW/INHERITED forms, bulk tape commits or dual-hash inventories required.
- Do not broadly pause other agents. An earlier staging/review hold was too broad; Trey objected. Coordinate only overlapping edits and shared-index commit operations. Other implementation, tests and independent reviews continue.

## Delivered fixes

1. **925415e72e925900294ecfa2627ea441669fb16a** — Remove obsolete balance dependency from exit evaluation. Removed two initialBalance assertions and unused accountBalance/initialBalance context reads in TradingLoop timer/candle exits. No replacement defaults or accounting/sizing changes. Two new actual TradingLoop regression tests pass on working and exact staged source; both fail on pre-change source. Broader trace suite has the same 31 failing test names and 17 passes before/after (inherited fixtures, not repaired). Mercury no_break_found, run 2026-10-03T01-07-19-862Z-ef41c53bb73c. Reviewer covered production/changelog, not the new test file; do not adopt its exhaustive-coverage wording. Pushed and remote SHA confirmed at delivery.
   Supporting receipts: ../exit-balance/. Earlier real ECM eight-outcome-family proof: ../../2026-10-02/halt-producer-audit/.

2. **58d7de72b9f59c8b887a3b85e0734b247fb88fee** — Preserve Alpaca pre-dispatch failure receipts. Alpaca records whether request construction reached axios.post; router preserves explicit false instead of marking every error attempted/unknown. Keeps post-dispatch and unclassified-adapter uncertainty unchanged. Retains error code/status, not raw Axios config/credentials. Nineteen focused tests pass; five regressions fail on original code, two controls pass. Includes actual extracted OrderExecutor catch showing unsent errors produce failure evidence without requesting broker reconciliation halt. Synthetic invalid direct quantity input does not prove healthy executor plans emit it.
   Initial Mercury found_break alleged unclassified errors becoming true; that was baseline behavior. Focused recheck compared both sources and returned no_break_found, run 2026-10-03T06-41-39-723Z-13289a7c4c28. Recheck's final prose incorrectly said unclassified errors remain false; actual cited code and tests establish they remain true. Changelog explicitly rejects that prose claim. Production/test bytes remained identical to reviewed candidate despite independent harness/doctrine commits and expanded changelog. Pushed; remote SHA confirmed equal.
   Supporting receipts: ../submission-stage/. Detailed primary record: CHANGELOG.md.

No runtime activation, real orders, customer-state mutations, process interruption or deployment performed by this lane. Both changes preserved inherited dirty work.

## Current repository and coordination

At handoff preparation: branch astra-era, HEAD 58d7de72b9f59c8b887a3b85e0734b247fb88fee; shared index empty. A handoff-only commit follows this capture. Recheck live HEAD/index/status before resuming: other agents may advance them.

Large unrelated tracked and untracked work remains. Especially OrderExecutor, StateManager, TradingLoop, runner, config, strategies, dashboard and harness files are dirty. Do not reset, stash, stage wholesale, or claim these edits. No worktrees or branch changes. The only outstanding work from this lane is local supporting evidence and the next investigation; the two authored production changes are already committed.

Shared coordination notice: ogz-meta/inbox/codex/2026-10-03/staging-coordination/WINDOW.md. Slice 02 is released; no index reservation or active provider review from this lane. Stop 1 owns configuration, Mercury owner owns harness, frontend owner owns dashboard settings. The other sessions are not reachable through this thread's collaboration agent list. The frontend notice says Trey selected Mercury + Astra and benched Kimi for its review; read current applicable selection before a new review, do not infer blanket permission to use another provider.

## Index-refresh limitation

Refresh after the first fix completed, indexing a dirty working tree after HEAD had advanced to 0d1d3445; not an immutable index of only 925415e7. Refresh after 58d7de72 failed: embedding provider returned credit_balance_exhausted, and indexer refused to write a partial index. Do not claim fresh Mercury index context. Failure receipt: ../submission-stage/private/post-push-index.log. Do not purchase credits or silently switch providers. This is an embedding-index failure, not proof that every review provider is unavailable.

## Investigation and next concrete work

Original assignment: ogz-meta/inbox/codex/2026-10-02/halt-producer-investigation-handoff/HANDOFF.md. Its investigation-only restriction was later superseded by Trey's implementation authorization above; its scope/other-agent ownership remains relevant.

Complete starting census: ogz-meta/inbox/codex-third/2026-10-02/halt-producer-audit/CENSUS.md. Seven halt codes; 44 concrete trigger groups plus one defensive fallback. PROPOSED-FIXES.md has eight dependency-ordered designs and the original six broad questions. Those questions were premature bundles of internal defects and external cases, not six unresolved permissions to seek again. Current user account-ownership ruling above supersedes the outstanding webhook-settlement question. Original 26 isolated probes passed; no full-runtime/broker claim.

Remaining repair scope is OPEN, not complete: order/intents and truthful broker reads; owner/direction/quantity matching; state/exposure persistence; credential heuristic scope/recovery; cutoff truth/recovery; autopsy persistence coupling. Do not mark all six categories resolved by the two delivered commits.

Next investigation started with OrderExecutor._verifyWebhookFullExitBrokerFlat and its two SELL/COVER callers. It follows brokerFillConfirmed from _extractWebhookFillProof but reads positions via brokerId/OrderRouter, even when executionRoute/executionVenue identifies SignalStack/TTP while Alpaca supplies market data. Trace actual account ownership through entry record, pending intent, outgoing order, confirmation and position reader before changing behavior. Fix the producer/consumer chain against Trey's actual-account requirement; do not merely delete the check, flatten an unrelated position or declare account-wide flatness from one trade's fill.

Additional actual-method fixture in ../webhook-ownership/probe.cjs and producer-probe.json demonstrates:
- filledQuantity:true becomes a positive fill proof of 1;
- filledQuantity:null shadows later filledQty:"2", producing no fill proof;
- position size:null shadows qty:"2", reports zero and is neither matched nor classified unparseable.
These are synthetic payload reproductions, not observed broker incidents. No parser/ownership production changes have been applied. The source hash is in producer-probe.json; reread current code because concurrent inherited changes have moved line numbers.

Quantity repair must distinguish missing fields, legitimate numeric zero, malformed/non-numeric values, conflicting aliases and actual quantities. Do not manufacture zero, skip contradictions silently, or turn an unknown venue into a guessed owner. Producer fixes must not accidentally feed an existing unauthorized automatic flatten/halt path without resolving that ownership/behavior chain.

## Resume sequence

1. Recheck live branch, HEAD, shared index, dirty work and coordination notice; read current rulings.
2. Confirm both delivered commits remain in history. No redo or broad test reruns absent source changes.
3. Continue actual-account ownership trace and typed-quantity proof. Preserve other agents' OrderExecutor/StateManager edits.
4. Implement one complete logical producer/consumer repair at a time; actual behavior verification and honest adversarial review before atomic delivery. Use max-tokens 7750, no invented iteration cap; record exact candidate/harness identity when needed. Do not make static review claims stronger than its actual evidence.
5. Use detailed changelog entry and minimal supporting receipts. Show scoped diff; stage only this lane's hunks; check final index ownership before commit/push. No PM2 actions.
