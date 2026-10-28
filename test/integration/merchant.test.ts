import { beforeEach, describe, expect, it } from 'vitest';
import { getPlanEntitlements, type PlanTier } from '../../src/lib/plans';
import { COLLECTIONS } from '../../src/server/collections';
import { IdempotencyService } from '../../src/server/services/IdempotencyService';
import { MerchantService } from '../../src/server/services/MerchantService';
import { OutboxService } from '../../src/server/services/OutboxService';
import { RulesService } from '../../src/server/services/RulesService';
import { SettingsService } from '../../src/server/services/SettingsService';
import { TradeInLifecycleService } from '../../src/server/services/TradeInLifecycleService';
import { TradeInMediaService } from '../../src/server/services/TradeInMediaService';
import type { WixMediaService } from '../../src/server/services/WixMediaService';
import type { TradeInDoc } from '../../src/server/types';
import { MemoryRepo } from '../support/memoryRepo';

const I = 'inst-1';
const merchantActor = { type: 'merchant' as const, id: 'u1' };
let n = 0;
const key = () => `idem-key-${String(++n).padStart(8, '0')}`;

const deletedFiles: string[] = [];

function setup(planTier?: PlanTier, now?: Date) {
  const repo = new MemoryRepo();
  const plan = planTier ? { entitlements: async () => getPlanEntitlements(planTier) } : undefined;
  const idempotency = new IdempotencyService(repo);
  const lifecycle = new TradeInLifecycleService(repo, idempotency, new OutboxService(repo));
  const svc = new MerchantService({
    repo, lifecycle,
    media: new TradeInMediaService(repo, { viewUrl: async () => 'https://signed', deletePermanently: async (ids: string[]) => { deletedFiles.push(...ids); } } as unknown as WixMediaService),
    rules: new RulesService(repo), settings: new SettingsService(repo), catalogVersion: async () => 'V3_CATALOG', plan,
    now: now && (() => now),
  });
  return { repo, svc };
}

async function seed(repo: MemoryRepo, over: Partial<TradeInDoc> = {}) {
  return repo.insert<TradeInDoc>(COLLECTIONS.tradeIns, {
    instanceId: I, reference: `TI-AAAA-${String(++n).padStart(4, '0')}`, status: 'submitted', revision: 1, estimatedValueMinor: 50_00, currency: 'USD',
    customerName: 'Ana Lima', customerEmail: 'ana@example.com', productTitle: 'Phone X', handoffMethod: 'drop_off', internalNotes: [],
    conditionAnswers: {}, offerBreakdown: { ruleId: 'none' }, giftCardStatus: 'not_started', resaleDraftStatus: 'not_started', ...over,
  } as unknown as TradeInDoc);
}

