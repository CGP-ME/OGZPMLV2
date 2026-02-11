#!/usr/bin/env node

/**
 * session-form.js
 * Session Handoff Form Helper Module
 *
 * Manages the session form that travels with every mission.
 * - Orchestrator initializes (Sections 1-3)
 * - Each Claudito appends to Section 4
 * - Scribe finalizes (Sections 5-7) and saves
 *
 * FORM LIFECYCLE:
 *   initializeSessionForm() → appendWorkLog() [repeated] → finalizeSessionForm() → saveSessionForm()
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SESSIONS_DIR = path.join(__dirname, 'sessions');
const FORM_TEMPLATE_PATH = path.join(__dirname, 'ledger', 'SESSION-HANDOFF-FORM.md');

/**
 * Collect current bot state from PM2, StateManager, and connections
 * @returns {Object} Bot state snapshot
 */
async function collectBotState() {
  const state = {
    process: {
      pm2Status: 'unknown',
      uptime: 'unknown',
      restarts: 'unknown',
      memoryUsage: 'unknown',
      cpuUsage: 'unknown'
    },
    trading: {
      mode: process.env.TRADING_MODE || process.env.BACKTEST_MODE === 'true' ? 'BACKTEST' : 'PAPER',
      inPosition: 'unknown',
      balance: 'unknown',
      activeAsset: process.env.TRADING_PAIR || 'BTC-USD',
      dailyPnL: 'unknown',
      totalTradesToday: 'unknown',
      winRate: 'unknown'
    },
    connections: {
      krakenWs: 'unknown',
      dashboardWs: 'unknown',
      lastDataReceived: 'unknown',
      sslServer: 'unknown',
      dashboardAccessible: 'unknown'
    },
    knownIssues: []
  };

  // Try to get PM2 status
  try {
    const pm2Output = execSync('pm2 jlist 2>/dev/null', { encoding: 'utf8', timeout: 5000 });
    const pm2Data = JSON.parse(pm2Output);
    const ogzProcess = pm2Data.find(p => p.name === 'ogzprime' || p.name.includes('ogz'));

    if (ogzProcess) {
      state.process.pm2Status = ogzProcess.pm2_env?.status || 'unknown';
      state.process.uptime = ogzProcess.pm2_env?.pm_uptime
        ? `${Math.floor((Date.now() - ogzProcess.pm2_env.pm_uptime) / 1000 / 60)} minutes`
        : 'unknown';
      state.process.restarts = ogzProcess.pm2_env?.restart_time || 0;
      state.process.memoryUsage = ogzProcess.monit?.memory
        ? `${Math.round(ogzProcess.monit.memory / 1024 / 1024)} MB`
        : 'unknown';
      state.process.cpuUsage = ogzProcess.monit?.cpu !== undefined
        ? `${ogzProcess.monit.cpu}%`
        : 'unknown';
    }
  } catch (e) {
    state.process.pm2Status = 'not running or pm2 unavailable';
  }

  // Try to get StateManager data
  try {
    const stateFile = path.join(__dirname, '..', 'data', 'state.json');
    if (fs.existsSync(stateFile)) {
      const stateData = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      state.trading.inPosition = stateData.position > 0
        ? `Yes (${stateData.position} @ ${stateData.entryPrice || 'unknown'})`
        : 'No';
      state.trading.balance = stateData.balance ? `$${stateData.balance.toFixed(2)}` : 'unknown';
      state.trading.dailyPnL = stateData.dailyPnL ? `$${stateData.dailyPnL.toFixed(2)}` : '$0.00';
    }
  } catch (e) {
    // State file not available
  }

  // Check SSL server
  try {
    execSync('pgrep -f "ogzprime-ssl-server" > /dev/null 2>&1');
    state.connections.sslServer = 'Running';
  } catch (e) {
    state.connections.sslServer = 'Down';
  }

  return state;
}

