'use strict';

function assertExplicitExitOwnership(exitContract, owner) {
  if (!exitContract || typeof exitContract !== 'object' || Array.isArray(exitContract)) {
    throw new Error(`${owner}: exitContract invalid (got ${typeof exitContract}) - explicit exit ownership is required`);
  }
  if (
    !Object.prototype.hasOwnProperty.call(exitContract, 'useStructuralExits') ||
    typeof exitContract.useStructuralExits !== 'boolean'
  ) {
    throw new Error(`${owner}: exitContract.useStructuralExits missing/invalid (got ${exitContract.useStructuralExits}) - refusing ambiguous exit ownership`);
  }
}

module.exports = {
  assertExplicitExitOwnership,
};
