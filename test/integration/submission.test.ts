import { beforeEach, describe, expect, it } from 'vitest';
import type { SubmitRequest } from '../../src/lib/schemas/api';
import { COLLECTIONS } from '../../src/server/collections';
import type { RequestContext } from '../../src/server/context';
import { AccessTokenService } from '../../src/server/services/AuthorizationService';
import { IdempotencyService } from '../../src/server/services/IdempotencyService';
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

function setup() {
  const repo = new MemoryRepo();
  const idempotency = new IdempotencyService(repo);
  const outbox = new OutboxService(repo);
  const settings = new SettingsService(repo);
  const rules = new RulesService(repo);
  const tokens = new AccessTokenService(repo);
  const media = new TradeInMediaService(repo, {} as WixMediaService);
  const lifecycle = new TradeInLifecycleService(repo, idempotency, outbox);
  const orderOwnership = new Map<string, string>([['o1', 'm1']]);
  const svc = new TradeInService({
    repo, rules, settings, media, lifecycle, idempotency, outbox, tokens,
    catalog: { getProduct: async (_i, id) => (id === product.productId ? product : undefined), search: async () => [product] },
    orders: {
      eligibleItemsForMember: async () => [],
      verifyMemberOrderItem: async (m, o, p) => orderOwnership.get(o) === m && p === 'p1',
    },
  });
  return { repo, svc, rules, settings, tokens };
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
  let ctx: ReturnType<typeof setup>;
  beforeEach(async () => {
    ctx = setup();
    await seedRule(ctx.rules);
  });

  it('persists a trade-in with a server-computed offer, attaches media and enqueues notification', async () => {
    const photo = await seedPhoto(ctx.repo);
    const res = await ctx.svc.submit(visitor, request({ mediaIds: [photo._id] }));
    const doc = (await ctx.repo.get<TradeInDoc>(COLLECTIONS.tradeIns, res.tradeInId))!;
    expect(doc).toMatchObject({ status: 'submitted', estimatedValueMinor: 40_00, currency: 'USD', customerEmail: 'ana@example.com', revision: 1 });
    expect(doc.offerBreakdown.basePriceMinor).toBe(100_00);
    expect((await ctx.repo.get<TradeInMediaDoc>(COLLECTIONS.media, photo._id))!.tradeInId).toBe(res.tradeInId);
    expect(ctx.repo.all(COLLECTIONS.outbox).map((o) => o.eventType)).toEqual(['trade_in.submitted']);
    expect(res.reference).toMatch(/^TI-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    await expect(ctx.tokens.resolve(INSTANCE, res.accessToken)).resolves.toBe(res.tradeInId);
  });

  it('is idempotent: a retried submission creates one trade-in', async () => {
    const photo = await seedPhoto(ctx.repo);
    const a = await ctx.svc.submit(visitor, request({ mediaIds: [photo._id] }));
    const b = await ctx.svc.submit(visitor, request({ mediaIds: [photo._id] }));
    expect(b.tradeInId).toBe(a.tradeInId);
    expect(ctx.repo.all(COLLECTIONS.tradeIns)).toHaveLength(1);
  });

  it('rejects missing evidence, disabled hand-off and unknown answers', async () => {
    await expect(ctx.svc.submit(visitor, request())).rejects.toMatchObject({ fields: { media: 'photos_min' } });
    const photo = await seedPhoto(ctx.repo);
    await expect(ctx.svc.submit(visitor, request({ submissionKey: 'submission-key-0002', mediaIds: [photo._id], handoffMethod: 'ship_in' }))).rejects.toMatchObject({ fields: { handoffMethod: 'disabled' } });
    await expect(ctx.svc.submit(visitor, request({ submissionKey: 'submission-key-0003', mediaIds: [photo._id], answers: { screen: 'mint' } }))).rejects.toMatchObject({ code: 'bad_request' });
  });

  it('refuses media from another upload session or instance', async () => {
    const foreign = await seedPhoto(ctx.repo, { uploadSessionId: 'T'.repeat(43) });
    await expect(ctx.svc.submit(visitor, request({ mediaIds: [foreign._id] }))).rejects.toMatchObject({ code: 'not_found' });
  });

  it('only accepts past orders owned by the signed-in member', async () => {
    const photo = await seedPhoto(ctx.repo);
    await expect(ctx.svc.submit(visitor, request({ orderId: 'o1', mediaIds: [photo._id] }))).rejects.toMatchObject({ fields: { orderId: 'invalid' } });
    const res = await ctx.svc.submit(member, request({ submissionKey: 'submission-key-0009', orderId: 'o1', mediaIds: [photo._id] }));
    expect((await ctx.repo.get<TradeInDoc>(COLLECTIONS.tradeIns, res.tradeInId))!.memberId).toBe('m1');
  });

  it('lets the customer view by token but not another visitor without it', async () => {
    const photo = await seedPhoto(ctx.repo);
    const res = await ctx.svc.submit(visitor, request({ mediaIds: [photo._id] }));
    const view = await ctx.svc.getForCustomer({ ...visitor, caller: { type: 'visitor', id: 'other' } }, { token: res.accessToken });
    expect(view).toMatchObject({ reference: res.reference, status: 'submitted' });
    expect(view.handoff.address).toBeUndefined(); // not shown before approval
    await expect(ctx.svc.getForCustomer(visitor, { tradeInId: res.tradeInId })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('expires an overdue revised offer on the next read', async () => {
    const photo = await seedPhoto(ctx.repo);
    const res = await ctx.svc.submit(visitor, request({ mediaIds: [photo._id] }));
    const doc = (await ctx.repo.get<TradeInDoc>(COLLECTIONS.tradeIns, res.tradeInId))!;
    await ctx.repo.update(COLLECTIONS.tradeIns, { ...doc, status: 'revised_offer_pending', revisedValueMinor: 10_00, revisedOfferExpiresAt: new Date('2000-01-01') });
    const view = await ctx.svc.getForCustomer(visitor, { token: res.accessToken });
    expect(view.status).toBe('return_pending');
  });
});
