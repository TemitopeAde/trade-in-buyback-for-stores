import { beforeEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/lib/schemas/domain';
import { COLLECTIONS } from '../../src/server/collections';
import { AccessTokenService } from '../../src/server/services/AuthorizationService';
import { CreditService } from '../../src/server/services/CreditService';
import { IdempotencyService } from '../../src/server/services/IdempotencyService';
import { NotificationService, type NotificationDoc } from '../../src/server/services/NotificationService';
import { OutboxProcessor } from '../../src/server/services/OutboxProcessor';
import { OutboxService, type OutboxDoc } from '../../src/server/services/OutboxService';
import { SettingsService } from '../../src/server/services/SettingsService';
import { TradeInLifecycleService } from '../../src/server/services/TradeInLifecycleService';
import { TradeInMediaService } from '../../src/server/services/TradeInMediaService';
import { GiftCardError } from '../../src/server/services/WixGiftCardsService';
import { EmailSendError, idempotencyUuid, type TransmissionState } from '../../src/server/services/WixEmailTransmissionsService';
import type { WixMediaService } from '../../src/server/services/WixMediaService';
import type { TradeInDoc } from '../../src/server/types';
import { MemoryRepo } from '../support/memoryRepo';

const I = 'inst-1';

/** Fake Wix Gift Cards honoring idempotency keys like the real API. */
class FakeGiftCards {
  cards = new Map<string, { id: string; amount: string; currency: string }>();
  calls: string[] = [];
  failWith?: GiftCardError;
  failAfterCreate = false;
  emails: string[] = [];
  async issue(p: { amount: string; currency: string; idempotencyKey: string }) {
    this.calls.push(p.idempotencyKey);
    if (this.failWith) throw this.failWith;
    let card = this.cards.get(p.idempotencyKey);
    if (!card) {
      card = { id: `gc-${this.cards.size + 1}`, amount: p.amount, currency: p.currency };
      this.cards.set(p.idempotencyKey, card);
    }
    if (this.failAfterCreate) {
      this.failAfterCreate = false;
      throw new GiftCardError('unknown', 'TIMEOUT'); // created at Wix, response lost
    }
    return { giftCardId: card.id, amount: card.amount, currency: card.currency };
  }
  async exists(id: string) { return [...this.cards.values()].some((c) => c.id === id); }
  async sendEmail(id: string, email: string) { this.emails.push(`${id}:${email}`); }
}

class FakeEmail {
  sent: { seed: string; subject: string; html: string; to: unknown[] }[] = [];
  next: (() => TransmissionState | never)[] = [];
  async send(p: { idempotencySeed: string; subject: string; html: string; to: unknown[] }) {
    const step = this.next.shift();
    if (step) return step();
    this.sent.push({ seed: p.idempotencySeed, subject: p.subject, html: p.html, to: p.to });
    return { id: `tx-${this.sent.length}`, status: 'ACCEPTED' as const, failures: [] };
  }
  async get() { return undefined; }
}

function setup() {
  const repo = new MemoryRepo();
  const idempotency = new IdempotencyService(repo);
  const outbox = new OutboxService(repo, () => new Date(), (i, op, k) => idempotency.lock(i, op, k));
  const lifecycle = new TradeInLifecycleService(repo, idempotency, outbox);
  const settings = new SettingsService(repo);
  const gift = new FakeGiftCards();
  const email = new FakeEmail();
  const credit = new CreditService(lifecycle, gift, settings, outbox);
  const notifications = new NotificationService(repo, email, new AccessTokenService(repo));
  const processor = new OutboxProcessor({ lifecycle, settings, notifications, credit, media: new TradeInMediaService(repo, {} as WixMediaService), giftCards: gift, outbox });
  return { repo, outbox, lifecycle, settings, gift, email, credit, notifications, processor };
}

async function seed(repo: MemoryRepo, over: Partial<TradeInDoc> = {}) {
  return repo.insert<TradeInDoc>(COLLECTIONS.tradeIns, {
    instanceId: I, reference: 'TI-AAAA-BBBB', status: 'credit_pending', revision: 1, estimatedValueMinor: 5000, finalValueMinor: 4500, currency: 'USD',
    customerName: 'Ana', customerEmail: 'ana@example.com', productTitle: 'Phone <X>', handoffMethod: 'drop_off', internalNotes: [], locale: 'en',
    giftCardStatus: 'not_started', resaleDraftStatus: 'not_started', conditionAnswers: {}, offerBreakdown: {},
    ...over,
  } as unknown as TradeInDoc);
}

describe('CreditService', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => { s = setup(); });

  it('issues exactly one gift card for the final value and moves to credit_issued', async () => {
    const doc = await seed(s.repo);
    const out = await s.credit.issue(I, doc._id);
    expect(out).toMatchObject({ status: 'credit_issued', giftCardStatus: 'issued', giftCardId: 'gc-1' });
    expect([...s.gift.cards.values()][0].amount).toBe('45.00');
    await s.credit.issue(I, doc._id); // repeat is a no-op
    expect(s.gift.calls).toHaveLength(1);
    expect(s.repo.all<OutboxDoc>(COLLECTIONS.outbox).map((e) => e.eventType)).toContain('gift_card.issued');
  });

  it('reconciles after a lost response without issuing duplicate credit', async () => {
    const doc = await seed(s.repo);
    s.gift.failAfterCreate = true;
    await expect(s.credit.issue(I, doc._id)).rejects.toBeTruthy();
    expect((await s.repo.get<TradeInDoc>(COLLECTIONS.tradeIns, doc._id))!).toMatchObject({ status: 'credit_pending', giftCardStatus: 'reconcile_required' });
    const out = await s.credit.issue(I, doc._id);
    expect(out.giftCardId).toBe('gc-1');
    expect(s.gift.cards.size).toBe(1);
    expect(new Set(s.gift.calls).size).toBe(1); // same idempotency key every time
  });

  it('records definite failures and alerts the merchant', async () => {
    const doc = await seed(s.repo);
    s.gift.failWith = new GiftCardError('not_available', 'APP_NOT_INSTALLED');
    await expect(s.credit.issue(I, doc._id)).rejects.toMatchObject({ code: 'unavailable' });
    expect((await s.repo.get<TradeInDoc>(COLLECTIONS.tradeIns, doc._id))!.giftCardStatus).toBe('failed');
    expect(s.repo.all<OutboxDoc>(COLLECTIONS.outbox).map((e) => e.eventType)).toContain('gift_card.failed');
  });

  it('refuses to issue credit outside credit_pending', async () => {
    const doc = await seed(s.repo, { status: 'inspection' });
    await expect(s.credit.issue(I, doc._id)).rejects.toMatchObject({ code: 'invalid_transition' });
    expect(s.gift.calls).toHaveLength(0);
  });
});

