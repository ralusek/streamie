'use strict';

const { source } = require('../src/index');

const items = ['a', 'b', 'c', 'd', 'e', 'f'];

source(items, (item, { streamie }) => {
  if (item === 'c') return Promise.reject(new Error('C error.'));

  return item;
})
.snatch((err, {streamie}) => {
  console.log('SNATCHED', err);
  streamie.stop();
})
.each(item => console.log('Passed through.', item));
