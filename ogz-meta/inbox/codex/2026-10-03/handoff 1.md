# handoff 1 — Stop 1 configuration migration

## 2026-10-05 low-usage continuation — resume here

Source-based remaining-work inventory is now in CHANGELOG under “Codex 1: source-based Stop 1 remaining-work inventory”, with full schema census at ogz-meta/inbox/codex/2026-10-05/stop1-inventory/source-census.json. Base c18d9f67: 106 committed editable fields, 122 working (16 switches uncommitted), 1,874 structural settings leaves including profile duplicates. Do NOT treat these as bug counts. Queue UI-01 through ACCEPT-01 and group coverage table are in that entry. Consumer/customer classification for all leaves is still incomplete; do not claim inventory closure.

First delivery: switches plus their continuity correction together, then NoWick, RSI/Donchian replacement handling, sizing and remaining customer groups. Per-trade editing remains working-only; coordinate owner. Historical global loss-cooldown finding is stale (HEAD already retires saved bookkeeping); MA pullbackCooldown is different. Sourcegraph is not a dependency. No production change was made in this inventory turn. Preserve unrelated dirty work and use actual review before atomic commit/push.

## 2026-10-04 usage-limit handoff — Codex 1 (current authority over older status below)

User requests this handoff because usage is nearly exhausted. Resume UI-bound Stop 1 migration, not frontend or Mercury repair. One logical change, actual behavior check, clean adversarial review, scoped changelog, atomic commit and push. No new packets, defaults, trading halts, PM2 restart or worktrees. Preserve all other agents' dirty work.

### Delivered

- EMA retest five confidence controls: 3e6268136de74271fdd82a01ec5b4019106c5c28, pushed.
- PropSafe six confidence controls: e627211cecdc71056a8c9c75cf2cfc21a88538c5, pushed and remote SHA confirmed. Actual in-memory publication/retained module checks rejected 84 malformed publications and production-profile rerun passed. Mercury final no_break_found run 2026-10-04T14-32-00-044Z-df5b37202b5e; Astra corrected-candidate no_break_found, verified model identity. Details in committed CHANGELOG. Its initial null-coercion break was fixed; Mercury's mistaken partial-profile allegations were refuted, not adopted.
- Prior confluence-veto removal 5c598f27 and regime getter a65cc75f already pushed; do not reapply.
- Last observed HEAD d425c7f635c93de4d0c5302715c5bfa90554d61e includes another agent's exit-reason fix. External agents can advance HEAD; always inspect.

### EMA correction — subsequently delivered before handoff

Delivered as 0109886e and pushed. The production diff was only foundation/ConfigLoader.js: EMA confidence type-domain correction, three added lines/one changed line. Reviewed candidate 938d8da837e0439664cf7ea70a63aaad847416e2, base e627211cecdc71056a8c9c75cf2cfc21a88538c5. Exact staged source compared byte-for-byte to proof candidate. Folder ogz-meta/inbox/codex/2026-10-04/ema-confidence-input-domain/. change.patch isolates it; working loader contains other changes, never stage whole file.

Baseline accepted 32/45 malformed attempts; correction rejects null/boolean/array/object/blank before coercion while preserving numeric strings. Actual in-memory loader and retained module proof passed with 71 rejected publications. Synthetic signal context, not full broker/runtime proof. Mercury completed no_break_found in private-review-result.json; full answer read, static-only review explicitly stated. Independent Astra completed no_break_found with verified provider model identity in private-astra-result.json; full answer read. Both reviewer sessions completed. Both static reviews; host behavior proof was separate. Committed and pushed as 0109886e before this handoff.

### Prepared next legs (uncommitted)

