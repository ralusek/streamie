const { source} = require('../dist');
const { StreamieQueue } = require('../dist/Streamie/StreamieQueue');

// Why is "source" undefined if it's exported off of the entrypoint /src/index.ts?
const streamie = source((item) => {
  console.log('Handling', item);
  return item + 'butt';
});

// streamie.map(x => {
//   console.log('Mapped:', x);
//   return x;
// });

// console.log(streamie.EVENT.ITEM_PUSHED);

// streamie.on(streamie.EVENT.ITEM_PUSHED, (item) => {
//   console.log('ITEM PUSHED', item);
// });

// streamie.push('a');
// streamie.push('b');
// streamie.push('c');

// const queue = new StreamieQueue();

// queue.shift();
// queue.shift();
// queue.push('a');
// queue.push('b');
// queue.push('c');
// queue.shift();
// queue.shift();
// queue.shift();
// queue.shift();
// queue.push('d');
// queue.push('e');
// queue.shift();
