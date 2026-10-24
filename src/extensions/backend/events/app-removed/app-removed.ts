import { appInstances } from '@wix/app-management';
import { settings } from '../../../../server/container';
import { sanitizeErrorForLog } from '../../../../server/errors';

// Uninstall: mark the instance disconnected so routes, tools and background jobs stop.
// Data is kept (Wix removes app collections per its own retention), allowing clean reinstall.
export default appInstances.onAppInstanceRemoved(async (event) => {
  try {
    const instanceId = event.metadata?.instanceId;
    if (instanceId) await settings.setDisconnected(instanceId, true);
  } catch (err) {
    console.error('[trade-in] app removed', sanitizeErrorForLog(err));
  }
});
