// tools/repodumpforgpt.js
// OGZPrime Repo Dumper for GPT ingestion
// Trey-safe version (no token blowups, no missing files, no bullshit)

import fs from 'fs';
import path from 'path';

const IGNORE_DIRS = [
  'node_modules',
  '.git',
  '.vscode',
  '.idea',
  'dist',
  'build',
  'out',
  'logs',
  'coverage',
  '__pycache__',
  'trai_brain'  // Exclude brain files directory
];

const IGNORE_FILES = [
  '.DS_Store',
  'package-lock.json',
  'yarn.lock',
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.gif',
  '*.mp4',
  '*.zip',
  '*.tar',
  '*.gz'
];

// Max characters per block for GPT
const MAX_CHARS = 14000;

/**
 * Recursively walks a directory and returns file paths.
 */
function walk(dir) {
  let files = [];

  if (!fs.existsSync(dir)) {
    console.error(`Directory does not exist: ${dir}`);
    return files;
  }

  for (const file of fs.readdirSync(dir)) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);

    // Skip ignored dirs
    if (stat.isDirectory()) {
      if (!IGNORE_DIRS.includes(file)) {
        files = files.concat(walk(full));
      }
      continue;
    }

    // Skip ignored files
    if (IGNORE_FILES.some(pattern => {
      // Handle glob patterns
      if (pattern.includes('*')) {
        const regex = pattern.replace(/\*/g, '.*').replace(/\./g, '\\.');
        return file.match(new RegExp(regex));
      }
      return file === pattern;
    })) {
      continue;
    }

    files.push(full);
  }

  return files;
}

/**
 * Splits large text files into GPT-safe chunks.
 */
function chunkText(text, size = MAX_CHARS) {
  const chunks = [];
  let i = 0;

  while (i < text.length) {
    chunks.push(text.slice(i, i + size));
    i += size;
  }

  return chunks;
}

/**
 * Dumps repo into a consumable structure for GPT.
 */
export function dumpRepo(repoPath) {
  const filePaths = walk(repoPath);
  const output = [];

  for (const filePath of filePaths) {
    try {
      // Skip large JSON files (brain files) but keep .md files
      const stats = fs.statSync(filePath);
      if (filePath.endsWith('.json') && stats.size > 1000000) { // Skip JSON files > 1MB
        console.log(`Skipping large JSON: ${filePath} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const chunks = chunkText(content);

      output.push({
        file: filePath,
        chunks: chunks.map((c, idx) => ({
          index: idx,
          text: c
        }))
      });

    } catch (e) {
      console.error(`Failed reading ${filePath}:`, e);
    }
  }

  return output;
}

/**
 * CLI runner
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const repoDir = process.argv[2] || process.cwd();
  console.log(`\n🔍 Dumping repo at: ${repoDir}\n`);

  const result = dumpRepo(repoDir);
  const outFile = path.join(repoDir, 'repodumpforgpt.json');

  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
  console.log(`✅ Dump written to ${outFile}\n`);
}