describe('NotificationService', () => {
  let s: ReturnType<typeof setup>;
  const settings = () => {
    const st = defaultSettings();
    st.notifications.staffUserIds = ['owner-user'];
    st.pages.statusPageUrl = 'https://shop.example.com/status';
    return st;
  };
  beforeEach(() => { s = setup(); });

  it('sends once per event and recipient, even when the event is delivered twice', async () => {
    const doc = await seed(s.repo, { status: 'approved' });
    const target = { kind: 'customer' as const, event: 'approved' as const };
    await s.notifications.notify({ eventId: 'e1', doc, settings: settings(), target });
    await s.notifications.notify({ eventId: 'e1', doc, settings: settings(), target });
    expect(s.email.sent).toHaveLength(1);
    const html = s.email.sent[0].html;
    expect(html).toContain('Phone &lt;X&gt;'); // escaped
    expect(html).toMatch(/https:\/\/shop\.example\.com\/status\?ti=[A-Za-z0-9_-]+/);
  });

  it('respects preferences and missing recipients', async () => {
    const doc = await seed(s.repo);
    const st = settings();
    st.notifications.customer.approved = false;
    st.notifications.staffUserIds = [];
    expect(await s.notifications.notify({ eventId: 'e2', doc, settings: st, target: { kind: 'customer', event: 'approved' } })).toBe('skipped');
    expect(await s.notifications.notify({ eventId: 'e2', doc, settings: st, target: { kind: 'merchant', event: 'submitted' } })).toBe('skipped');
    expect(s.email.sent).toHaveLength(0);
  });

  it('retries retryable failures with the same idempotency seed and records rejections', async () => {
    const doc = await seed(s.repo);
    s.email.next.push(() => { throw new EmailSendError('UNAVAILABLE', true); });
    const target = { kind: 'merchant' as const, event: 'submitted' as const };
    await expect(s.notifications.notify({ eventId: 'e3', doc, settings: settings(), target })).rejects.toBeInstanceOf(EmailSendError);
    await s.notifications.notify({ eventId: 'e3', doc, settings: settings(), target });
    const rec = s.repo.all<NotificationDoc>(COLLECTIONS.notifications)[0];
    expect(rec).toMatchObject({ status: 'accepted', attemptCount: 2 });
    expect(s.email.sent[0].seed).toBe(`notification:${rec._id}`);

    s.email.next.push(() => ({ id: 'tx-r', status: 'REJECTED', failures: [] }));
    expect(await s.notifications.notify({ eventId: 'e4', doc, settings: settings(), target })).toBe('rejected');
  });

  it('applies asynchronous delivery status including per-recipient failures', async () => {
    const doc = await seed(s.repo);
    await s.notifications.notify({ eventId: 'e5', doc, settings: settings(), target: { kind: 'customer', event: 'submitted' } });
    const rec = s.repo.all<NotificationDoc>(COLLECTIONS.notifications)[0];
    await s.notifications.applyTransmissionState(rec._id, { id: rec.providerTransmissionId!, status: 'PROCESSED', failures: [{ reason: 'EMAIL_ADDRESS_BOUNCED' }] });
    expect((await s.repo.get<NotificationDoc>(COLLECTIONS.notifications, rec._id))!).toMatchObject({ status: 'partially_failed', recipientFailures: { reasons: ['EMAIL_ADDRESS_BOUNCED'] } });
  });

  it('derives stable UUID idempotency keys', async () => {
    const a = await idempotencyUuid('x');
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await idempotencyUuid('x')).toBe(a);
  });
});