describe('MerchantService', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => { s = setup(); });

  it('walks the happy path to credit_pending with final value = server estimate', async () => {
    const doc = await seed(s.repo);
    let d = await s.svc.act(I, merchantActor, { tradeInId: doc._id, action: 'approve', expectedRevision: 1, idempotencyKey: key() });
    d = await s.svc.act(I, merchantActor, { tradeInId: doc._id, action: 'receive', expectedRevision: d.revision, idempotencyKey: key() });
    d = await s.svc.act(I, merchantActor, { tradeInId: doc._id, action: 'start_inspection', expectedRevision: d.revision, idempotencyKey: key() });
    d = await s.svc.act(I, merchantActor, { tradeInId: doc._id, action: 'confirm_value', expectedRevision: d.revision, idempotencyKey: key(), inspectionNotes: 'Mint' });
    expect(d).toMatchObject({ status: 'credit_pending', finalValueMinor: 50_00, inspectionNotes: 'Mint' });
    expect(d.timeline.map((e) => e.toStatus)).toEqual(['approved', 'received', 'inspection', 'credit_pending']);
  });

  it('requires a reason to reject and stores it', async () => {
    const doc = await seed(s.repo);
    await expect(s.svc.act(I, merchantActor, { tradeInId: doc._id, action: 'reject', expectedRevision: 1, idempotencyKey: key() })).rejects.toMatchObject({ fields: { reason: 'required' } });
    const d = await s.svc.act(I, merchantActor, { tradeInId: doc._id, action: 'reject', expectedRevision: 1, idempotencyKey: key(), reason: 'Counterfeit' });
    expect(d).toMatchObject({ status: 'rejected', rejectionReason: 'Counterfeit' });
  });

  it('validates revised offers and sets an expiry', async () => {
    const doc = await seed(s.repo, { status: 'inspection' });
    const base = { tradeInId: doc._id, action: 'send_revised_offer' as const, expectedRevision: 1, reason: 'Scratches' };
    await expect(s.svc.act(I, merchantActor, { ...base, idempotencyKey: key(), revisedValueMinor: 50_00 })).rejects.toMatchObject({ fields: { revisedValueMinor: 'same_as_estimate' } });
    await expect(s.svc.act(I, merchantActor, { ...base, idempotencyKey: key(), revisedValueMinor: 101_00 })).rejects.toMatchObject({ fields: { revisedValueMinor: 'too_high' } });
    const d = await s.svc.act(I, merchantActor, { ...base, idempotencyKey: key(), revisedValueMinor: 30_00 });
    expect(d).toMatchObject({ status: 'revised_offer_pending', revisedValueMinor: 30_00, revisedOfferReason: 'Scratches' });
    expect(new Date(d.revisedOfferExpiresAt!).getTime()).toBeGreaterThan(Date.now());
  });

  it('records the customer accepting a revised offer on their behalf', async () => {
    const doc = await seed(s.repo, { status: 'revised_offer_pending', revisedValueMinor: 30_00 });
    const d = await s.svc.act(I, merchantActor, { tradeInId: doc._id, action: 'accept_revised_offer', expectedRevision: 1, idempotencyKey: key() });
    expect(d).toMatchObject({ status: 'credit_pending', finalValueMinor: 30_00 });
  });

  it('searches by reference, email or name and filters by status group', async () => {
    const a = await seed(s.repo, { customerName: 'Bea Smith', customerEmail: 'bea@x.com' });
    await seed(s.repo, { status: 'closed' });
    expect((await s.svc.list(I, { q: a.reference.toLowerCase(), sort: 'created_desc', page: 0, pageSize: 25 })).items.map((r) => r.id)).toEqual([a._id]);
    expect((await s.svc.list(I, { q: 'BEA@X', sort: 'created_desc', page: 0, pageSize: 25 })).total).toBe(1);
    expect((await s.svc.list(I, { q: '', statusGroup: 'closed', sort: 'created_desc', page: 0, pageSize: 25 })).total).toBe(1);
    expect((await s.svc.list('other', { q: '', sort: 'created_desc', page: 0, pageSize: 25 })).total).toBe(0);
  });

  it('adds internal notes without disturbing status', async () => {
    const doc = await seed(s.repo);
    const d = await s.svc.addNote(I, merchantActor, doc._id, 'Called customer');
    expect(d.notes.map((x) => x.text)).toEqual(['Called customer']);
    expect(d.status).toBe('submitted');
  });

  it('builds the overview counts and setup checklist from real data', async () => {
    await seed(s.repo);
    await seed(s.repo, { status: 'approved' });
    const o = await s.svc.overview(I);
    expect(o.counts.needs_review).toBe(1);
    expect(o.counts.awaiting_handoff).toBe(1);
    expect(o.setup).toMatchObject({ storesInstalled: true, hasRules: false, settingsSaved: false, termsConfigured: false });
  });
});