/**
 * Initialize a new session form (Orchestrator calls this)
 * @param {Object} mission - Mission details
 * @returns {Object} Initialized session form
 */
async function initializeSessionForm(mission = {}) {
  const now = new Date();
  const botState = await collectBotState();

  const form = {
    // Metadata
    _meta: {
      version: '1.0',
      createdAt: now.toISOString(),
      lastUpdatedAt: now.toISOString(),
      filename: null  // Set when saved
    },

    // SECTION 1: Session Identity
    identity: {
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0],
      platform: 'Claude Code',
      sessionGoal: mission.description || mission.goal || 'Not specified',
      complexity: mission.complexity || 'Medium',
      modulesInScope: mission.files || mission.modulesInScope || []
    },

    // SECTION 2: Bot State at Start
    botStateStart: botState,

    // SECTION 3: Context Check
    contextCheck: {
      guardrailsRead: false,
      landminesRead: false,
      architectureRead: false,
      recentChangesRead: false,
      pipelineAcknowledged: false,
      // These get checked off as clauditos confirm
      confirmedBy: []
    },

    // SECTION 4: Work Performed (each claudito appends here)
    workLog: [],
    filesCreated: [],
    filesModified: [],
    filesDeleted: [],
    patches: [],
    bugsFound: [],
    decisions: [],

    // SECTION 5: Bot State at End (Scribe fills)
    botStateEnd: null,

    // SECTION 6: Handoff (Scribe fills)
    handoff: {
      readyToDeploy: [],
      inProgress: [],
      needsAttention: [],
      nextSteps: []
    },

    // SECTION 7: Verification (Scribe fills)
    verification: {
      botRunning: false,
      noCrashLoops: false,
      krakenConnected: false,
      dashboardConnected: false,
      dashboardLoads: false,
      patternMemoryWorking: false,
      noNewErrors: false,
      stateConsistent: false,
      newIssuesIntroduced: []
    }
  };

  return form;
}

/**
 * Append a work entry to the session form (each Claudito calls this)
 * @param {Object} form - The session form
 * @param {Object} entry - Work entry to append
 */
function appendWorkLog(form, entry) {
  const workEntry = {
    claudito: entry.claudito || 'unknown',
    timestamp: new Date().toISOString(),
    action: entry.action || 'work performed',
    filesCreated: entry.filesCreated || [],
    filesModified: entry.filesModified || [],
    filesDeleted: entry.filesDeleted || [],
    bugsFound: entry.bugsFound || [],
    decisions: entry.decisions || [],
    notes: entry.notes || null
  };

  form.workLog.push(workEntry);

  // Also aggregate into top-level arrays for easy summary
  if (entry.filesCreated) {
    form.filesCreated.push(...entry.filesCreated);
  }
  if (entry.filesModified) {
    entry.filesModified.forEach(mod => {
      const existing = form.filesModified.find(f => f.file === mod.file);
      if (existing) {
        existing.changes.push(...(mod.changes || [mod]));
      } else {
        form.filesModified.push({
          file: mod.file,
          changes: mod.changes || [mod]
        });
      }
    });
  }
  if (entry.filesDeleted) {
    form.filesDeleted.push(...entry.filesDeleted);
  }
  if (entry.bugsFound) {
    form.bugsFound.push(...entry.bugsFound);
  }
  if (entry.decisions) {
    form.decisions.push(...entry.decisions);
  }
  if (entry.patches) {
    form.patches.push(...entry.patches);
  }

  form._meta.lastUpdatedAt = new Date().toISOString();
  return form;
}

/**
 * Mark context docs as read (Claudito confirms they read required docs)
 * @param {Object} form - The session form
 * @param {string} claudito - Which claudito is confirming
 * @param {Object} checks - Which docs were read
 */
