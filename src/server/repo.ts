// Minimal persistence port used by every service. The production implementation is
// Wix Data with elevated permissions (wixDataRepo.ts); tests use an in-memory one.

export type Doc = { _id: string; _createdDate?: Date; _updatedDate?: Date; [key: string]: unknown };
export type Scalar = string | number | boolean | Date;
/** `$between` is inclusive of the start and exclusive of the end (Wix Data semantics). */
export type Condition = Scalar | { $in: Scalar[] } | { $between: [Scalar, Scalar] } | { $gt: Scalar } | { $gte: Scalar } | { $lt: Scalar } | { $lte: Scalar } | { $ne: Scalar } | { $contains: string } | { $exists: boolean };
/** AND of field conditions; `$or` holds alternative condition sets (each itself an AND). */
export type Where = { [field: string]: Condition | undefined } & { $or?: Record<string, Condition>[] };
export type FindOptions = { sort?: { field: string; order: 'asc' | 'desc' }[]; limit?: number; skip?: number; withTotal?: boolean };
export type FindResult<T> = { items: T[]; total?: number };

export interface Repo {
  get<T extends Doc>(collection: string, id: string): Promise<T | null>;
  find<T extends Doc>(collection: string, where: Where, opts?: FindOptions): Promise<FindResult<T>>;
  count(collection: string, where: Where): Promise<number>;
  insert<T extends Doc>(collection: string, doc: Omit<T, '_id'> & { _id?: string }): Promise<T>;
  update<T extends Doc>(collection: string, doc: T): Promise<T>;
  /** One request for many replacements (backend handlers are limited to ~20 sub-requests). */
  bulkUpdate<T extends Doc>(collection: string, docs: T[]): Promise<void>;
  remove(collection: string, id: string): Promise<void>;
  /** One request for many removals. */
  bulkRemove(collection: string, ids: string[]): Promise<void>;
}

/** Thrown when a unique index rejects an insert; callers use this for atomic locks/dedupe. */
export class DuplicateKeyError extends Error {
  constructor(message = 'duplicate key') {
    super(message);
    this.name = 'DuplicateKeyError';
  }
}
