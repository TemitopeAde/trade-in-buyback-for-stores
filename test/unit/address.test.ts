import { describe, expect, it } from 'vitest';
import { formatAddress, isCompleteAddress, EMPTY_ADDRESS } from '../../src/lib/location/address';
import { suggestAddresses } from '../../src/server/services/GeoapifyAutocomplete';
import { defaultSettings } from '../../src/lib/schemas/domain';
import { SettingsService } from '../../src/server/services/SettingsService';
import { MemoryRepo } from '../support/memoryRepo';

const austin = { country: 'US', line1: '500 Congress Ave', line2: 'Suite 2', city: 'Austin', subdivision: 'TX', postalCode: '78701' };

describe('postal addresses', () => {
  it('formats a full address on separate lines, skipping empty parts', () => {
    expect(formatAddress(austin)).toBe('500 Congress Ave\nSuite 2\nAustin, TX 78701\nUnited States');
    expect(formatAddress({ ...EMPTY_ADDRESS, country: 'NG', line1: '12 Allen Ave', city: 'Ikeja' })).toBe('12 Allen Ave\nIkeja\nNigeria');
  });

  it('needs a country and a street line to be complete', () => {
    expect(isCompleteAddress(austin)).toBe(true);
    expect(isCompleteAddress({ ...austin, line1: ' ' })).toBe(false);
    expect(isCompleteAddress({ ...austin, country: '' })).toBe(false);
    expect(isCompleteAddress(undefined)).toBe(false);
  });

  it('builds the customer-facing address from the structured one on save, and keeps older free text otherwise', async () => {
    const svc = new SettingsService(new MemoryRepo());
    const s = defaultSettings();
    s.termsHtml = '<p>Terms</p>';
    s.handoff.dropOff = { ...s.handoff.dropOff, address: 'old text', location: austin };
    s.handoff.shipIn = { ...s.handoff.shipIn, enabled: true, address: 'Warehouse 9', location: { ...EMPTY_ADDRESS, country: 'US' } };
    const saved = await svc.save('i1', s);
    expect(saved.handoff.dropOff.address).toBe('500 Congress Ave\nSuite 2\nAustin, TX 78701\nUnited States');
    expect(saved.handoff.shipIn.address).toBe('Warehouse 9');
  });
});

describe('Geoapify suggestions', () => {
  it('restricts to the country, maps fields and drops duplicates', async () => {
    let url = '';
    const fetchImpl = (async (u: string) => {
      url = u;
      return new Response(JSON.stringify({ results: [
        { formatted: '500 Congress Ave, Austin, TX 78701, United States', address_line1: '500 Congress Ave', result_type: 'building', city: 'Austin', state_code: 'tx', postcode: '78701', country_code: 'us' },
        { formatted: '500 Congress Ave, Austin, TX 78701, United States' },
      ] }));
    }) as unknown as typeof fetch;
    const out = await suggestAddresses('500 Congress', 'KEY', { country: 'US', lang: 'en' }, fetchImpl);
    expect(new URL(url).searchParams.get('filter')).toBe('countrycode:us');
    expect(out).toEqual([{ formatted: '500 Congress Ave, Austin, TX 78701, United States', line1: '500 Congress Ave', city: 'Austin', subdivision: 'TX', postalCode: '78701', country: 'US' }]);
  });

  it('reports rate limits and failures as app errors', async () => {
    const status = (code: number) => (async () => new Response('', { status: code })) as unknown as typeof fetch;
    await expect(suggestAddresses('abc', 'K', { country: 'US' }, status(429))).rejects.toMatchObject({ code: 'rate_limited' });
    await expect(suggestAddresses('abc', 'K', { country: 'US' }, status(500))).rejects.toMatchObject({ code: 'unavailable' });
  });
});