function confirmContextRead(form, claudito, checks = {}) {
  if (checks.guardrails) form.contextCheck.guardrailsRead = true;
  if (checks.landmines) form.contextCheck.landminesRead = true;
  if (checks.architecture) form.contextCheck.architectureRead = true;
  if (checks.recentChanges) form.contextCheck.recentChangesRead = true;
  if (checks.pipeline) form.contextCheck.pipelineAcknowledged = true;

  if (!form.contextCheck.confirmedBy.includes(claudito)) {
    form.contextCheck.confirmedBy.push(claudito);
  }

  form._meta.lastUpdatedAt = new Date().toISOString();
  return form;
}

/**
 * Finalize the session form (Scribe calls this at end)
 * @param {Object} form - The session form
 * @param {Object} handoff - Handoff details
 */
async function finalizeSessionForm(form, handoff = {}) {
  // Collect end state
  form.botStateEnd = await collectBotState();

  // Fill handoff section
  form.handoff = {
    readyToDeploy: handoff.readyToDeploy || [],
    inProgress: handoff.inProgress || [],
    needsAttention: handoff.needsAttention || [],
    nextSteps: handoff.nextSteps || []
  };

  // Fill verification (Scribe should have checked these)
  if (handoff.verification) {
    form.verification = { ...form.verification, ...handoff.verification };
  }

  form._meta.lastUpdatedAt = new Date().toISOString();
  return form;
}

/**
 * Save the session form to disk
 * @param {Object} form - The completed session form
 * @returns {string} Path to saved file
 */
function saveSessionForm(form) {
  // Ensure sessions directory exists
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }

  // Generate filename
  const date = form.identity.date;
  const time = form.identity.time.replace(/:/g, '-');
  const slug = (form.identity.sessionGoal || 'session')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .substring(0, 30);

  const filename = `SESSION-${date}-${time}-${slug}.md`;
  const filepath = path.join(SESSIONS_DIR, filename);

  form._meta.filename = filename;

  // Generate markdown content
  const markdown = generateMarkdown(form);

  // Save markdown
  fs.writeFileSync(filepath, markdown);

  // Also save JSON for programmatic access
  const jsonPath = filepath.replace('.md', '.json');
  fs.writeFileSync(jsonPath, JSON.stringify(form, null, 2));

  console.log(`📋 Session form saved: ${filename}`);
  return filepath;
}

/**
 * Generate markdown from form object
 */
