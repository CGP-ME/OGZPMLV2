# STOP 1 J2 Mercury attack record

The required visible prompt was used without file or conclusion steering:

```text
Mercury, break my fix.
```

Both runs used `--max-tokens=7750 --max-iterations=60`.

## First attack — real defect, corrected

Mercury identified that the original fixed-name `.reclaim` claim could remain after its owning process died. Because only the matching PID/token removed it, later stale-owner recovery could be refused indefinitely.

That mechanism was removed. Stale deletion now uses a stable file inode plus Linux `flock`; ownership is held by the inherited open-file description and the kernel releases it when the process exits.

The direct probe then killed a child holding that mutex with `SIGKILL`. Six subsequent stale-owner contenders on the same path produced one recovery winner and five refusals.

## Second attack — target mismatch, not hidden

Mercury alleged `fs.linkSync()` could fail across devices or on an unsupported Windows/network filesystem. The cross-device scenario does not match the code: the candidate and destination are sibling paths under the same `lockFile` directory. The product target is this Linux VPS, not Windows. The corrected direct probe runs under the repository `data/` directory and records the target device; all fresh and stale rounds successfully execute the real hard-link publication there.

This does not claim support for an unexercised Windows or network-filesystem deployment. On an unsupported filesystem acquisition exits with a named error rather than falling back to rename replacement.

## Review-layer limitation

The configured Fable adversarial review seat was unavailable during both runs because its local credentials/authentication were absent. Mercury and Kimi completed. This packet does not relabel that missing seat as a pass.
