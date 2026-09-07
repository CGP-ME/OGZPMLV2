# Manifest

- Source: Trey's Sept. 7 GO and verbatim Mercury-method ruling, dispatched to Codex in this thread.
- Date: 2026-09-07.
- Executor: Codex in `/opt/ogzprime/OGZPMLV2` on branch `fix/stop1-config`.
- Why kept: Ruling 7/7a accountability for the Mercury receipt-authority and two-phase reading change.
- Base: `079f91ab34e912b53830406ed16eb571411fb19d` (`e54a8b8` plus the existing Stop-1 packet commit).
- Packet: `ogz-meta/inbox/codex/2026-09-07/mercury-authority-receipts-two-phase/`.
- Tapes: the mission proof ledger rows and every referenced provider raw output will be redacted into `tapes/`; original and committed hashes will be recorded in `TAPE-HASHES.tsv` before final commit.
- Exclusions: bot runtime, PM2, brokers, env values, trading config, panel structure, Kimi adjudication, quarantine/identity posture, max-token coupling, and Claude bridge.