function generateMarkdown(form) {
  const s1 = form.identity;
  const s2 = form.botStateStart;
  const s3 = form.contextCheck;
  const s5 = form.botStateEnd || {};
  const s6 = form.handoff;
  const s7 = form.verification;

  return `# OGZPrime Session Handoff Form

> Session: ${s1.date} ${s1.time}
> Platform: ${s1.platform}
> Generated: ${form._meta.lastUpdatedAt}

---

## SECTION 1: SESSION IDENTITY

| Field | Value |
|-------|-------|
| **Date** | ${s1.date} |
| **AI Platform** | ${s1.platform} |
| **Session Goal** | ${s1.sessionGoal} |
| **Complexity** | ${s1.complexity} |
| **Modules In Scope** | ${s1.modulesInScope.join(', ') || 'None specified'} |

---

## SECTION 2: BOT STATE AT SESSION START

### 2a. Process State
| Field | Value |
|-------|-------|
| **PM2 Status** | ${s2.process?.pm2Status || 'unknown'} |
| **Uptime** | ${s2.process?.uptime || 'unknown'} |
| **Restarts** | ${s2.process?.restarts || 'unknown'} |
| **Memory Usage** | ${s2.process?.memoryUsage || 'unknown'} |
| **CPU Usage** | ${s2.process?.cpuUsage || 'unknown'} |

### 2b. Trading State
| Field | Value |
|-------|-------|
| **Mode** | ${s2.trading?.mode || 'unknown'} |
| **In Position** | ${s2.trading?.inPosition || 'unknown'} |
| **Balance** | ${s2.trading?.balance || 'unknown'} |
| **Active Asset** | ${s2.trading?.activeAsset || 'unknown'} |
| **Daily P&L** | ${s2.trading?.dailyPnL || 'unknown'} |

### 2c. Connection State
| Field | Value |
|-------|-------|
| **Kraken WS** | ${s2.connections?.krakenWs || 'unknown'} |
| **Dashboard WS** | ${s2.connections?.dashboardWs || 'unknown'} |
| **SSL Server** | ${s2.connections?.sslServer || 'unknown'} |

### 2d. Known Issues at Start
${s2.knownIssues?.length ? s2.knownIssues.map(i => `- ${i}`).join('\n') : '- None identified'}

---

## SECTION 3: CONTEXT CHECK

- [${s3.guardrailsRead ? 'x' : ' '}] Read \`ogz-meta/04_guardrails-and-rules.md\`
- [${s3.landminesRead ? 'x' : ' '}] Read \`ogz-meta/05_landmines-and-gotchas.md\`
- [${s3.architectureRead ? 'x' : ' '}] Read architecture diagrams (mermaid charts)
- [${s3.recentChangesRead ? 'x' : ' '}] Read \`ogz-meta/06_recent-changes.md\`
- [${s3.pipelineAcknowledged ? 'x' : ' '}] Confirmed: **No code changes without pipeline approval**

**Confirmed by:** ${s3.confirmedBy?.join(', ') || 'None yet'}

---

## SECTION 4: WORK PERFORMED

### 4a. Files Created
${form.filesCreated.length ? form.filesCreated.map(f => `| ${typeof f === 'string' ? f : f.file} | ${f.lines || ''} | ${f.purpose || ''} |`).join('\n') : '| None | | |'}

### 4b. Files Modified
${form.filesModified.length ? form.filesModified.map(f => `| ${f.file} | ${f.lines || ''} | ${f.what || ''} | ${f.why || ''} |`).join('\n') : '| None | | | |'}

### 4c. Files Deleted
${form.filesDeleted.length ? form.filesDeleted.map(f => `| ${typeof f === 'string' ? f : f.file} | ${f.why || ''} |`).join('\n') : '| None | |'}

### 4d. Patches Applied
${form.patches.length ? form.patches.map((p, i) => `
\`\`\`
Patch ${i + 1}: ${p.file} line ~${p.line || 'N/A'}
OLD: ${p.old || 'N/A'}
NEW: ${p.new || 'N/A'}
\`\`\`
`).join('\n') : 'None'}

### 4e. Bugs Found
${form.bugsFound.length ? form.bugsFound.map(b => `| ${b.bug || b} | ${b.severity || 'Medium'} | ${b.fixed ? 'Yes' : 'No'} | ${b.details || ''} |`).join('\n') : '| None | | | |'}

### 4f. Decisions Made
${form.decisions.length ? form.decisions.map(d => `- ${d}`).join('\n') : '- None documented'}

### Work Log (Chronological)
${form.workLog.map(w => `
**${w.claudito}** @ ${w.timestamp}
- Action: ${w.action}
${w.filesModified?.length ? `- Modified: ${w.filesModified.map(f => f.file || f).join(', ')}` : ''}
${w.notes ? `- Notes: ${w.notes}` : ''}
`).join('\n---\n')}

---

## SECTION 5: BOT STATE AT SESSION END

### 5a. Process State
| Field | Value |
|-------|-------|
| **PM2 Status** | ${s5.process?.pm2Status || 'Not captured'} |
| **Uptime** | ${s5.process?.uptime || 'Not captured'} |
| **Restarts** | ${s5.process?.restarts || 'Not captured'} |
| **Memory Usage** | ${s5.process?.memoryUsage || 'Not captured'} |
| **CPU Usage** | ${s5.process?.cpuUsage || 'Not captured'} |

### 5b. Trading State
| Field | Value |
|-------|-------|
| **Mode** | ${s5.trading?.mode || 'Not captured'} |
| **In Position** | ${s5.trading?.inPosition || 'Not captured'} |
| **Balance** | ${s5.trading?.balance || 'Not captured'} |
| **Active Asset** | ${s5.trading?.activeAsset || 'Not captured'} |
| **Daily P&L** | ${s5.trading?.dailyPnL || 'Not captured'} |

