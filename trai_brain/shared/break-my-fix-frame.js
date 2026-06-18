'use strict';

const BREAK_MY_FIX_FRAME = /^\s*(?:Mercury\s*,?\s*)?break\s+my\s+fix\b/i;

function isBreakMyFixFrame(value) {
  return BREAK_MY_FIX_FRAME.test(value || '');
}

module.exports = {
  BREAK_MY_FIX_FRAME,
  isBreakMyFixFrame,
};
