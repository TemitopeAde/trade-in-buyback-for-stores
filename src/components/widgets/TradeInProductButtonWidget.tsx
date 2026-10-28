import React, { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatMoney } from '../../lib/money';
import type { ProductCtaResponse } from '../../lib/schemas/api';
import { widgetApi } from './shared/api';
import { useSiteEnv } from './shared/env';
import { Loading } from './shared/primitives';
import { useWidget, WidgetThemeProvider } from './shared/WidgetThemeProvider';
import { FormEditorPreview, FormFlow } from './TradeInFormWidget';

export type TradeInProductButtonWidgetProps = { styleConfig?: string | null; productId?: string | null };

// Product-page call to action. The product ID comes from the Stores product page plugin API;
// eligibility and the "up to" amount are computed by the server from the live catalog.
export function TradeInProductButtonWidget({ styleConfig, productId }: TradeInProductButtonWidgetProps) {
  const env = useSiteEnv();
  return (
    <WidgetThemeProvider styleConfig={styleConfig} kind="product-cta" locale={env.locale} currency={env.currency} isEditor={env.isEditor} as="div" className="ti-root--cta">
      <Cta productId={productId ?? undefined} styleConfig={styleConfig} isEditor={env.isEditor} envReady={env.ready} />
    </WidgetThemeProvider>
  );
}

function buildCtaHref(formPageUrl: string | undefined, productId: string | undefined): string | undefined {
  if (!productId) return undefined;
  const base = formPageUrl?.trim() || '/trade-in';
  try {
    const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://localhost';
    const url = new URL(base, origin);
    url.searchParams.set('product', productId);
    if (formPageUrl && /^https?:\/\//i.test(formPageUrl)) {
      return url.toString();
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}product=${encodeURIComponent(productId)}`;
  }
}

function Cta({
  productId,
  styleConfig,
  isEditor,
  envReady,
}: {
  productId?: string;
  styleConfig?: string | null;
  isEditor: boolean;
  envReady: boolean;
}) {
  const { t, locale, currency, style } = useWidget();
  const [data, setData] = useState<ProductCtaResponse>();
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const pausedId = useId();

  useEffect(() => {
    if (!envReady) return;
    if (isEditor || !productId) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    widgetApi.productCta(productId).then(
      (res) => {
        if (alive) {
          setData(res);
          setLoading(false);
        }
      },
      () => {
        if (alive) {
          setData({ eligible: false });
          setLoading(false);
        }
      }
    );
    return () => {
      alive = false;
    };
  }, [productId, isEditor, envReady]);

  // In the Editor, show the styled button so merchants can design it; on the site, render
  // a preloader until data is ready, and then render nothing for ineligible products. A product
  // that qualifies while the store isn't accepting requests gets a disabled button and a note.
  const preview = envReady && isEditor;
  const align = style.layout.alignment === 'center' ? 'center' : 'flex-start';

  if (!preview) {
    if ((!envReady && productId) || (envReady && loading)) {
      return (
        <div className="ti-cta" style={{ ['--ti-cta-align' as string]: align }}>
          <Loading label="" className="ti-cta__preloader" />
        </div>
      );
    }
    if (!productId || (!data?.eligible && data?.accepting !== false)) return null;
  }
  const paused = !preview && data?.accepting === false;

  const href = preview ? undefined : buildCtaHref(data?.formPageUrl, productId);
  const upTo = preview
    ? currency && formatMoney(12000, currency, locale)
    : data?.upToMinor !== undefined && data.currency
      ? formatMoney(data.upToMinor, data.currency, locale)
      : undefined;

  const handleClick = () => {
    setOpen(true);
  };

  return (
    <>
      <div className="ti-cta" style={{ ['--ti-cta-align' as string]: align }}>
        {/* Always a <button> — never an <a> — so the Wix custom-element
            context cannot follow the href before React handles the click. */}
        <button
          type="button"
          className="ti-button ti-button--primary"
          onClick={paused ? undefined : handleClick}
          disabled={paused}
          aria-describedby={paused ? pausedId : undefined}
          {...(href && !paused ? { 'data-href': href } : {})}
        >
          {style.content.primaryLabel || t('cta.label')}
        </button>
        {paused ? (
          <span id={pausedId} className="ti-helper">{t('cta.paused')}</span>
        ) : (
          <>
            {style.content.showProductEstimate && upTo && <span className="ti-helper">{t('form.offer.upTo', { amount: upTo })}</span>}
            {style.content.showHelperText && <span className="ti-helper">{t('cta.helper')}</span>}
          </>
        )}
      </div>

      {open && (
        <TradeInDrawer
          productId={productId}
          styleConfig={styleConfig}
          locale={locale}
          currency={currency}
          isEditor={isEditor}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function TradeInDrawer({
  productId,
  styleConfig,
  locale,
  currency,
  isEditor,
  onClose,
}: {
  productId?: string;
  styleConfig?: string | null;
  locale: string;
  currency?: string;
  isEditor: boolean;
  onClose: () => void;
}) {
  const { t } = useWidget();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <WidgetThemeProvider
      styleConfig={styleConfig}
      locale={locale}
      currency={currency}
      isEditor={isEditor}
      as="div"
      className="ti-drawer-overlay"
    >
      <div className="ti-drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside
        className="ti-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ti-drawer-title"
      >
        <header className="ti-drawer__header">
          <h2 id="ti-drawer-title" className="ti-drawer__title">
            {t('form.title')}
          </h2>
          <button
            type="button"
            className="ti-drawer__close"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            &times;
          </button>
        </header>
        <div className="ti-drawer__body">
          {isEditor ? <FormEditorPreview /> : <FormFlow initialProductId={productId} onClose={onClose} />}
        </div>
      </aside>
    </WidgetThemeProvider>,
    document.body
  );
}
