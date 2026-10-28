import React, { useCallback, useEffect, useId, useState } from 'react';
import { formatDate } from '../../lib/i18n';
import { toPublicMediaUrl } from '../../lib/media';
import { formatMoney } from '../../lib/money';
import type { CustomerTradeInView, MyTradeInRow } from '../../lib/schemas/api';
import { errorMessageKey, widgetApi } from './shared/api';
import { newIdempotencyKey, readQueryParam, scrubQueryParam, useSiteEnv } from './shared/env';
import { Alert, Loading, TradeInEmptyState, TradeInErrorState, WidgetButton, WidgetCard, WidgetField, WidgetHeader } from './shared/primitives';
import { QuoteCard, RevisedOfferCard, TradeInStatusTimeline } from './shared/Status';
import { useWidget, WidgetThemeProvider } from './shared/WidgetThemeProvider';

export type TradeInStatusWidgetProps = { styleConfig?: string | null; embedded?: boolean; designMode?: boolean };

// `embedded`: rendered inside an Editor React component, which owns the title, description and
// region landmark. `designMode`: the host knows it is in Editor design mode, so show the preview.
// Access is by a scoped access token (?ti= from the email/success link) or, for members, by
// ?id= of a trade-in they own. The token is removed from the address bar after it's read.
// Opened without a link, a signed-in member sees their own trade-ins (resolved on the server
// from the verified session); visitors see the lookup hint.
export function TradeInStatusWidget({ styleConfig, embedded, designMode }: TradeInStatusWidgetProps) {
  const env = useSiteEnv();
  const isEditor = !!designMode || env.isEditor;
  const [ref, setRef] = useState<{ token?: string; tradeInId?: string }>();
  useEffect(() => {
    if (!env.ready || isEditor) return;
    const token = readQueryParam('ti');
    const tradeInId = readQueryParam('id');
    scrubQueryParam('ti');
    setRef({ token: token && /^[A-Za-z0-9_-]{20,100}$/.test(token) ? token : undefined, tradeInId: tradeInId && /^[A-Za-z0-9-]{1,64}$/.test(tradeInId) ? tradeInId : undefined });
  }, [env.ready, isEditor]);

  return (
    <WidgetThemeProvider
      styleConfig={styleConfig}
      locale={env.locale}
      currency={env.currency}
      isEditor={isEditor}
      as={embedded ? 'div' : 'section'}
      hostHeader={embedded}
      labelledBy={embedded ? undefined : 'ti-status-title'}
    >
      {!env.ready && !designMode ? null : isEditor ? <StatusEditorPreview /> : ref && (
        <div className="ti-stack">
          <StatusHeader />
          {ref.token || ref.tradeInId ? <TradeInStatusView accessToken={ref.token} tradeInId={ref.tradeInId} /> : <MemberStatus />}
        </div>
      )}
    </WidgetThemeProvider>
  );
}

function StatusHeader() {
  const { t } = useWidget();
  return <WidgetHeader id="ti-status-title" defaultTitle={t('status.title')} defaultDescription={t('status.description')} />;
}

function LookupHint() {
  const { t } = useWidget();
  return <TradeInEmptyState body={t('status.lookupLabel')} />;
}

/** The signed-in member's trade-ins, newest first, with a picker when there is more than one. */
function MemberStatus() {
  const { t, locale } = useWidget();
  const [rows, setRows] = useState<MyTradeInRow[]>();
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState<string>();
  const pickerId = useId();

  const load = useCallback(() => {
    setError(undefined);
    widgetApi.mine(0).then(
      (res) => {
        const items = res.signedIn ? res.items : [];
        setRows(items);
        setSelected((prev) => (prev && items.some((r) => r.tradeInId === prev) ? prev : items[0]?.tradeInId));
      },
      (err) => setError(t(errorMessageKey(err))),
    );
  }, [t]);
  useEffect(load, [load]);

  if (error) return <TradeInErrorState message={error} onRetry={load} />;
  if (!rows) return <Loading />;
  if (!rows.length || !selected) return <LookupHint />;

  return (
    <div className="ti-stack">
      {rows.length > 1 && (
        <div className="ti-fields" style={{ gap: 6 }}>
          <label className="ti-label" htmlFor={pickerId}>{t('mine.title')}</label>
          <select id={pickerId} className="ti-select" value={selected} onChange={(e) => setSelected(e.target.value)}>
            {rows.map((r) => (
              <option key={r.tradeInId} value={r.tradeInId}>
                {r.productTitle} · {r.reference} · {formatDate(r.createdAt, locale)}
              </option>
            ))}
          </select>
        </div>
      )}
      <TradeInStatusView key={selected} tradeInId={selected} />
    </div>
  );
}

