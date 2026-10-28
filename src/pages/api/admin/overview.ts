import { z } from 'zod';
import { merchant, tradeIns } from '../../../server/container';
import { route } from '../../../server/http';
import { requireMerchant } from '../../../server/services/AuthorizationService';

// GET /api/admin/overview — workload counts, recent activity and setup checklist.
export const GET = route(z.object({}), async (ctx) => {
  requireMerchant(ctx);
  const [overview, usage] = await Promise.all([merchant.overview(ctx.instanceId), tradeIns.monthlyUsage(ctx.instanceId)]);
  return { ...overview, usage };
});
