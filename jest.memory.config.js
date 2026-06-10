const base = require('./jest.config');

// Memory tests only — run via `npm run test:memory`, which provides --expose-gc so
// the tests can force collection deterministically, and --runInBand so their mass
// allocations don't pause other workers.
module.exports = {
  ...base,
  testRegex: '/tests/(memoryLeak|collectability)\\.test\\.tsx?$',
  testPathIgnorePatterns: ['\\.type-test\\.tsx?$'],
};
