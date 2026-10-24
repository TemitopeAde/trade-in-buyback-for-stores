import { ruleSaveRequest } from '../../../lib/schemas/admin';
import { rules } from '../../../server/container';
import { route } from '../../../server/http';
import { requireMerchant } from '../../../server/services/AuthorizationService';

// POST /api/admin/rule-save — create (no id) or update a rule; the body is validated by RulesService.
export const POST = route(ruleSaveRequest, (ctx, { id, rule }) => {
  requireMerchant(ctx);
  return id ? rules.update(ctx.instanceId, id, rule) : rules.create(ctx.instanceId, rule);
}, { rateLimitPerMinute: 60 });
