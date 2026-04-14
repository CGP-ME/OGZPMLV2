# ProdLock Portable

**Lock production. Let AI propose.**

> Human-gated AI changes. Zero autonomous writes to production.

---

## The Problem

AI coding tools are getting good. Too good.

They refactor your auth layer at 2am. They "fix" a bug by deleting the test. They push to main because you forgot to say "don't."

Then you're on-call at 3am explaining to your CEO why the billing system is down.

**AI doesn't understand production. You do.**

---

## The Solution

ProdLock Portable is a drop-in control plane for AI-assisted development.

```
AI proposes → You review → You approve → Then it ships
```

Never the other way around.

---

## How It Works

```bash
# Install (< 2 minutes)
npx prodlock init

# AI finds issues, generates proposals
prodlock analyze "users can't login"

# Review the proposal (nothing changed yet)
cat .prodlock/proposals/MISSION-001.md

# You decide
prodlock approve MISSION-001   # Execute the fix
prodlock reject MISSION-001    # Discard it
```

That's it. No agents running in the background. No "let me just fix that for you."

---

## What ProdLock Does

| Feature | Description |
|---------|-------------|
| **Advisory Mode** | AI analyzes and proposes. Never executes without consent. |
| **Proposal Documents** | Every suggested change is documented before it happens. |
| **Approve / Reject CLI** | You're the gatekeeper. Period. |
| **Local RAG Memory** | Learns from YOUR fix history. Stays on YOUR machine. |
| **Audit Trail** | Every proposal, approval, and rejection is logged. |

## What ProdLock Does NOT Do

- Auto-merge
- Background agents
- "One click fix"
- Push without permission
- Touch production without you

**Constraint = Trust.**

---

## Why "Portable"?

ProdLock Portable works on any codebase:

- ✅ Drop into existing repos
- ✅ No vendor lock-in
- ✅ No cloud dependency
- ✅ No background processes
- ✅ Config-driven, repo-agnostic

Install it. Use it. Delete it. Your code stays yours.

---

## The Manifesto

We believe:

1. **AI should propose, not decide.** The human ships the code. The human owns the consequences.

2. **Production is sacred.** Nothing touches prod without explicit human approval.

3. **Memory should be local.** Your fix history, your lessons, your machine. Not our cloud.

4. **Portable means portable.** If it can't be deleted without breaking your repo, it's not portable.

5. **Constraint builds trust.** We don't do "magic." We do "explicit."

---

## Who This Is For

- **Solo devs** shipping systems they can't afford to break
- **Bot builders** who've been burned by "helpful" AI changes
- **Infra engineers** who don't trust anything that auto-commits
- **Teams** who want AI assistance without AI autonomy

## Who This Is NOT For

- People who want AI to do everything
- "Move fast and break things" culture
- Anyone looking for magic

---

## Quick Start

```bash
# 1. Initialize in your repo
npx prodlock init

# 2. Run analysis
prodlock analyze "describe the issue"

# 3. Review proposals
ls .prodlock/proposals/

# 4. Approve or reject
prodlock approve <mission-id>
```

---

## License

MIT — Use it, fork it, sell it. Just don't blame us when you ignore the proposal and push anyway.

---

**ProdLock Portable**
*Lock production. Let AI propose.*
