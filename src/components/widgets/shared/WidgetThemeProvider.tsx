import React, { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from 'react';
import { createTranslator, direction, type Translate } from '../../../lib/i18n';
import { parseStyleConfig, type TradeInWidgetStyle, type WidgetKind } from '../../../lib/style/style-config';
import { styleToCssVars } from '../../../lib/style/theme-vars';
import './widget.css';

// Applies a validated per-instance style config as CSS custom properties on the widget root.
// The same provider renders in the Editor preview and on the live site.

type WidgetContextValue = { style: TradeInWidgetStyle; t: Translate; locale: string; isEditor: boolean };

const WidgetContext = createContext<WidgetContextValue | null>(null);

export function useWidget(): WidgetContextValue {
  const ctx = useContext(WidgetContext);
  if (!ctx) throw new Error('useWidget must be used inside WidgetThemeProvider');
  return ctx;
}

export function WidgetThemeProvider(props: {
  styleConfig?: string | null;
  kind?: WidgetKind;
  locale: string;
  isEditor?: boolean;
  className?: string;
  labelledBy?: string;
  as?: 'section' | 'div';
  children: ReactNode;
}) {
  const style = useMemo(() => parseStyleConfig(props.styleConfig, props.kind), [props.styleConfig, props.kind]);
  const t = useMemo(() => createTranslator(props.locale), [props.locale]);
  const vars = useMemo(() => styleToCssVars(style) as CSSProperties, [style]);
  const value = useMemo(() => ({ style, t, locale: props.locale, isEditor: !!props.isEditor }), [style, t, props.locale, props.isEditor]);
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
    </WidgetContext.Provider>
  );
}
