# STOP 1 J2 singleton acquisition manifest

- Source: J0 package J2 and current source at base SHA `8fa8d2b472a7ed63d1e3910c5930b8bb79ecc33f`.
- Date: 2026-09-16.
- Why kept: bounded implementation and direct target-filesystem evidence for exclusive acquisition of the existing singleton identity.
- Base SHA: `8fa8d2b472a7ed63d1e3910c5930b8bb79ecc33f`.
- Correction SHA: the commit containing this manifest; report the exact SHA after commit.

## Runtime files

- `core/SingletonLock.js`
- `core/AtomicWrite.js` — comment-only removal of the obsolete SingletonLock usage claim.

## Evidence files

- `MISSION.md`
- `WORK.md`
- `EVIDENCE.md`
- `REVIEW.md`
- `INHERITED.md`
- `MERCURY.md`
- `MANIFEST.md`
- `probe-j2-singleton.js`
- `PROBE-RECEIPT.json`

Unrelated pre-existing dirty and untracked files are not part of this change.
