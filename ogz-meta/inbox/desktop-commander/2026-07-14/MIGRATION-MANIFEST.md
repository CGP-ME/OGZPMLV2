# Migration Manifest - VPS Swap Carry Bundle

Generated: 2026-07-14T06:09:20.664528Z

Mission: inventory untracked/gitignored material under `/opt/ogzprime`, copy CARRY classes into `/opt/ogzprime/MIGRATION-CARRY/`, preserve originals, delete nothing.

## Status

| Field | Value |
| --- | --- |
| Repo HEAD | 6edd3ae5 Fixed one-branch worktree law |
| Carry bundle path | /opt/ogzprime/MIGRATION-CARRY |
| Carry bundle size | 105G |
| Carry checksum entries | 2448 |
| Copy log | /opt/ogzprime/MIGRATION-CARRY/migration-copy.log |
| Checksum file | /opt/ogzprime/MIGRATION-CARRY/SHA256SUMS |
| Inventory directory | /opt/ogzprime/MIGRATION-CARRY/inventories |

```text
Filesystem      Size  Used Avail Use% Mounted on
/dev/vda2       657G  476G  153G  76% /
```

## CARRY Classes Copied

| Carry directory/file | Size | File count |
| --- | --- | --- |
| OGZPMLV2 | 189M | 155 |
| OGZPMLV2-campaign | 22M | 238 |
| OGZPMLV2-campaign-ledgers | 105G | 497 |
| OGZPMLV2-campaign-matrix | 125M | 512 |
| OGZPMLV2-trai-brain | 198M | 21 |
| PM2 | 144K | 3 |
| SHA256SUMS | 592K | 1 |
| SIZE.txt | 4.0K | 1 |
| env-family | 440K | 35 |
| inventories | 21M | 3 |
| learned-state-snapshots | 97M | 982 |
| migration-copy.log | 4.0K | 1 |
| migration-copy.status | 4.0K | 1 |

## Four 1m Data Files

| File | Bytes | Size | SHA-256 | <95MB commit survival path? |
| --- | --- | --- | --- | --- |
| tuning/tsla-1m-2y.json | 25385347 | 25M | 5c1ee4e1d6c04b76671f1ba43de8b6008093f4fda41b148e110176d925d5dea5 | YES |
| tuning/nvda-1m-2y.json | 26379626 | 26M | c388d095c8634243089d795708194151fdda486b38faf80521934cc91a575a29 | YES |
| tuning/spy-1m-2y.json | 25597636 | 25M | 53982b7ef763a8a0deeb15679f5ef6f1b670d30c298c164a08c59d2d89a49384 | YES |
| tuning/qqq-1m-2y.json | 24946077 | 24M | f88aaa8d72a32fdbf94624cec604d438873be2a01bb2e1fc48fbfab843f8b8c1 | YES |

Recommendation: all four `tuning/*-1m-2y.json` files are under 95MB, so commit-to-repo is a viable survival path if Trey wants these data files versioned.

## Classification Rules Used

| Class | Copied? | Rules / examples |
| --- | --- | --- |
| CARRY: env family | yes | `.env`, `.env.*`, `*.env` from `/opt/ogzprime`, plus main repo `.env`, `.env.gates`, `profiles/`. |
| CARRY: learned state / journals / pattern memory | yes | Main repo `data/`; top-level `trai_brain/*.json` and `*.jsonl`; cross-snapshot files matching learned/journal/pattern/state names. `trai_brain/models/` was not copied. |
| CARRY: PM2 config | yes | `/home/linuxuser/.pm2/dump.pm2`, `dump.pm2.bak`, `module_conf.json`, plus `ecosystem.config.js` under main repo carry. PM2 logs and pids were not copied. |
| CARRY: 1m data | yes | `tuning/tsla-1m-2y.json`, `nvda-1m-2y.json`, `spy-1m-2y.json`, `qqq-1m-2y.json`. |
| CARRY: campaign ledgers/final evidence | yes | Weekend campaign `artifacts/*/ledger/*`, `artifacts/*/matrix/*`, `manifest`, `heartbeat`, `campaign-status`, `INDEX`, `integrity/`, `data-parity/`. |
| DIE: logs | no | `logs/`, `logs/decisions/`, PM2 logs. Inventoried, not copied as carry. |
| DIE: generated reports/caches | no | `reports/`, `.playwright-mcp/`, transient caches, PM2 pids/sockets. Inventoried, not copied as carry. |
| DIE/REVIEW: snapshots | partial | All `/opt/ogzprime` snapshots inventoried. Only env/state-pattern matches inside snapshots were copied. Full snapshot directories were not copied. |

## Inventory Files

| File | Purpose |
| --- | --- |
| /opt/ogzprime/MIGRATION-CARRY/inventories/opt-ogzprime-top-sizes.txt | Top-level `/opt/ogzprime` size inventory. |
| /opt/ogzprime/MIGRATION-CARRY/inventories/git-repos.txt | Git status --ignored inventory for every git repo found under `/opt/ogzprime` max depth 3. |
| /opt/ogzprime/MIGRATION-CARRY/inventories/opt-ogzprime-all-files.tsv | Full file inventory under `/opt/ogzprime`, excluding `/opt/ogzprime/MIGRATION-CARRY`. |

## Source Preservation

- No deletes were run.
- CARRY items were copied; originals remain in place.
- `/opt/ogzprime/MIGRATION-CARRY/SHA256SUMS` contains SHA-256 for every carried file except the manifest itself.
- `/opt/ogzprime/MIGRATION-CARRY/manifest.md` is a copy of this report.

## Current Tracked Dirty State Before Report Commit

```text
M ogz-meta/inbox/codex/2026-07-14/tfe-phase2-killsite1-p0.log
 M run-empire-v2.js
 M test/single-broker-subscription-symbols.test.js
```
