import type { ActorType, TradeInAction, TradeInStatus } from '../../lib/lifecycle';
import type { CustomerNotificationEvent, MerchantNotificationEvent } from '../../lib/schemas/domain';
import type { TradeInDoc } from '../types';
import type { CreditService } from './CreditService';
import type { NotificationService } from './NotificationService';
import type { OutboxDoc, OutboxService } from './OutboxService';
import type { SettingsService } from './SettingsService';
import type { TradeInLifecycleService } from './TradeInLifecycleService';
import type { TradeInMediaService } from './TradeInMediaService';

// Turns committed domain events into side effects. Each handler is idempotent (notifications
// dedupe per event+recipient, credit dedupes per trade-in), so outbox retries and duplicate
// webhook deliveries are safe. Throwing makes the outbox retry with backoff.

const CUSTOMER_ON_ENTER: Partial<Record<TradeInStatus, CustomerNotificationEvent>> = {
  cancelled: 'cancellation',
  approved: 'approved',
  rejected: 'rejected',
  received: 'received',
  revised_offer_pending: 'revised_offer',
  revised_offer_accepted: 'revised_offer_decision',
  revised_offer_declined: 'revised_offer_decision',
};
const MERCHANT_ON_ENTER: Partial<Record<TradeInStatus, MerchantNotificationEvent>> = {
  approved: 'approved',
  rejected: 'rejected',
  received: 'received',
  cancelled: 'cancelled',
  revised_offer_accepted: 'revised_offer_accepted',
  revised_offer_declined: 'revised_offer_declined',
};

type Change = { action?: TradeInAction; actorType?: ActorType; from: TradeInStatus; to: TradeInStatus };

// Statuses whose email depends on how they were reached.
function customerEventFor(c: Change): CustomerNotificationEvent | undefined {
  // Declining a revised offer also enters return_pending; its decision email already covers the return.
  if (c.to === 'return_pending') return c.action === 'reject_after_inspection' ? 'return_started' : undefined;
  // Closing after credit was issued or a rejection needs no email; closing a return confirms it.
  if (c.to === 'closed') return c.from === 'return_pending' ? 'returned' : undefined;
  return CUSTOMER_ON_ENTER[c.to];
}

function merchantEventFor(c: Change): MerchantNotificationEvent | undefined {
  // Staff who mark an item in transit themselves don't need to hear about it.
  if (c.to === 'in_transit') return c.actorType === 'customer' ? 'shipped' : undefined;
  return MERCHANT_ON_ENTER[c.to];
}

type Deps = {
  lifecycle: TradeInLifecycleService;
  settings: SettingsService;
  notifications: NotificationService;
  credit: CreditService;
  media: TradeInMediaService;
  outbox: OutboxService;
};

export class OutboxProcessor {
  constructor(private readonly d: Deps) {}

  handle = async (event: OutboxDoc): Promise<void> => {
    if (!event.tradeInId) return;
    const { instanceId, tradeInId } = event;
    const settings = await this.d.settings.get(instanceId);
    const load = () => this.d.lifecycle.load(instanceId, tradeInId);

    switch (event.eventType) {
      case 'trade_in.submitted': {
        const doc = await load();
        await this.notifyBoth(event, doc, settings, 'submitted', 'submitted');
        return;
      }
      case 'trade_in.status_changed':
      case 'trade_in.status_notify': {
        const path = (event.payload.path as TradeInStatus[] | undefined) ?? [event.payload.to as TradeInStatus];
        const entered = path.slice(1);
        if (event.eventType === 'trade_in.status_changed' && entered.includes('credit_pending')) {
          // Credit issuance gets this whole request's sub-request budget; notifications for the
          // same change run as a follow-up event. Gift card notifications follow from gift_card.*.
          await this.d.credit.issue(instanceId, tradeInId).catch((err) => {
            // Definite failures are recorded and alerted inside CreditService; don't retry those blindly.
            const code = (err as { code?: string })?.code;
            if (code === 'precondition_failed' || code === 'unavailable') return;
            throw err;
          });
          await this.d.outbox.enqueue({ instanceId, tradeInId, eventType: 'trade_in.status_notify', payload: event.payload, dedupeKey: `notify:${event._id}` });
          return;
        }
        const doc = await load();
        const action = event.payload.action as TradeInAction | undefined;
        for (let i = 1; i < path.length; i++) {
          // Only the first step is the actor's; later steps are automatic follow-ups.
          const change: Change = { action: i === 1 ? action : undefined, actorType: i === 1 ? (event.payload.actorType as ActorType | undefined) : 'system', from: path[i - 1], to: path[i] };
          await this.notifyBoth(event, doc, settings, customerEventFor(change), merchantEventFor(change), change.to, change.actorType);
        }
        if (entered.some((s) => s === 'closed' || s === 'cancelled')) {
          await this.d.media.scheduleRetention(instanceId, tradeInId, settings.mediaRetentionDays);
        }
        return;
      }
      case 'gift_card.issued': {
        let doc = await load();
        // Wix's own gift card email carries the code; its outcome (e.g. failed without a premium
        // plan) picks the wording of the notifications below but never blocks the credit. Once
        // claimed it isn't repeated, so an outbox retry doesn't email the code twice.
        if (!doc.giftCardEmailStatus && doc.giftCardId) {
          doc = settings.credit.sendGiftCardEmail
            ? await this.d.credit.emailGiftCard(instanceId, tradeInId, { type: 'system' }, { once: true })
            : await this.d.lifecycle.mutate({
              instanceId, tradeInId, actor: { type: 'system' }, eventType: 'gift_card.email_skipped', retries: 2,
              change: (cur) => (cur.giftCardEmailStatus ? null : { giftCardEmailStatus: 'disabled' }),
            });
        }
        await this.notifyBoth(event, doc, settings, 'credit_issued', 'credit_issued');
        return;
      }
      case 'gift_card.failed': {
        const doc = await load();
        await this.notifyBoth(event, doc, settings, undefined, 'credit_failed');
        return;
      }
      case 'resale.created':
      case 'resale.failed': {
        const doc = await load();
        await this.notifyBoth(event, doc, settings, undefined, event.eventType === 'resale.created' ? 'resale_draft_created' : 'resale_draft_failed');
        return;
      }
      case 'ops.failure': {
        const doc = await load();
        await this.notifyBoth(event, doc, settings, undefined, 'processing_failure');
        return;
      }
      default:
        return;
    }
  };

  private async notifyBoth(
    event: OutboxDoc,
    doc: TradeInDoc,
    settings: Awaited<ReturnType<SettingsService['get']>>,
    customer: CustomerNotificationEvent | undefined,
    merchant: MerchantNotificationEvent | undefined,
    suffix = '',
    actorType?: ActorType,
  ) {
    // eventId is per outbox event (+ status when one event entered several statuses).
    const eventId = suffix ? `${event._id}:${suffix}` : event._id;
    if (customer) await this.d.notifications.notify({ eventId, doc, settings, actorType, target: { kind: 'customer', event: customer } });
    if (merchant) await this.d.notifications.notify({ eventId, doc, settings, actorType, target: { kind: 'merchant', event: merchant } });
  }
}
