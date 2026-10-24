import { COLLECTIONS } from '../collections';
import { sha256Hex, stableStringify } from '../crypto';
import { AppError } from '../errors';
import { DuplicateKeyError, type Doc, type Repo } from '../repo';

// Built on the unique index (instanceId, operation, key) of `idempotency-records`.
//  - `run`  : at-most-once execution of an operation for a client/system idempotency key,
//             replaying the stored result on retries with the same payload.
//  - `lock` : an atomic, permanent claim (e.g. "transition trade-in X from revision 7").

export type IdempotencyRecord = Doc & {
  instanceId: string;
  key: string;
  operation: string;
  payloadHash: string;
  status: 'in_progress' | 'completed' | 'failed';
  attemptCount: number;
  resultRef?: unknown;
  lockedUntil?: Date;
};

const LEASE_MS = 60_000;

export class IdempotencyService {
  constructor(
    private readonly repo: Repo,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async run<T>(params: { instanceId: string; operation: string; key: string; payload: unknown }, fn: () => Promise<T>): Promise<T> {
    const { instanceId, operation, key } = params;
    const payloadHash = await sha256Hex(stableStringify(params.payload));
    const leaseUntil = new Date(this.now().getTime() + LEASE_MS);

    let record: IdempotencyRecord;
    try {
      record = await this.repo.insert<IdempotencyRecord>(COLLECTIONS.idempotency, {
        instanceId, key, operation, payloadHash, status: 'in_progress', attemptCount: 1, lockedUntil: leaseUntil,
      });
    } catch (err) {
      if (!(err instanceof DuplicateKeyError)) throw err;
      const existing = await this.find(instanceId, operation, key);
      if (!existing) throw new AppError('conflict', 'idempotency record vanished');
      if (existing.payloadHash !== payloadHash) throw new AppError('conflict', 'idempotency key reused with a different payload');
      if (existing.status === 'completed') return existing.resultRef as T;
      if (existing.status === 'in_progress' && existing.lockedUntil && new Date(existing.lockedUntil) > this.now()) {
        throw new AppError('conflict', 'operation already in progress');
      }
      // Failed, or a stale lease from a crashed attempt: take over and retry.
      record = await this.repo.update<IdempotencyRecord>(COLLECTIONS.idempotency, {
        ...existing, status: 'in_progress', attemptCount: existing.attemptCount + 1, lockedUntil: leaseUntil,
      });
    }

    try {
      const result = await fn();
      await this.repo.update<IdempotencyRecord>(COLLECTIONS.idempotency, {
        ...record, status: 'completed', resultRef: toStorable(result), lockedUntil: undefined,
      });
      return result;
    } catch (err) {
      await this.repo
        .update<IdempotencyRecord>(COLLECTIONS.idempotency, { ...record, status: 'failed', lockedUntil: undefined })
        .catch(() => undefined);
      throw err;
    }
  }

  /** Returns true if this caller won the claim, false if it was already taken. */
  async lock(instanceId: string, operation: string, key: string): Promise<boolean> {
    try {
      await this.repo.insert<IdempotencyRecord>(COLLECTIONS.idempotency, {
        instanceId, key, operation, payloadHash: '', status: 'completed', attemptCount: 1,
      });
      return true;
    } catch (err) {
      if (err instanceof DuplicateKeyError) return false;
      throw err;
    }
  }

  async find(instanceId: string, operation: string, key: string): Promise<IdempotencyRecord | undefined> {
    const res = await this.repo.find<IdempotencyRecord>(COLLECTIONS.idempotency, { instanceId, operation, key }, { limit: 1 });
    return res.items[0];
  }
}

function toStorable(value: unknown): unknown {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}