describe('OutboxProcessor', () => {
  it('issues credit on entering credit_pending, then notifies in a follow-up event', async () => {
    const s = setup();
    await s.settings.save(I, { ...defaultSettings(), notifications: { ...defaultSettings().notifications, staffUserIds: ['owner-user'] } });
    const doc = await seed(s.repo, { status: 'inspection' });
    await s.lifecycle.transition({ instanceId: I, tradeInId: doc._id, action: 'confirm_value', actor: { type: 'merchant', id: 'u' }, patch: { finalValueMinor: 4500 } });
    // Drain the queue like the webhook would, one event per invocation.
    for (let i = 0; i < 10; i++) await s.outbox.processDue(s.processor.handle, { limit: 1 });
    const final = (await s.repo.get<TradeInDoc>(COLLECTIONS.tradeIns, doc._id))!;
    expect(final.status).toBe('credit_issued');
    expect(s.gift.emails).toEqual(['gc-1:ana@example.com']);
    const types = s.repo.all<NotificationDoc>(COLLECTIONS.notifications).map((n) => n.eventType).sort();
    expect(types).toEqual(['customer.credit_issued', 'merchant.credit_issued']);
    expect(s.repo.all<OutboxDoc>(COLLECTIONS.outbox).every((e) => e.status === 'done')).toBe(true);
  });

  it('never runs the same outbox attempt twice under concurrent processors', async () => {
    const s = setup();
    const doc = await seed(s.repo, { status: 'submitted' });
    await s.outbox.enqueue({ instanceId: I, eventType: 'trade_in.submitted', tradeInId: doc._id, payload: {}, dedupeKey: 'x' });
    let runs = 0;
    const handler = async () => { runs++; };
    const id = s.repo.all<OutboxDoc>(COLLECTIONS.outbox)[0]._id;
    await Promise.all([s.outbox.processOne(id, handler), s.outbox.processOne(id, handler), s.outbox.processDue(handler)]);
    expect(runs).toBe(1);
  });
});

describe('repeated processing failures', () => {
  it('alerts the merchant once when a job exhausts its retries', async () => {
    const s = setup();
    await s.settings.save(I, { ...defaultSettings(), notifications: { ...defaultSettings().notifications, staffUserIds: ['owner-user'] } });
    const doc = await seed(s.repo, { status: 'submitted' });
    await s.outbox.enqueue({ instanceId: I, eventType: 'resale.created', tradeInId: doc._id, payload: {}, dedupeKey: 'boom' });
    const failing = async (e: OutboxDoc) => { if (e.eventType !== 'ops.failure') throw new Error('boom'); return s.processor.handle(e); };
    const ev = s.repo.all<OutboxDoc>(COLLECTIONS.outbox)[0];
    for (let i = 0; i < 6; i++) {
      const cur = (await s.repo.get<OutboxDoc>(COLLECTIONS.outbox, ev._id))!;
      await s.repo.update(COLLECTIONS.outbox, { ...cur, nextAttemptAt: new Date(0) });
      await s.outbox.processOne(ev._id, failing);
    }
    expect((await s.repo.get<OutboxDoc>(COLLECTIONS.outbox, ev._id))!.status).toBe('dead');
    await s.outbox.processDue(failing);
    const alerts = s.repo.all<NotificationDoc>(COLLECTIONS.notifications).filter((n) => n.eventType === 'merchant.processing_failure');
    expect(alerts).toHaveLength(1);
  });
});
