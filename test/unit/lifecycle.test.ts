import { beforeEach, describe, expect, it } from 'vitest';
import { availableActions, canTransition, TRADE_IN_STATUSES, TRANSITIONS } from '../../src/lib/lifecycle';
import { COLLECTIONS } from '../../src/server/collections';
import { IdempotencyService } from '../../src/server/services/IdempotencyService';
import { OutboxService } from '../../src/server/services/OutboxService';
import { TradeInLifecycleService } from '../../src/server/services/TradeInLifecycleService';
import type { TradeInDoc } from '../../src/server/types';
import { MemoryRepo } from '../support/memoryRepo';

describe('transition table', () => {
  it('only references known statuses', () => {
    for (const rule of Object.values(TRANSITIONS)) {
      expect(TRADE_IN_STATUSES).toContain(rule.to);
      for (const f of rule.from) expect(TRADE_IN_STATUSES).toContain(f);
    }
  });
  it('never lets customers approve, receive or issue credit', () => {
    for (const s of TRADE_IN_STATUSES) {
      const actions = availableActions(s, 'customer');
      expect(actions).not.toContain('approve');
      expect(actions).not.toContain('receive');
      expect(actions).not.toContain('confirm_value');
      expect(actions).not.toContain('mark_credit_issued');
    }
  });
  it('only the system marks credit issued', () => {
    expect(canTransition('mark_credit_issued', 'credit_pending', 'merchant')).toBe(false);
    expect(canTransition('mark_credit_issued', 'credit_pending', 'assistant')).toBe(false);
    expect(canTransition('mark_credit_issued', 'credit_pending', 'system')).toBe(true);
  });
  it('closed and cancelled are terminal', () => {
    expect(availableActions('closed', 'merchant')).toEqual([]);
    expect(availableActions('cancelled', 'merchant')).toEqual([]);
  });
});