1. Sixteen strategy switches: original patch ogz-meta/inbox/retire-unused-confidence/2026-10-03/pipeline-toggles/head-change.patch is applied WORKING only. Original candidate 32e6c80cbf14eac555ced9014fe4fd26591bc6ec got Mercury clearance but Astra found disabled TPO history discontinuity. Never ship original alone.
2. Continuity correction: ogz-meta/inbox/codex/2026-10-04/tpo-toggle-continuity/change.patch (nine files), applied WORKING only. Eight stateful built-ins observe while entries disabled; entries and consumption remain disabled. Actual orchestrator dispatch, TPO per-symbol histories, seven-module active parity, targeted ORB/liquidity/NoWick emission checks passed. Needs composed exact candidate and fresh Mercury/Astra review with original switch change. Root removed one trailing whitespace in working OgzTpoIntegration; patch may still contain it. Preserve other dirty edits. No full broker proof.
3. NoWick one confidence control: ogz-meta/inbox/codex/2026-10-04/nowick-confidence/change.patch prepared, not applied. Existing live-provider correction plus UI exposure. Use delivery.patch (not older change.patch) composed AFTER continuity. delivery-proof.cjs/delivery-proof.json pass: zero provider reads during observation, one per active evaluation, primary/twin confidence and 18 malformed rejections. Module/orchestrator baseline is current dirty continuity source; loader baseline d425c7f. Reconcile later EMA correction when applying; never replace the whole loader.
4. RSI replacement validation: ogz-meta/inbox/ui-config-ahead/2026-10-04/rsi-confidence/change.patch prepared, not applied. Four already-live/UI fields, actual forced-publication gap; proof 46 invalid cases plus confidence .6 -> .5 -> .3. Preserve existing domains, no invented ceiling relation. Needs review/delivery.
5. Donchian publication: ogz-meta/inbox/ui-config-ahead/2026-10-04/donchian-publication/change.patch prepared against e627211c, not applied. Five UI controls already wired; four numeric forced-reload checks prevent invalid published values reaching existing consumer throws. Real indicators/retained module/in-memory loader proof: 52 invalid cases rejected. Preserve current fractional trail-channel forced-load domain; UI has stricter integer rule. Startup/non-numeric structural validation not covered. Needs review/delivery.

Agents next_ui_controls, toggle_tpo_continuity and ui_config_ahead have prepared bounded legs; do not assume their work is committed. Older sizing/unused-confidence leftovers below remain pending, not current UI-first delivery.

### Review and source discipline

Root used qualified Mercury harness tree a5ecf975923c1c024ee98adf849016181dd6e482 via ogz-meta/inbox/codex/2026-09-29/mercury-source-identity/fixtures/candidate-loader.cjs. Working Mercury harness belongs to Codex 2; do not alter it. Config pointer: ogz-meta/inbox/retire-unused-confidence/2026-10-03/pipeline-toggles/private-mercury.config.json. maxTokens 7750, no iteration cap; staged reviewRef plus current reviewBase. Keep full private result receipts. No fresh index claim: indexing previously had credit problems.

Astra adapter: ogz-meta/inbox/codex/2026-10-02/stop1-min-strategy-confidence/private/astra-adapter.cjs, CodexChallengerClient model gpt-6-astra. Verify metadata.identityPosture and read whole verdict. User assigned external Codex 4 frontend and Codex 2 Mercury; do not absorb those scopes.

Staging coordination: ogz-meta/inbox/codex/2026-10-03/staging-coordination/WINDOW.md. EMA correction has landed; shared index was cleared by its atomic commit. Preserve all working changes and recheck other agents before staging. Detailed CHANGELOG is primary record. No deployment or PM2 restart occurred. Stop 1 is NOT complete; no authoritative remaining-count census was done this turn.

---

## Delivery update after stopping-point capture

The two reviewed changes below are now committed and pushed: confluence veto removal `5c598f27fc7631197d9d798702ba8f4c9d851a7c`, then regime-settings connection `a65cc75fc136791377a89d0d9369f1dba1328db2`. Remote astra-era was confirmed at the latter SHA. Their detailed entries are committed in CHANGELOG.md. Do not reapply or recommit them. Next production task is adversarial review and delivery of the sixteen-switch migration, followed by the unfinished confidence/sizing legs. Earlier “not committed” labels below describe the original capture, superseded by this update. Runtime remains unactivated; no fresh Mercury index claim is made.

Trey requested this stopping point to restart his computer. Resume Stop 1 directly; do not restart a broad audit, rebuild review machinery, or take over frontend/Mercury work.

## Authority and workflow

- Workspace `/opt/ogzprime/OGZPMLV2`, branch `astra-era`. No worktrees, branch switches, PM2 restarts or runtime activation.
- Read live AGENTS instructions and Alignment, especially Trey Doctrine and Trey Rulings. Latest explicit user instruction: pick configuration → blast radius → verify declaration/init/callers/consumers → migrate → adversarial review → one logical commit → push. Preserve unrelated dirty work.
- Ruling 15 replaces mandatory evidence packets with a detailed CHANGELOG entry. Supporting receipts stay in existing inbox folders. Do not assemble new five-document packets.
- No new trading gates, throws, defaults, silent overrides or shutdown behavior. Fix producers. Multiple strategies agreeing boosts confluence; lack of agreement must never veto an independently qualified winner.
- User explicitly requested parallel small legs. Root owns integration/review/delivery. Do not assign frontend or Mercury repair to this lane.

