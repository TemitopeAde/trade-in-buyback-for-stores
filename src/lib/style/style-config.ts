import { z } from 'zod';

// Per-widget-instance appearance configuration. Persisted as one JSON string in the
// widget's `style-config` property (custom element attribute) via @wix/editor widget.setProp.
// Everything here is presentation only — never offer logic, access control or status.

export const STYLE_CONFIG_VERSION = 1 as const;
export const STYLE_PROP = 'style-config';

export const WIDGET_KINDS = ['form', 'status', 'my-trade-ins', 'product-cta'] as const;
export type WidgetKind = (typeof WIDGET_KINDS)[number];

export const DEFAULT_THEME = 'minimal' as const;
export const THEMES = ['minimal', 'default', 'light', 'dark', 'brand'] as const;
export type ThemeName = (typeof THEMES)[number];

export type TradeInWidgetStyle = {
  version: typeof STYLE_CONFIG_VERSION;
  theme: ThemeName;
  colors: {
    primary: string;
    background: string;
    surface: string;
    heading: string;
    text: string;
    mutedText: string;
    description: string;
    label: string;
    border: string;
    inputBackground: string;
    inputText: string;
    buttonBackground: string;
    buttonText: string;
    buttonHoverBackground: string;
    buttonBorder: string;
    secondaryButtonBackground: string;
    secondaryButtonText: string;
    error: string;
    success: string;
    link: string;
  };
  typography: {
    /** CSS `font` shorthand from inputs.selectFont(); only its family list is applied. Empty = inherit site font. */
    headingFont: string;
    bodyFont: string;
    descriptionFont: string;
    labelFont: string;
    helperFont: string;
    inputFont: string;
    buttonFont: string;
    secondaryButtonFont: string;
    linkFont: string;
    headingSize: number;
    bodySize: number;
    labelSize: number;
    helperSize: number;
    buttonSize: number;
    headingWeight: FontWeight;
    bodyWeight: FontWeight;
    lineHeight: number;
    letterSpacing: number;
    headingAlign: 'start' | 'center';
  };
  buttons: {
    shape: 'square' | 'slightly-rounded' | 'rounded' | 'pill';
    size: 'small' | 'medium' | 'large';
    fullWidth: boolean;
    borderWidth: number;
    textWeight: FontWeight;
    hoverStyle: 'darken' | 'lift' | 'none';
  };
  layout: {
    maxWidth: number;
    padding: number;
    sectionGap: number;
    fieldGap: number;
    buttonGap: number;
    alignment: 'start' | 'center';
    cardStyle: 'flat' | 'bordered' | 'elevated';
    stepIndicator: 'numbers' | 'progress' | 'labels';
  };
  surfaces: {
    radius: number;
    borderWidth: number;
    showCardBorder: boolean;
    shadow: 'none' | 'subtle' | 'medium';
    inputRadius: number;
    inputBorderWidth: number;
    showDividers: boolean;
  };
  content: {
    showTitle: boolean;
    title: string;
    showDescription: boolean;
    description: string;
    primaryLabel: string;
    secondaryLabel: string;
    showOfferEstimate: boolean;
    showStepLabels: boolean;
    showHelperText: boolean;
    showProductEstimate: boolean;
    showTimelineDetails: boolean;
    showOptionalFields: boolean;
  };
};

export const FONT_WEIGHTS = [400, 500, 600, 700] as const;
export type FontWeight = (typeof FONT_WEIGHTS)[number];

export const FONT_KEYS = ['headingFont', 'bodyFont', 'descriptionFont', 'labelFont', 'helperFont', 'inputFont', 'buttonFont', 'secondaryButtonFont', 'linkFont'] as const;
export type FontKey = (typeof FONT_KEYS)[number];
export type ColorKey = keyof TradeInWidgetStyle['colors'];

/**
 * Each text element on the widget has its own font and color. Title and body reuse the
 * original heading/body keys so configs saved before per-element styling keep their look.
 */
