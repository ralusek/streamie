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

source(items, (item) => {
  console.log('Starting', item);

  return new Promise((resolve) => {
    setTimeout(() => resolve(), Math.random() * 5000);
  })
  .then(() => {
    console.log('Done with', item);
  });
});
