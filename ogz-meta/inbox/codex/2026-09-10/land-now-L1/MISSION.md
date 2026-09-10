# Mission

Dispatcher and ruling authority: Trey.

Status: GO for L1 only; HOLD after its commit for cold-pull.

## Verbatim L1 tasking

> | L1 | **Required-module list honest** | Doctrine (boot must not lie); B19; C-12 | `core/ModuleAutoLoader.js` (whole file — Sol full read; Fable 127-135, 245-283, required lists at 136-145) | Remove `OptimizedTradingBrain` from `required` (file absent at e54a8b8). In `loadDirectory()`, a required module that throws propagates instead of returning `{}` (`:130-135, :245-250`). `loadAll()` calls `validateModules()` (`:267-283`) and refuses boot naming any missing required module; the "ALL MODULES LOADED" print becomes the validated list. | Boot log prints the enumerated required list with each found; a test that removes a required file's name → boot refused naming it. |

## Verbatim execution rule

> Land the nine items in LAND-NOW-2026-09-09.md in the stated order, one atomic commit each, on codex/multi-asset-symbol-state. For each item, before touching code: read the cited files to the end and post the read list with line ranges; if anything you read contradicts the item's "exact change," stop and report instead of adapting. Each commit's message cites the item number and the ruling. Each packet (ogz-meta/inbox/codex/<date>/land-now-L<n>/) has the diff, the read list, the acceptance receipt from the table, tests touched, and the footer. Acceptance boots happen only in a throwaway clone with its own data directory, or after Trey's explicit activation word — never against the running process. HOLD after each commit for cold-pull; do not start the next item until told.

## Scope

- Implement L1 only.
- Touch one production file and one focused test file.
- Add the Ruling 7 packet in Codex's dated inbox.
- Do not touch PM2, the Aug. 24 process, brokers, state, configuration, or later LAND NOW items.
