## Source Control & Data Loss Landmines

### SYS_WIPE_001 – Full System Wipes & Device Failures

**Symptom:**  
- Machine dies, OS corrupt, or full wipe.  
- Bot disappears with it. Multiple times.

**History:**  
- 4 computer crashes, 3 full system wipes.  
- Bot restarted from scratch three separate times.

**Lesson / Rule:**  
- Always assume the machine can vanish tomorrow.
- Non-negotiables:
  - Cold backups (offline or external).
  - VPS copies of critical code.
  - GitHub remote as a *mirror*, not the only source of truth.
- Never have **only one** copy of a working bot.

---

### GIT_NUKE_001 – `git reset --hard` Nuclear Button

**Symptom:**  
- Panic command during repo mess.  
- Suddenly “fixed” but nobody knows what silently got deleted.

**History:**  
- Used in frustration to escape a broken state.  
- Destroyed unknown amounts of work.

**Rule:**  
- `git reset --hard` is **banned** unless:
  - Everything important is backed up AND
  - We know exactly what we’re discarding.
- Use `reset --soft`, `revert`, or targeted fixes instead.
- If an AI suggests `git reset --hard`, it’s wrong by default.

---

### GIT_POISON_002 – Repo Poisoning With Giant Files

**Symptom:**  
- Git push/pull fails.  
- Repo “locks up” or pre-commit hooks blow up.  
- LLMs “don’t understand” why.

**Causes:**  
- Committing:
  - Trai brain markdown dumps.
  - Huge LLM logs.
  - Environment secrets dumped to disk.
  - Multi-GB scratch files.
- Assistants ignoring:
  - pre-commit hooks,
  - .gitignore,
  - explicit instructions about what NOT to commit.

**Rule:**  
- Never commit:
  - Trai brain files.
  - Full raw LLM transcripts.
  - `.env` or secrets stored in code.
  - Any file > a sane size limit (e.g., >5–10 MB) without explicit intent.
- AI/agents must:
  - Check `.gitignore`.
  - Check for “brain”/log/secret files before staging.
  - Explain *exactly* what they’re staging.

---

### GIT_MAIN_003 – Main Branch Corruption

**Symptom:**  
- Main branch becomes untrustworthy.  
- Production code mixed with half-baked experiments.  
- Repeated “fixes” introduce new regressions.

**History:**  
- Assistants editing `main` directly.  
- No separation between experimental work and stable trunk.

**Rule:**  
- Nobody touches `main` directly:
  - No AIs.
  - No “quick fixes.”
- All work must go through:
  - feature branches,
  - reviews,
  - and clear commit messages.
- “This is too small for a branch” is not a valid excuse.

---

### AI_ONBOARD_004 – Cold Start Sabotage

**Symptom:**  
- New AI context window shows up and instantly:
  - starts “optimizing”
  - rewrites modules
  - duplicates logic
  - renames things
  - without understanding the bot.

**Behavior Pattern:**  
- Doesn’t read:
  - full changelog,
  - architecture docs,
  - module map.
- Pretends understanding from:
  - a couple logs or partial code,
  - then wrecks shit.
- Creates:
  - duplicate modules,
  - duplicate functions doing the same thing,
  - contradictory logic paths.

**Rule:**  
- No AI/agent edits code before:
  - Reading the packed context (`claudito_context.md`)  
  - Skimming the full `CHANGELOG`, not just the top.
  - Mapping the architecture (at least once per new session).
- If an AI cannot summarize:
  - architecture,
  - key modules,
  - and what already exists,
  - it is not allowed to propose refactors.

---

### DUP_FUNC_005 – Duplicate Methods / Double-Negation

**Symptom:**  
- Two different methods do the same thing.  
- Or both wired into the flow causing double-processing or contradictions.

**Cause:**  
- AI “adds a new helper” instead of using existing one.  
- Doesn’t search for prior implementation.  
- Ends up with:
  - `saveToDisk` and `savePatternMemory` style pairs,
  - duplicate risk checks,
  - double negations.

**Rule:**  
- Before adding a new method:
  - Search the codebase for existing functionality by intent, not just name.
- Never duplicate logic just to “clean it up” unless:
  - you also remove or migrate the old one,
  - and document it in `recent-changes`.

---

### ARCH_SKIP_006 – Editing Without Understanding

**Symptom:**  
- “Optimizations” that break the design.  
- Changes that fight the architecture instead of working with it.

**Behavior:**  
- AI doesn’t:
  - map the system,
  - understand the module responsibilities,
  - read the meta-pack.
- Instantly jumps into implementation changes based on incomplete view.

**Rule:**  
- No structural or cross-module changes without:
  - a clear architectural summary from the AI,
  - confirmation it understands “who does what.”
- If an AI can’t explain:
  - how a change fits into the architecture,
  - it’s not allowed to make it.
