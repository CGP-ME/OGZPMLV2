#!/usr/bin/env node

/**
 * commander.js
 * The Mission Commander - Orchestrates all agents with proper context
 *
 * RESPONSIBILITIES:
 * - Provides current bot state to all agents
 * - Distributes CHANGELOG, Fix Ledger, and architecture
 * - Assigns appropriate agents to appropriate tasks
 * - Ensures no duplicate work or old bug hunting
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { ragQuery, formatForContext } = require('./rag-query');

/**
 * Get current bot state
 */
function getCurrentState() {
  const state = {
    timestamp: new Date().toISOString(),
    environment: {},
    recentChanges: [],
    knownIssues: [],
    activeMode: 'UNKNOWN'
  };

  // Read .env for current config
  try {
    const envContent = fs.readFileSync(path.join(path.dirname(__dirname), '.env'), 'utf8');
    const lines = envContent.split('\n');

    // Extract key settings
    lines.forEach(line => {
      if (line.includes('MIN_TRADE_CONFIDENCE')) {
        const match = line.match(/MIN_TRADE_CONFIDENCE=([0-9.]+)/);
        if (match) state.environment.MIN_TRADE_CONFIDENCE = match[1];
      }
      if (line.includes('LIVE_TRADING=true')) state.activeMode = 'LIVE_TRADING';
      if (line.includes('PAPER_TRADING=true')) state.activeMode = 'PAPER_TRADING';
      if (line.includes('BACKTEST_MODE=true')) state.activeMode = 'BACKTEST';
    });
  } catch (e) {
    console.error('Could not read .env');
  }

  // Get recent changes from CHANGELOG
  try {
    const changelog = fs.readFileSync(path.join(path.dirname(__dirname), 'CHANGELOG.md'), 'utf8');
    const recentSection = changelog.split('##')[1]; // Get most recent section
    if (recentSection) {
      state.recentChanges = recentSection
        .split('\n')
        .filter(line => line.startsWith('-'))
        .slice(0, 10);
    }
  } catch (e) {
    console.error('Could not read CHANGELOG');
  }

  // Get known issues from Fix Ledger
  try {
    const ledgerPath = path.join(__dirname, 'ledger', 'fixes.jsonl');
    if (fs.existsSync(ledgerPath)) {
      const fixes = fs.readFileSync(ledgerPath, 'utf8')
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));

      state.knownIssues = fixes.map(f => ({
        id: f.id,
        symptom: f.symptom,
        status: 'FIXED',
        date: f.date
      }));
    }
  } catch (e) {
    console.error('Could not read Fix Ledger');
  }

  // Check bot status
  try {
    const pm2Status = execSync('pm2 status --json 2>/dev/null', { encoding: 'utf8' });
    const processes = JSON.parse(pm2Status);
    const bot = processes.find(p => p.name === 'ogz-prime-v2');
    if (bot) {
      state.botStatus = {
        running: bot.status === 'online',
        uptime: bot.uptime,
        restarts: bot.restart_time,
        memory: bot.memory
      };
    }
  } catch (e) {
    // PM2 might not be available
  }

  return state;
}

/**
 * Generate context briefing for agents
 */
function generateBriefing(issue, state) {
  return `# MISSION BRIEFING
Generated: ${state.timestamp}

## CURRENT BOT STATE
- **Mode**: ${state.activeMode}
- **Trade Confidence**: ${state.environment.MIN_TRADE_CONFIDENCE || 'UNKNOWN'}
${state.botStatus ? `- **Bot Status**: ${state.botStatus.running ? 'RUNNING' : 'STOPPED'}` : ''}

## ISSUE TO INVESTIGATE
${issue}

## RECENT CHANGES (from CHANGELOG)
${state.recentChanges.join('\n')}

## KNOWN FIXED ISSUES (DO NOT RE-INVESTIGATE)
${state.knownIssues.slice(0, 5).map(i =>
  `- ${i.id} (${i.date}): ${i.symptom.slice(0, 50)}...`
).join('\n')}

## YOUR MISSION
1. DO NOT investigate issues that are already in the Fix Ledger
2. Focus on NEW issues not previously documented
3. Consider the current bot configuration (confidence=${state.environment.MIN_TRADE_CONFIDENCE})
4. Check if the issue is related to recent changes

## CONTEXT FILES AVAILABLE
- /opt/ogzprime/OGZPMLV2/ogz-meta/claudito_context.md (architecture)
- /opt/ogzprime/OGZPMLV2/ogz-meta/ledger/fixes.jsonl (all fixed issues)
- /opt/ogzprime/OGZPMLV2/CHANGELOG.md (recent changes)
- /opt/ogzprime/OGZPMLV2/.env (current configuration)
`;
}

/**
 * Assign appropriate agent based on issue type
 */
