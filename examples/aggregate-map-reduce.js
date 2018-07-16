'use strict';


const request = require('request');

const Streamie = require('../src/index');


function getAliceInWonderlandText() {
  const url = `http://www.gutenberg.org/files/11/11-0.txt`;
  return request(url);
}


const streamie = new Streamie();

streamie.pipeIn(getAliceInWonderlandText())
.map(chunk => chunk.toString())
.map(text => text.split(/[^\w]/))
.flatMap((word, {batchNumber}) => {
  console.log('Processed', batchNumber, 'words');
  return word.toLowerCase();
})
.reduce((aggregate, word) => aggregate[word] = (aggregate[word] || 0) + 1)
.then((wordCount) => console.log(wordCount));