export const TEXT_ELEMENTS = {
  title: { font: 'headingFont', color: 'heading' },
  description: { font: 'descriptionFont', color: 'description' },
  body: { font: 'bodyFont', color: 'text' },
  label: { font: 'labelFont', color: 'label' },
  helper: { font: 'helperFont', color: 'mutedText' },
  input: { font: 'inputFont', color: 'inputText' },
  button: { font: 'buttonFont', color: 'buttonText' },
  secondaryButton: { font: 'secondaryButtonFont', color: 'secondaryButtonText' },
  link: { font: 'linkFont', color: 'link' },
} as const satisfies Record<string, { font: FontKey; color: ColorKey }>;
export type TextElement = keyof typeof TEXT_ELEMENTS;
export const TEXT_COLOR_KEYS: readonly ColorKey[] = Object.values(TEXT_ELEMENTS).map((e) => e.color);

export type StyleSection = Exclude<keyof TradeInWidgetStyle, 'version' | 'theme'>;
export const STYLE_SECTIONS: readonly StyleSection[] = ['colors', 'typography', 'buttons', 'layout', 'surfaces', 'content'];

/** Documented safe ranges; values outside are clamped, never rejected. */
export const RANGES = {
  'typography.headingSize': [16, 48],
  'typography.bodySize': [12, 22],
  'typography.labelSize': [11, 20],
  'typography.helperSize': [10, 18],
  'typography.buttonSize': [12, 22],
  'typography.lineHeight': [1.1, 2],
  'typography.letterSpacing': [-0.05, 0.2],
  'buttons.borderWidth': [0, 4],
  'layout.maxWidth': [320, 1200],
  'layout.padding': [0, 64],
  'layout.sectionGap': [8, 64],
  'layout.fieldGap': [4, 40],
  'layout.buttonGap': [4, 32],
  'surfaces.radius': [0, 32],
  'surfaces.borderWidth': [0, 4],
  'surfaces.inputRadius': [0, 24],
  'surfaces.inputBorderWidth': [0, 3],
} as const satisfies Record<string, readonly [number, number]>;
export type RangeKey = keyof typeof RANGES;

export const TEXT_LIMITS = { title: 80, description: 300, primaryLabel: 40, secondaryLabel: 40 } as const;

// Which content keys each widget actually uses, so the panel never persists irrelevant values.
export const CONTENT_KEYS_BY_WIDGET: Record<WidgetKind, readonly (keyof TradeInWidgetStyle['content'])[]> = {
  form: ['showTitle', 'title', 'showDescription', 'description', 'primaryLabel', 'secondaryLabel', 'showOfferEstimate', 'showStepLabels', 'showHelperText', 'showOptionalFields'],
  status: ['showTitle', 'title', 'showDescription', 'description', 'primaryLabel', 'secondaryLabel', 'showHelperText', 'showTimelineDetails'],
  'my-trade-ins': ['showTitle', 'title', 'showDescription', 'description', 'showHelperText'],
  'product-cta': ['primaryLabel', 'showProductEstimate', 'showHelperText'],
};

// ---- Value validation ------------------------------------------------------

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC = /^(?:rgb|rgba|hsl|hsla)\(\s*[-\d.%]+\s*(?:,\s*[-\d.%]+\s*){2}(?:,\s*[\d.%]+\s*)?\)$/i;
const MODERN_FUNC = /^(?:rgb|hsl)\(\s*[-\d.%]+\s+[-\d.%]+\s+[-\d.%]+(?:\s*\/\s*[\d.%]+)?\s*\)$/i;

/** Accepts only literal colors the Wix color picker can return; rejects anything that could smuggle CSS. */
export function isSafeColor(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  return v.length <= 64 && (HEX.test(v) || FUNC.test(v) || MODERN_FUNC.test(v) || v === 'transparent');
}

const FAMILY_TOKEN = /^(?:"[\w\s.-]{1,60}"|'[\w\s.-]{1,60}'|[\w-]{1,80}(?:\s[\w-]{1,40}){0,4})$/;

