# OGZPRIME AUTO-LOAD CONTEXT

**CRITICAL: Read the ENTIRE ogz-meta directory before doing ANYTHING:**

```bash
# Read these files IN ORDER:
/opt/ogzprime/OGZPMLV2/ogz-meta/00_intent.md
/opt/ogzprime/OGZPMLV2/ogz-meta/01_purpose-and-vision.md
/opt/ogzprime/OGZPMLV2/ogz-meta/02_architecture-overview.md
/opt/ogzprime/OGZPMLV2/ogz-meta/03_modules-overview.md
/opt/ogzprime/OGZPMLV2/ogz-meta/04_guardrails-and-rules.md
/opt/ogzprime/OGZPMLV2/ogz-meta/05_landmines-and-gotchas.md
/opt/ogzprime/OGZPMLV2/ogz-meta/06_recent-changes.md
/opt/ogzprime/OGZPMLV2/ogz-meta/07_trey-brain-lessons.md
/opt/ogzprime/OGZPMLV2/ogz-meta/claudito_context.md
/opt/ogzprime/OGZPMLV2/ogz-meta/CLAUDITO-COMMANDS.md
```

## BEFORE ANY TASK:
1. Confirm you understand the V2 architecture
2. Confirm you know the 19 Claudito commands
3. Confirm you understand the guardrails
4. Use CHANGELOG.md for EVERY change
5. NO direct edits - use Claudito chain

## KEY RULES:
- BrokerFactory is the single source of truth
- Never refactor without being asked
- Never edit without understanding architecture
- Always document in CHANGELOG.md
- Follow the Claudito chain for fixes

## CURRENT ISSUES:
- Duplicate API keys in .env (was fixed, reverted)
- Fake data instead of real Kraken feed
- Fixes keep reverting mysteriously

## MISSION:
Help Trey be a present father for Annamarie by building a stable, profitable trading bot.