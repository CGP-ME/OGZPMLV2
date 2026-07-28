'use strict';

const { z } = require('zod');

const PositionEffectSchema = z.enum([
  'open_long',
  'close_long',
  'open_short',
  'close_short',
  'unknown_effect',
]);

const LearningSnapshotSchema = z.object({
  mode: z.literal('shadow'),
  applied: z.literal(false),
  decisionImpact: z.literal('none_shadow_only'),
  candidateRole: z.enum(['candidate', 'winner', 'competitor']).optional(),
  featureSource: z.string().nullable(),
  source: z.string(),
  status: z.string(),
  confidence: z.number().min(0).max(1).nullable(),
  wins: z.number().nullable(),
  losses: z.number().nullable(),
  sampleCount: z.number().nullable(),
  modifier: z.null(),
  error: z.string().optional(),
});

const StrategySignalSchema = z.object({
  name: z.string(),
  direction: z.enum(['long', 'short', 'hold']),
  baseConfidence: z.number().min(0).max(1),
  reason: z.string(),
  learningSnapshot: LearningSnapshotSchema.nullable().optional(),
  indicatorValues: z.record(z.string(), z.union([z.number(), z.string(), z.null()])).optional(),
});

const OrchestratorDecisionSchema = z.object({
  winnerStrategy: z.string().nullable(),
  finalConfidence: z.number().min(0).max(1),
  winnerAttribution: z.object({
    status: z.enum(['exact', 'missing', 'ambiguous']),
    winnerIndex: z.number().int().min(0).nullable(),
    matchCount: z.number().int().min(0),
    matchedIndexes: z.array(z.number().int().min(0)).optional(),
    reason: z.string().optional(),
  }).optional(),
  learningSnapshot: LearningSnapshotSchema.nullable().optional(),
  reason: z.string(),
  competingStrategies: z.array(z.object({
    name: z.string(),
    adjustedConfidence: z.number(),
    rejected: z.boolean().optional(),
    rejectReason: z.string().nullable().optional(),
    learningSnapshot: LearningSnapshotSchema.nullable().optional(),
  })).optional(),
});

const ConfluenceSchema = z.object({
  count: z.number().int().min(0),
  agreeingStrategies: z.array(z.string()).optional(),
  sizingMultiplier: z.number(),
  reason: z.string().optional(),
});

const PositionSizingSchema = z.object({
  basePercent: z.number(),
  confidenceMultiplier: z.number(),
  confluenceMultiplier: z.number(),
  finalPercent: z.number(),
  finalSizeUsd: z.number(),
  formula: z.string(),
  accountBalance: z.number().optional(),
  finalSizeShares: z.number().optional(),
  pidPositionMultiplier: z.number().optional(),
});

const ExitContractSchema = z.object({
  strategyName: z.string(),
  stopLossPercent: z.number(),
  takeProfitPercent: z.number(),
  trailingStopPercent: z.number().nullable().optional(),
  trailingActivation: z.number().nullable().optional(),
  maxHoldTimeMinutes: z.number().optional(),
  _validated: z.string().nullable().optional(),
}).passthrough();

/**
 * Decision Ledger Schema — L1 skeleton (entry-time fields only).
 * Later phases add: confidenceModifiers (L3), riskGates (L5),
 * exits (L6), outcome (L7).
 */
const DecisionLedgerSkeletonSchema = z.object({
  tradeId: z.string(),
  candleTimestamp: z.number().int(),
  symbol: z.string(),
  timeframe: z.string(),
  executionMode: z.enum(['live', 'paper', 'backtest']),
  entryPrice: z.number(),
  direction: z.enum(['long', 'short']),
  positionEffect: PositionEffectSchema,

  // L1: populated at birth
  strategySignals: z.array(StrategySignalSchema),
  orchestratorDecision: OrchestratorDecisionSchema,
  confluence: ConfluenceSchema.optional(),
  positionSizing: PositionSizingSchema,
  exitContract: ExitContractSchema,

  // L3: added later
  confidenceModifiers: z.array(z.any()).optional(),
  // L5: added later
  riskGates: z.array(z.any()).optional(),
  operationalQuarantine: z.object({
    status: z.literal('quarantined'),
    trusted: z.literal(false),
    source: z.string(),
    fields: z.array(z.any()),
    alerts: z.array(z.any()).optional(),
    policy: z.string().optional(),
  }).optional(),
  // L6: added later
  exits: z.array(z.any()).optional(),
  // L7: added later
  outcome: z.any().optional(),
});