/** Extracts a safe `font-family` list from a CSS font shorthand ("normal normal 700 16px/1.4em avenir,sans-serif"). */
export function fontFamilyFromShorthand(shorthand: string): string | undefined {
  if (!shorthand || shorthand.length > 300 || /[;{}<>()\\]|url|expression/i.test(shorthand)) return undefined;
  // The family list follows the size token (e.g. 16px or 16px/1.4em).
  const match = /(?:^|\s)\d+(?:\.\d+)?(?:px|em|rem|pt|%)(?:\/\S+)?\s+(.+)$/.exec(shorthand.trim());
  const families = (match ? match[1] : shorthand).split(',').map((f) => f.trim()).filter(Boolean);
  if (!families.length || families.length > 6 || !families.every((f) => FAMILY_TOKEN.test(f))) return undefined;
  return families.join(', ');
}

/** Returns a safe CSS `font` shorthand value or formats one from safe font families. */
export function safeFontShorthand(shorthand: string): string | undefined {
  if (!shorthand || shorthand.length > 300 || /[;{}<>()\\]|url|expression/i.test(shorthand)) return undefined;
  const trimmed = shorthand.trim();
  const match = /(?:^|\s)\d+(?:\.\d+)?(?:px|em|rem|pt|%)(?:\/\S+)?\s+(.+)$/.exec(trimmed);
  if (match) {
    const families = match[1].split(',').map((f) => f.trim()).filter(Boolean);
    if (families.length && families.length <= 6 && families.every((f) => FAMILY_TOKEN.test(f))) {
      return trimmed;
    }
  }
  const families = trimmed.split(',').map((f) => f.trim()).filter(Boolean);
  if (families.length && families.length <= 6 && families.every((f) => FAMILY_TOKEN.test(f))) {
    return `normal normal 400 16px/1.5 ${families.join(', ')}`;
  }
  return undefined;
}

export function isSafeFontShorthand(value: unknown): value is string {
  return typeof value === 'string' && (value === '' || fontFamilyFromShorthand(value) !== undefined);
}

/** Extracts font weight (e.g. "400", "600", "700", "bold") from a CSS font shorthand. */
export function fontWeightFromShorthand(shorthand: string): string | undefined {
  if (!shorthand || shorthand.length > 300) return undefined;
  const match = /(?:^|\s)(100|200|300|400|500|600|700|800|900|bold|normal)\s+\d+(?:\.\d+)?(?:px|em|rem|pt|%)/i.exec(shorthand.trim());
  return match ? match[1].toLowerCase() : undefined;
}

/** Returns 'italic' when a CSS font shorthand starts with italic/oblique. */
export function fontStyleFromShorthand(shorthand: string): 'italic' | undefined {
  return /^\s*(?:italic|oblique)\b/i.test(shorthand ?? '') ? 'italic' : undefined;
}

/** Extracts font size in px (e.g. 24 from "normal normal 700 24px/1.4em ...") from a CSS font shorthand. */
export function fontSizeFromShorthand(shorthand: string): number | undefined {
  if (!shorthand || shorthand.length > 300) return undefined;
  const match = /(?:^|\s)(\d+(?:\.\d+)?)px(?:\/\S+)?\s/.exec(shorthand.trim());
  return match ? Number(match[1]) : undefined;
}

export function clampRange(key: RangeKey, value: number): number {
  const [min, max] = RANGES[key];
  const step = key === 'typography.lineHeight' || key === 'typography.letterSpacing' ? 100 : 1;
  const rounded = Math.round(value * step) / step;
  return Math.min(max, Math.max(min, rounded));
}

export function sanitizeText(value: string, max: number): string {
  // Plain text only: strip control characters and angle brackets; React escapes the rest.
  return value.replace(/[\u0000-\u001f\u007f<>]/g, '').slice(0, max);
}

// ---- Presets ----------------------------------------------------------------