describe('MerchantService request deletion', () => {
  // The in-memory repo stamps documents in January 2026.
  const JAN = new Date(Date.UTC(2026, 0, 15));
  let s: ReturnType<typeof setup>;
  beforeEach(() => { s = setup(undefined, JAN); deletedFiles.length = 0; });

  const rows = (collection: string, tradeInId: string) => [...s.repo.data.get(collection)?.values() ?? []].filter((d) => d.tradeInId === tradeInId);

  it('deletes the request with its media files, timeline, email log, jobs and access links', async () => {
    const doc = await seed(s.repo);
    const other = await seed(s.repo);
    await s.svc.addNote(I, merchantActor, doc._id, 'Called customer');
    for (const [collection, extra] of [
      [COLLECTIONS.media, { mediaManagerFileId: 'file-1' }],
      [COLLECTIONS.notifications, {}],
      [COLLECTIONS.outbox, {}],
      [COLLECTIONS.accessTokens, {}],
    ] as const) {
      // Distinct values for the collections' unique keys (dedupeKey, eventId, tokenHash).
      const unique = (id: string) => ({ dedupeKey: id, eventId: id, recipientType: 'customer', tokenHash: id });
      await s.repo.insert(collection, { instanceId: I, tradeInId: doc._id, ...unique(`${collection}-a`), ...extra });
      await s.repo.insert(collection, { instanceId: I, tradeInId: other._id, ...unique(`${collection}-b`) });
    }

    await s.svc.deleteTradeIn(I, merchantActor, doc._id);

    expect(await s.repo.get(COLLECTIONS.tradeIns, doc._id)).toBeNull();
    expect(deletedFiles).toEqual(['file-1']);
    for (const c of [COLLECTIONS.media, COLLECTIONS.notifications, COLLECTIONS.outbox, COLLECTIONS.accessTokens]) {
      expect(rows(c, doc._id)).toEqual([]);
      expect(rows(c, other._id)).toHaveLength(1);
    }
    // Only the anonymous tombstone remains on the timeline.
    expect(rows(COLLECTIONS.events, doc._id)).toEqual([expect.objectContaining({ eventType: 'trade_in.deleted', actorType: 'merchant', actorId: 'u1' })]);
    expect(JSON.stringify(rows(COLLECTIONS.events, doc._id))).not.toContain('Ana');
    expect(await s.repo.get(COLLECTIONS.tradeIns, other._id)).not.toBeNull();
  });

  it('can be retried after an interrupted attempt', async () => {
    const doc = await seed(s.repo);
    await s.repo.insert(COLLECTIONS.events, { _id: `deleted-${doc._id}`, instanceId: I, tradeInId: doc._id, eventType: 'trade_in.deleted', actorType: 'merchant' });
    await s.svc.deleteTradeIn(I, merchantActor, doc._id);
    expect(await s.repo.get(COLLECTIONS.tradeIns, doc._id)).toBeNull();
    expect(rows(COLLECTIONS.events, doc._id)).toHaveLength(1);
  });

  it('leaves no tombstone for requests from an earlier month', async () => {
    s = setup(undefined, new Date(Date.UTC(2026, 1, 3)));
    const doc = await seed(s.repo);
    await s.svc.deleteTradeIn(I, merchantActor, doc._id);
    expect(rows(COLLECTIONS.events, doc._id)).toEqual([]);
  });

  it('refuses while store credit is being issued', async () => {
    const doc = await seed(s.repo, { status: 'credit_pending' });
    await expect(s.svc.deleteTradeIn(I, merchantActor, doc._id)).rejects.toMatchObject({ code: 'conflict', fields: { status: 'credit_pending' } });
    expect(await s.repo.get(COLLECTIONS.tradeIns, doc._id)).not.toBeNull();
  });

  it('only deletes requests that belong to the caller\'s site', async () => {
    const doc = await seed(s.repo);
    await expect(s.svc.deleteTradeIn('other-instance', merchantActor, doc._id)).rejects.toMatchObject({ code: 'not_found' });
    expect(await s.repo.get(COLLECTIONS.tradeIns, doc._id)).not.toBeNull();
  });
});

describe('MerchantService plan limits', () => {
  it('offers and accepts revised offers only on paid plans', async () => {
    const basic = setup('basic');
    const doc = await seed(basic.repo, { status: 'inspection' });
    expect((await basic.svc.detail(I, doc._id)).actions).not.toContain('send_revised_offer');
    await expect(basic.svc.act(I, { type: 'merchant', id: 'u' }, { tradeInId: doc._id, action: 'send_revised_offer', expectedRevision: 1, reason: 'Scratches', revisedValueMinor: 30_00, idempotencyKey: key() }))
      .rejects.toMatchObject({ code: 'forbidden' });
    const pro = setup('pro');
    const doc2 = await seed(pro.repo, { status: 'inspection' });
    expect((await pro.svc.detail(I, doc2._id)).actions).toContain('send_revised_offer');
  });
});
