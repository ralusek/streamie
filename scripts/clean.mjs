// Removes the build output. A dependency-free `rimraf dist`: fs.rm with
// recursive+force has been available since Node 14.14, well under the package's
// engines floor (node >= 18), so the build needs no cross-platform clean dependency
// (and nothing that, like rimraf >= 6, would raise that floor to Node 20).
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
await rm(dist, { recursive: true, force: true });