const REQUIRED_LEDGER_FIELDS = [
  'tradeId',
  'candleTimestamp',
  'symbol',
  'timeframe',
  'executionMode',
  'entryPrice',
  'direction',
  'positionEffect',
  'strategySignals',
  'orchestratorDecision',
  'positionSizing',
  'exitContract',
];

function isBlankString(value) {
  return typeof value === 'string' && value.trim() === '';
}

function isPlainLedgerObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function ledgerFieldMissing(field, value) {
  if (value === null || value === undefined || isBlankString(value)) return true;
  if (field === 'candleTimestamp' || field === 'entryPrice') return !Number.isFinite(value);
  if (field === 'strategySignals') return !Array.isArray(value);
  if (field === 'orchestratorDecision' || field === 'positionSizing' || field === 'exitContract') {
    return !isPlainLedgerObject(value);
  }
  return false;
}

function buildLedgerRejection(message, missingFields = [], validationIssues = []) {
  const error = new Error(message);
  error.code = 'LEDGER_SKELETON_REJECTED';
  error.missingFields = missingFields;
  error.validationIssues = validationIssues;
  return error;
}

function summarizeValidationIssues(result) {
  if (!result || result.success || !result.error || !Array.isArray(result.error.issues)) return [];
  return result.error.issues.map(issue => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

function createLedgerSkeleton(input = {}) {
  if (!isPlainLedgerObject(input)) {
    throw buildLedgerRejection('Decision ledger skeleton requires an input object', REQUIRED_LEDGER_FIELDS);
  }

  const missingFields = REQUIRED_LEDGER_FIELDS.filter(field => ledgerFieldMissing(field, input[field]));
  if (missingFields.length > 0) {
    throw buildLedgerRejection(
      `Decision ledger skeleton missing required field(s): ${missingFields.join(', ')}`,
      missingFields
    );
  }

  const ledger = {
    tradeId: input.tradeId,
    candleTimestamp: input.candleTimestamp,
    symbol: input.symbol,
    timeframe: input.timeframe,
    executionMode: input.executionMode,
    entryPrice: input.entryPrice,
    direction: input.direction,
    positionEffect: input.positionEffect,
    strategySignals: input.strategySignals,
    orchestratorDecision: input.orchestratorDecision,
    positionSizing: input.positionSizing,
    exitContract: input.exitContract,
    confidenceModifiers: [],
    exits: [],
    outcome: null,
  };

  if (input.confluence !== undefined) {
    ledger.confluence = input.confluence;
  }
  if (input.riskGates !== undefined) {
    ledger.riskGates = input.riskGates;
  }
  if (input.operationalQuarantine !== undefined) {
    ledger.operationalQuarantine = input.operationalQuarantine;
  }

  const validation = validateLedgerSkeleton(ledger);
  if (!validation.success) {
    const issues = summarizeValidationIssues(validation);
    throw buildLedgerRejection(
      `Decision ledger skeleton failed schema validation: ${issues.map(issue => `${issue.path}: ${issue.message}`).join('; ')}`,
      [],
      issues
    );
  }

  return ledger;
}

function validateLedgerSkeleton(ledger) {
  return DecisionLedgerSkeletonSchema.safeParse(ledger);
}

module.exports = {
  DecisionLedgerSkeletonSchema,
  LearningSnapshotSchema,
  StrategySignalSchema,
  OrchestratorDecisionSchema,
  PositionSizingSchema,
  ExitContractSchema,
  PositionEffectSchema,
  createLedgerSkeleton,
  validateLedgerSkeleton,
};
