// build-ogz-rag-index.js
// Creates chunked semantic index of OGZ meta files and Claudito command specs

const fs = require('fs');
const path = require('path');

const META_DIR = path.join(__dirname, '..', 'ogz-meta');
const CLAUDE_CMD_DIR = path.join(__dirname, '..', '.claude', 'commands');
const OUTPUT = path.join(META_DIR, 'rag_index.json');

// Basic chunker to keep context focused but retrievable.
function chunkText(text, size = 800) {
  const parts = [];
  let i = 0;
  while (i < text.length) {
    parts.push(text.slice(i, i + size));
    i += size;
  }
  return parts;
}

function loadFiles(dir, tag) {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(file => {
      const full = path.join(dir, file);
      const content = fs.readFileSync(full, 'utf8');
      return { tag, file, content };
    });
}

function buildIndex() {
  console.log("🔧 Building OGZ RAG Index...");

  const metaFiles = loadFiles(META_DIR, 'meta');
  const claudeFiles = loadFiles(CLAUDE_CMD_DIR, 'claudito');

  const all = [...metaFiles, ...claudeFiles];

  const index = [];
  let id = 0;

  for (const file of all) {
    const chunks = chunkText(file.content);
    chunks.forEach((chunk, idx) => {
      index.push({
        id: id++,
        file: file.file,
        tag: file.tag,
        chunk_index: idx,
        text: chunk
      });
    });
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(index, null, 2));

  console.log(`✅ RAG index built successfully!`);
  console.log(`   Files indexed: ${all.length}`);
  console.log(`   Total chunks:  ${index.length}`);
  console.log(`   Output:        ${OUTPUT}`);
}

buildIndex();
