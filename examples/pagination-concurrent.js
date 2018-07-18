'use strict';

const { source } = require('../src/index');

const request = require('request-promise');


function getMLBStats(page, limit) {
  const url = `http://mlb.mlb.com/pubajax/wf/flow/stats.splayer?season=2018&sort_order=%27desc%27&sort_column=%27avg%27&stat_type=hitting&page_type=SortablePlayer&game_type=%27R%27&player_pool=QUALIFIER&season_type=ANY&sport_code=%27mlb%27&results=1000&recSP=${page}&recPP=${limit}`;
  return request(url)
  .then(results => JSON.parse(results).stats_sortable_player.queryResults);
}

const LIMIT = 25;
const CONCURRENCY = 3;


let completed = 0;


source((page, {streamie, channel}) => {
  page = page || channel; // If page is undefined, we default to the concurrency channel
  return getMLBStats(page, LIMIT)
  .then(results => {
    if (results.row) {
      streamie.push(page + CONCURRENCY);
      return results.row;
    }
    else if (++completed === CONCURRENCY) streamie.complete();
  });
}, {concurrency: CONCURRENCY})
.map((player) => {
  console.log(player);
}, {flatten: true})
.then(() => console.log('DONE'));
