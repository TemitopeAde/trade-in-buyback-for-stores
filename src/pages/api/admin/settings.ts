import { z } from 'zod';
import { settings, siteProperties } from '../../../server/container';
import { route } from '../../../server/http';
import { requireMerchant } from '../../../server/services/AuthorizationService';

// GET  /api/admin/settings — current settings (defaults until first save), plus the site's
//      payment currency for entering amounts (read-only; it comes from the site's business info).
// POST /api/admin/settings — validated full replacement.
export const GET = route(z.object({}), async (ctx) => {
  requireMerchant(ctx);
  const [stored, siteCurrency] = await Promise.all([settings.getStored(ctx.instanceId), siteProperties.currency(ctx.instanceId)]);
  return { ...stored, siteCurrency };
});
export const POST = route(z.object({ settings: z.unknown() }), (ctx, input) => {
  requireMerchant(ctx);
  return settings.save(ctx.instanceId, input.settings);
}, { rateLimitPerMinute: 30 });
