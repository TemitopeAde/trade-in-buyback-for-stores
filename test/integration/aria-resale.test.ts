import { beforeEach, describe, expect, it } from 'vitest';
import { APP_TOOL_DEFS } from '../../src/lib/app-tools';
import { COLLECTIONS } from '../../src/server/collections';
import { AriaToolsService } from '../../src/server/services/AriaToolsService';
import { CreditService } from '../../src/server/services/CreditService';
import { IdempotencyService } from '../../src/server/services/IdempotencyService';
import { MerchantService } from '../../src/server/services/MerchantService';
import { OutboxService } from '../../src/server/services/OutboxService';
import { ReportingService } from '../../src/server/services/ReportingService';
import { ResaleDraftService, type ResalePort } from '../../src/server/services/ResaleDraftService';
import { RulesService } from '../../src/server/services/RulesService';
import { SettingsService } from '../../src/server/services/SettingsService';
import { TradeInLifecycleService } from '../../src/server/services/TradeInLifecycleService';
import { TradeInMediaService } from '../../src/server/services/TradeInMediaService';
import type { WixMediaService } from '../../src/server/services/WixMediaService';
import type { TradeInDoc } from '../../src/server/types';
import { MemoryRepo } from '../support/memoryRepo';

const I = 'inst-1';

function setup() {
  const repo = new MemoryRepo();
  const idempotency = new IdempotencyService(repo);
  const outbox = new OutboxService(repo, () => new Date(), (i, op, k) => idempotency.lock(i, op, k));
  const lifecycle = new TradeInLifecycleService(repo, idempotency, outbox);
  const settings = new SettingsService(repo);
  const rules = new RulesService(repo);
  const merchant = new MerchantService({ repo, lifecycle, media: new TradeInMediaService(repo, {} as WixMediaService), rules, settings, catalogVersion: async () => 'V3_CATALOG' });
  const created: string[] = [];
  const port: ResalePort = { create: async ({ slug }) => { created.push(slug); return `prod-${created.length}`; } };
  const resale = new ResaleDraftService(lifecycle, settings, outbox, port);
  const credit = new CreditService(lifecycle, { issue: async () => ({ giftCardId: 'gc', amount: '1', currency: 'USD' }), exists: async () => true }, settings, outbox);
  const reporting = new ReportingService(repo, async (ids) => ids.map((id) => ({ id, initial: '45.00', balance: '15.00', currency: 'USD' })));
  const aria = new AriaToolsService({ repo, merchant, credit, resale, reporting, rules, settings });
  return { repo, aria, resale, created, rules, reporting };
}

async function seed(repo: MemoryRepo, over: Partial<TradeInDoc> = {}) {
  return repo.insert<TradeInDoc>(COLLECTIONS.tradeIns, {
    instanceId: I, reference: 'TI-AAAA-BBBB', status: 'submitted', revision: 1, estimatedValueMinor: 5000, currency: 'USD',
    customerName: 'Ana', customerEmail: 'ana@example.com', productTitle: 'Phone', handoffMethod: 'drop_off', internalNotes: [],
    conditionAnswers: {}, productSnapshot: { priceMinor: 10000 },
    offerBreakdown: { basePriceMinor: 10000, payoutBasisPoints: 5000, baseOfferMinor: 5000, adjustments: [], beforeClampMinor: 5000, offerMinor: 5000, currency: 'USD', ruleId: 'r', ruleVersion: 1 },
    giftCardStatus: 'not_started', resaleDraftStatus: 'not_started', ...over,
  } as unknown as TradeInDoc);
}

const ctx = { instanceId: I, userId: 'u1' };

describe('App Tools declarations', () => {
  it('have unique, valid method names and descriptions', () => {
    const names = APP_TOOL_DEFS.map((d) => d.methodName);
    expect(new Set(names).size).toBe(names.length);
    for (const d of APP_TOOL_DEFS) {
      expect(d.methodName).toMatch(/^[a-z-]{1,30}$/);
      expect(d.description.length).toBeGreaterThanOrEqual(10);
      expect(d.description.length).toBeLessThanOrEqual(1000);
      expect(d.displayName.length).toBeLessThanOrEqual(50);
    }
  });
});

