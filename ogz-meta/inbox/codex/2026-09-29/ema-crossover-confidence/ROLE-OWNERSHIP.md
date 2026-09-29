# Cached-role ownership correction

Date: 2026-09-29. Delegated by root Codex to MA confidence agent, writing into this EMA packet with explicit authorization. Trey approved nonthrowing invalid-replacement rejection before publication. No production/index edits were made by this subagent.

The new retained confidence provider exposed an existing ConfigLoader permission: a cached bot could force-load role dashboard, publish a role-minimal snapshot without strategies, then crash its next detector update. Exact exposed EMA tree8b381e69c5bed1ecb73c5bcfc6f8e7728c49eea2 reproduced the TypeError reading baseConfidence; clean6bcfad8a allowed the same role switch but its pinned EMA continued without that new update failure.

`fixtures/role-ownership.patch` rejects a forced request whose requestedRole differs from cached role before buildSnapshot or canonical-file reads. The explicit result is success:false/applied:false/reloaded:false with reason forced_reload_role_change_rejected, requestedRole, currentRole and prior configuration receipt. It emits a named console.error. No throw, shutdown, snapshot default or silent fallback is added. Initial role boot and same-role force remain unchanged.

Patch SHA256: e7d02e488999849c9947e2f5fae23800dfd7eaf2404a97e117bd62931d4e5bba.

Keep loader-final-head.patch stable; role-ownership.patch is a separate fourth EMA dependency. Root owns working/index application, Mercury and commit. EMA/Liquidity builder owner was notified and added this exact dependency. MA qualification also now composes this dependency before its MA loader delta.

Verification command:

```
node ogz-meta/inbox/codex/2026-09-29/ema-crossover-confidence/fixtures/role-ownership-probe.cjs
```

PASS. Receipt: role-ownership-result.json. Local log: private/role-ownership.log.

The actual loader/EMA implementation is read from immutable git blobs: baseline6bcfad8a; exact exposed EMA tree; and exact exposed tree plus only this patch. The test uses nonsecret fixture credentials and packet-owned settings/internals. It proves:

- Bot→dashboard and dashboard→bot reject by name, preserving all11 canonical/active/cache global identities, disk bytes and configuration receipt.
- Actual retained EMA callback runs100 further recorded candles after rejection, matching pinned control signal and state exactly.
- Same-role bot and dashboard forced loads still succeed. Changed bot base confidence reaches the retained detector and changes221 later recorded signals.
- Initial bot/dashboard config, source map and revision objects equal their pre-correction implementations.

No full bot/bootstrap/broker/PM2/provider action or deployed runtime is claimed. Eleven loader globals are observed via a test-only export; production exports are unchanged. Installed external libraries remain fixture dependencies. Source and patch hashes are in the receipt.

## Portable reconstruction

The qualification no longer depends on historical uncommitted tree8b381e69c5bed1ecb73c5bcfc6f8e7728c49eea2 being present. It reconstructs exposed bytes in memory from reachable commit8eabf0f4e61d4edd4cdae974a19c6fdbf41400e2 plus module.patch, loader-final-head.patch and producers.patch, then checks all9 attested hashes in FIRST-REVIEW-TREE-PROOF.json. The historical tree ID remains only a receipt label. The corrected source adds role-ownership.patch and must retain loader SHA256094320239c2f40eb5cb323c1a328f88954ef840dcdb871b916fa6a9876cbfaaf. The portable probe reran PASS with the same rejection, retained-callback and221 changed-signal results. Production behavior and patch hashes are unchanged.
