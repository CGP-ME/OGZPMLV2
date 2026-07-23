'use strict';

const review = require('./adversarial-review');

function consensusRequested(opts = {}) {
  return review.reviewModeRequested(opts) != null;
}

module.exports = {
  adversarialReviewRequested: review.adversarialReviewRequested,
  reviewModeRequested: review.reviewModeRequested,
  normalizeReviewIntent: review.normalizeReviewIntent,
  consensusRequested,
  extractField: review.extractField,
  parseConsensusAnswer: review.parseAdversarialReviewAnswer,
  buildMercuryRecheckPrompt: review.buildMercuryRecheckPrompt,
  buildMercuryRecheckPrompts: review.buildMercuryRecheckPrompts,
  formatAdversarialReviewPacket: review.formatAdversarialReviewPacket,
  buildConsensusPrompt: review.buildAdversarialReviewPrompt,
  runFableConsensus: review.runFableAdversarialReview,
  consensusFailure: review.adversarialReviewFailure,
};
