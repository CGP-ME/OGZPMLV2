#!/usr/bin/env node
/**
 * Mercury-2 Project Analyzer
 * Sends project context to Inception Labs Mercury-2 for analysis
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const API_URL = 'https://api.inceptionlabs.ai/v1/chat/completions';
const API_KEY = process.env.INCEPTION_API_KEY;

if (!API_KEY) {
  console.error('❌ INCEPTION_API_KEY not set in .env');
  process.exit(1);
}

// Files to include in context (reduced for rate limits)
const CONTEXT_FILES = [
  'core/TradingLoop.js',
  'foundation/ConfigLoader.js',
  'core/ExitContractManager.js',
];

// Gather file tree
function getFileTree(dir, prefix = '', depth = 2) {
  if (depth === 0) return '';
  let result = '';
  try {
    const items = fs.readdirSync(dir).filter(f =>
      !f.startsWith('.') &&
      !['node_modules', 'tuning', 'data', 'backtest-results'].includes(f)
    );
    items.forEach((item, i) => {
      const fullPath = path.join(dir, item);
      const isLast = i === items.length - 1;
      const stat = fs.statSync(fullPath);
      result += `${prefix}${isLast ? '└── ' : '├── '}${item}\n`;
      if (stat.isDirectory()) {
        result += getFileTree(fullPath, prefix + (isLast ? '    ' : '│   '), depth - 1);
      }
    });
  } catch (e) {}
  return result;
}

// Read file safely
function readFile(filepath) {
  try {
    const fullPath = path.join(__dirname, '..', filepath);
    const content = fs.readFileSync(fullPath, 'utf8');
    // Truncate large files
    if (content.length > 15000) {
      return content.slice(0, 15000) + '\n\n... [truncated]';
    }
    return content;
  } catch (e) {
    return `[File not found: ${filepath}]`;
  }
}

// Build context
function buildContext() {
  let context = `# OGZ Prime V14 - Project Analysis Request\n\n`;

  context += `## File Structure\n\`\`\`\n`;
  context += getFileTree(path.join(__dirname, '..'), '', 3);
  context += `\`\`\`\n\n`;

  context += `## Key Files\n\n`;
  CONTEXT_FILES.forEach(file => {
    context += `### ${file}\n\`\`\`javascript\n`;
    context += readFile(file);
    context += `\n\`\`\`\n\n`;
  });

  return context;
}

// Call Mercury-2
async function callMercury(prompt, context) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: 'mercury-2',
      messages: [
        {
          role: 'system',
          content: 'You are an expert trading system architect analyzing a crypto trading bot codebase. Provide detailed technical analysis.'
        },
        {
          role: 'user',
          content: `${prompt}\n\n---\n\n${context}`
        }
      ],
      max_tokens: 4000
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error: ${response.status} - ${err}`);
  }

  return response.json();
}

// Main
async function main() {
  const prompt = process.argv[2] || 'Analyze this trading bot codebase. Identify architectural issues, potential bugs, and suggest improvements.';

  console.log('📊 Gathering project context...');
  const context = buildContext();
  console.log(`📦 Context size: ${(context.length / 1024).toFixed(1)} KB`);

  console.log('🚀 Calling Mercury-2...\n');

  try {
    const result = await callMercury(prompt, context);
    console.log('═'.repeat(60));
    console.log('MERCURY-2 ANALYSIS');
    console.log('═'.repeat(60));
    console.log(result.choices[0].message.content);
    console.log('═'.repeat(60));
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
