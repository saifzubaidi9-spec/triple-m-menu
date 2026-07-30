# Web Orders Calendar History & Sales Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third "Web Orders" admin tab that shows paid/cancelled order history behind a themed calendar, with day-level order detail (+ undo/delete) and week/month/year/custom item-sales reporting — while the existing Orders tab becomes a live-only queue (new/preparing).

**Architecture:** Everything is client-side inside `admin.html`, reusing the three existing Netlify Function endpoints (`GET`/`PATCH`/`DELETE` on `/api/orders`) unchanged. Pure date/aggregation math is extracted into a new small vanilla-JS file (`orders-reporting.js`) so it can be unit-tested with plain Node (`assert`, no framework) independently of the DOM; `admin.html` loads it via a `<script src>` tag, the same buildless pattern the rest of the site already uses.

**Tech Stack:** Vanilla JS (ES5-style, matching the rest of `admin.html`), no new npm dependencies, no bundler. Node's built-in `assert` module for the pure-logic unit tests. Playwright (`playwright-core`, already used all session) for browser-level verification — those scripts are scratch/throwaway per established project convention, unlike `orders-reporting.test.js` which is a real committed regression test.

---

## Spec reference

Full design: `docs/superpowers/specs/2026-07-29-web-orders-reporting-design.md`. Read it before starting — this plan implements it exactly, section by section.

## A note on "TDD" for this codebase

This project has zero existing test infrastructure (no Jest/Mocha/pytest, no `tests/` folder) and is deliberately dependency-free/buildless. Strict "write a failing unit test, watch it fail, implement, watch it pass" is fully honored for the **pure logic** in `orders-reporting.js` (Tasks 1–2) using nothing but Node's built-in `assert` — zero new dependencies. For **DOM/UI wiring** (Tasks 3–10) there is no existing browser-test harness in this repo and building one (jsdom, testing-library, etc.) would be a disproportionate new dependency for a single-page café admin tool — so those tasks are verified with a real Playwright browser session against the actual page (Task 11), matching the verification approach already used throughout this project's development. This is a deliberate adaptation of the skill's TDD principle to this codebase's real constraints, not a shortcut.

---

## File structure

- **Create:** `triple-m-web/orders-reporting.js` — pure date-key/range/aggregation helpers. No DOM, no fetch. Dual-exports (`module.exports` for Node, `window.OrdersReporting` for the browser) so the exact same code is what's tested and what ships.
- **Create:** `triple-m-web/orders-reporting.test.js` — Node `assert`-based tests for every function in the file above. Committed to the repo (real regression test, not a scratch script).
- **Modify:** `triple-m-web/admin.html` — new CSS block, new tab button + view container, new `orders-reporting.js` script tag, new render functions, small fixes to `renderOrders()`/`updateOrderStatus()`/`fetchOrders()`.

---

### Task 1: Date-key and range helpers (`orders-reporting.js`, part 1)

**Files:**
- Create: `triple-m-web/orders-reporting.js`
- Create: `triple-m-web/orders-reporting.test.js`

- [ ] **Step 1: Write the failing tests**

