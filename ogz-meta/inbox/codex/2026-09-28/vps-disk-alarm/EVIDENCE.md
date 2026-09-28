# Evidence

Initial read-only commands: free -h, df -hT / /opt/ogzprime/OGZPMLV2, swapon --show --bytes, du -x /opt/ogzprime, systemctl list-timers --all. User corrected alarm scope to disk only. Node v22.22.1 at /usr/bin/node; / and the repository share /dev/vda2. Existing .env contains NTFY_TOPIC; its value was not printed or copied into the new source. No existing alarm service/state targets were present.

Combined observation: `node ogz-meta/inbox/codex/2026-09-28/vps-disk-alarm/fixtures/combined.cjs` exercises the real exported measurement, scheduling and publish functions using synthetic counters and intercepted HTTPS requests. `combined-consumer-receipt.json` records fourteen sequences: independent thresholds, repeat times, recovery/re-entry, clock regression, test-mode isolation, HTTP rejection/retry and measurement failure isolation. Additional assertions cover malformed counters, reserved blocks, max-priority POST payloads and synchronous transport construction failures. No disk/RAM filling or parallel implementation is used.

`node --check scripts/vps-disk-alarm.js` and `systemd-analyze verify` completed successfully; the latter printed unrelated installed XFS unit deprecation warnings. Actual `--test-alert` execution at 2026-09-28T06:30:57Z returned HTTP 200 for both disk and RAM and `nextState: null`. Readings were disk 18.26% used and RAM 18.27% used. The topic and other credential values were neither printed nor committed.

Provider acceptance is not proof the phone sounded. A one-minute poll cannot guarantee warning before sudden exhaustion; this host alarm also cannot send while the host/network/provider is unavailable. Systemd installation and scheduled invocation are separate from these pre-commit observations.
