import { emailTransmissions } from '@wix/email-transmissions';
import { notifications } from '../../../../server/container';
import { sanitizeErrorForLog } from '../../../../server/errors';

// Delivery status for app-sent emails. The notification ID travels in transmission metadata.
export default emailTransmissions.onEmailTransmissionUpdated(async (event) => {
  try {
    const t = event.entity;
    const notificationId = t?.metadata?.notificationId;
    if (!t?._id || !notificationId) return;
    await notifications.applyTransmissionState(notificationId, {
      id: t._id,
      status: (t.status ?? 'ACCEPTED') as 'ACCEPTED',
      failures: (t.toRecipients ?? []).filter((r) => r.failureReason && r.failureReason !== 'NONE').map((r) => ({ reason: r.failureReason! })),
    });
  } catch (err) {
    console.error('[trade-in] email status', sanitizeErrorForLog(err));
  }
});
