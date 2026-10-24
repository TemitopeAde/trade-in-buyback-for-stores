import { customerActionRequest } from '../../../lib/schemas/api';
import { tradeIns } from '../../../server/container';
import { route } from '../../../server/http';

// POST /api/trade-ins/customer-action — cancel, add tracking, accept/decline a revised offer.
export const POST = route(customerActionRequest, (ctx, input) => tradeIns.customerAction(ctx, input), { rateLimitPerMinute: 20 });
