import { createTranslator } from '../../lib/i18n';
import type { CustomerNotificationEvent, MerchantNotificationEvent, Settings } from '../../lib/schemas/domain';
import { COLLECTIONS } from '../collections';
import { sha256Hex } from '../crypto';
import { sanitizeErrorForLog } from '../errors';
import { DuplicateKeyError, type Doc, type Repo } from '../repo';
import type { TradeInDoc } from '../types';
import type { AccessTokenService } from './AuthorizationService';
import { customerEmail, merchantEmail } from './email-templates';
import { EmailSendError, type EmailRecipient, type TransmissionState, type WixEmailTransmissionsService } from './WixEmailTransmissionsService';

// Sends transactional emails for committed trade-in events through Wix Email Transmissions.
// One record per (event, recipient type) — guarded by a unique index — gives dedupe across
// repeated webhooks and outbox retries, and is the dashboard's delivery log.

export type NotificationStatus = 'pending' | 'accepted' | 'in_progress' | 'processed' | 'partially_failed' | 'rejected' | 'failed' | 'skipped';

export type NotificationDoc = Doc & {
  instanceId: string;
  tradeInId?: string;
  eventId: string;
  eventType: string;
  recipientType: 'customer' | 'merchant';
  recipientHash: string;
  providerTransmissionId?: string;
  status: NotificationStatus;
  attemptCount: number;
  lastErrorCode?: string;
  recipientFailures?: { reasons: string[] };
  sentAt?: Date;
};

type Target =
  | { kind: 'customer'; event: CustomerNotificationEvent }
  | { kind: 'merchant'; event: MerchantNotificationEvent };