const BASE: Omit<TradeInWidgetStyle, 'theme' | 'colors'> = {
  version: STYLE_CONFIG_VERSION,
  typography: {
    headingFont: '',
    bodyFont: '',
    descriptionFont: '',
    labelFont: '',
    helperFont: '',
    inputFont: '',
    buttonFont: '',
    secondaryButtonFont: '',
    linkFont: '',
    headingSize: 26,
    bodySize: 16,
    labelSize: 14,
    helperSize: 13,
    buttonSize: 16,
    headingWeight: 700,
    bodyWeight: 400,
    lineHeight: 1.5,
    letterSpacing: 0,
    headingAlign: 'start',
  },
  buttons: { shape: 'slightly-rounded', size: 'medium', fullWidth: false, borderWidth: 0, textWeight: 400, hoverStyle: 'darken' },
  layout: { maxWidth: 720, padding: 24, sectionGap: 24, fieldGap: 16, buttonGap: 12, alignment: 'center', cardStyle: 'bordered', stepIndicator: 'numbers' },
  surfaces: { radius: 12, borderWidth: 1, showCardBorder: true, shadow: 'none', inputRadius: 8, inputBorderWidth: 1, showDividers: true },
  content: {
    showTitle: true,
    title: '',
    showDescription: true,
    description: '',
    primaryLabel: '',
    secondaryLabel: '',
    showOfferEstimate: true,
    showStepLabels: true,
    showHelperText: true,
    showProductEstimate: true,
    showTimelineDetails: true,
    showOptionalFields: true,
  },
};

// Description and label colors are derived from help text and body text in themeDefaults().
type Palette = Omit<TradeInWidgetStyle['colors'], 'description' | 'label'>;

const PALETTES: Record<ThemeName, Palette> = {
  default: {
    primary: '#1F5EFF', background: '#FFFFFF', surface: '#F7F8FA', heading: '#111827', text: '#1F2937', mutedText: '#5B6472',
    border: '#D7DCE3', inputBackground: '#FFFFFF', inputText: '#111827', buttonBackground: '#1F5EFF', buttonText: '#FFFFFF',
    buttonHoverBackground: '#1748C7', buttonBorder: '#1F5EFF', secondaryButtonBackground: '#EEF2F7', secondaryButtonText: '#1F2937',
    error: '#B42318', success: '#067647', link: '#1F5EFF',
  },
  light: {
    primary: '#2D6A4F', background: '#FFFFFF', surface: '#FFFFFF', heading: '#1B1B1B', text: '#2B2B2B', mutedText: '#5F5F5F',
    border: '#E4E4E4', inputBackground: '#FAFAFA', inputText: '#1B1B1B', buttonBackground: '#2D6A4F', buttonText: '#FFFFFF',
    buttonHoverBackground: '#1F4D39', buttonBorder: '#2D6A4F', secondaryButtonBackground: '#F1F5F2', secondaryButtonText: '#1F4D39',
    error: '#B42318', success: '#2D6A4F', link: '#2D6A4F',
  },
  dark: {
    primary: '#7AA2FF', background: '#0F1115', surface: '#181B22', heading: '#F5F7FA', text: '#E4E7EC', mutedText: '#A3ABB8',
    border: '#2E3440', inputBackground: '#11141A', inputText: '#F5F7FA', buttonBackground: '#7AA2FF', buttonText: '#0F1115',
    buttonHoverBackground: '#A3C0FF', buttonBorder: '#7AA2FF', secondaryButtonBackground: '#252A33', secondaryButtonText: '#E4E7EC',
    error: '#FF8A80', success: '#6CE9A6', link: '#A3C0FF',
  },
  minimal: {
    primary: '#111111', background: '#FFFFFF', surface: '#FFFFFF', heading: '#111111', text: '#222222', mutedText: '#666666',
    border: '#DDDDDD', inputBackground: '#FFFFFF', inputText: '#111111', buttonBackground: '#111111', buttonText: '#FFFFFF',
    buttonHoverBackground: '#333333', buttonBorder: '#111111', secondaryButtonBackground: '#FFFFFF', secondaryButtonText: '#111111',
    error: '#B00020', success: '#1E7B34', link: '#111111',
  },
  brand: {
    primary: '#C2410C', background: '#FFFBF5', surface: '#FFFFFF', heading: '#3B1A08', text: '#3F2A1E', mutedText: '#7A5C4A',
    border: '#F1DCC7', inputBackground: '#FFFFFF', inputText: '#3B1A08', buttonBackground: '#C2410C', buttonText: '#FFFFFF',
    buttonHoverBackground: '#9A3412', buttonBorder: '#C2410C', secondaryButtonBackground: '#FDECDC', secondaryButtonText: '#7C2D12',
    error: '#B42318', success: '#067647', link: '#C2410C',
  },
};

