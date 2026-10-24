import { AUTO_FOLLOW_UPS, canTransition, isTerminal, TRANSITIONS, type TradeInAction, type TradeInStatus } from '../../lib/lifecycle';
import { COLLECTIONS } from '../collections';
import { AppError } from '../errors';
import type { Repo } from '../repo';
import type { Actor, TradeInDoc, TradeInEventDoc } from '../types';
import type { IdempotencyService } from './IdempotencyService';
import type { OutboxService } from './OutboxService';

// The single place a trade-in's status changes. Guarantees:
//  - instance isolation (a record from another instance is reported as not found)
//  - only transitions in the shared table, by permitted actors, with required reasons
//  - stale/concurrent writes rejected: each (tradeInId, revision) can be claimed once
//  - every change is recorded as an immutable event, then announced via the outbox

export type TransitionRequest = {
  instanceId: string;
  tradeInId: string;
  action: TradeInAction;
  actor: Actor;
  /** When provided (UI actions), the change is rejected if the record moved on since it was loaded. */
  expectedRevision?: number;
  reason?: string;
  /** Field changes applied atomically with the transition (e.g. finalValueMinor). Status/revision are ignored. */
  patch?: Partial<TradeInDoc>;
  idempotencyKey?: string;
};

const PROTECTED_FIELDS = ['_id', 'instanceId', 'status', 'revision', 'reference', 'submissionKey'] as const;

export class TradeInLifecycleService {
  constructor(
    private readonly repo: Repo,
    private readonly idempotency: IdempotencyService,
    private readonly outbox: OutboxService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async load(instanceId: string, tradeInId: string): Promise<TradeInDoc> {
    const doc = await this.repo.get<TradeInDoc>(COLLECTIONS.tradeIns, tradeInId);
    if (!doc || doc.instanceId !== instanceId) throw new AppError('not_found');
    return doc;
  }

  async transition(req: TransitionRequest): Promise<TradeInDoc> {
    if (!req.idempotencyKey) return this.apply(req);
    return this.idempotency.run(
      {
        instanceId: req.instanceId,
        operation: `transition:${req.action}`,
        key: req.idempotencyKey,
        payload: { tradeInId: req.tradeInId, action: req.action, reason: req.reason ?? null, patch: req.patch ?? null },
      },
      () => this.apply(req),
    );
  }

  private async apply(req: TransitionRequest): Promise<TradeInDoc> {
    const current = await this.load(req.instanceId, req.tradeInId);
    if (req.expectedRevision !== undefined && req.expectedRevision !== current.revision) {
      throw new AppError('conflict', 'stale revision');
    }
    const rule = TRANSITIONS[req.action];
    if (!canTransition(req.action, current.status, req.actor.type)) {
      throw new AppError('invalid_transition', `${req.action} not allowed from ${current.status} for ${req.actor.type}`);
    }
    const reason = req.reason?.trim();
    if (rule.requiresReason && !reason) throw new AppError('bad_request', 'reason required', { reason: 'required' });

    // Atomic claim on this exact revision: concurrent requests from the same state can't both win.
    const won = await this.idempotency.lock(req.instanceId, 'transition-lock', `${current._id}:${current.revision}`);
    if (!won) throw new AppError('conflict', 'concurrent transition');

    const path: TradeInStatus[] = [current.status, rule.to];
    const followUp = AUTO_FOLLOW_UPS[rule.to];
    if (followUp) path.push(followUp);
    const finalStatus = path[path.length - 1];

    const patch = { ...(req.patch ?? {}) } as Record<string, unknown>;
    for (const f of PROTECTED_FIELDS) delete patch[f];

    const now = this.now();
    const next: TradeInDoc = {
      ...current,
      ...(patch as Partial<TradeInDoc>),
      status: finalStatus,
      revision: current.revision + 1,
      ...(isTerminal(finalStatus) ? { closedAt: now } : {}),
    };
    const saved = await this.repo.update<TradeInDoc>(COLLECTIONS.tradeIns, next);

    for (let i = 1; i < path.length; i++) {
      await this.repo.insert<TradeInEventDoc>(COLLECTIONS.events, {
        instanceId: req.instanceId,
        tradeInId: current._id,
        eventType: i === 1 ? `action.${req.action}` : 'auto.follow_up',
        fromStatus: path[i - 1],
        toStatus: path[i],
        actorType: i === 1 ? req.actor.type : 'system',
        actorId: i === 1 ? req.actor.id : undefined,
        reason: i === 1 ? reason : undefined,
        idempotencyKey: req.idempotencyKey,
      });
    }

    await this.outbox.enqueue({
      instanceId: req.instanceId,
      eventType: 'trade_in.status_changed',
      tradeInId: current._id,
      payload: { action: req.action, from: current.status, to: finalStatus, path, revision: saved.revision, actorType: req.actor.type },
      dedupeKey: `status:${current._id}:${saved.revision}`,
    });

    return saved;
  }

  /**
   * Non-status change (notes, tracking, gift-card/resale bookkeeping). Uses the same revision
   * lock as transitions so no write path can clobber another. `change` receives the fresh
   * record and returns the patch, or null for "nothing to do". System callers retry on conflict.
   */
  async mutate(req: {
    instanceId: string;
    tradeInId: string;
    actor: Actor;
    eventType: string;
    change: (current: TradeInDoc) => Partial<TradeInDoc> | null;
    expectedRevision?: number;
    metadata?: Record<string, unknown>;
    retries?: number;
  }): Promise<TradeInDoc> {
    const attempts = (req.retries ?? 0) + 1;
    for (let attempt = 1; ; attempt++) {
      const current = await this.load(req.instanceId, req.tradeInId);
      if (req.expectedRevision !== undefined && req.expectedRevision !== current.revision) throw new AppError('conflict', 'stale revision');
      const change = req.change(current);
      if (!change) return current;
      const patch = { ...change } as Record<string, unknown>;
      for (const f of PROTECTED_FIELDS) delete patch[f];

      const won = await this.idempotency.lock(req.instanceId, 'transition-lock', `${current._id}:${current.revision}`);
      if (!won) {
        if (attempt < attempts) continue;
        throw new AppError('conflict', 'concurrent update');
      }
      const saved = await this.repo.update<TradeInDoc>(COLLECTIONS.tradeIns, {
        ...current,
        ...(patch as Partial<TradeInDoc>),
        revision: current.revision + 1,
      });
      await this.recordEvent({
        instanceId: req.instanceId,
        tradeInId: current._id,
        eventType: req.eventType,
        actorType: req.actor.type,
        actorId: req.actor.id,
        metadataSanitized: req.metadata,
      });
      return saved;
    }
  }

  /** Records a non-status event (notes, media, gift-card attempts) on the audit timeline. */
  async recordEvent(e: Omit<TradeInEventDoc, '_id'>): Promise<void> {
    await this.repo.insert<TradeInEventDoc>(COLLECTIONS.events, e);
  }

  async timeline(instanceId: string, tradeInId: string): Promise<TradeInEventDoc[]> {
    const res = await this.repo.find<TradeInEventDoc>(
      COLLECTIONS.events,
      { instanceId, tradeInId },
      { sort: [{ field: '_createdDate', order: 'asc' }], limit: 500 },
    );
    return res.items;
  }
}
