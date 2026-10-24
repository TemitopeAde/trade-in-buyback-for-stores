import { z } from 'zod';
import { giftCards, outbox } from '../../../server/container';
import { route } from '../../../server/http';
import { requireMerchant } from '../../../server/services/AuthorizationService';

// GET  /api/admin/outbox — background jobs that exhausted retries, plus integration checks.
// POST /api/admin/outbox — revive a dead job.
export const GET = route(z.object({}), async (ctx) => {
  requireMerchant(ctx);
  const dead = await outbox.dead(ctx.instanceId);
  return {
    giftCardsAvailable: await giftCards.available(),
    dead: dead.map((e) => ({ id: e._id, eventType: e.eventType, tradeInId: e.tradeInId, attempts: e.attemptCount, lastError: e.lastError, updatedAt: e._updatedDate ? new Date(e._updatedDate).toISOString() : '' })),
  };
});
export const POST = route(z.object({ id: z.string().min(1).max(64) }), async (ctx, { id }) => {
  requireMerchant(ctx);
  await outbox.revive(ctx.instanceId, id);
  return { ok: true };
});
