import { beforeEach, describe, expect, it } from 'vitest';
import { getPlanEntitlements, type PlanTier } from '../../src/lib/plans';
import type { SubmitRequest } from '../../src/lib/schemas/api';
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
import type { CatalogProduct } from '../../src/server/services/WixCatalogService';
import type { WixMediaService } from '../../src/server/services/WixMediaService';
import type { TradeInDoc } from '../../src/server/types';
import { MemoryRepo } from '../support/memoryRepo';

const INSTANCE = 'inst-1';
const visitor: RequestContext = { instanceId: INSTANCE, siteId: 's', caller: { type: 'visitor', id: 'v1' } };
const member: RequestContext = { instanceId: INSTANCE, siteId: 's', caller: { type: 'member', id: 'm1' } };
const SESSION = 'S'.repeat(43);

const product: CatalogProduct = { productId: 'p1', title: 'Phone', priceMinor: 100_00, currency: 'USD', categoryIds: ['c1'], visible: true, catalogVersion: 'V3_CATALOG' };

const TERMS = '<p>Final value is confirmed after inspection.</p>';

async function setup(planTier?: PlanTier) {
  const repo = new MemoryRepo();
  const idempotency = new IdempotencyService(repo);
  const outbox = new OutboxService(repo);
  const plan = planTier ? { entitlements: async () => getPlanEntitlements(planTier) } : undefined;
  const settings = new SettingsService(repo, plan);
  const rules = new RulesService(repo);
  const tokens = new AccessTokenService(repo);
  const media = new TradeInMediaService(repo, {} as WixMediaService);
  const lifecycle = new TradeInLifecycleService(repo, idempotency, outbox);
  const orderOwnership = new Map<string, string>([['o1', 'm1']]);
  const svc = new TradeInService({
    repo, rules, settings, media, lifecycle, idempotency, outbox, tokens, plan,
    // The in-memory repo stamps documents in January 2026.
    now: () => new Date(Date.UTC(2026, 0, 15)),
    siteCurrency: async () => 'USD',
    catalog: { getProduct: async (_i, id) => (id === product.productId ? product : undefined), search: async () => [product] },
    orders: {
      eligibleItemsForMember: async () => [],
      verifyMemberOrderItem: async (m, o, p) => orderOwnership.get(o) === m && p === 'p1',
    },
  });
  const merchant = new MerchantService({
    repo, lifecycle, media: new TradeInMediaService(repo, { deletePermanently: async () => undefined } as unknown as WixMediaService),
    rules, settings, catalogVersion: async () => 'V3_CATALOG', plan, now: () => new Date(Date.UTC(2026, 0, 15)),
  });
  await settings.save(INSTANCE, { ...defaultSettings(), termsHtml: TERMS });
  return { repo, svc, rules, settings, tokens, merchant };
}

async function seedRule(rules: RulesService) {
  return rules.create(INSTANCE, {
    name: 'Phones', scope: 'category', categoryId: 'c1', payoutPercentage: 50, photoMinimum: 1, videoMode: 'off',
    conditionQuestions: [{ id: 'screen', label: 'Screen', required: true, options: [
      { id: 'ok', label: 'OK', adjustment: { kind: 'percent', basisPoints: 0 } },
      { id: 'scratched', label: 'Scratched', adjustment: { kind: 'percent', basisPoints: -2000 } },
    ] }],
  });
}

async function seedPhoto(repo: MemoryRepo, over: Partial<TradeInMediaDoc> = {}) {
  return repo.insert<TradeInMediaDoc>(COLLECTIONS.media, {
    instanceId: INSTANCE, uploadSessionId: SESSION, mediaType: 'photo', readyStatus: 'ready', fileSize: 1000, mimeType: 'image/jpeg', mediaManagerFileId: 'f1', ...over,
  });
}

const request = (over: Partial<SubmitRequest> = {}): SubmitRequest => ({
  submissionKey: 'submission-key-0001', productId: 'p1', answers: { screen: 'scratched' }, uploadSessionId: SESSION, mediaIds: [],
  handoffMethod: 'drop_off', contact: { name: 'Ana', email: 'Ana@Example.com' }, acceptTerms: true, locale: 'en', ...over,
});

