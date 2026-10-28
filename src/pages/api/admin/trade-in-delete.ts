import { adminDetailRequest } from '../../../lib/schemas/admin';
import { merchant } from '../../../server/container';
import { route } from '../../../server/http';
import { requireMerchant } from '../../../server/services/AuthorizationService';

// POST /api/admin/trade-in-delete — permanently deletes a request and everything attached to it.
export const POST = route(adminDetailRequest, async (ctx, { id }) => {
  await merchant.deleteTradeIn(ctx.instanceId, requireMerchant(ctx), id);
  return { ok: true };
}, { rateLimitPerMinute: 30 });
