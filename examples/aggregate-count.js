'use strict';

const Streamie = require('../src/index');

const numbers = [];
for (let i = 0; i < 100000; i++) {
  numbers.push(i);
}


const queue = new Streamie();

queue
.each(item => console.log(item), {throttle: 500})
.reduce((aggregate, number) => aggregate.total = (aggregate.total || 0) + number)
.map(results => console.log(results));

queue.concat(numbers);
