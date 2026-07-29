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

  function ordersInRange(orders, startKey, endKey) {
    return orders.filter(function (o) {
      var k = localDateKey(o.createdAt);
      return k >= startKey && k <= endKey;
    });
  }

  function paidOnly(orders) {
    return orders.filter(function (o) { return o.status === 'done'; });
  }

  function historyOnly(orders) {
    return orders.filter(function (o) { return o.status === 'done' || o.status === 'cancelled'; });
  }

  function sumTotal(orders) {
    return orders.reduce(function (sum, o) { return sum + Number(o.total); }, 0);
  }

  function groupByDay(orders) {
    var map = {};
    orders.forEach(function (o) {
      var k = localDateKey(o.createdAt);
      if (!map[k]) map[k] = [];
      map[k].push(o);
    });
    return Object.keys(map).sort().map(function (k) {
      return { dateKey: k, orders: map[k].slice().sort(function (a, b) { return a.createdAt - b.createdAt; }) };
    });
  }

  function tallyItems(orders) {
    var map = {};
    orders.forEach(function (o) {
      o.items.forEach(function (it) {
        var row = map[it.itemId];
        if (!row) { row = { itemId: it.itemId, name: it.name, qty: 0, revenue: 0, lastSeen: o.createdAt }; map[it.itemId] = row; }
        row.qty += 1;
        row.revenue += Number(it.price);
        if (o.createdAt >= row.lastSeen) { row.name = it.name; row.lastSeen = o.createdAt; }
      });
    });
    return Object.keys(map).map(function (k) {
      var row = map[k];
      return { itemId: row.itemId, name: row.name, qty: row.qty, revenue: row.revenue };
    }).sort(function (a, b) { return b.qty - a.qty; });
  }

  var api = {
    localDateKey: localDateKey,
    dateFromKey: dateFromKey,
    addDays: addDays,
    weekRange: weekRange,
    monthRange: monthRange,
    yearRange: yearRange,
    ordersInRange: ordersInRange,
    paidOnly: paidOnly,
    historyOnly: historyOnly,
    sumTotal: sumTotal,
    groupByDay: groupByDay,
    tallyItems: tallyItems
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.OrdersReporting = api;
  }
})(typeof window !== 'undefined' ? window : this);
