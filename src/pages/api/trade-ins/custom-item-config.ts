import { z } from 'zod';
import { tradeIns } from '../../../server/container';
import { route } from '../../../server/http';

// GET /api/trade-ins/custom-item-config — whether custom items are accepted, plus photo and hand-off options.
export const GET = route(z.object({}), (ctx) => tradeIns.customItemConfig(ctx), { rateLimitPerMinute: 60 });
