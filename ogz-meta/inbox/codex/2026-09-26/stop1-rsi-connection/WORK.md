# Work

Starting main HEAD 29a2a56984b4c279e83969d78e8c9c363a36ed68, astra-era, empty index. Existing verification clone HEAD 98a400b3819a7bf31456e93c1652e4dd9bbfa38a; intervening main commit is documentation only. Existing dirty production edits preserved in private/inherited-before.patch. No wholesale adoption of the dirty tree.

Candidate: build RSI hint from the existing timeframe-aware contract owner, carry the configured period/exit threshold, accept the producer's 1..99 threshold range, connect a distinct RSI exit-above condition without changing RSI2's inclusive comparison. No new throw, process gate, configuration owner or fallback.

The first candidate's 53/41 entries were not sufficient proof: 33/26 occurred before the configured MA lookback because Number(null) became zero. Its frozen policy also omitted the RSI fields. The final candidate corrects that coercion, preserves the two fields through PolicyBuilder, removes the implicit exit-period substitution, and connects six existing RSI settings through the existing save owner. First-candidate source/diff and observations remain preserved. No first candidate was committed.

Three review chains are complete and adjudicated; focused final follow-up is pass. Exact final production diff: five files, 51 additions / 15 deletions. No additional production changes were made to obtain that verdict. Six settings form one connected delivery change through save, strategy, entry policy and exit; no unrelated dirty implementation is included. Source staging must match OBSERVATION.json hashes exactly. Commit/push and same-host cold-source receipts will be appended after execution; neither has happened at this checkpoint.
