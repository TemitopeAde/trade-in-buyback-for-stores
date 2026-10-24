import { estimateRequest } from '../../../lib/schemas/api';
import { tradeIns } from '../../../server/container';
import { route } from '../../../server/http';

// POST /api/trade-ins/estimate — live estimate computed from trusted price and saved rules.
export const POST = route(estimateRequest, (ctx, { productId, answers }) => tradeIns.estimate(ctx, productId, answers), { rateLimitPerMinute: 120 });
