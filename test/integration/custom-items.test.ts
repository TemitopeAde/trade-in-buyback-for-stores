import { beforeEach, describe, expect, it } from 'vitest';
import { submitRequest, type SubmitRequest } from '../../src/lib/schemas/api';
import { defaultSettings } from '../../src/lib/schemas/domain';
import { COLLECTIONS } from '../../src/server/collections';
import type { RequestContext } from '../../src/server/context';
import { AccessTokenService } from '../../src/server/services/AuthorizationService';
import { IdempotencyService } from '../../src/server/services/IdempotencyService';
import { MerchantService } from '../../src/server/services/MerchantService';
import { OutboxService } from '../../src/server/services/OutboxService';
import { RulesService } from '../../src/server/services/RulesService';
import { SettingsService } from '../../src/server/services/SettingsService';
import { TradeInLifecycleService } from '../../src/server/services/TradeInLifecycleService';
import { TradeInMediaService, type TradeInMediaDoc } from '../../src/server/services/TradeInMediaService';
import { TradeInService } from '../../src/server/services/TradeInService';
import type { WixMediaService } from '../../src/server/services/WixMediaService';
import type { TradeInDoc } from '../../src/server/types';
import { MemoryRepo } from '../support/memoryRepo';

const I = 'inst-1';
const visitor: RequestContext = { instanceId: I, siteId: 's', caller: { type: 'visitor', id: 'v1' } };
const merchantActor = { type: 'merchant' as const, id: 'u1' };
const SESSION = 'S'.repeat(43);
let n = 0;
const key = () => `idem-key-${String(++n).padStart(8, '0')}`;

const TERMS = '<p>Final value is confirmed after inspection.</p>';

async function setup() {
  const repo = new MemoryRepo();
  const idempotency = new IdempotencyService(repo);
  const outbox = new OutboxService(repo);
  const settings = new SettingsService(repo);
  const rules = new RulesService(repo);
  const media = new TradeInMediaService(repo, { viewUrl: async () => 'https://signed' } as unknown as WixMediaService);
  const lifecycle = new TradeInLifecycleService(repo, idempotency, outbox);
  const customer = new TradeInService({
    repo, rules, settings, media, lifecycle, idempotency, outbox, tokens: new AccessTokenService(repo),
    catalog: { getProduct: async () => undefined, search: async () => [] },
    orders: { eligibleItemsForMember: async () => [], verifyMemberOrderItem: async () => false },
    siteCurrency: async () => 'EUR',
  });
  const merchant = new MerchantService({ repo, lifecycle, media, rules, settings, catalogVersion: async () => 'V3_CATALOG' });
  await settings.save(I, { ...defaultSettings(), termsHtml: TERMS });
  return { repo, settings, customer, merchant };
}

async function enableCustomItems(settings: SettingsService, photoMinimum = 1) {
  const s = defaultSettings();
  await settings.save(I, { ...s, termsHtml: TERMS, customItems: { enabled: true, photoMinimum } });
}

async function seedPhoto(repo: MemoryRepo) {
  return repo.insert<TradeInMediaDoc>(COLLECTIONS.media, {
    instanceId: I, uploadSessionId: SESSION, mediaType: 'photo', readyStatus: 'ready', fileSize: 1000, mimeType: 'image/jpeg', mediaManagerFileId: 'f1',
  });
}

const request = (over: Partial<SubmitRequest> = {}): SubmitRequest => ({
  submissionKey: `custom-submission-${String(++n).padStart(4, '0')}`,
  customItem: { name: 'Road bike', brand: 'Velo', description: 'Two years old, small scratch on the frame.', customerEstimateMinor: 300_00 },
  answers: {}, uploadSessionId: SESSION, mediaIds: [], handoffMethod: 'drop_off',
  contact: { name: 'Ana', email: 'ana@example.com' }, acceptTerms: true, locale: 'en', ...over,
});