function selectAgent(issue, state) {
  const agents = {
    forensics: {
      name: 'Forensics',
      when: ['silent', 'memory leak', 'performance', 'slow', 'crash', 'stuck'],
      prompt: 'Find NEW silent bugs not in Fix Ledger'
    },
    exterminator: {
      name: 'Exterminator',
      when: ['known bug', 'regression', 'broke again', 'same issue'],
      prompt: 'Fix KNOWN bugs from Fix Ledger'
    },
    architect: {
      name: 'Architect',
      when: ['structure', 'architecture', 'design', 'refactor', 'module'],
      prompt: 'Map system architecture and dependencies'
    },
    debugger: {
      name: 'Debugger',
      when: ['test', 'error', 'exception', 'traceback', 'undefined'],
      prompt: 'Debug runtime errors and test failures'
    },
    monitor: {
      name: 'Monitor',
      when: ['dashboard', 'websocket', 'display', 'indicator', 'chart'],
      prompt: 'Check monitoring and display systems'
    }
  };

  // Score each agent
  let bestAgent = null;
  let bestScore = 0;

  for (const [key, agent] of Object.entries(agents)) {
    let score = 0;
    agent.when.forEach(keyword => {
      if (issue.toLowerCase().includes(keyword)) score += 10;
    });

    if (score > bestScore) {
      bestScore = score;
      bestAgent = agent;
    }
  }

  // Default to forensics for unknown issues
  return bestAgent || agents.forensics;
}

/**
 * Main commander function
 */
async function command(issue) {
  console.log('\n🎖️ MISSION COMMANDER ACTIVATED');
  console.log('=' .repeat(50));

  // Step 1: Get current state
  console.log('\n📊 Step 1: Assessing Current State...');
  const state = getCurrentState();
  console.log(`   Mode: ${state.activeMode}`);
  console.log(`   Confidence: ${state.environment.MIN_TRADE_CONFIDENCE}`);
  console.log(`   Known Fixed Issues: ${state.knownIssues.length}`);

  // Step 2: Check if this is a known issue
  console.log('\n🔍 Step 2: Checking Fix Ledger...');
  const ragResults = ragQuery(issue);

  if (ragResults.ledger.length > 0 && ragResults.ledger[0]._score > 150) {
    console.log(`\n⚠️  KNOWN ISSUE DETECTED!`);
    console.log(`   Match: ${ragResults.ledger[0].id}`);
    console.log(`   Fixed: ${ragResults.ledger[0].date}`);
    console.log(`   Solution: ${ragResults.ledger[0].minimal_fix}`);
    console.log('\n📋 This issue was already fixed. Checking if it regressed...');
  }

  // Step 3: Select appropriate agent
  console.log('\n🎯 Step 3: Selecting Agent...');
  const agent = selectAgent(issue, state);
  console.log(`   Selected: ${agent.name} Agent`);
  console.log(`   Mission: ${agent.prompt}`);

  // Step 4: Generate briefing
  console.log('\n📋 Step 4: Generating Mission Briefing...');
  const briefing = generateBriefing(issue, state);

  // Save briefing
  const briefingFile = path.join(__dirname, 'support-missions', `BRIEFING-${Date.now()}.md`);
  fs.writeFileSync(briefingFile, briefing);
  console.log(`   Briefing saved: ${briefingFile}`);

  // Step 5: Deploy agent with context
  console.log('\n🚀 Step 5: Deploying Agent with Full Context...');
  console.log('   Context includes:');
  console.log('   - Current bot state');
  console.log('   - CHANGELOG (recent changes)');
  console.log('   - Fix Ledger (known issues)');
  console.log('   - Architecture (claudito_context)');

  console.log('\n' + '='.repeat(50));
  console.log('MISSION BRIEFING:');
  console.log(briefing);

  console.log('\n' + '='.repeat(50));
  console.log('🎖️ Commander recommendation:');
  console.log(`   Deploy: ${agent.name} Agent`);
  console.log(`   Context: Full briefing provided`);
  console.log(`   Priority: ${state.activeMode === 'LIVE_TRADING' ? 'CRITICAL' : 'HIGH'}`);

  if (state.environment.MIN_TRADE_CONFIDENCE === '0.03') {
    console.log('\n⚠️  WARNING: Confidence is VERY LOW (0.03)');
    console.log('   This may cause rapid trading regardless of fixes!');
    console.log('   Consider raising MIN_TRADE_CONFIDENCE first.');
  }

  return {
    agent: agent.name,
    briefing,
    state,
    ragResults
  };
}

// CLI interface
if (require.main === module) {
  const issue = process.argv.slice(2).join(' ');

  if (!issue) {
    console.log('🎖️ Mission Commander');
    console.log('\nUsage: node ogz-meta/commander.js "<issue description>"');
    console.log('\nThe commander will:');
    console.log('  1. Assess current bot state');
    console.log('  2. Check if issue is already fixed');
    console.log('  3. Select appropriate agent');
    console.log('  4. Provide full context briefing');
    console.log('  5. Deploy agent with proper knowledge');
    process.exit(1);
  }

  command(issue).catch(console.error);
}

module.exports = { command, getCurrentState, selectAgent };