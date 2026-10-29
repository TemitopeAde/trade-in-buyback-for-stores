import React, { useCallback, useEffect, useState } from 'react';
import { formatDate } from '../../lib/i18n';
import { formatMoney } from '../../lib/money';
import type { MyTradeInRow } from '../../lib/schemas/api';
import { errorMessageKey, widgetApi } from './shared/api';
import { useSiteEnv } from './shared/env';
import { MemberGate } from './shared/MemberGate';
import { Alert, Loading, TradeInEmptyState, TradeInErrorState, WidgetButton, WidgetHeader } from './shared/primitives';
import { useWidget, WidgetThemeProvider } from './shared/WidgetThemeProvider';
import { TradeInStatusView } from './TradeInStatusWidget';

export type MyTradeInsWidgetProps = { styleConfig?: string | null; embedded?: boolean; designMode?: boolean };

// Lists the signed-in member's trade-ins. Membership is resolved on the server from the
// verified session; the widget never sends a member ID.
// `embedded`: rendered inside an Editor React component, which owns the title, description and
// region landmark. `designMode`: the host knows it is in Editor design mode, so show the preview.
export function MyTradeInsWidget({ styleConfig, embedded, designMode }: MyTradeInsWidgetProps) {
  const env = useSiteEnv();
  const isEditor = !!designMode || env.isEditor;
  return (
    <WidgetThemeProvider
      styleConfig={styleConfig}
      locale={env.locale}
      currency={env.currency}
      isEditor={isEditor}
      as={embedded ? 'div' : 'section'}
      hostHeader={embedded}
      labelledBy={embedded ? undefined : 'ti-mine-title'}
    >
      {!env.ready && !designMode ? null : (
        <div className="ti-stack">
          <MineHeader />
          {isEditor ? <MinePreview /> : <MemberGate message="mine.signIn"><MineList /></MemberGate>}
        </div>
      )}
    </WidgetThemeProvider>
  );
}

function MineHeader() {
  const { t } = useWidget();
  return <WidgetHeader id="ti-mine-title" defaultTitle={t('mine.title')} defaultDescription={t('mine.description')} />;
}

function MineList() {
  const { t, locale } = useWidget();
  const [open, setOpen] = useState<string>();
  const [rows, setRows] = useState<MyTradeInRow[]>([]);
  const [next, setNext] = useState<number | undefined>(0);
  const [signedIn, setSignedIn] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback((cursor: number) => {
    setLoading(true);
    setError(undefined);
    widgetApi.mine(cursor).then(
      (res) => {
        setSignedIn(res.signedIn);
        setRows((prev) => (cursor === 0 ? res.items : [...prev, ...res.items]));
        setNext(res.nextCursor);
      },
      (err) => setError(t(errorMessageKey(err))),
    ).finally(() => setLoading(false));
  }, [t]);
  useEffect(() => load(0), [load]);

  if (error) return <TradeInErrorState message={error} onRetry={() => load(0)} />;
  // The session can lapse after the gate passed.
  if (!signedIn) return <Alert tone="info">{t('mine.signIn')}</Alert>;
  if (!rows.length && loading) return <Loading />;
  if (!rows.length) return <TradeInEmptyState body={t('mine.empty')} />;

  return (
    <div className="ti-stack">
      <ul className="ti-list">
        {rows.map((r) => {
          const expanded = open === r.tradeInId;
          const detailsId = `ti-mine-${r.tradeInId}`;
          return (
            <li key={r.tradeInId} className="ti-list__item">
              <span><strong>{r.productTitle}</strong></span>
              <span className="ti-status-chip">{t(`status.${r.status}`)}</span>
              <span className="ti-list__meta">
                {t('common.reference')}: {r.reference} · {formatDate(r.createdAt, locale)} · {r.custom && !r.estimatedValueMinor ? t('status.awaitingOffer') : formatMoney(r.estimatedValueMinor, r.currency, locale)}
              </span>
              <button
                type="button"
                className="ti-button ti-button--link"
                aria-expanded={expanded}
                aria-controls={detailsId}
                aria-label={`${t(expanded ? 'mine.hideDetails' : 'common.viewDetails')}: ${r.reference}`}
                onClick={() => setOpen(expanded ? undefined : r.tradeInId)}
              >
                {t(expanded ? 'mine.hideDetails' : 'common.viewDetails')}
              </button>
              {expanded && <div id={detailsId} className="ti-list__details"><TradeInStatusView tradeInId={r.tradeInId} /></div>}
            </li>
          );
        })}
      </ul>
      <div className="ti-row ti-row--between">
        {next !== undefined && <WidgetButton variant="secondary" busy={loading} onClick={() => load(next)}>{t('mine.loadMore')}</WidgetButton>}
      </div>
    </div>
  );
}

function MinePreview() {
  const { t, locale, currency } = useWidget();
  return (
    <div className="ti-stack">
      <ul className="ti-list">
        {(['approved', 'credit_issued'] as const).map((status, i) => (
          <li key={status} className="ti-list__item">
            <span><strong>{t('preview.productTitle')}</strong></span>
            <span className="ti-status-chip">{t(`status.${status}`)}</span>
            <span className="ti-list__meta">{t('common.reference')}: TI-XXXX-000{i} · {formatDate(new Date(), locale)}{currency && <> · {formatMoney(12000, currency, locale)}</>}</span>
          </li>
        ))}
      </ul>
      <Alert tone="info">{t('common.editorPlaceholder')}</Alert>
    </div>
  );
}
