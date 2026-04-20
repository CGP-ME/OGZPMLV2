
## 2026-04-20: Config Consolidation Phase 0 — Baseline Recorded + Doc Alignment Pending

**Status:** Phase 0 of CONFIG-CONSOLIDATION-SPEC.md landed on branch `config/consolidation` (commit `2dbec67`). Baseline at `ogz-meta/specs/baseline-phase0-2026-04-20.md`: +79.5% / 1430 trades / 57.55% WR / 2.63% DD. Doc alignment sweep drift table at `ogz-meta/specs/doc-alignment-sweep-2026-04-20.md` approved + committed 2026-04-20.

**Next session pickup:** Phase 1 scaffold (JSON config + schema + snapshot dirs). Awaiting operator Phase 1 approval.

---

## 2026-03-30: Duplicate LLM Client - Maintenance Bomb

**Issue:** `persistent_llm_client.js` exists in two places:
- `core/persistent_llm_client.js`
- `trai_brain/persistent_llm_client.js`

**Risk:** Someone edits one, forgets the other, they drift apart silently.

**Fix:** One should `require()` the other, or both should require from a shared location.
```javascript
// Option A: trai_brain/persistent_llm_client.js becomes:
module.exports = require('../core/persistent_llm_client');

// Option B: Move to shared location like lib/llm-client.js
```

**Priority:** Low - but do it before next LLM client change.
