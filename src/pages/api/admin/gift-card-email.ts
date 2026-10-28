import { z } from 'zod';
import { credit, merchant } from '../../../server/container';
import { route } from '../../../server/http';
import { requireMerchant } from '../../../server/services/AuthorizationService';

// POST /api/admin/gift-card-email — (re)send Wix's gift card email, which carries the code. The
// outcome is recorded on the trade-in; a failed send comes back as giftCardEmailStatus 'failed'.
export const POST = route(z.object({ tradeInId: z.string().min(1).max(64) }), async (ctx, { tradeInId }) => {
  const actor = requireMerchant(ctx);
  await credit.emailGiftCard(ctx.instanceId, tradeInId, actor);
  return merchant.detail(ctx.instanceId, tradeInId);
}, { rateLimitPerMinute: 10 });
