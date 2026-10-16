# Astra addendum: provenance evidence corrections

Reviewed the bounded corrections against committed HEAD `227b2922dd9812799626b383d9bff3903d7a2bd1`. **The prior scope, role-testing, and reproduction defects are substantially corrected. One known class of actual getter omissions remains explicitly bounded below.** This is not a full re-audit or runtime-behavior acceptance.

Only read-only source/JSON inspection was performed. No production files, fixtures, generated inventories, or runtime state were changed; this addendum is the sole authored file.

## Corrections verified

- The AST census includes active ogz-meta files instead of excluding the whole tree. Its JSON contains the proof logger readers and identifies the actual unresolved `broker.id` route. That repair is a separate active lane and is not duplicated here.
- Unrenamed destructuring is recognized: `ecosystem.config.js:6` resolves `deployment.pm2`; `ogz-meta/session-form.js:39-41` resolves its three internal configuration paths. The multiline call at `ogz-meta/gates/eval-live-posture-gate.js:14` resolves the production-profile confidence path.
- The injected ConfigLoader parameter in `RuntimeConfigProof.tradingConfigValue` is captured, with its 15 local forwarding calls and two verified application callers. The former audit-question text is no longer counted as an executable getter. Compatibility property generators and non-getter APIs are separated.
- The computed trace now contains the broader actual strategy domains and ECM fields including `strategyName` and `maxHoldTimeMinutes`. Retired smoke paths are labeled historical repaired findings instead of current missing source rows. The trace explicitly defers completeness to the AST inventory and no longer claims every caller was expanded.
- README accurately describes repeated reconstruction for bot/paper and bot/production only, bot/paper cache/force checks, and one load of each other supported role. Its all-env claim is explicitly bot/paper and its all-editable claim is transport/initialization, not downstream effect proof.
- `../reproduce.py` reconstructs exact recorded git files, checks their blob identities, supplies full repository-relative fixture paths to the isolation launcher, and checks AtomicWrite's current working-file blob before launching. It does not import trading modules on the host. The corrected commands point to the actual script. This was source-inspected, not executed by this reviewer.

## Remaining actual census omission

`build-getter-ast-inventory.cjs` recognizes a ConfigLoader require only when its argument is a literal string. The declared dynamic-require limitation therefore applies to known current code, not just hypothetical reflection:

| File | Actual getter call lines omitted from AST JSON |
| --- | --- |
| `scripts/smoke-test.js` | 139, 140, 141, 160, 174, 175, 223, 240, 264 |
| `tools/strategy-parity.js` | 119, 120 |
| `tools/trade-validator.js` | 136, 139, 140, 143, 255, 297 |

These bind ConfigLoader through `require(path.join(projectRoot, 'foundation/ConfigLoader'))`, at smoke lines 138/151/172 and subsequent callbacks, strategy-parity line 113, and trade-validator line 38. All three files have zero records in the supplied AST JSON. Thus 17 identifiable actual getter call sites are outside its reported counts, including the repaired smoke exit getters that motivated part of the earlier review.

The current limitations string acknowledges dynamic require generally, so this is not a concealed promise of universal coverage. However, `unsupportedCount:0` and `computedWithoutEnumeratedLocalCaller:[]` describe only recognized bindings. They cannot close these known omissions. Preserve explicit unresolved rows for the concrete sites or add bounded recognition of this existing path.join binding shape; no runtime code change is required. The manual smoke trace provides partial context but does not replace the omitted literal and diagnostic records.

## Identity and limits

The supplied AST JSON pins `450895b546c0d48242acb5e218c2538999b9248e`; the computed trace pins `e93b21629faa72717e14676b4f13acd47d446b3e`. Current HEAD is newer. The intervening production diff from the AST pin is the TwoPole repair and its explicit signed descriptor; it does not add getter call sites. Therefore the bounded binding corrections remain applicable, but this addendum does not relabel older runtime receipts as current-HEAD executions. The source manifest deliberately reconstructs the recorded older ConfigLoader snapshot. TwoPole acceptance is a separate landed receipt.

Three parse errors remain listed in the AST JSON (`ogz-meta/ogz-run.js` and two replacement snippets); they are explicitly unresolved, not successful parses. No new claim about their execution status is made here.

Source labels, transport/reload checks, archived-env independence, static reader discovery, and actual downstream behavior are different evidence categories. These corrections improve the first four; they do not certify every algorithmic consumer, full replay, learned-bank compatibility, runtime activation, or full Stop1/configuration closure. Prior broad generic leaf-map gaps must still receive their own reader/effect evidence or explicit disposition.

## Final bounded census delta: d17aee91

The known 17-site omission above is **resolved in the updated census** pinned to `d17aee91e7e531f8145be693394b884fd3525853`. The initial findings above remain as review history, not current unresolved claims.

Inspected the new static `path.join`/`path.resolve` binding recognition and the generated rows. All previously identified sites are represented: eight literal plus one computed call in `scripts/smoke-test.js`, two literals in `tools/strategy-parity.js`, and six literals in `tools/trade-validator.js`. The two smoke exit template paths resolve to the actual EMASMACrossover keys. The remaining computed smoke call at line 160 is explicitly enumerated in `getter-scope-supplement.json`; the three paths exactly match the `configs` object and Object.entries producer at the pinned source's lines 153-159. This is diagnostic input validation, not execution of those strategies.

The updated report contains 287 literal calls, 11 computed calls, and 13 public accessor calls, with no reported missing canonical or all-role source paths. Matrix/parallel accessors are represented separately; the previous no-current-reader inference is not retained. These counts describe the inspected static census only and cannot be used as runtime acceptance totals.

All three parse-error files remain visible and unparsed. The supplement states no global runtime absence claim for them. General dynamic/reflective invocation and externally built value limitations remain explicit. No old proofs were rerun, no broader census was attempted, and no production change was authored for this delta check.

**Disposition:** the specifically reported 17 binding omissions and their finite smoke route are closed as static evidence defects. The original distinction between source/transport evidence and actual consumer behavior remains in force; this addendum does not certify full runtime or configuration closure.
