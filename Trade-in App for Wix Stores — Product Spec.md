# Trade-in App for Wix Stores — Product Spec

Oct 23, 2026 · @Temmy

## Overview

The app lets Wix Stores customers trade in used items for store credit, and lets merchants review, inspect and resell them. No trade-in app exists on the Wix App Market today. Existing apps only issue store credit (Rise.ai, Shopwaive); the full trade-in flow exists only on Shopify (Tern Trade-in).

**Target merchants:** stores selling durable goods that hold resale value: electronics and phones, fashion and resale, books, games and collectibles.

**Why merchants pay:** trade-ins bring customers back to spend credit, lift average order value when credit is topped up with cash, and create used stock to resell at a margin.

**Working name:** TBD.

## Goals and non-goals (v1)

v1 delivers the full loop from customer submission to issued store credit, with photo and video evidence.

**In scope**

- Customer submission form with condition questions, photos and video
- Instant estimated offer based on merchant pricing rules
- Drop-off and ship-in handoff
- Merchant dashboard: review, inspect, adjust offer, approve or reject
- Store credit issued as a Wix gift card, emailed to the customer
- Customer status page and email notifications
- Optional relisting of accepted items as used products in Wix Stores

**Out of scope for v1**

- Pickup handoff
- Free-text items not in the store catalog
- Shipping label generation
- Cash or bank payouts
- Third-party market-value price feeds
- Own credit wallet via the Gift Cards service plugin (planned for v2)

## Roles and end-to-end flow

Two roles use the app: the **customer** (a site visitor or member) who submits items, and the **merchant** (site owner or staff) who reviews them and issues credit.

**Happy path**

1. The customer starts a trade-in from a product page, the Trade-in page or their order history.
2. They pick the item, answer condition questions, upload photos and a video, and see an estimated offer.
3. They choose drop-off or ship-in and submit. They get a reference code by email.
4. The merchant reviews the request in the dashboard and approves it (or rejects it).
5. The customer hands over the item. The merchant marks it received.
6. The merchant inspects it and confirms the final value, or sends a revised offer.
7. The app issues a gift card for the final value and emails it to the customer.
8. Optionally, the merchant relists the item as a used product.

## Customer submission

Customers submit through a 4-step form with a live estimated offer; video is supported and can be required per category.

### Entry points

| Entry point | Where | Item details prefilled |
| --- | --- | --- |
| Order history | Members area, next to each past order item | Yes |
| Trade-in page | Site page with the form widget, linked from the menu | No |
| Product page | "Trade in your old one" button showing an "up to $X" offer | Yes (that product) |

### Form steps

1. **Pick the item:** choose from past orders, or search the store catalog for items bought elsewhere.
2. **Condition:** yes/no questions set by the merchant per category, for example "Any scratches?", "Original box?", "Powers on?". Each answer adjusts the estimated offer live.
3. **Photos and video:**
   - Photos: 2 to 4 images; serial number or receipt optional.
   - Video: one clip, 15 to 60 seconds (merchant sets the maximum).
   - On mobile the video button opens the camera directly.
   - A filming checklist appears before recording: turn the item slowly to show all sides, close-up of damage, serial number or label, and for electronics, power it on and show it working.
4. **Offer and handoff:** show the estimated credit, choose drop-off or ship-in, enter contact details, accept the terms, submit.

### Video rules

- Merchant setting per category: off, optional or required.
- Accepted formats: MP4 and MOV.
- Upload progress bar with retry; the upload resumes after a dropped connection.
- The customer can finish the form while the video is still uploading; submission waits until it completes.
- Logged-in members get order history prefill and a status page in their account. Whether guests can submit is an open question.

## Handoff and status lifecycle

In v1 customers hand items over by drop-off or ship-in, and every trade-in moves through the statuses below.

| Method | How it works |
| --- | --- |
| Drop-off | The customer brings the item to the store and shows the reference code at the counter |
| Ship-in | The customer ships to the store address with a printable slip carrying the trade-in ID, then adds the tracking number on the status page |
| Pickup (later) | The merchant arranges collection, for bulky or local items |

&#91;embedded content: trade-in status lifecycle · 8 statuses\]

A lower inspection value triggers a revised offer: accepting it issues credit, declining it returns the item. The customer sees the current status on their status page and gets an email at each change.

## Merchant dashboard

The dashboard has four pages: Requests, Request detail, Rules and Settings.

### Rules

- Eligible products and categories.
- Payout as a % of the original price, per category.
- Condition questions per category, each with a value adjustment (for example "Scratches: yes = minus 15%").
- Minimum and maximum offer per item.
- Video setting per category (off, optional, required) and maximum length.
- Photo count minimum.

### Requests list

- Table of all trade-ins with reference, customer, item, estimated offer, status and date, newest first.
- Filters by status and category; search by reference or customer.

### Request detail

- Item, the customer's condition answers and the estimated offer.
- Photos in a gallery and the video playing inline, no download needed.
- Actions by status: approve, reject (with reason), mark received, confirm final value, send revised offer.
- Internal notes for staff.

