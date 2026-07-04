# Weekend Campaign Runbook

This directory holds the weekend tuning campaign manifests, logs, status files, integrity stamps, data-parity stamps, proof artifacts, and final operator evidence pack.

## Current Safety Posture

- The trading bot stays off during the campaign.
- Do not restart PM2 for the bot as part of campaign operations.
- The campaign runner is offline backtest tooling only.
- A campaign launch is allowed only after the evidence pack is fully green.

## Commands

Plan a campaign:

```bash
node tools/weekend-campaign-gauntlet.js plan --symbols=tsla,spy,qqq,nvda,riot,mara,coin --phase=conf --fee-profile=ttp_real --run-id=campaign-2026-07-03-weekend --projected-mib-per-run=874 --disk-reserve-mib=10240
```

Stamp data parity before launch:

```bash
node tools/weekend-campaign-gauntlet.js parity --manifest=ogz-meta/cognition-history/weekend-campaign/campaign-2026-07-03-weekend/manifest.json --live-reference=alpaca
```

Launch or resume:

```bash
node tools/weekend-campaign-gauntlet.js launch --manifest=ogz-meta/cognition-history/weekend-campaign/campaign-2026-07-03-weekend/manifest.json --resume --projected-mib-per-run=874 --disk-reserve-mib=10240
```

Status:

```bash
node tools/weekend-campaign-gauntlet.js status --manifest=ogz-meta/cognition-history/weekend-campaign/campaign-2026-07-03-weekend/manifest.json
```

Phone-friendly heartbeat:

```bash
cat ogz-meta/cognition-history/weekend-campaign/campaign-2026-07-03-weekend/heartbeat.json
```

Graceful stop:

```bash
node tools/weekend-campaign-gauntlet.js stop --manifest=ogz-meta/cognition-history/weekend-campaign/campaign-2026-07-03-weekend/manifest.json --reason=operator_stop
```

The stop command writes `STOP_REQUESTED.json` beside the manifest. The active worker is allowed to finish its current run. The runner then marks the campaign `stopped`, preserves completed artifacts, and leaves unstarted runs as `planned`.

Resume after stop:

```bash
node tools/weekend-campaign-gauntlet.js launch --manifest=ogz-meta/cognition-history/weekend-campaign/campaign-2026-07-03-weekend/manifest.json --resume --projected-mib-per-run=874 --disk-reserve-mib=10240
```

Resume clears `STOP_REQUESTED.json`, skips runs that are already `done` with integrity `PASS`, and continues from the next incomplete run.

## Disk Guard

The runner checks disk before each run. If available space is below the required floor, it aborts cleanly before starting the next worker, marks the manifest `aborted_low_disk`, writes `low-disk-abort.json`, updates `campaign-status.md`, and preserves artifacts already written.

The required floor is:

```text
max(min-free-mib, disk-reserve-mib + projected-mib-per-run * remaining-runs)
```

Default reserve is `10240 MiB`. The current campaign estimate uses `874 MiB` per run, derived from the dress rehearsal size of `1746 MiB` for two runs.

## Proof Artifacts

Low-disk forced-threshold proof:

```text
ogz-meta/cognition-history/weekend-campaign/low-disk-proof-2026-07-04/
```

Stop/resume proof:

```text
ogz-meta/cognition-history/weekend-campaign/stop-resume-proof-2026-07-04-r2/
```

Stop/resume expected proof sequence:

```text
running|running|planned
stopped|done|planned
done|done|done
```

The r2 proof completed with 2 done, 0 failed, 0 integrity failures.

## Operator Rule

If any gate row in `EVIDENCE-PACK.md` is not green, do not launch. Post the pack and hold.
