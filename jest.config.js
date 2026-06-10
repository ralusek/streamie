module.exports = {
  roots: ['<rootDir>/tests'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  testRegex: '(/tests/.*|(\\.|/)(test|spec))\\.tsx?$',
  testPathIgnorePatterns: [
    // Type tests are compile-only (npm run test:types); executing their module-level
    // pipelines under jest is meaningless and can loop forever.
    '\\.type-test\\.tsx?$',
    // Memory tests run separately (npm run test:memory): they want --expose-gc for
    // deterministic collection, and their mass allocations cause GC pauses in
    // parallel workers that drift wall-clock timers in other suites.
    '/tests/memoryLeak\\.test\\.ts$',
    '/tests/collectability\\.test\\.ts$',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
};
