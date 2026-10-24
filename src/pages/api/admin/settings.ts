import { z } from 'zod';
import { settings } from '../../../server/container';
import { route } from '../../../server/http';
import { requireMerchant } from '../../../server/services/AuthorizationService';

// GET  /api/admin/settings — current settings (defaults until first save).
// POST /api/admin/settings — validated full replacement.
export const GET = route(z.object({}), (ctx) => {
  requireMerchant(ctx);
  return settings.get(ctx.instanceId);
});
export const POST = route(z.object({ settings: z.unknown() }), (ctx, input) => {
  requireMerchant(ctx);
  return settings.save(ctx.instanceId, input.settings);
}, { rateLimitPerMinute: 30 });
