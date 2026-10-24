import { z } from 'zod';
import { media, notifications, outbox, processor } from '../../../server/container';
import { route } from '../../../server/http';
import { requireMerchant } from '../../../server/services/AuthorizationService';

// POST /api/admin/process — retry sweep, called when the dashboard opens. Processes at most one
// due outbox event, polls a few in-flight emails and purges expired evidence, to stay inside one
// request's sub-request budget.
export const POST = route(z.object({}), async (ctx) => {
  requireMerchant(ctx);
  const result = await outbox.processDue(processor.handle, { instanceId: ctx.instanceId, limit: 1 });
  const polled = await notifications.pollInFlight(ctx.instanceId, 2);
  const purged = await media.purgeDue(ctx.instanceId, new Date(), 10);
  return { ...result, polled, purged };
}, { rateLimitPerMinute: 30 });
