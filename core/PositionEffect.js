'use strict';

const POSITION_EFFECTS = Object.freeze([
  'open_long',
  'close_long',
  'open_short',
  'close_short',
  'hold',
  'unknown_effect',
]);

const HOLD_POSITION_EFFECT = 'hold';
const UNKNOWN_POSITION_EFFECT = 'unknown_effect';

const ACTION_TO_POSITION_EFFECT = Object.freeze({
  BUY: 'open_long',
  SELL: 'close_long',
  SELL_SHORT: 'open_short',
  COVER: 'close_short',
  HOLD: HOLD_POSITION_EFFECT,
});

function normalizeAction(action) {
  return typeof action === 'string' ? action.trim().toUpperCase() : null;
}

function positionEffectFromAction(action) {
  return ACTION_TO_POSITION_EFFECT[normalizeAction(action)] || UNKNOWN_POSITION_EFFECT;
}

function exitPositionEffectForDirection(direction) {
  const cleanDirection = typeof direction === 'string' ? direction.trim().toLowerCase() : null;
  if (cleanDirection === 'long') return 'close_long';
  if (cleanDirection === 'short') return 'close_short';
  return UNKNOWN_POSITION_EFFECT;
}

function isPositionEffect(value) {
  return POSITION_EFFECTS.includes(value);
}

module.exports = {
  POSITION_EFFECTS,
  HOLD_POSITION_EFFECT,
  UNKNOWN_POSITION_EFFECT,
  ACTION_TO_POSITION_EFFECT,
  positionEffectFromAction,
  exitPositionEffectForDirection,
  isPositionEffect,
};