const THEME_OVERRIDES: Partial<Record<ThemeName, DeepPartial<TradeInWidgetStyle>>> = {
  minimal: {
    buttons: { shape: 'square' },
    layout: { cardStyle: 'flat' },
    surfaces: { radius: 0, inputRadius: 0, showCardBorder: false, showDividers: false },
  },
  dark: { layout: { cardStyle: 'elevated' }, surfaces: { shadow: 'subtle' } },
  brand: { buttons: { shape: 'pill' }, surfaces: { radius: 16 } },
};

export function themeDefaults(theme: ThemeName = DEFAULT_THEME, kind?: WidgetKind): TradeInWidgetStyle {
  const palette = PALETTES[theme];
  const colors = { ...palette, description: palette.mutedText, label: palette.text };
  const base = structuredClone({ ...BASE, theme, colors }) as TradeInWidgetStyle;
  if (kind === 'product-cta') {
    base.layout.alignment = 'start';
    base.colors.background = 'transparent';
    base.buttons.borderWidth = 0;
    base.buttons.fullWidth = true;
  }
  return deepMerge(base, THEME_OVERRIDES[theme] ?? {});
}

/** Puts one text element's font and color back to the theme default. */
export function resetTextElement(style: TradeInWidgetStyle, element: TextElement, kind?: WidgetKind): TradeInWidgetStyle {
  const d = themeDefaults(style.theme, kind);
  const { font, color } = TEXT_ELEMENTS[element];
  return { ...style, typography: { ...style.typography, [font]: d.typography[font] }, colors: { ...style.colors, [color]: d.colors[color] } };
}

/** Resets all text settings: every element's font and color plus the remaining typography. */
export function resetText(style: TradeInWidgetStyle, kind?: WidgetKind): TradeInWidgetStyle {
  const d = themeDefaults(style.theme, kind);
  const colors = { ...style.colors };
  for (const k of TEXT_COLOR_KEYS) colors[k] = d.colors[k];
  return { ...style, typography: d.typography, colors };
}

/** Defaults for a section in the given theme (used by per-section reset). */
export function sectionDefaults<S extends StyleSection>(theme: ThemeName, section: S, kind?: WidgetKind): TradeInWidgetStyle[S] {
  return structuredClone(themeDefaults(theme, kind)[section]);
}

// ---- Schema (built against a fallback so each invalid leaf falls back individually) ----

