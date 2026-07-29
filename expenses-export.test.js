var assert = require('assert');
var EE = require('./expenses-export.js');

function sampleData() {
  var owners = [
    { id: 'O1', name: 'Owner A' },
    { id: 'O2', name: 'Owner B' }
  ];
  var invoices = [
    { id: 'I1', ownerId: 'O1', name: 'Drinks', date: '2026-07-29', total: 55,
      lineItems: [
        { product: 'Redbull', qty: '5 pieces', price: 20 },
        { product: 'Cola', qty: '20 pieces', price: 35 }
      ] },
    { id: 'I2', ownerId: 'O2', name: 'Cleaning', date: '2026-07-20', total: 10,
      lineItems: [ { product: 'Soap', qty: '2 bottles', price: 10 } ] }
  ];
  return { owners: owners, invoices: invoices };
}

// flattenForExport — one invoice-header row plus one row per line item, grouped by owner,
// skipping owners with zero invoices, with a correct grand total.
(function () {
  var d = sampleData();
  var result = EE.flattenForExport(d.owners, d.invoices);
  assert.strictEqual(result.grandTotal, 65); // 55 + 10
  // Owner A's invoice row, then its 2 line items, then Owner B's invoice row, then its 1 line item = 5 rows
  assert.strictEqual(result.rows.length, 5);
  assert.strictEqual(result.rows[0].kind, 'invoice');
  assert.strictEqual(result.rows[0].owner, 'Owner A');
  assert.strictEqual(result.rows[0].amount, 55);
  assert.strictEqual(result.rows[1].kind, 'lineitem');
  assert.strictEqual(result.rows[1].letter, 'A');
  assert.strictEqual(result.rows[1].product, 'Redbull');
  assert.strictEqual(result.rows[2].letter, 'B');
  assert.strictEqual(result.rows[3].kind, 'invoice');
  assert.strictEqual(result.rows[3].owner, 'Owner B');
  console.log('flattenForExport: PASS');
})();

// An owner with zero invoices produces no rows and doesn't break anything.
(function () {
  var d = sampleData();
  d.owners.push({ id: 'O3', name: 'Owner C' }); // no invoices for O3
  var result = EE.flattenForExport(d.owners, d.invoices);
  assert.strictEqual(result.rows.length, 5); // unchanged
  assert.strictEqual(result.grandTotal, 65);
  console.log('flattenForExport (owner with no invoices): PASS');
})();

// flattenForOwner — filters to just one owner before flattening.
(function () {
  var d = sampleData();
  var result = EE.flattenForOwner(d.owners, d.invoices, 'O1');
  assert.strictEqual(result.grandTotal, 55);
  assert.strictEqual(result.rows.length, 3); // 1 invoice row + 2 line items
  assert.strictEqual(result.rows[0].owner, 'Owner A');
  console.log('flattenForOwner: PASS');
})();

// flattenForOwner with an owner id that has no invoices returns an empty, valid result.
(function () {
  var d = sampleData();
  var result = EE.flattenForOwner(d.owners, d.invoices, 'nonexistent-id');
  assert.strictEqual(result.rows.length, 0);
  assert.strictEqual(result.grandTotal, 0);
  console.log('flattenForOwner (unknown owner): PASS');
})();

console.log('All expenses-export tests passed.');
