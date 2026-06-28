'use strict';

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`[ProfitExitPlanner] ${label} must be a plain object`);
  }
}

function requireFiniteNumber(value, label) {
  if (!Number.isFinite(value)) {
    throw new Error(`[ProfitExitPlanner] ${label} must be a finite number`);
  }
  return value;
}

function requirePositiveNumber(value, label) {
  const numericValue = requireFiniteNumber(value, label);
  if (numericValue <= 0) {
    throw new Error(`[ProfitExitPlanner] ${label} must be greater than 0`);
  }
  return numericValue;
}

function requireFraction(value, label) {
  const numericValue = requireFiniteNumber(value, label);
  if (numericValue <= 0 || numericValue > 1) {
    throw new Error(`[ProfitExitPlanner] ${label} must be greater than 0 and <= 1`);
  }
  return numericValue;
}

function normalizeDirection(direction) {
  if (typeof direction !== 'string') {
    throw new Error('[ProfitExitPlanner] snapshot.direction must be a string');
  }
  const normalized = direction.trim().toUpperCase();
  if (['LONG', 'BUY'].includes(normalized)) {
    return 'long';
  }
  if (['SHORT', 'SELL', 'SELL_SHORT'].includes(normalized)) {
    return 'short';
  }
  throw new Error(`[ProfitExitPlanner] snapshot.direction unsupported: ${direction}`);
}

function isShortDirection(direction) {
  return normalizeDirection(direction) === 'short';
}

function none(reason, evidence = {}) {
  return Object.freeze({
    action: 'none',
    reason,
    exitFraction: null,
    exitRole: null,
    stateKey: null,
    tierIndex: null,
    intentId: null,
    expectedTradeRevision: null,
    evidence: Object.freeze({ ...evidence }),
  });
}

function intent(snapshot, fields) {
  const exitFraction = requireFraction(fields.exitFraction, 'ExitIntent.exitFraction');
  return Object.freeze({
    action: fields.action,
    reason: fields.reason,
    exitFraction,
    exitRole: fields.exitRole,
    stateKey: fields.stateKey || null,
    tierIndex: Number.isInteger(fields.tierIndex) ? fields.tierIndex : null,
    intentId: snapshot.intentId,
    expectedTradeRevision: snapshot.tradeRevision,
    expectedRemainingQuantity: snapshot.remainingOrderQuantity * (1 - exitFraction),
    evidence: Object.freeze({ ...fields.evidence }),
  });
}

function profitPercentFor(snapshot, currentPrice) {
  const entryPrice = requirePositiveNumber(snapshot.entryPrice, 'snapshot.entryPrice');
  const price = requirePositiveNumber(currentPrice, 'market.currentPrice');
  return isShortDirection(snapshot.direction)
    ? (entryPrice - price) / entryPrice
    : (price - entryPrice) / entryPrice;
}

function readPolicy(snapshot) {
  assertPlainObject(snapshot.frozenExitPolicy, 'snapshot.frozenExitPolicy');
  assertPlainObject(snapshot.frozenExitPolicy.contract, 'snapshot.frozenExitPolicy.contract');
  assertPlainObject(snapshot.frozenExitPolicy.profitManagement, 'snapshot.frozenExitPolicy.profitManagement');
  return snapshot.frozenExitPolicy;
}

function validateSnapshot(snapshot) {
  assertPlainObject(snapshot, 'snapshot');
  requirePositiveNumber(snapshot.remainingOrderQuantity, 'snapshot.remainingOrderQuantity');
  requirePositiveNumber(snapshot.entryOrderQuantity, 'snapshot.entryOrderQuantity');
  requireFiniteNumber(snapshot.tradeRevision, 'snapshot.tradeRevision');
  if (!Number.isInteger(snapshot.tradeRevision) || snapshot.tradeRevision < 0) {
    throw new Error('[ProfitExitPlanner] snapshot.tradeRevision must be a non-negative integer');
  }
  if (typeof snapshot.intentId !== 'string' || snapshot.intentId.trim() === '') {
    throw new Error('[ProfitExitPlanner] snapshot.intentId must be a non-empty string');
  }
  normalizeDirection(snapshot.direction);
  readPolicy(snapshot);
}

