# Final ruling and selected implementation

This update supersedes the interim selected-scope/boundary conclusions below. Trey explicitly authorized forced replacement to reject invalid configuration before publication, report the error, and retain current valid settings without shutdown or silent substitution. Final selected patches are fixtures/loader-final-head.patch and fixtures/loader-final-working.patch, plus module.patch and producers.patch. No initial-load validation was added.

The replacement helper preserves Number coercion and validates only five EMA confidence leaves. On rejection, settingsConfigFile and internalsConfigFile are restored; buildSnapshot already restores activeEnv, activeEnvSources, activeLaunchProfileContext, activeCredentialEnv, activeCredentialSources, activeProcessRole and activeRunDescriptor in finally. _cached and _cachedRole are never assigned. Tests assert all eleven identities and public-reader/save consistency. Coercion failures from malformed JSON objects return a named rejection, not a runtime throw.

Valid loads retain the original return shape. Only invalid forced replacement of an existing bot owner returns {success:false,applied:false,reloaded:false,reason,path,configuration}. It emits a named console error. Existing unrelated buildSnapshot failures are unchanged. No engine force caller was identified; this narrow exported-API behavior is nevertheless explicitly authorized.

See EVIDENCE.md for final reproduction and FINAL-ARTIFACTS.md for delivery selection. The remainder is the preserved investigation history, not current implementation selection.

---

# EMA snapshot publication qualification

Date: 2026-09-29. Source: clean baseline 6bcfad8a and current live files. This receipt supersedes the initial startup-validation proposal.

## Selected scope

Parent directed: no startup validation. Use fixtures/loader-save-only-head.patch for a clean candidate and fixtures/loader-save-only-working.patch for the inherited working context. Earlier loader.patch and loader-working-context.patch remain historical proposals and MUST NOT be integrated. Module confidence refresh preserves the existing constructor's Number(value) normalization. No new startup errors, runtime throws, fallback values, gates, or silent retention of invalid configuration were introduced.

## Complete publication map

| Path | Live file:line | Clean HEAD line | Behavior |
|---|---|---|---|
| buildSnapshot | foundation/ConfigLoader.js:2350 | 2297 | Rereads canonical files, builds/validates/freezes snapshot; does not itself replace cached config. |
| canonical disk read | foundation/ConfigLoader.js:37,53-58 | Same | Reads settings/internals from disk each build; cached canonical variables are overwritten. |
| snapshot | foundation/ConfigLoader.js:2461 | 2408 | Returns an independent built snapshot; does not publish _cached. |
| load | foundation/ConfigLoader.js:2465-2475 | 2412-2422 | Returns cached snapshot unless forced; initial/forced path assigns freshly built snapshot. |
| saveSettings | foundation/ConfigLoader.js:2840-2927 | 2772-2859 | Validates typed editable input, clones current snapshot, writes canonical file atomically, then publishes. |
| _resetForTest | foundation/ConfigLoader.js:2930-2938 | 2862 onward | Clears cache and environment context; does not publish config. |

No other assignments to _cached exist. Config compatibility getters read the same cached config; getAll returns a clone. Settings, internals and returned config objects are frozen where published.

## Actual runtime reachability

Runner imports load as loadConfig and calls it once at run-empire-v2.js:119-120 without force. Other engine loads at core/StateManager.js:125, core/PatternMemoryBank.js:161,168, core/FeatureFlagManager.js:103, core/tradeLogger.js:145 and core/UnifiedPatternMemory.js:204 are non-force and return the cached owner. No force-load call was found in runner/core/modules/foundation/tools/scripts. Force calls found outside the packet are tests. Initial module construction validates/normalizes confidence via existing modules/EMASMACrossoverSignal.js readConfig; original initial refusal behavior is unchanged.

For retained production detectors in this current call graph, saveSettings is the identified post-construction publication producer. Typed schema enforces each changed leaf's finite numeric 0..1 domain. A save-only relationship check rejects maxConfidence below baseConfidence before disk or cache publication. Number comparison preserves existing unedited numeric strings already accepted by constructor normalization. The module normalizes provider values with Number before comparison and copying, so valid strings do not turn numeric confidence addition into concatenation.

## Explicit boundary, not an identified runtime fault

Exported load({force:true}) can read manually malformed confidence from disk and publish it without existing EMA-specific constructor validation. reload-policy-probe.cjs proves this using a deliberately invoked fixture-only force call. No current production force caller was identified. Expanding this API's rejection/recovery behavior requires a ruling before changing scope. Do not characterize the probe as an observed running-bot path, and do not silently add startup rejection to address it.

The prior strict startup proposal would newly reject numeric-string/null/boolean inputs the existing Number-normalizing constructor accepted. Even a Number-compatible startup check would move failure from constructor to loader and change standalone snapshot behavior. The selected patch adds neither change.

## Executable evidence

fixtures/integrated-save.cjs runs actual clean-HEAD ConfigLoader plus only the revised EMA schema/save-check overlay, actual AtomicWrite, isolated canonical files, and the lane detector. It proves real saveSettings acknowledgement, disk persistence, next-update effects in three retained detector instances, explicit static injection preservation, invalid-save nonpublication, and a valid persisted force reload. No services or broker were started. Non-secret test credential strings are confined to the child fixture process.

fixtures/reload-policy-probe.cjs proves accepted initial numeric-string normalization, a successful other-leaf save while that string remains untouched, and the deliberately unused force API boundary. Fixtures restore their isolated settings file afterward.

behavior.json proves recorded-data scoring and state preservation, including publication after 400 warmup/evaluation candles. integrated-save.log and reload-policy-probe.log contain the final receipts.
