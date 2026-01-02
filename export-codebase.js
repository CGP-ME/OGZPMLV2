#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Configuration
const OUTPUT_FILE = 'codebase-export.txt';
const EXCLUDE_DIRS = [
  'node_modules',
  '.git',
  'backups',
  'cleanup-20251231',
  'trai_brain',
  '.pm2',
  'logs'
];

const EXCLUDE_EXTENSIONS = [
  '.md',
  '.log',
  '.lock',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.gguf'
];

const INCLUDE_EXTENSIONS = [
  '.js',
  '.json',
  '.env',
  '.html',
  '.css',
  '.yml',
  '.yaml',
  '.sh'
];

// Main export function
function exportCodebase(dir, output) {
  const files = [];

  function scanDirectory(currentPath, depth = 0) {
    if (depth > 10) return; // Prevent infinite recursion

    try {
      const items = fs.readdirSync(currentPath);

      for (const item of items) {
        const fullPath = path.join(currentPath, item);
        const relativePath = path.relative(dir, fullPath);
        const stats = fs.statSync(fullPath);

        // Skip excluded directories
        if (stats.isDirectory()) {
          if (EXCLUDE_DIRS.some(excluded => item === excluded || item.startsWith('.'))) {
            continue;
          }
          scanDirectory(fullPath, depth + 1);
        }
        // Process files
        else if (stats.isFile()) {
          const ext = path.extname(item).toLowerCase();

          // Skip excluded extensions
          if (EXCLUDE_EXTENSIONS.includes(ext)) {
            continue;
          }

          // Include only specified extensions
          if (INCLUDE_EXTENSIONS.includes(ext)) {
            files.push({
              path: relativePath,
              size: stats.size,
              ext: ext
            });
          }
        }
      }
    } catch (err) {
      console.error(`Error scanning ${currentPath}: ${err.message}`);
    }
  }

  // Start scanning
  console.log('🔍 Scanning codebase...');
  scanDirectory(dir);

  // Sort files by extension then path
  files.sort((a, b) => {
    if (a.ext !== b.ext) return a.ext.localeCompare(b.ext);
    return a.path.localeCompare(b.path);
  });

  // Write structured output
  let outputContent = '';
  outputContent += '=' .repeat(80) + '\n';
  outputContent += ' OGZPRIME V2 CODEBASE EXPORT\n';
  outputContent += ' Generated: ' + new Date().toISOString() + '\n';
  outputContent += ' Total Files: ' + files.length + '\n';
  outputContent += '=' .repeat(80) + '\n\n';

  // Group by extension
  const grouped = {};
  for (const file of files) {
    if (!grouped[file.ext]) grouped[file.ext] = [];
    grouped[file.ext].push(file);
  }

  // Write table of contents
  outputContent += 'TABLE OF CONTENTS\n';
  outputContent += '-'.repeat(40) + '\n';
  for (const [ext, items] of Object.entries(grouped)) {
    outputContent += `${ext}: ${items.length} files\n`;
  }
  outputContent += '\n';

  // Write each file's content
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(dir, file.path), 'utf8');

      outputContent += '\n';
      outputContent += '=' .repeat(80) + '\n';
      outputContent += `FILE: ${file.path}\n`;
      outputContent += `SIZE: ${file.size} bytes\n`;
      outputContent += '-'.repeat(80) + '\n';
      outputContent += content;
      outputContent += '\n';

    } catch (err) {
      outputContent += `ERROR READING FILE: ${err.message}\n`;
    }
  }

  // Write to file
  fs.writeFileSync(output, outputContent);
  console.log(`✅ Exported ${files.length} files to ${output}`);
  console.log(`📊 File size: ${(outputContent.length / 1024 / 1024).toFixed(2)} MB`);

  // Summary
  console.log('\n📁 Files by type:');
  for (const [ext, items] of Object.entries(grouped)) {
    console.log(`  ${ext}: ${items.length}`);
  }
}

// Run export
const rootDir = process.cwd();
const outputPath = path.join(rootDir, OUTPUT_FILE);

console.log('🚀 Starting codebase export...');
console.log(`📂 Root: ${rootDir}`);
console.log(`📄 Output: ${outputPath}`);

exportCodebase(rootDir, outputPath);

console.log('\n✨ Export complete!');
console.log(`📋 View with: cat ${OUTPUT_FILE} | less`);