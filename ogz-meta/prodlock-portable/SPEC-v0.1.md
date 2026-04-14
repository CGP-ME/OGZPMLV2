# ProdLock Portable v0.1 Specification

**Version:** 0.1.0 (MVP)
**Status:** Draft
**Target:** First public release

---

## Core Principle

> ProdLock Portable proposes. It never executes without explicit human approval.

If any feature violates this principle, it does not ship.

---

## v0.1 Scope

### INCLUDED (Must Have)

| Feature | Description | Status |
|---------|-------------|--------|
| `prodlock init` | One-command setup in any repo | Required |
| Advisory Mode | Default ON, cannot be disabled in v0.1 | Required |
| Proposal Engine | Generates proposal documents for review | Required |
| `prodlock analyze` | Triggers analysis of an issue | Required |
| `prodlock approve` | Human approves a proposal | Required |
| `prodlock reject` | Human rejects a proposal | Required |
| Local RAG | Learns from local fix history | Required |
| Audit Trail | Logs all proposals/approvals/rejections | Required |
| Mission Manifests | State tracking for each mission | Required |
| JavaScript Support | Works on JS/TS codebases | Required |

### EXCLUDED (Explicitly NOT in v0.1)

| Feature | Reason |
|---------|--------|
| Execute Mode | Trust must be earned first |
| Auto-merge | Violates core principle |
| Background agents | No daemons, ever |
| Cloud sync | Local-first, cloud later |
| Multi-language | JS first, others in v0.2+ |
| Web UI | CLI only for v0.1 |
| Team features | Solo dev focus first |
| Paid tier | Free to start, monetize later |

---

## Installation Requirements

### Must Be True

- [ ] `npx prodlock init` works in < 2 minutes
- [ ] Zero dependencies on external services
- [ ] Creates `.prodlock/` folder only
- [ ] Touches NO existing files during init
- [ ] Works offline after init
- [ ] No background processes spawned

### Init Flow

```bash
$ npx prodlock init

ProdLock Portable v0.1.0

Detecting repo... ✓ (JavaScript/Node.js)
Creating .prodlock/ directory... ✓
Initializing local RAG... ✓
Creating config... ✓

Done. ProdLock is ready.

Next: prodlock analyze "describe your issue"
```

### What Init Creates

```
.prodlock/
├── config.yml           # User configuration
├── proposals/           # Generated proposals
├── missions/            # Mission manifests
├── ledger/              # Fix history (local RAG)
│   └── fixes.jsonl
└── .prodlock.lock       # Lock file (gitignored)
```

---

## CLI Commands (v0.1)

### `prodlock init`
Initialize ProdLock in current repo.

```bash
prodlock init [--force]
```

### `prodlock analyze <issue>`
Analyze an issue and generate proposal.

```bash
prodlock analyze "users can't login after password reset"
```

Output: Creates proposal document in `.prodlock/proposals/`

### `prodlock approve <mission-id>`
Approve a proposal for execution.

```bash
prodlock approve MISSION-1234567890
```

### `prodlock reject <mission-id> <reason>`
Reject a proposal.

```bash
prodlock reject MISSION-1234567890 "Wrong approach"
```

### `prodlock status`
Show current missions and their states.

```bash
prodlock status
```

### `prodlock history`
Show approval/rejection history.

```bash
prodlock history [--limit 10]
```

---

## Proposal Document Format

Every proposal MUST include:

```markdown
# PROPOSAL: MISSION-{id}
Generated: {timestamp}

## ⚠️ ADVISORY MODE - NO CHANGES MADE
This document proposes changes for human review.
Nothing has been modified. You must approve before execution.

---

## Issue
{user-provided issue description}

## Analysis
{what ProdLock found}

## Proposed Changes
{specific changes with before/after}

## Impact
{files affected, dependencies, risks}

## To Approve
prodlock approve {mission-id}

## To Reject
prodlock reject {mission-id} "reason"
```

---

## Config File (config.yml)

```yaml
# .prodlock/config.yml

version: "0.1"

# Mode (advisory-only in v0.1)
mode: advisory

# Language detection
language: auto  # or: javascript, typescript

# Paths
ignore:
  - node_modules
  - .git
  - dist
  - build

# RAG settings
rag:
  enabled: true
  local_only: true
```

---

## Success Criteria for v0.1

### Functional
- [ ] Init works on fresh JS/TS repo
- [ ] Analyze generates coherent proposals
- [ ] Approve/reject update mission state
- [ ] Audit trail is accurate
- [ ] RAG retrieves relevant history

### Non-Functional
- [ ] Init < 2 minutes
- [ ] Analyze < 30 seconds for typical issue
- [ ] Zero network calls required
- [ ] Works on Node 18+
- [ ] < 50MB total install size

### Trust
- [ ] NEVER modifies code without approval
- [ ] NEVER commits without approval
- [ ] NEVER runs background processes
- [ ] ALL actions logged

---

## Out of Scope Decisions

These are NOT bugs, they are intentional constraints:

1. **No auto-fix** — User asked, we said no
2. **No cloud** — Local-first by design
3. **No web UI** — CLI is the interface
4. **No Python/Go/Rust** — JS only in v0.1
5. **No team sync** — Solo dev focus

---

## Release Checklist

- [ ] README complete
- [ ] npm package published
- [ ] `npx prodlock init` works
- [ ] Demo GIF recorded
- [ ] One blog post written
- [ ] Hacker News post drafted
- [ ] r/programming post drafted

---

*ProdLock Portable v0.1 — Lock production. Let AI propose.*
