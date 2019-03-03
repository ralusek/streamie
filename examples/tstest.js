const { source} = require('../dist/bundle');

// Why is "source" undefined if it's exported off of the entrypoint /src/index.ts?
source((item) => {
  console.log('Handling', item);
});
