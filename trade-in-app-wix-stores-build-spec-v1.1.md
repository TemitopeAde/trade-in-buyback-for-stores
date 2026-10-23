# Trade-in App for Wix Stores — Production Build Specification

**Version:** 1.1  
**Date:** October 23, 2026  
**Status:** Implementation specification  
**Working name:** TBD

## 1. Objective

Build a production-ready Wix app that lets a Wix Stores merchant accept trade-ins, assess used products, issue store credit as Wix gift cards, and optionally relist accepted items as used products. The app must support a customer-facing site widget, a product-page trade-in call-to-action, merchant dashboard workflows, Aria/App Tools where supported by Wix, and reliable notifications.

**Mandatory new requirement:** every customer-facing widget must have merchant-configurable design controls exposed through its Wix Editor settings panel. Merchants must be able to control typography, colors, buttons, spacing, borders, corners, layout, and relevant visibility options without editing code. Implement the actual React widget components and the React-based Editor settings components; do not leave this as a design-only requirement.

Use the existing repository if one exists. Inspect its structure and package scripts before changing files. Do not replace a working architecture unnecessarily.

## 2. Product scope

### 2.1 V1 scope

- Four-step trade-in submission flow with live estimated offer.
- Product selection from Wix Stores catalog or eligible past orders.
- Merchant-defined condition questions and offer adjustments.
- Photo uploads and optional/required video evidence by category.
- Drop-off and ship-in handoff options.
- Customer status page and email updates.
- Merchant dashboard for reviewing, approving, rejecting, receiving, inspecting, and valuing items.
- Revised offers with customer accept/decline workflow.
- Wix Gift Cards integration for issuing final store credit.
- Optional draft relisting of accepted items as used Wix Stores products.
- Owner/staff transactional email notifications using the Wix Email Transmissions API, after confirming current production availability and API constraints.
- Widget appearance controls in the Editor settings panel, live preview, persistence, and runtime application of saved styles.
- Aria/App Tools integration where the current Wix extension and tool contracts support it.
- Responsive design, accessibility, internationalization, security, audit trail, and automated tests.

### 2.2 Explicitly out of scope for V1

- Merchant-arranged pickup.
- Free-text trade-ins unrelated to the Wix Stores catalog.
- Shipping-label purchasing/generation.
- Cash or bank payouts.
- Third-party market-price feeds.
- A custom gift-card wallet or Gift Cards service-plugin provider; consider this for a later version.
- Automatic publication of used inventory without merchant review.

## 3. Mandatory implementation workflow

Before implementing any Wix-specific capability:

1. Inspect the repository, existing Wix CLI app configuration, extensions, generated types, installed SDKs, and package scripts.
2. Connect to and use the available Wix MCP/docs workflow. Read current official Wix documentation for every API, SDK, event, extension, permission, and Editor capability used.
3. Verify exact package names, import paths, supported runtime, permissions/scopes, payloads, event names, version requirements, and App Market availability.
4. Specifically verify Wix Editor React Components, custom settings panels, property update mechanisms, preview/live rendering, and supported widget styling APIs. Do not assume APIs from a different Wix editor or older SDK are interchangeable.
5. Verify App Tools/Aria extension support and publishing eligibility. Do not promise a feature is available to all merchants unless current docs support that claim.
6. Verify the Wix Email Transmissions API's current release/preview status, permissions, sender requirements, quotas, delivery-status semantics, and production eligibility.
7. If official docs conflict with this specification, implement the supported Wix behavior, document the discrepancy, and choose a safe fallback. Never invent an API, permission, event, or SDK method.
8. Add a short implementation note identifying verified docs and any unsupported/deferred features.

Do not begin by creating mock APIs that resemble Wix APIs. Mock external services only in tests.

## 4. Preferred stack and conventions

Follow the repository's existing compatible stack. If it is a new or compatible Astro-based Wix CLI project, use:

