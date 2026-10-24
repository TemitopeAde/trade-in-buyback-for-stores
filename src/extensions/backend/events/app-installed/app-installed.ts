import { appInstances } from '@wix/app-management';
import { settings } from '../../../../server/container';
import { sanitizeErrorForLog } from '../../../../server/errors';

// (Re)install: clear a previous disconnect. No sample trade-ins or rules are created.
export default appInstances.onAppInstanceInstalled(async (event) => {
  try {
    const instanceId = event.metadata?.instanceId;
    if (instanceId && (await settings.isDisconnected(instanceId))) await settings.setDisconnected(instanceId, false);
  } catch (err) {
    console.error('[trade-in] app installed', sanitizeErrorForLog(err));
  }
});
