
const TwoPoleOscillator = require('../../core/TwoPoleOscillator');

function runBenchmark() {
  const tpo = new TwoPoleOscillator({ smaLength: 25 });
  const iterations = 200000;
  const dataSize = 100; // Match max history
  // Deterministic data: Sine wave + Trend
  const prices = new Array(dataSize).fill(0).map((_, i) => 100 + i * 0.1 + Math.sin(i * 0.2) * 10);

  console.log('Starting benchmark...');

  // Warmup
  let warmupSum = 0;
  for (let i = 0; i < 10000; i++) {
     warmupSum += tpo.calculateOscillator(prices);
  }

  // Measure
  const start = process.hrtime.bigint();
  let checkSum = 0;
  for (let i = 0; i < iterations; i++) {
    checkSum += tpo.calculateOscillator(prices);
  }
  const end = process.hrtime.bigint();

  const durationMs = Number(end - start) / 1e6;

  console.log(`Iterations: ${iterations}`);
  console.log(`Duration: ${durationMs.toFixed(2)}ms`);
  console.log(`Avg time: ${(durationMs / iterations).toFixed(5)}ms`);
  console.log(`Checksum: ${checkSum}`); // Full precision
}

runBenchmark();
