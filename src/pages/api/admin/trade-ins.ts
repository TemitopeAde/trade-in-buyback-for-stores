import { adminListRequest } from '../../../lib/schemas/admin';
import { merchant } from '../../../server/container';
import { route } from '../../../server/http';
import { requireMerchant } from '../../../server/services/AuthorizationService';

// GET /api/admin/trade-ins — search, filter, sort and page the request queue.
export const GET = route(adminListRequest, (ctx, input) => {
  requireMerchant(ctx);
  return merchant.list(ctx.instanceId, input);
});
