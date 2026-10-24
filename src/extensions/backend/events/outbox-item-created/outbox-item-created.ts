import { items } from '@wix/data';
import { COLLECTIONS } from '../../../../server/collections';
import { isInstanceDisconnected, outbox, processor } from '../../../../server/container';
import { sanitizeErrorForLog } from '../../../../server/errors';

// Primary driver for background work: each committed outbox event is processed in its own
// webhook invocation (its own sub-request budget). Items in other collections are ignored.
// Failures are retried with backoff by the dashboard-triggered sweep.
export default items.onDataItemCreated(async (event) => {
  const entity = event.entity;
  if (entity?.dataCollectionId !== COLLECTIONS.outbox) return;
  try {
    const instanceId = (entity.data as { instanceId?: string }).instanceId;
    if (instanceId && (await isInstanceDisconnected(instanceId))) return;
    await outbox.processOne(entity._id, processor.handle);
  } catch (err) {
    console.error('[trade-in] outbox event', sanitizeErrorForLog(err));
  }
});
