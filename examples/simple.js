'use strict';

const { source } = require('../src/index');

const items = [
  {location: 'San Diego'},
  {location: 'Los Angeles'},
  {location: 'Denver'},
  {location: 'New York'},
  {location: 'St. Louis'},
  {location: 'Zurich'},
  {location: 'Barcelona'},
  {location: 'Buenos Aires'}
]

source(items, (item, { streamie }) => {
  console.log('Starting', item);
  return new Promise((resolve) => {
    setTimeout(() => resolve(), Math.random() * 1000);
  })
  .then(() => {
    console.log('Done with', item);
    if (item.location === 'Buenos Aires') streamie.complete('Final Value');
  });
})
.then((value) => console.log('Streamie complete.', value));