### 5c. Connection State
| Field | Value |
|-------|-------|
| **Kraken WS** | ${s5.connections?.krakenWs || 'Not captured'} |
| **Dashboard WS** | ${s5.connections?.dashboardWs || 'Not captured'} |
| **SSL Server** | ${s5.connections?.sslServer || 'Not captured'} |

### 5d. Verification Checklist
- [${s7.botRunning ? 'x' : ' '}] Bot is running (PM2 online)
- [${s7.noCrashLoops ? 'x' : ' '}] No crash loops
- [${s7.krakenConnected ? 'x' : ' '}] Kraken WS connected
- [${s7.dashboardConnected ? 'x' : ' '}] Dashboard WS connected
- [${s7.dashboardLoads ? 'x' : ' '}] Dashboard loads
- [${s7.patternMemoryWorking ? 'x' : ' '}] Pattern memory working
- [${s7.noNewErrors ? 'x' : ' '}] No new errors
- [${s7.stateConsistent ? 'x' : ' '}] State consistent

### 5e. New Issues Introduced
${s7.newIssuesIntroduced?.length ? s7.newIssuesIntroduced.map(i => `- ${i}`).join('\n') : '- None'}

---

## SECTION 6: HANDOFF TO NEXT SESSION

### What's Ready to Deploy
${s6.readyToDeploy?.length ? s6.readyToDeploy.map(i => `- ${i}`).join('\n') : '- Nothing new'}

### What's In Progress
${s6.inProgress?.length ? s6.inProgress.map(i => `- ${i}`).join('\n') : '- Nothing'}

### What Needs Attention
${s6.needsAttention?.length ? s6.needsAttention.map(i => `- ${i}`).join('\n') : '- Nothing urgent'}

### Recommended Next Steps
${s6.nextSteps?.length ? s6.nextSteps.map((s, i) => `${i + 1}. ${s}`).join('\n') : '1. Continue as planned'}

---

## SECTION 7: QUICK REFERENCE

See \`ogz-meta/ledger/SESSION-HANDOFF-FORM.md\` for command reference.

---

*Form version: ${form._meta.version} | Generated: ${form._meta.lastUpdatedAt}*
`;
}

/**
 * Load an existing session form
 * @param {string} filename - Session form filename
 * @returns {Object} Loaded form
 */
function loadSessionForm(filename) {
  const jsonPath = path.join(SESSIONS_DIR, filename.replace('.md', '.json'));
  if (fs.existsSync(jsonPath)) {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  }
  throw new Error(`Session form not found: ${filename}`);
}

/**
 * List all session forms
 * @returns {Array} List of session form filenames
 */
function listSessionForms() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    return [];
  }
  return fs.readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse();  // Most recent first
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'init':
      initializeSessionForm({ description: args[1] || 'CLI Test Session' })
        .then(form => {
          console.log('Initialized session form:');
          console.log(JSON.stringify(form, null, 2));
        });
      break;

    case 'list':
      const forms = listSessionForms();
      console.log('Session forms:');
      forms.forEach(f => console.log(`  - ${f}`));
      break;

    case 'state':
      collectBotState().then(state => {
        console.log('Current bot state:');
        console.log(JSON.stringify(state, null, 2));
      });
      break;

    default:
      console.log('Session Form Helper');
      console.log('Usage:');
      console.log('  node session-form.js init [description]  - Initialize new form');
      console.log('  node session-form.js list                - List all forms');
      console.log('  node session-form.js state               - Get current bot state');
  }
}

module.exports = {
  collectBotState,
  initializeSessionForm,
  appendWorkLog,
  confirmContextRead,
  finalizeSessionForm,
  saveSessionForm,
  loadSessionForm,
  listSessionForms
};
