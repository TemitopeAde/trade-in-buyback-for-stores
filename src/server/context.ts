import { auth } from '@wix/essentials';
import { AppError } from './errors';

// Identity is derived only from the verified Wix access token on the request (sent by
// httpClient.fetchWithAuth from extensions, or by Wix for service plugins/events).
// Request bodies never supply instance, site, member or user identity.

export type Caller =
  | { type: 'user'; id: string } // Wix user in the dashboard (site owner / collaborator)
  | { type: 'member'; id: string } // logged-in site member
  | { type: 'visitor'; id: string } // anonymous site visitor
  | { type: 'app'; id: string }; // the app itself (events, service plugins)

export type RequestContext = { instanceId: string; siteId: string; caller: Caller };

export async function getRequestContext(): Promise<RequestContext> {
  // Shape from @wix/essentials auth.getTokenInfo() (declared inline: the export is overloaded).
  let info: {
    active: boolean;
    subjectType: 'APP' | 'USER' | 'MEMBER' | 'VISITOR' | 'UNKNOWN';
    subjectId: string;
    siteId: string;
    instanceId?: string;
  };
  try {
    info = await auth.getTokenInfo();
  } catch {
    throw new AppError('unauthorized', 'token info unavailable');
  }
  if (!info.active || !info.instanceId) throw new AppError('unauthorized', 'inactive token or missing instance');
  const map = { USER: 'user', MEMBER: 'member', VISITOR: 'visitor', APP: 'app' } as const;
  if (info.subjectType === 'UNKNOWN') throw new AppError('unauthorized', 'unknown subject');
  return {
    instanceId: info.instanceId,
    siteId: info.siteId,
    caller: { type: map[info.subjectType], id: info.subjectId },
  };
}
