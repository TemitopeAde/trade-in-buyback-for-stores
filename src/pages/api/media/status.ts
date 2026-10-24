import { sessionStatusRequest } from '../../../lib/schemas/api';
import { media } from '../../../server/container';
import { route } from '../../../server/http';
import { requireSiteCaller } from '../../../server/services/AuthorizationService';

// GET /api/media/status?uploadSessionId= — processing state of this session's uploads.
export const GET = route(sessionStatusRequest, (ctx, { uploadSessionId }) => {
  requireSiteCaller(ctx);
  return media.sessionStatus(ctx.instanceId, uploadSessionId);
}, { rateLimitPerMinute: 120 });
