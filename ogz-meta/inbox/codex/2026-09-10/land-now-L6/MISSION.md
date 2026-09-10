# Mission

Dispatcher and ruling authority: Trey.

Status: GO for L6 only after L1 cold-pull clearance; HOLD after its commit for cold-pull.

## Verbatim L6 tasking

> | L6 | **Startup failure exits non-zero** | B18/C-11; item 8 | `run-empire-v2.js:1910-1927` (start() catch, read), `:3516-3586` (shutdown(), read), `:3628-3629` (SIGINT/SIGTERM → shutdown(), read) | `shutdown(exitCode = 0)`; `start()`'s catch calls `shutdown(1)`. Operator signals keep calling `shutdown()` → 0. The SessionRouter hold (`:1800-1840`) and TrAI-degraded (`:1841-1849`) paths unchanged. (SingletonLock's own signal exit, V3-12, is a separate item.) | Forced start failure in a throwaway clone → exit code 1; SIGTERM → 0. |

## Verbatim execution rule

> Land the nine items in LAND-NOW-2026-09-09.md in the stated order, one atomic commit each, on codex/multi-asset-symbol-state. For each item, before touching code: read the cited files to the end and post the read list with line ranges; if anything you read contradicts the item's "exact change," stop and report instead of adapting. Each commit's message cites the item number and the ruling. Each packet (ogz-meta/inbox/codex/<date>/land-now-L<n>/) has the diff, the read list, the acceptance receipt from the table, tests touched, and the footer. Acceptance boots happen only in a throwaway clone with its own data directory, or after Trey's explicit activation word — never against the running process. HOLD after each commit for cold-pull; do not start the next item until told.

## Scope

- Implement L6 only.
- Touch one production file and one focused test file.
- Add the Ruling 7 packet in Codex's dated inbox.
- Do not touch PM2, the Aug. 24 process, brokers, state, configuration, SingletonLock, fatal handlers, or later LAND NOW items.