function buildSchema(fb: TradeInWidgetStyle) {
  const color = (k: keyof TradeInWidgetStyle['colors']) => z.string().refine(isSafeColor).catch(fb.colors[k]);
  const num = (key: RangeKey, fallback: number) => z.number().refine(Number.isFinite).transform((v) => clampRange(key, v)).catch(fallback);
  const bool = (fallback: boolean) => z.boolean().catch(fallback);
  const weight = (fallback: FontWeight) => z.union(FONT_WEIGHTS.map((w) => z.literal(w))).catch(fallback);
  const oneOf = <T extends string>(values: readonly [T, ...T[]], fallback: T) => z.enum(values).catch(fallback);
  const text = (max: number, fallback: string) => z.string().transform((s) => sanitizeText(s, max)).catch(fallback);
  const font = (fallback: string) => z.string().refine(isSafeFontShorthand).catch(fallback);
  const t = fb.typography, b = fb.buttons, l = fb.layout, s = fb.surfaces, c = fb.content;

  return z.object({
    version: z.literal(STYLE_CONFIG_VERSION).catch(STYLE_CONFIG_VERSION),
    theme: oneOf(THEMES, fb.theme),
    colors: z
      .object(Object.fromEntries((Object.keys(fb.colors) as (keyof TradeInWidgetStyle['colors'])[]).map((k) => [k, color(k)])) as Record<keyof TradeInWidgetStyle['colors'], z.ZodCatch<z.ZodString>>)
      .catch(fb.colors),
    typography: z
      .object({
        ...(Object.fromEntries(FONT_KEYS.map((k) => [k, font(t[k])])) as Record<FontKey, ReturnType<typeof font>>),
        headingSize: num('typography.headingSize', t.headingSize),
        bodySize: num('typography.bodySize', t.bodySize),
        labelSize: num('typography.labelSize', t.labelSize),
        helperSize: num('typography.helperSize', t.helperSize),
        buttonSize: num('typography.buttonSize', t.buttonSize),
        headingWeight: weight(t.headingWeight),
        bodyWeight: weight(t.bodyWeight),
        lineHeight: num('typography.lineHeight', t.lineHeight),
        letterSpacing: num('typography.letterSpacing', t.letterSpacing),
        headingAlign: oneOf(['start', 'center'], t.headingAlign),
      })
      .catch(t),
    buttons: z
      .object({
        shape: oneOf(['square', 'slightly-rounded', 'rounded', 'pill'], b.shape),
        size: oneOf(['small', 'medium', 'large'], b.size),
        fullWidth: bool(b.fullWidth),
        borderWidth: num('buttons.borderWidth', b.borderWidth),
        textWeight: weight(b.textWeight),
        hoverStyle: oneOf(['darken', 'lift', 'none'], b.hoverStyle),
      })
      .catch(b),
    layout: z
      .object({
        maxWidth: num('layout.maxWidth', l.maxWidth),
        padding: num('layout.padding', l.padding),
        sectionGap: num('layout.sectionGap', l.sectionGap),
        fieldGap: num('layout.fieldGap', l.fieldGap),
        buttonGap: num('layout.buttonGap', l.buttonGap),
        alignment: oneOf(['start', 'center'], l.alignment),
        cardStyle: oneOf(['flat', 'bordered', 'elevated'], l.cardStyle),
        stepIndicator: oneOf(['numbers', 'progress', 'labels'], l.stepIndicator),
      })
      .catch(l),
    surfaces: z
      .object({
        radius: num('surfaces.radius', s.radius),
        borderWidth: num('surfaces.borderWidth', s.borderWidth),
        showCardBorder: bool(s.showCardBorder),
        shadow: oneOf(['none', 'subtle', 'medium'], s.shadow),
        inputRadius: num('surfaces.inputRadius', s.inputRadius),
        inputBorderWidth: num('surfaces.inputBorderWidth', s.inputBorderWidth),
        showDividers: bool(s.showDividers),
      })
      .catch(s),
    content: z
      .object({
        showTitle: bool(c.showTitle),
        title: text(TEXT_LIMITS.title, c.title),
        showDescription: bool(c.showDescription),
        description: text(TEXT_LIMITS.description, c.description),
        primaryLabel: text(TEXT_LIMITS.primaryLabel, c.primaryLabel),
        secondaryLabel: text(TEXT_LIMITS.secondaryLabel, c.secondaryLabel),
        showOfferEstimate: bool(c.showOfferEstimate),
        showStepLabels: bool(c.showStepLabels),
        showHelperText: bool(c.showHelperText),
        showProductEstimate: bool(c.showProductEstimate),
        showTimelineDetails: bool(c.showTimelineDetails),
        showOptionalFields: bool(c.showOptionalFields),
      })
      .catch(c),
  });
}

// ---- Migration & parsing ---------------------------------------------------------

type Unknown = Record<string, unknown>;

/**
 * Brings a stored config of any older version up to the current shape. Version 0 is a
 * pre-release flat shape ({ primaryColor, fontFamily, ... }) kept here so early test
 * instances keep their look; future versions add a step here.
 */
