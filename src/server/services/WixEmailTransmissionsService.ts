import { emailTransmissions } from '@wix/email-transmissions';
import { auth } from '@wix/essentials';
import { sha256Hex } from '../crypto';

// Wix Email Transmissions (transactional). Sending is asynchronous: ACCEPTED means queued, not
// delivered. Final state arrives via the EmailTransmissionUpdated event or getEmailTransmission,
// and each recipient carries its own failureReason even when the transmission is PROCESSED.

const elevated = {
  send: auth.elevate(emailTransmissions.sendEmailTransmission),
  get: auth.elevate(emailTransmissions.getEmailTransmission),
};

export type EmailRecipient = { emailAddress: string; name?: string } | { userId: string } | { contactId: string };
export type TransmissionStatus = 'ACCEPTED' | 'IN_PROGRESS' | 'PROCESSED' | 'REJECTED';
export type TransmissionState = { id: string; status: TransmissionStatus; failures: { reason: string }[] };

export class EmailSendError extends Error {
  constructor(readonly code: string, readonly retryable: boolean) {
    super(code);
    this.name = 'EmailSendError';
  }
}

/** Deterministic UUID from a stable string, so a retried send of the same notification dedupes at Wix. */
export async function idempotencyUuid(seed: string): Promise<string> {
  const h = await sha256Hex(seed);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function toState(t: { id?: string; status?: string; toRecipients?: { failureReason?: string }[] }): TransmissionState {
  return {
    id: t.id ?? '',
    status: (t.status ?? 'ACCEPTED') as TransmissionStatus,
    failures: (t.toRecipients ?? []).filter((r) => r.failureReason && r.failureReason !== 'NONE').map((r) => ({ reason: r.failureReason! })),
  };
}

export class WixEmailTransmissionsService {
  async send(p: {
    to: EmailRecipient[];
    subject: string;
    html: string;
    senderName?: string;
    replyTo?: string;
    idempotencySeed: string;
    metadata: Record<string, string>;
  }): Promise<TransmissionState> {
    try {
      const res = await elevated.send(
        {
          type: 'TRANSACTIONAL',
          emailSubject: p.subject,
          emailHtmlContent: p.html,
          toRecipients: p.to,
          senderName: p.senderName || undefined,
          replyTo: p.replyTo ? { emailAddress: p.replyTo } : undefined,
          metadata: p.metadata,
        },
        { idempotencyKey: await idempotencyUuid(p.idempotencySeed) },
      );
      return toState(res.emailTransmission ?? {});
    } catch (err) {
      const e = err as { details?: { applicationError?: { code?: string } }; code?: string; httpStatus?: number; status?: number; message?: string };
      const code = String(e?.details?.applicationError?.code ?? e?.code ?? 'UNKNOWN').slice(0, 80);
      const status = e?.httpStatus ?? e?.status ?? 0;
      // 4xx (bad request, quota, permission, suspended account) won't succeed on blind retry.
      const retryable = !(status >= 400 && status < 500) || status === 429;
      throw new EmailSendError(code, retryable);
    }
  }

  async get(transmissionId: string): Promise<TransmissionState | undefined> {
    try {
      return toState(await elevated.get(transmissionId));
    } catch {
      return undefined;
    }
  }
}
