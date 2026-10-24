import { submitRequest } from '../../../lib/schemas/api';
import { tradeIns } from '../../../server/container';
import { route } from '../../../server/http';

// POST /api/trade-ins/create — idempotent on `submissionKey`; the server recomputes the offer.
export const POST = route(submitRequest, (ctx, input) => tradeIns.submit(ctx, input), { rateLimitPerMinute: 10 });
