// Sample data served to the real widgets and dashboard in place of the app backend.
// Shapes follow src/lib/schemas/{api,admin}.ts so the components render exactly as in production.

import type { CatalogItem, CustomerTradeInView, FormConfig, MyTradeInsResponse } from '../../src/lib/schemas/api';
import type { AdminListResponse, AdminTradeInDetail, AdminTradeInRow, OverviewResponse } from '../../src/lib/schemas/admin';
import { PLAN_ENTITLEMENTS, APP_ID } from '../../src/lib/plans';

const img = (name: string) => `${location.origin}/img/${name}.svg`;
const daysAgo = (d: number, h = 10) => {
  const t = new Date('2026-10-27T00:00:00Z');
  t.setUTCDate(t.getUTCDate() - d);
  t.setUTCHours(h, 15);
  return t.toISOString();
};

const CATALOG: CatalogItem[] = [
  { productId: 'p-aero', title: 'Aero Wireless Headphones', imageUrl: img('headphones'), source: 'catalog' },
  { productId: 'p-buds', title: 'Aero Buds Pro', imageUrl: img('earbuds'), source: 'catalog' },
  { productId: 'p-pulse', title: 'Pulse Bluetooth Speaker', imageUrl: img('speaker'), source: 'catalog' },
  { productId: 'p-orbit', title: 'Orbit Smartwatch S2', imageUrl: img('watch'), source: 'catalog' },
  { productId: 'p-vista', title: 'Vista Mirrorless Camera', imageUrl: img('camera'), source: 'catalog' },
  { productId: 'p-drift', title: 'Drift Action Cam', imageUrl: img('actioncam'), source: 'catalog' },
];
const ORDER_ITEMS: CatalogItem[] = [{ ...CATALOG[0], orderId: 'ord-10293', source: 'order' }];

const QUESTIONS = [
  { id: 'works', label: 'Does it power on and work normally?', required: true, options: [{ id: 'yes', label: 'Yes, fully working' }, { id: 'partly', label: 'Partly working' }, { id: 'no', label: 'Doesn’t work' }] },
  { id: 'cosmetic', label: 'What’s the cosmetic condition?', required: true, options: [{ id: 'like_new', label: 'Like new' }, { id: 'light', label: 'Light wear' }, { id: 'scratches', label: 'Visible scratches' }, { id: 'damaged', label: 'Damaged' }] },
];

const formConfig = (productId: string): FormConfig => {
  const p = CATALOG.find((c) => c.productId === productId) ?? CATALOG[0];
  return {
    eligible: true,
    accepting: true,
    uploads: true,
    product: { productId: p.productId, title: p.title, imageUrl: p.imageUrl },
    questions: QUESTIONS,
    media: { photoMinimum: 3, videoMode: 'optional', videoMaxSeconds: 30 },
    handoffMethods: [
      { method: 'drop_off', address: '214 Harbor Street, Portland, OR', instructions: 'Show your reference code at the counter.' },
      { method: 'ship_in', address: 'Northline Returns, 88 Depot Rd, Portland, OR' },
    ],
    termsText: 'Final value is confirmed after inspection. Credit is issued as a store gift card.',
    upToMinor: 9000,
    currency: 'USD',
  };
};

const ADJ: Record<string, Record<string, number>> = {
  works: { yes: 0, partly: -3000, no: -6000 },
  cosmetic: { like_new: 0, light: -1800, scratches: -3200, damaged: -5000 },
  accessories: { yes: 0, no: -1000 },
};
const estimate = (answers: Record<string, string>) => ({
  eligible: true as const,
  offerMinor: Math.max(500, 9000 + Object.entries(answers).reduce((s, [q, o]) => s + (ADJ[q]?.[o] ?? 0), 0)),
  currency: 'USD',
  complete: QUESTIONS.filter((q) => q.required).every((q) => answers[q.id]),
});

const STATUS_VIEW: CustomerTradeInView = {
  tradeInId: 'ti-24817',
  reference: 'TI-24817',
  status: 'revised_offer_pending',
  revision: 6,
  createdAt: daysAgo(6),
  product: { title: 'Aero Wireless Headphones', imageUrl: img('headphones') },
  currency: 'USD',
  estimatedValueMinor: 7200,
  revisedOffer: { amountMinor: 6000, reason: 'The left ear cushion is worn and will need replacing.', expiresAt: daysAgo(-6) },
  handoff: { method: 'drop_off', address: '214 Harbor Street, Portland, OR', allowTracking: false },
  actions: ['accept_revised_offer', 'decline_revised_offer'],
  timeline: [
    { status: 'submitted', at: daysAgo(6, 9) },
    { status: 'approved', at: daysAgo(5, 11) },
    { status: 'received', at: daysAgo(3, 14) },
    { status: 'inspection', at: daysAgo(2, 10) },
    { status: 'revised_offer_pending', at: daysAgo(1, 16) },
  ],
};

