# Web Orders — calendar history & sales reporting

Status: approved, ready for implementation planning.
Date: 2026-07-29

## Goal

The admin "Orders" tab currently shows every order ever placed, live-queue and finished orders mixed together, sorted oldest-first, growing forever. Two problems:

1. It's unusable as a working queue once even a few days of history pile up.
2. There's no way to see sales history or revenue — how much was made today, this week, this month, this year, or between two dates, and what sold.

This spec adds a calendar-driven history view and item-level sales reporting, without touching the working queue's core mechanics.

## Current state (context, not being changed)

- `netlify/functions/orders.js`: Netlify Blobs-backed store. `GET` (auth required) returns *all* orders as one array, sorted `createdAt` desc. `POST` (open, no auth) creates an order with `{id, studentName, studentNumber, items:[{itemId,name,price,notes}], total, status:'new', createdAt, updatedAt}`. `PATCH` (auth required) sets `status` to one of `['new','preparing','done','cancelled']`. `DELETE` (auth required) removes an order by id. All four already exist and are not changing.
- `admin.html` Orders tab: polls `GET` every 10s into an `orders` array, renders every order regardless of status as a card with a status pill and three action buttons (✕ cancel, ⏱ preparing, → paid/done — `updateOrderStatus()` calls `PATCH`). The → button's own tooltip already reads "Mark as paid", i.e. `status: 'done'` **is** "paid" — no new status value is being introduced.
- Badge count on the Orders tab = count of `status === 'new'`, unchanged by this work.

## Architecture decision

**All client-side, zero changes to `orders.js`.** The existing `GET` already returns everything needed (status, `createdAt`, `total`, per-item lines). Every feature below — the working-queue filter, the calendar, the day/week/month/year sums, the item tally, undo, delete — is achievable by filtering/aggregating the same in-memory `orders` array already fetched by the existing 10s poll, and by calling the existing `PATCH`/`DELETE` endpoints. No new endpoints, no new query params, no schema changes.

This is a deliberate choice over adding server-side date-range queries: at a single café's order volume, fetching everything and filtering in the browser is simpler, ships faster, and carries zero backend risk. If order history eventually grows large enough that this feels slow, server-side date filtering is the natural next step — not built now (YAGNI).

## Tab structure

Admin gains a third top-level tab: **Menu | Orders | Web Orders**.

### Orders tab (existing, behavior change only)

Now filters to `status === 'new' || status === 'preparing'` only. Mechanically unchanged otherwise — same cards, same three action buttons, same 10s poll. The moment an order becomes `done` or `cancelled`, it simply stops appearing here on the next render (no explicit "move" step — it's a filter, not a data migration).

### Web Orders tab (new)

Shows every order with `status === 'done' || status === 'cancelled'`. Cancelled orders are kept here permanently as a record but are **excluded from every sum/tally** — only `done` orders count as revenue. Reads from the same shared `orders` array as the Orders tab (same 10s poll feeds both; no separate fetch).

#### Calendar component

- Custom month-grid, styled to match the site's dark theme (not a native `<input type="date">`) — approved via visual mockup.
- Weeks run Sunday–Saturday (matches Jordan's Sun–Thu work week / Fri–Sat weekend).
- Any day with at least one `done` or `cancelled` order gets a small dot indicator. Days with none are still selectable — selecting one just shows an empty/zero state.
- Today gets an amber outline even when it isn't the selected day. The selected day gets a solid amber fill.
- Prev/next arrows step one month at a time. Tapping the month/year label (e.g. "July 2026") opens a compact year+month picker for jumping directly to any month in any year, instead of stepping month-by-month across a whole year.
- No restriction on future dates — selecting one just shows zero orders (none exist yet); not worth special-casing as disabled.

#### Sum toggle: Day / Week / Month / Year / Custom

- Five-way toggle above a total card. Day/Week/Month/Year all key off whichever day is currently selected on the calendar (Week = that day's Sun–Sat week; Month/Year = its containing calendar month/year). Custom reveals two `<input type="date">` fields (from/to, inclusive) instead of using the calendar selection.
- Total card shows the JD revenue sum and the count of `done` orders for the active window (e.g. "Tuesday, July 28 → JD 47.30 · 14 paid orders").

#### Below the total card — two different views depending on window

**Day window:** the individual order list for that single day. Each row: student name + number, time, JD amount, status pill (reusing existing `.status-done` / `.status-cancelled` pill styles), plus two small actions:
  - **↩ Undo** — `PATCH` the order back to an earlier status: `done → preparing`, `cancelled → new`. This immediately removes it from Web Orders (its status changed) and it reappears in the live Orders tab.
  - **🗑 Delete** — calls the existing `DELETE /api/orders?id=...`. Permanent, no confirmation beyond the button itself (matches the low-friction pattern already used for status changes; a confirm dialog can be added later if accidental deletes turn out to be a problem).

**Week / Month / Year / Custom window:** replaces the order list with an **item-tally report** — one row per distinct menu item sold in that window, aggregated from every `done` order's `items[]` in range: item name, quantity sold, revenue for that item (`price × quantity`, using each order line's stored `price` at time of purchase — not a live menu lookup, so historical totals stay correct even if menu prices change later). Grouped by `itemId` (not by name text), so a later rename in the menu editor can't accidentally split one item's sales into two rows; the display name used is whichever order line was most recent within the window. Sorted by quantity sold, descending. Ends with a grand total line matching the number already shown in the total card above.

No individual orders are shown in this window, so Undo/Delete aren't available here — drop down to Day view (pick the specific date on the calendar) to act on an individual order.

## Explicitly out of scope for this iteration

- Server-side date-range queries (see Architecture decision above — revisit only if fetch-everything becomes genuinely slow).
- Pagination/virtualization for very long histories. A Year view's item-tally is already aggregated (not one row per order), so this mainly matters if a single day/week ever has an unusually large number of individual orders in Day view. Not building now; revisit if it becomes annoying in practice.
- Editing an order's contents (items, prices, student info) from Web Orders — Undo + re-processing via the live Orders flow covers the realistic correction cases.
- A confirmation dialog before Delete.
- Any change to how a student places an order, or to the `POST` endpoint — untouched.

## Key assumptions to flag

- Day grouping uses each order's `createdAt` (epoch ms) converted via the browser's local timezone (`new Date(order.createdAt)`), which is correct as long as admin.html is opened from Jordan — true today, worth remembering if that ever changes.
- "Week" = Sunday–Saturday. Easy to change later if it doesn't match how the café actually thinks about its week.
