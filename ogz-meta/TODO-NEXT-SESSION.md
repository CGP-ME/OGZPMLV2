
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
