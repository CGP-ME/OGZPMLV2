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
const { getSemanticRAG } = require('./rag-embeddings');
const ConfigLoader = require('../foundation/ConfigLoader');

/**
 * Get current bot state
 */
function getCurrentState() {
  const config = ConfigLoader.load({ silent: true }).config;
  const configuredScope = {
    status: 'configured',
    launchProfile: config.mode.launchProfile,
    executionMode: config.mode.execution,
    tradingPair: config.execution.tradingPair,
    minTradeConfidence: config.confidence.minTradeConfidence,
    sources: {
      launchProfile: ConfigLoader.getSource('mode.launchProfile'),
      executionMode: ConfigLoader.getSource('mode.execution'),
      tradingPair: ConfigLoader.getSource('execution.tradingPair'),
      minTradeConfidence: ConfigLoader.getSource('confidence.minTradeConfidence')
    }
  };
  const state = {
    timestamp: new Date().toISOString(),
    configuredScope,
    runtime: {
      mode: 'unobserved',
      source: 'commander does not observe the active SessionRouter runtime scope'
    },
    recentChanges: [],
    knownIssues: []
  };

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
    const pm2Status = execSync('pm2 jlist 2>/dev/null', { encoding: 'utf8' });
    const processes = JSON.parse(pm2Status);
    const bot = processes.find(p => p.name === ConfigLoader.getInternalsFileValue('services.supervisor.botProcess'));
    if (bot) {
      state.botStatus = {
        running: bot.pm2_env.status === 'online',
        uptime: Date.now() - bot.pm2_env.pm_uptime,
        restarts: bot.pm2_env.restart_time,
        memory: bot.monit.memory
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
  let briefing = `# MISSION BRIEFING
Generated: ${state.timestamp}

## CURRENT BOT STATE
- **Observed runtime mode**: ${state.runtime.mode} (${state.runtime.source})
- **Configured launch profile**: ${state.configuredScope.launchProfile} (${state.configuredScope.sources.launchProfile})
- **Configured execution mode**: ${state.configuredScope.executionMode} (${state.configuredScope.sources.executionMode})
- **Configured trading pair**: ${state.configuredScope.tradingPair} (${state.configuredScope.sources.tradingPair})
- **Configured minimum trade confidence**: ${state.configuredScope.minTradeConfidence} (${state.configuredScope.sources.minTradeConfidence})
${state.botStatus ? `- **Bot Status**: ${state.botStatus.running ? 'RUNNING' : 'STOPPED'}` : ''}

## ISSUE TO INVESTIGATE
${issue}

`;

  // CRITICAL: Add semantic context about what worked/failed before
  if (state.semanticContext) {
    const ctx = state.semanticContext;

    if (ctx.do_not_repeat && ctx.do_not_repeat.length > 0) {
      briefing += `## 🛑 DO NOT REPEAT THESE APPROACHES (FAILED BEFORE)
`;
      ctx.do_not_repeat.forEach(failure => {
        briefing += `### ${failure.fix_id}\n`;
        briefing += `Similar issue: ${failure.symptom.slice(0, 80)}...\n`;
        failure.what_failed.forEach(f => {
          briefing += `- ❌ FAILED: ${f}\n`;
        });
        briefing += '\n';
      });
    }

    if (ctx.try_these_approaches && ctx.try_these_approaches.length > 0) {
      briefing += `## ✅ TRY THESE APPROACHES (WORKED BEFORE)
`;
      ctx.try_these_approaches.forEach(success => {
        briefing += `### ${success.fix_id}\n`;
        briefing += `Similar issue: ${success.symptom.slice(0, 80)}...\n`;
        briefing += `Minimal fix: ${success.minimal_fix.slice(0, 100)}...\n`;
        success.what_worked.forEach(w => {
          briefing += `- ✅ WORKED: ${w}\n`;
        });
        if (success.files && success.files.length > 0) {
          briefing += `- Files: ${success.files.join(', ')}\n`;
        }
        briefing += '\n';
      });
    }
  }

  briefing += `## RECENT CHANGES (from CHANGELOG)
${state.recentChanges.join('\n')}

## KNOWN FIXED ISSUES (DO NOT RE-INVESTIGATE)
${state.knownIssues.slice(0, 5).map(i =>
  `- ${i.id} (${i.date}): ${i.symptom.slice(0, 50)}...`
).join('\n')}

## YOUR MISSION
1. DO NOT investigate issues that are already in the Fix Ledger
2. **DO NOT REPEAT approaches that FAILED before** (see above)
3. **TRY approaches that WORKED for similar issues** (see above)
4. Focus on NEW issues not previously documented
5. Consider the configured launch scope (profile=${state.configuredScope.launchProfile}, execution=${state.configuredScope.executionMode}, confidence=${state.configuredScope.minTradeConfidence}); commander does not observe active runtime scope.
6. Check if the issue is related to recent changes

## CONTEXT FILES AVAILABLE
- /opt/ogzprime/OGZPMLV2/ogz-meta/claudito_context.md (architecture)
- /opt/ogzprime/OGZPMLV2/ogz-meta/ledger/fixes.jsonl (all fixed issues)
- /opt/ogzprime/OGZPMLV2/CHANGELOG.md (recent changes)
- /opt/ogzprime/OGZPMLV2/config/settings.json (canonical configuration through ConfigLoader)
`;

  return briefing;
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
  console.log(`   Observed runtime mode: ${state.runtime.mode}`);
  console.log(`   Configured launch profile: ${state.configuredScope.launchProfile}`);
  console.log(`   Configured execution mode: ${state.configuredScope.executionMode}`);
  console.log(`   Configured minimum trade confidence: ${state.configuredScope.minTradeConfidence}`);
  console.log(`   Known Fixed Issues: ${state.knownIssues.length}`);

  // Step 2: Check if this is a known issue (keyword search)
  console.log('\n🔍 Step 2: Checking Fix Ledger (keyword)...');
  const ragResults = ragQuery(issue);

  if (ragResults.ledger.length > 0 && ragResults.ledger[0]._score > 150) {
    console.log(`\n⚠️  KNOWN ISSUE DETECTED!`);
    console.log(`   Match: ${ragResults.ledger[0].id}`);
    console.log(`   Fixed: ${ragResults.ledger[0].date}`);
    console.log(`   Solution: ${ragResults.ledger[0].minimal_fix}`);
    console.log('\n📋 This issue was already fixed. Checking if it regressed...');
  }

  // Step 2.5: SEMANTIC RAG - Check what worked/failed before
  console.log('\n🧠 Step 2.5: Checking Institutional Memory (semantic)...');
  let semanticContext = null;
  try {
    const semanticRAG = await getSemanticRAG();
    semanticContext = await semanticRAG.getContextForIssue(issue);
    state.semanticContext = semanticContext;
  } catch (e) {
    console.log('   ⚠️ Semantic RAG unavailable, using keyword-only');
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
  console.log('   Priority: HIGH (runtime scope unobserved by commander)');

  if (state.configuredScope.minTradeConfidence === 0.03) {
    console.log('\nWARNING: Configured minimum trade confidence is VERY LOW (0.03)');
    console.log('   This configured threshold may cause rapid trading regardless of fixes.');
    console.log('   Review the canonical launch-profile confidence setting first.');
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