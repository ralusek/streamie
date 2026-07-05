/** @type {import('jest').Config} */
module.exports = {
  roots: ['<rootDir>/tests'],
  transform: {
    // Transpile TypeScript per-file via ts-jest, using a CommonJS tsconfig so the
    // emitted modules load under Jest's CommonJS runtime. isolatedModules (set in
    // tsconfig.base.json) makes this a pure, fast transpile with no cross-file type
    // resolution — which also means the NodeNext `.js` import specifiers in the source
    // are left for Jest to resolve, handled by moduleNameMapper below.
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.spec.json' }],
  },
  // The source is authored NodeNext-style with explicit `.js` extensions on relative
  // imports (e.g. './error/index.js'). Those files are TypeScript on disk, so strip the
  // trailing `.js` from relative specifiers so Jest's resolver finds the `.ts`. Bare
  // specifiers (node:stream, etc.) are untouched.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
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
