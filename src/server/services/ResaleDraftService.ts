import { auth } from '@wix/essentials';
import { products, productsV3 } from '@wix/stores';
import { createTranslator } from '../../lib/i18n';
import { toDecimalString } from '../../lib/money';
import { AppError, sanitizeErrorForLog } from '../errors';
import type { Actor, TradeInDoc } from '../types';
import type { OutboxService } from './OutboxService';
import type { SettingsService } from './SettingsService';
import type { TradeInLifecycleService } from './TradeInLifecycleService';
import { getCatalogVersion } from './WixCatalogService';

// Creates a hidden (unpublished) Wix Stores product for an accepted trade-in, for the merchant to
// price and publish manually — never published automatically. The slug is derived from the
// trade-in reference, so a retry after a lost response finds the existing draft instead of
// creating a duplicate.

const elevated = {
  v1Create: auth.elevate(products.createProduct),
  v1Query: auth.elevate(products.queryProducts),
  v3Create: auth.elevate(productsV3.createProduct),
  v3BySlug: auth.elevate(productsV3.getProductBySlug),
};

export type ResalePort = { create(p: { name: string; slug: string; priceMinor: number; currency: string; instanceId: string }): Promise<string> };

export const wixResalePort: ResalePort = {
  async create({ name, slug, priceMinor, currency, instanceId }) {
    const version = await getCatalogVersion(instanceId);
    const amount = toDecimalString(priceMinor, currency);
    if (version === 'V3_CATALOG') {
      try {
        const p = await elevated.v3Create({ name, slug, productType: 'PHYSICAL', visible: false, variantsInfo: { variants: [{ price: { actualPrice: { amount } } }] } });
        if (p._id) return p._id;
      } catch (err) {
        const existing = await elevated.v3BySlug(slug).catch(() => undefined);
        if (existing?.product?._id) return existing.product._id;
        throw err;
      }
    } else if (version === 'V1_CATALOG') {
      try {
        const { product } = await elevated.v1Create({ name, slug, productType: 'physical', visible: false, priceData: { price: Number(amount) } });
        if (product?._id) return product._id;
      } catch (err) {
        const found = await elevated.v1Query().eq('slug', slug).limit(1).find().catch(() => undefined);
        if (found?.items[0]?._id) return found.items[0]._id;
        throw err;
      }
    } else {
      throw new AppError('unavailable', 'stores not installed');
    }
    throw new AppError('internal', 'no product id');
  },
};

export class ResaleDraftService {
  constructor(
    private readonly lifecycle: TradeInLifecycleService,
    private readonly settings: SettingsService,
    private readonly outbox: OutboxService,
    private readonly port: ResalePort = wixResalePort,
  ) {}

  async create(instanceId: string, tradeInId: string, actor: Actor): Promise<TradeInDoc> {
    const doc = await this.lifecycle.load(instanceId, tradeInId);
    if (doc.resaleDraftStatus === 'created' && doc.resaleProductId) return doc;
    // Only items the store actually keeps: credit issued (or later closed after credit).
    if (!(doc.status === 'credit_issued' || (doc.status === 'closed' && doc.giftCardStatus === 'issued'))) {
      throw new AppError('invalid_transition', 'item not accepted');
    }
    const { defaultLocale } = await this.settings.get(instanceId);
    const name = createTranslator(defaultLocale)('resale.productName', { title: doc.productTitle }).slice(0, 80);
    const slug = `trade-in-${doc.reference.toLowerCase()}`;
    try {
      // Placeholder price = original product price; the merchant sets the resale price before publishing.
      const productId = await this.port.create({ name, slug, priceMinor: doc.productSnapshot.priceMinor, currency: doc.currency, instanceId });
      const saved = await this.lifecycle.mutate({
        instanceId, tradeInId, actor, eventType: 'resale.created', retries: 2, metadata: { productId },
        change: () => ({ resaleProductId: productId, resaleDraftStatus: 'created' }),
      });
      await this.outbox.enqueue({ instanceId, tradeInId, eventType: 'resale.created', payload: { productId }, dedupeKey: `resale-created:${tradeInId}` });
      return saved;
    } catch (err) {
      if (err instanceof AppError && err.code !== 'internal') throw err;
      const { code } = sanitizeErrorForLog(err);
      await this.lifecycle.mutate({
        instanceId, tradeInId, actor, eventType: 'resale.failed', retries: 2, metadata: { code },
        change: () => ({ resaleDraftStatus: 'failed' }),
      });
      await this.outbox.enqueue({ instanceId, tradeInId, eventType: 'resale.failed', payload: { code }, dedupeKey: `resale-failed:${tradeInId}:${Date.now() >> 16}` });
      throw new AppError('unavailable', `resale draft failed: ${code}`);
    }
  }
}
