import { z } from 'zod';
import { credit, merchant } from '../../../server/container';
import { route } from '../../../server/http';
import { requireMerchant } from '../../../server/services/AuthorizationService';

// POST /api/admin/credit-retry — reconcile/retry gift card issuance. Safe to repeat: the gift card
// idempotency key is fixed per trade-in, so Wix returns the existing card instead of a new one.
export const POST = route(z.object({ tradeInId: z.string().min(1).max(64) }), async (ctx, { tradeInId }) => {
  const actor = requireMerchant(ctx);
  await credit.issue(ctx.instanceId, tradeInId, actor);
  return merchant.detail(ctx.instanceId, tradeInId);
}, { rateLimitPerMinute: 10 });