## Verified Git and stopping state

At capture, HEAD and local origin/astra-era both `9fb3cd2ce7d7db4379be6f072ea4aa4e6730d322`. Other agents are still finishing handoffs; verify current HEAD and index before any action.

Recent landed changes include `e9faed63` live individual-strategy confidence, `0d1d3445` candle-pattern confidence settings API, `925415e7` obsolete exit-balance dependency removal, `aef7969d` Astra challenger integration, `1a9b0d48` recording override and `58d7de72` Alpaca pre-dispatch receipts. Those are separate owners/changes, not a claim that Stop 1 is complete.

At capture another owner had a staged rename to `ogz-meta/inbox/codex-third/2026-10-03/halt-producer-resume/handoff 3.md`. Do not commit or unstage another owner's entries. Coordination is in `staging-coordination/WINDOW.md` beside this handoff. The broker change previously occupying the index has now landed.

There are many inherited dirty source files and untracked receipts. Do not use `git add -A`, restore the working tree from HEAD, or sweep those changes into delivery. Candidate patches below isolate the intended production edits. Working JSON revision and source contain additional inherited changes.

## 1. Confluence entry-veto removal — reviewed, not committed

Folder: `ogz-meta/inbox/codex/2026-10-03/stop1-retire-confluence-veto/`.

- `change.patch` contains four production paths: StrategyOrchestrator, settings.json, runner, trade-validator. Removes the count-based HOLD branch and retired minConfluenceCount wiring; preserves agreement counting and sizing math.
- Reviewed candidate `1065165ccd8cc622a7a9e04f82f850f12d08b92c`, base `aef7969da3ebcb16e2aa331cb7e5744fc6eb891e`.
- Qualified Mercury no_break_found: run `2026-10-03T06-24-47-887Z-a6c4290ac3af`, `private-qualified-review-result.json`, `review-qualified.log`.
- Independent Astra no_break_found, model identity verified: `private-astra-result.json`, `astra.log`.
- `behavior.json`: extracted actual decision section shows old count-two veto versus corrected solo entry; agreeing pair retains 1.5 multiplier; opposite signal supplies no boost. Not full broker/runtime proof.
- Mercury's statement of no functional impact is too broad and not adopted. Removal intentionally changes entry eligibility when the retired count exceeded one. Astra could not execute its independent test due spawn permissions; do not claim it did.
- Detailed entry already prepended to working CHANGELOG and separately preserved as `changelog-entry.txt`. Stage only that entry, not other owners' working changelog entries.

NEXT: once index is free, apply only this patch to index, add only its changelog entry, compare the four production blobs to reviewed candidate, show diff, required scan/checks, atomic commit and push. Reconcile any intervening overlapping changes rather than blindly applying. No additional narrative packet needed.

## 2. Regime configuration consumer — reviewed, not committed

Folder: `ogz-meta/inbox/codex/2026-10-03/stop1-regime-config/`.

- `change.patch`: one runner context property changes from startup snapshot to `get regimeDetection() { return ConfigLoader.get('regimeDetection'); }`. Applied to working runner, not shared index.
- Actual TradingLoop constructor retains ctx; detector is constructed from ctx.regimeDetection on each gathering evaluation. Runner's other RegimeDetector occurrence is an import; no additional use found.
- Reviewed tree `9dd69140b7002f65c40267e3bf796e130bbab980`, base aef7969d; private `review.index` does not touch shared index.
- Mercury finished successfully, no_break_found: `2026-10-03T07-07-02-582Z-3a910afc3a25`; `private-review-result.json`, `review.log`. Process session 42021 was polled and completed exit 0.
- `behavior.json`: actual isolated ConfigLoader forced replacement minimumCandles 10→1000, retained loop/context, actual detector on same 60 candles changes trending_up→insufficient_data. Constructor/consumer statements extracted; current working dependencies used. Not full runner boot or full loop execution.
- Review mentions dashboard replacement, but this patch does NOT expose regime fields in the settings API. Do not claim dashboard editability. Verified behavior is forced configuration replacement reaching the retained consumer.

NEXT: separate detailed changelog, exact candidate comparison and separate atomic commit/push after confluence. No runtime activation.

## 3. Sixteen strategy switches — implemented/tested, review not started

Folder: `ogz-meta/inbox/retire-unused-confidence/2026-10-03/pipeline-toggles/`.

