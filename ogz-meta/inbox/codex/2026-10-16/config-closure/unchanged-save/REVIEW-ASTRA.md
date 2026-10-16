# Astra adversarial review: unchanged settings save

Verdict: **GO for this atomic unchanged-save change.** No concrete regression found. This is the requested independent adversarial review under the user override; it does not relabel Mercury's recorded `found_break` as a clean Mercury verdict, certify full Stop1 completion, or authorize runtime activation.

## Exact source identity and method

- Candidate tree: `ce7de64803fbe3baf69170948ec2cf179330408a`.
- Base commit: `101399e1b43fe3aa8259f5a28e6c59ffab87d691`; resolved base tree: `033bdd214c9262bd27011ca6731dd4c3d6e000e0`.
- Candidate changes only `foundation/ConfigLoader.js`, `core/WebSocketManager.js`, and `public/js/panels/configuration-settings.js`.
- All code citations below refer to the exact candidate tree, read with `git show`/`git grep`, not uncommitted live files.
- The three pinned probe source files match candidate blobs exactly: loader `7149ce339e8c57b26f53dedd4c7d381410777400`, handler `e0a0a12efd6aca22d424454785b6416c2085d94d`, UI `ab0cc8aabf043f82857f335f75ca8d222949c347`.
- Review was read-only except this receipt. No trading imports, tests, PM2 actions, or runtime mutations were performed by this reviewer.

## Mercury allegation resolved with producer/consumer evidence

Mercury correctly observes that the callback no longer runs for a successful unchanged save, but explicitly assumes it must run on every successful application. The requested behavior is an idempotent save without unnecessary side effects, so that assumption needs an actual dependent consumer to establish a break.

The only registered callback (`run-empire-v2.js:1113-1120`) assigns `resolvedConfig = snapshot`, assigns the audit source ID from the snapshot fingerprint, emits runtime configuration proof, and logs `SETTINGS_APPLIED`. It does not complete a pending request, mutate an execution policy, or supply the settings response. `core/RuntimeAuditSink.js:377-379` only assigns the source identity; `core/RuntimeConfigProof.js:179-182` builds and logs proof. The initial audit identity and configuration proof are already established at `run-empire-v2.js:123,409`.

The no-op returns before revision/snapshot mutation (`foundation/ConfigLoader.js:4306-4309`), so rerunning the callback would reassign the same cached object and fingerprint and repeat logs. The required request acknowledgement remains outside the callback conditional: `core/WebSocketManager.js:144-151` constructs, sends, and returns `settings_result` for the unchanged success as well. Genuine changes still return `changed:true` after atomic persistence/publication (`foundation/ConfigLoader.js:4310-4326`) and run the callback (`core/WebSocketManager.js:145-146`). Therefore Mercury's observed control-flow difference implements the requested behavior; no missing consumer obligation was found.

## Independent attack results

- **Stale or externally changed settings masquerading as an unchanged save:** existing disk-hash and expected revision/hash checks run before candidate construction and before the no-op branch (`foundation/ConfigLoader.js:4186-4205`). The new branch does not bypass them.
- **Invalid values bypassing validation:** descriptor and cross-field checks remain before the no-op branch (`foundation/ConfigLoader.js:4161-4185,4206-4305`). No new validation gate was introduced.
- **Real or mixed changes suppressed:** comparison covers the full candidate canonical document, before revision increment. `canonicalize` sorts object keys but preserves array order (`foundation/ConfigLoader.js:2095-2108`); a genuine JSON-value change proceeds to the existing write/publication path. All changed producers return `changed:true`.
- **Forged/inconsistent same-revision receipt clearing drafts:** the new same-revision acceptance requires explicit `changed:false`, matching revision/settings hash/fingerprint, the expected owner, a valid view, successful saved/applied flags, and equality of every submitted value (`configuration-settings.js:24-37,436-449`). Pending state now captures the submission identity (`:530`).
- **Late acknowledgement overwriting newer work:** the existing newer-view/pending-write checks and draft-value comparison remain in place (`configuration-settings.js:450-461`). The new acceptance path does not remove those protections.

## Verification inspected and limits

Read `private/probe.log`: it identifies this exact candidate, reports PASS across 1,372 editable current values, zero writes/callbacks for unchanged requests, retained snapshot identity and revision, one actual atomic write/revision/callback for a real edit, profile persistence/reload, stale-request rejection, array/mixed-request behavior, and socket receipt equality. Read the native fixture implementation and confirmed its three pinned source blobs match the candidate. Collaborators irrelevant to `handleSettings` are substituted; the real application callback itself is covered by source review above, not that native callback counter.

Read the AST UI fixture: it extracts the actual receipt/identity functions and asserts accepted unchanged receipts, rejection of wrong hash or absent `changed:false`, preservation of newer drafts, and rejection of wrong owner. The parent reports this fixture passed. This reviewer did not find or execute a separate persisted UI run receipt, so the UI pass remains parent-reported. The AST test does not exercise DOM, browser event wiring, or a live socket.

No new holds, gates, runtime activation, or full configuration-closure claim are part of this verdict. Existing external-write races and any broader settings architecture are not newly introduced by these three-file edits and were not certified by this review.
