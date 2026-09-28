# Sourcegraph Deep Search — finish the Stop 1 configuration migration

Prepared for Trey on 2026-09-28. This is a research dispatch, not implementation, runtime acceptance, or permission to operate the bot.

## Use

Select `github.com/CGP-ME/OGZPMLV2` in Sourcegraph and use the primary prompt below. Resolve `astra-era` to one full commit SHA for the investigation. Do not assume the instance has ingested a push, or that an `@` repository mention alone selects the intended branch. Confirm the revision in the returned sources.

The primary prompt is one ask. The nine follow-ups at the end are available for unresolved areas; they are not nine mandatory prerequisites or a request to repeat the investigation. Keep the same frozen revision and reuse the previous answer's sources. If production changes between asks, identify the exact changed paths before carrying conclusions forward.

Sourcegraph documents repository/file mentions, search scopes, source citations, downloadable structured results, and reuse of prior investigations. Its documented Deep Search analysis tools are read-only and do not execute repository code. Local OGZ instructions also contain a claim about VPS filesystem access: establish what this particular integration actually exposes instead of assuming either access or absence. [Sourcegraph Deep Search documentation](https://sourcegraph.com/docs/deep-search).

## Primary prompt — paste this

```text
Investigate github.com/CGP-ME/OGZPMLV2 on astra-era. I am Trey, the owner. I need the exact remaining implementation work to FINISH STOP 1: the two-file configuration migration and the complete customer/UI-facing configuration contract. I do not need another general repository audit, a new architecture, or a retelling of prior agents' reports.

THE OUTCOME

Customer-adjustable behavior belongs in config/settings.json; implementation constants belong in config/internals.json. Credentials and genuine process bootstrap stay at their appropriate existing bootstrap owner; balances, restored positions, generated keys, learned data and journals remain state, not settings. Verify the current files and applicable rulings rather than assuming those ownership targets are already delivered.

Every retained setting must reach its real consumer, with explicit source, units, scope and activation timing. No silent fallback, shadow configuration, override, ignored setting, dead UI control, or stale retained instance. A legitimate explicitly selected profile is not automatically an illicit override: show who selects it, its declared precedence, and whether it silently defeats the intended owner. Preserve zero and false when valid. Do not invent defaults, bounds, policies or fields to make a schema look complete.

FIRST ESTABLISH THE SOURCE BOUNDARY

Resolve astra-era to an exact SHA and use that revision consistently. State whether you can read the indexed Git tree, historical revisions, or separately supplied VPS material. A path in a document is not proof you can read that path. Name missing or truncated inputs and continue useful work on accessible source. Never fill gaps with imagined files or say a negative search proves absence outside its scope.

The last checked implementation commit before this dispatch was 510a51ae0741661256ddc6f31b3fef652a20cadb. The later 7ad5428387f1b649274b36f874f1cc462662c5d0 handoff was documentation. These are historical anchors, not a claim about today's branch tip or running process. The VPS has additional mixed dirty implementation; do not mistake it for published source or endorse it from a handoff description.

READ THE ACTUAL REQUIREMENTS AND EXISTING MAP

1. AGENTS.md; ogz-meta/AGENTS.md; ogz-meta/Alignment/README.md; ogz-meta/Alignment/TREY-DOCTRINE-FABLE-LANE.md; ogz-meta/Alignment/TREY-RULINGS.md. Read the relevant master alignment. Reconcile conflicts explicitly, using my current instructions and later verbatim rulings over older agent-authored plans.
2. ogz-meta/inbox/astra/OGZ-WALK-SPEC-2026-09-03-TREY-VERBATIM.md, especially Part A, and ogz-meta/inbox/astra/OGZ-HANDOFF-2026-09-02-FABLE-WALK.md. The uploaded original walk is an earlier version: compare the later additions in ogz-meta/inbox/fable/2026-09-09/OGZ-WALK-SPEC-2026-09-03-TREY-VERBATIM.md. Do not silently omit later verbatim rulings or elevate Part B notes into my words. Historical boot queues are not current authorization or new prerequisites.
3. ogz-meta/inbox/astra/STOP1-CONFIG-EVIDENCE.csv. This is the existing 3,277-row reading map, NOT 3,277 proven defects or required edits. Retain its row_id associations. Its candidate references and old proposed owners must be checked against the frozen implementation; do not regenerate the census or accept it wholesale. Read it as CSV with quoted cells, not one row per physical newline. If a size/search limit prevents full access, disclose that and use available file-read/structured-analysis tools; do not silently sample it and claim complete reconciliation.
4. ogz-meta/inbox/codex/2026-09-26/stop1-config-connections/FINDINGS.md and ogz-meta/inbox/codex/2026-09-26/stop1-ui-settings/UI-CONTRACT.md. These are incremental records, not final acceptance. Resolve older open entries against later entries and source; do not report a superseded item as still open just because it occurs earlier in the file.
5. ogz-meta/inbox/codex/2026-09-28/stop1-sizing/HANDOFF.md and STATE.json for the published/local distinction. Inspect other inbox/Astra trace documents only as needed to locate an affected source chain. Prior assistant claims, including this handoff, are leads rather than proof.

CURRENT SCOPE AND CONSTRAINTS

- This is Stop 1, not the withdrawn J-series. Do not reinstate J1-J8, redesign confidence, build pattern learning/TrAI, or finish all later walk stops first. Configuration connections into those areas remain in scope; their broader behavior redesign does not.
- Later walk direction controls: one trade per asset, multiple assets with different directions across assets, native broker candles, no revival of live local aggregation/TFE, paper on launch. Preserve the later explicit daily-loss ruling rather than reinstating obsolete blanket loss rules.
- Fix internal producers. Do not propose new global stops, fail-closed wrappers, runtime gates, reservation frameworks, knobs or control planes as a substitute for repairing the configuration path. Distinguish existing authentication/access-control boundaries and legitimate request validation from unwanted trading shutdown authority; do not blanket-remove security checks.
- No credentials, private auth state, raw private transcripts, broker actions, PM2 operations, indexing, writes, commits, deletions, rollback or deployment. This is a source investigation. Do not assume Sourcegraph can invoke Mercury or Serena. Use available Sourcegraph search/navigation/history tools and leave actual Mercury review and consumer execution to the builder.
- Do not adopt the floating implementation just because it exists or something calls it. Unknown provenance is not authorization to retain or delete behavior.

METHOD

Follow declaration -> selected source/profile -> initialization -> actual caller -> receiving instance -> effective consuming operation. Follow later save/reload/restore paths too. Enumerate the relevant alternative owners/callers before deciding; a first plausible match is only a lead. Compare the candidates, explain which control the actual route and why the others do not. Include dynamic/whole-object access and factory-created or per-symbol instances; do not equate an import with construction or an accepted save with an effective change.

Examine all retained Stop 1 configuration families, including loader/bootstrap ordering, services, broker/symbol/session identity, strategy settings, sizing/fees, entry-owned exits, pattern/PID settings and persistence identity, and backtest/sweep input-output consumers. Use the CSV and current source to locate them. A later-stop policy defect should be named separately, not silently turned into a new configuration prerequisite.

C009/C010/C011/C015/C018 in FINDINGS.md are useful starting leads: restored exit provenance, competing exit overlays, disabled flags bypassed by another owner, advertised controls with no operative receiver, and sizing source/cap connections. Verify whether each survives at your frozen SHA. In sizing distinguish normal size, boosted ceiling, aggregate exposure, and share rounding; a per-order cap does not prove the account total. These examples are not the complete scope.

DELIVER ONE IMPLEMENTATION-READY RESULT

A. Remaining-change table, grouped by coherent behavior rather than filename. For each group give existing CSV/finding IDs; intended owner; current producer/caller/consumer with frozen file:line links; exact divergence; minimum before/after change; all dependent call sites that must move together; and the concrete consuming operation that would demonstrate the correction. Separate already connected, incomplete, obsolete/dormant, and genuinely undecidable items. Do not turn every historical row into work.

B. The complete proposed UI-facing contract, reconciled against actual backend routes: JSON path, type, unit, source-supported value/bounds, owner/profile/symbol/trade scope, read/save message or endpoint, actual receiver, and when the change takes effect. Distinguish new-trade defaults from editing one open trade's stop; preserve entry-owned settings for existing trades. Mark each control implemented, needs wiring, intentionally read-only, or unresolved. Give the concrete JSON shape and request/response examples using nonsecret source-supported values. Do not call this contract final or shipping-ready while named receiver/ownership gaps remain. Do not guess financial settings.

C. A dependency-ordered atomic delivery sequence for the remaining work, UI-facing changes first where dependencies permit. Each item must identify one logical change, its exact paths/symbols, prerequisite, and direct acceptance observation. Keep required producer/consumer edits together; separate independent behaviors. No mega-commit and no arbitrary file-by-file splitting. Give the next THREE specific changes the builder can execute without reopening the whole investigation.

D. For each changed family, specify the relevant input and identity, expected consumer result, and exact evidence still needed from the VPS. Distinguish source proof from executed observation. Tests, green counts, a model PASS, or a configuration print alone are not delivery. Do not claim actual running behavior you did not observe.

E. A compact coverage/uncertainty statement: what you enumerated, what you read/traced, and named omissions. Only give counts with explicit denominators. Existing receipts can be reused when their exact source/input identity matches; don't request a second audit merely to recertify prose. Preserve unresolved finding IDs in a machine-readable continuation table if useful, not another replacement specification.

Lead with the remaining work and UI contract. Support consequential claims with exact source. If history is necessary to explain a removed helper or new restriction, examine the introducing/removing diff and its callers; do not restore old code by name. End with only decisions that genuinely require my ruling. No generic recommendations, no fabricated certainty, no request for context already supplied here.
```

## Optional asks 2–10

Use only when the primary answer leaves the named area unresolved. Prefix each with the previous investigation URL or available Sourcegraph continuation reference and the frozen SHA. Require corrections to earlier conclusions to be explicit. The final synthesis should reuse collected evidence instead of repeating all searches.

2. **UI contract closure:** Finish section B for every retained customer control. Trace the existing read/save receiver and effective consumer, including individual open-trade stop edits. Return the concrete schema, message examples, activation timing and exact remaining wiring; no new UI control plane.
3. **Single-owner resolution:** Trace retained inputs through loader APIs, imports, snapshots, caching, profiles, overrides and reload. Name every operative competing source, distinguish legitimate selection from silent override, and give the minimal owner/consumer changes for settings.json and internals.json.
4. **Strategy delivery and stale instances:** Trace registration switches, per-symbol factories, retained instances, changed periods/thresholds, derived indicators and entry-owned settings. Verify prior delivered slices without blindly rerunning their research; report only surviving or newly exposed configuration gaps.
5. **Sizing, fees and units:** Resolve C018 against current source, including base versus maximum, dynamic boost, aggregate booked exposure, existing scheduling/booking, rounding/minShares and fee owners. Show source-derived counterexamples and the smallest producer/consumer correction, without inventing reservation or shutdown architecture.
6. **Exit ownership and open trades:** Resolve C009/C010/C011/C015, false versus absent flags, restored-contract provenance, global overlays, and the separate open-trade edit route. Distinguish a config wiring fix from a new exit strategy. Never backfill an old trade's unknown entry settings with current defaults.
7. **Entrypoints and service inputs:** Follow the actual declared apps and direct entrypoints, bootstrap/import ordering, applicable credentials as names only, ports, broker/symbol/session identity and mode display. Identify omitted or double-resolved inputs; no new hydration framework, irrelevant credential prerequisites or runtime activation.
8. **Persistence, patterns, backtests and sweeps:** Trace only configuration ownership/delivery: fresh seed versus restored balances, bank/data/output identity, PID/pattern settings, worker inputs, recorded result identity and harvest readers. Name later-stop behavior work separately. Do not redesign learning or build another backtest engine.
9. **Doctrine violations in the migration diff:** Locate the actual introducing commits and reached callers for added guards, throws, implicit defaults, silent overrides and new authority affecting Stop 1. Distinguish request validation and security boundaries from bot-wide blocking. Return evidence-backed correction candidates, not a blind deletion list or a review of every unrelated historical subsystem.
10. **Join the answers into the finish sequence:** Reconcile the preceding results at the same SHA, remove duplicates/superseded findings, join the existing IDs, expose contradictory recommendations, and produce one remaining-change table plus the proposed UI contract and next three atomic changes. State which exact consumer receipts would close Stop 1. Do not repeat the full searches or declare runtime completion.

## Input publication and limits

The three user-supplied Astra input files are published unchanged with this dispatch; they remain historical inputs, not newly authored truth. Original CSV: 3,277 rows, 15,640,086 bytes, SHA-256 `35dabed05002fe3d678bc1402d068aeb84532f03dec18b36bd63c1de8e3dfc58`. The CSV is explicitly staged despite the generic `*.csv` ignore rule; no ignore rule is changed.

The repository secret scanner flags four CSV lines (1119, 1816, 2286, 3519) through its broad burned-token-prefix pattern. Parsed-cell inspection located every match inside a typed `reference_id` in historical/environment candidate metadata, not a credential field or assignment. These findings are individually adjudicated metadata false positives, not a scanner PASS. Known current credential-value comparisons and separate vendor-token/private-key/DSN patterns found no matches. No scanner, hook or security policy was weakened. This check is a bounded publication review, not a universal guarantee about historical source data.

No private run archives, dirty production code, alarm drafts, database contents or credentials are included. HANDOFF.md's local-only inventory describes its earlier snapshot; publishing these three inputs changes their Git delivery status only. It does not establish Sourcegraph ingestion, repair Mercury, or complete Stop 1.

Writing follows Trey's direct tasking style while making the required outputs and non-authorizations explicit. Sourcegraph documentation informed only how the request is scoped and evidence returned, not any OGZ behavior requirement.
