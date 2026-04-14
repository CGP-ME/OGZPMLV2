#!/usr/bin/env node

/**
 * ollama-brain.js
 * Local AI Brain for Claudito Pipeline
 * 
 * Calls DeepSeek R1 via Ollama to:
 * - Analyze code and find bugs (entomologist)
 * - Generate minimal fixes (exterminator)
 * - Review fixes for issues (critic)
 * 
 * No API costs. Runs entirely on local GPU.
 * 
 * USAGE:
 *   const brain = require('./ollama-brain');
 *   const analysis = await brain.analyzeBug(code, issue);
 *   const fix = await brain.generateFix(code, bugReport);
 *   const review = await brain.reviewFix(originalCode, fixedCode, issue);
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// ── CONFIG ──
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'deepseek-r1:8b';
const MAX_CODE_LINES = 300;  // Don't send entire 5000-line files
const TIMEOUT_MS = 120000;   // 2 min max per call

/**
 * Call Ollama API
 * @param {string} prompt - The prompt to send
 * @param {Object} options - Temperature, etc.
 * @returns {string} Model response text
 */
async function callOllama(prompt, options = {}) {
  const url = new URL('/api/generate', OLLAMA_HOST);
  
  const payload = JSON.stringify({
    model: options.model || MODEL,
    prompt: prompt,
    stream: false,
    options: {
      temperature: options.temperature || 0.3,  // Low temp for code analysis
      num_predict: options.maxTokens || 2048,
      top_p: 0.9
    }
  });

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: TIMEOUT_MS
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.response || '');
        } catch (e) {
          reject(new Error(`Ollama parse error: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => reject(new Error(`Ollama connection error: ${e.message}`)));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Ollama timeout after ${TIMEOUT_MS}ms`));
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Check if Ollama is running and model is available
 */
async function healthCheck() {
  try {
    const url = new URL('/api/tags', OLLAMA_HOST);
    return new Promise((resolve, reject) => {
      http.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const models = parsed.models || [];
            const hasModel = models.some(m => m.name === MODEL || m.name.startsWith(MODEL.split(':')[0]));
            resolve({
              running: true,
              models: models.map(m => m.name),
              hasRequiredModel: hasModel,
              model: MODEL
            });
          } catch (e) {
            resolve({ running: true, parseError: e.message });
          }
        });
      }).on('error', (e) => {
        resolve({ running: false, error: e.message });
      });
    });
  } catch (e) {
    return { running: false, error: e.message };
  }
}

/**
 * Extract relevant code section from a file
 * Tries to find the area most relevant to the issue
 */
