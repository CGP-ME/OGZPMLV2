#!/usr/bin/env node
/**
 * GPT REPO DUMPER
 * ----------------
 * Dumps ALL relevant source code from OGZPrime into a SINGLE FILE
 * for ChatGPT/manual review. This is NOT the Claudito version.
 *
 * Output: ogz-meta/gpt_repo_dump.txt
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(REPO_ROOT, "ogz-meta");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "gpt_repo_dump.txt");

// Directories to skip
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "logs",
  "bombing-results",
  ".vscode",
  ".idea",
  "ogz-meta" // avoid recursion dumping itself
]);

// File types to include
const INCLUDE_EXTS = new Set([
  ".js",
  ".json",
  ".ts",
  ".jsx",
  ".tsx",
  ".html",
  ".css",
  ".md",
  ".yml",
  ".yaml",
  ".env.example",
  ".sh"
]);

function shouldInclude(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath);

  // Include extensionless executables and configs
  if (basename === 'Dockerfile' || basename === '.gitignore' || basename === '.env.example') {
    return true;
  }

  return INCLUDE_EXTS.has(ext);
}

function walk(dir, relBase = "") {
  let results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const e of entries) {
      const full = path.join(dir, e.name);
      const rel = path.join(relBase, e.name);

      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) {
          results = results.concat(walk(full, rel));
        }
      } else if (e.isFile() && shouldInclude(full)) {
        // Skip huge files
        const stats = fs.statSync(full);
        if (stats.size < 1000000) { // Skip files > 1MB
          results.push(rel);
        }
      }
    }
  } catch (err) {
    console.warn(`Skipping ${dir}: ${err.message}`);
  }

  return results;
}

function main() {
  console.log("📦 GPT REPO DUMPER STARTED");
  console.log(`Root: ${REPO_ROOT}`);
  console.log("Walking repo…");

  const files = walk(REPO_ROOT);
  console.log(`Found ${files.length} files to dump.`);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let dump = "======== OGZPrime V2 Complete Repository Dump ========\n";
  dump += `Generated: ${new Date().toISOString()}\n`;
  dump += `Total Files: ${files.length}\n`;
  dump += "=" + "=".repeat(50) + "\n\n";

  // Sort files for better organization
  files.sort((a, b) => {
    // Core files first
    if (a.startsWith("core/") && !b.startsWith("core/")) return -1;
    if (!a.startsWith("core/") && b.startsWith("core/")) return 1;

    // Then main files
    if (a.startsWith("run-") && !b.startsWith("run-")) return -1;
    if (!a.startsWith("run-") && b.startsWith("run-")) return 1;

    return a.localeCompare(b);
  });

  let totalSize = 0;

  for (const rel of files) {
    const full = path.join(REPO_ROOT, rel);

    try {
      const content = fs.readFileSync(full, "utf8");
      const size = content.length;
      totalSize += size;

      dump += `\n\n${"=".repeat(80)}\n`;
      dump += `FILE: ${rel}\n`;
      dump += `SIZE: ${size} bytes\n`;
      dump += `${"=".repeat(80)}\n\n`;
      dump += content;
      dump += "\n\n";
    } catch (err) {
      console.warn(`Failed to read ${rel}: ${err.message}`);
      dump += `\n\n[ERROR reading ${rel}: ${err.message}]\n\n`;
    }
  }

  fs.writeFileSync(OUTPUT_FILE, dump, "utf8");

  const dumpSize = (dump.length / 1024 / 1024).toFixed(2);
  console.log(`✅ Dumped to: ${OUTPUT_FILE}`);
  console.log(`📊 Total dump size: ${dumpSize} MB`);
  console.log(`📁 Files included: ${files.length}`);

  if (dumpSize > 10) {
    console.log(`⚠️  Large file! You may need to split it for ChatGPT.`);
    console.log(`   Try: split -b 5M ${OUTPUT_FILE} ${OUTPUT_FILE}.part`);
  }
}

main();