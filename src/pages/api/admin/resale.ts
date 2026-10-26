import { z } from 'zod';
import { merchant, planService, resale } from '../../../server/container';
import { AppError } from '../../../server/errors';
import { route } from '../../../server/http';
import { requireMerchant } from '../../../server/services/AuthorizationService';

// POST /api/admin/resale — create (or retry) a hidden draft product for an accepted item.
export const POST = route(z.object({ tradeInId: z.string().min(1).max(64) }), async (ctx, { tradeInId }) => {
  const actor = requireMerchant(ctx);
  const status = await planService.getPlanStatus(ctx.instanceId);
  if (!status.entitlements.resaleDrafts) {
    throw new AppError('forbidden', 'resale_requires_pro');
  }
  await resale.create(ctx.instanceId, tradeInId, actor);
  return merchant.detail(ctx.instanceId, tradeInId);
}, { rateLimitPerMinute: 20 });

