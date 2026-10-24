import { COLLECTIONS } from '../collections';
import { sanitizeErrorForLog } from '../errors';
import { DuplicateKeyError, type Doc, type Repo } from '../repo';

// Transactional-outbox style queue. Side effects (emails, alerts) are enqueued only after
// the state change they describe is committed, and are processed with bounded retries.
// dedupeKey is unique per instance, so re-enqueueing the same logical event is a no-op.

export type OutboxEventType = 'trade_in.status_changed' | 'trade_in.status_notify' | 'trade_in.submitted' | 'gift_card.issued' | 'gift_card.failed' | 'resale.created' | 'resale.failed' | 'ops.failure';

export type OutboxDoc = Doc & {
  instanceId: string;
  eventType: OutboxEventType;
  tradeInId?: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'processing' | 'done' | 'dead';
  attemptCount: number;
  nextAttemptAt: Date;
  lastError?: string;
  dedupeKey: string;
  /** Incremented by manual revival so claim keys of the new attempts don't collide with old ones. */
  revivals?: number;
};

export const OUTBOX_MAX_ATTEMPTS = 6;

/** Exponential backoff: 1m, 2m, 4m, 8m, 16m (capped at 1h). */
export function backoffMs(attempt: number): number {
  return Math.min(60 * 60_000, 60_000 * 2 ** Math.max(0, attempt - 1));
}

export type ClaimLock = (instanceId: string, operation: string, key: string) => Promise<boolean>;

export class OutboxService {
  constructor(
    private readonly repo: Repo,
    private readonly now: () => Date = () => new Date(),
    /** Atomic claim (unique-index lock) so concurrent processors never run the same attempt twice. */
    private readonly lock?: ClaimLock,
  ) {}

  async enqueue(e: { instanceId: string; eventType: OutboxEventType; tradeInId?: string; payload: Record<string, unknown>; dedupeKey: string }): Promise<void> {
    try {
      await this.repo.insert<OutboxDoc>(COLLECTIONS.outbox, {
        ...e,
        status: 'pending',
        attemptCount: 0,
        nextAttemptAt: this.now(),
      });
    } catch (err) {
      if (!(err instanceof DuplicateKeyError)) throw err;
    }
  }

  /** Processes one event by ID (used by the outbox item-created webhook). */
  async processOne(eventId: string, handler: (e: OutboxDoc) => Promise<void>): Promise<'done' | 'failed' | 'skipped'> {
    const event = await this.repo.get<OutboxDoc>(COLLECTIONS.outbox, eventId);
    if (!event || event.status !== 'pending' || new Date(event.nextAttemptAt) > this.now()) return 'skipped';
    return this.run(event, handler);
  }

  /** Processes due events with `handler` (retry sweep). */
  async processDue(handler: (e: OutboxDoc) => Promise<void>, opts: { instanceId?: string; limit?: number } = {}) {
    const due = await this.repo.find<OutboxDoc>(
      COLLECTIONS.outbox,
      { status: 'pending', nextAttemptAt: { $lte: this.now() }, instanceId: opts.instanceId },
      { sort: [{ field: 'nextAttemptAt', order: 'asc' }], limit: opts.limit ?? 25 },
    );
    let done = 0;
    let failed = 0;
    for (const event of due.items) {
      const r = await this.run(event, handler);
      if (r === 'done') done++;
      if (r === 'failed') failed++;
    }
    return { done, failed, scanned: due.items.length };
  }

  async dead(instanceId: string, limit = 50): Promise<OutboxDoc[]> {
    return (await this.repo.find<OutboxDoc>(COLLECTIONS.outbox, { instanceId, status: 'dead' }, { sort: [{ field: '_updatedDate', order: 'desc' }], limit })).items;
  }

  /** Manual retry of a dead event from Diagnostics. */
  async revive(instanceId: string, eventId: string): Promise<void> {
    const event = await this.repo.get<OutboxDoc>(COLLECTIONS.outbox, eventId);
    if (!event || event.instanceId !== instanceId || event.status !== 'dead') return;
    await this.repo.update<OutboxDoc>(COLLECTIONS.outbox, { ...event, status: 'pending', attemptCount: 0, revivals: (event.revivals ?? 0) + 1, nextAttemptAt: this.now() });
  }

  private async run(event: OutboxDoc, handler: (e: OutboxDoc) => Promise<void>): Promise<'done' | 'failed' | 'skipped'> {
    const attempt = event.attemptCount + 1;
    if (this.lock && !(await this.lock(event.instanceId, 'outbox-claim', `${event._id}:${event.revivals ?? 0}:${attempt}`))) return 'skipped';
    const claimed = await this.repo.update<OutboxDoc>(COLLECTIONS.outbox, { ...event, status: 'processing', attemptCount: attempt });
    try {
      await handler(claimed);
      await this.repo.update<OutboxDoc>(COLLECTIONS.outbox, { ...claimed, status: 'done', lastError: undefined });
      return 'done';
    } catch (err) {
      const { code } = sanitizeErrorForLog(err);
      const dead = attempt >= OUTBOX_MAX_ATTEMPTS;
      await this.repo.update<OutboxDoc>(COLLECTIONS.outbox, {
        ...claimed,
        status: dead ? 'dead' : 'pending',
        lastError: code,
        nextAttemptAt: new Date(this.now().getTime() + backoffMs(attempt)),
      });
      // Alert the merchant once per failed job (ops.failure itself never re-alerts).
      if (dead && event.eventType !== 'ops.failure') {
        await this.enqueue({ instanceId: event.instanceId, eventType: 'ops.failure', tradeInId: event.tradeInId, payload: { failedEventType: event.eventType, code }, dedupeKey: `ops-failure:${event._id}` }).catch(() => undefined);
      }
      return 'failed';
    }
  }
}
