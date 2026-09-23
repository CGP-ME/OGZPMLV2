# Work

Candidate parent: 7afd5be206b82d29601ce0c91f5ef22b867e7cd3. Restore the 14-line helper exactly from f1df161e; its existing caller remains unchanged. No new gate, throw, journal policy, configuration dependency, or state owner. Mixed pending changes are excluded from this commit.

Executed verify.cjs: parent throws the named ReferenceError for all five recorded inputs; candidate produces all five exact expected outputs. Candidate SHA-256 002c28ec0106f765a8cc8600ec79aa819f59bb042fa1a55da0b5d5e041858e0e. `node --check core/TradeJournalBridge.js` and `git diff --check` exit 0. Full pre-cut tracked diff and 26 file hashes preserved locally in the prior mission's atomic-cut-preservation directory, excluded from this commit. Index must contain only the helper, its changelog entry and this packet.
