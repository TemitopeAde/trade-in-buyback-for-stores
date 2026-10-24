import { toolsProvider } from '@wix/app-tools/service-plugins';
import { aria, isInstanceDisconnected } from '../../../../server/container';
import { isAppError, sanitizeErrorForLog } from '../../../../server/errors';

// Runtime for the Aria tools. Only Wix users (site owner/collaborators) of this instance may run
// tools; identity and instance come from the Wix-provided metadata, never from the payload.
toolsProvider.provideHandlers({
  runTool: async ({ request, metadata }) => {
    const instanceId = metadata?.instanceId ?? undefined;
    const userId = metadata?.identity?.wixUserId ?? undefined;
    if (!instanceId || !userId) return { response: { error: 'forbidden', message: 'Trade-in tools are available to site collaborators only.' } };
    if (await isInstanceDisconnected(instanceId)) return { response: { error: 'unavailable' } };
    const payload = request?.payload && typeof request.payload === 'object' ? (request.payload as Record<string, unknown>) : {};
    try {
      return { response: await aria.run({ instanceId, userId }, request?.methodName ?? '', payload) };
    } catch (err) {
      // Return a structured, sanitized error so Aria can explain it instead of failing silently.
      if (isAppError(err)) return { response: { error: err.code, message: err.detail ?? err.code } };
      console.error('[trade-in] aria', sanitizeErrorForLog(err));
      return { response: { error: 'internal' } };
    }
  },
});
