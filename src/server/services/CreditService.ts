import { toDecimalString } from '../../lib/money';
import { AppError } from '../errors';
import type { Actor, TradeInDoc } from '../types';
import type { OutboxService } from './OutboxService';
import type { SettingsService } from './SettingsService';
import type { TradeInLifecycleService } from './TradeInLifecycleService';
import { GiftCardError, type WixGiftCardsService } from './WixGiftCardsService';

// Issues store credit for a trade-in in `credit_pending`, at most once:
//  - the gift card idempotency key is derived from the trade-in ID, so every retry (automatic,
//    manual "reconcile", or after a crash between creating the card and saving its ID) resolves
//    to the same Wix gift card;
//  - the ID is saved in the same revision-locked write that moves the trade-in to credit_issued.

export type GiftCardsPort = Pick<WixGiftCardsService, 'issue' | 'exists'>;

export class CreditService {
  constructor(
    private readonly lifecycle: TradeInLifecycleService,
    private readonly giftCards: GiftCardsPort,
    private readonly settings: SettingsService,
    private readonly outbox: OutboxService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  static idempotencyKeyFor(tradeInId: string): string {
    return `trade-in-credit-${tradeInId}`;
  }

  async issue(instanceId: string, tradeInId: string, actor: Actor = { type: 'system' }): Promise<TradeInDoc> {
    const doc = await this.lifecycle.load(instanceId, tradeInId);
    if (doc.status === 'credit_issued' || doc.giftCardStatus === 'issued') return doc; // already done
    if (doc.status !== 'credit_pending') throw new AppError('invalid_transition', `credit not pending (${doc.status})`);
    const amountMinor = doc.finalValueMinor;
    if (!amountMinor || amountMinor <= 0) throw new AppError('precondition_failed', 'no final value');

    const settings = await this.settings.get(instanceId);
    const expirationDate = settings.credit.expiryMonths ? addMonths(this.now(), settings.credit.expiryMonths) : undefined;
    const key = doc.giftCardIdempotencyKey ?? CreditService.idempotencyKeyFor(doc._id);

    try {
      const card = await this.giftCards.issue({ amount: toDecimalString(amountMinor, doc.currency), currency: doc.currency, idempotencyKey: key, expirationDate });
      const saved = await this.lifecycle.transition({
        instanceId,
        tradeInId,
        action: 'mark_credit_issued',
        actor: { type: 'system' },
        patch: { giftCardId: card.giftCardId, giftCardStatus: 'issued', giftCardIssuedAt: this.now(), giftCardIdempotencyKey: key },
      });
      await this.outbox.enqueue({
        instanceId, eventType: 'gift_card.issued', tradeInId,
        payload: { giftCardId: card.giftCardId, actorType: actor.type }, dedupeKey: `gift-card-issued:${tradeInId}`,
      });
      return saved;
    } catch (err) {
      if (!(err instanceof GiftCardError)) throw err;
      // Unknown outcome → reconcile (retry with the same key is safe); definite failure → failed.
      const status = err.kind === 'unknown' ? 'reconcile_required' : 'failed';
      await this.lifecycle.mutate({
        instanceId, tradeInId, actor: { type: 'system' }, eventType: 'credit.failed', retries: 2,
        metadata: { kind: err.kind, code: err.code },
        change: () => ({ giftCardStatus: status, giftCardIdempotencyKey: key }),
      });
      await this.outbox.enqueue({
        instanceId, eventType: 'gift_card.failed', tradeInId,
        payload: { kind: err.kind, code: err.code }, dedupeKey: `gift-card-failed:${tradeInId}:${this.now().toISOString().slice(0, 13)}`,
      });
      throw new AppError(err.kind === 'not_available' ? 'unavailable' : 'precondition_failed', `gift card ${err.kind}: ${err.code}`);
    }
  }
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}
