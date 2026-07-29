// Pure data-shaping for Expenses exports (Excel + PDF both consume this same shape).
// No DOM, no SheetJS, no fetch — safe to run in Node (for tests) or the browser.
(function (root) {
  'use strict';

  function flattenForExport(owners, invoices) {
    var rows = [];
    var grandTotal = 0;

    var invoicesByOwner = {};
    invoices.forEach(function (inv) {
      if (!invoicesByOwner[inv.ownerId]) invoicesByOwner[inv.ownerId] = [];
      invoicesByOwner[inv.ownerId].push(inv);
    });

    owners.forEach(function (owner) {
      var ownerInvoices = invoicesByOwner[owner.id] || [];
      if (ownerInvoices.length === 0) return;

      ownerInvoices.forEach(function (inv) {
        rows.push({ kind: 'invoice', owner: owner.name, name: inv.name, date: inv.date, amount: inv.total });
        grandTotal += inv.total;
        inv.lineItems.forEach(function (li, idx) {
          rows.push({
            kind: 'lineitem',
            owner: owner.name,
            letter: String.fromCharCode(65 + idx),
            product: li.product,
            qty: li.qty,
            amount: li.price
          });
        });
      });
    });

    return { rows: rows, grandTotal: grandTotal };
  }

  function flattenForOwner(owners, invoices, ownerId) {
    var owner = owners.find(function (o) { return o.id === ownerId; });
    var ownerInvoices = invoices.filter(function (inv) { return inv.ownerId === ownerId; });
    return flattenForExport(owner ? [owner] : [], ownerInvoices);
  }

  var api = { flattenForExport: flattenForExport, flattenForOwner: flattenForOwner };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.ExpensesExport = api;
  }
})(typeof window !== 'undefined' ? window : this);
