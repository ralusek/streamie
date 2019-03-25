const { source} = require('../dist');
const { StreamieQueue } = require('../dist/Streamie/StreamieQueue');


// // idea for middleware:
// // the second argument is optional state for the middleware, this can be used
// // for batching, for example. It will then be added onto the utils object
// // as "state"
// middlewareManager.addMiddleware({
//   onInput: (input, { emitOutput, state: {streamie, middleware} }) => {
//     state.middleware.queue.push(input);
//     if (state.queue.length >= state.streamie.private.config.batchSize)
//   },
//   onDrain: ({emitOutput, state: {middleware}}) => {
//     emitOutput(middleware.queue);
//   },
// }, {
//   queue: []
// });



// // Why is "source" undefined if it's exported off of the entrypoint /src/index.ts?
// const streamie = source((item) => {
//   console.log('Handling', item);
//   return item + 'butt';
// });

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
