import { productRequest } from '../../../lib/schemas/api';
import { tradeIns } from '../../../server/container';
import { route } from '../../../server/http';

// GET /api/trade-ins/form-config?productId= — questions, media requirements and hand-off options.
export const GET = route(productRequest, (ctx, { productId }) => tradeIns.formConfig(ctx, productId), { rateLimitPerMinute: 60 });
