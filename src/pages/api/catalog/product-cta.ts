import { productRequest } from '../../../lib/schemas/api';
import { tradeIns } from '../../../server/container';
import { route } from '../../../server/http';

// GET /api/catalog/product-cta?productId= — eligibility and "up to" amount for the product page CTA.
export const GET = route(productRequest, (ctx, { productId }) => tradeIns.productCta(ctx, productId), { rateLimitPerMinute: 120 });
