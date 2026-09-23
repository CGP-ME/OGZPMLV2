# Review

The caller at core/TradeJournalBridge.js:902 references a missing local function in the parent. The candidate restores the historical implementation without changing callers or dependencies. Existing case-insensitive deduplication is preserved, not newly designed or claimed universally correct for every broker ID. No other accumulated repair is required for this helper. Mercury is deferred, not passed. Runtime activation remains unapproved.