describe('customer submission', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
    await seedRule(ctx.rules);
  });

  it('persists a trade-in with a server-computed offer, attaches media and enqueues notification', async () => {
    const photo = await seedPhoto(ctx.repo);
    const res = await ctx.svc.submit(member, request({ mediaIds: [photo._id] }));
    const doc = (await ctx.repo.get<TradeInDoc>(COLLECTIONS.tradeIns, res.tradeInId))!;
    expect(doc).toMatchObject({ status: 'submitted', estimatedValueMinor: 40_00, currency: 'USD', customerEmail: 'ana@example.com', revision: 1 });
    expect(doc.offerBreakdown?.basePriceMinor).toBe(100_00);
    expect((await ctx.repo.get<TradeInMediaDoc>(COLLECTIONS.media, photo._id))!.tradeInId).toBe(res.tradeInId);
    expect(ctx.repo.all(COLLECTIONS.outbox).map((o) => o.eventType)).toEqual(['trade_in.submitted']);
    expect(res.reference).toMatch(/^TI-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    await expect(ctx.tokens.resolve(INSTANCE, res.accessToken)).resolves.toBe(res.tradeInId);
  });

  it('is idempotent: a retried submission creates one trade-in', async () => {
    const photo = await seedPhoto(ctx.repo);
    const a = await ctx.svc.submit(member, request({ mediaIds: [photo._id] }));
    const b = await ctx.svc.submit(member, request({ mediaIds: [photo._id] }));
    expect(b.tradeInId).toBe(a.tradeInId);
    expect(ctx.repo.all(COLLECTIONS.tradeIns)).toHaveLength(1);
  });

  it('rejects missing evidence, disabled hand-off and unknown answers', async () => {
    await expect(ctx.svc.submit(member, request())).rejects.toMatchObject({ fields: { media: 'photos_min' } });
    const photo = await seedPhoto(ctx.repo);
    await expect(ctx.svc.submit(member, request({ submissionKey: 'submission-key-0002', mediaIds: [photo._id], handoffMethod: 'ship_in' }))).rejects.toMatchObject({ fields: { handoffMethod: 'disabled' } });
    await expect(ctx.svc.submit(member, request({ submissionKey: 'submission-key-0003', mediaIds: [photo._id], answers: { screen: 'mint' } }))).rejects.toMatchObject({ code: 'bad_request' });
  });

  it('refuses media from another upload session or instance', async () => {
    const foreign = await seedPhoto(ctx.repo, { uploadSessionId: 'T'.repeat(43) });
    await expect(ctx.svc.submit(member, request({ mediaIds: [foreign._id] }))).rejects.toMatchObject({ code: 'not_found' });
  });

  it('requires a signed-in member to submit', async () => {
    const photo = await seedPhoto(ctx.repo);
    await expect(ctx.svc.submit(visitor, request({ mediaIds: [photo._id] }))).rejects.toMatchObject({ code: 'unauthorized', fields: { form: 'sign_in_required' } });
    expect(ctx.repo.all(COLLECTIONS.tradeIns)).toHaveLength(0);
  });

  it('only accepts past orders owned by the signed-in member', async () => {
    const photo = await seedPhoto(ctx.repo);
    const otherMember: RequestContext = { ...member, caller: { type: 'member', id: 'm2' } };
    await expect(ctx.svc.submit(otherMember, request({ orderId: 'o1', mediaIds: [photo._id] }))).rejects.toMatchObject({ fields: { orderId: 'invalid' } });
    const res = await ctx.svc.submit(member, request({ submissionKey: 'submission-key-0009', orderId: 'o1', mediaIds: [photo._id] }));
    expect((await ctx.repo.get<TradeInDoc>(COLLECTIONS.tradeIns, res.tradeInId))!.memberId).toBe('m1');
  });

  it('lets the customer view by token but not another visitor without it', async () => {
    const photo = await seedPhoto(ctx.repo);
    const res = await ctx.svc.submit(member, request({ mediaIds: [photo._id] }));
    const view = await ctx.svc.getForCustomer({ ...visitor, caller: { type: 'visitor', id: 'other' } }, { token: res.accessToken });
    expect(view).toMatchObject({ reference: res.reference, status: 'submitted' });
    expect(view.handoff.address).toBeUndefined(); // not shown before approval
    await expect(ctx.svc.getForCustomer(visitor, { tradeInId: res.tradeInId })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('expires an overdue revised offer on the next read', async () => {
    const photo = await seedPhoto(ctx.repo);
    const res = await ctx.svc.submit(member, request({ mediaIds: [photo._id] }));
    const doc = (await ctx.repo.get<TradeInDoc>(COLLECTIONS.tradeIns, res.tradeInId))!;
    await ctx.repo.update(COLLECTIONS.tradeIns, { ...doc, status: 'revised_offer_pending', revisedValueMinor: 10_00, revisedOfferExpiresAt: new Date('2000-01-01') });
    const view = await ctx.svc.getForCustomer(visitor, { token: res.accessToken });
    expect(view.status).toBe('return_pending');
  });
});

describe('evidence upload limits', () => {
  const fakeWixMedia = {
    createUploadUrl: async () => ({ uploadUrl: 'https://upload.example/put' }),
    createResumableUploadUrl: async () => ({ uploadUrl: 'https://upload.example/tus' }),
    getFile: async () => ({ mimeTypeFamily: 'VIDEO', isPrivate: true, sizeBytes: 1000, status: 'READY' }),
  } as unknown as WixMediaService;
  const seedVideo = (repo: MemoryRepo) =>
    repo.insert<TradeInMediaDoc>(COLLECTIONS.media, { instanceId: INSTANCE, uploadSessionId: SESSION, mediaType: 'video', readyStatus: 'processing', fileSize: 1000, mimeType: 'video/mp4', mediaManagerFileId: 'v-old' });

  it('keeps a replaced upload out for good: it cannot be confirmed or revived by a File Ready event', async () => {
    const repo = new MemoryRepo();
    const media = new TradeInMediaService(repo, fakeWixMedia);
    const old = await seedVideo(repo);
    await media.requestUpload(INSTANCE, { uploadSessionId: SESSION, kind: 'video', mimeType: 'video/mp4', fileName: 'new.mp4', sizeBytes: 1000, durationSeconds: 5 });
    await expect(media.confirmUpload(INSTANCE, { uploadSessionId: SESSION, mediaId: old._id, fileId: 'v-old' })).rejects.toMatchObject({ code: 'conflict' });
    await media.markFromEvent({ mediaId: old._id, status: 'ready' });
    expect((await repo.get<TradeInMediaDoc>(COLLECTIONS.media, old._id))!).toMatchObject({ readyStatus: 'failed' });
    await expect(media.validateForSubmission(INSTANCE, SESSION, [old._id], { photoMinimum: 0, videoMode: 'optional', videoMaxSeconds: 60 })).rejects.toMatchObject({ code: 'bad_request' });
  });

  it('rejects a submission with more files than the per-kind limit', async () => {
    const repo = new MemoryRepo();
    const media = new TradeInMediaService(repo, fakeWixMedia);
    const ids: string[] = [];
    for (let i = 0; i < 11; i++) ids.push((await seedPhoto(repo, { mediaManagerFileId: `f${i}` }))._id);
    await expect(media.validateForSubmission(INSTANCE, SESSION, ids, { photoMinimum: 1, videoMode: 'off', videoMaxSeconds: 60 })).rejects.toMatchObject({ code: 'bad_request', message: 'too many files' });
  });
});

describe('trade-in terms', () => {
  it('takes no requests until the store has terms', async () => {
    const ctx = await setup();
    await seedRule(ctx.rules);
    await ctx.settings.save(INSTANCE, { ...defaultSettings(), termsHtml: '<p><br></p>' });
    expect((await ctx.svc.formConfig(visitor, 'p1')).accepting).toBe(false);
    expect(await ctx.svc.productCta(visitor, 'p1')).toEqual({ eligible: false, accepting: false });
    await expect(ctx.svc.submit(member, request())).rejects.toMatchObject({ fields: { form: 'not_accepting' } });
    expect((await ctx.merchant.overview(INSTANCE)).setup.termsConfigured).toBe(false);

    await ctx.settings.save(INSTANCE, { ...defaultSettings(), termsHtml: TERMS });
    expect((await ctx.svc.formConfig(visitor, 'p1')).accepting).toBe(true);
    expect((await ctx.merchant.overview(INSTANCE)).setup.termsConfigured).toBe(true);
  });

  it('records the terms the customer accepted, unchanged by later edits', async () => {
    const ctx = await setup();
    await seedRule(ctx.rules);
    const photo = await seedPhoto(ctx.repo);
    const { tradeInId } = await ctx.svc.submit(member, request({ mediaIds: [photo._id] }));
    await ctx.settings.save(INSTANCE, { ...defaultSettings(), termsHtml: '<p>New terms</p>' });
    const doc = (await ctx.repo.get<TradeInDoc>(COLLECTIONS.tradeIns, tradeInId))!;
    expect(doc.termsHtml).toBe(TERMS);
    expect(doc.termsAcceptedAt).toEqual(new Date(Date.UTC(2026, 0, 15)));
  });

  it('sanitizes terms on save and serves them to the form', async () => {
    const ctx = await setup();
    await seedRule(ctx.rules);
    await ctx.settings.save(INSTANCE, { ...defaultSettings(), termsHtml: '<p onclick="x()">Hi<script>alert(1)</script></p><img src=x onerror=alert(1)><a href="javascript:alert(1)">bad</a>' });
    const { termsHtml } = await ctx.svc.formConfig(visitor, 'p1');
    expect(termsHtml).not.toMatch(/script|onclick|onerror|<img|javascript:/);
    expect(termsHtml).toContain('<p>Hi</p>');
  });

  it('converts plain-text terms saved before the editor existed', async () => {
    const ctx = await setup();
    const repo = ctx.repo;
    const [doc] = repo.all(COLLECTIONS.settings) as unknown as { settings: Record<string, unknown> }[];
    const { termsHtml: _drop, ...legacy } = doc.settings;
    await repo.update(COLLECTIONS.settings, { ...doc, settings: { ...legacy, termsText: 'Line one\n\nA < B' } } as never);
    expect((await ctx.settings.get(INSTANCE)).termsHtml).toBe('<p>Line one</p><p>A &lt; B</p>');
  });
});

describe('plan limits on submission', () => {
  it('takes one request a month on basic, then stops accepting', async () => {
    const ctx = await setup('basic');
    await seedRule(ctx.rules);
    const config = await ctx.svc.formConfig(visitor, 'p1');
    expect(config).toMatchObject({ accepting: true, uploads: false, media: { photoMinimum: 0, videoMode: 'off' } });
    await ctx.svc.submit(member, request());
    // Replaying the accepted submission still works; a new one is refused.
    await expect(ctx.svc.submit(member, request())).resolves.toBeTruthy();
    await expect(ctx.svc.submit(member, request({ submissionKey: 'submission-key-0002' }))).rejects.toMatchObject({ fields: { form: 'not_accepting' } });
    expect((await ctx.svc.formConfig(visitor, 'p1')).accepting).toBe(false);
    expect(await ctx.svc.productCta(visitor, 'p1')).toEqual({ eligible: false, accepting: false });
    expect(await ctx.svc.monthlyUsage(INSTANCE)).toEqual({ used: 1, limit: 1 });
  });

  it('still counts a deleted request toward the monthly allowance', async () => {
    const ctx = await setup('basic');
    await seedRule(ctx.rules);
    const { tradeInId } = await ctx.svc.submit(member, request());
    await ctx.merchant.deleteTradeIn(INSTANCE, { type: 'merchant', id: 'u1' }, tradeInId);
    expect(await ctx.repo.get(COLLECTIONS.tradeIns, tradeInId)).toBeNull();
    expect((await ctx.svc.formConfig(visitor, 'p1')).accepting).toBe(false);
    expect(await ctx.svc.productCta(visitor, 'p1')).toEqual({ eligible: false, accepting: false });
    expect(await ctx.svc.monthlyUsage(INSTANCE)).toEqual({ used: 1, limit: 1 });
  });

  it('refuses uploaded media and ship-in on basic', async () => {
    const ctx = await setup('basic');
    await seedRule(ctx.rules);
    const st = { ...defaultSettings(), termsHtml: TERMS };
    st.handoff.shipIn.enabled = true;
    await ctx.settings.save(INSTANCE, st);
    const photo = await seedPhoto(ctx.repo);
    await expect(ctx.svc.submit(member, request({ mediaIds: [photo._id] }))).rejects.toMatchObject({ fields: { media: 'not_available' } });
    await expect(ctx.svc.submit(member, request({ submissionKey: 'submission-key-0002', handoffMethod: 'ship_in' }))).rejects.toMatchObject({ fields: { handoffMethod: 'disabled' } });
    // The saved setting is kept for when the store upgrades.
    expect((await ctx.settings.getStored(INSTANCE)).handoff.shipIn.enabled).toBe(true);
  });

  it('keeps the rule photo requirement and ship-in on pro', async () => {
    const ctx = await setup('pro');
    await seedRule(ctx.rules);
    const st = { ...defaultSettings(), termsHtml: TERMS };
    st.handoff.shipIn.enabled = true;
    await ctx.settings.save(INSTANCE, st);
    const config = await ctx.svc.formConfig(visitor, 'p1');
    expect(config).toMatchObject({ accepting: true, uploads: true, media: { photoMinimum: 1 } });
    expect(config.handoffMethods.map((h) => h.method)).toEqual(['drop_off', 'ship_in']);
    expect(await ctx.svc.monthlyUsage(INSTANCE)).toEqual({ used: 0, limit: 100 });
  });
});