function extractRelevantCode(filePath, issue, maxLines = MAX_CODE_LINES) {
  if (!fs.existsSync(filePath)) {
    return { code: '', error: `File not found: ${filePath}` };
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  // If file is small enough, return whole thing
  if (lines.length <= maxLines) {
    return { code: content, startLine: 1, endLine: lines.length, full: true };
  }

  // Search for the most relevant section
  const issueWords = issue.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  let bestStart = 0;
  let bestScore = 0;

  // Sliding window to find best section
  const windowSize = maxLines;
  for (let i = 0; i <= lines.length - windowSize; i += 20) {
    const window = lines.slice(i, i + windowSize).join('\n').toLowerCase();
    let score = 0;
    issueWords.forEach(word => {
      const matches = (window.match(new RegExp(word, 'g')) || []).length;
      score += matches;
    });

    if (score > bestScore) {
      bestScore = score;
      bestStart = i;
    }
  }

  const extracted = lines.slice(bestStart, bestStart + windowSize).join('\n');
  return {
    code: extracted,
    startLine: bestStart + 1,
    endLine: bestStart + windowSize,
    full: false,
    totalLines: lines.length
  };
}

/**
 * ENTOMOLOGIST: Analyze code to find bugs related to an issue
 * 
 * @param {string} issue - Description of the problem
 * @param {Array<string>} files - File paths to analyze
 * @param {Object} context - RAG context from ledger
 * @returns {Object} Bug analysis results
 */
async function analyzeBugs(issue, files, context = {}) {
  console.log(`\n🔬 AI Brain: Analyzing bugs for "${issue}"`);
  console.log(`   Files: ${files.join(', ')}`);
  console.log(`   Model: ${MODEL}`);

  const codeBlocks = [];
  for (const file of files.slice(0, 3)) {  // Max 3 files per analysis
    const extracted = extractRelevantCode(file, issue);
    if (extracted.code) {
      const label = extracted.full
        ? `${path.basename(file)} (complete, ${extracted.endLine} lines)`
        : `${path.basename(file)} (lines ${extracted.startLine}-${extracted.endLine} of ${extracted.totalLines})`;
      codeBlocks.push(`### ${label}\n\`\`\`javascript\n${extracted.code}\n\`\`\``);
    }
  }

  if (codeBlocks.length === 0) {
    return { bugs: [], error: 'No code files found to analyze' };
  }

  // Build known issues context
  let knownContext = '';
  if (context.knownIssues && context.knownIssues.length > 0) {
    knownContext = `\n## ALREADY FIXED (do NOT report these again):\n${context.knownIssues.map(i => `- ${i.id}: ${i.symptom}`).join('\n')}\n`;
  }

  const prompt = `You are a code auditor analyzing a JavaScript/Node.js trading bot.

## ISSUE REPORTED:
${issue}
${knownContext}
## CODE TO ANALYZE:
${codeBlocks.join('\n\n')}

## YOUR TASK:
Find bugs related to the reported issue. For each bug found, provide:
1. LOCATION: file name and approximate line number
2. TYPE: what category (logic error, missing check, wrong variable, stale data, race condition, etc.)
3. DESCRIPTION: what's wrong in 1-2 sentences
4. SEVERITY: CRITICAL / HIGH / MEDIUM / LOW
5. ROOT_CAUSE: why this happens

Format your response as a numbered list of bugs. If no bugs found, say "NO BUGS FOUND" and explain why.

Be specific. Reference actual variable names and function names from the code. Do not make up issues that aren't there.`;

  try {
    const response = await callOllama(prompt, { temperature: 0.2, maxTokens: 2048 });
    const bugs = parseBugResponse(response);
    console.log(`   Found ${bugs.length} bugs`);
    return { bugs, rawResponse: response };
  } catch (e) {
    console.error(`   ❌ AI analysis failed: ${e.message}`);
    return { bugs: [], error: e.message };
  }
}

/**
 * EXTERMINATOR: Generate a minimal fix for identified bugs
 * 
 * @param {string} issue - Original issue
 * @param {Array} bugs - Bugs found by entomologist
 * @param {Array<string>} files - File paths
 * @returns {Object} Proposed fixes
 */
async function generateFix(issue, bugs, files) {
  console.log(`\n🔧 AI Brain: Generating fix for ${bugs.length} bugs`);

  if (bugs.length === 0) {
    return { fixes: [], rawResponse: 'No bugs to fix' };
  }

  const codeBlocks = [];
  for (const file of files.slice(0, 2)) {
    const extracted = extractRelevantCode(file, issue);
    if (extracted.code) {
      codeBlocks.push(`### ${path.basename(file)}\n\`\`\`javascript\n${extracted.code}\n\`\`\``);
    }
  }

  const bugList = bugs.map((b, i) =>
    `${i + 1}. [${b.severity || 'MEDIUM'}] ${b.type || 'BUG'} at ${b.location || 'unknown'}: ${b.description}`
  ).join('\n');

  const prompt = `You are a code fixer for a JavaScript/Node.js trading bot.

## ISSUE:
${issue}

## BUGS FOUND:
${bugList}

## CURRENT CODE:
${codeBlocks.join('\n\n')}

## YOUR TASK:
Generate the MINIMAL fix for each bug. Rules:
1. Change as FEW lines as possible
2. Do NOT refactor or clean up unrelated code
3. Do NOT add new features
4. Show each fix as a BEFORE/AFTER patch

Format each fix as:
### Fix N: [bug description]
**File:** [filename]
**Line:** ~[line number]

BEFORE:
\`\`\`javascript
[exact current code]
\`\`\`

AFTER:
\`\`\`javascript
[fixed code]
\`\`\`

**Why:** [1 sentence explanation]

Be precise. The patches must be copy-paste ready.`;

  try {
    const response = await callOllama(prompt, { temperature: 0.1, maxTokens: 3000 });
    const fixes = parseFixResponse(response);
    console.log(`   Generated ${fixes.length} fixes`);
    return { fixes, rawResponse: response };
  } catch (e) {
    console.error(`   ❌ Fix generation failed: ${e.message}`);
    return { fixes: [], error: e.message };
  }
}

/**
 * CRITIC: Review a proposed fix for issues
 * 
 * @param {string} issue - Original issue
 * @param {Array} fixes - Proposed fixes
 * @param {string} code - Relevant code
 * @returns {Object} Review results
 */
async function reviewFix(issue, fixes, code) {
  console.log(`\n🔍 AI Brain: Reviewing ${fixes.length} proposed fixes`);

  const fixDescriptions = fixes.map((f, i) =>
    `Fix ${i + 1}: ${f.description || f.bug_id || 'unknown'}\n${f.patch || f.proposed_fix || 'no patch'}`
  ).join('\n\n');

  const prompt = `You are a code reviewer for a production trading bot. Safety is paramount.

## ISSUE BEING FIXED:
${issue}

## PROPOSED FIXES:
${fixDescriptions}

## RELEVANT CODE CONTEXT:
\`\`\`javascript
${(code || '').slice(0, 3000)}
\`\`\`

## REVIEW CHECKLIST:
1. Does each fix actually address the reported issue?
2. Could any fix introduce a NEW bug?
3. Are there edge cases not handled?
4. Could any fix break existing functionality?
5. Is the scope minimal (no unnecessary changes)?

## YOUR RESPONSE:
For each fix, state:
- APPROVE or REJECT
- If REJECT: what's wrong and how to improve it
- Any warnings about edge cases

Then give an overall verdict: APPROVE ALL, APPROVE WITH WARNINGS, or REJECT.`;

  try {
    const response = await callOllama(prompt, { temperature: 0.2, maxTokens: 1500 });
    return {
      review: response,
      approved: response.toLowerCase().includes('approve all') || 
                (response.toLowerCase().includes('approve') && !response.toLowerCase().includes('reject'))
    };
  } catch (e) {
    console.error(`   ❌ Review failed: ${e.message}`);
    return { review: 'Review failed: ' + e.message, approved: false };
  }
}

/**
 * Parse bug analysis response into structured data
 */
function parseBugResponse(response) {
  const bugs = [];
  
  // Remove thinking tags if present (DeepSeek R1 outputs these)
  const cleaned = response
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/Thinking\.\.\.[\s\S]*?\.\.\.done thinking\./g, '')
    .trim();
  
  // Try to find numbered items
  const bugPattern = /(\d+)\.\s*(.*?)(?=\n\d+\.|\n##|\n$|$)/gs;
  let match;

  while ((match = bugPattern.exec(cleaned)) !== null) {
    const block = match[2].trim();
    if (block.length < 10) continue;
    if (block.toLowerCase().includes('no bugs found')) continue;

    const bug = {
      type: 'CODE_ISSUE',
      location: 'unknown',
      description: block.slice(0, 500),
      severity: 'MEDIUM',
      source: 'deepseek-r1'
    };

    // Extract severity if mentioned
    if (block.match(/CRITICAL/i)) bug.severity = 'CRITICAL';
    else if (block.match(/HIGH/i)) bug.severity = 'HIGH';
    else if (block.match(/LOW/i)) bug.severity = 'LOW';

    // Extract location
    const locMatch = block.match(/(?:line|lines?)\s*~?(\d+)/i) || 
                     block.match(/(\w+\.js)/);
    if (locMatch) bug.location = locMatch[0];

    // Extract type
    const typeMatch = block.match(/TYPE:\s*(.+?)(?:\n|$)/i) ||
                      block.match(/\[(.*?)\]/);
    if (typeMatch) bug.type = typeMatch[1].trim();

    // Clean up description
    const descMatch = block.match(/DESCRIPTION:\s*(.+?)(?:\n|$)/i);
    if (descMatch) bug.description = descMatch[1].trim();

    bugs.push(bug);
  }

  // If parsing found nothing but response isn't empty, treat whole response as one finding
  if (bugs.length === 0 && cleaned.length > 50 && !cleaned.toLowerCase().includes('no bugs found')) {
    bugs.push({
      type: 'ANALYSIS',
      location: 'See full response',
      description: cleaned.slice(0, 500),
      severity: 'MEDIUM',
      source: 'deepseek-r1'
    });
  }

  return bugs;
}

/**
 * Parse fix response into structured patches
 */
function parseFixResponse(response) {
  const fixes = [];
  
  // Remove thinking tags
  const cleaned = response
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/Thinking\.\.\.[\s\S]*?\.\.\.done thinking\./g, '')
    .trim();

  // Split by "Fix N:" or "### Fix"
  const fixBlocks = cleaned.split(/(?=###?\s*Fix\s+\d|(?<=\n)Fix\s+\d)/i);

  for (const block of fixBlocks) {
    if (block.trim().length < 20) continue;

    const fix = {
      description: '',
      file: 'unknown',
      line: null,
      before: '',
      after: '',
      why: '',
      source: 'deepseek-r1'
    };

    // Extract file
    const fileMatch = block.match(/\*\*File:\*\*\s*`?(\S+\.js)`?/i) ||
                      block.match(/File:\s*(\S+\.js)/i) ||
                      block.match(/(\w+\.js)/);
    if (fileMatch) fix.file = fileMatch[1];

    // Extract line
    const lineMatch = block.match(/\*\*Line:\*\*\s*~?(\d+)/i) ||
                      block.match(/line\s*~?(\d+)/i);
    if (lineMatch) fix.line = parseInt(lineMatch[1]);

    // Extract BEFORE code block
    const beforeMatch = block.match(/BEFORE:?\s*\n```(?:javascript)?\n([\s\S]*?)```/i);
    if (beforeMatch) fix.before = beforeMatch[1].trim();

    // Extract AFTER code block
    const afterMatch = block.match(/AFTER:?\s*\n```(?:javascript)?\n([\s\S]*?)```/i);
    if (afterMatch) fix.after = afterMatch[1].trim();

    // Extract why
    const whyMatch = block.match(/\*\*Why:\*\*\s*(.+?)(?:\n|$)/i) ||
                     block.match(/Why:\s*(.+?)(?:\n|$)/i);
    if (whyMatch) fix.why = whyMatch[1].trim();

    // Extract description from header
    const descMatch = block.match(/###?\s*Fix\s+\d+:?\s*(.*?)(?:\n|$)/i);
    if (descMatch) fix.description = descMatch[1].trim();

    // Only include if we got something useful
    if (fix.before || fix.after || fix.description) {
      fixes.push(fix);
    }
  }

  // If no structured fixes found, return raw as single fix
  if (fixes.length === 0 && cleaned.length > 50) {
    fixes.push({
      description: 'See raw response for fix details',
      file: 'unknown',
      before: '',
      after: '',
      why: cleaned.slice(0, 500),
      source: 'deepseek-r1'
    });
  }

  return fixes;
}

/**
 * Determine which files are most relevant to an issue
 */
function findRelevantFiles(issue, projectDir) {
  const keywords = issue.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const candidates = [];

  // Key files to always consider
  const keyFiles = [
    'run-empire-v2.js',
    'ogzprime-ssl-server.js',
    'public/unified-dashboard.html'
  ];

  // Core modules
  const coreDir = path.join(projectDir, 'core');
  if (fs.existsSync(coreDir)) {
    fs.readdirSync(coreDir)
      .filter(f => f.endsWith('.js'))
      .forEach(f => keyFiles.push(`core/${f}`));
  }

  // Score each file by relevance to issue
  for (const file of keyFiles) {
    const fullPath = path.join(projectDir, file);
    if (!fs.existsSync(fullPath)) continue;

    let score = 0;
    const content = fs.readFileSync(fullPath, 'utf8').toLowerCase();
    const filename = file.toLowerCase();

    keywords.forEach(word => {
      // Filename match is worth more
      if (filename.includes(word)) score += 20;
      // Content matches
      const matches = (content.match(new RegExp(word, 'g')) || []).length;
      score += Math.min(matches, 10);  // Cap to avoid huge files dominating
    });

    if (score > 0) {
      candidates.push({ file, fullPath, score });
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)  // Top 5 most relevant
    .map(c => c.fullPath);
}

// ── CLI ──
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  async function main() {
    switch (command) {
      case 'health':
        const health = await healthCheck();
        console.log('🧠 Ollama Brain Health Check:');
        console.log(JSON.stringify(health, null, 2));
        break;

      case 'analyze':
        const issue = args.slice(1).join(' ');
        if (!issue) {
          console.log('Usage: node ollama-brain.js analyze "issue description"');
          process.exit(1);
        }
        const projectDir = path.resolve(__dirname, '..');
        const files = findRelevantFiles(issue, projectDir);
        console.log(`Found ${files.length} relevant files`);
        const result = await analyzeBugs(issue, files);
        console.log('\n📋 BUGS FOUND:');
        result.bugs.forEach((b, i) => {
          console.log(`\n${i + 1}. [${b.severity}] ${b.type}`);
          console.log(`   Location: ${b.location}`);
          console.log(`   ${b.description}`);
        });
        break;

      case 'fix':
        const fixIssue = args.slice(1).join(' ');
        if (!fixIssue) {
          console.log('Usage: node ollama-brain.js fix "issue description"');
          process.exit(1);
        }
        const projDir = path.resolve(__dirname, '..');
        const relevantFiles = findRelevantFiles(fixIssue, projDir);
        const analysis = await analyzeBugs(fixIssue, relevantFiles);
        if (analysis.bugs.length > 0) {
          const fixResult = await generateFix(fixIssue, analysis.bugs, relevantFiles);
          console.log('\n🔧 PROPOSED FIXES:');
          console.log(fixResult.rawResponse);
        }
        break;

      default:
        console.log('🧠 Ollama Brain - Local AI for Claudito Pipeline');
        console.log('\nCommands:');
        console.log('  health                     Check Ollama status');
        console.log('  analyze "issue"            Find bugs related to issue');
        console.log('  fix "issue"                Find bugs AND generate fixes');
        console.log('\nConfig:');
        console.log(`  OLLAMA_HOST=${OLLAMA_HOST}`);
        console.log(`  OLLAMA_MODEL=${MODEL}`);
    }
  }

  main().catch(console.error);
}

module.exports = {
  callOllama,
  healthCheck,
  analyzeBugs,
  generateFix,
  reviewFix,
  extractRelevantCode,
  findRelevantFiles
};
