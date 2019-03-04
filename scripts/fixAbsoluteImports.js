const { join } = require('path');
const fs = require('fs');
const fsAsync = fs.promises;
const { _listAllFiles } = require("./_listAllFiles");


const PATH = {
  root: join(__dirname, '..')
};

const tsConfig = JSON.parse(
  _removeJSONComments(fs.readFileSync(join(PATH.root, 'tsconfig.json'), 'utf-8'))
);

PATH.dist = join(PATH.root, tsConfig.compilerOptions.outDir);

module.exports = () => {
  _listAllFiles(PATH.dist, async (file, depth) => {
    const relativePath = depth ? (new Array(depth)).fill('../').join('') : './';

    const fileData = (await fsAsync.readFile(file)).toString();

    // TODO make this replacement based off of tsconfig paths.
    const formatted = fileData.replace(/\@root\//g, relativePath);

    fsAsync.writeFile(file, formatted);
  }, { filter: file => file.match(/\.js/) });
};

function _removeJSONComments(jsonString) {
  return jsonString.replace(/\/\/.*?\n|\/\* .*?\n/g, '');
}
