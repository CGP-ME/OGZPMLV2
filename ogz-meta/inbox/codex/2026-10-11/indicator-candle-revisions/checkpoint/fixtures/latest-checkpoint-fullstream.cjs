#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const v8 = require('node:v8');
const sourceRoot = path.resolve(process.argv[2]);
const oracleRoot = path.resolve(process.argv[3] || path.join(__dirname, '..', '..', 'runs', '822ddf'));
const baselineMode = process.argv.includes('--baseline');
for (const root of [sourceRoot, oracleRoot]) if (!fs.existsSync(path.join(root, 'core/indicators/IndicatorEngine.js'))) throw new Error(`isolated source root required: ${root}`);
process.chdir(sourceRoot);
Object.assign(process.env, { PROFILE: 'paper', EXECUTION_MODE: 'paper', WEBSOCKET_AUTH_TOKEN: 'fixture-token', ALPACA_API_KEY: 'fixture-key', ALPACA_API_SECRET: 'fixture-secret', KRAKEN_API_KEY: 'fixture-key', KRAKEN_API_SECRET: 'fixture-secret', DOTENV_CONFIG_PATH: path.join(sourceRoot, 'fixture-no-dotenv') });
const ConfigLoader = require(path.join(sourceRoot, 'foundation/ConfigLoader'));
ConfigLoader.load({ force: true, silent: true, loadDotenv: false });
const IndicatorEngine = require(path.join(sourceRoot, 'core/indicators/IndicatorEngine'));
const BaselineIndicatorEngine = require(path.join(oracleRoot, 'core/indicators/IndicatorEngine'));
const config = { ...ConfigLoader.get('indicators.engine'), ...ConfigLoader.get('internals.indicators.engine'), symbol: 'TSLA', tf: '1m' };
assert.strictEqual(config.maxCandles, 2000, 'fixture requires canonical IndicatorEngine retention');
const make = () => new IndicatorEngine(config);
const makeOracle = () => new BaselineIndicatorEngine(config);
const interval = 60_000;
function candle(index, adjustment = 0) { const close = 100 + Math.sin(index / 9) * 4 + index * .01 + adjustment; return { t: 1_700_000_000_000 + index * interval, o: close - .2, h: close + .8, l: close - .9, c: close, v: 1000 + (index % 97) }; }
function comparable(engine) { const raw = engine.getRawState(); raw.updatedAt = null; const render = engine.getRenderPacket(); render.timestamp = null; return { raw, indicators: engine.getSnapshot().indicators, render }; }
function correctedValues(length) { const values = Array.from({ length }, (_, index) => candle(index)); values[length - 1] = candle(length - 1, 3); values.push(candle(length, 2)); return values; }
function candidateStream(length) { const engine = make(); for (let index = 0; index < length; index += 1) engine.updateCandle(candle(index)); engine.updateCandle(candle(length - 1, 1)); engine.updateCandle(candle(length - 1, 3)); engine.updateCandle(candle(length, 0)); engine.updateCandle(candle(length, 2)); return engine; }
function oracleStream(length) { const engine = makeOracle(); for (const value of correctedValues(length)) engine.updateCandle(value); return engine; }
function assertCase(length) { const candidate = candidateStream(length); const oracle = oracleStream(length); if (baselineMode) { assert.notDeepStrictEqual(comparable(candidate), comparable(oracle), `baseline diverges from corrected oracle at ${length}`); } else { assert.strictEqual(candidate.candles.length, oracle.candles.length, `candidate retention matches oracle at stream ${length}`); assert.deepStrictEqual(comparable(candidate), comparable(oracle), `candidate state/indicators/render match fresh corrected full-stream oracle at ${length}`); } return { length, candidateCandles: candidate.candles.length, oracleCandles: oracle.candles.length, candidate }; }
const case301 = assertCase(301);
const case2101 = baselineMode ? null : assertCase(2101);
let rebuild = null;
if (!baselineMode) { const rebuilt = make(); rebuilt.computeBatch(correctedValues(301)); rebuilt.updateCandle(candle(301, 4)); const rebuiltOracle = makeOracle(); rebuiltOracle.computeBatch([...correctedValues(301).slice(0, -1), candle(301, 4)]); assert.deepStrictEqual(comparable(rebuilt), comparable(rebuiltOracle), 'computeBatch reset/rebuild leaves a usable latest checkpoint for one revision'); rebuild = { candles: rebuilt.candles.length, revisionAfterComputeBatch: true }; }
const timed = baselineMode ? case301.candidate : case2101.candidate;
const nextIndex = baselineMode ? 302 : 2102;
const normalStart = process.hrtime.bigint(); timed.updateCandle(candle(nextIndex, 1)); const normalUpdateMs = Number(process.hrtime.bigint() - normalStart) / 1e6;
let revisionUpdateMs = null; let checkpointBytes = null;
if (!baselineMode) { const revisionStart = process.hrtime.bigint(); timed.updateCandle(candle(nextIndex, 3)); revisionUpdateMs = Number(process.hrtime.bigint() - revisionStart) / 1e6; checkpointBytes = v8.serialize(timed._latestCandleCheckpoint).byteLength; }
const result = { sourceRoot, oracleRoot, baselineMode, maxCandles: config.maxCandles, cases: [Object.fromEntries(Object.entries(case301).filter(([key]) => key !== 'candidate')), ...(case2101 ? [Object.fromEntries(Object.entries(case2101).filter(([key]) => key !== 'candidate'))] : [])], rebuild, normalUpdateMs, revisionUpdateMs, checkpointBytes };
process.stdout.write(`PASS latest-checkpoint-fullstream ${JSON.stringify(result)}\n`);
