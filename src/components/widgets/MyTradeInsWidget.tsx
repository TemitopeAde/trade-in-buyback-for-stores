import React, { useCallback, useEffect, useState } from 'react';
import { formatDate } from '../../lib/i18n';
import { formatMoney } from '../../lib/money';
import type { MyTradeInRow } from '../../lib/schemas/api';
import { errorMessageKey, widgetApi } from './shared/api';
import { useSiteEnv } from './shared/env';
import { Alert, Loading, TradeInEmptyState, TradeInErrorState, WidgetButton, WidgetHeader } from './shared/primitives';
import { useWidget, WidgetThemeProvider } from './shared/WidgetThemeProvider';

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
      isEditor={isEditor}
      as={embedded ? 'div' : 'section'}
      hostHeader={embedded}
      labelledBy={embedded ? undefined : 'ti-mine-title'}
    >
      {!env.ready && !designMode ? null : (
        <div className="ti-stack">
          <MineHeader />
          {isEditor ? <MinePreview /> : <MineList />}
        </div>
      )}
    </WidgetThemeProvider>
  );
}

function safeUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function MineHeader() {
  const { t } = useWidget();
  return <WidgetHeader id="ti-mine-title" defaultTitle={t('mine.title')} defaultDescription={t('mine.description')} />;
}

function MineList() {
  const { t, locale, style } = useWidget();
  const [links, setLinks] = useState<{ statusPageUrl?: string; formPageUrl?: string }>({});
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
        setLinks({ statusPageUrl: safeUrl(res.statusPageUrl), formPageUrl: safeUrl(res.formPageUrl) });
        setRows((prev) => (cursor === 0 ? res.items : [...prev, ...res.items]));
        setNext(res.nextCursor);
      },
      (err) => setError(t(errorMessageKey(err))),
    ).finally(() => setLoading(false));
  }, [t]);
  useEffect(() => load(0), [load]);

  const { statusPageUrl, formPageUrl } = links;
  const startAction = formPageUrl ? <a className="ti-button ti-button--primary" href={formPageUrl}>{style.content.primaryLabel || t('mine.startNew')}</a> : undefined;

  if (error) return <TradeInErrorState message={error} onRetry={() => load(0)} />;
  if (!signedIn) return <Alert tone="info">{t('mine.signIn')}</Alert>;
  if (!rows.length && loading) return <Loading />;
  if (!rows.length) return <TradeInEmptyState body={t('mine.empty')} action={startAction} />;

  const detailHref = (id: string) => {
    if (!statusPageUrl) return undefined;
    const url = new URL(statusPageUrl);
    url.searchParams.set('id', id);
    return url.toString();
  };

  return (
    <div className="ti-stack">
      <ul className="ti-list">
        {rows.map((r) => {
          const href = detailHref(r.tradeInId);
          return (
            <li key={r.tradeInId} className="ti-list__item">
              <span><strong>{r.productTitle}</strong></span>
              <span className="ti-status-chip">{t(`status.${r.status}`)}</span>
              <span className="ti-list__meta">
                {t('common.reference')}: {r.reference} · {formatDate(r.createdAt, locale)} · {formatMoney(r.estimatedValueMinor, r.currency, locale)}
              </span>
              {href && <a className="ti-button ti-button--link" href={href} aria-label={`${t('common.viewDetails')}: ${r.reference}`}>{t('common.viewDetails')}</a>}
            </li>
          );
        })}
      </ul>
      <div className="ti-row ti-row--between">
        {next !== undefined ? <WidgetButton variant="secondary" busy={loading} onClick={() => load(next)}>{t('mine.loadMore')}</WidgetButton> : <span />}
        {startAction}
      </div>
    </div>
  );
}

function MinePreview() {
  const { t, locale } = useWidget();
  return (
    <div className="ti-stack">
      <ul className="ti-list">
        {(['approved', 'credit_issued'] as const).map((status, i) => (
          <li key={status} className="ti-list__item">
            <span><strong>{t('preview.productTitle')}</strong></span>
            <span className="ti-status-chip">{t(`status.${status}`)}</span>
            <span className="ti-list__meta">{t('common.reference')}: TI-XXXX-000{i} · {formatDate(new Date(), locale)} · {formatMoney(12000, 'USD', locale)}</span>
          </li>
        ))}
      </ul>
      <Alert tone="info">{t('common.editorPlaceholder')}</Alert>
    </div>
  );
}
