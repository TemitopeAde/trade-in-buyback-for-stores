import { catalogSearchRequest } from '../../../lib/schemas/api';
import { tradeIns } from '../../../server/container';
import { route } from '../../../server/http';

// GET /api/catalog/search?q= — eligible, visible products for the trade-in form.
export const GET = route(catalogSearchRequest, (ctx, { q }) => tradeIns.searchCatalog(ctx, q), { rateLimitPerMinute: 60 });
