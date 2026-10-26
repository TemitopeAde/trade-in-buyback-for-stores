import { z } from 'zod';
import { sitePlugins } from '../../../server/container';
import { route } from '../../../server/http';
import { requireMerchant } from '../../../server/services/AuthorizationService';

// GET /api/admin/plugin-status — placement statuses of app's site plugins.
export const GET = route(z.object({}), async (ctx) => {
  requireMerchant(ctx);
  const placementStatuses = await sitePlugins.getPlacementStatus();
  return { placementStatuses };
});
