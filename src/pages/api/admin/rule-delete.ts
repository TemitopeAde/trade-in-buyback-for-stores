import { ruleIdRequest } from '../../../lib/schemas/admin';
import { rules } from '../../../server/container';
import { route } from '../../../server/http';
import { requireMerchant } from '../../../server/services/AuthorizationService';

// POST /api/admin/rule-delete — existing trade-ins keep their stored offer breakdown.
export const POST = route(ruleIdRequest, async (ctx, { id }) => {
  requireMerchant(ctx);
  await rules.remove(ctx.instanceId, id);
  return { ok: true };
});
