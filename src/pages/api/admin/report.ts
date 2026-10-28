import { z } from 'zod';
import { planService, reporting } from '../../../server/container';
import { route } from '../../../server/http';
import { requireMerchant } from '../../../server/services/AuthorizationService';

// GET /api/admin/report?days= — trade-in performance for the period.
export const GET = route(z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }), async (ctx, { days }) => {
  requireMerchant(ctx);
  const { maxReportDays } = await planService.entitlements(ctx.instanceId);
  return reporting.report(ctx.instanceId, Math.min(days, maxReportDays));
});
