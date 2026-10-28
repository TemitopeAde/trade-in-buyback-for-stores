// Renders one real app component per ?scene=, inside a minimal sample storefront where a
// widget would sit on a merchant's site. Only the host page and data are stand-ins; every
// trade-in UI element below is the production component.

import React, { type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { TradeInFormWidget } from '../../src/components/widgets/TradeInFormWidget';
import { TradeInProductButtonWidget } from '../../src/components/widgets/TradeInProductButtonWidget';
import { TradeInStatusWidget } from '../../src/components/widgets/TradeInStatusWidget';
import { TradeInWidgetSettingsPanel } from '../../src/components/editor/TradeInWidgetSettingsPanel';
import { TradeInDashboard } from '../../src/dashboard/App';
import { PLAN_ENTITLEMENTS } from '../../src/lib/plans';
import { serializeStyleConfig, themeDefaults, type ThemeName, type WidgetKind } from '../../src/lib/style/style-config';
import './host.css';

const params = new URLSearchParams(location.search);
const scene = params.get('scene') ?? 'form';
const mobile = params.has('mobile');
const theme = (params.get('theme') ?? 'light') as ThemeName;
const style = (kind: WidgetKind) => serializeStyleConfig(themeDefaults(theme, kind), kind);

function Store({ children, narrow }: { children: ReactNode; narrow?: boolean }) {
  return (
    <div className={`store${mobile ? ' store--mobile' : ''}`}>
      <header className="store__nav">
        <b>NORTHLINE</b>
        {!mobile && <nav><span>Shop</span><span>Trade in</span><span>Support</span><span>Cart (1)</span></nav>}
        {mobile && <span className="store__menu" aria-hidden="true">☰</span>}
      </header>
      <main className={narrow ? 'store__main store__main--narrow' : 'store__main'}>{children}</main>
    </div>
  );
}

function ProductPage() {
  return (
    <Store>
      <div className="pdp">
        <img className="pdp__img" src="/img/headphones.svg" alt="" />
        <div className="pdp__info">
          <p className="pdp__crumb">Home / Headphones</p>
          <h1>Aero Wireless Headphones</h1>
          <p className="pdp__price">$249.00</p>
          <p className="pdp__desc">Adaptive noise cancelling, 40-hour battery and a fold-flat design for travel.</p>
          <div className="pdp__swatches"><i style={{ background: '#1f2937' }} /><i style={{ background: '#e5e7eb' }} /><i style={{ background: '#7c8b74' }} /></div>
          <button className="pdp__cart" type="button">Add to cart</button>
          <TradeInProductButtonWidget productId="p-aero" styleConfig={style('product-cta')} />
        </div>
      </div>
    </Store>
  );
}

function Scene() {
  switch (scene) {
    case 'form':
      return <Store narrow><TradeInFormWidget styleConfig={style('form')} /></Store>;
    case 'cta':
      return <ProductPage />;
    case 'status':
      return <Store narrow><TradeInStatusWidget styleConfig={style('status')} /></Store>;
    case 'dash':
      return <TradeInDashboard />;
    case 'panel':
      window.__styleConfig = style('form'); // the panel shows the preset chosen with ?theme=
      return (
        <div className="panel-host">
          <TradeInWidgetSettingsPanel
            kind="form"
            defaults={{ title: 'form.title', description: 'form.description', primaryLabel: 'form.submit', secondaryLabel: 'common.back' }}
            planStatusOverride={{ plan: 'pro', isFree: false, freeTrialAvailable: false, entitlements: PLAN_ENTITLEMENTS.pro }}
          />
        </div>
      );
    default:
      return <p>Unknown scene</p>;
  }
}

// ?frame=WxH renders the scene in an iframe of that size: headless Chrome won't lay a window
// out narrower than ~500px, so phone-width and panel-width shots are framed this way.
const frame = params.get('frame')?.split('x').map(Number);
if (frame) {
  const inner = new URL(location.href);
  inner.searchParams.delete('frame');
  createRoot(document.getElementById('root')!).render(
    <iframe src={inner.href} title="scene" style={{ width: frame[0], height: frame[1], border: 0, display: 'block' }} />,
  );
} else {
  createRoot(document.getElementById('root')!).render(<Scene />);
}

// ---- Scripted interactions: put each scene in the state the screenshot shows ----------

const until = async <T,>(fn: () => T | null | undefined | false, timeout = 8000): Promise<T> => {
  const start = performance.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (performance.now() - start > timeout) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 50));
  }
};
const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label && !b.disabled);
const choose = (question: string, option: string) => {
  const fs = [...document.querySelectorAll('fieldset')].find((f) => f.querySelector('legend')?.textContent?.includes(question));
  [...(fs?.querySelectorAll('label') ?? [])].find((l) => l.textContent?.trim() === option)?.click();
};

(async () => {
  if (frame) return;
  if (scene === 'form' && params.get('step') === 'condition') {
    await until(() => document.querySelector('.ti-helper[role="status"]'));
    (await until(() => button('Continue'))).click();
    await until(() => document.querySelector('fieldset'));
    choose('power on', 'Yes, fully working');
    choose('cosmetic', 'Light wear');
  }
  if (scene === 'cta' && params.has('open')) {
    (await until(() => document.querySelector<HTMLButtonElement>('.ti-cta button'))).click();
  }
  if (scene === 'panel' && params.get('open')) {
    const title = params.get('open')!;
    const header = await until(() => [...document.querySelectorAll('[data-hook*="accordion"] *')].find((e) => e.children.length === 0 && e.textContent?.trim() === title) as HTMLElement | undefined);
    header.click();
  }
  // Focus management in the widgets scrolls the page; frame the shot from ?scroll= instead.
  await new Promise((r) => setTimeout(r, 600));
  (document.activeElement as HTMLElement | null)?.blur();
  window.scrollTo(0, Number(params.get('scroll') ?? 0));
  document.body.dataset.ready = '1';
})().catch((e) => console.error('[harness]', e));
