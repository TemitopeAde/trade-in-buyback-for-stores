import React, { createContext, useContext, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { createTranslator, direction, type Translate } from '../../../lib/i18n';
import { parseStyleConfig, type TradeInWidgetStyle, type WidgetKind } from '../../../lib/style/style-config';
import { styleToCssVars } from '../../../lib/style/theme-vars';
import './widget.css';

// Applies a validated per-instance style config as CSS custom properties on the widget root.
// The same provider renders in the Editor preview and on the live site.

// `hostHeader`: the widget is embedded in a host (Editor React component) that renders its own
// title and description, so WidgetHeader renders nothing.
type WidgetContextValue = { style: TradeInWidgetStyle; t: Translate; locale: string; isEditor: boolean; hostHeader: boolean };

const WidgetContext = createContext<WidgetContextValue | null>(null);

export function useWidget(): WidgetContextValue {
  const ctx = useContext(WidgetContext);
  if (!ctx) throw new Error('useWidget must be used inside WidgetThemeProvider');
  return ctx;
}

// sonner's toast store is module-wide, so every mounted <Toaster/> shows every toast. Providers
// nest (product CTA + its drawer) and sit side by side (several widgets on one page), so only one
// mounted provider renders the Toaster; when it unmounts, another one takes over.
let toasterOwner: symbol | null = null;
const toasterClaims = new Set<() => void>();

function useOwnsToaster(): boolean {
  const [id] = useState(() => Symbol('toaster'));
  const [owns, setOwns] = useState(false);
  useEffect(() => {
    const claim = () => {
      toasterOwner ??= id;
      setOwns(toasterOwner === id);
    };
    claim();
    toasterClaims.add(claim);
    return () => {
      toasterClaims.delete(claim);
      if (toasterOwner === id) {
        toasterOwner = null;
        toasterClaims.forEach((c) => c());
      }
    };
  }, [id]);
  return owns;
}

export function WidgetThemeProvider(props: {
  styleConfig?: string | null;
  kind?: WidgetKind;
  locale: string;
  isEditor?: boolean;
  className?: string;
  labelledBy?: string;
  as?: 'section' | 'div';
  hostHeader?: boolean;
  children: ReactNode;
}) {
  const style = useMemo(() => parseStyleConfig(props.styleConfig, props.kind), [props.styleConfig, props.kind]);
  const t = useMemo(() => createTranslator(props.locale), [props.locale]);
  const vars = useMemo(() => styleToCssVars(style) as CSSProperties, [style]);
  const value = useMemo(
    () => ({ style, t, locale: props.locale, isEditor: !!props.isEditor, hostHeader: !!props.hostHeader }),
    [style, t, props.locale, props.isEditor, props.hostHeader],
  );
  const ownsToaster = useOwnsToaster();
  const Root = props.as ?? 'section';
  return (
    <WidgetContext.Provider value={value}>
      <Root
        className={['ti-root', props.className].filter(Boolean).join(' ')}
        style={vars}
        dir={direction(props.locale)}
        lang={props.locale}
        aria-labelledby={props.labelledBy}
      >
        {props.children}
      </Root>
      {ownsToaster && <Toaster position="bottom-right" richColors closeButton />}
    </WidgetContext.Provider>
  );
}