describe('TradeInLifecycleService', () => {
  let repo: MemoryRepo;
  let svc: TradeInLifecycleService;
  let id: string;

  beforeEach(async () => {
    repo = new MemoryRepo();
    const idem = new IdempotencyService(repo);
    svc = new TradeInLifecycleService(repo, idem, new OutboxService(repo));
    const doc = await repo.insert<TradeInDoc>(COLLECTIONS.tradeIns, {
      instanceId: 'inst-1', reference: 'TI-AAAA-BBBB', status: 'submitted', revision: 1,
    } as unknown as TradeInDoc);
    id = doc._id;
  });

  const merchant = { type: 'merchant' as const, id: 'u1' };

  it('applies a valid transition, bumps revision, records event and outbox', async () => {
    const out = await svc.transition({ instanceId: 'inst-1', tradeInId: id, action: 'approve', actor: merchant });
    expect(out.status).toBe('approved');
    expect(out.revision).toBe(2);
    expect(repo.all(COLLECTIONS.events)).toHaveLength(1);
    expect(repo.all(COLLECTIONS.outbox)).toHaveLength(1);
  });

  it('enforces instance isolation (IDOR)', async () => {
    await expect(svc.transition({ instanceId: 'other', tradeInId: id, action: 'approve', actor: merchant })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('rejects invalid transitions and missing reasons', async () => {
    await expect(svc.transition({ instanceId: 'inst-1', tradeInId: id, action: 'receive', actor: merchant })).rejects.toMatchObject({ code: 'invalid_transition' });
    await expect(svc.transition({ instanceId: 'inst-1', tradeInId: id, action: 'reject', actor: merchant })).rejects.toMatchObject({ code: 'bad_request' });
    await expect(svc.transition({ instanceId: 'inst-1', tradeInId: id, action: 'approve', actor: { type: 'customer' } })).rejects.toMatchObject({ code: 'invalid_transition' });
  });

  it('rejects stale revisions', async () => {
    await expect(svc.transition({ instanceId: 'inst-1', tradeInId: id, action: 'approve', actor: merchant, expectedRevision: 0 })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('lets only one of two concurrent transitions win', async () => {
    const results = await Promise.allSettled([
      svc.transition({ instanceId: 'inst-1', tradeInId: id, action: 'approve', actor: merchant }),
      svc.transition({ instanceId: 'inst-1', tradeInId: id, action: 'reject', actor: merchant, reason: 'no' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(repo.all(COLLECTIONS.events)).toHaveLength(1);
  });

  it('replays an idempotent retry without a second event', async () => {
    const a = await svc.transition({ instanceId: 'inst-1', tradeInId: id, action: 'approve', actor: merchant, idempotencyKey: 'k1' });
    const b = await svc.transition({ instanceId: 'inst-1', tradeInId: id, action: 'approve', actor: merchant, idempotencyKey: 'k1' });
    expect(b.status).toBe(a.status);
    expect(repo.all(COLLECTIONS.events)).toHaveLength(1);
  });

  it('auto-follows revised offer acceptance to credit_pending and records both steps', async () => {
    const doc = (await repo.get<TradeInDoc>(COLLECTIONS.tradeIns, id))!;
    await repo.update(COLLECTIONS.tradeIns, { ...doc, status: 'revised_offer_pending' });
    const out = await svc.transition({ instanceId: 'inst-1', tradeInId: id, action: 'accept_revised_offer', actor: { type: 'customer' } });
    expect(out.status).toBe('credit_pending');
    expect(repo.all(COLLECTIONS.events).map((e) => e.toStatus)).toEqual(['revised_offer_accepted', 'credit_pending']);
  });

  it('does not let a patch overwrite protected fields', async () => {
    const out = await svc.transition({
      instanceId: 'inst-1', tradeInId: id, action: 'approve', actor: merchant,
      patch: { status: 'credit_issued', instanceId: 'evil', revision: 99 } as Partial<TradeInDoc>,
    });
    expect(out).toMatchObject({ status: 'approved', instanceId: 'inst-1', revision: 2 });
  });
});

describe('IdempotencyService', () => {
  it('rejects key reuse with a different payload and retries after failure', async () => {
    const repo = new MemoryRepo();
    const idem = new IdempotencyService(repo);
    let calls = 0;
    await expect(idem.run({ instanceId: 'i', operation: 'op', key: 'k', payload: { a: 1 } }, async () => { calls++; throw new Error('boom'); })).rejects.toThrow('boom');
    const res = await idem.run({ instanceId: 'i', operation: 'op', key: 'k', payload: { a: 1 } }, async () => { calls++; return { ok: true }; });
    expect(res).toEqual({ ok: true });
    expect(calls).toBe(2);
    await expect(idem.run({ instanceId: 'i', operation: 'op', key: 'k', payload: { a: 2 } }, async () => 1)).rejects.toMatchObject({ code: 'conflict' });
    // Completed: replay without executing.
    expect(await idem.run({ instanceId: 'i', operation: 'op', key: 'k', payload: { a: 1 } }, async () => { calls++; return { ok: false }; })).toEqual({ ok: true });
    expect(calls).toBe(2);
  });
});

describe('TradeInLifecycleService.mutate', () => {
  it('serializes non-status writes with transitions (no lost updates)', async () => {
    const repo = new MemoryRepo();
    const svc = new TradeInLifecycleService(repo, new IdempotencyService(repo), new OutboxService(repo));
    const doc = await repo.insert<TradeInDoc>(COLLECTIONS.tradeIns, { instanceId: 'i', reference: 'R', status: 'approved', revision: 1, internalNotes: [] } as unknown as TradeInDoc);
    const merchant = { type: 'merchant' as const, id: 'u' };
    const results = await Promise.allSettled([
      svc.transition({ instanceId: 'i', tradeInId: doc._id, action: 'receive', actor: merchant }),
      svc.mutate({ instanceId: 'i', tradeInId: doc._id, actor: merchant, eventType: 'note.added', change: (c) => ({ internalNotes: [...c.internalNotes, { id: 'n', authorId: 'u', text: 'hi', createdAt: '' }] }), retries: 2 }),
    ]);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    const final = (await repo.get<TradeInDoc>(COLLECTIONS.tradeIns, doc._id))!;
    expect(final.status).toBe('received');
    expect(final.internalNotes).toHaveLength(1);
    expect(final.revision).toBe(3);
  });

  it('cannot change status or identity fields', async () => {
    const repo = new MemoryRepo();
    const svc = new TradeInLifecycleService(repo, new IdempotencyService(repo), new OutboxService(repo));
    const doc = await repo.insert<TradeInDoc>(COLLECTIONS.tradeIns, { instanceId: 'i', reference: 'R', status: 'approved', revision: 1 } as unknown as TradeInDoc);
    const out = await svc.mutate({ instanceId: 'i', tradeInId: doc._id, actor: { type: 'system' }, eventType: 'x', change: () => ({ status: 'credit_issued', instanceId: 'evil', trackingNumber: 'T1' }) as Partial<TradeInDoc> });
    expect(out).toMatchObject({ status: 'approved', instanceId: 'i', trackingNumber: 'T1' });
  });
});