const ROWS: AdminTradeInRow[] = [
  ['ti-24817', 'TI-24817', 'Jordan Lee', 'jordan.lee@example.com', 'Aero Wireless Headphones', 7200, 'inspection', 6],
  ['ti-24822', 'TI-24822', 'Priya Natarajan', 'priya.n@example.com', 'Vista Mirrorless Camera', 21500, 'submitted', 0],
  ['ti-24821', 'TI-24821', 'Marcus Webb', 'm.webb@example.com', 'Orbit Smartwatch S2', 6400, 'under_review', 1],
  ['ti-24819', 'TI-24819', 'Sofia Alvarez', 'sofia.a@example.com', 'Pulse Bluetooth Speaker', 3800, 'approved', 2],
  ['ti-24815', 'TI-24815', 'Liam O’Connor', 'liam.oc@example.com', 'Drift Action Cam', 9200, 'in_transit', 3],
  ['ti-24812', 'TI-24812', 'Hana Kim', 'hana.kim@example.com', 'Aero Buds Pro', 4500, 'revised_offer_pending', 4],
  ['ti-24808', 'TI-24808', 'Daniel Osei', 'd.osei@example.com', 'Vista Mirrorless Camera', 19800, 'credit_issued', 7],
  ['ti-24803', 'TI-24803', 'Emma Rossi', 'emma.rossi@example.com', 'Aero Wireless Headphones', 8100, 'credit_issued', 9],
  ['ti-24799', 'TI-24799', 'Noah Fischer', 'noah.f@example.com', 'Orbit Smartwatch S2', 5200, 'closed', 12],
].map(([id, reference, customerName, customerEmail, productTitle, est, status, d]) => ({
  id: id as string,
  reference: reference as string,
  customerName: customerName as string,
  customerEmail: customerEmail as string,
  productTitle: productTitle as string,
  estimatedValueMinor: est as number,
  finalValueMinor: status === 'credit_issued' || status === 'closed' ? (est as number) : undefined,
  currency: 'USD',
  status: status as AdminTradeInRow['status'],
  giftCardStatus: status === 'credit_issued' || status === 'closed' ? 'issued' : 'not_started',
  createdAt: daysAgo(d as number),
}));

const DETAIL: AdminTradeInDetail = {
  ...ROWS[0],
  revision: 5,
  customerPhone: '+1 503 555 0142',
  memberId: 'mem-1',
  orderId: 'ord-10293a7f',
  productId: 'p-aero',
  productImageUrl: img('headphones'),
  conditionAnswers: [
    { questionId: 'works', optionId: 'yes', question: 'Does it power on and work normally?', answer: 'Yes, fully working' },
    { questionId: 'cosmetic', optionId: 'light', question: 'What’s the cosmetic condition?', answer: 'Light wear' },
  ],
  offerBreakdown: {
    basePriceMinor: 24900, payoutBasisPoints: 3600, baseOfferMinor: 9000,
    adjustments: [{ questionId: 'cosmetic', optionId: 'light', kind: 'fixed', deltaMinor: -1800 }],
    beforeClampMinor: 7200, offerMinor: 7200, currency: 'USD', ruleId: 'r1', ruleVersion: 3,
  },
  handoffMethod: 'drop_off',
  giftCardStatus: 'not_started',
  resaleDraftStatus: 'none',
  notes: [{ id: 'n1', text: 'Customer mentioned the headband was replaced last year.', createdAt: daysAgo(3, 15) }],
  media: [1, 2, 3, 4].map((n) => ({ mediaId: `m${n}`, kind: 'photo' as const, status: 'ready', url: img(`photo-${n}`) })),
  timeline: [
    { id: 'e1', eventType: 'status', toStatus: 'submitted', actorType: 'customer', at: daysAgo(6, 9) },
    { id: 'e2', eventType: 'status', fromStatus: 'submitted', toStatus: 'approved', actorType: 'merchant', at: daysAgo(5, 11) },
    { id: 'e3', eventType: 'status', fromStatus: 'approved', toStatus: 'received', actorType: 'merchant', at: daysAgo(3, 14) },
    { id: 'e4', eventType: 'status', fromStatus: 'received', toStatus: 'inspection', actorType: 'merchant', at: daysAgo(2, 10) },
  ],
  actions: ['confirm_value', 'send_revised_offer', 'reject_after_inspection'],
};

