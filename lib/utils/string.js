'use strict';
'use string';

module.exports.generateId = function () {
  return Date.now().toString(36) + '_' + _random() + '_' + _random();
};

function _random() {
  return Number(String(Math.random()).replace('0.', '')).toString(36);
}