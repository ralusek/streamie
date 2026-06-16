// CommonJS entry shim. The core (index.ts) is authored as an ES module with a default
// export, so compiled to CommonJS it surfaces as `require('streamie').default`. This
// shim — compiled to dist/cjs/index.cjs and pointed at by the "require" condition of the
// package's "." export — re-exports that default with `export =`, so plain CommonJS
// callers get the streamie function directly: `const streamie = require('streamie')`.
//
// ESM consumers never see this file (they resolve the "import" condition to
// dist/esm/index.js). Only the root entry needs the shim: the web/node entries expose
// named functions, which require() already surfaces cleanly.
import streamie from './index.js';
export = streamie;
