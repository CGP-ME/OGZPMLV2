'use strict';

const { z } = require('zod');

const StrategySignalSchema = z.object({
  name: z.string(),
  direction: z.enum(['long', 'short', 'hold']),
  baseConfidence: z.number().min(0).max(1),
  reason: z.string(),
  indicatorValues: z.record(z.string(), z.union([z.number(), z.string(), z.null()])).optional(),
});

const OrchestratorDecisionSchema = z.object({
  winnerStrategy: z.string().nullable(),
  finalConfidence: z.number().min(0).max(1),
  reason: z.string(),
  competingStrategies: z.array(z.object({
    name: z.string(),
    adjustedConfidence: z.number(),
    rejected: z.boolean().optional(),
    rejectReason: z.string().nullable().optional(),
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
  trailingStopPercent: z.number().optional(),
  trailingActivation: z.number().optional(),
  maxHoldTimeMinutes: z.number().optional(),
  _validated: z.string().optional(),
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
  // L6: added later
  exits: z.array(z.any()).optional(),
  // L7: added later
  outcome: z.any().optional(),
});

function createLedgerSkeleton({
  tradeId,
  candleTimestamp,
  symbol,
  timeframe,
  executionMode,
  entryPrice,
  direction,
  strategySignals,
  orchestratorDecision,
  confluence,
  positionSizing,
  exitContract,
  riskGates,
}) {
  return {
    tradeId,
    candleTimestamp,
    symbol: symbol || 'unknown',
    timeframe: timeframe || '15m',
    executionMode: executionMode || 'backtest',
    entryPrice,
    direction,
    strategySignals: strategySignals || [],
    orchestratorDecision: orchestratorDecision || { winnerStrategy: null, finalConfidence: 0, reason: 'unknown' },
    confluence: confluence || { count: 1, sizingMultiplier: 1.0 },
    positionSizing: positionSizing || { basePercent: 0, confidenceMultiplier: 1, confluenceMultiplier: 1, finalPercent: 0, finalSizeUsd: 0, formula: 'N/A' },
    exitContract: exitContract || { strategyName: 'unknown', stopLossPercent: -1, takeProfitPercent: 1 },
    confidenceModifiers: [],
    riskGates: riskGates || [],
    exits: [],
    outcome: null,
  };
}

function validateLedgerSkeleton(ledger) {
  return DecisionLedgerSkeletonSchema.safeParse(ledger);
}

module.exports = {
  DecisionLedgerSkeletonSchema,
  StrategySignalSchema,
  OrchestratorDecisionSchema,
  PositionSizingSchema,
  ExitContractSchema,
  createLedgerSkeleton,
  validateLedgerSkeleton,
};
