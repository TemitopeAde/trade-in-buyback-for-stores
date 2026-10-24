import { auth } from '@wix/essentials';
import { giftVouchers } from '@wix/gift-vouchers';

// Wix Gift Cards (requires the Wix Gift Card app on the site). Codes are obfuscated in API
// responses and are never stored or logged by this app; customers receive the code only through
// Wix's own gift card email.

const elevated = {
  create: auth.elevate(giftVouchers.createGiftCard),
  get: auth.elevate(giftVouchers.getGiftCard),
  count: auth.elevate(giftVouchers.countGiftCards),
  sendEmail: auth.elevate(giftVouchers.sendGiftCardEmail),
};

export type IssuedGiftCard = { giftCardId: string; amount: string; currency: string };

export type GiftCardErrorKind = 'not_available' | 'invalid' | 'unknown';

export class GiftCardError extends Error {
  constructor(readonly kind: GiftCardErrorKind, readonly code: string) {
    super(code);
    this.name = 'GiftCardError';
  }
}

function classify(err: unknown): GiftCardError {
  const e = err as { details?: { applicationError?: { code?: string } }; code?: string; message?: string; httpStatus?: number; status?: number };
  const code = String(e?.details?.applicationError?.code ?? e?.code ?? 'UNKNOWN').slice(0, 80);
  const status = e?.httpStatus ?? e?.status;
  const text = `${code} ${e?.message ?? ''}`;
  if (/NOT_INSTALLED|APP_NOT_INSTALLED|PERMISSION_DENIED|FORBIDDEN|403/i.test(text) || status === 403) return new GiftCardError('not_available', code);
  // Definite request problems (won't succeed on retry with the same input).
  if (status === 400 || /INVALID_ARGUMENT|CURRENCY|VALIDATION/i.test(text)) return new GiftCardError('invalid', code);
  // Timeouts, 5xx, network: the card may or may not exist — reconcile by retrying with the same key.
  return new GiftCardError('unknown', code);
}

export class WixGiftCardsService {
  /**
   * Creates the gift card. `idempotencyKey` is derived from the trade-in, so retries after a
   * timeout or crash return the same card instead of issuing duplicate credit.
   */
  async issue(p: { amount: string; currency: string; idempotencyKey: string; expirationDate?: Date }): Promise<IssuedGiftCard> {
    try {
      const card = await elevated.create(
        { initialValue: { amount: p.amount }, currency: p.currency, source: 'MANUAL', expirationDate: p.expirationDate },
        { idempotencyKey: p.idempotencyKey },
      );
      if (!card._id) throw new GiftCardError('unknown', 'NO_ID');
      return { giftCardId: card._id, amount: card.initialValue?.amount ?? p.amount, currency: card.currency ?? p.currency };
    } catch (err) {
      throw err instanceof GiftCardError ? err : classify(err);
    }
  }

  async exists(giftCardId: string): Promise<boolean> {
    try {
      return !!(await elevated.get(giftCardId))._id;
    } catch {
      return false;
    }
  }

  /** Sends Wix's gift card email (contains the code). Requires a premium site plan. */
  async sendEmail(giftCardId: string, recipientEmail: string): Promise<void> {
    try {
      await elevated.sendEmail(giftCardId, { recipientEmail });
    } catch (err) {
      throw classify(err);
    }
  }

  /** True when the Gift Cards API is usable on this site (app installed, permission granted). */
  async available(): Promise<boolean> {
    try {
      await elevated.count({});
      return true;
    } catch {
      return false;
    }
  }
}
