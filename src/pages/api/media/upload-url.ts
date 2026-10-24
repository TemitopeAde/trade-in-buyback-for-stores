import { uploadRequest } from '../../../lib/schemas/api';
import { media } from '../../../server/container';
import { route } from '../../../server/http';
import { requireSiteCaller } from '../../../server/services/AuthorizationService';

// POST /api/media/upload-url — validated, private upload URL (PUT, or tus for large videos).
export const POST = route(uploadRequest, (ctx, input) => {
  requireSiteCaller(ctx);
  return media.requestUpload(ctx.instanceId, input);
}, { rateLimitPerMinute: 30 });
