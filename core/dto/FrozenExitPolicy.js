'use strict';

const crypto = require('crypto');

function clonePlain(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(clonePlain);
  }

  return Object.keys(value).reduce((acc, key) => {
    acc[key] = clonePlain(value[key]);
    return acc;
  }, {});
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  return Object.keys(value).sort().reduce((acc, key) => {
    acc[key] = canonicalize(value[key]);
    return acc;
  }, {});
}

function policyPayload(policy) {
  const cloned = clonePlain(policy);
  delete cloned.policyHash;
  delete cloned.builtAtMs;
  if (cloned.contract) {
    delete cloned.contract.validatedAt;
  }
  return canonicalize(cloned);
}

function buildPolicyHash(policy) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(policyPayload(policy)))
    .digest('hex');
}

function freezePolicy(policy) {
  const cloned = clonePlain(policy);
  cloned.policyHash = buildPolicyHash(cloned);
  return deepFreeze(cloned);
}

module.exports = {
  buildPolicyHash,
  canonicalize,
  freezePolicy,
};
