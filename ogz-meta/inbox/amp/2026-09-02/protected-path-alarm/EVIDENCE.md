# Evidence

## Subject

- Parent: `4ac6d0108bf169d44874d74181a4ee883477434f`.
- Guard files: `scripts/check-protected-paths.js` and
  `.github/workflows/protected-paths.yml`.
- Guard-file patch SHA-256 before packet creation:
  `47aa21fabf256001b56d61339ddfd1289da17b0eea4aab89049198f819c452f2`.
- Script SHA-256:
  `98f3b9dbebcb03d13cb00e205c45422e909ea9c79513fee17474995dd44a8f81`.
- Workflow SHA-256:
  `e1c97b5fb06b36971091d8b1c2a195e4335e261d23763e24535bd5c4ebc3c84a`.

## Red/green construction receipt

Before reconstruction, invoking the target script against protected commit
`3727b75d` exited 1 with `MODULE_NOT_FOUND`. After reconstruction, the same
one-commit range with `NTFY_TOPIC` unset exited 0 and reported:

```text
ALARM DELIVERY ABSENCE: NTFY_TOPIC is absent; notification delivery is unavailable and unproven. Detection remains non-blocking.
Protected path detection complete: commits=1 touching=1 delivered=0 unavailable=1.
```

This green status proves non-blocking policy only. It does not prove
notification delivery.

The clean commit range `4ac6d010^..4ac6d010` exited 0:

```text
Protected path detection complete: commits=1 touching=0 delivered=0 unavailable=0.
```

An invalid base exited 1 with the named prefix
`PROTECTED PATH ALARM MALFUNCTION`.

## New-branch cardinality correction

The preserved zero-base implementation was executed with a 40-zero base and
`4ac6d010` head. It exited 0 after scanning all 2,026 historical commits and
reported 115 touching commits/115 unavailable notifications. That is a
mechanically reproduced alarm-storm defect, not testimony.

The corrected workflow supplies the existing GitHub repository default-branch
ref. The script computes `merge-base(head, default)` and scans only that range.
A simulated created branch with protected commit `3727b75d` and its parent as
the default base exited 0:

```text
ALARM DELIVERY ABSENCE: NTFY_TOPIC is absent; notification delivery is unavailable and unproven. Detection remains non-blocking.
Protected path detection complete: commits=1 touching=1 delivered=0 unavailable=1.
```

Missing created-branch context exits 1 as a named invocation malfunction;
branch deletion exits 0 with zero commits.

## Merge-result correction

A disposable trusted-host repository created an evil merge whose first-parent
diff alone added `.claude/merge-only.txt`. On git 2.53.0 the preserved command
produced empty diff output, and the detector reported:

```text
Protected path detection complete: commits=2 touching=0 delivered=0 unavailable=0.
```

After adding explicit `--diff-merges=first-parent`, raw `git diff-tree` emitted
`.claude/merge-only.txt` and the detector reported:

```text
ALARM DELIVERY ABSENCE: NTFY_TOPIC is absent; notification delivery is unavailable and unproven. Detection remains non-blocking.
Protected path detection complete: commits=2 touching=1 delivered=0 unavailable=1.
```

## AST and static receipts

Trusted Acorn parsed all 222 script lines. Relevant AST references:

- `commitsInRange`: definition line 47, call line 177;
- `protectedPathsForCommit`: definition line 75, call line 188;
- `commitDetails`: definition line 93, call line 195;
- `notificationBody`: definition line 107, call line 202;
- `sendNotification`: definition line 118, call line 202;
- `process.env.NTFY_TOPIC`: line 119.

`node --check`, `git diff --check`, and the scan for trailer/approval/exemption
language completed successfully. These checks support syntax and scope; they
are not notification-delivery authority.

## Selected-panel runs

- `2026-09-02T05-18-08-772Z-3a5fc7aa1f02`: selected `fable,kimi`, Mercury
  unselected. Fable found the zero-base storm; Kimi response terminated before
  completion. Authority `UNVERIFIED`.
