import { z } from 'zod';
import { merchant } from '../../../server/container';
import { route } from '../../../server/http';
import { requireMerchant } from '../../../server/services/AuthorizationService';

// GET /api/admin/overview — workload counts, recent activity and setup checklist.
export const GET = route(z.object({}), (ctx) => {
  requireMerchant(ctx);
  return merchant.overview(ctx.instanceId);
});
