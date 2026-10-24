import { z } from 'zod';
import { merchant, resale } from '../../../server/container';
import { route } from '../../../server/http';
import { requireMerchant } from '../../../server/services/AuthorizationService';

// POST /api/admin/resale — create (or retry) a hidden draft product for an accepted item.
export const POST = route(z.object({ tradeInId: z.string().min(1).max(64) }), async (ctx, { tradeInId }) => {
  const actor = requireMerchant(ctx);
  await resale.create(ctx.instanceId, tradeInId, actor);
  return merchant.detail(ctx.instanceId, tradeInId);
}, { rateLimitPerMinute: 20 });
