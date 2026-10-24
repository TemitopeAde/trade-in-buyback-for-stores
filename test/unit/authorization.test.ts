import { describe, expect, it } from 'vitest';
import type { RequestContext } from '../../src/server/context';
import { AccessTokenService, authorizeCustomer, requireMerchant } from '../../src/server/services/AuthorizationService';
import type { TradeInDoc } from '../../src/server/types';
import { MemoryRepo } from '../support/memoryRepo';

const ctx = (caller: RequestContext['caller'], instanceId = 'inst-1'): RequestContext => ({ instanceId, siteId: 's', caller });
const tradeIn = (over: Partial<TradeInDoc> = {}) => ({ _id: 't1', instanceId: 'inst-1', memberId: 'm1', ...over }) as TradeInDoc;

describe('authorization', () => {
  it('merchant endpoints accept only dashboard users', () => {
    expect(requireMerchant(ctx({ type: 'user', id: 'u' }))).toEqual({ type: 'merchant', id: 'u' });
    expect(() => requireMerchant(ctx({ type: 'member', id: 'm1' }))).toThrow();
    expect(() => requireMerchant(ctx({ type: 'visitor', id: 'v' }))).toThrow();
  });

  it('owner member is authorized without a token', () => {
    expect(authorizeCustomer(ctx({ type: 'member', id: 'm1' }), tradeIn(), undefined)).toMatchObject({ type: 'customer' });
  });

  it('a different member or visitor needs a token for this exact record', () => {
    expect(() => authorizeCustomer(ctx({ type: 'member', id: 'm2' }), tradeIn(), undefined)).toThrow();
    expect(() => authorizeCustomer(ctx({ type: 'visitor', id: 'v' }), tradeIn(), 'other-trade-in')).toThrow();
    expect(authorizeCustomer(ctx({ type: 'visitor', id: 'v' }), tradeIn(), 't1')).toMatchObject({ type: 'customer' });
  });

  it('other instances and dashboard users are refused', () => {
    expect(() => authorizeCustomer(ctx({ type: 'member', id: 'm1' }, 'inst-2'), tradeIn(), 't1')).toThrow();
    expect(() => authorizeCustomer(ctx({ type: 'user', id: 'u' }), tradeIn(), 't1')).toThrow();
  });
});

describe('AccessTokenService', () => {
  it('mints tokens stored only as hashes and resolves them per instance', async () => {
    const repo = new MemoryRepo();
    const svc = new AccessTokenService(repo);
    const token = await svc.mint('inst-1', 't1', 'submit');
    expect(JSON.stringify(repo.data)).not.toContain(token);
    await expect(svc.resolve('inst-1', token)).resolves.toBe('t1');
    await expect(svc.resolve('inst-2', token)).rejects.toMatchObject({ code: 'not_found' });
    await expect(svc.resolve('inst-1', 'x'.repeat(43))).rejects.toMatchObject({ code: 'not_found' });
    await expect(svc.resolve('inst-1', '<script>')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('rejects expired tokens', async () => {
    const repo = new MemoryRepo();
    let now = new Date('2026-01-01');
    const svc = new AccessTokenService(repo, () => now);
    const token = await svc.mint('inst-1', 't1', 'submit', 1);
    now = new Date('2026-01-03');
    await expect(svc.resolve('inst-1', token)).rejects.toMatchObject({ code: 'expired' });
  });
});
