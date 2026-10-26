import { z } from 'zod';
import { planService } from '../../../server/container';
import { route } from '../../../server/http';
import { requireMerchant } from '../../../server/services/AuthorizationService';

// GET /api/admin/plan — current plan tier, entitlements, trial availability, and upgrade URL.
export const GET = route(z.object({}), async (ctx) => {
  requireMerchant(ctx);
  return planService.getPlanStatus(ctx.instanceId);
});
