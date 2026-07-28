# Triple M — Menu & Order-Ahead

Live menu: **https://triple-m-menu.netlify.app/**
Counter poster (QR, on-screen display): **https://triple-m-menu.netlify.app/poster.html**
Printable marketing flyer (A4, "Order From Class"): **https://triple-m-menu.netlify.app/flyer-print.html**
Admin (edit menu + manage orders — do not share): **https://triple-m-menu.netlify.app/admin.html**

A scannable web menu and order-ahead system for the Triple M campus kiosk —
no app required. Bilingual (English/Arabic, RTL), same "Midnight Espresso"
brand as the native app prototype.

## What it does

- **Browse** — Coffee / Snacks / Food tabs, bilingual, prices in JD
- **Order ahead** — tap **+** on any item, add a note ("no onion"), enter
  name + student number, submit from class. Staff see it appear live in
  the admin Orders queue and mark it cancelled / preparing / paid as it
  moves through the counter
- **Admin** — edit name/description/price/photo/badge per language,
  add/remove items, **hide/show items without deleting them** (e.g. sold
  out for the day), manage the live order queue

## Architecture

- `menu-data.json` — source of truth: categories + items, `{en, ar}` text,
  price, badge, `hidden` flag, optional photo
- `index.html` — fetches `menu-data.json`, renders the menu, handles the
  cart/order flow and the language toggle
- `admin.html` — the CMS: writes `menu-data.json` (and photos into
  `images/`) via the **GitHub Contents API** using a fine-grained PAT
  pasted into that browser's local storage (never committed); also polls
  and manages the live order queue
- `netlify/functions/orders.js` — serverless function backing the order
  queue, storage via **Netlify Blobs** (not git-based — orders are
  multi-writer and time-sensitive in a way menu edits aren't)
- `theme.css` — shared design tokens + embedded Fraunces/Sora/El
  Messiri/Tajawal fonts
- `poster.html` — on-screen counter display with the QR
- `flyer-print.html` — A4 print flyer; open it and print (or "Save as
  PDF") to make more copies any time

**Deploy pipeline:** any push to `master` (admin menu save, or a direct
commit) → `.github/workflows/deploy.yml` runs `netlify deploy --prod` →
live in under a minute. Order submissions and status updates go straight
to the Netlify Function/Blobs store — no redeploy needed, near-instant.

## Why Netlify, not GitHub Pages

Originally deployed on GitHub Pages (`saifzubaidi9-spec.github.io/...`),
moved to a clean `triple-m-menu.netlify.app` so the public URL isn't tied
to a personal GitHub username. Before that, this lived as a Claude
artifact link — `claude.ai` is registered as a universal link on the
Claude mobile app, so scanning a `claude.ai/...` QR opened the Claude app
instead of a browser, even when shared publicly. A plain domain has no
such interception.

## Admin access

`admin.html` needs a GitHub fine-grained personal access token (Contents:
read/write, scoped to only this repo) pasted in once — it's saved in that
browser's local storage only, never committed anywhere. Anyone with the
link can view the form, but nobody can save menu changes without their
own valid token. The Orders tab has no such gate (matches the "don't
share this link" trust model already in place) — don't share the admin
link publicly.

## Verified

Every feature here was checked against the live deployed site, not just
the local build — QR round-trip decoded via an independent service; the
admin save pipeline proven with a real price edit watched through to the
live site; a full two-browser Playwright run (student places an order →
appears in admin → cycled through all three statuses → persists across
reload); hide/show toggled live in both directions; the flyer's printed
QR re-verified by cropping the rendered PDF output and decoding it
independently.
