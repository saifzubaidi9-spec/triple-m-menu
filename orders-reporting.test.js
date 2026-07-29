var assert = require('assert');
var OR = require('./orders-reporting.js');

// localDateKey — converts an epoch-ms timestamp to a local 'YYYY-MM-DD' key.
(function () {
  var ts = new Date(2026, 6, 28, 23, 30, 0).getTime(); // Jul 28 2026, 11:30 PM local
  assert.strictEqual(OR.localDateKey(ts), '2026-07-28');
  var ts2 = new Date(2026, 0, 5, 0, 5, 0).getTime(); // Jan 5, just after midnight
  assert.strictEqual(OR.localDateKey(ts2), '2026-01-05');
  console.log('localDateKey: PASS');
})();

// dateFromKey — parses 'YYYY-MM-DD' back into a local midnight Date.
(function () {
  var d = OR.dateFromKey('2026-07-28');
  assert.strictEqual(d.getFullYear(), 2026);
  assert.strictEqual(d.getMonth(), 6); // 0-indexed
  assert.strictEqual(d.getDate(), 28);
  console.log('dateFromKey: PASS');
})();

// addDays — shifts a date key by N days, including month/year rollover.
(function () {
  assert.strictEqual(OR.addDays('2026-07-28', 1), '2026-07-29');
  assert.strictEqual(OR.addDays('2026-07-31', 1), '2026-08-01');
  assert.strictEqual(OR.addDays('2026-01-01', -1), '2025-12-31');
  assert.strictEqual(OR.addDays('2026-07-28', -3), '2026-07-25');
  console.log('addDays: PASS');
})();

// weekRange — Sunday-Saturday week containing the given day.
(function () {
  // 2026-07-28 is a Tuesday.
  var r = OR.weekRange('2026-07-28');
  assert.strictEqual(r.start, '2026-07-26'); // Sunday
  assert.strictEqual(r.end, '2026-08-01');   // Saturday
  // A Sunday itself should be the start of its own week.
  var r2 = OR.weekRange('2026-07-26');
  assert.strictEqual(r2.start, '2026-07-26');
  assert.strictEqual(r2.end, '2026-08-01');
  console.log('weekRange: PASS');
})();

// monthRange — first/last day of the month containing the given day.
(function () {
  var r = OR.monthRange('2026-07-15');
  assert.strictEqual(r.start, '2026-07-01');
  assert.strictEqual(r.end, '2026-07-31');
  var feb = OR.monthRange('2026-02-10'); // 2026 is not a leap year
  assert.strictEqual(feb.end, '2026-02-28');
  console.log('monthRange: PASS');
})();

// yearRange — Jan 1 to Dec 31 of the given day's year.
(function () {
  var r = OR.yearRange('2026-07-15');
  assert.strictEqual(r.start, '2026-01-01');
  assert.strictEqual(r.end, '2026-12-31');
  console.log('yearRange: PASS');
})();

// --- Task 2 ---

function sampleOrders() {
  return [
    { id: 'A', status: 'done', total: 4.5, createdAt: new Date(2026, 6, 28, 10, 0).getTime(),
      items: [{ itemId: 'espresso', name: 'Espresso', price: 2.0 }, { itemId: 'croissant', name: 'Croissant', price: 2.5 }] },
    { id: 'B', status: 'done', total: 2.0, createdAt: new Date(2026, 6, 28, 14, 0).getTime(),
      items: [{ itemId: 'espresso', name: 'Espresso', price: 2.0 }] },
    { id: 'C', status: 'cancelled', total: 3.0, createdAt: new Date(2026, 6, 28, 15, 0).getTime(),
      items: [{ itemId: 'latte', name: 'Latte', price: 3.0 }] },
    { id: 'D', status: 'done', total: 6.0, createdAt: new Date(2026, 6, 20, 9, 0).getTime(),
      items: [{ itemId: 'shawarma', name: 'Chicken Shawarma', price: 6.0 }] },
    { id: 'E', status: 'new', total: 2.0, createdAt: new Date(2026, 6, 28, 16, 0).getTime(),
      items: [{ itemId: 'espresso', name: 'Espresso', price: 2.0 }] }
  ];
}

// ordersInRange — inclusive local-date filter.
(function () {
  var inRange = OR.ordersInRange(sampleOrders(), '2026-07-28', '2026-07-28');
  assert.strictEqual(inRange.length, 4); // A, B, C, E — D is Jul 20
  var ids = inRange.map(function (o) { return o.id; }).sort();
  assert.deepStrictEqual(ids, ['A', 'B', 'C', 'E']);
  console.log('ordersInRange: PASS');
})();

// paidOnly / historyOnly
(function () {
  var paid = OR.paidOnly(sampleOrders());
  assert.deepStrictEqual(paid.map(function (o) { return o.id; }).sort(), ['A', 'B', 'D']);
  var hist = OR.historyOnly(sampleOrders());
  assert.deepStrictEqual(hist.map(function (o) { return o.id; }).sort(), ['A', 'B', 'C', 'D']); // not E (still 'new')
  console.log('paidOnly/historyOnly: PASS');
})();

// sumTotal
(function () {
  var sum = OR.sumTotal(OR.paidOnly(sampleOrders()));
  assert.strictEqual(sum, 12.5); // 4.5 + 2.0 + 6.0
  console.log('sumTotal: PASS');
})();

// groupByDay — ascending by date key, each order sorted by createdAt within the day.
(function () {
  var groups = OR.groupByDay(OR.historyOnly(sampleOrders()));
  assert.strictEqual(groups.length, 2);
  assert.strictEqual(groups[0].dateKey, '2026-07-20');
  assert.strictEqual(groups[0].orders.length, 1);
  assert.strictEqual(groups[1].dateKey, '2026-07-28');
  assert.strictEqual(groups[1].orders.length, 3);
  assert.deepStrictEqual(groups[1].orders.map(function (o) { return o.id; }), ['A', 'B', 'C']); // time order
  console.log('groupByDay: PASS');
})();

// tallyItems — grouped by itemId, sorted by qty desc, revenue summed, name = most recent.
(function () {
  var tally = OR.tallyItems(OR.paidOnly(sampleOrders())); // A, B, D
  assert.strictEqual(tally.length, 3); // espresso, croissant, shawarma
  assert.strictEqual(tally[0].itemId, 'espresso');
  assert.strictEqual(tally[0].qty, 2);
  assert.strictEqual(tally[0].revenue, 4.0);
  assert.strictEqual(tally[0].name, 'Espresso');
  var byId = {};
  tally.forEach(function (row) { byId[row.itemId] = row; });
  assert.strictEqual(byId.croissant.qty, 1);
  assert.strictEqual(byId.croissant.revenue, 2.5);
  assert.strictEqual(byId.shawarma.qty, 1);
  assert.strictEqual(byId.shawarma.revenue, 6.0);
  console.log('tallyItems: PASS');
})();

console.log('All tests passed.');
