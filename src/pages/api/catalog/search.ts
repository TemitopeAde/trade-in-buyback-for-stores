import { catalogSearchRequest } from '../../../lib/schemas/api';
import { tradeIns } from '../../../server/container';
import { route } from '../../../server/http';

// GET /api/catalog/search?q=&cursor= — eligible, visible products for the trade-in form.
export const GET = route(catalogSearchRequest, (ctx, { q, cursor }) => tradeIns.searchCatalog(ctx, q, cursor), { rateLimitPerMinute: 60 });
