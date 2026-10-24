import { customerLookupRequest } from '../../../lib/schemas/api';
import { tradeIns } from '../../../server/container';
import { route } from '../../../server/http';

// POST /api/trade-ins/status — customer view by access token or owning member. POST keeps tokens out of URLs/logs.
export const POST = route(customerLookupRequest, (ctx, input) => tradeIns.getForCustomer(ctx, input), { rateLimitPerMinute: 60 });