export class NotificationService {
  constructor(
    private readonly repo: Repo,
    private readonly email: Pick<WixEmailTransmissionsService, 'send' | 'get'>,
    private readonly tokens: AccessTokenService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Sends one notification for an outbox event. Throws on retryable failures so the outbox
   * retries with backoff; definite failures are recorded and not retried.
   */
  async notify(p: { eventId: string; doc: TradeInDoc; settings: Settings; target: Target }): Promise<NotificationStatus> {
    const { doc, settings, target } = p;
    const prefs = target.kind === 'customer' ? settings.notifications.customer : settings.notifications.merchant;
    const enabled = (prefs as Record<string, boolean>)[target.event] !== false;

    const recipients: EmailRecipient[] =
      target.kind === 'customer'
        ? [{ emailAddress: doc.customerEmail, name: doc.customerName }]
        : settings.notifications.staffUserIds.map((userId) => ({ userId }));
    const recipientHash = (await sha256Hex(JSON.stringify(recipients))).slice(0, 32);

    let record: NotificationDoc;
    try {
      record = await this.repo.insert<NotificationDoc>(COLLECTIONS.notifications, {
        instanceId: doc.instanceId, tradeInId: doc._id, eventId: p.eventId, eventType: `${target.kind}.${target.event}`,
        recipientType: target.kind, recipientHash, status: 'pending', attemptCount: 0,
      });
    } catch (err) {
      if (!(err instanceof DuplicateKeyError)) throw err;
      const existing = (await this.repo.find<NotificationDoc>(COLLECTIONS.notifications, { instanceId: doc.instanceId, eventId: p.eventId, recipientType: target.kind }, { limit: 1 })).items[0];
      if (!existing) throw err;
      // Already sent (or deliberately skipped/rejected): repeated delivery of the same event is a no-op.
      if (existing.status !== 'pending' && existing.status !== 'failed') return existing.status;
      record = existing;
    }

    if (!enabled || recipients.length === 0) {
      await this.repo.update<NotificationDoc>(COLLECTIONS.notifications, { ...record, status: 'skipped', lastErrorCode: enabled ? 'NO_RECIPIENTS' : 'DISABLED' });
      return 'skipped';
    }

    const locale = target.kind === 'customer' ? doc.locale || settings.defaultLocale : settings.defaultLocale;
    const storeName = settings.notifications.senderName || createTranslator(locale)('email.storeFallback');
    let content;
    if (target.kind === 'customer') {
      const statusUrl = settings.pages.statusPageUrl
        ? withToken(settings.pages.statusPageUrl, await this.tokens.mint(doc.instanceId, doc._id, `email:${target.event}`))
        : undefined;
      content = customerEmail(target.event, { doc, locale, storeName, statusUrl });
    } else {
      content = merchantEmail(target.event, { doc, locale, storeName });
    }

    const attemptCount = record.attemptCount + 1;
    try {
      const state = await this.email.send({
        to: recipients,
        subject: content.subject,
        html: content.html,
        senderName: settings.notifications.senderName,
        replyTo: target.kind === 'customer' ? settings.notifications.replyToEmail || undefined : undefined,
        // Same seed on every retry of this logical notification → Wix dedupes the send.
        idempotencySeed: `notification:${record._id}`,
        metadata: { notificationId: record._id, instanceId: doc.instanceId },
      });
      const status = statusFrom(state);
      await this.repo.update<NotificationDoc>(COLLECTIONS.notifications, {
        ...record, attemptCount, status, providerTransmissionId: state.id, sentAt: this.now(),
        recipientFailures: state.failures.length ? { reasons: state.failures.map((f) => f.reason) } : undefined, lastErrorCode: undefined,
      });
      return status;
    } catch (err) {
      const code = err instanceof EmailSendError ? err.code : sanitizeErrorForLog(err).code;
      const retryable = err instanceof EmailSendError ? err.retryable : true;
      await this.repo.update<NotificationDoc>(COLLECTIONS.notifications, { ...record, attemptCount, status: 'failed', lastErrorCode: code });
      if (retryable) throw err;
      return 'failed';
    }
  }

  /** Applies an asynchronous status update (event or poll) to the matching notification. */
  async applyTransmissionState(notificationId: string, state: TransmissionState): Promise<void> {
    const record = await this.repo.get<NotificationDoc>(COLLECTIONS.notifications, notificationId);
    if (!record || (record.providerTransmissionId && record.providerTransmissionId !== state.id)) return;
    const status = statusFrom(state);
    if (status === record.status) return;
    await this.repo.update<NotificationDoc>(COLLECTIONS.notifications, {
      ...record, status, recipientFailures: state.failures.length ? { reasons: state.failures.map((f) => f.reason) } : undefined,
    });
  }

  /** Polls transmissions that are still in flight (fallback when status events are missed). */
  async pollInFlight(instanceId: string, limit = 3): Promise<number> {
    const stale = new Date(this.now().getTime() - 5 * 60_000);
    const res = await this.repo.find<NotificationDoc>(COLLECTIONS.notifications, { instanceId, status: { $in: ['accepted', 'in_progress'] }, _createdDate: { $lt: stale } }, { limit });
    for (const n of res.items) {
      if (!n.providerTransmissionId) continue;
      const state = await this.email.get(n.providerTransmissionId);
      if (state) await this.applyTransmissionState(n._id, state);
    }
    return res.items.length;
  }

  async history(instanceId: string, opts: { tradeInId?: string; limit?: number } = {}) {
    const res = await this.repo.find<NotificationDoc>(
      COLLECTIONS.notifications,
      { instanceId, tradeInId: opts.tradeInId },
      { sort: [{ field: '_createdDate', order: 'desc' }], limit: opts.limit ?? 50 },
    );
    return res.items.map((n) => ({
      id: n._id, tradeInId: n.tradeInId, eventType: n.eventType, recipientType: n.recipientType, status: n.status,
      attemptCount: n.attemptCount, lastErrorCode: n.lastErrorCode, failures: n.recipientFailures?.reasons ?? [],
      createdAt: n._createdDate ? new Date(n._createdDate).toISOString() : '', sentAt: n.sentAt ? new Date(n.sentAt).toISOString() : undefined,
    }));
  }
}

function statusFrom(state: TransmissionState): NotificationStatus {
  switch (state.status) {
    case 'REJECTED': return 'rejected';
    case 'PROCESSED': return state.failures.length ? 'partially_failed' : 'processed';
    case 'IN_PROGRESS': return 'in_progress';
    default: return 'accepted';
  }
}

function withToken(pageUrl: string, token: string): string {
  const url = new URL(pageUrl);
  url.searchParams.set('ti', token);
  return url.toString();
}
