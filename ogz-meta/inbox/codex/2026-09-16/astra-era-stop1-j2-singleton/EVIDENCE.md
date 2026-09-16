# STOP 1 J2 evidence

## Reproduction

From the repository root:

```bash
node ogz-meta/inbox/codex/2026-09-16/astra-era-stop1-j2-singleton/probe-j2-singleton.js /tmp/j2-singleton-recheck.json
```

The committed `PROBE-RECEIPT.json` is produced by the same command with its output path changed to that packet file. It hashes the three changed runtime files, the unchanged runner integration, and the probe source.

J3 refreshes this receipt because `SingletonLock.acquireLock()` now reports acquisition failure to its runner owner instead of terminating the process itself. The probe supplies the child-process exit disposition and re-proves the unchanged J2 exclusivity contract. `baseSha` continues to identify J2's original implementation base; J3's exact base and lifecycle evidence are recorded in the J3 packet.

## Direct receipt

The probe loads the real `core/SingletonLock.js` in ordinary child processes. It does not replace filesystem calls or load the bot entrypoint. Its isolated scratch directory is created beneath the repository's `data/` directory so hard-link publication is exercised on the bot data filesystem, not `/tmp`; the receipt records that device. Candidate and destination are always in that same directory. The receipt also records the exact `/usr/bin/flock` version used by stale-owner recovery.

- Eight fresh rounds used six coordinated contenders per round. Every child reported ready before the shared start gate opened. Every round produced exactly one successful owner and five refused processes.
- Eight stale-owner rounds used the same explicit barrier. Every round produced exactly one successful recovery owner and five refused processes.
- In every race, the winner retained the owner record until the parent had observed the winner receipt and all five refusal exits. A late sequential acquisition cannot be counted as a second contention winner.
- Every winner read the visible lock and matched both its actual child PID and its random owner token.
- No contender observed partial JSON.
- Owner release removed the lock; a subsequent process reacquired it.
- A separate non-owner instance called the real `releaseLock()` while the owner was alive. The owner PID/token and file remained unchanged.
- The existing file-source/backtest mode returned success with `hasLock() === false` and no lock file.
- An unreadable pre-existing owner record caused status 1, remained byte-identical, and produced no acquisition receipt.
- Candidate and owner-lock artifacts were absent after every completed race. Stale-owner rounds retained the empty `.reclaim-mutex` inode by design; all six contenders in each round used that same path.
- A separate child acquired the reclaim mutex and was killed with `SIGKILL`. A subsequent six-process stale-owner race on the same mutex path still produced exactly one recovery owner, proving the kernel released the dead claimant's lock.
- The probe checks the actual startup script and refuses to pass if it directly removes `.ogz-prime-v14.lock`. The launcher source is included in the receipt hashes.

These receipts prove the exercised local process/filesystem outcomes, including kernel-mutex release after a killed holder. They do not prove a deployed PM2 restart, operator signal cleanup, bot initialization, or every possible kill point inside the full stale-recovery sequence.

## Mechanical receipt

- `node --check core/SingletonLock.js` passed.
- `node --check probe-j2-singleton.js` passed.
- Focused `git diff --check` passed.
- No Jest, bot entrypoint, provider, broker, notification, network, PM2, or trading operation was used.
