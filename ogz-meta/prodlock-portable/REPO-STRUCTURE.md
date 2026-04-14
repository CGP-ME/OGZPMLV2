# ProdLock Portable — Repo Structure

## Repository Layout

```
prodlock-portable/
├── bin/
│   └── prodlock.js              # CLI entry point
│
├── src/
│   ├── index.js                 # Main exports
│   │
│   ├── cli/
│   │   ├── init.js              # prodlock init
│   │   ├── analyze.js           # prodlock analyze
│   │   ├── approve.js           # prodlock approve
│   │   ├── reject.js            # prodlock reject
│   │   ├── status.js            # prodlock status
│   │   └── history.js           # prodlock history
│   │
│   ├── core/
│   │   ├── orchestrator.js      # Mission orchestration
│   │   ├── proposal-engine.js   # Generate proposals
│   │   ├── approval-gate.js     # Approve/reject logic
│   │   └── manifest.js          # Mission manifest schema
│   │
│   ├── agents/
│   │   ├── commander.js         # Context provider
│   │   ├── architect.js         # System mapping
│   │   ├── analyst.js           # Bug finding (entomologist)
│   │   ├── proposer.js          # Fix proposals (exterminator)
│   │   ├── critic.js            # Weakness finding
│   │   ├── validator.js         # Quality checks
│   │   └── warden.js            # Scope enforcement
│   │
│   ├── rag/
│   │   ├── index.js             # RAG query interface
│   │   ├── ledger.js            # Fix ledger management
│   │   └── scorer.js            # Relevance scoring
│   │
│   └── utils/
│       ├── git.js               # Git operations (read-only)
│       ├── fs.js                # File system helpers
│       ├── logger.js            # Audit logging
│       └── config.js            # Config loading
│
├── templates/
│   ├── config.yml               # Default config template
│   └── proposal.md              # Proposal doc template
│
├── test/
│   ├── cli/
│   ├── core/
│   ├── agents/
│   └── fixtures/
│
├── .github/
│   └── workflows/
│       └── ci.yml               # GitHub Actions
│
├── package.json
├── README.md
├── LICENSE
├── SPEC-v0.1.md
└── CHANGELOG.md
```

---

## Key Design Decisions

### 1. Single Entry Point
```javascript
// bin/prodlock.js
#!/usr/bin/env node
require('../src/cli')(process.argv.slice(2));
```

### 2. No Framework Dependencies
- No Express, no Fastify
- No React, no Vue
- Just Node.js stdlib + minimal deps

### 3. Agents Are Pure Functions
```javascript
// Each agent: (manifest, context) => updatedManifest
async function analyst(manifest, context) {
  // Find issues
  // Update manifest.analyst section
  // Return manifest
}
```

### 4. Proposals Are Markdown
- Human readable
- Git-friendly
- No proprietary format

---

## Install Flow (`npx prodlock init`)

### Step-by-Step

```
User runs: npx prodlock init
           │
           ▼
┌─────────────────────────────────┐
│ 1. Check if already initialized │
│    └─ If .prodlock/ exists, ask │
│       to --force or abort       │
└─────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ 2. Detect repo type             │
│    └─ Look for package.json     │
│    └─ Check for tsconfig.json   │
│    └─ Default: javascript       │
└─────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ 3. Create .prodlock/ structure  │
│    └─ mkdir .prodlock           │
│    └─ mkdir .prodlock/proposals │
│    └─ mkdir .prodlock/missions  │
│    └─ mkdir .prodlock/ledger    │
└─────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ 4. Write config.yml             │
│    └─ Copy from templates/      │
│    └─ Set detected language     │
└─────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ 5. Initialize empty ledger      │
│    └─ Create fixes.jsonl        │
└─────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ 6. Add to .gitignore            │
│    └─ .prodlock/.prodlock.lock  │
│    └─ (proposals ARE tracked)   │
└─────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ 7. Print success + next steps   │
└─────────────────────────────────┘
```

### Init Code Skeleton

```javascript
// src/cli/init.js

const fs = require('fs');
const path = require('path');

async function init(options = {}) {
  const cwd = process.cwd();
  const prodlockDir = path.join(cwd, '.prodlock');

  // 1. Check existing
  if (fs.existsSync(prodlockDir) && !options.force) {
    console.log('⚠️  .prodlock/ already exists. Use --force to reinitialize.');
    process.exit(1);
  }

  console.log('ProdLock Portable v0.1.0\n');

  // 2. Detect repo
  const language = detectLanguage(cwd);
  console.log(`Detecting repo... ✓ (${language})`);

  // 3. Create structure
  const dirs = ['proposals', 'missions', 'ledger'];
  fs.mkdirSync(prodlockDir, { recursive: true });
  dirs.forEach(dir => {
    fs.mkdirSync(path.join(prodlockDir, dir), { recursive: true });
  });
  console.log('Creating .prodlock/ directory... ✓');

  // 4. Write config
  const config = generateConfig(language);
  fs.writeFileSync(
    path.join(prodlockDir, 'config.yml'),
    config
  );
  console.log('Creating config... ✓');

  // 5. Init ledger
  fs.writeFileSync(
    path.join(prodlockDir, 'ledger', 'fixes.jsonl'),
    ''
  );
  console.log('Initializing local RAG... ✓');

  // 6. Update gitignore
  updateGitignore(cwd);

  // 7. Success
  console.log('\nDone. ProdLock is ready.\n');
  console.log('Next: prodlock analyze "describe your issue"');
}

function detectLanguage(cwd) {
  if (fs.existsSync(path.join(cwd, 'tsconfig.json'))) {
    return 'TypeScript';
  }
  if (fs.existsSync(path.join(cwd, 'package.json'))) {
    return 'JavaScript/Node.js';
  }
  return 'Unknown';
}

function generateConfig(language) {
  return `# ProdLock Portable Configuration
version: "0.1"
mode: advisory
language: ${language.toLowerCase().split('/')[0]}

ignore:
  - node_modules
  - .git
  - dist
  - build

rag:
  enabled: true
  local_only: true
`;
}

function updateGitignore(cwd) {
  const gitignorePath = path.join(cwd, '.gitignore');
  const entry = '\n# ProdLock\n.prodlock/.prodlock.lock\n';

  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf8');
    if (!content.includes('.prodlock.lock')) {
      fs.appendFileSync(gitignorePath, entry);
    }
  }
}

module.exports = init;
```

---

## package.json

```json
{
  "name": "prodlock-portable",
  "version": "0.1.0",
  "description": "Lock production. Let AI propose.",
  "main": "src/index.js",
  "bin": {
    "prodlock": "./bin/prodlock.js"
  },
  "scripts": {
    "test": "node --test test/**/*.test.js"
  },
  "keywords": [
    "ai",
    "devops",
    "production",
    "safety",
    "advisory",
    "code-review"
  ],
  "author": "",
  "license": "MIT",
  "engines": {
    "node": ">=18"
  },
  "dependencies": {
    "yaml": "^2.3.0"
  }
}
```

---

## What Gets Gitignored vs Tracked

### Tracked (committed to user's repo)
- `.prodlock/config.yml` — User config
- `.prodlock/proposals/*.md` — Proposals (audit trail)
- `.prodlock/missions/*.json` — Mission manifests

### Gitignored (local only)
- `.prodlock/.prodlock.lock` — Lock file
- `.prodlock/ledger/` — Optional (user decides)

---

*Repo structure designed for extraction from ogz-meta.*
