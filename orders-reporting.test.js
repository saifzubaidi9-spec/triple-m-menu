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

console.log('All Task 1 tests passed.');
