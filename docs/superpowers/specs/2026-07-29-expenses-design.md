# Expenses — private owner ledger with Excel/PDF export

Status: approved, ready for implementation planning.
Date: 2026-07-29

## Goal

Add a private "Expenses" admin tab where the café's three owners (referred to here as Owner A, Owner B, Owner C — real names deliberately kept out of this doc, since it lives in the public repo) can log invoices — a name, a date, and a total made up of individual product line items (e.g. "Drinks, 29.07.2026, JD 55.00" containing "A) Redbull, 5 pieces, JD 20.00" and "B) Cola, 20 pieces, JD 35.00"). This is real financial data with real names, so it must never touch the public `triple-m-menu` GitHub repo — it needs the same private, admin-key-gated architecture already proven for order data, not the public `menu-data.json` pattern.

## Architecture: mirrors the Orders system, does not extend it

**New, separate Netlify Function** `netlify/functions/expenses.js`, with its own Netlify Blobs store (`getStore({name: 'expenses', siteID: process.env.BLOBS_SITE_ID, token: process.env.BLOBS_TOKEN})`) and its own environment variable `EXPENSES_ADMIN_KEY` (generated the same way as `ORDERS_ADMIN_KEY`: `secrets.token_urlsafe(24)`, set only as a Netlify env var, never committed anywhere). This is a deliberately separate key from `ORDERS_ADMIN_KEY` — a leak or mistake with one key doesn't expose the other, same reasoning that led to `ORDERS_ADMIN_KEY` not reusing the GitHub PAT.

**Every operation requires the key** — GET, POST, PATCH, DELETE, all of it, using the exact same `isAuthorized(event)` / `crypto.timingSafeEqual` pattern already in `orders.js`. Unlike orders, there is no "public open POST" case: only the owners themselves ever create an expense record, so nothing here is ever unauthenticated.

**Two record types, one store.** Both owners and invoices are stored as individual JSON documents in the same `expenses` Blobs store (mirroring how each order is `store.setJSON(order.id, order)` today), distinguished by a `recordType` field (`'owner'` or `'invoice'`). `GET /api/expenses` fetches every key in the store and splits the results into `{owners: [...], invoices: [...]}`. This avoids standing up two separate stores/functions for what is really one small feature.

**Data shapes:**
```
Owner:   { id, recordType: 'owner', name, hidden, createdAt, updatedAt }
Invoice: { id, recordType: 'invoice', ownerId, name, date, lineItems: [
             { id, product, qty, price }   // price = that line's total cost, NOT per-unit —
                                            // confirmed against the Redbull/Cola example, where
                                            // 20 + 35 = 55 (the invoice total) only works this way
           ], total, createdAt, updatedAt }
```
`invoice.total` is always the sum of `lineItems[].price`, recomputed client-side whenever a line item is added/edited/removed, and sent as part of the invoice object on every save — mirroring how `order.total` is computed once at creation time in the existing orders system, except here it's recomputed on every edit since invoices (unlike placed orders) are meant to be edited after creation.

**Owners are hidden, not deleted; invoices and line items are hard-deleted.** Owners follow the exact same reversible pattern as menu categories (a "Visible"/"Hidden" toggle, no permanent-delete button in the UI) since deleting an owner would orphan any invoices already attributed to them. Invoices and their line items are financial entries where a correction should just remove the mistake — these get a real Delete action, the same as Web Orders' delete-a-bad-entry capability.

**API surface** (`/api/expenses`, all methods require `Authorization: Bearer <EXPENSES_ADMIN_KEY>`):
- `GET` → `{ owners: [...], invoices: [...] }`, every record in the store.
- `POST` → body is a new owner or invoice object (`recordType` distinguishes which); server assigns `id`/`createdAt`/`updatedAt`, stores it.
- `PATCH` → body is `{ id, ...fields to update }`; used for renaming/hiding an owner, and for saving an invoice's name/date/lineItems (recomputing `total` server-side from the submitted `lineItems` as a safety check, not trusting the client's `total` blindly).
- `DELETE ?id=...` → removes a record by id. The server itself doesn't distinguish record types here (it would technically delete an owner record too if asked), but the admin UI only ever exposes a Delete action for invoices — owners only ever get the Hidden/Visible toggle, never a delete button.

