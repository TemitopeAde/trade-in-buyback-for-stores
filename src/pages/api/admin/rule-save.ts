import { ruleSaveRequest } from '../../../lib/schemas/admin';
import { planService, rules } from '../../../server/container';
import { AppError } from '../../../server/errors';
import { route } from '../../../server/http';
import { requireMerchant } from '../../../server/services/AuthorizationService';

// POST /api/admin/rule-save — create (no id) or update a rule; the body is validated by RulesService.
export const POST = route(ruleSaveRequest, async (ctx, { id, rule }) => {
  requireMerchant(ctx);
  const status = await planService.getPlanStatus(ctx.instanceId);
  const entitlements = status.entitlements;

  if (!id) {
    const existing = await rules.list(ctx.instanceId);
    if (existing.length >= entitlements.maxRules) {
      throw new AppError('forbidden', 'plan_limit_exceeded: maximum rules reached');
    }
  }

  const parsed = rules.validate(rule);
  if (parsed.scope === 'all' && !entitlements.allowAllProductsScope) {
    throw new AppError('forbidden', 'basic_plan_only_single_product: all products scope requires pro plan');
  }
  if (parsed.scope === 'category' && !entitlements.allowCategoryScope) {
    throw new AppError('forbidden', 'basic_plan_only_single_product: category scope requires pro plan');
  }
  if (parsed.scope === 'product' && parsed.productIds.length > entitlements.maxProductsPerRule) {
    throw new AppError('forbidden', 'basic_plan_only_single_product: basic plan allows only 1 product per rule');
  }

  return id ? rules.update(ctx.instanceId, id, rule) : rules.create(ctx.instanceId, rule);
}, { rateLimitPerMinute: 60 });

