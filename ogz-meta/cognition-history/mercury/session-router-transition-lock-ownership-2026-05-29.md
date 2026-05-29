# Mercury Attack Prompt: SessionRouter Durable Transition Lock Ownership

Attack one mechanism only: SessionRouter durable transition lock ownership.

Changed files:
- `core/SessionRouter.js`
- `core/session-router/TransitionStore.js`
- `test/session-router-transition-journal.test.js`
- `test/session-router-transition-store.test.js`
- `CHANGELOG.md`

Relevant code ranges:
- `core/SessionRouter.js:219-275` adds `_beginTransitionContext`, `_releaseTransitionLock`, and `_releaseTransitionLockAfterFailure`.
- `core/SessionRouter.js:705-715` skips failed-safe journal writes when the router did not acquire the transition lock.
- `core/SessionRouter.js:760-984` wires lock acquisition/release into crypto->stocks and stocks->crypto transitions.
- `core/SessionRouter.js:987-1059` wires lock acquisition/release into startup crypto/stocks activation.
- `core/session-router/TransitionStore.js:261-335` acquires durable locks and marks stale locks as recovery-required.
- `core/session-router/TransitionStore.js:337-384` releases only the matching transition ID and epoch.
- `test/session-router-transition-journal.test.js:191-241` covers fresh/stale lock conflicts before broker mutation.
- `test/session-router-transition-store.test.js:65-88` covers release refusing a different transition owner.
- `test/session-router-transition-journal.test.js:671-711` covers target journal failure before resume.

Architecture requirement:
The router must not mutate brokers, hand off pattern memory, attach target feeds, update active session, or resume trading unless it owns the durable transition lock. Fresh lock conflicts must not write transition journal events as a non-owner. Stale locks must enter `RECOVERY_REQUIRED`. Lock release must not delete another owner. Trading resume must occur only after durable target activation, OHLC fence attachment, and lock release.

Attack framing:
Find a concrete current-code path where SessionRouter can still mutate broker/feed/session/trading state without owning the durable lock, release someone else's lock, write transition journal events as a non-owner, or resume trading before target activation and lock release are durable. Include exact file:line evidence and an input/event sequence. Also attack crash/restart windows around lock acquire, target activation, release, and resume.

Do not review unrelated frontend, pattern-memory internals, or broker REST correctness. Do not give style feedback. If no concrete bypass exists in these ranges, say that and name the assumptions that remain.
