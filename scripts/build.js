const shell = require('shelljs');

const fixAbsoluteImports = require('./fixAbsoluteImports');

shell.exec('tsc');

fixAbsoluteImports();
