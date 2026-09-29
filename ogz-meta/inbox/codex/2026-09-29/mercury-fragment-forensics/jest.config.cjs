const path = require('node:path');
module.exports = {rootDir:path.resolve(__dirname,'../../../../..'),testPathIgnorePatterns:['/node_modules/','/ogz-meta/'],setupFiles:['<rootDir>/test/helpers/canonical-test-env.js'],transform:{'^.+\\.js$':path.join(__dirname,'jest-transform.cjs')}};
