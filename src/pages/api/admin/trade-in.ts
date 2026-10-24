import { adminDetailRequest } from '../../../lib/schemas/admin';
import { merchant } from '../../../server/container';
import { route } from '../../../server/http';
import { requireMerchant } from '../../../server/services/AuthorizationService';

// GET /api/admin/trade-in?id= — full request detail with signed media URLs and timeline.
export const GET = route(adminDetailRequest, (ctx, { id }) => {
  requireMerchant(ctx);
  return merchant.detail(ctx.instanceId, id);
});