Create `triple-m-web/orders-reporting.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd triple-m-web && node orders-reporting.test.js`
Expected: `Error: Cannot find module './orders-reporting.js'` (the file doesn't exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `triple-m-web/orders-reporting.js`:

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd triple-m-web && node orders-reporting.test.js`
Expected: six `PASS` lines then `All Task 1 tests passed.`

- [ ] **Step 5: Commit**

```bash
git add orders-reporting.js orders-reporting.test.js
git commit -m "Add date-key/range helpers for Web Orders reporting"
```

---

### Task 2: Filtering and aggregation helpers (`orders-reporting.js`, part 2)

**Files:**
- Modify: `triple-m-web/orders-reporting.js`
- Modify: `triple-m-web/orders-reporting.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `triple-m-web/orders-reporting.test.js` (before the final `console.log('All Task 1...')` line — replace that line with the block below, updating the message):

```js
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
```

Remove the old `console.log('All Task 1 tests passed.');` line from Task 1 (it's superseded by the final `console.log('All tests passed.')` above).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd triple-m-web && node orders-reporting.test.js`
Expected: `TypeError: OR.ordersInRange is not a function`

- [ ] **Step 3: Write the minimal implementation**

In `triple-m-web/orders-reporting.js`, add these functions right after `yearRange` (before the `var api = {` line):

```js
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
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.qty - a.qty; });
  }
```

Then update the `var api = {` block to also include the six new functions:

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd triple-m-web && node orders-reporting.test.js`
Expected: all `PASS` lines then `All tests passed.`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add orders-reporting.js orders-reporting.test.js
git commit -m "Add filtering/aggregation helpers for Web Orders reporting"
```

---

### Task 3: Third admin tab + Web Orders view container

**Files:**
- Modify: `triple-m-web/admin.html:426-432` (admin-tabs)
- Modify: `triple-m-web/admin.html:506-509` (after view-orders, before closing `.page` div)
- Modify: `triple-m-web/admin.html:509-510` (script tag order)

- [ ] **Step 1: Add the third tab button**

In `triple-m-web/admin.html`, replace:

```html
    <div class="admin-tabs" role="tablist" aria-label="Admin section">
      <button class="admin-tab" id="admin-tab-menu" role="tab" aria-selected="true" type="button">Menu</button>
      <button class="admin-tab" id="admin-tab-orders" role="tab" aria-selected="false" type="button">
        Orders
        <span class="admin-tab-badge" id="orders-badge" hidden>0</span>
      </button>
    </div>
```

with:

```html
    <div class="admin-tabs" role="tablist" aria-label="Admin section">
      <button class="admin-tab" id="admin-tab-menu" role="tab" aria-selected="true" type="button">Menu</button>
      <button class="admin-tab" id="admin-tab-orders" role="tab" aria-selected="false" type="button">
        Orders
        <span class="admin-tab-badge" id="orders-badge" hidden>0</span>
      </button>
      <button class="admin-tab" id="admin-tab-weborders" role="tab" aria-selected="false" type="button">Web Orders</button>
    </div>
```

- [ ] **Step 2: Add the Web Orders view container**

Replace:

```html
      <p class="tagline" id="orders-auth-hint" hidden style="color:var(--danger)">Enter your orders admin key above to view and manage orders.</p>
      <p class="tagline" id="orders-empty-hint" hidden>No orders yet — they'll show up here as students submit them.</p>
      <div id="orders-list"></div>
    </div>
  </div>

  <script>
```

with:

```html
      <p class="tagline" id="orders-auth-hint" hidden style="color:var(--danger)">Enter your orders admin key above to view and manage orders.</p>
      <p class="tagline" id="orders-empty-hint" hidden>No orders yet — they'll show up here as students submit them.</p>
      <div id="orders-list"></div>
    </div>

    <div id="view-weborders" hidden>
      <div class="panel">
        <div class="cal" id="web-orders-calendar"></div>
      </div>

      <div class="switcher" id="web-orders-sum-toggle">
        <button class="tab" type="button" data-window="day">Day</button>
        <button class="tab" type="button" data-window="week">Week</button>
        <button class="tab" type="button" data-window="month">Month</button>
        <button class="tab" type="button" data-window="year">Year</button>
        <button class="tab" type="button" data-window="custom">Custom</button>
      </div>

      <div class="row wrap hidden" id="web-orders-custom-range">
        <input type="date" id="web-orders-from" />
        <input type="date" id="web-orders-to" />
      </div>

      <div class="total-card" id="web-orders-total">
        <div class="total-label"></div>
        <div class="total-amount"></div>
        <div class="total-sub"></div>
      </div>

      <div id="web-orders-list"></div>
    </div>
  </div>

  <script src="orders-reporting.js"></script>
  <script>
```

- [ ] **Step 3: Verify the page still loads without a console error**

Run:
```bash
cd triple-m-web && node -e "
const fs = require('fs');
const html = fs.readFileSync('admin.html', 'utf8');
const scriptMatches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
let ok = true;
scriptMatches.forEach((m, i) => { try { new Function(m[1]); } catch (e) { ok = false; console.log('Block', i, 'ERROR:', e.message); } });
console.log(ok ? 'ALL SCRIPT BLOCKS PARSE OK' : 'FAILED');
"
```
Expected: `ALL SCRIPT BLOCKS PARSE OK`

- [ ] **Step 4: Commit**

```bash
git add admin.html
git commit -m "Add Web Orders tab shell + orders-reporting.js script tag"
```

---

### Task 4: CSS for calendar, year picker, total card, item tally

**Files:**
- Modify: `triple-m-web/admin.html:419` (just before `</style>`)

- [ ] **Step 1: Add the CSS block**

In `triple-m-web/admin.html`, immediately before the `</style>` tag (currently line 419), insert:

```css
    /* Web Orders: calendar */
    .cal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; position: relative; }
    .cal-head button { background: var(--surface-hi); border: 1px solid var(--line); color: var(--cream); border-radius: 8px; width: 30px; height: 30px; cursor: pointer; font-size: 1rem; }
    .cal-month { background: transparent; border: none; font-family: var(--font-display); font-size: 1rem; color: var(--cream); cursor: pointer; padding: 4px 10px; }
    .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
    .cal-dow { text-align: center; font-size: 0.65rem; color: var(--cream-faint); padding-bottom: 4px; }
    .cal-day {
      aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
      border-radius: 8px; font-size: 0.82rem; color: var(--cream-dim); position: relative; cursor: pointer; border: 1px solid transparent;
    }
    .cal-day.has-orders::after { content: ''; position: absolute; bottom: 4px; width: 4px; height: 4px; border-radius: 50%; background: var(--matcha); }
    .cal-day.dim { color: var(--cream-faint); opacity: 0.35; cursor: default; }
    .cal-day.today { border-color: var(--amber); }
    .cal-day.selected { background: var(--amber); color: var(--on-amber); font-weight: 700; }
    .cal-day.selected::after { background: var(--on-amber); }

    .year-picker {
      position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
      background: var(--surface-hi); border: 1px solid var(--line); border-radius: 14px;
      padding: 12px; z-index: 10; box-shadow: 0 10px 28px rgba(0,0,0,0.45); width: 240px;
    }
    .year-picker.hidden { display: none; }
    .year-picker-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; font-weight: 700; }
    .year-picker-head button { background: transparent; border: none; color: var(--cream); font-size: 1rem; cursor: pointer; width: 26px; height: 26px; }
    .year-picker-months { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
    .year-picker-months button {
      background: var(--bg-elevated); border: 1px solid var(--line); color: var(--cream-dim);
      border-radius: 8px; padding: 6px 0; font-size: 0.75rem; cursor: pointer;
    }
    .year-picker-months button.active { background: var(--amber); color: var(--on-amber); border-color: var(--amber); }

    .total-card { background: var(--bg-elevated); border: 1px solid var(--line); border-radius: 14px; padding: 16px; margin: 14px 0; text-align: center; }
    .total-label { font-size: 0.7rem; color: var(--cream-faint); text-transform: uppercase; letter-spacing: 0.05em; }
    .total-amount { font-family: var(--font-display); font-size: 2rem; color: var(--amber); margin-top: 4px; }
    .total-sub { font-size: 0.75rem; color: var(--cream-dim); margin-top: 2px; }

    .tally-row { display: flex; justify-content: space-between; padding: 10px 0; border-top: 1px solid var(--line); font-size: 0.85rem; }
    .tally-row:first-child { border-top: none; }
    .tally-name { color: var(--cream); }
    .tally-amt { color: var(--matcha); font-weight: 600; }
    .tally-grand-total { border-top: 2px solid var(--line); margin-top: 6px; padding-top: 12px; font-weight: 700; }
    .tally-grand-total .tally-amt { color: var(--amber); }
```

- [ ] **Step 2: Verify no CSS syntax errors by loading the page locally**

Run:
```bash
cd triple-m-web && node -e "
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file:///' + __dirname.replace(/\\\\/g, '/') + '/admin.html', { waitUntil: 'networkidle' });
  console.log(errors.length ? 'ERRORS: ' + errors.join(' | ') : 'NO PAGE ERRORS');
  await browser.close();
})();
"
```
Expected: `NO PAGE ERRORS`

- [ ] **Step 3: Commit**

```bash
git add admin.html
git commit -m "Add CSS for Web Orders calendar, year picker, totals, item tally"
```

---

### Task 5: Live Orders tab shows only new/preparing (and fix the empty-hint bug)

**Files:**
- Modify: `triple-m-web/admin.html:1185-1269` (`renderOrders`)

- [ ] **Step 1: Update `renderOrders()` to filter to the live queue**

The current function (`admin.html:1185`) loops over the full `orders` array and computes `emptyHint.hidden` from `orders.length`, which is a **pre-existing bug**: once any order has ever existed, `orders.length` is never `0` again even when the live queue is empty, so the "No orders yet" hint permanently stops showing. Fix both issues together.

Find:
```js
    function renderOrders() {
      var root = document.getElementById('orders-list');
      var emptyHint = document.getElementById('orders-empty-hint');
      var authHint = document.getElementById('orders-auth-hint');
      if (!root) return;
      root.innerHTML = '';
      authHint.hidden = !ordersUnauthorized;
      emptyHint.hidden = ordersUnauthorized || orders.length !== 0;

      orders.forEach(function (order) {
```

Replace with:
```js
    function liveOrders() {
      return orders.filter(function (o) { return o.status === 'new' || o.status === 'preparing'; });
    }

    function renderOrders() {
      var root = document.getElementById('orders-list');
      var emptyHint = document.getElementById('orders-empty-hint');
      var authHint = document.getElementById('orders-auth-hint');
      if (!root) return;
      root.innerHTML = '';
      authHint.hidden = !ordersUnauthorized;
      var live = liveOrders();
      emptyHint.hidden = ordersUnauthorized || live.length !== 0;

      live.forEach(function (order) {
```

Then find the closing of that same `forEach` (further down, still inside `renderOrders`):
```js
        root.appendChild(card);
      });

      var newCount = orders.filter(function (o) { return o.status === 'new'; }).length;
```

Replace with:
```js
        root.appendChild(card);
      });

      var newCount = live.filter(function (o) { return o.status === 'new'; }).length;
```

(Behavior is identical for `newCount` since `live` is a superset filter of `new`/`preparing` — this just avoids re-scanning the full `orders` array a second time.)

- [ ] **Step 2: Manually verify the filter logic**

Run:
```bash
cd triple-m-web && node -e "
const orders = [
  { status: 'new' }, { status: 'preparing' }, { status: 'done' }, { status: 'cancelled' }
];
const live = orders.filter(o => o.status === 'new' || o.status === 'preparing');
console.log('live count:', live.length, '(expect 2)');
console.log(live.length === 2 ? 'PASS' : 'FAIL');
"
```
Expected: `live count: 2 (expect 2)` then `PASS`

- [ ] **Step 3: Commit**

```bash
git add admin.html
git commit -m "Orders tab: show only new/preparing (live queue), fix stale empty-hint"
```

---

### Task 6: `deleteOrder()` + make `updateOrderStatus()` return its promise, add optimistic re-render hooks

**Files:**
- Modify: `triple-m-web/admin.html:1175-1183` (`updateOrderStatus`)
- Modify: `triple-m-web/admin.html:1161-1173` (`fetchOrders`)

- [ ] **Step 1: Update `updateOrderStatus` and add `deleteOrder`**

Find (`admin.html:1175`):
```js
    function updateOrderStatus(id, status) {
      var o = orders.find(function (x) { return x.id === id; });
      if (o) { o.status = status; renderOrders(); } // optimistic update
      fetch(ORDERS_ENDPOINT, {
        method: 'PATCH',
        headers: Object.assign({ 'Content-Type': 'application/json' }, ordersAuthHeaders()),
        body: JSON.stringify({ id: id, status: status })
      }).then(function () { return fetchOrders(); });
    }
```

Replace with:
```js
    function updateOrderStatus(id, status) {
      var o = orders.find(function (x) { return x.id === id; });
      if (o) { o.status = status; renderAllOrderViews(); } // optimistic update
      return fetch(ORDERS_ENDPOINT, {
        method: 'PATCH',
        headers: Object.assign({ 'Content-Type': 'application/json' }, ordersAuthHeaders()),
        body: JSON.stringify({ id: id, status: status })
      }).then(function () { return fetchOrders(); });
    }

    function deleteOrder(id) {
      orders = orders.filter(function (o) { return o.id !== id; }); // optimistic
      renderAllOrderViews();
      return fetch(ORDERS_ENDPOINT + '?id=' + encodeURIComponent(id), {
        method: 'DELETE',
        headers: ordersAuthHeaders()
      }).then(function () { return fetchOrders(); });
    }
```

(`renderAllOrderViews` is defined in Task 10 — this will not run correctly until then; that's expected, Task 10 wires it up. `renderOrders` alone is not enough here since Web Orders needs to react to status changes too.)

- [ ] **Step 2: Commit**

```bash
git add admin.html
git commit -m "Add deleteOrder(); make updateOrderStatus() return its promise chain"
```

(Deferred verification: this task's correctness is confirmed end-to-end in Task 11, once `renderAllOrderViews` exists.)

---

### Task 7: Calendar render, month navigation, year/month picker

**Files:**
- Modify: `triple-m-web/admin.html` — add new functions after `updateOrderStatus`/`deleteOrder` (i.e., after the code added in Task 6, before `renderOrders`)

- [ ] **Step 1: Add calendar state, constants, and render functions**

In `triple-m-web/admin.html`, insert this block right after the `deleteOrder` function added in Task 6 (before `function renderOrders() {`):

```js
    // ── Web Orders: calendar ─────────────────────────────────────────────
    var MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    var DOW_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    var webOrdersState = {
      viewYear: null,
      viewMonth: null,
      selectedDateKey: null,
      sumWindow: 'day',
      customFrom: null,
      customTo: null
    };

    function initWebOrdersState() {
      var today = OrdersReporting.localDateKey(Date.now());
      webOrdersState.selectedDateKey = today;
      var d = OrdersReporting.dateFromKey(today);
      webOrdersState.viewYear = d.getFullYear();
      webOrdersState.viewMonth = d.getMonth();
    }

    function historyOrders() {
      return OrdersReporting.historyOnly(orders);
    }

    function ordersByDateKeySet() {
      var set = {};
      historyOrders().forEach(function (o) { set[OrdersReporting.localDateKey(o.createdAt)] = true; });
      return set;
    }

    function renderCalendar() {
      var root = document.getElementById('web-orders-calendar');
      if (!root) return;
      root.innerHTML = '';
      var year = webOrdersState.viewYear, month = webOrdersState.viewMonth;
      var hasOrders = ordersByDateKeySet();
      var todayKey = OrdersReporting.localDateKey(Date.now());

      var head = document.createElement('div');
      head.className = 'cal-head';

      var prevBtn = document.createElement('button');
      prevBtn.type = 'button';
      prevBtn.textContent = '\u2039';
      prevBtn.addEventListener('click', function () {
        webOrdersState.viewMonth -= 1;
        if (webOrdersState.viewMonth < 0) { webOrdersState.viewMonth = 11; webOrdersState.viewYear -= 1; }
        renderCalendar();
      });

      var label = document.createElement('button');
      label.type = 'button';
      label.className = 'cal-month';
      label.textContent = MONTH_NAMES[month] + ' ' + year;
      label.addEventListener('click', function () { toggleYearPicker(); });

      var nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.textContent = '\u203a';
      nextBtn.addEventListener('click', function () {
        webOrdersState.viewMonth += 1;
        if (webOrdersState.viewMonth > 11) { webOrdersState.viewMonth = 0; webOrdersState.viewYear += 1; }
        renderCalendar();
      });

      head.appendChild(prevBtn);
      head.appendChild(label);
      head.appendChild(nextBtn);
      root.appendChild(head);

      var yearPicker = document.createElement('div');
      yearPicker.id = 'web-orders-year-picker';
      yearPicker.className = 'year-picker hidden';
      root.appendChild(yearPicker);

      var grid = document.createElement('div');
      grid.className = 'cal-grid';
      DOW_NAMES.forEach(function (d) {
        var dow = document.createElement('div');
        dow.className = 'cal-dow';
        dow.textContent = d.charAt(0);
        grid.appendChild(dow);
      });

      var startOffset = new Date(year, month, 1).getDay();
      var daysInMonth = new Date(year, month + 1, 0).getDate();
      var daysInPrevMonth = new Date(year, month, 0).getDate();

      for (var i = startOffset - 1; i >= 0; i--) {
        var lead = document.createElement('div');
        lead.className = 'cal-day dim';
        lead.textContent = daysInPrevMonth - i;
        grid.appendChild(lead);
      }

      for (var day = 1; day <= daysInMonth; day++) {
        var key = year + '-' + (month + 1 < 10 ? '0' + (month + 1) : month + 1) + '-' + (day < 10 ? '0' + day : day);
        var cell = document.createElement('div');
        var cls = 'cal-day';
        if (hasOrders[key]) cls += ' has-orders';
        if (key === todayKey) cls += ' today';
        if (key === webOrdersState.selectedDateKey) cls += ' selected';
        cell.className = cls;
        cell.textContent = day;
        (function (k) {
          cell.addEventListener('click', function () {
            webOrdersState.selectedDateKey = k;
            renderCalendar();
            renderWebOrdersReport();
          });
        })(key);
        grid.appendChild(cell);
      }

      var totalCells = startOffset + daysInMonth;
      var trailing = (7 - (totalCells % 7)) % 7;
      for (var t = 1; t <= trailing; t++) {
        var trail = document.createElement('div');
        trail.className = 'cal-day dim';
        trail.textContent = t;
        grid.appendChild(trail);
      }

      root.appendChild(grid);
    }

    function toggleYearPicker() {
      var picker = document.getElementById('web-orders-year-picker');
      if (!picker) return;
      if (picker.classList.contains('hidden')) {
        renderYearPicker();
        picker.classList.remove('hidden');
      } else {
        picker.classList.add('hidden');
      }
    }

    function renderYearPicker() {
      var picker = document.getElementById('web-orders-year-picker');
      picker.innerHTML = '';
      var year = webOrdersState.viewYear;

      var head = document.createElement('div');
      head.className = 'year-picker-head';
      var prevYearBtn = document.createElement('button');
      prevYearBtn.type = 'button';
      prevYearBtn.textContent = '\u2039';
      prevYearBtn.addEventListener('click', function () { webOrdersState.viewYear -= 1; renderYearPicker(); });
      var yearLabel = document.createElement('span');
      yearLabel.textContent = String(webOrdersState.viewYear);
      var nextYearBtn = document.createElement('button');
      nextYearBtn.type = 'button';
      nextYearBtn.textContent = '\u203a';
      nextYearBtn.addEventListener('click', function () { webOrdersState.viewYear += 1; renderYearPicker(); });
      head.appendChild(prevYearBtn);
      head.appendChild(yearLabel);
      head.appendChild(nextYearBtn);
      picker.appendChild(head);

      var monthGrid = document.createElement('div');
      monthGrid.className = 'year-picker-months';
      MONTH_NAMES.forEach(function (name, idx) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = name.slice(0, 3);
        if (idx === webOrdersState.viewMonth && webOrdersState.viewYear === year) btn.className = 'active';
        btn.addEventListener('click', function () {
          webOrdersState.viewMonth = idx;
          picker.classList.add('hidden');
          renderCalendar();
        });
        monthGrid.appendChild(btn);
      });
      picker.appendChild(monthGrid);
    }
```

- [ ] **Step 2: Verify the script still parses**

Run the same one-liner from Task 3 Step 3:
```bash
cd triple-m-web && node -e "
const fs = require('fs');
const html = fs.readFileSync('admin.html', 'utf8');
const scriptMatches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
let ok = true;
scriptMatches.forEach((m, i) => { try { new Function(m[1]); } catch (e) { ok = false; console.log('Block', i, 'ERROR:', e.message); } });
console.log(ok ? 'ALL SCRIPT BLOCKS PARSE OK' : 'FAILED');
"
```
Expected: `ALL SCRIPT BLOCKS PARSE OK`

- [ ] **Step 3: Commit**

```bash
git add admin.html
git commit -m "Add Web Orders calendar render, month nav, year/month picker"
```

---

### Task 8: Sum toggle, total card, custom range, and the two report views

**Files:**
- Modify: `triple-m-web/admin.html` — add after the calendar functions from Task 7, before `renderOrders`

- [ ] **Step 1: Add report rendering functions**

Insert after `renderYearPicker()` (end of Task 7's block), still before `function renderOrders() {`:

```js
    // ── Web Orders: sum toggle + report body ───────────────────────────
    function formatDayLabel(key) {
      var d = OrdersReporting.dateFromKey(key);
      return DOW_NAMES[d.getDay()] + ', ' + MONTH_NAMES[d.getMonth()].slice(0, 3) + ' ' + d.getDate();
    }

    function currentRange() {
      var selKey = webOrdersState.selectedDateKey;
      if (webOrdersState.sumWindow === 'day') {
        return { start: selKey, end: selKey, label: formatDayLabel(selKey) };
      }
      if (webOrdersState.sumWindow === 'week') {
        var w = OrdersReporting.weekRange(selKey);
        return { start: w.start, end: w.end, label: formatDayLabel(w.start) + ' \u2013 ' + formatDayLabel(w.end) };
      }
      if (webOrdersState.sumWindow === 'month') {
        var m = OrdersReporting.monthRange(selKey);
        return { start: m.start, end: m.end, label: MONTH_NAMES[Number(selKey.split('-')[1]) - 1] + ' ' + selKey.split('-')[0] };
      }
      if (webOrdersState.sumWindow === 'year') {
        var y = OrdersReporting.yearRange(selKey);
        return { start: y.start, end: y.end, label: selKey.split('-')[0] };
      }
      // custom
      var from = webOrdersState.customFrom || selKey;
      var to = webOrdersState.customTo || selKey;
      return { start: from, end: to, label: formatDayLabel(from) + ' \u2013 ' + formatDayLabel(to) };
    }

    function renderWebOrdersReport() {
      var totalCard = document.getElementById('web-orders-total');
      var listRoot = document.getElementById('web-orders-list');
      if (!totalCard || !listRoot) return;

      var toggleButtons = document.querySelectorAll('#web-orders-sum-toggle .tab');
      toggleButtons.forEach(function (b) {
        b.setAttribute('aria-selected', b.getAttribute('data-window') === webOrdersState.sumWindow ? 'true' : 'false');
      });
      document.getElementById('web-orders-custom-range').hidden = webOrdersState.sumWindow !== 'custom';

      var range = currentRange();
      var inRange = OrdersReporting.ordersInRange(historyOrders(), range.start, range.end);
      var paid = OrdersReporting.paidOnly(inRange);
      var total = OrdersReporting.sumTotal(paid);

      totalCard.querySelector('.total-label').textContent = range.label;
      totalCard.querySelector('.total-amount').textContent = 'JD ' + total.toFixed(2);
      totalCard.querySelector('.total-sub').textContent = paid.length + ' paid order' + (paid.length === 1 ? '' : 's');

      listRoot.innerHTML = '';
      if (webOrdersState.sumWindow === 'day') {
        renderDayOrderList(listRoot, inRange);
      } else {
        renderGroupedOrderList(listRoot, inRange);
      }
    }

    function renderDayOrderList(root, dayOrders) {
      if (dayOrders.length === 0) {
        var empty = document.createElement('p');
        empty.className = 'tagline';
        empty.textContent = 'No orders this day.';
        root.appendChild(empty);
        return;
      }
      dayOrders.slice().sort(function (a, b) { return a.createdAt - b.createdAt; }).forEach(function (order) {
        root.appendChild(buildWebOrderCard(order));
      });
    }

    function renderGroupedOrderList(root, rangeOrders) {
      var paid = OrdersReporting.paidOnly(rangeOrders);
      var tally = OrdersReporting.tallyItems(paid);
      if (tally.length === 0) {
        var empty = document.createElement('p');
        empty.className = 'tagline';
        empty.textContent = 'No paid orders in this range.';
        root.appendChild(empty);
        return;
      }
      var grandTotal = 0;
      tally.forEach(function (row) {
        grandTotal += row.revenue;
        var line = document.createElement('div');
        line.className = 'tally-row';
        var name = document.createElement('span');
        name.className = 'tally-name';
        name.textContent = row.qty + '\u00d7 ' + row.name;
        var amt = document.createElement('span');
        amt.className = 'tally-amt';
        amt.textContent = 'JD ' + row.revenue.toFixed(2);
        line.appendChild(name);
        line.appendChild(amt);
        root.appendChild(line);
      });
      var totalLine = document.createElement('div');
      totalLine.className = 'tally-row tally-grand-total';
      var totalName = document.createElement('span');
      totalName.textContent = 'Total';
      var totalAmt = document.createElement('span');
      totalAmt.textContent = 'JD ' + grandTotal.toFixed(2);
      totalLine.appendChild(totalName);
      totalLine.appendChild(totalAmt);
      root.appendChild(totalLine);
    }

    function buildWebOrderCard(order) {
      var card = document.createElement('div');
      card.className = 'order-card';

      var top = document.createElement('div');
      top.className = 'order-card-top';
      var info = document.createElement('div');
      var student = document.createElement('div');
      student.className = 'order-student';
      student.textContent = order.studentName + ' \u00b7 #' + order.studentNumber;
      var meta = document.createElement('div');
      meta.className = 'order-meta';
      var t = new Date(order.createdAt);
      var hh = t.getHours();
      var ampm = hh >= 12 ? 'PM' : 'AM';
      var h12 = hh % 12 || 12;
      var mm = t.getMinutes() < 10 ? '0' + t.getMinutes() : t.getMinutes();
      meta.textContent = h12 + ':' + mm + ' ' + ampm + ' \u00b7 JD ' + Number(order.total).toFixed(2) + ' \u00b7 ' + order.id;
      info.appendChild(student);
      info.appendChild(meta);
      top.appendChild(info);

      var pill = document.createElement('span');
      pill.className = 'order-status-pill status-' + order.status;
      pill.textContent = STATUS_LABELS[order.status] || order.status;
      top.appendChild(pill);
      card.appendChild(top);

      var itemsWrap = document.createElement('div');
      itemsWrap.className = 'order-items';
      order.items.forEach(function (it) {
        var line = document.createElement('div');
        line.className = 'order-item-line';
        line.textContent = it.name + ' \u2014 JD ' + Number(it.price).toFixed(2);
        itemsWrap.appendChild(line);
      });
      card.appendChild(itemsWrap);

      var actions = document.createElement('div');
      actions.className = 'order-actions';

      var undoBtn = document.createElement('button');
      undoBtn.type = 'button';
      undoBtn.className = 'order-action-btn';
      undoBtn.title = 'Undo';
      undoBtn.textContent = '\u21a9 Undo';
      undoBtn.addEventListener('click', function () {
        var back = order.status === 'done' ? 'preparing' : 'new';
        updateOrderStatus(order.id, back);
      });

      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'order-action-btn';
      delBtn.title = 'Delete';
      delBtn.textContent = '\ud83d\uddd1 Delete';
      delBtn.addEventListener('click', function () {
        deleteOrder(order.id);
      });

      actions.appendChild(undoBtn);
      actions.appendChild(delBtn);
      card.appendChild(actions);

      return card;
    }
```

Note: `renderGroupedOrderList` in this step aggregates the *entire* range into one item-tally (matching the spec). Task 9 below is a documentation/sanity task confirming this matches the spec's "grouped by day" language precisely — see Task 9 for the resolution of that wording.

- [ ] **Step 2: Wire the sum-toggle buttons and custom date inputs**

Insert right after the functions above, still before `function renderOrders() {`:

```js
    document.querySelectorAll('#web-orders-sum-toggle .tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        webOrdersState.sumWindow = btn.getAttribute('data-window');
        renderWebOrdersReport();
      });
    });

    document.getElementById('web-orders-from').addEventListener('change', function (e) {
      webOrdersState.customFrom = e.target.value;
      renderWebOrdersReport();
    });
    document.getElementById('web-orders-to').addEventListener('change', function (e) {
      webOrdersState.customTo = e.target.value;
      renderWebOrdersReport();
    });
```

- [ ] **Step 3: Verify the script still parses**

Same check as Task 7 Step 2. Expected: `ALL SCRIPT BLOCKS PARSE OK`

- [ ] **Step 4: Commit**

```bash
git add admin.html
git commit -m "Add Web Orders sum toggle, total card, day list, item-tally report"
```

---

### Task 9: Resolve item-tally grouping wording against the spec (no code change — verification only)

The spec (Section 3, final version) says Week/Month/Year/Custom "replaces the order list with an item-tally report ... one row per distinct menu item sold in that window" — a single flat tally for the whole window, **not** re-grouped by day. Task 8's `renderGroupedOrderList` already implements exactly this (one `tallyItems()` call over the whole range, not per-day). The function name `renderGroupedOrderList` is a misleading leftover from an earlier draft — rename it for clarity.

**Files:**
- Modify: `triple-m-web/admin.html` (rename one function + its one call site, both added in Task 8)

- [ ] **Step 1: Rename for clarity**

Find:
```js
      if (webOrdersState.sumWindow === 'day') {
        renderDayOrderList(listRoot, inRange);
      } else {
        renderGroupedOrderList(listRoot, inRange);
      }
```
Replace with:
```js
      if (webOrdersState.sumWindow === 'day') {
        renderDayOrderList(listRoot, inRange);
      } else {
        renderItemTally(listRoot, inRange);
      }
```

Find:
```js
    function renderGroupedOrderList(root, rangeOrders) {
```
Replace with:
```js
    function renderItemTally(root, rangeOrders) {
```

- [ ] **Step 2: Verify the script still parses**

Same check as Task 7 Step 2. Expected: `ALL SCRIPT BLOCKS PARSE OK`

- [ ] **Step 3: Commit**

```bash
git add admin.html
git commit -m "Rename renderGroupedOrderList to renderItemTally for clarity"
```

---

### Task 10: Wire tab switching, shared refresh, and initial load

**Files:**
- Modify: `triple-m-web/admin.html:1271-1279` (`switchAdminTab` + its listeners)
- Modify: `triple-m-web/admin.html:1161-1173` (`fetchOrders`)
- Modify: `triple-m-web/admin.html:1281-1282` (bottom init calls)

- [ ] **Step 1: Add `renderAllOrderViews` and update `fetchOrders`**

Find (`admin.html:1161`):
```js
    function fetchOrders() {
      return fetch(ORDERS_ENDPOINT, { cache: 'no-store', headers: ordersAuthHeaders() })
        .then(function (res) {
          ordersUnauthorized = res.status === 401;
          if (ordersUnauthorized) return { orders: [] };
          return res.json();
        })
        .then(function (data) {
          orders = (data.orders || []).slice().sort(function (a, b) { return a.createdAt - b.createdAt; });
          renderOrders();
        })
        .catch(function () { /* keep last-known orders on screen */ });
    }
```

Replace with:
```js
    function renderAllOrderViews() {
      renderOrders();
      renderCalendar();
      renderWebOrdersReport();
    }

    function fetchOrders() {
      return fetch(ORDERS_ENDPOINT, { cache: 'no-store', headers: ordersAuthHeaders() })
        .then(function (res) {
          ordersUnauthorized = res.status === 401;
          if (ordersUnauthorized) return { orders: [] };
          return res.json();
        })
        .then(function (data) {
          orders = (data.orders || []).slice().sort(function (a, b) { return a.createdAt - b.createdAt; });
          renderAllOrderViews();
        })
        .catch(function () { /* keep last-known orders on screen */ });
    }
```

- [ ] **Step 2: Add the third tab to `switchAdminTab`**

Find (`admin.html:1271`):
```js
    function switchAdminTab(tab) {
      document.getElementById('admin-tab-menu').setAttribute('aria-selected', tab === 'menu' ? 'true' : 'false');
      document.getElementById('admin-tab-orders').setAttribute('aria-selected', tab === 'orders' ? 'true' : 'false');
      document.getElementById('view-menu').hidden = tab !== 'menu';
      document.getElementById('view-orders').hidden = tab !== 'orders';
    }
    document.getElementById('admin-tab-menu').addEventListener('click', function () { switchAdminTab('menu'); });
    document.getElementById('admin-tab-orders').addEventListener('click', function () { switchAdminTab('orders'); });
```

Replace with:
```js
    function switchAdminTab(tab) {
      document.getElementById('admin-tab-menu').setAttribute('aria-selected', tab === 'menu' ? 'true' : 'false');
      document.getElementById('admin-tab-orders').setAttribute('aria-selected', tab === 'orders' ? 'true' : 'false');
      document.getElementById('admin-tab-weborders').setAttribute('aria-selected', tab === 'weborders' ? 'true' : 'false');
      document.getElementById('view-menu').hidden = tab !== 'menu';
      document.getElementById('view-orders').hidden = tab !== 'orders';
      document.getElementById('view-weborders').hidden = tab !== 'weborders';
    }
    document.getElementById('admin-tab-menu').addEventListener('click', function () { switchAdminTab('menu'); });
    document.getElementById('admin-tab-orders').addEventListener('click', function () { switchAdminTab('orders'); });
    document.getElementById('admin-tab-weborders').addEventListener('click', function () { switchAdminTab('weborders'); });
```

- [ ] **Step 3: Initialize calendar state before the first fetch**

Find (`admin.html:1281`):
```js
    refreshOrdersKeyUi();
    fetchOrders();
    setInterval(fetchOrders, 10000);
```

Replace with:
```js
    refreshOrdersKeyUi();
    initWebOrdersState();
    fetchOrders();
    setInterval(fetchOrders, 10000);
```

- [ ] **Step 4: Verify the script still parses**

Same check as Task 7 Step 2. Expected: `ALL SCRIPT BLOCKS PARSE OK`

- [ ] **Step 5: Commit**

```bash
git add admin.html
git commit -m "Wire Web Orders tab switching and shared order-refresh rendering"
```

---

### Task 11: End-to-end browser verification (throwaway Playwright script)

**Files:**
- Create temporarily: `triple-m-web/verify_web_orders.js` (delete after this task — matches this project's established convention; unlike `orders-reporting.test.js`, this is not committed)

This creates one real, clearly-marked test order through the live API, drives it through the full paid → Web Orders → undo/re-pay → delete lifecycle, and cleans up after itself either way.

- [ ] **Step 1: Get the orders admin key ready**

This script needs the same `ORDERS_ADMIN_KEY` already used earlier this session for API verification. Confirm it's still valid first:

```bash
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer <ORDERS_ADMIN_KEY value>" "https://triple-m-menu.netlify.app/api/orders"
```
Expected: `200`

- [ ] **Step 2: Write the verification script**

Create `triple-m-web/verify_web_orders.js`:

```js
const { chromium } = require('playwright-core');

const BASE = 'https://triple-m-menu.netlify.app';
const KEY = '<ORDERS_ADMIN_KEY value>'; // paste the real key here when running this — never commit a real key value

async function apiPost(path, body) {
  const res = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.json();
}

(async () => {
  // 1. Place a clearly-fake test order via the open POST endpoint.
  const created = await apiPost('/api/orders', {
    studentName: 'TEST_VERIFY_WEBORDERS',
    studentNumber: '000000',
    items: [{ itemId: 'espresso', name: 'Espresso', price: 2.0 }]
  });
  if (!created.id) { console.log('FAIL: could not create test order', created); process.exit(1); }
  console.log('Created test order', created.id);

  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const page = await browser.newPage({ viewport: { width: 420, height: 1400 } });

  await page.goto(BASE + '/admin.html?nocache=' + Date.now(), { waitUntil: 'networkidle' });
  await page.evaluate((key) => { localStorage.setItem('tm_orders_key', key); }, KEY);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // 2. Switch to Orders, mark the test order paid.
  await page.click('#admin-tab-orders');
  await page.waitForTimeout(500);
  const markedPaid = await page.evaluate((id) => {
    if (typeof updateOrderStatus !== 'function') return false;
    updateOrderStatus(id, 'done');
    return true;
  }, created.id);
  console.log('Marked paid via UI function:', markedPaid);
  await page.waitForTimeout(1500);

  const stillInLiveOrders = await page.evaluate((id) => {
    return Array.from(document.querySelectorAll('#orders-list .order-meta')).some((el) => el.textContent.includes(id));
  }, created.id);
  console.log('PASS: order left the live Orders tab after paid =', !stillInLiveOrders);

  // 3. Switch to Web Orders — today's day cell should be selected by default and show the order.
  await page.click('#admin-tab-weborders');
  await page.waitForTimeout(500);
  const dayViewShowsIt = await page.evaluate((id) => {
    return Array.from(document.querySelectorAll('#web-orders-list .order-meta')).some((el) => el.textContent.includes(id));
  }, created.id);
  console.log('PASS: order appears in Web Orders Day view =', dayViewShowsIt);

  const totalAmount = await page.$eval('#web-orders-total .total-amount', (el) => el.textContent);
  console.log('Today total after test order:', totalAmount);

  // 4. Switch to Month — item tally should include Espresso with qty >= 1.
  await page.click('#web-orders-sum-toggle button[data-window="month"]');
  await page.waitForTimeout(300);
  const tallyHasEspresso = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('#web-orders-list .tally-name')).some((el) => el.textContent.includes('Espresso'));
  });
  console.log('PASS: Month item-tally includes Espresso =', tallyHasEspresso);

  // 5. Back to Day, Undo the test order (done -> preparing), confirm it reappears in live Orders.
  await page.click('#web-orders-sum-toggle button[data-window="day"]');
  await page.waitForTimeout(300);
  await page.evaluate((id) => {
    const btns = Array.from(document.querySelectorAll('#web-orders-list .order-card'));
    const card = btns.find((c) => c.textContent.includes(id));
    const undoBtn = Array.from(card.querySelectorAll('.order-action-btn')).find((b) => b.title === 'Undo');
    undoBtn.click();
  }, created.id);
  await page.waitForTimeout(1500);
  await page.click('#admin-tab-orders');
  await page.waitForTimeout(500);
  const backInLiveOrders = await page.evaluate((id) => {
    return Array.from(document.querySelectorAll('#orders-list .order-meta')).some((el) => el.textContent.includes(id));
  }, created.id);
  console.log('PASS: Undo returned order to live Orders tab =', backInLiveOrders);

  // 6. Cancel it (so it's back in Web Orders), then Delete it from there — this is the actual cleanup.
  await page.evaluate((id) => { updateOrderStatus(id, 'cancelled'); }, created.id);
  await page.waitForTimeout(1500);
  await page.click('#admin-tab-weborders');
  await page.waitForTimeout(500);
  const deleted = await page.evaluate((id) => {
    const cards = Array.from(document.querySelectorAll('#web-orders-list .order-card'));
    const card = cards.find((c) => c.textContent.includes(id));
    if (!card) return false;
    const delBtn = Array.from(card.querySelectorAll('.order-action-btn')).find((b) => b.title === 'Delete');
    delBtn.click();
    return true;
  }, created.id);
  await page.waitForTimeout(1500);
  const goneAfterDelete = await page.evaluate((id) => {
    return !Array.from(document.querySelectorAll('#web-orders-list .order-card')).some((c) => c.textContent.includes(id));
  }, created.id);
  console.log('PASS: Delete removed the test order from Web Orders (cleanup confirmed) =', deleted && goneAfterDelete);

  await browser.close();
})();
```

- [ ] **Step 3: Run it**

Run: `cd triple-m-web && node verify_web_orders.js`

Expected: every `PASS: ... = true` line, and `Created test order <ID>` followed by confirmation the same ID is gone at the end (cleanup succeeded — no leftover test data in production).

If this is run **before Task 12 deploys the code**, it will fail at the `admin-tab-weborders` click (element doesn't exist on the live site yet) — that's expected; this task is written to run *after* Task 12's deploy. Note this dependency in the task order.

- [ ] **Step 4: Delete the scratch script (do not commit it)**

```bash
rm triple-m-web/verify_web_orders.js
```

---

### Task 12: Deploy and final commit

**Files:** none (deploy + housekeeping only)

- [ ] **Step 1: Confirm no one else has pushed live menu edits since Task 1 started**

```bash
cd triple-m-web && git fetch -q && git log HEAD..origin/master --oneline
```
If this prints any commits, run `git pull --no-edit` before continuing (menu-data.json edits from the live admin page don't conflict with `admin.html`/`orders-reporting.js` changes, but always check before pushing, per this project's established practice).

- [ ] **Step 2: Push**

```bash
git push
```

This push touches `admin.html` and `orders-reporting.js`, both outside `.github/workflows/deploy.yml`'s `paths-ignore` list, so it **will** trigger a real Netlify deploy (expected and necessary — this is a genuine code change).

- [ ] **Step 3: Watch the deploy to completion**

```bash
for i in $(seq 1 15); do
  status=$(curl -s "https://api.github.com/repos/saifzubaidi9-spec/triple-m-menu/actions/runs?per_page=1" | python -c "
import json, sys
d = json.load(sys.stdin)
r = d['workflow_runs'][0]
print(r['status'] + '|' + str(r['conclusion']))
")
  echo "check $i: $status"
  if [ "${status%%|*}" = "completed" ]; then break; fi
  sleep 10
done
```
Expected: ends with `completed|success`.

- [ ] **Step 4: Run Task 11's verification script against the now-live site**

Repeat Task 11 Steps 2–4 (recreate `verify_web_orders.js`, run it, delete it). All `PASS` lines must now read `true` against the real deployed page.

- [ ] **Step 5: Report back to the user**

Summarize what shipped (third Web Orders tab, calendar, day undo/delete, week/month/year/custom item-tally reporting) and link the live admin URL, matching how every other feature in this project has been reported this session — with the verification evidence, not just a claim.

---

## Self-review notes

- **Spec coverage:** every Section 1–3 requirement in the design doc maps to a task above — third tab (Task 3), live Orders filtered to new/preparing (Task 5), calendar with dots/today/selected/year-jump (Task 7), Sun–Sat weeks (Task 1's `weekRange`), Day view with Undo/Delete (Task 6 + 8), Week/Month/Year/Custom item-tally with grand total, grouped by `itemId` not name text (Task 2's `tallyItems`), Custom date range inputs (Task 8), local-timezone day grouping (Task 1's `localDateKey`), zero backend changes (confirmed — no `orders.js` edits anywhere in this plan).
- **Placeholder scan:** no TBDs; every step has complete, runnable code.
- **Type/name consistency check:** `OrdersReporting.*` function names match between `orders-reporting.js` (Tasks 1–2) and every call site in `admin.html` (Tasks 7–8) — `localDateKey`, `dateFromKey`, `addDays`, `weekRange`, `monthRange`, `yearRange`, `ordersInRange`, `paidOnly`, `historyOnly`, `sumTotal`, `groupByDay`, `tallyItems`. `renderAllOrderViews`, `renderCalendar`, `renderWebOrdersReport`, `deleteOrder`, `updateOrderStatus`, `liveOrders` are each defined once and referenced consistently. Task 9 catches and fixes one naming inconsistency (`renderGroupedOrderList` vs. its true purpose) before it could confuse later readers.
- **Note:** `groupByDay` (Task 2) is implemented and tested but **intentionally unused** by the UI — the approved spec (Section 3, final revision) settled on a flat item-tally for Week/Month/Year/Custom, not a per-day-grouped order list. It's kept because it's a genuinely reusable, independently-correct primitive and removing it would mean deleting passing tests for no benefit; if a future request wants a per-day breakdown again, it's already there and tested.
