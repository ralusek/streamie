'use strict';

const { source } = require('../src/index');

const request = require('request-promise');


function getMLBStats(page) {
  const url = `http://mlb.mlb.com/pubajax/wf/flow/stats.splayer?season=2018&sort_order=%27desc%27&sort_column=%27avg%27&stat_type=hitting&page_type=SortablePlayer&game_type=%27R%27&player_pool=QUALIFIER&season_type=ANY&sport_code=%27mlb%27&results=1000&recSP=${page}&recPP=25`;
  return request(url)
  .then(results => JSON.parse(results).stats_sortable_player.queryResults);
}


source((page = 1, {streamie}) => {
  return getMLBStats(page)
  .then(results => {
    if (results.row) streamie.push(page + 1);
    else streamie.complete();

    return results.row;
  });
})
.filter((player) => player.name_last[0] === 'M', {flatten: true})
.map(player => player.name_display_roster)
.map((player) => console.log(player))
.then(() => console.log('DONE'));

