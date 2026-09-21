'use strict';

// Compatibility alias only. OGZPrime has one PM2 process declaration so this
// historical filename cannot drift into a second two-process runtime.
module.exports = require('./ecosystem.config.js');
