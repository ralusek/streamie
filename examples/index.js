'use strict';

const Streamie = require('../index');


function timeout(fn, amount) {
  return new Promise((resolve, reject) => {
    setTimeout(() => resolve(fn()), amount);
  });
}


const queue = new Streamie({
  handler: (item) => {
    console.log(_ts(), 'Handling', item);
    return timeout(() => item, 100);
  },
  concurrency: 3
});


queue
.map(item => item.letter.toUpperCase(), {name: 'A'})
.filter(letter => !['D', 'K', 'X'].includes(letter))
.map(items => {
  console.log('Should be batched and have been filtered:', items);
  return items;
}, {batchSize: 4, concurrency: 1})
.map(item => {
  console.log('Should be flattened:', item);
  return item;
}, {flatten: true})
.map(item => timeout(() => console.log('Applies backpressure.'), 5000), {concurrency: 5});



const letters = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'
];

const len = letters.length;

// Add a bunch more letters for testing.
for (let i = 1; i < 15; i++) {
  for (let j = 0; j < len; j++) {
    let letter = letters[j];
    let result = letter;
    for (let l = 0; l < i; l++) {
      result += letter;
    }
    letters.push(result);
  }
}

letters.forEach(letter => queue.push({letter, id: Math.random()}));


function _ts() {
  return String(Date.now()).slice(8);
}