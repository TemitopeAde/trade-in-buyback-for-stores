import { z } from 'zod';
import { notifications, settings } from '../../../server/container';
import { route } from '../../../server/http';
import { requireMerchant } from '../../../server/services/AuthorizationService';

// GET  /api/admin/notifications?tradeInId= — preferences, delivery log and the caller's user ID
//      (so the merchant can add themselves as a recipient).
// POST /api/admin/notifications — save notification preferences only.
export const GET = route(z.object({ tradeInId: z.string().max(64).optional() }), async (ctx, { tradeInId }) => {
  const actor = requireMerchant(ctx);
  const s = await settings.get(ctx.instanceId);
  return { preferences: s.notifications, history: await notifications.history(ctx.instanceId, { tradeInId }), currentUserId: actor.id };
});
export const POST = route(z.object({ preferences: z.unknown() }), async (ctx, { preferences }) => {
  requireMerchant(ctx);
  const current = await settings.get(ctx.instanceId);
  const saved = await settings.save(ctx.instanceId, { ...current, notifications: preferences });
  return { preferences: saved.notifications };
}, { rateLimitPerMinute: 30 });
