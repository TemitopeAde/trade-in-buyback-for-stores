import { createTranslator, type MessageKey } from '../../lib/i18n';
import { formatMoney } from '../../lib/money';
import type { CustomerNotificationEvent, MerchantNotificationEvent } from '../../lib/schemas/domain';
import type { TradeInDoc } from '../types';

// Builds email subject/HTML from catalog strings. Every interpolated value is HTML-escaped;
// emails never include media URLs, gift card codes, tokens beyond the scoped status link, or
// internal notes.

export type EmailContent = { subject: string; html: string };

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

type Ctx = { doc: TradeInDoc; locale: string; storeName: string; statusUrl?: string; extra?: Record<string, string> };

function vars(c: Ctx) {
  const money = (minor?: number) => (minor === undefined ? '' : formatMoney(minor, c.doc.currency, c.locale));
  return {
    reference: c.doc.reference,
    item: c.doc.productTitle,
    name: c.doc.customerName,
    amount: money(c.doc.revisedValueMinor ?? c.doc.finalValueMinor ?? c.doc.estimatedValueMinor),
    original: money(c.doc.estimatedValueMinor),
    reason: c.doc.status === 'revised_offer_pending' ? (c.doc.revisedOfferReason ?? '') : (c.doc.rejectionReason ?? ''),
    date: c.doc.revisedOfferExpiresAt ? new Intl.DateTimeFormat(c.locale, { dateStyle: 'medium' }).format(new Date(c.doc.revisedOfferExpiresAt)) : '',
    store: c.storeName,
    ...c.extra,
  };
}

export function customerEmail(event: CustomerNotificationEvent, c: Ctx): EmailContent {
  const t = createTranslator(c.locale);
  const v = vars(c);
  const subject = t(`email.customer.${event}.subject`, v);
  const body: MessageKey =
    event === 'revised_offer_decision'
      ? (c.doc.status === 'return_pending' || c.doc.status === 'revised_offer_declined' ? 'email.customer.revised_offer_decision.declined' : 'email.customer.revised_offer_decision.accepted')
      : (`email.customer.${event}.body` as MessageKey);
  const dir = /^(ar|he)/.test(c.locale) ? 'rtl' : 'ltr';
  return {
    subject,
    html: layout({
      title: subject,
      paragraphs: [t(body, v), t('email.reference', v)],
      link: c.statusUrl ? { href: c.statusUrl, label: t('email.viewStatus') } : undefined,
      footer: t('email.footer', v),
      dir,
    }),
  };
}

export function merchantEmail(event: MerchantNotificationEvent, c: Ctx): EmailContent {
  const t = createTranslator(c.locale);
  const v = vars(c);
  const subject = t(`email.merchant.${event}.subject`, v);
  return {
    subject,
    html: layout({ title: subject, paragraphs: [t(`email.merchant.${event}.body`, v), t('email.openDashboard')], footer: t('email.footer', v), dir: 'ltr' }),
  };
}
