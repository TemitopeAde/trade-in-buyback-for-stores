import { siteProperties } from '@wix/business-tools';
import { auth } from '@wix/essentials';
import { AppError } from '../errors';

const CACHE_MS = 10 * 60_000;

const elevatedGet = auth.elevate(siteProperties.getSiteProperties);

/**
 * The site's payment currency from its business info (Site Properties API, "Manage Your App"
 * scope). Cached briefly per instance; merchants rarely change it.
 */
export class WixSitePropertiesService {
  private readonly cache = new Map<string, { currency: string; at: number }>();

  async currency(instanceId: string): Promise<string> {
    const hit = this.cache.get(instanceId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.currency;
    try {
      const res = await elevatedGet({ fields: ['paymentCurrency'] });
      const currency = res.properties?.paymentCurrency?.toUpperCase();
      if (!currency || !/^[A-Z]{3}$/.test(currency)) throw new AppError('unavailable', 'site has no payment currency');
      this.cache.set(instanceId, { currency, at: Date.now() });
      return currency;
    } catch (err) {
      if (hit) return hit.currency;
      throw err instanceof AppError ? err : new AppError('unavailable', 'site currency lookup failed');
    }
  }
}
