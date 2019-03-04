const { join } = require('path');
const fs = require('fs').promises;

async function _listAllFiles(dir, cb, { filter, depth = 0 }) {
  const entries = await fs.readdir(dir);
  entries.forEach(entry => {
    const joined = join(dir, entry);
    return fs.lstat(joined)
      .then(stats => {
        if (stats.isFile()) {
          if (!filter || filter(joined)) cb(joined, depth);
        }
        else if (stats.isDirectory()) _listAllFiles(joined, cb, {
          filter,
          depth: depth + 1
        });
      });
  });
}

module.exports._listAllFiles = _listAllFiles;
