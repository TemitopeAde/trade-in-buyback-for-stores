import { adminActionRequest } from '../../../lib/schemas/admin';
import { merchant } from '../../../server/container';
import { route } from '../../../server/http';
import { requireMerchant } from '../../../server/services/AuthorizationService';

// POST /api/admin/action — status transitions (idempotent, revision-checked).
export const POST = route(adminActionRequest, (ctx, input) => merchant.act(ctx.instanceId, requireMerchant(ctx), input), { rateLimitPerMinute: 60 });