describe('custom items', () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { s = await setup(); });

  it('accepts either a product or a custom item in a submission, never both or neither', () => {
    const base = { submissionKey: 'custom-submission-key', handoffMethod: 'drop_off', contact: { name: 'Ana', email: 'ana@example.com' }, acceptTerms: true };
    const customItem = { name: 'Bike', description: 'Used' };
    expect(submitRequest.safeParse({ ...base, customItem }).success).toBe(true);
    expect(submitRequest.safeParse({ ...base, productId: 'p1' }).success).toBe(true);
    expect(submitRequest.safeParse({ ...base }).success).toBe(false);
    expect(submitRequest.safeParse({ ...base, productId: 'p1', customItem }).success).toBe(false);
    expect(submitRequest.safeParse({ ...base, customItem, orderId: 'o1' }).success).toBe(false);
  });

  it('is off until the merchant enables it', async () => {
    expect((await s.customer.customItemConfig(visitor)).eligible).toBe(false);
    await expect(s.customer.submit(visitor, request())).rejects.toMatchObject({ fields: { customItem: 'disabled' } });
  });

  it('stores a custom item with no estimate, using the site currency and photo minimum', async () => {
    await enableCustomItems(s.settings, 1);
    const config = await s.customer.customItemConfig(visitor);
    expect(config).toMatchObject({ eligible: true, custom: true, questions: [], currency: 'EUR', media: { photoMinimum: 1, videoMode: 'off' } });

    await expect(s.customer.submit(visitor, request())).rejects.toMatchObject({ fields: { media: 'photos_min' } });
    const photo = await seedPhoto(s.repo);
    const res = await s.customer.submit(visitor, request({ mediaIds: [photo._id] }));
    const doc = (await s.repo.get<TradeInDoc>(COLLECTIONS.tradeIns, res.tradeInId))!;
    expect(doc).toMatchObject({
      productId: '', productTitle: 'Velo Road bike', estimatedValueMinor: 0, currency: 'EUR', status: 'submitted', conditionAnswers: {},
      customItem: { name: 'Road bike', customerEstimateMinor: 300_00 },
    });
    expect(doc.offerBreakdown).toBeUndefined();

    const view = await s.customer.getForCustomer(visitor, { token: res.accessToken });
    expect(view).toMatchObject({ custom: true, estimatedValueMinor: 0 });
  });

  it('is quoted instead of approved; accepting the quote approves it at that value', async () => {
    await enableCustomItems(s.settings, 0);
    const res = await s.customer.submit(visitor, request());
    let d = await s.merchant.detail(I, res.tradeInId);
    expect(d.custom).toBe(true);
    expect(d.actions).toContain('send_quote');
    expect(d.actions).not.toContain('approve');
    await expect(s.merchant.act(I, merchantActor, { tradeInId: d.id, action: 'approve', expectedRevision: d.revision, idempotencyKey: key() }))
      .rejects.toMatchObject({ code: 'invalid_transition' });
    await expect(s.merchant.act(I, merchantActor, { tradeInId: d.id, action: 'send_quote', expectedRevision: d.revision, idempotencyKey: key() }))
      .rejects.toMatchObject({ fields: { quotedValueMinor: 'required' } });

    d = await s.merchant.act(I, merchantActor, { tradeInId: d.id, action: 'send_quote', expectedRevision: d.revision, idempotencyKey: key(), quotedValueMinor: 250_00 });
    expect(d).toMatchObject({ status: 'quote_pending', quotedValueMinor: 250_00, estimatedValueMinor: 0 });
    expect(d.quoteExpiresAt).toBeDefined();

    let view = await s.customer.getForCustomer(visitor, { token: res.accessToken });
    expect(view.quote).toMatchObject({ amountMinor: 250_00 });
    expect(view.actions).toEqual(expect.arrayContaining(['accept_quote', 'decline_quote']));

    view = await s.customer.customerAction(visitor, { token: res.accessToken, action: 'accept_quote', expectedRevision: view.revision, idempotencyKey: key() });
    expect(view).toMatchObject({ status: 'approved', estimatedValueMinor: 250_00 });
    expect(view.quote).toBeUndefined();

    // From here it follows the normal flow: confirming the value credits the accepted quote.
    d = await s.merchant.detail(I, res.tradeInId);
    d = await s.merchant.act(I, merchantActor, { tradeInId: d.id, action: 'receive', expectedRevision: d.revision, idempotencyKey: key() });
    d = await s.merchant.act(I, merchantActor, { tradeInId: d.id, action: 'start_inspection', expectedRevision: d.revision, idempotencyKey: key() });
    d = await s.merchant.act(I, merchantActor, { tradeInId: d.id, action: 'confirm_value', expectedRevision: d.revision, idempotencyKey: key() });
    expect(d).toMatchObject({ status: 'credit_pending', finalValueMinor: 250_00 });
  });

  it('closes the request when the customer declines the quote', async () => {
    await enableCustomItems(s.settings, 0);
    const res = await s.customer.submit(visitor, request());
    const d = await s.merchant.act(I, merchantActor, { tradeInId: res.tradeInId, action: 'send_quote', expectedRevision: 1, idempotencyKey: key(), quotedValueMinor: 100_00 });
    const view = await s.customer.customerAction(visitor, { token: res.accessToken, action: 'decline_quote', expectedRevision: d.revision, idempotencyKey: key() });
    expect(view.status).toBe('cancelled');
  });

  it('expires an overdue quote on the next read', async () => {
    await enableCustomItems(s.settings, 0);
    const res = await s.customer.submit(visitor, request());
    await s.merchant.act(I, merchantActor, { tradeInId: res.tradeInId, action: 'send_quote', expectedRevision: 1, idempotencyKey: key(), quotedValueMinor: 100_00 });
    const doc = (await s.repo.get<TradeInDoc>(COLLECTIONS.tradeIns, res.tradeInId))!;
    await s.repo.update(COLLECTIONS.tradeIns, { ...doc, quoteExpiresAt: new Date('2000-01-01') });
    const view = await s.customer.getForCustomer(visitor, { token: res.accessToken });
    expect(view.status).toBe('cancelled');
  });

  it('keeps quotes for custom items only', async () => {
    const doc = await s.repo.insert<TradeInDoc>(COLLECTIONS.tradeIns, {
      instanceId: I, reference: 'TI-CAT-0001', status: 'submitted', revision: 1, estimatedValueMinor: 50_00, currency: 'USD', productId: 'p1',
      customerName: 'Ana', customerEmail: 'ana@example.com', productTitle: 'Phone', handoffMethod: 'drop_off', internalNotes: [],
      conditionAnswers: {}, offerBreakdown: { ruleId: 'none' }, giftCardStatus: 'not_started', resaleDraftStatus: 'not_started',
    } as unknown as TradeInDoc);
    const d = await s.merchant.detail(I, doc._id);
    expect(d.actions).toContain('approve');
    expect(d.actions).not.toContain('send_quote');
    await expect(s.merchant.act(I, merchantActor, { tradeInId: doc._id, action: 'send_quote', expectedRevision: 1, idempotencyKey: key(), quotedValueMinor: 10_00 }))
      .rejects.toMatchObject({ code: 'invalid_transition' });
  });
});
