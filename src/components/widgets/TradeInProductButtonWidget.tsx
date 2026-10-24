import React, { useEffect, useState } from 'react';
import { formatMoney } from '../../lib/money';
import type { ProductCtaResponse } from '../../lib/schemas/api';
import { widgetApi } from './shared/api';
import { useSiteEnv } from './shared/env';
import { useWidget, WidgetThemeProvider } from './shared/WidgetThemeProvider';

export type TradeInProductButtonWidgetProps = { styleConfig?: string | null; productId?: string | null };

// Product-page call to action. The product ID comes from the Stores product page plugin API;
// eligibility and the "up to" amount are computed by the server from the live catalog.
export function TradeInProductButtonWidget({ styleConfig, productId }: TradeInProductButtonWidgetProps) {
  const env = useSiteEnv();
  return (
    <WidgetThemeProvider styleConfig={styleConfig} locale={env.locale} isEditor={env.isEditor} as="div" className="ti-root--cta">
      {env.ready && <Cta productId={productId ?? undefined} isEditor={env.isEditor} />}
    </WidgetThemeProvider>
  );
}

function Cta({ productId, isEditor }: { productId?: string; isEditor: boolean }) {
  const { t, locale, style } = useWidget();
  const [data, setData] = useState<ProductCtaResponse>();

  useEffect(() => {
    if (isEditor || !productId) return;
    widgetApi.productCta(productId).then(setData, () => setData({ eligible: false }));
  }, [productId, isEditor]);

  // In the Editor, show the styled button so merchants can design it; on the site, render
  // nothing for ineligible products or when no trade-in page is configured.
  const preview = isEditor;
  if (!preview && (!data?.eligible || !data.formPageUrl || !productId)) return null;

  const href = (() => {
    if (preview || !data?.formPageUrl || !productId) return undefined;
    const url = new URL(data.formPageUrl);
    url.searchParams.set('product', productId);
    return url.toString();
  })();
  const upTo = preview ? formatMoney(12000, 'USD', locale) : data?.upToMinor !== undefined && data.currency ? formatMoney(data.upToMinor, data.currency, locale) : undefined;
  const align = style.layout.alignment === 'center' ? 'center' : 'flex-start';

  return (
    <div className="ti-cta" style={{ ['--ti-cta-align' as string]: align }}>
      {href ? (
        <a className="ti-button ti-button--primary" href={href}>{style.content.primaryLabel || t('cta.label')}</a>
      ) : (
        <button type="button" className="ti-button ti-button--primary" aria-disabled="true">{style.content.primaryLabel || t('cta.label')}</button>
      )}
      {style.content.showProductEstimate && upTo && <span className="ti-helper">{t('form.offer.upTo', { amount: upTo })}</span>}
      {style.content.showHelperText && <span className="ti-helper">{t('cta.helper')}</span>}
    </div>
  );
}
