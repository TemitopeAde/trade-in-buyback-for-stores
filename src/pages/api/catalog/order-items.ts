import { z } from 'zod';
import { tradeIns } from '../../../server/container';
import { route } from '../../../server/http';

// GET /api/catalog/order-items — the signed-in member's eligible purchased items (empty for visitors).
export const GET = route(z.object({}), (ctx) => tradeIns.memberOrderItems(ctx), { rateLimitPerMinute: 20 });
