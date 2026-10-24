import { z } from 'zod';
import { reporting } from '../../../server/container';
import { route } from '../../../server/http';
import { requireMerchant } from '../../../server/services/AuthorizationService';

// GET /api/admin/report?days= — trade-in performance for the period.
export const GET = route(z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }), (ctx, { days }) => {
  requireMerchant(ctx);
  return reporting.report(ctx.instanceId, days);
});