export function TradeInStatusView({ accessToken, tradeInId }: { accessToken?: string; tradeInId?: string }) {
  const { t, locale, style } = useWidget();
  const [view, setView] = useState<CustomerTradeInView>();
  const [error, setError] = useState<string>();
  const [busyAction, setBusyAction] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [tracking, setTracking] = useState('');

  const load = useCallback(() => {
    setError(undefined);
    widgetApi.status({ token: accessToken, tradeInId }).then(setView, (err) => setError(t(errorMessageKey(err))));
  }, [accessToken, tradeInId, t]);
  useEffect(load, [load]);

  const act = async (action: CustomerTradeInView['actions'][number], extra?: { trackingNumber?: string }) => {
    if (!view || busyAction) return;
    if (action === 'cancel' && !globalThis.confirm(t('status.cancelConfirm'))) return;
    if (action === 'decline_revised_offer' && !globalThis.confirm(t('revised.declineConfirm'))) return;
    if (action === 'decline_quote' && !globalThis.confirm(t('quote.declineConfirm'))) return;
    setBusyAction(action);
    setActionError(undefined);
    try {
      setView(await widgetApi.customerAction({ token: accessToken, tradeInId: view.tradeInId, action, expectedRevision: view.revision, idempotencyKey: newIdempotencyKey(), ...extra }));
    } catch (err) {
      setActionError(t(errorMessageKey(err)));
      load();
    } finally {
      setBusyAction(undefined);
    }
  };

  if (error) return <TradeInErrorState message={error} onRetry={load} />;
  if (!view) return <Loading />;

  const money = (minor: number) => formatMoney(minor, view.currency, locale);
  const handoff = view.handoff;
  return (
    <div className="ti-stack">
      <WidgetCard as="section">
        <div className="ti-fields">
          <div className="ti-row ti-row--between">
            <span className="ti-helper">{t('common.reference')}: <strong>{view.reference}</strong></span>
            <span className="ti-status-chip">{t(`status.${view.status}`)}</span>
          </div>
          <div className="ti-row" style={{ alignItems: 'flex-start' }}>
            {toPublicMediaUrl(view.product.imageUrl) && (
              <img
                src={toPublicMediaUrl(view.product.imageUrl)}
                alt=""
                style={{ inlineSize: 72, blockSize: 72, objectFit: 'cover', borderRadius: 8 }}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            )}
            <div className="ti-fields" style={{ gap: 4, flex: 1, minInlineSize: 0 }}>
              <strong>{view.product.title}</strong>
              <span className="ti-helper">{formatDate(view.createdAt, locale)}</span>
            </div>
          </div>
          <div role="status" aria-live="polite">
            <p className="ti-label" style={{ marginBlockEnd: 4 }}>{t('status.latest')}</p>
            <p style={{ margin: 0 }}>{view.status === 'credit_issued' && view.giftCardCodePending ? t('statusMessage.credit_issued_codePending') : t(`statusMessage.${view.status}`)}</p>
            {view.rejectionReason && <p className="ti-helper">{t('status.rejectionReason', { reason: view.rejectionReason })}</p>}
          </div>
          <div className="ti-row">
            {view.custom && !view.estimatedValueMinor && view.finalValueMinor === undefined ? (
              <span>{t('status.estimated')}: <strong>{t('status.awaitingOffer')}</strong></span>
            ) : (
              <span>{view.finalValueMinor !== undefined ? t('status.final') : t('status.estimated')}: <strong>{money(view.finalValueMinor ?? view.estimatedValueMinor)}</strong></span>
            )}
          </div>
        </div>
      </WidgetCard>

      {actionError && <Alert tone="error">{actionError}</Alert>}

      {view.status === 'quote_pending' && (
        <QuoteCard view={view} busyAction={busyAction} onAccept={() => act('accept_quote')} onDecline={() => act('decline_quote')} />
      )}

      {view.status === 'revised_offer_pending' && (
        <RevisedOfferCard view={view} busyAction={busyAction} onAccept={() => act('accept_revised_offer')} onDecline={() => act('decline_revised_offer')} />
      )}

      {(handoff.address || handoff.instructions || view.actions.includes('mark_in_transit')) && (
        <WidgetCard as="section">
          <div className="ti-fields">
            <h3 className="ti-subheading">{t('status.handoffTitle')}</h3>
            <p style={{ margin: 0 }}><strong>{t(handoff.method === 'drop_off' ? 'handoff.drop_off' : 'handoff.ship_in')}</strong></p>
            {handoff.address && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}><span className="ti-label">{t('handoff.address')}</span>{handoff.address}</p>}
            {handoff.instructions && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}><span className="ti-label">{t('handoff.instructions')}</span>{handoff.instructions}</p>}
            {view.actions.includes('mark_in_transit') && (
              <div className="ti-fields">
                {handoff.allowTracking && (
                  <WidgetField label={t('status.trackingLabel')}>
                    {(a11y) => <input {...a11y} className="ti-input" value={tracking} maxLength={80} onChange={(e) => setTracking(e.target.value)} />}
                  </WidgetField>
                )}
                <WidgetButton busy={busyAction === 'mark_in_transit'} disabled={!!busyAction} onClick={() => act('mark_in_transit', { trackingNumber: tracking.trim() || undefined })}>
                  {style.content.primaryLabel || t('status.trackingSubmit')}
                </WidgetButton>
              </div>
            )}
          </div>
        </WidgetCard>
      )}

      {style.content.showTimelineDetails && view.timeline.length > 0 && (
        <WidgetCard as="section">
          <div className="ti-fields">
            <h3 className="ti-subheading">{t('status.timeline')}</h3>
            <TradeInStatusTimeline entries={view.timeline} />
          </div>
        </WidgetCard>
      )}

      {view.actions.includes('cancel') && (
        <div className="ti-row">
          <WidgetButton variant="secondary" busy={busyAction === 'cancel'} disabled={!!busyAction} onClick={() => act('cancel')}>
            {style.content.secondaryLabel || t('status.cancel')}
          </WidgetButton>
        </div>
      )}
    </div>
  );
}

function StatusEditorPreview() {
  const { t, locale, currency, style } = useWidget();
  const now = new Date();
  return (
    <div className="ti-stack">
      <StatusHeader />
      <WidgetCard as="section">
        <div className="ti-fields">
          <div className="ti-row ti-row--between">
            <span className="ti-helper">{t('common.reference')}: <strong>TI-XXXX-XXXX</strong></span>
            <span className="ti-status-chip">{t('status.approved')}</span>
          </div>
          <strong>{t('preview.productTitle')}</strong>
          <p style={{ margin: 0 }}>{t('statusMessage.approved')}</p>
          {currency && <span>{t('status.estimated')}: <strong>{formatMoney(12000, currency, locale)}</strong></span>}
        </div>
      </WidgetCard>
      {style.content.showTimelineDetails && (
        <WidgetCard as="section">
          <div className="ti-fields">
            <h3 className="ti-subheading">{t('status.timeline')}</h3>
            <TradeInStatusTimeline entries={[{ status: 'submitted', at: now.toISOString() }, { status: 'approved', at: now.toISOString() }]} />
          </div>
        </WidgetCard>
      )}
      <Alert tone="info">{t('common.editorPlaceholder')}</Alert>
    </div>
  );
}
