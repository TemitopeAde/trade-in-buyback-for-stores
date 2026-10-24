import { z } from 'zod';
import { rules } from '../../../server/container';
import { route } from '../../../server/http';
import { requireMerchant } from '../../../server/services/AuthorizationService';

// GET /api/admin/rules — all trade-in rules for this site.
export const GET = route(z.object({}), (ctx) => {
  requireMerchant(ctx);
  return rules.list(ctx.instanceId);
});