## Admin UI

Fourth admin tab: **Menu | Orders | Web Orders | Expenses**. Inside:

- **Owner manager panel** (top of the tab): one row per owner with an editable name field and a Hidden/Visible toggle, plus a "+ Add owner" button — identical interaction pattern to the existing menu-category manager, just a simpler one-language name field (no EN/AR pair needed for a person's name).
- **Export All row**, next to the owner manager (not tied to any single owner tab): "📊 Export Excel" / "📄 Export PDF" buttons covering **every owner's invoices, including hidden owners** — hiding an owner only declutters the tab switcher (same as hiding a menu category declutters the customer-facing tabs), it is a display choice, not a "leave this out of the books" choice, so a financial export must stay complete regardless of which owners are currently shown as tabs.
- **Owner tab switcher** (one tab per owner, however many are currently visible) — same `.switcher`/`.tab` component already used for Drinks' sub-tabs.
- Per owner: a running total card (sum of that owner's invoice totals), that owner's own "📊 Export Excel" / "📄 Export PDF" buttons, then the list of invoice cards.
- **Invoice card**: name, date, total, and its line items lettered A/B/C... (product, qty, price), each independently editable; "+ Add product line" appends a new lettered row with the total recalculating live; "🗑 Delete invoice" removes the whole invoice. "+ Add new invoice" (below the list) creates a blank invoice card under the currently active owner, ready to fill in — same instant-blank-row pattern already used for adding a new menu item.

## Export

**Excel — real `.xlsx` via SheetJS.** Loaded as `<script src="https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js"></script>` (verified working CDN URL, SheetJS Community Edition, no build step, no npm dependency — matches this project's existing buildless pattern). Per-owner export produces one sheet: a bold header row, then one row-group per invoice (invoice name/date/total as a header row, its line items indented beneath), ending in a grand-total row. "Export All" produces the same shape across every owner's invoices (including hidden owners, per the completeness rule above) in one sheet, grouped by owner. Currency cells formatted as "JD 12.00" text (not a numeric Excel currency format, to avoid locale-specific `$`/`€` symbol surprises — this matches how currency is displayed everywhere else on this site).

**PDF — print-styled view, same technique as the existing flyer pages.** Clicking Export PDF opens a dedicated print-ready view (reusing the cream/espresso-ink print palette already established for `flyer-print.html`, since printing a dark background burns toner) showing a "Triple M — Expenses" header, the owner's name (or "All Owners" for the combined export) and the export date, then each invoice as a small table (line items as rows) with a grand total at the end. The user picks "Save as PDF" in the browser's own print dialog — zero new dependencies, and full control over layout quality since it's just CSS, not a PDF-generation API fighting with table layout.

## Explicitly out of scope for this iteration

- Per-owner separate logins/access restriction — confirmed one shared `EXPENSES_ADMIN_KEY` is sufficient; the three owner tabs are organizational, not access-control boundaries.
- Date-range reporting (day/week/month/year, like Web Orders) — confirmed a simple running total per owner is enough for now.
- Receipt photo attachments per invoice — not requested.
- Any numeric Excel currency formatting / multi-currency support — everything is JD, formatted as text.

## Key assumptions to flag

- `lineItems[].price` is each line's total cost for that batch of product, not a per-unit price — `qty` is informational only, not used in the total-calculation formula. If this doesn't match how a receipt is actually itemized in practice, this is the one detail worth double-checking once real invoices start getting entered.
- Server-side `PATCH` recomputes `total` from the submitted `lineItems` rather than trusting a client-sent total, so the invoice total can never drift from its line items even if a bug exists client-side.
