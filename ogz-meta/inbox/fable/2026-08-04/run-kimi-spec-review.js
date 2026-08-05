#!/usr/bin/env node
'use strict';
// One-shot Kimi (Moonshot) spec review dispatch — directional-fix-spec coverage
// pass, per Trey's directive 2026-08-04: Mercury + Kimi + Fable, straight
// review, no adversarial-review loop. Receipt saved alongside this script.

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '..', '..', '.env') });

const API_KEY = process.env.MOONSHOT_API_KEY;
if (!API_KEY) {
  console.error('MOONSHOT_API_KEY missing from .env');
  process.exit(1);
}

const specPath = path.resolve(__dirname, 'directional-fix-spec.md');
const auditPath = path.resolve(__dirname, '..', '2026-08-03', 'directional-audit-consolidated-findings.md');
const spec = fs.readFileSync(specPath, 'utf8');
const audit = fs.readFileSync(auditPath, 'utf8');

const system = [
  'You are Kimi, an independent reviewer for the OGZPrime trading bot repo.',
  'You are reviewing a FIX SPEC for coverage: does it handle every angle of the',
  'problem the audit found? This is a design-completeness review, not a line',
  'edit. Ground every point in the provided documents; label anything you',
  'cannot ground as an assumption. Answer with: (1) ANGLES COVERED WELL,',
  '(2) ANGLES MISSING OR UNDERSPECIFIED — the important section — each with a',
  'concrete scenario the spec as written would not handle, (3) SEQUENCING RISKS',
  'in the batch order, (4) VERDICT: ready / ready-with-changes / not-ready.',
].join(' ');

const user = [
  'CONTEXT — consolidated audit findings the spec responds to:',
  '',
  audit,
  '',
  '=== THE SPEC UNDER REVIEW ===',
  '',
  spec,
  '',
  'Question: does this spec cover all the angles? What is missing,',
  'underspecified, or ordered wrong? The operator constraints are hard:',
  'no new uncaught throws in the hot loop (process must never die over a bad',
  'trade record), no new flags/gates/machinery, refusals must route through',
  'the existing block/autopsy/halt/alert paths.',
].join('\n');

async function main() {
  const res = await fetch('https://api.moonshot.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'kimi-k3',
      temperature: 1,
      max_tokens: 16384,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  const raw = await res.text();
  fs.writeFileSync(path.resolve(__dirname, 'spec-review-kimi-result.raw.json'), raw);
  if (!res.ok) {
    console.error(`Moonshot HTTP ${res.status}`);
    console.error(raw.slice(0, 2000));
    process.exit(1);
  }
  const parsed = JSON.parse(raw);
  const message = parsed?.choices?.[0]?.message || {};
  const answer = message.content || '';
  const reasoning = message.reasoning_content || '';
  const finishReason = parsed?.choices?.[0]?.finish_reason || 'unknown';
  fs.writeFileSync(
    path.resolve(__dirname, 'spec-review-kimi-result.md'),
    `# Kimi spec review — directional-fix-spec (2026-08-04)\n\nModel: ${parsed.model || 'kimi-k3'} | finish_reason: ${finishReason}\n\n${answer || '(no final answer emitted)'}\n\n## Reasoning trace\n\n${reasoning}\n`
  );
  console.log(answer || `(finish_reason=${finishReason}; no final content — see reasoning trace in spec-review-kimi-result.md)`);
}

main().catch((err) => {
  console.error('Kimi dispatch failed:', err.message);
  process.exit(1);
});
