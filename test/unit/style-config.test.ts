import { describe, expect, it } from 'vitest';
import {
  applyTheme,
  DEFAULT_THEME,
  fontFamilyFromShorthand,
  fontsToPreload,
  fontWeightFromShorthand,
  isSafeColor,
  normalizeStyleConfig,
  parseStyleConfig,
  resetTextElement,
  serializeStyleConfig,
  THEMES,
  themeDefaults,
} from '../../src/lib/style/style-config';
import { contrastRatio, contrastWarnings, styleToCssVars } from '../../src/lib/style/theme-vars';

describe('style config', () => {
  it('defaults to the minimal theme', () => {
    expect(DEFAULT_THEME).toBe('minimal');
    expect(themeDefaults().theme).toBe('minimal');
    expect(parseStyleConfig(null).theme).toBe('minimal');
  });

  it('returns complete defaults for missing/invalid input', () => {
    expect(parseStyleConfig(null)).toEqual(themeDefaults());
    expect(parseStyleConfig('not json')).toEqual(themeDefaults());
    expect(parseStyleConfig('[1,2]')).toEqual(themeDefaults());
  });

  it('round-trips a valid config', () => {
    const style = { ...themeDefaults('dark'), layout: { ...themeDefaults('dark').layout, padding: 40 } };
    expect(parseStyleConfig(serializeStyleConfig(style, 'form')).layout.padding).toBe(40);
  });

  it('falls back per field, using the selected theme defaults', () => {
    const s = normalizeStyleConfig({ version: 1, theme: 'dark', colors: { primary: 'url(javascript:alert(1))', text: '#ffffff' } });
    expect(s.colors.primary).toBe(themeDefaults('dark').colors.primary);
    expect(s.colors.text).toBe('#ffffff');
    expect(s.colors.background).toBe(themeDefaults('dark').colors.background);
  });

  it('clamps numbers to documented ranges and rejects bad enums', () => {
    const s = normalizeStyleConfig({ typography: { headingSize: 400, bodySize: -3, lineHeight: 1.234 }, buttons: { shape: 'blob' }, layout: { maxWidth: 99999 } });
    expect(s.typography.headingSize).toBe(48);
    expect(s.typography.bodySize).toBe(12);
    expect(s.typography.lineHeight).toBe(1.23);
    expect(s.buttons.shape).toBe(themeDefaults().buttons.shape);
    expect(s.layout.maxWidth).toBe(1200);
  });

  it('sanitizes merchant text and ignores prototype pollution', () => {
    const s = normalizeStyleConfig(JSON.parse('{"content":{"title":"<img src=x>Hello"},"__proto__":{"polluted":true}}'));
    expect(s.content.title).toBe('img src=xHello');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('migrates a version-0 flat config', () => {
    const s = normalizeStyleConfig({ primaryColor: '#ff0000', borderRadius: 4, fontFamily: 'normal normal normal 16px/1.4em helvetica-w01-roman,sans-serif' });
    expect(s.version).toBe(1);
    expect(s.colors.primary).toBe('#ff0000');
    expect(s.colors.buttonBackground).toBe('#ff0000');
    expect(s.surfaces.radius).toBe(4);
    expect(s.typography.bodyFont).toContain('helvetica');
  });

  it('only persists content keys the widget uses', () => {
    const json = JSON.parse(serializeStyleConfig(themeDefaults(), 'product-cta'));
    expect(Object.keys(json.content).sort()).toEqual(['primaryLabel', 'showHelperText', 'showProductEstimate']);
  });

  it('keeps typography and content when switching theme', () => {
    const base = normalizeStyleConfig({ typography: { headingSize: 40 }, content: { title: 'Hi' } });
    const dark = applyTheme(base, 'dark');
    expect(dark.colors.background).toBe(themeDefaults('dark').colors.background);
    expect(dark.typography.headingSize).toBe(40);
    expect(dark.content.title).toBe('Hi');
  });

  it('sets transparent default background and full-width buttons for product-cta plugin', () => {
    const ctaDefaults = themeDefaults('default', 'product-cta');
    expect(ctaDefaults.colors.background).toBe('transparent');
    expect(ctaDefaults.buttons.fullWidth).toBe(true);

    const darkCta = applyTheme(ctaDefaults, 'dark', 'product-cta');
    expect(darkCta.colors.background).toBe('transparent');
    expect(darkCta.buttons.fullWidth).toBe(true);
  });
});

describe('validators', () => {
  it('accepts only literal colors', () => {
    expect(isSafeColor('#1F5EFF')).toBe(true);
    expect(isSafeColor('rgba(0, 0, 0, 0.5)')).toBe(true);
    expect(isSafeColor('rgb(0 0 0 / 50%)')).toBe(true);
    expect(isSafeColor('red; background: url(x)')).toBe(false);
    expect(isSafeColor('var(--x)')).toBe(false);
    expect(isSafeColor(12)).toBe(false);
  });

  it('extracts font families from CSS font shorthand safely', () => {
    expect(fontFamilyFromShorthand('normal normal 700 16px/1.4em avenir-lt-w01_85-heavy1475544,sans-serif')).toBe('avenir-lt-w01_85-heavy1475544, sans-serif');
    expect(fontFamilyFromShorthand('italic 12px "Open Sans", serif')).toBe('"Open Sans", serif');
    expect(fontFamilyFromShorthand('16px x;}body{display:none')).toBeUndefined();
    expect(fontFamilyFromShorthand('16px url(evil)')).toBeUndefined();
  });

  it('extracts font weight from CSS font shorthand safely', () => {
    expect(fontWeightFromShorthand('normal normal 700 16px/1.4em avenir-lt-w01_85-heavy1475544,sans-serif')).toBe('700');
    expect(fontWeightFromShorthand('normal normal 400 16px/1.4em avenir')).toBe('400');
    expect(fontWeightFromShorthand('italic bold 14px arial')).toBe('bold');
    expect(fontWeightFromShorthand('arial, sans-serif')).toBeUndefined();
    expect(fontWeightFromShorthand('')).toBeUndefined();
  });
});

describe('theme mapping', () => {
  it('maps to CSS vars that never exceed the container on mobile', () => {
    const vars = styleToCssVars(themeDefaults());
    expect(vars['--ti-max-width']).toBe('min(100%, 720px)');
    expect(vars['--ti-font-body']).toBe('inherit');
    expect(vars['--ti-font-modal']).toBe('Helvetica, Arial, sans-serif');
    expect(vars['--ti-font-modal-heading']).toBe('Helvetica, Arial, sans-serif');
    expect(vars['--ti-weight-button']).toBe('400');
  });

  it('extracts button text weight from bodyFont shorthand when present and propagates to modal font', () => {
    const custom = {
      ...themeDefaults(),
      typography: {
        ...themeDefaults().typography,
        bodyFont: 'normal normal 700 16px/1.4em avenir-lt-w01_85-heavy1475544,sans-serif',
      },
    };
    const vars = styleToCssVars(custom);
    expect(vars['--ti-weight-button']).toBe('700');
    expect(vars['--ti-font-modal']).toBe('avenir-lt-w01_85-heavy1475544, sans-serif');
    expect(vars['--ti-font-modal-heading']).toBe('avenir-lt-w01_85-heavy1475544, sans-serif');
  });

  it('maps per-element fonts to their own CSS variables', () => {
    const custom = normalizeStyleConfig({
      typography: { labelFont: 'italic normal 700 18px/1.4em avenir-lt-w01_85-heavy1475544,sans-serif' },
      colors: { label: '#123456' },
    });
    const vars = styleToCssVars(custom);
    expect(vars['--ti-label-family']).toBe('avenir-lt-w01_85-heavy1475544, sans-serif');
    expect(vars['--ti-label-size']).toBe('18px');
    expect(vars['--ti-label-weight']).toBe('700');
    expect(vars['--ti-label-style']).toBe('italic');
    expect(vars['--ti-label']).toBe('#123456');
    // Elements without a font fall back to inherited values or their previous defaults.
    expect(vars['--ti-description-family']).toBeUndefined();
    expect(vars['--ti-btn-size']).toBe(`${custom.typography.buttonSize}px`);
  });

  it('starts new description/label colors from customized help/body text colors', () => {
    const s = normalizeStyleConfig({ version: 1, colors: { mutedText: '#445566', text: '#112233' } });
    expect(s.colors.description).toBe('#445566');
    expect(s.colors.label).toBe('#112233');
    expect(themeDefaults().colors.description).toBe(themeDefaults().colors.mutedText);
  });

  it('resets one text element without touching the others', () => {
    const custom = normalizeStyleConfig({ typography: { linkFont: 'normal normal 400 16px/1.4em arial', helperFont: 'normal normal 400 12px/1.4em arial' }, colors: { link: '#ff0000' } });
    const reset = resetTextElement(custom, 'link');
    expect(reset.typography.linkFont).toBe('');
    expect(reset.colors.link).toBe(themeDefaults().colors.link);
    expect(reset.typography.helperFont).toContain('arial');
    expect(fontsToPreload(custom)).toHaveLength(2);
  });

  it('computes WCAG contrast and warns on poor pairs', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    for (const t of THEMES) expect(contrastWarnings(themeDefaults(t))).toEqual([]);
    const poor = normalizeStyleConfig({ colors: { text: '#cccccc', background: '#ffffff' } });
    expect(contrastWarnings(poor).map((w) => w.pair)).toContain('text_background');
  });
});
