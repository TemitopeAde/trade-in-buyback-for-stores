import React from 'react';
import { formatDate, formatDateTime } from '../../../lib/i18n';
import { formatMoney } from '../../../lib/money';
import type { CustomerTimelineEntry, CustomerTradeInView } from '../../../lib/schemas/api';
import { WidgetButton, WidgetCard } from './primitives';
import { useWidget } from './WidgetThemeProvider';

export function TradeInStatusTimeline({ entries }: { entries: CustomerTimelineEntry[] }) {
  const { t, locale } = useWidget();
  return (
    <ol className="ti-timeline">
      {[...entries].reverse().map((e, i) => (
        <li key={`${e.status}-${i}`}>
          <span className="ti-timeline__dot" aria-hidden="true" />
          <span>
            <strong>{t(`status.${e.status}`)}</strong>
            <br />
            <time className="ti-helper" dateTime={e.at}>{formatDateTime(e.at, locale)}</time>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A custom item's offer from the store; accepting approves the trade-in, declining closes it. */
export function QuoteCard(props: {
  view: CustomerTradeInView;
  busyAction?: string;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t, locale } = useWidget();
  const quote = props.view.quote;
  if (!quote) return null;
  const amount = formatMoney(quote.amountMinor, props.view.currency, locale);
  const canRespond = props.view.actions.includes('accept_quote');
  return (
    <WidgetCard as="section">
      <div className="ti-fields">
        <h3 className="ti-subheading">{t('quote.title')}</h3>
        <p style={{ margin: 0 }}>{t('quote.body', { amount })}</p>
        {quote.expiresAt && canRespond && <p className="ti-helper">{t('revised.expires', { date: formatDate(quote.expiresAt, locale) })}</p>}
        {canRespond && (
          <div className="ti-row">
            <WidgetButton busy={props.busyAction === 'accept_quote'} disabled={!!props.busyAction} onClick={props.onAccept}>
              {t('revised.accept', { amount })}
            </WidgetButton>
            <WidgetButton variant="secondary" busy={props.busyAction === 'decline_quote'} disabled={!!props.busyAction} onClick={props.onDecline}>
              {t('quote.decline')}
            </WidgetButton>
          </div>
        )}
      </div>
    </WidgetCard>
  );
}

export function RevisedOfferCard(props: {
  view: CustomerTradeInView;
  busyAction?: string;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t, locale } = useWidget();
  const offer = props.view.revisedOffer;
  if (!offer) return null;
  const amount = formatMoney(offer.amountMinor, props.view.currency, locale);
  const original = formatMoney(props.view.estimatedValueMinor, props.view.currency, locale);
  const canRespond = props.view.actions.includes('accept_revised_offer');
  return (
    <WidgetCard as="section">
      <div className="ti-fields">
        <h3 className="ti-subheading">{t('revised.title')}</h3>
        <p style={{ margin: 0 }}>{t('revised.body', { amount, original })}</p>
        {offer.reason && <p className="ti-helper">{t('revised.reason', { reason: offer.reason })}</p>}
        {offer.expiresAt && canRespond && <p className="ti-helper">{t('revised.expires', { date: formatDate(offer.expiresAt, locale) })}</p>}
        {canRespond && (
          <div className="ti-row">
            <WidgetButton busy={props.busyAction === 'accept_revised_offer'} disabled={!!props.busyAction} onClick={props.onAccept}>
              {t('revised.accept', { amount })}
            </WidgetButton>
            <WidgetButton variant="secondary" busy={props.busyAction === 'decline_revised_offer'} disabled={!!props.busyAction} onClick={props.onDecline}>
              {t('revised.decline')}
            </WidgetButton>
          </div>
        )}
      </div>
    </WidgetCard>
  );
}
