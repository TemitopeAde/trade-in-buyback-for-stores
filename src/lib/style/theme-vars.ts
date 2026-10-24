import { fontFamilyFromShorthand, type TradeInWidgetStyle } from './style-config';

// Maps a validated style config to CSS custom properties. The same mapping is used in the
// Editor preview and on the live site, so both render identically. Values are only ever
// produced from validated config, never copied from raw merchant input.

const BUTTON_RADIUS = { square: '0px', 'slightly-rounded': '6px', rounded: '12px', pill: '999px' } as const;
const BUTTON_PADDING = { small: '8px 14px', medium: '11px 20px', large: '14px 28px' } as const;
const SHADOW = { none: 'none', subtle: '0 1px 3px rgba(16,24,40,.08), 0 1px 2px rgba(16,24,40,.04)', medium: '0 8px 24px rgba(16,24,40,.12)' } as const;

export type ThemeVars = Record<`--ti-${string}`, string>;

export function styleToCssVars(style: TradeInWidgetStyle): ThemeVars {
  const { colors: c, typography: t, buttons: b, layout: l, surfaces: s } = style;
  const bodyFamily = fontFamilyFromShorthand(t.bodyFont) ?? 'inherit';
  const headingFamily = fontFamilyFromShorthand(t.headingFont) ?? bodyFamily;
  const cardBorder =
    l.cardStyle === 'flat' || !s.showCardBorder ? 'none' : `${s.borderWidth}px solid ${c.border}`;
  const cardShadow = l.cardStyle === 'elevated' ? SHADOW[s.shadow === 'none' ? 'subtle' : s.shadow] : SHADOW[s.shadow];

  return {
    '--ti-primary': c.primary,
    '--ti-background': c.background,
    '--ti-surface': l.cardStyle === 'flat' ? c.background : c.surface,
    '--ti-heading': c.heading,
    '--ti-text': c.text,
    '--ti-muted': c.mutedText,
    '--ti-border': c.border,
    '--ti-input-bg': c.inputBackground,
    '--ti-input-text': c.inputText,
    '--ti-btn-bg': c.buttonBackground,
    '--ti-btn-text': c.buttonText,
    '--ti-btn-hover-bg': b.hoverStyle === 'none' ? c.buttonBackground : c.buttonHoverBackground,
    '--ti-btn-border': b.borderWidth > 0 ? `${b.borderWidth}px solid ${c.buttonBorder}` : '0',
    '--ti-btn2-bg': c.secondaryButtonBackground,
    '--ti-btn2-text': c.secondaryButtonText,
    '--ti-error': c.error,
    '--ti-success': c.success,
    '--ti-link': c.link,
    '--ti-font-body': bodyFamily,
    '--ti-font-heading': headingFamily,
    '--ti-size-heading': `${t.headingSize}px`,
    '--ti-size-body': `${t.bodySize}px`,
    '--ti-size-label': `${t.labelSize}px`,
    '--ti-size-helper': `${t.helperSize}px`,
    '--ti-size-button': `${t.buttonSize}px`,
    '--ti-weight-heading': String(t.headingWeight),
    '--ti-weight-body': String(t.bodyWeight),
    '--ti-weight-button': String(b.textWeight),
    '--ti-line-height': String(t.lineHeight),
    '--ti-letter-spacing': `${t.letterSpacing}em`,
    '--ti-heading-align': t.headingAlign,
    '--ti-btn-radius': BUTTON_RADIUS[b.shape],
    '--ti-btn-padding': BUTTON_PADDING[b.size],
    '--ti-btn-width': b.fullWidth ? '100%' : 'auto',
    '--ti-btn-lift': b.hoverStyle === 'lift' ? '-1px' : '0px',
    // min() keeps merchant widths from causing horizontal overflow on narrow screens.
    '--ti-max-width': `min(100%, ${l.maxWidth}px)`,
    '--ti-padding': `clamp(12px, 4vw, ${l.padding}px)`,
    '--ti-section-gap': `${l.sectionGap}px`,
    '--ti-field-gap': `${l.fieldGap}px`,
    '--ti-button-gap': `${l.buttonGap}px`,
    '--ti-align': l.alignment === 'center' ? 'center' : 'start',
    '--ti-margin-inline': l.alignment === 'center' ? 'auto' : '0',
    '--ti-radius': `${s.radius}px`,
    '--ti-card-border': cardBorder,
    '--ti-card-shadow': cardShadow,
    '--ti-input-radius': `${s.inputRadius}px`,
    '--ti-input-border-width': `${Math.max(1, s.inputBorderWidth)}px`,
    '--ti-divider': s.showDividers ? `1px solid ${c.border}` : '0',
  };
}

// ---- Contrast (WCAG 2.1) -------------------------------------------------------

/** Parses #hex and rgb()/rgba() into 0..255 channels; returns undefined for formats we can't evaluate. */
export function parseColor(value: string): [number, number, number] | undefined {
  const v = value.trim();
  const hex = /^#([0-9a-f]{3,8})$/i.exec(v);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = [...h.slice(0, 3)].map((ch) => ch + ch).join('');
    if (h.length !== 6 && h.length !== 8) return undefined;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  }
  const rgb = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i.exec(v);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return undefined;
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (ch: number) => {
    const s = ch / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(fg: string, bg: string): number | undefined {
  const a = parseColor(fg);
  const b = parseColor(bg);
  if (!a || !b) return undefined;
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export type ContrastWarning = { pair: ContrastPair; ratio: number; required: number };
export type ContrastPair = 'text_background' | 'heading_background' | 'muted_surface' | 'input' | 'button' | 'secondary_button' | 'error_background';

/** Pairs checked in the settings panel. Body text needs 4.5:1; large headings 3:1. */
export function contrastWarnings(style: TradeInWidgetStyle): ContrastWarning[] {
  const c = style.colors;
  const pairs: [ContrastPair, string, string, number][] = [
    ['text_background', c.text, c.background, 4.5],
    ['heading_background', c.heading, c.background, style.typography.headingSize >= 24 ? 3 : 4.5],
    ['muted_surface', c.mutedText, c.surface, 4.5],
    ['input', c.inputText, c.inputBackground, 4.5],
    ['button', c.buttonText, c.buttonBackground, 4.5],
    ['secondary_button', c.secondaryButtonText, c.secondaryButtonBackground, 4.5],
    ['error_background', c.error, c.background, 4.5],
  ];
  const out: ContrastWarning[] = [];
  for (const [pair, fg, bg, required] of pairs) {
    const ratio = contrastRatio(fg, bg);
    if (ratio !== undefined && ratio < required) out.push({ pair, ratio: Math.round(ratio * 100) / 100, required });
  }
  return out;
}
