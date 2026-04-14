'use strict';

const fs = require('fs');
const path = require('path');

const ACTIVITY_LOG = path.join(__dirname, '..', 'logs', 'ai-activity.jsonl');

function logParseFailure(role, raw) {
  try {
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      actor: 'claudito',
      stage: role,
      event: 'parse_failure',
      raw_response: typeof raw === 'string' ? raw.slice(0, 2000) : String(raw).slice(0, 2000),
    });
    fs.appendFileSync(ACTIVITY_LOG, entry + '\n');
  } catch (_) { /* best effort */ }
}

function extractJSON(text) {
  if (!text || typeof text !== 'string') return null;
  // Try direct parse first
  try { return JSON.parse(text); } catch (_) {}
  // Try extracting from markdown code fence
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch (_) {}
  }
  // Try finding first { ... } block
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try { return JSON.parse(braceMatch[0]); } catch (_) {}
  }
  return null;
}

function parseEntomologistOutput(mercuryResponse) {
  const parsed = extractJSON(mercuryResponse);
  if (!parsed || !Array.isArray(parsed.bugs)) {
    logParseFailure('entomologist', mercuryResponse);
    return { bugs: [], files_analyzed: [], confidence: 'low' };
  }
  return {
    bugs: parsed.bugs.map((b, i) => ({
      severity: b.severity || 'medium',
      type: b.type || 'unknown',
      file: b.file || 'unknown',
      line: b.line || 0,
      description: b.description || '',
      evidence: b.evidence || '',
      id: i,
    })),
    files_analyzed: parsed.files_analyzed || [],
    confidence: parsed.confidence || 'medium',
  };
}

function parseExterminatorOutput(mercuryResponse) {
  const parsed = extractJSON(mercuryResponse);
  if (!parsed || !Array.isArray(parsed.proposals)) {
    logParseFailure('exterminator', mercuryResponse);
    return { proposals: [], scope_violations: [] };
  }
  return {
    proposals: parsed.proposals.map((p, i) => ({
      bug_id: p.bug_id ?? i,
      file: p.file || 'unknown',
      line_start: p.line_start || 0,
      line_end: p.line_end || 0,
      current_code: p.current_code || '',
      proposed_code: p.proposed_code || '',
      rationale: p.rationale || '',
      side_effects: p.side_effects || 'none',
      tests_needed: p.tests_needed || [],
    })),
    scope_violations: parsed.scope_violations || [],
  };
}

function parseCriticOutput(mercuryResponse) {
  const parsed = extractJSON(mercuryResponse);
  if (!parsed || !Array.isArray(parsed.reviews)) {
    logParseFailure('critic', mercuryResponse);
    return { reviews: [], overall_verdict: 'approve_all', loop_back_required: false };
  }
  return {
    reviews: parsed.reviews.map((r, i) => ({
      proposal_id: r.proposal_id ?? i,
      verdict: r.verdict || 'approve',
      severity: r.severity || 'minor',
      issues: r.issues || [],
      suggested_revisions: r.suggested_revisions || '',
    })),
    overall_verdict: parsed.overall_verdict || 'approve_all',
    loop_back_required: !!parsed.loop_back_required,
  };
}

function parseForensicsOutput(mercuryResponse) {
  const parsed = extractJSON(mercuryResponse);
  if (!parsed) {
    logParseFailure('forensics', mercuryResponse);
    return { risks: [], silent_bugs: [], loop_back_required: false, confidence: 'low' };
  }
  return {
    risks: (parsed.risks || []).map(r => ({
      severity: r.severity || 'medium',
      type: r.type || 'unknown',
      file: r.file || 'unknown',
      line: r.line || 0,
      description: r.description || '',
      scenario: r.scenario || '',
      mitigation: r.mitigation || '',
    })),
    silent_bugs: (parsed.silent_bugs || []).map(b => ({
      file: b.file || 'unknown',
      line: b.line || 0,
      description: b.description || '',
    })),
    loop_back_required: !!parsed.loop_back_required,
    confidence: parsed.confidence || 'medium',
  };
}

function parseArchitectOutput(mercuryResponse) {
  const parsed = extractJSON(mercuryResponse);
  if (!parsed || !parsed.plan) {
    logParseFailure('architect', mercuryResponse);
    return { plan: { summary: 'No plan generated', files: [], ordering: [], verification: '' } };
  }
  return {
    plan: {
      summary: parsed.plan.summary || '',
      files: (parsed.plan.files || []).map(f => ({
        path: f.path || 'unknown',
        changes: (f.changes || []).map(c => ({
          line_start: c.line_start || 0,
          line_end: c.line_end || 0,
          current_code: c.current_code || '',
          new_code: c.new_code || '',
          rationale: c.rationale || '',
        })),
        dependencies: f.dependencies || [],
        test: f.test || '',
      })),
      ordering: parsed.plan.ordering || [],
      verification: parsed.plan.verification || '',
    },
  };
}

function parseFixerOutput(mercuryResponse) {
  const parsed = extractJSON(mercuryResponse);
  if (!parsed || !Array.isArray(parsed.edits)) {
    logParseFailure('fixer', mercuryResponse);
    return { edits: [], scope_violations: [], risks_identified: [] };
  }
  return {
    edits: parsed.edits.map(e => ({
      file: e.file || 'unknown',
      line_start: e.line_start || 0,
      line_end: e.line_end || 0,
      current_code: e.current_code || '',
      new_code: e.new_code || '',
      verified: !!e.verified,
      drift_note: e.drift_note || '',
    })),
    scope_violations: parsed.scope_violations || [],
    risks_identified: parsed.risks_identified || [],
  };
}

module.exports = {
  parseEntomologistOutput,
  parseExterminatorOutput,
  parseCriticOutput,
  parseForensicsOutput,
  parseArchitectOutput,
  parseFixerOutput,
  extractJSON,
};
