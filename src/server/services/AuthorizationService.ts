import { COLLECTIONS } from '../collections';
import type { RequestContext } from '../context';
import { randomToken, sha256Hex } from '../crypto';
import { AppError } from '../errors';
import type { Doc, Repo } from '../repo';
import type { Actor, TradeInDoc } from '../types';

// Authorization decisions, kept separate from identity (context.ts) and business rules.
//  - Merchant endpoints: only Wix users (dashboard sessions) of this instance.
//  - Customer access to one trade-in: a valid, unexpired access token for that record,
//    or the logged-in member who owns it. Never a bare ID or reference.
//
// Access tokens are minted per delivery (submit response, each email) and stored only as
// SHA-256 hashes in an insert-only collection, so minting never rewrites the trade-in.

export const ACCESS_TOKEN_TTL_DAYS = 90;

export type AccessTokenDoc = Doc & {
  instanceId: string;
  tradeInId: string;
  tokenHash: string;
  purpose: string;
  expiresAt: Date;
  revokedAt?: Date;
};

export function requireMerchant(ctx: RequestContext): Actor {
  if (ctx.caller.type !== 'user') throw new AppError('forbidden', 'merchant access requires a dashboard user');
  return { type: 'merchant', id: ctx.caller.id };
}

/** Site callers (visitor or member) acting as a customer. */
export function requireSiteCaller(ctx: RequestContext): void {
  if (ctx.caller.type !== 'visitor' && ctx.caller.type !== 'member') throw new AppError('forbidden', 'site caller required');
}

export function memberIdOf(ctx: RequestContext): string | undefined {
  return ctx.caller.type === 'member' ? ctx.caller.id : undefined;
}

export async function hashAccessToken(token: string): Promise<string> {
  return sha256Hex(`trade-in-access:${token}`);
}

export class AccessTokenService {
  constructor(
    private readonly repo: Repo,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async mint(instanceId: string, tradeInId: string, purpose: string, ttlDays = ACCESS_TOKEN_TTL_DAYS): Promise<string> {
    const token = randomToken();
    await this.repo.insert<AccessTokenDoc>(COLLECTIONS.accessTokens, {
      instanceId,
      tradeInId,
      tokenHash: await hashAccessToken(token),
      purpose,
      expiresAt: new Date(this.now().getTime() + ttlDays * 86_400_000),
    });
    return token;
  }

  /** Resolves a token to its trade-in ID within this instance, or throws not_found/expired. */
  async resolve(instanceId: string, token: string): Promise<string> {
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw new AppError('not_found');
    const res = await this.repo.find<AccessTokenDoc>(COLLECTIONS.accessTokens, { tokenHash: await hashAccessToken(token) }, { limit: 1 });
    const doc = res.items[0];
    if (!doc || doc.instanceId !== instanceId || doc.revokedAt) throw new AppError('not_found');
    if (new Date(doc.expiresAt) < this.now()) throw new AppError('expired');
    return doc.tradeInId;
  }
}

/**
 * Confirms the site caller may act on this trade-in as its customer. `tokenTradeInId` is the
 * trade-in a presented token resolved to (if any). Mismatches surface as not_found so callers
 * can't probe which records exist.
 */
export function authorizeCustomer(ctx: RequestContext, tradeIn: TradeInDoc, tokenTradeInId: string | undefined): Actor {
  requireSiteCaller(ctx);
  if (tradeIn.instanceId !== ctx.instanceId) throw new AppError('not_found');
  const memberId = memberIdOf(ctx);
  if (memberId && tradeIn.memberId === memberId) return { type: 'customer', id: memberId };
  if (tokenTradeInId && tokenTradeInId === tradeIn._id) return { type: 'customer', id: memberId };
  throw new AppError('not_found');
}
