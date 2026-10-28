import { uploadRequest } from '../../../lib/schemas/api';
import { media, planService } from '../../../server/container';
import { AppError } from '../../../server/errors';
import { route } from '../../../server/http';
import { requireSiteCaller } from '../../../server/services/AuthorizationService';

// POST /api/media/upload-url — validated, private upload URL (PUT, or tus for large videos).
export const POST = route(uploadRequest, async (ctx, input) => {
  requireSiteCaller(ctx);
  if (!(await planService.entitlements(ctx.instanceId)).mediaUploads) throw new AppError('forbidden', 'media_uploads_require_pro');
  return media.requestUpload(ctx.instanceId, input);
}, { rateLimitPerMinute: 30 });