export function migrate(raw: Unknown): Unknown {
  const version = typeof raw.version === 'number' ? raw.version : 0;
  let out: Unknown = raw;
  if (version < 1) {
    const legacy = raw as { primaryColor?: unknown; backgroundColor?: unknown; textColor?: unknown; borderRadius?: unknown; fontFamily?: unknown };
    out = {
      ...raw,
      version: 1,
      colors: {
        ...(raw.colors as Unknown | undefined),
        ...(legacy.primaryColor !== undefined ? { primary: legacy.primaryColor, buttonBackground: legacy.primaryColor, buttonBorder: legacy.primaryColor, link: legacy.primaryColor } : {}),
        ...(legacy.backgroundColor !== undefined ? { background: legacy.backgroundColor } : {}),
        ...(legacy.textColor !== undefined ? { text: legacy.textColor } : {}),
      },
      surfaces: { ...(raw.surfaces as Unknown | undefined), ...(legacy.borderRadius !== undefined ? { radius: legacy.borderRadius } : {}) },
      typography: { ...(raw.typography as Unknown | undefined), ...(legacy.fontFamily !== undefined ? { bodyFont: legacy.fontFamily, headingFont: legacy.fontFamily } : {}) },
    };
  }
  // Colors added after v1 start from the color those texts used before, so customized
  // help/body text colors keep applying to descriptions and labels.
  const colors = out.colors as Unknown | undefined;
  if (colors && typeof colors === 'object') {
    out = {
      ...out,
      colors: {
        ...(colors.mutedText !== undefined && colors.description === undefined ? { description: colors.mutedText } : {}),
        ...(colors.text !== undefined && colors.label === undefined ? { label: colors.text } : {}),
        ...colors,
      },
    };
  }
  return out;
}

/** Validates any stored/unknown value into a complete, safe config. Never throws. */
export function normalizeStyleConfig(input: unknown, kind?: WidgetKind): TradeInWidgetStyle {
  const raw: Unknown = input && typeof input === 'object' && !Array.isArray(input) ? (input as Unknown) : {};
  const migrated = migrate(raw);
  const theme = (THEMES as readonly string[]).includes(migrated.theme as string) ? (migrated.theme as ThemeName) : DEFAULT_THEME;
  const fallback = themeDefaults(theme, kind);
  const merged = deepMerge(fallback as unknown as Unknown, migrated);
  return buildSchema(fallback).parse(merged) as TradeInWidgetStyle;
}

/** Parses the custom element attribute / widget prop string. */
export function parseStyleConfig(attribute: string | null | undefined, kind?: WidgetKind): TradeInWidgetStyle {
  if (!attribute) return themeDefaults(DEFAULT_THEME, kind);
  try {
    return normalizeStyleConfig(JSON.parse(attribute), kind);
  } catch {
    return themeDefaults(DEFAULT_THEME, kind);
  }
}

/** Serializes for setProp, keeping only content keys the widget uses. */
export function serializeStyleConfig(style: TradeInWidgetStyle, kind: WidgetKind): string {
  const allowed = new Set<string>(CONTENT_KEYS_BY_WIDGET[kind]);
  const content = Object.fromEntries(Object.entries(style.content).filter(([k]) => allowed.has(k)));
  return JSON.stringify({ ...style, content });
}

/** Switching theme replaces colors and theme-specific shape defaults, but keeps typography and content. */
export function applyTheme(style: TradeInWidgetStyle, theme: ThemeName, kind?: WidgetKind): TradeInWidgetStyle {
  return { ...themeDefaults(theme, kind), typography: style.typography, content: style.content };
}

/** All font shorthands the widget renders with, for widget.setPreloadFonts (which overwrites each call). */
export function fontsToPreload(style: TradeInWidgetStyle): string[] {
  return [...new Set(FONT_KEYS.map((k) => style.typography[k]).filter(Boolean))];
}

// ---- utils ---------------------------------------------------------------------

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export function deepMerge<T>(base: T, patch: unknown): T {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    const current = out[k];
    out[k] =
      v && typeof v === 'object' && !Array.isArray(v) && current && typeof current === 'object' && !Array.isArray(current)
        ? deepMerge(current, v)
        : v;
  }
  return out as T;
}
