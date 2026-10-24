import { adminNoteRequest } from '../../../lib/schemas/admin';
import { merchant } from '../../../server/container';
import { route } from '../../../server/http';
import { requireMerchant } from '../../../server/services/AuthorizationService';

// POST /api/admin/note — internal note (plain text; never shown to customers).
export const POST = route(adminNoteRequest, (ctx, { tradeInId, text }) => merchant.addNote(ctx.instanceId, requireMerchant(ctx), tradeInId, text), { rateLimitPerMinute: 60 });
