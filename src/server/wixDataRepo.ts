import { items } from '@wix/data';
import { auth } from '@wix/essentials';
import { DuplicateKeyError, type Condition, type Doc, type FindOptions, type Repo, type Where } from './repo';

// Collections are PRIVILEGED-only, so every access is elevated. Callers (services) are
// responsible for authorizing the actor before reaching this layer.

const elevated = {
  get: auth.elevate(items.get),
  query: auth.elevate(items.query),
  insert: auth.elevate(items.insert),
  update: auth.elevate(items.update),
  bulkUpdate: auth.elevate(items.bulkUpdate),
  remove: auth.elevate(items.remove),
  bulkRemove: auth.elevate(items.bulkRemove),
};

type Query = items.WixDataQuery;
type Filter = items.WixDataFilter;
type V = string | number | Date;

/** The condition methods shared by the query and filter builders. */
interface CondBuilder<B> {
  eq(f: string, v: unknown): B; ne(f: string, v: unknown): B;
  gt(f: string, v: V): B; ge(f: string, v: V): B; lt(f: string, v: V): B; le(f: string, v: V): B;
  hasSome(f: string, v: string[]): B; contains(f: string, v: string): B;
  isEmpty(f: string): B; isNotEmpty(f: string): B; between(f: string, a: V, b: V): B;
}

function applyConditions<B extends CondBuilder<B>>(builder: B, where: Record<string, Condition | undefined>): B {
  let b = builder;
  for (const [field, cond] of Object.entries(where)) {
    if (cond === undefined || field === '$or') continue;
    if (cond instanceof Date || typeof cond !== 'object') b = b.eq(field, cond);
    else if ('$in' in cond) b = b.hasSome(field, cond.$in as string[]);
    else if ('$between' in cond) b = b.between(field, cond.$between[0] as V, cond.$between[1] as V);
    else if ('$gt' in cond) b = b.gt(field, cond.$gt as V);
    else if ('$gte' in cond) b = b.ge(field, cond.$gte as V);
    else if ('$lt' in cond) b = b.lt(field, cond.$lt as V);
    else if ('$lte' in cond) b = b.le(field, cond.$lte as V);
    else if ('$ne' in cond) b = b.ne(field, cond.$ne);
    else if ('$contains' in cond) b = b.contains(field, cond.$contains);
    else if ('$exists' in cond) b = cond.$exists ? b.isNotEmpty(field) : b.isEmpty(field);
  }
  return b;
}

function applyWhere(q: Query, where: Where): Query {
  let query = applyConditions<Query>(q, where);
  if (where.$or?.length) {
    // Seed with the first branch, then or() the rest (an empty seed would match everything).
    const branches = where.$or.map((w) => applyConditions<Filter>(items.filter(), w));
    query = query.and(branches.slice(1).reduce((acc, f) => acc.or(f), branches[0]));
  }
  return query;
}

function isDuplicate(err: unknown): boolean {
  const e = err as { code?: string; details?: { applicationError?: { code?: string } }; message?: string };
  const code = e?.code ?? e?.details?.applicationError?.code ?? '';
  return /WDE0074|DUPLICATE|ALREADY_EXISTS|unique/i.test(`${code} ${e?.message ?? ''}`);
}

export const wixDataRepo: Repo = {
  async get<T extends Doc>(collection: string, id: string) {
    return ((await elevated.get(collection, id, { consistentRead: true })) as T | null) ?? null;
  },
  async find<T extends Doc>(collection: string, where: Where, opts: FindOptions = {}) {
    let q = applyWhere(elevated.query(collection), where);
    for (const s of opts.sort ?? []) q = s.order === 'asc' ? q.ascending(s.field) : q.descending(s.field);
    if (opts.limit) q = q.limit(Math.min(opts.limit, 1000));
    if (opts.skip) q = q.skip(opts.skip);
    const res = await q.find({ consistentRead: true, returnTotalCount: !!opts.withTotal });
    return { items: res.items as T[], total: opts.withTotal ? res.totalCount : undefined };
  },
  async count(collection, where) {
    return applyWhere(elevated.query(collection), where).count();
  },
  async insert<T extends Doc>(collection: string, doc: Omit<T, '_id'> & { _id?: string }) {
    try {
      // Assigned before casting so the SDK's generic isn't inferred from our return type.
      const created: unknown = await elevated.insert(collection, doc as Record<string, unknown>);
      return created as T;
    } catch (err) {
      if (isDuplicate(err)) throw new DuplicateKeyError();
      throw err;
    }
  },
  async update<T extends Doc>(collection: string, doc: T) {
    return (await elevated.update(collection, doc)) as T;
  },
  async bulkUpdate<T extends Doc>(collection: string, docs: T[]) {
    if (!docs.length) return;
    const res = await elevated.bulkUpdate(collection, docs);
    if (res.errors?.length) throw new Error(`bulkUpdate failed for ${res.errors.length} item(s)`);
  },
  async remove(collection, id) {
    await elevated.remove(collection, id);
  },
  async bulkRemove(collection, ids) {
    if (!ids.length) return;
    const res = await elevated.bulkRemove(collection, ids);
    if (res.errors?.length) throw new Error(`bulkRemove failed for ${res.errors.length} item(s)`);
  },
};