### Inspection and revised offers

- After receiving the item, the merchant confirms the estimate or enters a lower value with a reason and optional photos.
- A revised offer emails the customer an accept/decline link.
- Declined: the item is returned (drop-off: collected in store; ship-in: merchant ships it back).

### Relisting

- On completion, one click creates a draft Wix Stores product from the original: title marked "Used", condition notes and the inspection photos.
- The merchant sets the price and publishes it.

### Settings

- Handoff methods offered, store address and drop-off instructions.
- Credit expiry (or none) and minimum credit amount.
- Terms text shown before submission.
- Media retention: delete photos and videos a set number of days after a trade-in closes (default 30).

## Store credit

v1 issues credit as a Wix gift card through the Wix Gift Cards API; v2 can move to the Gift Cards service plugin for an app-owned credit wallet.

|  | v1: Wix Gift Cards API | v2: Gift Cards service plugin |
| --- | --- | --- |
| How | Create a gift card for the final value and send it by email | The app becomes the gift card provider; Wix calls the app's Get Balance at checkout |
| Requirements | Wix Gift Card app installed on the site; email delivery needs a premium plan | App stores and manages balances itself |
| Customer experience | Code by email, redeemed at checkout | Can become a wallet tied to the member account, topped up by each trade-in |
| Effort | Low | High |

- On install, the app checks for the Wix Gift Card app and prompts the merchant to add it if missing.
- The app saves each gift card's ID on its trade-in record, so redeemed credit can be traced back to trade-ins.
- Reporting: credit issued, credit redeemed, and order value paid on top of credit.

Sources: [Wix Gift Cards API](https://dev.wix.com/docs/api-reference/business-solutions/gift-cards/gift-cards/introduction) · [Gift Cards service plugin: Get Balance](https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/payments/gift-cards/gift-cards-service-plugin/get-balance)

## Technical architecture

The app is built from standard Wix app extensions plus a backend that stores trade-in records.

### Extensions

| Extension | Purpose |
| --- | --- |
| Site widget | Trade-in form, offer estimate and status page |
| Site plugin on the product page | "Trade in your old one" button |
| Members area page | Order history entry point and "My trade-ins" |
| Dashboard pages | Requests, request detail, rules, settings |
| App Tools for Aria | Let merchants run actions by chat, e.g. "approve pending trade-ins under $50" |
| Backend and webhooks | Status changes, emails, gift card creation |

### Wix APIs used

- **Orders:** read the customer's past orders for item prefill.
- **Products (Wix Stores):** catalog search, original price lookup, draft product creation for relisting.
- **Gift Cards:** create the gift card and send its email.
- **Media Manager files:** store photos and video.
- **Contacts / Members:** link trade-ins to the customer.

### Media upload

- Photos: the backend calls Generate File Upload URL; the browser uploads straight to the site's Media Manager.
- Video: Wix recommends the resumable upload (tus) for files over 10 MB or on poor connections, so video always uses Generate File Resumable Upload URL. An interrupted upload pauses and resumes.
- Uploaded files are not usable immediately; the app waits for the file-ready state before attaching it to the request.
- Files go in a dedicated app folder and are deleted by the retention setting. Videos count against the merchant's Wix storage.

### Data model (app database)

| Entity | Key fields |
| --- | --- |
| TradeIn | id, reference, customer contact id, product id, order id (optional), condition answers, estimated value, final value, status, handoff method, tracking number, gift card id, created and updated dates |
| TradeInMedia | trade-in id, type (photo or video), Media Manager file id, ready state |
| TradeInEvent | trade-in id, from status, to status, actor, note, date |
| Rule | category, payout %, condition questions with adjustments, min and max offer, video setting |
| Settings | handoff methods, store address, credit expiry, terms, retention days |

Sources: [Generate File Upload URL](https://dev.wix.com/docs/api-reference/assets/media/media-manager/files/generate-file-upload-url) · [Resumable Upload API](https://dev.wix.com/docs/api-reference/assets/media/media-manager/files/resumable-upload-api) · [App Tools extensions](https://dev.wix.com/docs/build-apps/develop-your-app/develop-an-app-with-the-cli/supported-extensions/backend/schema-plugins/add-app-tools-extensions-with-the-wix-cli)

## Notifications

| Trigger | Customer gets | Merchant gets |
| --- | --- | --- |
| Submitted | Reference code, handoff instructions, status link | New request alert |
| Approved | Approval with drop-off details or ship-in address and slip | — |
| Rejected | Reason | — |
| Received | Confirmation | — |
| Revised offer | New value, reason, accept/decline link | — |
| Revised offer answered | — | Accepted or declined alert |
| Credit issued | Gift card email with code and value | — |

## Open questions

- [ ] Lead niche: electronics, fashion/resale, or books/games? This decides the default condition questions.
- [ ] Can guests submit, or members only?
- [ ] Pricing plans and limits (trade-ins per month, video, relisting, Aria tools by tier).
- [ ] App name.
- [ ] Should a customer be able to cancel a request before handoff?
