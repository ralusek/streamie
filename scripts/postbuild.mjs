// Stamps the CommonJS build output with its own package.json declaring
// {"type":"commonjs"}. The root package is type:module, so without this Node would
// interpret dist/cjs/*.js as ESM and require() of them would fail. This single marker
// file is what lets one tsc pass (module:CommonJS -> dist/cjs) coexist with the ESM
// build (module:NodeNext -> dist/esm) under a type:module root.
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cjsDir = join(root, 'dist', 'cjs');

await mkdir(cjsDir, { recursive: true });
await writeFile(
  join(cjsDir, 'package.json'),
  JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
);

console.log('postbuild: wrote dist/cjs/package.json ({"type":"commonjs"})');
