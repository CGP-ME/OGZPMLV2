// search-ogz-rag.js
// Ultra-simple semantic-ish search over the OGZ RAG chunk index

const fs = require('fs');
const path = require('path');

const INDEX_PATH = path.join(__dirname, '..', 'ogz-meta', 'rag_index.json');

if (!fs.existsSync(INDEX_PATH)) {
  console.error("❌ No RAG index found. Run build-ogz-rag-index.js first.");
  process.exit(1);
}

const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));

const query = process.argv[2];
const limit = parseInt(process.argv[3] || "5", 10);

if (!query) {
  console.log("Usage: node search-ogz-rag.js \"your query\" 5");
  process.exit(0);
}

// Stupid-fast scoring based on keyword hits
function scoreChunk(text, query) {
  let score = 0;
  const q = query.toLowerCase().split(/\s+/);
  const t = text.toLowerCase();

  q.forEach(word => {
    if (t.includes(word)) score += 1;
  });

  return score;
}

const scored = index
  .map(chunk => ({
    ...chunk,
    score: scoreChunk(chunk.text, query)
  }))
  .filter(c => c.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, limit);

console.log(`🔍 Search Results for: "${query}"`);
console.log(`   Returning top ${limit} matches\n`);

scored.forEach(item => {
  console.log(`📄 ${item.file}  [chunk ${item.chunk_index}]`);
  console.log(`⭐ Score: ${item.score}`);
  console.log(`---`);
  console.log(item.text.substring(0, 300).trim());
  console.log("\n");
});
