import { AccessTokenService } from './services/AuthorizationService';
import { AriaToolsService } from './services/AriaToolsService';
import { ReportingService } from './services/ReportingService';
import { ResaleDraftService } from './services/ResaleDraftService';
import { CreditService } from './services/CreditService';
import { NotificationService } from './services/NotificationService';
import { OutboxProcessor } from './services/OutboxProcessor';
import { WixEmailTransmissionsService } from './services/WixEmailTransmissionsService';
import { WixGiftCardsService } from './services/WixGiftCardsService';
import { IdempotencyService } from './services/IdempotencyService';
import { MerchantService } from './services/MerchantService';
import { OutboxService } from './services/OutboxService';
import { RulesService } from './services/RulesService';
import { SettingsService } from './services/SettingsService';
import { TradeInLifecycleService } from './services/TradeInLifecycleService';
import { TradeInMediaService } from './services/TradeInMediaService';
import { TradeInService } from './services/TradeInService';
import { getCatalogVersion, WixCatalogService } from './services/WixCatalogService';
import { WixMediaService } from './services/WixMediaService';
import { WixOrdersService } from './services/WixOrdersService';
import { wixDataRepo } from './wixDataRepo';

// Production wiring. Services are stateless apart from small caches, so module singletons are fine.

const repo = wixDataRepo;
export const idempotency = new IdempotencyService(repo);
export const outbox = new OutboxService(repo, () => new Date(), (i, op, k) => idempotency.lock(i, op, k));
export const settings = new SettingsService(repo);
export const rules = new RulesService(repo);
export const tokens = new AccessTokenService(repo);
export const wixMedia = new WixMediaService();
export const media = new TradeInMediaService(repo, wixMedia);
export const lifecycle = new TradeInLifecycleService(repo, idempotency, outbox);
export const catalog = new WixCatalogService();
export const orders = new WixOrdersService();
export const tradeIns = new TradeInService({ repo, catalog, orders, rules, settings, media, lifecycle, idempotency, outbox, tokens });
export const giftCards = new WixGiftCardsService();
export const emails = new WixEmailTransmissionsService();
export const credit = new CreditService(lifecycle, giftCards, settings, outbox);
export const notifications = new NotificationService(repo, emails, tokens);
export const processor = new OutboxProcessor({ lifecycle, settings, notifications, credit, media, giftCards, outbox });
export const merchant = new MerchantService({ repo, lifecycle, media, rules, settings, catalogVersion: getCatalogVersion, giftCardsAvailable: () => giftCards.available() });
export const resale = new ResaleDraftService(lifecycle, settings, outbox);
export const reporting = new ReportingService(repo);
export const aria = new AriaToolsService({ repo, merchant, credit, resale, reporting, rules, settings });
export { repo };

const disconnectedCache = new Map<string, { value: boolean; at: number }>();

/** Uninstalled/disconnected instances stop all processing. Cached briefly to avoid a read per request. */
export async function isInstanceDisconnected(instanceId: string): Promise<boolean> {
  const hit = disconnectedCache.get(instanceId);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;
  const value = await settings.isDisconnected(instanceId);
  disconnectedCache.set(instanceId, { value, at: Date.now() });
  return value;
}
