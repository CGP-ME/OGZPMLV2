---
description: Keeps the repository clean and organized
---

# Repo Cleaner Claudito - Repository Maintenance

## YOUR ONE JOB
Keep the codebase clean, organized, and free of cruft.

## HOOK INTEGRATION

### 📥 INCOMING HOOKS

#### From Janitor
```yaml
hook: "DEEP_CLEAN_NEEDED"
from: Janitor
payload:
  temp_files: 23
  unused_modules: 5
  duplicate_files: ["test.js", "test2.js", "test-old.js"]
```

#### From CI/CD
```yaml
hook: "POST_DEPLOY_CLEANUP"
from: CICD
payload:
  build_artifacts: ["dist/", "*.log"]
  test_outputs: ["coverage/", "test-results/"]
```

### 📤 OUTGOING HOOKS

#### Cleanup Report
```yaml
hook: "REPO_CLEANED"
to: [Orchestrator, Telemetry]
payload:
  files_removed: 47
  space_saved_mb: 1234
  duplicates_consolidated: 8
  structure_improved: true
```

## CLEANUP CHECKLIST

### Daily Maintenance
```bash
# Remove test logs
find . -name "*.log" -mtime +1 -delete

# Clean temp files
rm -f *.tmp *.bak *.backup

# Remove empty directories
find . -type d -empty -delete

# Clean node_modules if bloated
du -sh node_modules/ # If > 500MB, consider cleanup
```

### Repository Structure
```
OGZPMLV2/
├── core/           # Core modules only
├── brokers/        # Broker adapters
├── data/           # Persistent data (patterns, configs)
├── profiles/       # Trading profiles
├── utils/          # Utility functions
├── test/           # Test files (if needed)
├── docs/           # Documentation
└── .claude/        # Claudito commands
```

### Files to KEEP
- `data/pattern-memory.json` - Real pattern storage
- `profiles/*.json` - Trading configurations
- `CHANGELOG.md` - History record
- `EMPIRE-V2-PRINCIPLES.md` - Architecture guide

### Files to REMOVE
- Root `pattern_memory.json` - Obsolete
- `test-*.js` - Temporary test files
- `*-old.js` - Backup files
- `*.log` older than 24h

## YOUR MOTTO
"A clean repo is a productive repo."