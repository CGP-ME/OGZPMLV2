# STOP 1 J2 — exclusive singleton acquisition

J0 assigns J2 one behavior: make the existing singleton identity exclusively acquirable. The established production identity remains `.ogz-prime-v14.lock`; this change does not rename it or create a second bot-owner domain.

The source defect was an existence check followed by `writeJsonAtomic()`. That helper atomically renamed complete bytes into place, but rename replaced an existing destination. Two processes could both report acquisition success.

J2 corrects acquisition at `core/SingletonLock.js`:

1. Write complete metadata to a same-directory, owner-unique candidate opened with exclusive creation and mode `0600`.
2. `fsync` and close the candidate.
3. Publish it to the established lock path with one hard-link operation. Candidate and lock are siblings on the same filesystem, so this cannot become a cross-device link. Link creation fails with `EEXIST`; it never replaces the current owner.
4. If the recorded owner is dead, acquire one kernel-held reclaim mutex, re-read the lock, prove it is the same dead owner, remove only that record, and compete for the established path once. The kernel releases the mutex if the claimant exits or crashes.
5. If ownership is unreadable or changes during recovery, do not guess or delete it.

The existing backtest skip inputs and owner-token release check remain. J2 does not migrate those inputs, change signal/fatal handlers, add a process supervisor, or activate the bot.

## Acceptance boundary

Direct child processes, not a bot entrypoint or Jest, must prove on the target Linux filesystem:

- fresh simultaneous contenders produce exactly one owner;
- simultaneous recovery of one stale owner produces exactly one owner;
- the winner sees complete metadata carrying its PID and token;
- every loser is refused before reporting acquisition;
- a non-owner cannot delete the owner record;
- owner release permits reacquisition;
- the existing file-source/backtest skip still creates no lock;
- unreadable ownership evidence is preserved and acquisition is refused.

J3 still owns removal of competing signal/fatal exit handlers and the final runner-owned release lifecycle.
