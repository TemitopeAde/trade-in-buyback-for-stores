# Trade In Credit — film brand kit

## Brief (product owner, 2026-10-28)
- App Market / launch promo, 16:9, 30–45 s, **silent** (fixed 120 bpm grid, 1 bar = 2 s).
- Shows: product page button + live estimate, merchant review in the dashboard, store credit issued, Editor design controls + mobile.
- Brand on screen: the icon draws itself, then wordmark and teaser. Big punchlines between scenes. Magic moves. Cursor clicks, a Wix Stores / Gift Cards mention (text only), a proof moment.

## Tokens (source: app-market-listing/source/common.css, icon.html)
| Token | Value |
|---|---|
| Brand field | `#0f5f4f` |
| Accent (icon tag, punchline accent) | `#34d399` |
| Soft text on brand | `#d1fae5` |
| Ink (phone bezel) | `#111827` |
| Type | Roboto 400/500/700 (the listing slides' font) |
| UI windows | white, 22px radius, deep soft shadow (the listing slides' cards) |

## Components
| Element | How it is shown | Why |
|---|---|---|
| Product button, form, status, settings panel, dashboard | 2x captures of the production components via `app-market-listing/harness` (`scripts/plates.mjs`) | Real UI, rendered from `src/`, frozen per state so every frame is a pure function of time |
| App icon | Redrawn from `icon.html` paths in `src/promo/Logo.tsx` | Drawn on from `t` |
| Cursor | Kit macOS arrow | The user's cursor |

## Claims
- Does: live estimate from the merchant's condition rules; merchant reviews, inspects and confirms; credit issued as a Wix gift card; Editor theme presets; mobile status page.
- Never says: credit is emailed automatically (gift card emails need a premium site plan); any real merchant results. Overview numbers are labelled "Sample store data".
- Approved lines: teaser "Take trade-ins and pay customers in store credit."; "Requires Wix Stores. Store credit is issued with Wix Gift Cards." (LISTING.md).
