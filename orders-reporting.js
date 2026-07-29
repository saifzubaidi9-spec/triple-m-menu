// Pure date/aggregation helpers for the Web Orders admin report.
// No DOM, no fetch — safe to run in Node (for tests) or the browser.
(function (root) {
  'use strict';

  function pad2(n) { return String(n).length < 2 ? '0' + n : String(n); }

  // Epoch ms -> 'YYYY-MM-DD' in the *local* timezone of whoever's viewing.
  function localDateKey(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  // 'YYYY-MM-DD' -> local Date at midnight.
  function dateFromKey(key) {
    var parts = key.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function addDays(dateKey, n) {
    var d = dateFromKey(dateKey);
    d.setDate(d.getDate() + n);
    return localDateKey(d.getTime());
  }

  // Sunday-Saturday week containing dateKey.
  function weekRange(dateKey) {
    var dow = dateFromKey(dateKey).getDay(); // 0=Sun..6=Sat
    var start = addDays(dateKey, -dow);
    return { start: start, end: addDays(start, 6) };
  }

  function monthRange(dateKey) {
    var parts = dateKey.split('-');
    var y = Number(parts[0]), m = Number(parts[1]);
    var lastDay = new Date(y, m, 0).getDate(); // day 0 of next month = last day of this one
    return { start: y + '-' + pad2(m) + '-01', end: y + '-' + pad2(m) + '-' + pad2(lastDay) };
  }

  function yearRange(dateKey) {
    var y = dateKey.split('-')[0];
    return { start: y + '-01-01', end: y + '-12-31' };
  }

  var api = {
    localDateKey: localDateKey,
    dateFromKey: dateFromKey,
    addDays: addDays,
    weekRange: weekRange,
    monthRange: monthRange,
    yearRange: yearRange
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.OrdersReporting = api;
  }
})(typeof window !== 'undefined' ? window : this);
