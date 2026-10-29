import { createTranslator, type MessageKey } from '../../lib/i18n';
import type { ActorType } from '../../lib/lifecycle';
import { formatMoney } from '../../lib/money';
import type { CustomerNotificationEvent, MerchantNotificationEvent } from '../../lib/schemas/domain';
import type { TradeInDoc } from '../types';

// Builds email subject/HTML from catalog strings. Every interpolated value is HTML-escaped;
// emails never include media URLs, gift card codes, access tokens or internal notes.

export type EmailContent = { subject: string; html: string };

/** The gift card code is known not to have reached the customer (failed or switched off). */
const codeNotSent = (doc: TradeInDoc) => doc.giftCardEmailStatus === 'failed' || doc.giftCardEmailStatus === 'disabled';

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function layout(p: { title: string; paragraphs: string[]; link?: { href: string; label: string }; footer: string; dir: 'ltr' | 'rtl' }): string {
  const button = p.link
    ? `<p style="margin:24px 0"><a href="${escapeHtml(p.link.href)}" style="display:inline-block;padding:12px 20px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600">${escapeHtml(p.link.label)}</a></p>`
    : '';
  return `<!doctype html><html dir="${p.dir}"><body style="margin:0;padding:24px;background:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px"><tr><td>
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(p.title)}</h1>
${p.paragraphs.map((x) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">${escapeHtml(x)}</p>`).join('')}
${button}
<p style="font-size:12px;color:#6b7280;margin-top:24px">${escapeHtml(p.footer)}</p>
</td></tr></table></body></html>`;
}

/** actorType: who made the status change the email is about, when it matters for the wording. */
type Ctx = { doc: TradeInDoc; locale: string; storeName: string; actorType?: ActorType; extra?: Record<string, string> };

function formatDate(d: Date | string | undefined, locale: string): string {
  return d ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(d)) : '';
}

function vars(c: Ctx) {
  const money = (minor?: number) => (minor === undefined ? '' : formatMoney(minor, c.doc.currency, c.locale));
  return {
    reference: c.doc.reference,
    item: c.doc.productTitle,
    name: c.doc.customerName,
    // A custom item's estimate stays 0 until a quote is accepted, so its quote stands in.
    amount: money(c.doc.revisedValueMinor ?? c.doc.finalValueMinor ?? (c.doc.estimatedValueMinor || c.doc.quotedValueMinor)),
    original: money(c.doc.estimatedValueMinor),
    reason: c.doc.status === 'revised_offer_pending' ? (c.doc.revisedOfferReason ?? '') : (c.doc.rejectionReason ?? ''),
    date: formatDate(c.doc.revisedOfferExpiresAt ?? c.doc.quoteExpiresAt, c.locale),
    store: c.storeName,
    tracking: c.doc.trackingNumber ?? '',
    ...c.extra,
  };
}

export function customerEmail(event: CustomerNotificationEvent, c: Ctx): EmailContent {
  const t = createTranslator(c.locale);
  const v = vars(c);
  const subject = t(`email.customer.${event}.subject`, v);
  const body = customerBody(event, c);
  const dir = /^(ar|he)/.test(c.locale) ? 'rtl' : 'ltr';
  return {
    subject,
    html: layout({
      title: subject,
      // Trade-ins belong to site members, who see details and respond from their account.
      paragraphs: [t(body, v), t('email.reference', v), t('email.viewInAccount', v)],
      footer: t('email.footer', v),
      dir,
    }),
  };
}

function customerBody(event: CustomerNotificationEvent, c: Ctx): MessageKey {
  switch (event) {
    case 'submitted':
      return c.doc.customItem ? 'email.customer.submitted.custom' : 'email.customer.submitted.body';
    case 'quote_decision':
      if (c.doc.status === 'approved') return 'email.customer.quote_decision.accepted';
      return c.actorType === 'system' ? 'email.customer.quote_decision.expired' : 'email.customer.quote_decision.declined';
    case 'revised_offer_decision':
      if (c.doc.status !== 'return_pending' && c.doc.status !== 'revised_offer_declined') return 'email.customer.revised_offer_decision.accepted';
      // The system declines on the customer's behalf only when the offer expired.
      return c.actorType === 'system' ? 'email.customer.revised_offer_decision.expired' : 'email.customer.revised_offer_decision.declined';
    case 'cancellation':
      return c.actorType === 'customer' ? 'email.customer.cancellation.byCustomer' : 'email.customer.cancellation.body';
    case 'credit_issued':
      // Don't promise a Wix email that didn't go out.
      return codeNotSent(c.doc) ? 'email.customer.credit_issued.codePending' : 'email.customer.credit_issued.body';
    default:
      return `email.customer.${event}.body`;
  }
}

export function merchantEmail(event: MerchantNotificationEvent, c: Ctx): EmailContent {
  const t = createTranslator(c.locale);
  const v = vars(c);
  const subject = t(`email.merchant.${event}.subject`, v);
  const body: MessageKey =
    event === 'credit_issued' && codeNotSent(c.doc)
      ? 'email.merchant.credit_issued.codeNotSent'
      : event === 'shipped' && c.doc.trackingNumber
        ? 'email.merchant.shipped.withTracking'
        : event === 'submitted' && c.doc.customItem
          ? 'email.merchant.submitted.custom'
        : `email.merchant.${event}.body`;
  return {
    subject,
    html: layout({ title: subject, paragraphs: [t(body, v), t('email.openDashboard')], footer: t('email.footer', v), dir: 'ltr' }),
  };
}