function hasPendingExit(snapshot) {
  const pending = snapshot.pendingExitIntent;
  if (pending === null) {
    return false;
  }
  assertPlainObject(pending, 'snapshot.pendingExitIntent');
  if (typeof pending.lifecycleState !== 'string' || pending.lifecycleState.trim() === '') {
    throw new Error('[ProfitExitPlanner] snapshot.pendingExitIntent.lifecycleState must be a non-empty string');
  }
  if (!['none', 'submitted', 'accepted', 'partial_fill'].includes(pending.lifecycleState)) {
    throw new Error(`[ProfitExitPlanner] unsupported pendingExitIntent lifecycleState: ${pending.lifecycleState}`);
  }
  return pending.lifecycleState !== 'none';
}

function currentStateStatus(state, label) {
  assertPlainObject(state, label);
  if (typeof state.status !== 'string' || state.status.trim() === '') {
    throw new Error(`[ProfitExitPlanner] ${label}.status must be a non-empty string`);
  }
  return state.status;
}

function filledQuantityFromState(state) {
  assertPlainObject(state, 'state');
  const filled = state.filledQuantity;
  requireFiniteNumber(filled, 'state.filledQuantity');
  if (filled < 0) {
    throw new Error('[ProfitExitPlanner] state.filledQuantity cannot be negative');
  }
  return filled;
}

function remainingFractionForQuantity(snapshot, targetQuantity, filledQuantity = 0) {
  const requestedQuantity = Math.max(0, targetQuantity - filledQuantity);
  if (requestedQuantity <= 0) {
    return 0;
  }
  const cappedQuantity = Math.min(requestedQuantity, snapshot.remainingOrderQuantity);
  return cappedQuantity / snapshot.remainingOrderQuantity;
}

function planBeScaleOut(snapshot, profitPercent) {
  const policy = snapshot.frozenExitPolicy;
  const config = policy.profitManagement.beScaleOut;
  if (!config || config.enabled !== true) {
    return null;
  }
  const status = currentStateStatus(snapshot.beScaleOutState, 'snapshot.beScaleOutState');
  if (status !== 'idle') {
    return null;
  }

  const riskPercent = Math.abs(requireFiniteNumber(policy.contract.stopLossPercent, 'policy.contract.stopLossPercent')) / 100;
  let trigger;
  if (config.triggerType === 'one_to_one_r') {
    trigger = riskPercent;
  } else if (config.triggerType === 'fixed_percent') {
    trigger = requireFiniteNumber(config.fixedPercentTrigger, 'policy.profitManagement.beScaleOut.fixedPercentTrigger') / 100;
  } else {
    throw new Error(`[ProfitExitPlanner] unsupported beScaleOut triggerType: ${config.triggerType}`);
  }

  if (profitPercent < trigger) {
    return null;
  }

  return intent(snapshot, {
    action: 'exit_partial',
    reason: 'be_scaleout',
    exitRole: 'profit',
    stateKey: 'beScaleOutState',
    exitFraction: requireFraction(config.scaleOutFraction, 'policy.profitManagement.beScaleOut.scaleOutFraction'),
    evidence: {
      profitPercent,
      trigger,
      policyHash: policy.policyHash,
    },
  });
}

function tierExitFraction(snapshot, tier, tierState) {
  const configuredFraction = requireFraction(tier.exitFraction, `tier.${tier.name || tier.tierIndex}.exitFraction`);
  const allocationBasis = snapshot.frozenExitPolicy.profitManagement.tieredExit.allocationBasis;
  if (allocationBasis === 'cumulative_original_quantity') {
    const targetQuantity = snapshot.entryOrderQuantity * configuredFraction;
    return remainingFractionForQuantity(snapshot, targetQuantity, filledQuantityFromState(tierState));
  }
  if (allocationBasis === 'remaining_quantity') {
    return configuredFraction;
  }
  throw new Error(`[ProfitExitPlanner] unsupported tier allocationBasis: ${allocationBasis}`);
}

