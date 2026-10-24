import { myTradeInsRequest } from '../../../lib/schemas/api';
import { tradeIns } from '../../../server/container';
import { route } from '../../../server/http';

// GET /api/trade-ins/mine?cursor= — the signed-in member's trade-ins.
export const GET = route(myTradeInsRequest, (ctx, { cursor }) => tradeIns.listForMember(ctx, cursor), { rateLimitPerMinute: 60 });
