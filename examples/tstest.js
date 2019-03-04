const { source} = require('../dist');

// Why is "source" undefined if it's exported off of the entrypoint /src/index.ts?
const streamie = source((item) => {
  console.log('Handling', item);
});

streamie.on(Symbol.for('STREAMIE EVENT: ITEM PUSHED'), (item) => {
  console.log('ITEM PUSHED', item);
});

streamie.push('a');
streamie.push('b');
streamie.push('c');
