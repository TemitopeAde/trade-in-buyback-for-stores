# App Market Listing — Trade In Credit

Copy and assets for the Wix app dashboard (**App Profile**). Each section matches a page in the dashboard.
Images are in [`images/`](images/). To change and re-render them, edit [`source/`](source/) and run `node app-market-listing/source/render.mjs`.

---

## 1. App Info (App Profile → App Info)

### App name

```
Trade In Credit
```

Before you submit, search the App Market to check the name isn't taken. Other options that follow the naming rules:
`Trade In Hub`, `Swap for Credit`, `Buyback Credit`.

### Teaser

```
Take trade-ins and pay customers in store credit.
```

### App icon

`images/app-icon.png`: 1000 × 1000 px, 24-bit PNG (no alpha), sRGB, solid background, no text.

### Features (best first)

1. Customers get a live estimate based on your own condition rules
2. Pay out approved trade-ins as gift card store credit
3. Review photos, inspect items and send revised offers
4. Add a trade-in button to any product page
5. Customize every widget's colors, fonts and buttons in the Editor

### Full description

```
Give customers a reason to upgrade and come back. Trade In Credit lets your store accept used items, value them with your own rules and pay customers in store credit they can only spend with you.

Shoppers pick a product from your catalog, answer your condition questions, upload photos and see an estimated credit instantly. You review each request from your dashboard, mark items as received, inspect them and confirm the value or send a revised offer. When the customer accepts, a gift card is issued and emailed automatically. Accepted items can be saved as draft used products for resale.

Requires Wix Stores. Store credit is issued with Wix Gift Cards.
```

(~660 characters. The first two sentences show above "Read more".)

### Wix demo site URL

```
TODO: https://<your-demo-site>.wixsite.com/...
```

Set up a demo store with the trade-in page, the product page button and a status page. Optional, but recommended for a site app.

### Terms & conditions URL

```
TODO: https://<your-domain>/terms
```

Required. It's shown in the install consent flow.

---

## 2. Media (App Profile → Media)

All slides are 2400 × 1800 px (4:3, above the 1200 × 900 minimum), PNG, Roboto, white text on the brand color `#0F5F4F`.

| Order | File | Shows (real app UI) | Caption on the image |
|---|---|---|---|
| Main | `images/01-main.png` | App name and tagline, plus crops of the product page button and the form's live estimate | Trade In Credit: *Turn your customers' used items into store credit and repeat sales.* |
| 2 | `images/02-trade-in-form.png` | Trade-in form widget on a store page, step 2 with live estimate (Light preset) | Customers see a live estimate in four simple steps |
| 3 | `images/03-product-button.png` | Product page button with "Up to" amount and helper text | Add a trade-in button right on your product pages |
| 4 | `images/04-dashboard.png` | Dashboard request detail: answers, estimate breakdown, actions, notes, timeline | Review, inspect and value every trade-in from your dashboard |
| 5 | `images/05-design-settings.png` | Editor settings panel on the Brand preset, next to the form restyled with it | Match your brand with design controls in the Editor |
| 6 | `images/06-mobile.png` | Status widget with a revised offer, and the form, both at phone width | Mobile-friendly, so customers can trade in and track from anywhere |

This follows the website-app guidance: 2 on a site, 1 settings and customization, 1 mobile, plus the main image and a dashboard view.

**How the slides were made:** every trade-in element is the app's production React component from `src/`, rendered with sample data by the harness in [`harness/`](harness/) and captured in Chrome. Only the host store page (the "Northline" header and product page) and the product illustrations are stand-ins, because they are the merchant's site, not the app. The Editor and browser frames around the captures are simple frames, not Wix UI.

Spare captures you can swap in: `harness/raw/dash-requests.png` (request queue), `harness/raw/dash-overview.png` (overview and setup checklist), `harness/raw/cta-open.png` (product button drawer).

To regenerate after UI changes, from the repo root:

```
node_modules/.bin/vite build --config app-market-listing/harness/vite.config.mjs
python3 -m http.server 4799 --bind 127.0.0.1 -d app-market-listing/harness/dist   # separate shell
node app-market-listing/harness/capture.mjs
node app-market-listing/source/render.mjs
```

### Video (optional, YouTube URL)

```
TODO: https://www.youtube.com/watch?v=...
```

Suggested 30–45 s promo, not a tutorial: shopper taps the trade-in button → answers condition questions and sees the estimate → merchant approves and inspects in the dashboard → gift card arrives by email → shopper spends it at checkout. End on the app name.

### Promotional banner (optional)

`images/promo-banner.jpg`: 540 × 360 px JPG, brand-color background, no text and no logo. Shows a product card becoming a gift card.

---

## 3. Get Found (App Profile → App Market → Get Found)

### Category

```
Sell Online
```

### Search keywords (max 5)

```
trade-in
buyback
store credit
used items
resale
```

---

## Checklist before submitting

- [ ] Confirm the app name is available and consistent with `dash.appName` and the product name in the dashboard
- [ ] Paste the teaser, features and description, then check them against the dashboard character counters
- [ ] Upload `app-icon.png`, the 6 slides in order, and the banner
- [ ] Add the terms & conditions URL (required)
- [ ] Add the demo site URL and YouTube video (recommended)
- [ ] Set category to Sell Online and add the 5 keywords
