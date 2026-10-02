# Third Codex: halt-producer investigation only

Dispatcher: Trey, 2026-10-02. Root remains responsible for finishing Stop 1.
The second Astra owns Mercury repair and Astra-seat integration. This third
lane owns only the investigation below. Do not take over RSI2, configuration
migrations, Mercury, receipt retention, or general repo cleanup.

## Operator ruling

Trey: "the oness that violate the doctrine we need to clean up we dont want any shit traveling forwqard into the final state"

Trey: "no surpirses"

Trey: "remember we dont ever want to halt the bot or trades or shut anything down we want to fourth shape it and then if not we will discuss it"

Fix internal producers first. A remaining external uncertainty does not grant
automatic permission to halt, flatten, quarantine, substitute defaults, or
shut anything down. Bring the concrete unresolved behavior to Trey. Do not
replace a catch with warn-only swallowing, remove evidence, or simply delete
protection around an unfixed producer. Existing code's “authorized” label is
not evidence of Trey's authorization.

## Read first and verify current state

Follow AGENTS.md, ogz-meta/AGENTS.md and ogz-meta/Alignment/README.md, including
TREY-DOCTRINE-FABLE-LANE.md and TREY-RULINGS.md. Latest direct ruling above
controls over historical assumptions. Work on astra-era; no worktrees.

At handoff HEAD is 9047fa40d350caf02c4577f796731d7b88723daa, index empty.
Recheck; two other agents may advance HEAD. Large inherited dirty changes
exist in the same files you will inspect. Capture HEAD and working hashes and
classify both; do not treat those differences as your work or as landed code.

Recent delivered Stop 1 slices:
- 4c22efe8: RSI2 confidence publication.
- 3afde60c: obsolete exit-selector removal.
- 9047fa40: symbol-loss cooldown removed across config, producer, telemetry,
  and legacy saved state. Mercury/Astra reviews covered that removal, NOT
  doctrine compliance of the seven retained halt reasons.

## Deliverable and ownership boundary

Investigation and packet-only proposed patches/proofs. No shared production
edits, staging, commits, pushes, provider calls, PM2 actions, customer state
writes, or deployment for this assignment. Root/Trey coordinate integration.
Write only ogz-meta/inbox/codex-third/2026-10-02/halt-producer-audit/.
Include MISSION, WORK, EVIDENCE, REVIEW, INHERITED and MANIFEST documents.

Deliver a complete producer/caller census, evidence-backed classifications,
root-cause fixes in dependency order, isolated behavior reproductions, and
precise remaining operator decisions. Do not create another enforcement
framework. Do not stop at the first suspicious catch. Proposals must name all
affected producers/consumers and which shared paths would need coordination.

## Scope: seven retained symbol-halt codes

Enumerate EVERY writer, reader, restore/reset path, triggering branch and
caller for these codes. Classify branches separately: external broker truth,
legacy persisted input, internal producer defect, or broad precautionary catch.
Explain whether an order was sent, whether exposure exists, and what evidence
is actually missing. Verify scope, recovery and notification behavior instead
of inferring them from names. Starting citations below are WORKING-tree lines
read by root at handoff; resolve against your captured bytes.

1. broker_order_reconciliation_required — OrderExecutor.js:137 helper;
   callers :3733,3997,4265,4650,5277,5705. Some branches follow an accepted
   broker order or unknown receipt; some follow failed internal state mutation
   after that order. Separate pre-send producer defects from post-send facts.
2. exit_rail_broker_desync — OrderExecutor.js:1385 helper, :1504 caller.
   Trace completeness, position matching, quantities, flatten attempt and
   recorded broker exposure; do not blanket-approve or remove it.
3. exit_monitor_reconciliation_required — runner :2614 catches every
   checkExitsOnly exception and :2622 routes it to a symbol halt. It currently
   does not distinguish a programming exception from a broker failure.
4. exit_intent_reconciliation_required — OrderExecutor.js:1143 helper;
   :1200–1254 routes both unmatchable order/plan sides and aged unavailable
   reconciliation. Trace _readBrokerOpenOrdersForExit, internal plan producers,
   pending-intent persistence, broker side parsing and TTL semantics.
5. direction_integrity_exit_refusal — OrderExecutor startup persisted-intent
   path :1293–1340; StateManager._recordDirectionIntegritySymbolHalt :2052.
   StateManager :943 also invokes it for state_persistence_failed, not just
   direction faults. _quarantineActiveTrade :2128 removes active records and
   calls it at :2169. Enumerate all callers of quarantine, save failure and
   identity validation; distinguish old disk state from internally generated
   records and actual disk I/O failures. Preserve evidence of real exposure.
6. broker_unverifiable — StateManager :2282 checks configured Alpaca key
   presence/prefix against trade executionMode, :2342 records restored lanes.
   This trigger is a credential/config heuristic, not itself a broker response.
   Verify actual adapter/session ownership and recovery before classifying it.
7. ttp_cutoff_unverified_broker_flatness — TtpCutoffEnforcer :813, runner
   :2699–2778. Separate actual unverified-flatness evidence from the runner's
   catch-all interval failure route (:2559–2564). Enumerate enforce() branches.

Shared symbol entry consumer: OrderExecutor :2995–3004 inside isEntryAction;
TradingLoop :1615–1642. These line numbers are working source after cooldown
removal. Generic isTrading pause, broker auth quarantine, and other entry
checks are adjacent surfaces: record discovered connections; do not silently
expand into removing all trading restrictions. StateManager.isHalted() currently
returns false; that legacy global method is not a functioning global halt.

## Concrete internal dependency lead: investigate first

TradingLoop still throws when initialBalance is unavailable before exit
evaluation in BOTH timer and candle paths (:1120–1123, :1505–1514), and passes
accountBalance/initialBalance to ECM (:1165–1166, :1544–1545).

Root's source search found no current executable consumption of these two
context fields in ECM, StopLossChecker, MaxHoldChecker, BreakEvenManager or
ProfitExitPlanner. Commit 438637407438df8700aa20e713768e7be4aae160 removed
StopLossChecker's account-drawdown use on July 16. This is a strong lead that
an obsolete input dependency can prevent exits and reach the blanket halt.
It is NOT a completed unreachability proof. Exhaust transitive context passing,
dynamic reads, callers, history and tests before proposing removal. No return
to a fabricated $10K default. Root has not edited this code.

Other leads in that same call graph: missing symbol assertion, MED-01 exitReason
assertions, ECM currentTime assertion, explicit exit-ownership assertions,
ProfitExitPlanner validation throws, autopsy persistence failures before
executeTrade. Identify each producer; do not assume all validation is dead.

## Acceptance and limits

Count enumerated branches and disposition every one. Show actual reproduction
for each claimed defect; source-read conclusions and untested hypotheses must
be separated. Tests must demonstrate intended behavior, not merely expect an
existing throw. No full-runtime, broker or deployment claim from fixtures.

Send root a concise result with packet path, confirmed defects, safe proposed
producer fixes, and any exact decision requiring Trey. Root continues Stop 1
while this investigation runs. Do not launch paid adversarial reviews yourself.