const OVERVIEW: OverviewResponse = {
  counts: { needs_review: 4, awaiting_handoff: 3, in_inspection: 2, awaiting_customer: 1, credit: 2, closed: 18 },
  creditIssuedMinorByCurrency: { USD: 184300 },
  usage: { used: 28, limit: null },
  recent: DETAIL.timeline.slice().reverse().map((e, i) => ({ ...e, id: `r${i}` })),
  setup: {
    storesInstalled: true, catalogVersion: 'V3', hasRules: true, settingsSaved: true, formPageConfigured: true,
    statusPageConfigured: true, pluginPlaced: true, giftCardsAvailable: true, giftCardEmailWorking: true, emailConfigured: true,
  },
};

const MINE: MyTradeInsResponse = {
  signedIn: true,
  items: ROWS.slice(0, 4).map((r) => ({ tradeInId: r.id, reference: r.reference, status: r.status, productTitle: r.productTitle, createdAt: r.createdAt, estimatedValueMinor: r.estimatedValueMinor, currency: r.currency })),
};

// ?state=credit: the same request after the merchant confirmed the value (promo film end state).
const credited = new URLSearchParams(location.search).get('state') === 'credit';
const CREDITED_STATUS: CustomerTradeInView = {
  ...STATUS_VIEW,
  status: 'credit_issued',
  finalValueMinor: 7200,
  revisedOffer: undefined,
  actions: [],
  timeline: [...STATUS_VIEW.timeline.slice(0, 4), { status: 'credit_issued', at: daysAgo(0, 9) }],
};
const CREDITED_DETAIL: AdminTradeInDetail = {
  ...DETAIL,
  status: 'credit_issued',
  finalValueMinor: 7200,
  giftCardStatus: 'issued',
  actions: [],
  timeline: [...DETAIL.timeline, { id: 'e5', eventType: 'status', fromStatus: 'inspection', toStatus: 'credit_issued', actorType: 'merchant', at: daysAgo(0, 9) }],
};

type Handler = (q: URLSearchParams, body: any) => unknown;
const routes: Record<string, Handler> = {
  '/api/catalog/search': (q) => ({ items: CATALOG.filter((c) => c.title.toLowerCase().includes((q.get('q') ?? '').toLowerCase())), hasMore: false }),
  '/api/catalog/order-items': () => ORDER_ITEMS,
  '/api/catalog/product-cta': () => ({ eligible: true, upToMinor: 9000, currency: 'USD', formPageUrl: '/trade-in' }),
  '/api/trade-ins/form-config': (q) => formConfig(q.get('productId') ?? 'p-aero'),
  '/api/trade-ins/estimate': (_q, b) => estimate(b?.answers ?? {}),
  '/api/trade-ins/status': () => (credited ? CREDITED_STATUS : STATUS_VIEW),
  '/api/trade-ins/mine': () => MINE,
  '/api/admin/overview': () => OVERVIEW,
  '/api/admin/trade-ins': (q) => {
    const items = ROWS.filter((r) => !q.get('status') || r.status === q.get('status'));
    return { items, total: items.length, page: 0, pageSize: 25 } satisfies AdminListResponse;
  },
  '/api/admin/trade-in': () => (credited ? CREDITED_DETAIL : DETAIL),
  '/api/admin/notifications': () => ({
    preferences: {},
    currentUserId: 'u1',
    history: [
      { id: 'h1', tradeInId: DETAIL.id, eventType: 'received', recipientType: 'customer', status: 'sent', attemptCount: 1, failures: [], createdAt: daysAgo(3, 14), sentAt: daysAgo(3, 14) },
      { id: 'h2', tradeInId: DETAIL.id, eventType: 'approved', recipientType: 'customer', status: 'sent', attemptCount: 1, failures: [], createdAt: daysAgo(5, 11), sentAt: daysAgo(5, 11) },
      { id: 'h3', tradeInId: DETAIL.id, eventType: 'submitted', recipientType: 'merchant', status: 'sent', attemptCount: 1, failures: [], createdAt: daysAgo(6, 9), sentAt: daysAgo(6, 9) },
    ],
  }),
  '/api/admin/plan': () => ({ appId: APP_ID, instanceId: 'demo', plan: 'pro', isFree: false, freeTrialAvailable: false, upgradeUrl: '#', entitlements: PLAN_ENTITLEMENTS.pro }),
  '/api/admin/process': () => ({ done: 0, failed: 0 }),
  '/api/admin/plugin-status': () => ({ placementStatuses: [] }),
  '/api/admin/outbox': () => ({ giftCardsAvailable: true, dead: [] }),
};

export async function fakeFetch(url: string, init?: { method?: string; body?: string }): Promise<Response> {
  const parsed = new URL(url);
  const handler = routes[parsed.pathname];
  if (!handler) {
    console.warn('[harness] unmocked route', parsed.pathname);
    return new Response(JSON.stringify({ error: { code: 'not_found' } }), { status: 404 });
  }
  const body = init?.body ? JSON.parse(init.body) : undefined;
  return new Response(JSON.stringify(handler(parsed.searchParams, body)), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
