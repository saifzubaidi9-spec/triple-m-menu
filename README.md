# Triple M — Menu

Live: **https://triple-m-menu.netlify.app/**
Counter poster (QR to display/print): **https://triple-m-menu.netlify.app/poster.html**
Admin (edit items — do not share): **https://triple-m-menu.netlify.app/admin.html**

A scannable web menu for the Triple M campus kiosk — no app required. Scan
the QR on the poster page and it opens the menu directly in the phone's
browser. Coffee, Snacks, and Food tabs, same "Midnight Espresso" brand as
the native app prototype.

## Architecture

The menu is data-driven, not hardcoded, so the admin page can actually
change it:

- `menu-data.json` — the single source of truth (categories + items)
- `index.html` — fetches `menu-data.json` at load and renders it
- `admin.html` — edit name/description/price/photo/badge, add or remove
  items, then **Save changes** — this writes straight back to
  `menu-data.json` (and any uploaded photos into `images/`) via the
  GitHub Contents API, committing to this repo
- `theme.css` — shared design tokens + embedded Fraunces/Sora fonts
- `poster.html` — counter/display page with the QR baked in as a PNG

**Deploy pipeline:** admin save → commit lands on `master` →
`.github/workflows/deploy.yml` runs `netlify deploy --prod` → live menu
updates, usually within about a minute of hitting Save.

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
link can view the form, but nobody can save changes without their own
valid token. Don't share the admin link publicly.

## Verified

The QR was generated via a QR-encoding API, then round-trip **decoded**
via an independent service to confirm it reads back the exact menu URL —
checked against the live deployed page, not just the local build.
