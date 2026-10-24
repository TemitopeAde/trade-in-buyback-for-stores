import { COLLECTIONS } from '../../src/server/collections';
import { DuplicateKeyError, type Condition, type Doc, type FindOptions, type Repo, type Where } from '../../src/server/repo';

// Test-only Repo. Mirrors the unique indexes declared in the data-collection extensions so
// lock/dedupe behavior matches production.
const UNIQUE: Record<string, string[][]> = {
  [COLLECTIONS.tradeIns]: [['instanceId', 'reference']],
  [COLLECTIONS.settings]: [['instanceId']],
  [COLLECTIONS.notifications]: [['instanceId', 'eventId', 'recipientType']],
  [COLLECTIONS.idempotency]: [['instanceId', 'operation', 'key']],
  [COLLECTIONS.outbox]: [['instanceId', 'dedupeKey']],
  [COLLECTIONS.accessTokens]: [['tokenHash']],
};

function matches(value: unknown, cond: Condition): boolean {
  const cmp = (v: unknown) => (v instanceof Date ? v.getTime() : v) as number | string;
  if (cond instanceof Date || typeof cond !== 'object') return cmp(value) === cmp(cond);
  if ('$in' in cond) return cond.$in.map(cmp).includes(cmp(value));
  if ('$between' in cond) return value != null && cmp(value) >= cmp(cond.$between[0]) && cmp(value) < cmp(cond.$between[1]);
  if ('$gt' in cond) return value != null && cmp(value) > cmp(cond.$gt);
  if ('$gte' in cond) return value != null && cmp(value) >= cmp(cond.$gte);
  if ('$lt' in cond) return value != null && cmp(value) < cmp(cond.$lt);
  if ('$lte' in cond) return value != null && cmp(value) <= cmp(cond.$lte);
  if ('$ne' in cond) return cmp(value) !== cmp(cond.$ne);
  if ('$contains' in cond) return typeof value === 'string' && value.toLowerCase().includes(cond.$contains.toLowerCase());
  if ('$exists' in cond) return cond.$exists ? value != null && value !== '' : value == null || value === '';
  return false;
}

export class MemoryRepo implements Repo {
  readonly data = new Map<string, Map<string, Doc>>();
  private seq = 0;
  private clock = 0;
  failNext?: { op: 'insert' | 'update'; collection?: string; error: Error };

  private coll(name: string) {
    if (!this.data.has(name)) this.data.set(name, new Map());
    return this.data.get(name)!;
  }

  private maybeFail(op: 'insert' | 'update', collection: string) {
    if (this.failNext && this.failNext.op === op && (!this.failNext.collection || this.failNext.collection === collection)) {
      const { error } = this.failNext;
      this.failNext = undefined;
      throw error;
    }
  }

  all<T extends Doc>(collection: string): T[] {
    return [...this.coll(collection).values()].map((d) => structuredClone(d) as T);
  }

  async get<T extends Doc>(collection: string, id: string) {
    const d = this.coll(collection).get(id);
    return d ? (structuredClone(d) as T) : null;
  }

  async find<T extends Doc>(collection: string, where: Where, opts: FindOptions = {}) {
    const all = (d: Doc, w: Record<string, Condition | undefined>) => Object.entries(w).every(([k, c]) => k === '$or' || c === undefined || matches(d[k], c));
    let rows = [...this.coll(collection).values()].filter((d) => all(d, where) && (!where.$or?.length || where.$or.some((b) => all(d, b))));
    for (const s of [...(opts.sort ?? [])].reverse()) {
      rows = rows.sort((a, b) => {
        const av = a[s.field] instanceof Date ? (a[s.field] as Date).getTime() : (a[s.field] as number);
        const bv = b[s.field] instanceof Date ? (b[s.field] as Date).getTime() : (b[s.field] as number);
        return (av > bv ? 1 : av < bv ? -1 : 0) * (s.order === 'asc' ? 1 : -1);
      });
    }
    const total = rows.length;
    rows = rows.slice(opts.skip ?? 0, (opts.skip ?? 0) + (opts.limit ?? 50));
    return { items: rows.map((d) => structuredClone(d) as T), total: opts.withTotal ? total : undefined };
  }

  async count(collection: string, where: Where) {
    return (await this.find(collection, where, { limit: 1_000_000 })).items.length;
  }

  async insert<T extends Doc>(collection: string, doc: Omit<T, '_id'> & { _id?: string }) {
    this.maybeFail('insert', collection);
    const c = this.coll(collection);
    for (const keys of UNIQUE[collection] ?? []) {
      const clash = [...c.values()].some((d) => keys.every((k) => d[k] === (doc as Record<string, unknown>)[k]));
      if (clash) throw new DuplicateKeyError();
    }
    const now = new Date(Date.UTC(2026, 0, 1) + ++this.clock * 1000);
    const created = { ...structuredClone(doc), _id: doc._id ?? `id-${++this.seq}`, _createdDate: now, _updatedDate: now } as T;
    c.set(created._id, created);
    return structuredClone(created);
  }

  async update<T extends Doc>(collection: string, doc: T) {
    this.maybeFail('update', collection);
    const c = this.coll(collection);
    const existing = c.get(doc._id);
    if (!existing) throw new Error('not found');
    const updated = { ...structuredClone(doc), _createdDate: existing._createdDate, _updatedDate: new Date(Date.UTC(2026, 0, 1) + ++this.clock * 1000) } as T;
    // Wix Data `update` replaces the item: undefined fields are dropped.
    for (const k of Object.keys(updated)) if ((updated as Record<string, unknown>)[k] === undefined) delete (updated as Record<string, unknown>)[k];
    c.set(doc._id, updated);
    return structuredClone(updated);
  }

  async bulkUpdate<T extends Doc>(collection: string, docs: T[]) {
    for (const d of docs) await this.update(collection, d);
  }

  async remove(collection: string, id: string) {
    this.coll(collection).delete(id);
  }
}