- `head-change.patch`: isolated HEAD-based two-file change (StrategyOrchestrator + ConfigLoader).
- `working-change.patch` was successfully applied to shared working files by root. Both syntax checks passed. Shared index untouched.
- `fixtures/verify.cjs`, `head-behavior.json`, `blast.json` contain actual saves and consumer verification. Retains built-in objects, distinguishes custom registrations by identity, preserves removed registrations, handles disabled solo selection without throw, refreshes aliases and scoped TPO enabled state.
- 32 accepted saves across 16 switches; correct active-profile disk owner; retained strategy projection. Custom name collision/removal/solo cases and actual two-symbol OGZTPO updates passed. Main evaluate fixture uses warmup inputs; no real trading/broker proof.
- Existing loader boolean validation was proven for 16×7 malformed states on startup, forced reload and save. Invalid replacements do not publish. Removal of redundant orchestrator type throw therefore does not silently enable malformed values through these producers. Existing loader startup/forced-load throws remain unchanged; no broader lifecycle repair claimed.
- Private review tree `c271c50355cb1e64b786fe964cec3a91020a661d`, base `1a9b0d48` (resolve full ID). Tree uses isolated candidate bytes, not inherited working changes.
- Root attempted to launch Mercury; user interrupted at approval. Checked afterward: no `review.log` exists. Do NOT claim review launched or approved. Resume with qualified harness below.

NEXT: adversarial review, resolve findings, then scoped changelog and atomic delivery. Do not bundle with confluence or regime change.

## 4. Unused confidence declarations — prepared, not reviewed

Folder `ogz-meta/inbox/codex/2026-10-03/stop1-unused-confidence/`.

Working source/config no longer has regimeMinConfidence or confluenceMinScore declarations. AST evidence found writes but zero reads; history traces removal of their consumers. Agent verified actual loader/orchestrator construction. Existing per-field patches chain after confluence candidate; confluenceMinScore.patch must be updated to remove the now-orphaned historical comment as working source already does. JSON revisions in patches are deliberate isolated increments; do not stage the whole dirty JSON.

NEXT: scoped review and separate logical delivery; no claim these are migrated runtime controls when their consumers are retired.

## 5. Base/boosted sizing — isolated correction still needs completion/review

Folder `ogz-meta/inbox/codex/2026-10-03/stop1-base-boosted-sizing/`.

Agent's latest `change.patch` contains OrderExecutor and ConfigLoader. Separates basePositionSize from maxPositionSize, preserves maximum through confluence/share normalization, labels share-bound receipts correctly, validates replacements through existing settings publication paths. Root's earlier sizing edits are in working OrderExecutor; the agent's later publication/receipt changes remain isolated and need careful integration.

Proof: 24 share-plan cases, eight independent sizing cases, six cap-attribution cases, sixteen malformed forced replacements with prior-owner retention. See behavior.json, publication-behavior.json, ceiling-reasons-behavior.json. saveSettings validation implemented but not yet exercised end-to-end. Initial malformed-file startup handling remains unchanged. No new startup throw/default/halt added. Do not claim complete producer closure without resolving these limits.

Isolated candidate deliberately preserves committed currentBalance denominator and excludes inherited aggregate/equity/slippage changes. Do not sweep working OrderExecutor into this commit. No Mercury approval yet.

## Mercury invocation facts

Qualified immutable harness used successfully by this lane: `a5ecf975923c1c024ee98adf849016181dd6e482`. Load through existing `ogz-meta/inbox/codex/2026-09-29/mercury-source-identity/fixtures/candidate-loader.cjs` with MERCURY_HARNESS_TREE. Snapshot mercury.config.json from that tree. MERCURY_RUN_LEDGER_DIR must be repo-relative. Use exact reviewRef/reviewBase, maxTokens 7750, no iteration ceiling, focused adversarial framing. These successful runs used Mercury explicitly; confluence additionally has independent Astra review.

The committed aef7969d challenger integration excludes inherited dirty transport changes; it is not identical to the qualified harness. An earlier confluence attempt against it repeatedly failed and was interrupted. Do not treat that attempt as approval or start another Mercury repair in this Stop 1 lane. Preserve failed receipts.

## Resume priorities

1. Verify shared index ownership and current HEAD; deliver already-reviewed confluence correction.
2. Deliver reviewed regime consumer connection separately.
3. Run the sixteen-switch migration through adversarial review and land it.
4. Finish remaining prepared config legs and continue the actual Stop 1 inventory. The user's earlier numeric remaining count was not independently reconciled; don't invent a completion percentage.

This stopping point does not activate runtime or claim Stop 1 complete. Supporting private receipts and patches remain on the VPS; restarting the user's computer does not itself alter them.
