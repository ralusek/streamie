'use strict';

const { source } = require('../src/index');

const request = require('request-promise');


function getMLBStats(page) {
  const url = `http://mlb.mlb.com/pubajax/wf/flow/stats.splayer?season=2018&sort_order=%27desc%27&sort_column=%27avg%27&stat_type=hitting&page_type=SortablePlayer&game_type=%27R%27&season_type=ANY&sport_code=%27mlb%27&results=1000&recSP=${page}&recPP=25`;
  return request(url)
  .then(results => JSON.parse(results).stats_sortable_player.queryResults);
}

const term = 'matt';

source((page = 1, { streamie }) => {
  console.log('Pages handled per second:', streamie.metrics.time.handledPerSecond.items);
  return getMLBStats(page)
  .then(results => {
    if (results.row) {
      streamie.push(page + 1);
      return Array.isArray(results.row) ? results.row : [results.row];
    }
    streamie.complete();
  });
})
.filter(player => player.name_display_first_last.match(new RegExp(term, 'i')), { flatten: true })
.each(player => console.log(player.name_display_roster))
.reduce((agg, player) => agg.count = (agg.count || 0) + 1)
.then((a) => console.log('DONE', a));
