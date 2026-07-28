# Triple M — Menu

Live: **https://saifzubaidi9-spec.github.io/triple-m-menu/**
Counter poster (QR to display/print): **https://saifzubaidi9-spec.github.io/triple-m-menu/poster.html**

A scannable web menu for the Triple M campus kiosk — no app required. Scan
the QR on the poster page and it opens the menu directly in the phone's
browser. Coffee and Snacks tabs, 16 items, same "Midnight Espresso" brand
as the [native app](https://github.com/saifzubaidi9-spec) prototype.

This is deliberately hosted on GitHub Pages rather than a Claude artifact
link: `claude.ai` is registered as a universal link on the Claude mobile
app, so scanning a `claude.ai/...` QR opens the Claude app instead of the
page in a browser, even when the artifact is shared publicly. A plain
domain like this one has no such interception.

## Files

- `index.html` — the menu (this is what customers see)
- `poster.html` — counter/display page with the QR code baked in as a PNG
- `build.py`, `build_poster.py` — regenerate the HTML from the menu data
  and re-embed fonts/QR. These expect Fraunces/Sora `.woff2` files and a
  QR PNG as base64 in a local temp folder — see the script source for the
  exact paths, or re-fetch the fonts from Google Fonts and regenerate the
  QR via any QR API before rerunning.

## Verified

The QR was generated via a QR-encoding API, then round-trip **decoded**
via an independent service to confirm it reads back the exact menu URL —
checked once against the local build, and again by pulling the QR image
straight off the live deployed page.
