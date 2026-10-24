import { confirmUploadRequest } from '../../../lib/schemas/api';
import { media } from '../../../server/container';
import { route } from '../../../server/http';
import { requireSiteCaller } from '../../../server/services/AuthorizationService';

// POST /api/media/confirm — verifies the uploaded file with the Media Manager before it can be attached.
export const POST = route(confirmUploadRequest, (ctx, input) => {
  requireSiteCaller(ctx);
  return media.confirmUpload(ctx.instanceId, input);
}, { rateLimitPerMinute: 60 });
