import { describe, expect, it, vi } from 'vitest';

// A plain stub, not vi.fn: Vitest reports a vi.fn's rejection even when the caller handles it.
let calls = 0;
let lookup: () => Promise<{ properties?: { paymentCurrency?: string } }> = async () => ({});
vi.mock('@wix/essentials', () => ({ auth: { elevate: (fn: unknown) => fn } }));
vi.mock('@wix/business-tools', () => ({
  siteProperties: { getSiteProperties: (options: { fields: string[] }) => { calls++; expect(options).toEqual({ fields: ['paymentCurrency'] }); return lookup(); } },
}));

const { WixSitePropertiesService } = await import('../../src/server/services/WixSitePropertiesService');

describe('WixSitePropertiesService', () => {
  it('returns the site payment currency and caches it per instance', async () => {
    calls = 0;
    lookup = async () => ({ properties: { paymentCurrency: 'eur' } });
    const svc = new WixSitePropertiesService();
    expect(await svc.currency('i1')).toBe('EUR');
    expect(await svc.currency('i1')).toBe('EUR');
    expect(calls).toBe(1);
  });

  it('fails as unavailable when the site has no currency, rather than guessing one', async () => {
    lookup = async () => ({ properties: {} });
    await expect(new WixSitePropertiesService().currency('i1')).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('fails as unavailable when the lookup fails', async () => {
    lookup = async () => { throw new Error('network'); };
    await expect(new WixSitePropertiesService().currency('i1')).rejects.toMatchObject({ code: 'unavailable' });
  });
});
