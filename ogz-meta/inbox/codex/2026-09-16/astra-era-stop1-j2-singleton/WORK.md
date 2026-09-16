# STOP 1 J2 work

## Source trace

- `run-empire-v2.js` constructs `OGZSingletonLock('ogz-prime-v14')` and calls `acquireLock()` during module initialization.
- Before this change, `core/SingletonLock.js` checked `existsSync()`, read or deleted the old record, then called `writeJsonAtomic()`.
- `core/AtomicWrite.js` wrote a sibling `.tmp` file and renamed it to the destination. That protected content completeness but did not make destination ownership exclusive.
- `releaseLock()` already checks both PID and random token before unlinking.
- `SingletonLock` also installs immediate signal/fatal exit handlers. Those remain unchanged because J3 owns lifecycle and one release owner.
- `start-ogzprime.sh` called `setup()` from both `start` and direct `setup`, and `setup()` unconditionally removed `.ogz-prime-v14.lock`. That external deletion could erase a live owner's record before a second process acquired it.

## Implementation

- The lock candidate is complete and synced before it becomes visible at the established path.
- Hard-link publication supplies the exclusive destination claim without rename replacement.
- A stable reclaim-mutex file and Linux `flock` serialize stale-owner deletion. The kernel-held mutex is tied to the claimant's inherited file description and releases automatically if that process exits. The claimant re-reads and compares PID, start time, and token before deletion.
- Another process winning the established path during recovery is reported as acquisition failure; it is not overwritten.
- Candidate files are removed on every returning acquisition path. The empty reclaim-mutex inode persists by design so every future claimant locks the same inode; its existence is not bot ownership.
- An unreadable or identity-less existing record is retained. New code no longer treats parse failure as permission to delete unknown ownership.
- The `AtomicWrite` comment no longer names SingletonLock as a consumer.
- The launcher no longer removes the owner record. Only `SingletonLock` decides whether a recorded owner is stale and may be reclaimed.
- The contention probe uses explicit ready, start, and release barriers. The parent observes all five refusal exits plus the winner's ownership receipt before allowing that winner to release.

## Deliberate boundary

The reclaim mutex is not a second bot-owner identity. It exists only to serialize deletion of a proven dead record, carries no bot-owner metadata, and derives authority from a kernel-held lock rather than file existence. `/usr/bin/flock` is therefore a target-host dependency for stale-owner recovery and is exercised directly by this packet. Actual process-failure lifecycle and operator recovery remain subject to J3/J4 review.

No configuration value moved. No trading, readiness, retry, notification, or process-lifecycle decision was added.

## Footer

WHAT I DID: repaired exclusive acquisition at the current owner and built a real multi-process contention probe.

WHAT I DID NOT DO: boot the bot, run Jest, touch PM2, call a provider/broker/notifier/network service, or alter signal/shutdown ownership.

WHAT I ASSUMED: the deployed bot continues to use this Linux host and its repository data filesystem. The direct receipt establishes same-directory hard-link support there; it does not claim Windows or an unexercised network filesystem.