describe('AriaToolsService', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => { s = setup(); });

  it('requires a confirmation round-trip before changing anything', async () => {
    await seed(s.repo);
    const first = await s.aria.run(ctx, 'approve-trade-in', { reference: 'ti-aaaa-bbbb' });
    expect(first).toMatchObject({ requiresConfirmation: true });
    expect((await s.repo.find<TradeInDoc>(COLLECTIONS.tradeIns, {})).items[0].status).toBe('submitted');
    const second = await s.aria.run(ctx, 'approve-trade-in', { reference: 'TI-AAAA-BBBB', confirmationCode: first.confirmationCode });
    expect(second).toMatchObject({ done: true, result: { status: 'approved' } });
  });

  it('rejects a guessed or stale confirmation code', async () => {
    const doc = await seed(s.repo);
    const first = await s.aria.run(ctx, 'approve-trade-in', { reference: 'TI-AAAA-BBBB' });
    expect(await s.aria.run(ctx, 'approve-trade-in', { reference: 'TI-AAAA-BBBB', confirmationCode: 'guess' })).toMatchObject({ requiresConfirmation: true });
    // Record changes between preview and confirm → old code no longer valid.
    await s.repo.update(COLLECTIONS.tradeIns, { ...(await s.repo.get<TradeInDoc>(COLLECTIONS.tradeIns, doc._id))!, revision: 2 });
    expect(await s.aria.run(ctx, 'approve-trade-in', { reference: 'TI-AAAA-BBBB', confirmationCode: first.confirmationCode })).toMatchObject({ requiresConfirmation: true });
    // A code is bound to the user who previewed it.
    const mine = await s.aria.run(ctx, 'approve-trade-in', { reference: 'TI-AAAA-BBBB' });
    expect(await s.aria.run({ ...ctx, userId: 'u2' }, 'approve-trade-in', { reference: 'TI-AAAA-BBBB', confirmationCode: mine.confirmationCode })).toMatchObject({ requiresConfirmation: true });
  });

  it('cannot bypass business rules (invalid transitions, other instances)', async () => {
    await seed(s.repo, { status: 'credit_issued' });
    const first = await s.aria.run(ctx, 'approve-trade-in', { reference: 'TI-AAAA-BBBB' });
    await expect(s.aria.run(ctx, 'approve-trade-in', { reference: 'TI-AAAA-BBBB', confirmationCode: first.confirmationCode })).rejects.toMatchObject({ code: 'invalid_transition' });
    await expect(s.aria.run({ instanceId: 'other', userId: 'u1' }, 'get-trade-in', { reference: 'TI-AAAA-BBBB' })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('validates revised offer input and describes the money change', async () => {
    await seed(s.repo, { status: 'inspection' });
    await expect(s.aria.run(ctx, 'send-revised-offer', { reference: 'TI-AAAA-BBBB', amount: '-5', reason: 'x' })).rejects.toMatchObject({ code: 'bad_request' });
    const first = await s.aria.run(ctx, 'send-revised-offer', { reference: 'TI-AAAA-BBBB', amount: '35.00', reason: 'Scratches' });
    expect(String(first.summary)).toContain('$35.00');
    const done = await s.aria.run(ctx, 'send-revised-offer', { reference: 'TI-AAAA-BBBB', amount: '35.00', reason: 'Scratches', confirmationCode: first.confirmationCode });
    expect(done).toMatchObject({ result: { status: 'revised_offer_pending' } });
  });

  it('read-only tools never require confirmation and never expose gift card codes', async () => {
    await seed(s.repo, { status: 'credit_issued', giftCardStatus: 'issued', giftCardId: 'gc-1', finalValueMinor: 4500 });
    const res = await s.aria.run(ctx, 'gift-card-status', { reference: 'TI-AAAA-BBBB' });
    expect(res).toMatchObject({ giftCardStatus: 'issued', credit: '$45.00' });
    expect(JSON.stringify(res)).not.toMatch(/code"/i);
    expect(await s.aria.run(ctx, 'workload-summary', {})).toHaveProperty('counts');
  });

  it('rejects unknown tools', async () => {
    await expect(s.aria.run(ctx, 'drop-database', {})).rejects.toMatchObject({ code: 'bad_request' });
  });
});

describe('ResaleDraftService', () => {
  it('creates one hidden draft per accepted item and refuses non-accepted items', async () => {
    const s = setup();
    const pending = await seed(s.repo);
    await expect(s.resale.create(I, pending._id, { type: 'merchant' })).rejects.toMatchObject({ code: 'invalid_transition' });
    const doc = await seed(s.repo, { reference: 'TI-CCCC-DDDD', status: 'credit_issued', giftCardStatus: 'issued' });
    const out = await s.resale.create(I, doc._id, { type: 'merchant' });
    expect(out).toMatchObject({ resaleDraftStatus: 'created', resaleProductId: 'prod-1' });
    await s.resale.create(I, doc._id, { type: 'merchant' });
    expect(s.created).toEqual(['trade-in-ti-cccc-dddd']);
  });
});

describe('ReportingService', () => {
  it('reports conversion, issued and redeemed credit from persisted data', async () => {
    const s = setup();
    await seed(s.repo, { status: 'credit_issued', giftCardStatus: 'issued', giftCardId: 'g1', finalValueMinor: 4500 });
    await seed(s.repo, { reference: 'TI-X', status: 'rejected' });
    const r = await s.reporting.report(I, 30, new Date('2026-01-15')); // MemoryRepo stamps records at 2026-01-01
    expect(r).toMatchObject({ submitted: 2, rejected: 1, creditIssuedCount: 1, conversionRate: 50 });
    expect(r.creditIssuedMinorByCurrency).toEqual({ USD: 4500 });
    expect(r.creditRedeemedMinorByCurrency).toEqual({ USD: 3000 });
  });
});
