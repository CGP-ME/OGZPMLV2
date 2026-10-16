# Unchanged settings saves

A save of already-persisted values now preserves the configuration bytes, revision, cached snapshot and runtime application callback. A changed save writes once and advances the revision. The matching controller accepts an unchanged receipt only when its captured full configuration identity and every submitted value match. Existing owner/request correlation remains intact. No request-deduplication store or trading gate was introduced; revision/hash are concurrency tokens.

The isolated pinned native loader/socket-handler proof exercised all 1,372 editable current values, repeated no-op requests, changed saves, persisted active-profile ownership, reload, stale concurrency tokens, arrays and callback counts. The AST-extracted real UI receipt functions pass unchanged receipt, incorrect hash, missing changed flag, newer receipt/new draft and wrong-owner cases. This is focused receipt acceptance, not a browser/broker acceptance claim.

Mercury returned found_break because it assumed the callback must run on every successful no-op. Its answer is preserved. Independent Astra checked the callback and found that it only reassigns the existing config, updates the same fingerprint and emits duplicate runtime proof/logs. The settings_result receipt is still sent. Delivery uses Trey's existing Astra adjudication authorization; no clean Mercury verdict or fresh global-index claim is made. See REVIEW-ASTRA.md and source-manifest.json.

Reproduce: export the manifest candidate's three JS files and its canonical settings/internals to the fixture filenames used by probe.cjs; supply each explicitly with test-isolated.py --fixture, then run probe.cjs. UI probe needs only itself and the candidate panel fixture. Canonical JSON fixture exports are module.exports objects. The tests use fake credentials and disposable storage.

No PM2 restart, environment reload, trading resume or configuration value edit was performed. Unrelated worktree changes are excluded.
