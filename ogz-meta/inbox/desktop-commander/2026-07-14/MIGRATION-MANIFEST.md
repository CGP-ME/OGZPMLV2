# Migration Manifest - VPS Swap Carry Bundle

Generated: 2026-07-14T10:30:40.597852Z

Mission: inventory untracked/gitignored material under `/opt/ogzprime`, copy CARRY classes into `/opt/ogzprime/MIGRATION-CARRY/`, preserve originals, delete nothing from source locations.

## Status

| Field | Value |
| --- | --- |
| Repo HEAD | bdc7c4d6 Added 1m tournament data |
| Carry bundle path | /opt/ogzprime/MIGRATION-CARRY |
| Carry bundle size after prune | 650M |
| Carry checksum entries after prune | 1952 |
| Copy log | /opt/ogzprime/MIGRATION-CARRY/migration-copy.log |
| Checksum file | /opt/ogzprime/MIGRATION-CARRY/SHA256SUMS |
| Inventory directory | /opt/ogzprime/MIGRATION-CARRY/inventories |

```text
Filesystem      Size  Used Avail Use% Mounted on
/dev/vda2       657G  372G  257G  60% /
```

## Trey Prune Ruling Applied

- Deleted only the copied carry-bundle directory `/opt/ogzprime/MIGRATION-CARRY/OGZPMLV2-campaign-ledgers/`.
- Original campaign ledgers under `/opt/ogzprime/OGZPMLV2/.../weekend-campaign/` were not deleted or moved.
- Retained `OGZPMLV2-campaign/` and `OGZPMLV2-campaign-matrix/`: manifest, INDEX files, campaign-status files, integrity, data-parity, and matrix summaries.
- Rebuilt `/opt/ogzprime/MIGRATION-CARRY/SHA256SUMS` after pruning.

## CARRY Classes Present

| Carry directory/file | Size | File count |
| --- | --- | --- |
| OGZPMLV2 | 189M | 155 |
| OGZPMLV2-campaign | 22M | 238 |
| OGZPMLV2-campaign-matrix | 125M | 512 |
| OGZPMLV2-trai-brain | 198M | 21 |
| PM2 | 144K | 3 |
| SHA256SUMS | 464K | 1 |
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

Commit-to-repo survival path executed: `bdc7c4d6 Added 1m tournament data`.

## Classification Rules Used

| Class | Copied? | Rules / examples |
| --- | --- | --- |
| CARRY: env family | yes | `.env`, `.env.*`, `*.env` from `/opt/ogzprime`, plus main repo `.env`, `.env.gates`, `profiles/`. |
| CARRY: learned state / journals / pattern memory | yes | Main repo `data/`; top-level `trai_brain/*.json` and `*.jsonl`; cross-snapshot files matching learned/journal/pattern/state names. `trai_brain/models/` was not copied. |
| CARRY: PM2 config | yes | `/home/linuxuser/.pm2/dump.pm2`, `dump.pm2.bak`, `module_conf.json`, plus `ecosystem.config.js` under main repo carry. PM2 logs and pids were not copied. |
| CARRY: 1m data | yes + committed | `tuning/tsla-1m-2y.json`, `nvda-1m-2y.json`, `spy-1m-2y.json`, `qqq-1m-2y.json`; committed in `bdc7c4d6`. |
| CARRY: campaign final evidence | yes | Weekend campaign `manifest`, `heartbeat`, `campaign-status`, `INDEX`, `integrity/`, `data-parity/`, and `artifacts/*/matrix/*`. |
| PRUNED: campaign ledgers | copy deleted | `MIGRATION-CARRY/OGZPMLV2-campaign-ledgers/` removed per Trey ruling; original ledgers remain on old box and die with it. |
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

- No source/original deletes were run.
- CARRY items were copied; originals remain in place except no source originals were touched by the carry prune.
- `/opt/ogzprime/MIGRATION-CARRY/SHA256SUMS` contains SHA-256 for every current carried file except the manifest itself.
- `/opt/ogzprime/MIGRATION-CARRY/manifest.md` is a copy of this report.

## Current Tracked Dirty State Before Report Commit

```text
M core/OrderExecutor.js
 M core/TraceSpine.js
 M core/TradingLoop.js
 M run-empire-v2.js
 M test/session-router-stock-symbol-config.test.js
```