- Wix CLI and the currently supported Wix app runtime/extensions.
- Astro for app/backend routing where appropriate.
- API endpoints under `pages/api` using the project's actual Astro routing convention.
- React and TypeScript for the storefront widgets, widget editor components, and dashboard UI.
- shadcn/ui, Tailwind CSS, Lucide React icons, and Sonner notifications for the merchant dashboard.
- Zod for server-side and client-side schema validation.
- `fetchWithAuth` (preserving the project's established spelling and implementation) for dashboard API calls.
- Wix-supported persistence for app/site data, after checking current APIs and repository conventions.
- Centralized i18n; no hardcoded user-facing strings in widgets, Editor panels, or dashboard pages.
- A shared service layer; keep business logic out of route handlers and React components.

Do not introduce Next.js if the existing project uses Astro. Do not use Wix Design System for the merchant dashboard unless the repository or a mandatory Wix extension contract requires it. Use Wix-native Editor controls where Wix requires them for extension compatibility.

## 5. Roles and end-to-end flow

### Customer flow

1. Customer opens a product-page trade-in action, a dedicated Trade-in page, or an eligible past order in the Members area.
2. Customer selects the item and answers merchant-defined condition questions.
3. Customer uploads required photos and any required/optional video.
4. The app calculates and displays an estimate based on the current merchant rules.
5. Customer selects drop-off or ship-in, enters/validates contact details, accepts terms, and submits.
6. Customer receives a reference code and status link.
7. Merchant reviews and approves or rejects the request.
8. Customer hands over or ships the item. Merchant marks it received.
9. Merchant inspects the item and confirms the estimate or sends a revised offer with reason.
10. Customer accepts or declines a revised offer.
11. If accepted, the app issues the final-value Wix gift card through the supported Gift Cards integration and records the gift card ID.
12. Merchant may create a draft used product for manual pricing and publication.

### Merchant workflow

- Review a request queue and filter/search by status, category, date, reference, and customer.
- Inspect condition answers, uploaded evidence, estimate calculation, and customer/handoff details.
- Approve, reject with a reason, mark received, record inspection, confirm value, or send a revised offer.
- Add internal notes and view an immutable event timeline.
- View gift-card issuance status and reconcile recoverable failures without accidentally issuing duplicate credit.
- Create and manage draft resale listings.
- Configure rules, handoff methods, email notifications, retention, and widget styling.
- Use Aria/App Tools for permitted searches, summaries, reports, and actions where verified and enabled.

## 6. Widget inventory

Implement actual React components for each customer-facing widget. Keep the components modular, typed, reusable, and independently configurable.

### 6.1 `TradeInFormWidget`

A four-step form:

1. **Choose item:** catalog search and, where supported and authorized, eligible order-history selection.
2. **Condition:** merchant-defined questions and answers; update the estimate when answers change.
3. **Evidence:** upload photos and video; show progress, validation, retry, and resumable video upload.
4. **Offer and handoff:** estimated value, drop-off/ship-in choices, customer/contact fields, terms, and submit.

Requirements:
- Support desktop, tablet, and mobile.
- Show a clear step indicator, validation summary, upload progress, and recoverable error states.
- Keep form input when moving between steps.
- Prevent duplicate submission; use server idempotency.
- Do not trust client-supplied prices, rule calculations, product details, member IDs, or site IDs.
- Keep buttons accessible by keyboard and provide visible focus states.
- Respect the saved widget style configuration and theme tokens.

### 6.2 `TradeInProductButtonWidget`

A compact product-page call-to-action such as “Trade in your old one” and an optional “Up to [amount]” estimate. The merchant can control label text, visibility, button styling, placement-compatible layout, and whether the estimate appears. Product context must be verified server-side or against the supported Wix widget context.

### 6.3 `TradeInStatusWidget`

Shows a customer's trade-in status, reference, item, latest status message, handoff instructions, revised offer actions when applicable, and relevant timeline. Use a short-lived, scoped status token or authenticated member context; never expose records by sequential ID alone.

### 6.4 `MyTradeInsWidget`

A member-facing list of the current member's trade-ins with status, reference, date, and a link to details. Verify the supported Members Area extension and account-context mechanisms before implementation.

### 6.5 Shared components

Build shared React components where useful:

- `TradeInStepper`
- `ProductPicker`
- `ConditionQuestionGroup`
- `PhotoUploader`
- `VideoUploader`
- `UploadChecklist`
- `OfferSummary`
- `HandoffMethodSelector`
- `TradeInStatusTimeline`
- `RevisedOfferCard`
- `TradeInEmptyState`
- `TradeInErrorState`
- `WidgetButton`
- `WidgetCard`
- `WidgetField`
- `WidgetSectionHeading`

Shared components must consume the same typed style configuration instead of implementing independent hardcoded colors and typography.

## 7. Widget styling: merchant-controlled through the Editor panel

This is a release-blocking requirement. Merchants must be able to customize widget appearance through the widget's settings panel in the Wix Editor. Styling must persist after the Editor is closed, the site is published, and the visitor opens the live site.

### 7.1 Settings panel sections

Build a React settings/editor component with accordion sections. Use the appropriate currently supported Wix Editor React Component/settings-panel contract; confirm exact APIs with official docs before implementation.

**A. Theme and colors**
- Preset themes: Default, Light, Dark, Minimal, and Brand.
- Primary/accent color.
- Page/widget background color.
- Card/surface background.
- Heading color.
- Body text color.
- Muted/help text color.
- Border color.
- Input background and input text color.
- Primary button background, text, hover background, and border.
- Secondary button background and text.
- Error and success colors.
- Optional link color.
- Reset-to-theme and reset-all controls.

**B. Typography**
- Font family, using only fonts supported by the Wix Editor/runtime.
- Heading font family, if the Wix contract supports separate heading/body fonts.
- Body font family.
- Heading size.
- Body size.
- Label size.
- Help text size.
- Button text size.
- Font weight choices supported by the selected font.
- Line height.
- Letter spacing only if supported and usable.
- Text alignment options for widget headings and selected text blocks.
- Ensure selected fonts are loaded/preloaded using the supported Wix font API where available. Verify the exact method (for example, whether the current SDK supports a `setPreloadFonts()`-style API) rather than assuming it.

**C. Buttons**
- Shape: square, slightly rounded, rounded, pill.
- Size: small, medium, large.
- Full-width toggle.
- Border width and color.
- Button text weight.
- Hover/focus style, within supported editor/runtime constraints.
- Primary and secondary button presets.
- Separate settings for the product-page CTA when the panel belongs to that widget.

**D. Layout and spacing**
- Widget content width (within supported widget bounds).
- Form/card max width.
- Padding.
- Section spacing.
- Field spacing.
- Button spacing.
- Alignment.
- Step indicator style: numbers, progress bar, or labels where supported.
- Card layout: flat, bordered, or elevated.
- Product CTA alignment and width where compatible with its placement.
- Responsive behavior must remain safe; merchant settings must not create horizontal overflow on mobile.

**E. Borders and surfaces**
- Border radius.
- Border width.
- Card border visibility.
- Shadow preset: none, subtle, or medium.
- Input border radius and border width.
- Divider visibility.
- Do not expose arbitrary CSS or script entry fields.

**F. Widget content and visibility**
- Show/hide widget title and description.
- Editable title and description.
- Editable primary/secondary button labels where appropriate.
- Show/hide offer estimate.
- Show/hide step labels.
- Show/hide optional explanatory helper text.
- Show/hide product-page estimate.
- Show/hide status timeline details where appropriate.
- Do not allow hiding required legal terms, essential error feedback, accessibility labels, or required disclosures.

**G. Form-specific controls**
- Show/hide optional fields when allowed by business rules.
- Label/help text overrides for non-legal text.
- Handoff method display options must respect the merchant's business settings; the Editor panel cannot enable a handoff method disabled in the dashboard.
- Condition questions and pricing rules are configured in the merchant dashboard, not duplicated in the design panel.
- The design panel may control presentation only, never offer logic, access control, credit values, or business status.

**H. Advanced**
- Reset the current widget to defaults.
- Copy style settings only if the supported Wix extension API can safely implement it.
- Optional “Apply to all trade-in widgets” action only if per-widget instance configuration and Wix extension APIs can support it without overwriting unrelated site elements.
- Show a clear note that styling changes can be previewed before publishing.

### 7.2 React Editor settings component

Create a real component, for example:

`src/components/editor/TradeInWidgetSettingsPanel.tsx`

The component must:
- Use TypeScript and typed props.
- Render accordion sections with color inputs/pickers, font selectors, numeric/segmented controls, toggles, and text inputs using supported Wix Editor panel controls.
- Read the selected widget's current properties from the documented Editor extension contract.
- Update the selected widget's properties through the documented supported setter/property API (for example, a `setProp()`-style mechanism only if confirmed by current docs).
- Debounce high-frequency updates where appropriate; do not lose the latest user selection.
- Keep panel values synchronized when the merchant selects a different widget or changes the selection.
- Validate values and clamp numeric settings to documented safe ranges.
- Provide per-section reset and full reset.
- Display a useful fallback if a control or font is unsupported.
- Avoid storing authoritative widget styles only in local React state. The saved Wix widget properties must be the source of truth.
- Avoid custom browser APIs that are unavailable in the Editor runtime.
- Keep all user-facing labels localized.

Suggested type:

```ts
export type TradeInWidgetStyle = {
  version: 1;
  theme: "default" | "light" | "dark" | "minimal" | "brand";
  colors: {
    primary: string;
    background: string;
    surface: string;
    heading: string;
    text: string;
    mutedText: string;
    border: string;
    inputBackground: string;
    inputText: string;
    buttonBackground: string;
    buttonText: string;
    buttonHoverBackground: string;
    secondaryButtonBackground: string;
    secondaryButtonText: string;
    error: string;
    success: string;
    link: string;
  };
  typography: {
    fontFamily: string;
    headingFontFamily?: string;
    bodyFontFamily?: string;
    headingSize: number;
    bodySize: number;
    labelSize: number;
    helperSize: number;
    buttonSize: number;
    fontWeight: 400 | 500 | 600 | 700;
    lineHeight: number;
    letterSpacing?: number;
  };
  buttons: {
    shape: "square" | "slightly-rounded" | "rounded" | "pill";
    size: "small" | "medium" | "large";
    fullWidth: boolean;
    borderWidth: number;
  };
  layout: {
    maxWidth: number;
    padding: number;
    sectionGap: number;
    fieldGap: number;
    alignment: "left" | "center";
    cardStyle: "flat" | "bordered" | "elevated";
    stepIndicator: "numbers" | "progress" | "labels";
  };
  surfaces: {
    radius: number;
    borderWidth: number;
    shadow: "none" | "subtle" | "medium";
    showDividers: boolean;
  };
  content: {
    showTitle: boolean;
    title?: string;
    showDescription: boolean;
    description?: string;
    showOfferEstimate: boolean;
    showStepLabels: boolean;
    showHelperText: boolean;
  };
};
```

Treat this as a starting schema, not a license to use unsupported Wix controls. Adapt it to the actual Editor SDK, validate with Zod, version the configuration, and define safe defaults and migration behavior. Avoid persisting values that the selected widget does not use.

### 7.3 React widget implementation

Create actual widget components, for example:

- `src/components/widgets/TradeInFormWidget.tsx`
- `src/components/widgets/TradeInProductButtonWidget.tsx`
- `src/components/widgets/TradeInStatusWidget.tsx`
- `src/components/widgets/MyTradeInsWidget.tsx`
- `src/components/widgets/shared/WidgetThemeProvider.tsx`
- `src/components/widgets/shared/style-config.ts`
- `src/components/editor/TradeInWidgetSettingsPanel.tsx`

Requirements:
- Each widget accepts validated style props from its supported Wix widget properties/context.
- The shared `WidgetThemeProvider` maps the configuration to CSS variables or another Wix-supported styling approach.
- Never inject arbitrary CSS or HTML from merchant settings.
- Validate and normalize colors, font names, sizes, spacing, radius, and enums before applying.
- Use a defined fallback if configuration is absent, invalid, or from an older version.
- Support `prefers-reduced-motion` and keyboard interaction.
- Contrast-check text/background combinations where feasible and warn in the panel for poor contrast. Never remove focus indicators to achieve a visual effect.
- Avoid fixed pixel widths that break on small screens.
- Ensure loading, empty, success, validation, and error states use the selected theme and remain readable.
- Use the same styling system in Editor preview and published runtime to minimize preview/live discrepancies.

### 7.4 Live preview and persistence

- Style changes must appear in the Editor preview immediately, subject to the documented Wix Editor lifecycle.
- Save settings into the widget instance's supported persistent properties.
- Reloading the Editor must restore saved values.
- Publishing and opening the live site must retain those values.
- Multiple instances of the same widget may have different styles; do not use one global style record unless the merchant explicitly chooses a global theme and the Wix model supports it.
- Changing one widget instance must not unexpectedly restyle every other instance.
- If “apply to all” is supported, confirm the merchant's intent and update only the app's trade-in widget instances.
- Test existing instances when style schema versions change.
- Provide default values on install without inserting fake trade-in data.

### 7.5 Example theme mapping

The implementation may map saved values to CSS variables such as:

```css
.trade-in-widget {
  color: var(--trade-in-text);
  background: var(--trade-in-background);
  font-family: var(--trade-in-font-family);
  font-size: var(--trade-in-body-size);
}

.trade-in-widget__heading {
  color: var(--trade-in-heading);
  font-family: var(--trade-in-heading-font-family, var(--trade-in-font-family));
  font-size: var(--trade-in-heading-size);
}

.trade-in-widget__button--primary {
  color: var(--trade-in-button-text);
  background: var(--trade-in-button-background);
  border-radius: var(--trade-in-button-radius);
}
```

This is illustrative CSS, not a Wix SDK contract. Use the styling/rendering mechanism supported by the chosen Wix extension.

## 8. Widget placement and status

- The dashboard must display each site widget/plugin's placement status where the Wix extension APIs expose it.
- Show **Add to Site** or the supported placement CTA when a required widget is not installed/placed.
- Do not fake an installed state or infer placement from a local boolean alone.
- Verify the supported placement API and its lifecycle through Wix docs/MCP.
- Explain when a widget is available in the Editor but has not yet been added to a page.
- Ensure the product-page CTA extension is only offered where its supported Wix placement allows it.

## 9. Customer submission and offer calculation

### 9.1 Entry points

| Entry point | Purpose | Prefill |
| --- | --- | --- |
| Trade-in page widget | Main submission experience | Catalog selection or manual selection from catalog |
| Product-page CTA | Start a trade-in for the displayed product | Current product, after verification |
| Members Area/order history | Trade in a previously purchased item | Eligible order item and member context |

### 9.2 Four-step flow

1. **Choose item:** catalog search; past-order selection only when permissions and API context support it.
2. **Condition:** render questions configured for the product category.
3. **Evidence:** collect required photos and optional/required video.
4. **Offer and handoff:** show estimated credit, collect handoff and contact details, terms acceptance, and submit.

### 9.3 Rules

Merchants configure:
- Eligible products/categories.
- Payout percentage by category.
- Condition questions and value adjustments.
- Minimum and maximum offer per item.
- Photo minimum.
- Video mode per category: off, optional, required.
- Maximum video duration, within supported upload/processing constraints.

The server must calculate estimates from trusted product price and saved rules. The browser can display a live estimate for UX, but the backend must recompute and validate the offer at submission and at all value-changing transitions. Use currency minor units or a decimal-safe money library; never use floating-point arithmetic for final monetary decisions.

### 9.4 Media upload

- Photos use the currently documented Wix Media Manager upload flow.
- Video uses the currently documented resumable upload flow when required by file size or reliability.
- Validate file type, size, count, duration where measurable, and ownership.
- Wait for the documented file-ready state before associating media with a request.
- Use an app-specific folder/metadata strategy where supported.
- Keep a progress bar, retry handling, and resumable state for interrupted uploads.
- Enforce retention policy after a request closes; do not delete files while a request is still active or under a legal hold.
- Do not expose private media links to unauthorized users.

## 10. Handoff and trade-in lifecycle

V1 handoff methods:
- **Drop-off:** merchant configures store address and instructions; customer presents reference code.
- **Ship-in:** merchant configures return/shipping address and instructions; customer can enter tracking details where supported.

Recommended statuses (final status names and transitions must be consistently implemented):

- `submitted`
- `under_review`
- `approved`
- `rejected`
- `in_transit` (if ship-in tracking is used)
- `received`
- `inspection`
- `revised_offer_pending`
- `revised_offer_accepted`
- `revised_offer_declined`
- `credit_pending`
- `credit_issued`
- `return_pending`
- `closed`
- `cancelled`

Define a server-side transition table. Reject invalid or stale transitions. Record every state change with actor, timestamp, previous state, new state, and reason. Actions must be idempotent. A declined revised offer triggers return instructions; the app must not issue credit unless the required acceptance/confirmation rules are satisfied.

## 11. Merchant dashboard

Use a clean shadcn/ui dashboard with sidebar and main content, Lucide icons, Sonner toasts, responsive layout, and accordion settings panels where useful.

### Pages

- Overview
- Requests
- Request detail
- Rules
- Widget appearance / Editor setup
- Settings
- Notifications
- Reporting
- Billing (if monetization is enabled)
- Activity / integration diagnostics

### Overview

Show pending requests, awaiting handoff, received/inspection, revised offers awaiting response, credit issued, recent activity, and setup checklist. Use real persisted data; do not seed fake commerce records.

### Requests list

Columns: reference, customer, product, category, estimated offer, status, submission date. Include search, filters, pagination, sorting, and status chips.

### Request detail

- Product and customer details.
- Condition answers and server-calculated estimate breakdown.
- Photo gallery and inline video player.
- Handoff details and tracking reference.
- Event timeline and internal notes.
- Status-appropriate actions: approve, reject with reason, mark received, record inspection, confirm final value, send revised offer, record customer response, issue/reconcile gift card, create resale draft.
- Clear confirmation for irreversible or financial actions.
- Disable duplicate actions while a request is processing; preserve button labels and show an inline spinner rather than changing the button's wording.

### Rules and Settings

- Category and product eligibility.
- Payout percentages and adjustments.
- Questions and media requirements.
- Drop-off and ship-in instructions.
- Gift card expiry/minimum rules, only where supported by Wix Gift Cards.
- Terms text.
- Media retention days (default 30).
- Owner/staff notification preferences.
- Default widget theme and per-widget settings guidance.
- Localization/default locale and currency behavior.
- Operational diagnostics and integration status.

### Widget appearance workflow

The dashboard may link the merchant to the Wix Editor for the selected widget and provide a setup guide. Actual font/color/layout changes must be made and persisted through the widget's supported Editor settings panel. Do not create a dashboard-only mockup that does not change the live widget.

## 12. Gift card issuance

V1 uses Wix Gift Cards API, subject to current API capabilities and site requirements.

- On setup, check whether the required Wix Gift Card functionality is installed/available; explain any setup requirement.
- Confirm current documented creation, delivery, expiry, and redemption-tracking behavior.
- Persist the Wix gift card ID and issuance state on the trade-in.
- Never store or log the full gift card code unless the documented integration explicitly requires it; if returned, protect it as a secret and expose only to the intended recipient.
- Use an idempotency/reconciliation strategy to prevent duplicate credit.
- If creation succeeds but response persistence fails, reconcile with the supported API before retrying.
- If gift card issuance fails, keep the trade-in in a recoverable credit state and alert authorized staff.
- Use the Wix-supported gift-card email delivery mechanism where applicable. Do not reconstruct gift card delivery using a custom email containing a code unless current Wix documentation explicitly supports and permits that workflow.
- Record value, currency, creation timestamp, gift-card ID, recipient, and status.
- Reporting should distinguish credit issued from credit redeemed and any additional order value paid beyond credit, only where the necessary data is available through supported APIs.

## 13. Email notifications: Wix Email Transmissions API

Use the official Wix Email Transmissions API for merchant-owner/staff transactional email notifications, subject to a pre-implementation check of its current production availability, permissions, and limits. Do not silently substitute a third-party email service.

### Merchant notifications

Support preferences for:
- New trade-in submitted.
- Customer cancels, where cancellation is enabled.
- Trade-in approved/rejected if merchant needs a record.
- Item marked received.
- Revised offer accepted/declined.
- Gift-card issuance success/failure or reconciliation required.
- Resale draft creation success/failure.
- Repeated processing failures and actionable integration errors.

### Customer notifications

Support:
- Submission reference and status link.
- Approval and handoff instructions.
- Rejection reason.
- Item received.
- Revised offer with secure accept/decline link.
- Revised offer decision confirmation.
- Gift-card issued confirmation, while leaving gift-card code delivery to the supported Wix Gift Cards workflow.

### Delivery implementation

- Send notifications from the backend only after the underlying operation has been committed.
- Resolve the site owner/authorized staff recipients using documented Wix identity/contact fields. Never assume the site owner's email is the customer email.
- Verify sender identity and required permissions, including the documented Email Marketing management scope where required.
- Use an idempotency key per logical event, reused only when retrying that same event.
- Persist transmission ID, event type, recipient metadata, timestamps, status, and sanitized error details.
- Treat accepted/queued transmission as asynchronous, not proof of delivery.
- Process status updates/webhooks or poll using documented Wix mechanisms; handle recipient-level failures even if the overall transmission was processed.
- Add bounded retries, backoff, dead-letter/reconciliation status, and deduplication.
- Keep email preferences and delivery logs in the dashboard.
- Avoid sending duplicate emails on repeated Wix webhooks.
- Do not put private media URLs, gift card codes, auth tokens, or unnecessary customer data into emails/logs.
- If Email Transmissions remains in preview or is unavailable for production use, document this as a release blocker or obtain an explicit product decision. Do not quietly replace it with SMTP, Nodemailer, SendGrid, Resend, or Wix Triggered Emails.

## 14. Aria / App Tools

Make App Tools/Aria a first-class integration where currently supported by Wix. Verify extension registration, schema format, supported actions, authorization, execution environment, and publishing access before implementation.

Expose safe tools where supported:
- Search/list trade-ins using filters.
- Get a trade-in's details.
- Summarize a request and its timeline.
- List pending requests and summarize workload.
- Explain estimate calculation and rule configuration.
- Review/prepare an approval recommendation.
- Approve or reject a request, with reason where required.
- Mark received and record inspection results.
- Prepare/send a revised offer.
- Check gift-card issuance status and reconcile a failed operation.
- Create a resale draft.
- Read/update non-sensitive notification preferences and supported trade-in rules.
- Produce reports for credit issued, request status, conversion, and resale drafts.

Safety:
- Read-only tools can run with normal authorization.
- State-changing and financial tools must validate permissions and state on the server, use idempotency, and return a clear confirmation summary.
- Gift-card issuance, bulk approvals, bulk rejections, and other consequential actions require explicit confirmation if supported by the interaction contract.
- Never allow Aria to bypass business rules, approval thresholds, member/site boundaries, billing gates, or access controls.
- Use strict input schemas and output only data the current user is authorized to access.
- If the App Tools extension is unavailable or cannot be published, document that limitation and isolate the tool implementation behind a clear capability boundary.

## 15. Suggested data model

Adapt naming and storage to the actual supported Wix persistence option.

### `TradeIn`
- `id`, `instanceId`, `reference`
- `customerContactId` (nullable), `memberId` (nullable), `customerEmail`
- `productId`, `variantId` (nullable), `orderId` (nullable)
- `productSnapshot` (title, image/reference, SKU where permitted, price/currency at submission)
- `conditionAnswers`
- `estimatedValueMinor`, `finalValueMinor`, `currency`
- `offerCalculationVersion`, `offerBreakdown`
- `status`, `handoffMethod`, `trackingNumber` (nullable)
- `rejectionReason`, `inspectionNotes`, `returnStatus`
- `giftCardId`, `giftCardStatus`, `giftCardIssuedAt`
- `resaleProductId`, `resaleDraftStatus`
- `statusTokenHash` or other secure access mechanism
- `createdAt`, `updatedAt`, `closedAt`

### `TradeInMedia`
- `id`, `instanceId`, `tradeInId`
- `mediaType`, `mediaManagerFileId`, `readyStatus`
- `fileSize`, `mimeType`, `createdAt`, `deleteAfter`
- Keep public URLs only when necessary and documented; prefer file IDs and controlled access.

### `TradeInEvent`
- `id`, `instanceId`, `tradeInId`
- `eventType`, `fromStatus`, `toStatus`, `actorType`, `actorId`
- `reason`, `metadataSanitized`, `createdAt`, `idempotencyKey`

### `TradeInRule`
- `id`, `instanceId`, `categoryId` or product eligibility rule
- `payoutPercentage`, `conditionQuestions`, `minimumOfferMinor`, `maximumOfferMinor`
- `photoMinimum`, `videoMode`, `videoMaxSeconds`, `enabled`
- `createdAt`, `updatedAt`

### `TradeInSettings`
- `instanceId`, `schemaVersion`
- `handoffMethods`, `storeAddress`, `dropOffInstructions`, `shipInInstructions`
- `creditExpiry` (only when supported), `minimumCreditMinor`, `termsText`
- `mediaRetentionDays`, `notificationPreferences`, `defaultLocale`
- `createdAt`, `updatedAt`

### `TradeInNotification`
- `id`, `instanceId`, `tradeInId` (nullable)
- `eventId`, `recipientType`, `recipientHash` or minimized recipient identifier
- `providerTransmissionId`, `status`, `attemptCount`
- `lastErrorCode`, `createdAt`, `updatedAt`, `sentAt`

### `WidgetStyleConfig`
Where widget properties can be persisted natively, prefer native per-instance widget properties. Use an app data record only if the verified Wix contract requires it or for shared merchant defaults.
- `id`, `instanceId`, `widgetInstanceId` (if supported)
- `widgetType`, `schemaVersion`, `styleConfig`
- `updatedAt`, `updatedBy`
- Must not be treated as authority for pricing, status, or permissions.

### `IdempotencyRecord` / `OutboxEvent`
- Instance-scoped idempotency key, operation type, payload hash, status, attempt count, result reference, timestamps.
- Use for webhook processing, email dispatch, gift-card issuance, status transitions, and resale draft creation.

## 16. API route organization

Use `pages/api` in an Astro project, following its actual supported route conventions. Suggested endpoints:

```text
pages/api/
  trade-ins/
    index.ts
    create.ts
    detail.ts
    cancel.ts
    approve.ts
    reject.ts
    receive.ts
    inspect.ts
    revised-offer.ts
    revised-offer-response.ts
    close.ts
  catalog/
    search.ts
    product.ts
  media/
    upload-url.ts
    resumable-upload-url.ts
    ready.ts
  gift-cards/
    issue.ts
    status.ts
    reconcile.ts
  resale/
    create-draft.ts
  rules/
    index.ts
    validate.ts
  settings/
    index.ts
  notifications/
    preferences.ts
    history.ts
    retry.ts
  reports/
    overview.ts
  widgets/
    style-config.ts
  webhooks/
    wix-events.ts
    email-transmission.ts
```

Route names are illustrative and must be adapted to actual Wix CLI/runtime requirements. Every endpoint must:
- Validate Wix app/site context.
- Derive instance/site identity from trusted verified context, not arbitrary request fields.
- Authenticate and authorize the actor.
- Validate input with Zod.
- Enforce instance isolation and ownership.
- Apply rate limits where appropriate.
- Use idempotency for mutating/financial operations.
- Return consistent sanitized errors.
- Never return tokens, secrets, private logs, or unrestricted media access.

## 17. Service layer

Keep business logic out of route handlers and UI components.

Suggested modules:
- `WixCatalogService`
- `WixOrdersService`
- `WixMediaService`
- `WixGiftCardsService`
- `WixEmailTransmissionsService`
- `TradeInService`
- `OfferCalculationService`
- `TradeInLifecycleService`
- `TradeInMediaService`
- `TradeInNotificationService`
- `WidgetStyleService`
- `ResaleDraftService`
- `AriaToolsService`
- `IdempotencyService`
- `OutboxService`
- `ReportingService`
- `AuthorizationService`

## 18. Localization and accessibility

- Support at least the top 20 target languages using an established i18n setup.
- No hardcoded customer-visible or dashboard-visible text in React components, widget settings panels, validation messages, emails, or empty states.
- Store canonical values and localize labels, not persisted business-state enums.
- Support right-to-left layouts where applicable.
- Format money and dates using the relevant site locale/currency.
- Provide keyboard navigation, visible focus, semantic headings, accessible labels, screen-reader status announcements, sufficient contrast, and accessible error summaries.
- Ensure color customization does not remove accessibility affordances; warn when configured contrast is poor.
- Use text alternatives for icons and media actions.
- Test at narrow mobile widths and browser zoom.

## 19. Security and privacy

- Keep secrets and privileged Wix API calls on the server.
- Use least-privilege permissions.
- Verify webhook signatures or documented authenticity mechanisms.
- Treat client-submitted product IDs, offer values, customer IDs, site IDs, and style configuration as untrusted.
- Sanitize notes and reject unsafe HTML/CSS/script input.
- Never evaluate merchant-supplied CSS, HTML, JavaScript, or expressions.
- Scope every record and media association to the app instance/site.
- Use secure, expiring, scoped customer status/revised-offer links.
- Protect against replay, duplicate actions, IDOR, CSRF where relevant, upload abuse, oversized files, and rate abuse.
- Keep an audit trail for financial and state-changing actions.
- Implement uninstall/disconnect behavior and stop background processing when the app is no longer authorized.
- Apply the configured media retention policy and document deletion behavior.
- Do not log full gift-card codes, credentials, or unnecessary personal data.

## 20. Testing requirements

### Unit tests
- Offer calculation and rounding.
- Condition adjustment precedence and minimum/maximum clamping.
- State transition table.
- Style configuration defaults, schema validation, migration, and invalid-value fallback.
- Color/font/spacing validation.
- Email idempotency and retry decisions.
- Gift-card idempotency/reconciliation.
- Authorization and instance isolation.

### Component tests
- Each widget with default theme and custom theme.
- Editor panel initializes from saved widget properties.
- Color picker/font selector/toggle/numeric controls update the correct property.
- Live preview updates without requiring a page reload.
- Switching widget selection loads the selected instance's own configuration.
- Reset controls work.
- Missing or old style schema renders safely.
- Required fields cannot be hidden.
- Responsive layouts and accessible focus states.
- Upload progress, retry, and failure states.

### Integration tests
- Customer submission through request persistence.
- Media upload and file-ready processing.
- Merchant approval/rejection/inspection.
- Revised offer accept/decline.
- Gift-card issuance success, timeout, partial failure, and reconciliation.
- Email transmission accepted, processed, rejected, recipient failure, duplicate event, and retry.
- Resale draft creation and retry.
- App Tools/Aria authorization and confirmation gates.
- Webhook duplication and out-of-order delivery.
- Uninstall/reconnect behavior where supported.

### End-to-end acceptance tests
1. Add a Trade-in Form widget to a test Wix site.
2. Open its settings panel and change font family, heading/body size, primary/background/text colors, button shape, radius, spacing, and card style.
3. Confirm changes render in the Editor preview immediately.
4. Save, close, reopen the Editor, and verify values persist.
5. Publish the site and verify the live widget uses the same style configuration.
6. Add a second widget instance and confirm its styling can differ from the first.
7. Submit a trade-in on desktop and mobile; verify offer recalculation and media requirements.
8. Complete the merchant workflow and confirm the correct gift card is issued at most once.
9. Verify the store owner receives the configured notification through Wix Email Transmissions when available.
10. Verify a customer cannot view another customer's trade-in by changing an ID or URL.
11. Verify Aria tools cannot bypass permissions or perform consequential actions without required confirmation.
12. Verify all visible text is localized and key flows are keyboard-accessible.

## 21. Documentation and deliverables

Provide:
- Working app and extension source code.
- React storefront widget components.
- React Editor settings panel component(s).
- Shared style configuration type and Zod schema.
- Theme provider/style mapping.
- Widget property persistence and migration implementation.
- Dashboard pages and API/service layer.
- Wix API/permission/event verification notes.
- App Tools/Aria registration and capability notes.
- Email Transmissions integration and production availability notes.
- `.env.example` with placeholders only.
- Setup and local development instructions.
- Test commands and test results.
- Deployment/App Market submission checklist.
- Known limitations and deferred items.

Do not declare the project complete while the Editor controls are merely static mockups or while styling changes do not affect the published widgets.

## 22. Definition of done

The release is ready only when:

- A merchant can configure fonts, colors, button appearance, layout, spacing, borders, and relevant content visibility from the Wix Editor panel.
- React Editor controls update the selected widget's properties using a verified Wix-supported mechanism.
- Widget styles preview immediately, persist across Editor reloads, and render correctly on the published site.
- Different widget instances can have independent styles where supported.
- The trade-in request-to-credit workflow functions end to end with idempotent state transitions and recoverable failures.
- Owner/staff notifications use Wix Email Transmissions when production support permits, with delivery status and retry handling.
- Aria/App Tools are implemented only to the extent supported by the verified Wix extension contract and enforce server-side authorization.
- Security, accessibility, localization, responsive behavior, tests, and setup documentation are complete.
- All Wix API, extension, permission, and publishing assumptions have been checked against current official documentation.
