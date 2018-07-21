'use strict';

const { source } = require('../src/index');

const streamie = source(
  ['a', 'b', 'c', 'd', 'e', 'f'],
  letter => {
    console.log('Handling Letter:', letter);
    return letter.toUpperCase();
  },
  {autoAdvance: false}
);

setTimeout(() => {
  streamie.advance()
  .then(result => console.log('Result 1:', result));
}, 1000);

setTimeout(() => {
  streamie.advance()
  .then(result => console.log('Result 2:', result));
}, 2000);

setTimeout(() => {
  streamie.advance()
  .then(result => console.log('Result 3:', result));
}, 3000);