function planTier(snapshot, profitPercent) {
  const policy = snapshot.frozenExitPolicy;
  const config = policy.profitManagement.tieredExit;
  if (!config || config.enabled !== true) {
    return null;
  }
  if (!Array.isArray(config.tiers)) {
    throw new Error('[ProfitExitPlanner] policy.profitManagement.tieredExit.tiers must be an array');
  }
  if (!Array.isArray(snapshot.tierStates)) {
    throw new Error('[ProfitExitPlanner] snapshot.tierStates must be an array');
  }
  const tierStates = snapshot.tierStates;

  for (let index = 0; index < config.tiers.length; index += 1) {
    const tier = config.tiers[index];
    assertPlainObject(tier, `policy.profitManagement.tieredExit.tiers[${index}]`);
    if (!tierStates[index]) {
      throw new Error(`[ProfitExitPlanner] snapshot.tierStates[${index}] is required`);
    }
    const status = currentStateStatus(tierStates[index], `snapshot.tierStates[${index}]`);
    if (status !== 'idle') {
      continue;
    }
    const targetProfitMove = requireFiniteNumber(tier.targetProfitMove, `tier.${index}.targetProfitMove`);
    if (profitPercent < targetProfitMove) {
      return null;
    }
    const exitFraction = tierExitFraction(snapshot, tier, tierStates[index]);
    if (exitFraction <= 0) {
      continue;
    }
    return intent(snapshot, {
      action: exitFraction >= 1 ? 'exit_full' : 'exit_partial',
      reason: `profit_${tier.name || `tier${index + 1}`}`,
      exitRole: 'profit',
      stateKey: 'tierStates',
      tierIndex: index,
      exitFraction,
      evidence: {
        profitPercent,
        targetProfitMove,
        policyHash: policy.policyHash,
      },
    });
  }

  return null;
}

function planTrailing(snapshot, profitPercent) {
  const policy = snapshot.frozenExitPolicy;
  const trailingStopPercent = policy.contract.trailingStopPercent;
  const trailingActivation = policy.contract.trailingActivation;
  if (trailingStopPercent === undefined) {
    throw new Error('[ProfitExitPlanner] policy.contract.trailingStopPercent is required');
  }
  if (trailingStopPercent === null) {
    return null;
  }
  const trailDistance = requireFiniteNumber(trailingStopPercent, 'policy.contract.trailingStopPercent') / 100;
  const activation = requireFiniteNumber(trailingActivation, 'policy.contract.trailingActivation') / 100;
  const maxProfitPercent = Math.max(
    requireFiniteNumber(snapshot.maxProfitPercent ?? profitPercent, 'snapshot.maxProfitPercent'),
    profitPercent,
  );
  if (maxProfitPercent < activation) {
    return null;
  }
  if ((maxProfitPercent - profitPercent) < trailDistance) {
    return null;
  }

  return intent(snapshot, {
    action: 'exit_full',
    reason: 'trailing_stop',
    exitRole: 'profit',
    stateKey: null,
    exitFraction: 1,
    evidence: {
      profitPercent,
      maxProfitPercent,
      trailDistance,
      activation,
      policyHash: policy.policyHash,
    },
  });
}

function plan(snapshot, market = {}) {
  validateSnapshot(snapshot);
  assertPlainObject(market, 'market');
  if (hasPendingExit(snapshot)) {
    return none('exit_already_pending', {
      pendingIntentId: snapshot.pendingExitIntent.intentId || null,
      pendingState: snapshot.pendingExitIntent.lifecycleState || null,
    });
  }

  const currentPrice = market.currentPrice ?? snapshot.currentPrice;
  const profitPercent = profitPercentFor(snapshot, currentPrice);

  return planBeScaleOut(snapshot, profitPercent)
    || planTier(snapshot, profitPercent)
    || planTrailing(snapshot, profitPercent)
    || none('no_profit_exit', {
      profitPercent,
      policyHash: snapshot.frozenExitPolicy.policyHash,
    });
}

module.exports = {
  plan,
};
