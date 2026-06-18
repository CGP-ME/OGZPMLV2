/**
 * Mercury Bridge — Query Router (Layer 1)
 * ══════════════════════════════════════════════════════════════
 * Inspects the incoming query and decides the full retrieval
 * strategy: mode, content_type boost, starter-context policy,
 * iteration preference.
 *
 * This is the "traffic cop" that sits in front of the retrieval
 * engine. It does not score chunks or talk to MongoDB — it reads
 * the query text, applies heuristic rules, and returns a strategy
 * object that downstream components honor.
 *
 * Design principle: cheap, explainable, inspectable. No LLM calls,
 * no embeddings, just pattern matching and simple rules. When the
 * rules are wrong, the caller can override via CLI flags.
 */

'use strict';

const { BREAK_MY_FIX_FRAME } = require('../shared/break-my-fix-frame');

// ─── Pattern definitions ──────────────────────────────────────

const HISTORICAL_PATTERNS = [
  /\b(have we|has there( ever)? been|did we ever|was there a|has this)\b/i,
  /\b(what fixed|what was the fix|how was .+ fixed|resolved|patched)\b/i,
  /\b(previous|prior|earlier) (bug|issue|error|problem)\b/i,
  /\b(history|past|before) (of|on|with)\b/i,
];

const ARCHITECTURAL_PATTERNS = [
  /\b(how does|how do|how is) .+ (work|function|operate)\b/i,
  /\b(architecture|design|structure|layout) of\b/i,
  /\b(relationship|contract|interface) between\b/i,
  /\b(what is the purpose of|what does .+ do)\b/i,
  /\b(flow|pipeline|sequence) (of|for)\b/i,
];

const LANDMINE_PATTERNS = [
  /\b(should i avoid|what to avoid|pitfall|gotcha)\b/i,
  /\b(rules?|guidelines?|guardrails?|constraints?)\b/i,
  /\b(never|don'?t|must not|cannot)\b.*\b(use|do|call|modify|touch)\b/i,
  /\b(known (issues?|landmines?|problems?))\b/i,
];

const CONTRACT_BUG_PATTERNS = [
  /\b(contract (mismatch|violation|break))\b/i,
  /\b(disagree|mismatch|inconsistent)\b/i,
  /\bone side .+ other side\b/i,
  /\b(expects|expected) .+ (but|yet|while)\b/i,
];

const RECENT_CHANGE_PATTERNS = [
  /\b(recent|recently|latest|last (week|month|session|day))\b/i,
  /\b(what changed|what'?s new|new in|added in)\b/i,
  /\b(changelog|release notes|commit history)\b/i,
];

const PROPOSAL_PATTERNS = [
  /\b(propose|proposal|planned|plan for|intend|roadmap)\b/i,
  /\b(future|upcoming) (work|feature|change|refactor)\b/i,
  /\b(should we|ought to|supposed to) (build|add|implement)\b/i,
];

const BREAK_MY_FIX_PATTERNS = [
  BREAK_MY_FIX_FRAME,
];

function hasIdentifiers(query) {
  if (!query || typeof query !== 'string') return false;
  if (/[a-z][A-Z]/.test(query)) return true;
  if (/[a-zA-Z]_[a-zA-Z]/.test(query)) return true;
  if (/\b\w+\.\w+\b/.test(query)) return true;
  if (/\.(js|ts|mjs|cjs|json|jsonl|md|py|sh)\b/i.test(query)) return true;
  return false;
}

function matchesAny(query, patterns) {
  return patterns.some((re) => re.test(query));
}

// ─── Router ───────────────────────────────────────────────────

/**
 * Classify a query and return a full retrieval strategy.
 *
 * @param {string} query
 * @returns {{
 *   queryType: string,
 *   mode: 'semantic' | 'hybrid' | 'hybrid-classified',
 *   boostType: string | null,
 *   starterContextPolicy: 'prefer' | 'mixed' | 'skip',
 *   rationale: string
 * }}
 */
function routeQuery(query) {
  if (!query || typeof query !== 'string') {
    return {
      queryType: 'general',
      mode: 'hybrid',
      boostType: null,
      starterContextPolicy: 'mixed',
      rationale: 'empty or invalid query, fallback to hybrid/mixed',
    };
  }

  if (matchesAny(query, BREAK_MY_FIX_PATTERNS)) {
    return {
      queryType: 'break_my_fix',
      mode: 'hybrid',
      boostType: null,
      starterContextPolicy: 'skip',
      rationale: 'break-my-fix prompt detected; skip indexed starter context so dirty diff context is not diluted by stale retrieval',
    };
  }

  if (matchesAny(query, CONTRACT_BUG_PATTERNS)) {
    return {
      queryType: 'contract_bug',
      mode: 'hybrid',
      boostType: null,
      starterContextPolicy: 'skip',
      rationale: 'contract bug pattern detected; starter context is usually noise, prefer agentic tools',
    };
  }

  if (matchesAny(query, HISTORICAL_PATTERNS)) {
    return {
      queryType: 'historical',
      mode: 'hybrid-classified',
      boostType: null,
      starterContextPolicy: 'prefer',
      rationale: 'historical/bug-retrospective pattern detected; prefer starter context from canonical docs',
    };
  }

  if (matchesAny(query, RECENT_CHANGE_PATTERNS)) {
    return {
      queryType: 'recent_change',
      mode: 'hybrid-classified',
      boostType: 'recent_changes',
      starterContextPolicy: 'prefer',
      rationale: 'recent-change pattern detected; boost recent_changes and changelog',
    };
  }

  if (matchesAny(query, LANDMINE_PATTERNS)) {
    return {
      queryType: 'landmine',
      mode: 'hybrid-classified',
      boostType: 'landmine',
      starterContextPolicy: 'prefer',
      rationale: 'landmine/rules pattern detected; boost landmine and guardrails',
    };
  }

  if (matchesAny(query, PROPOSAL_PATTERNS)) {
    return {
      queryType: 'proposal',
      mode: 'hybrid-classified',
      boostType: 'proposal',
      starterContextPolicy: 'prefer',
      rationale: 'proposal/planning pattern detected; boost proposal content_type',
    };
  }

  if (matchesAny(query, ARCHITECTURAL_PATTERNS)) {
    return {
      queryType: 'architectural',
      mode: 'hybrid',
      boostType: 'project_context',
      starterContextPolicy: 'mixed',
      rationale: 'architectural question detected; boost project_context, mixed starter+tools',
    };
  }

  if (hasIdentifiers(query)) {
    return {
      queryType: 'identifier',
      mode: 'hybrid',
      boostType: null,
      starterContextPolicy: 'mixed',
      rationale: 'code-flavored query with identifiers; kind modifier handles this in Layer 2',
    };
  }

  return {
    queryType: 'general',
    mode: 'hybrid',
    boostType: null,
    starterContextPolicy: 'mixed',
    rationale: 'no specific pattern matched; default hybrid with mixed starter policy',
  };
}

module.exports = {
  routeQuery,
  hasIdentifiers,
  matchesAny,
  HISTORICAL_PATTERNS,
  ARCHITECTURAL_PATTERNS,
  LANDMINE_PATTERNS,
  CONTRACT_BUG_PATTERNS,
  RECENT_CHANGE_PATTERNS,
  PROPOSAL_PATTERNS,
};