- `2026-09-02T05-27-01-560Z-b423738da185`: selected `fable,kimi`, Mercury
  unselected. Fable requested the merge-result probe; Kimi response terminated
  before completion. Authority `UNVERIFIED`.
- `2026-09-02T05-32-02-638Z-cac1af159d78`: selected `kimi,fable`, Mercury
  unselected. Both seats returned pass, but Kimi omitted required doctrine
  sections and Fable disputed Kimi's evidence characterization. Durable panel
  authority remained `UNVERIFIED` with `evidence_failure` and
  `reviewer_disagreement`. Fable independently found no remaining artifact
  break and explicitly kept live delivery unproven.

The selected panel's cap is preserved. Surviving pass statements are not
upgraded into a stronger ledger or packet verdict.

## Forced buzz

The initial transport submission used the then-loaded repository topic and was
accepted, but no phone receipt followed. Trey corrected `NTFY_TOPIC` in the
operator-owned VPS `.env`. The trusted host then reloaded that file through the
existing dotenv path without printing the value or changing any env/config
file, and sent exactly one fresh alert against protected commit `3727b75d`.
Fresh-send output:

```text
Sent max-priority protected-path notification.
Protected path detection complete: commits=1 touching=1 delivered=1 unavailable=0.
```

This proves ntfy accepted the fresh max-priority transport submission. It does
not prove phone receipt. Trey reported no phone notification.

The executor log receipts the fresh invocation at
`2026-09-02T08:57:34.253Z`. It explicitly loaded
`/opt/ogzprime/OGZPMLV2/.env` with dotenv `override: true`; the inherited process
environment had no `NTFY_TOPIC`. The file contains two distinct, nonempty,
well-formed topic assignments at lines 114 and 331. Dotenv's effective value is
the later line 331, so line 114 is shadowed. The detector trims that value and
percent-encodes it as one path segment.

The detector intentionally discarded the POST response body and exact 2xx
status, so neither can be reconstructed from its stdout. A read-only ntfy
history lookup against the currently effective topic returned HTTP 200 and
found the exact expected message twice: initial ID `x7TRDcNgLdxZ` at
`2026-09-02T05:32:23Z`, and fresh ID `7okDovRU1OPv` at
`2026-09-02T08:57:34Z`, both priority 5. This proves the fresh send ran and was
stored on the same effective topic as the initial send; it does not prove phone
delivery. No retry was sent during this audit.

Trey then deleted the obsolete duplicate assignment and confirmed the intended
topic remained. At `2026-09-02T09:07:54.735Z`, the host verified exactly one
nonempty normalized topic assignment, explicitly reloaded the same `.env` via
dotenv with `override: true`, and invoked the staged detector exactly once. The
detector recorded one touching commit and one delivered submission. Its direct
POST status was 2xx, though the exact code remains unavailable because the
detector discards it. The immediate history poll raced storage visibility; a
read-only follow-up returned HTTP 200 and found exactly one matching priority-5
message: ID `cBzweQ6T03BF`, timestamp `2026-09-02T09:07:54Z`, body SHA-256
`9ae0285b9f3764001871ffcc78b03ab9026d067e7ec591f3145ff55785e43499`.
No further alert was sent. Trey confirmed that this final alert arrived on his
phone; transport and phone delivery are therefore both receipted for the final
forced alert.

## Named absences and limitations

- The first two transport-accepted attempts did not produce phone receipt; the
  final alert after duplicate removal was confirmed on Trey's phone.
- The earlier duplicate-topic defect was operator-corrected before the final
  send; the host verified one remaining normalized assignment. This mission did
  not modify env/config.
- The final GitHub push/workflow run has not yet occurred; workflow green and
  workflow-secret delivery remain unproven until push.
- No live HTTP non-2xx/timeout fault was induced. Those code paths remain
  mechanically visible but not live-probed.
- Mercury was deliberately unselected because its account was last proven
  inactive; it was not attempted or counted as a failed selected seat.
- Kimi's first two selected calls terminated before completion. Its final call
  succeeded but omitted required doctrine sections.
- No broker call, order, PM2 action, runtime activation, or environment/config
  value mutation occurred.
